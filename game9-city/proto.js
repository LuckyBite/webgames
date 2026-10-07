// «Удачный Квартал» — прототип партии. Ход, бросок, выплаты, покупка, три ИИ, победа.
//
// Правила берутся из rules.js, числа — из economy.js: те самые, что прогнаны симулятором.
// Здесь нет ни одной игровой формулы, только показ и порядок действий.

import { RULES, MONUMENTS, BY_ID } from './economy.js';
import { POLICIES, Player, makeShop, resolveRoll, startOfTurnIncome,
         chooseBuy, applyBuy, rankOptions, mulberry32 } from './rules.js';
import { Table } from './render3d.js';

const PLAYERS = 4;
const SEATS = ['Ваш город', 'Соседи с севера', 'Заречье', 'Верхний посад'];
const $ = id => document.getElementById(id);
const sfx = typeof SFX !== 'undefined' ? SFX : null;

// Темп хода взят из модели времени в economy.js: свой ход 10–12 сек с решением игрока,
// ход ИИ ≈3 сек. Меньше — игрок не успевает понять, за что ему заплатили.
const BASE_PACE = { beforeRoll: 550, afterRoll: 950, afterBuy: 700 };
const PACE = { ...BASE_PACE };

const state = {
  players: [], shop: null, turn: 0, phase: 'idle', winner: null,
  rnd: mulberry32(Date.now() % 100000), pending: null, muted: false,
};

const table = new Table($('scene'));

// ---------- раскладка ----------
// Выбор режима — по КОРОТКОЙ стороне вьюпорта (замер table-lab.html): от 600 px в кадр
// помещается весь стол, ниже — только два города, иначе тайл падает ниже 44 px.
function relayout() {
  const short = Math.min(innerWidth, innerHeight);
  const land = innerWidth > innerHeight;
  table.uiReserve = land ? 300 : 168;
  const active = state.turn % PLAYERS;
  table.setLayout(short >= 600 ? 'table' : 'duel', [0, active === 0 ? nextSeat() : active]);
  document.body.classList.toggle('landscape', land);
}
const nextSeat = () => (state.turn + 1) % PLAYERS;

// ---------- партия ----------
function newGame() {
  const order = POLICIES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(state.rnd() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  state.players = Array.from({ length: PLAYERS }, (_, i) =>
    new Player(i, POLICIES[order[i]], { human: i === 0, name: SEATS[i] }));
  state.shop = makeShop(state.rnd);
  state.turn = 0;
  state.winner = null;
  state.phase = 'idle';
  table.build(state.players);
  relayout();
  drawPlayers();
  drawShop();
  startTurn();
}

function startTurn() {
  const p = active();
  state.phase = 'roll';
  relayout();
  const bonus = startOfTurnIncome(p);
  if (bonus) pop(table.worldOf(p.list[0]), '+' + bonus, 'gain');
  drawPlayers();
  if (p.human) {
    say('Ваш ход — бросайте кубик');
    $('roll').disabled = false;
    $('roll').classList.add('ready');
  } else {
    say(p.name + ' думает…');
    $('roll').disabled = true;
    $('roll').classList.remove('ready');
    setTimeout(doRoll, PACE.beforeRoll);
  }
}

function doRoll() {
  if (state.phase !== 'roll') return;
  state.phase = 'rolling';
  $('roll').disabled = true;
  $('roll').classList.remove('ready');
  const value = 1 + Math.floor(state.rnd() * RULES.diceFaces);
  sfx?.drop?.();
  table.rollDie(value, () => payout(value));
}

function payout(value) {
  const p = active();
  const events = resolveRoll(state.players, state.turn % PLAYERS, value);
  say(`Выпало ${value}` + (events.length ? '' : ' — ни у кого не сработало'));
  table.highlight(events.map(e => e.entry));
  for (const ev of events) {
    const world = table.worldOf(ev.entry);
    const mine = ev.to.seat === 0;
    if (ev.cls === 'рынок') {
      pop(world, '+' + ev.amount, mine ? 'gain' : 'foe');
      pop(table.worldOf(p.list[0]), '−' + ev.amount, p.seat === 0 ? 'loss' : 'foe');
    } else {
      pop(world, '+' + ev.amount, mine ? 'gain' : 'foe');
    }
  }
  if (events.length) sfx?.coins?.({ n: Math.min(events.length, 4) });
  drawPlayers();
  setTimeout(() => { table.clearHighlight(); buyPhase(); }, PACE.afterRoll);
}

function buyPhase() {
  const p = active();
  state.phase = 'buy';
  drawShop();
  if (p.human) {
    const opts = rankOptions(p, state.shop);
    const mon = p.nextMonument();
    say(opts.length || (mon && p.coins >= mon.cost)
      ? 'Стройте: выберите карточку' : 'Строить не на что — копим');
    $('skip').hidden = false;
  } else {
    state.phase = 'wait';
    announce(p, applyBuy(p, chooseBuy(p, state.shop), state.shop, Math.floor(state.turn / PLAYERS)));
    setTimeout(endTurn, PACE.afterBuy);
  }
}

function announce(p, done) {
  if (done.kind === 'monument') {
    const m = MONUMENTS.find(x => x.id === done.id);
    say(`${p.name}: монумент «${m.name}» (${p.monuments.length}/4)`);
    sfx?.fanfare?.() ?? sfx?.bell?.();
    table.syncMonuments(p.seat);
    if (done.won) return win(p);
  } else if (done.kind === 'building') {
    say(`${p.name} строит: ${BY_ID[done.id].name}`);
    sfx?.thud?.() ?? sfx?.tap?.();
    table.sync(p.seat);
  } else {
    say(`${p.name} копит`);
  }
  drawPlayers();
  drawShop();
}

function endTurn() {
  if (state.winner) return;
  state.turn++;
  startTurn();
}

function win(p) {
  state.winner = p;
  state.phase = 'over';
  sfx?.levelup?.();
  $('over').hidden = false;
  $('over-title').textContent = p.seat === 0 ? 'Вы победили' : 'Победа: ' + p.name;
  $('over-sub').textContent =
    `Партия заняла ${Math.ceil((state.turn + 1) / PLAYERS)} ваших ходов. ` +
    `Города: ` + state.players.map(x => `${x.name} — ${x.monuments.length}/4`).join(', ');
}

const active = () => state.players[state.turn % PLAYERS];

// ---------- ход человека ----------
function pickCard(kind, id) {
  const p = active();
  if (!p.human || state.phase !== 'buy') return;
  if (kind === 'monument') {
    const m = MONUMENTS.find(x => x.id === id);
    if (p.coins < m.cost) return;
    state.phase = 'wait';
    $('skip').hidden = true;
    announce(p, applyBuy(p, { kind: 'monument', id, cost: m.cost }, state.shop,
                         Math.floor(state.turn / PLAYERS)));
    if (!state.winner) setTimeout(endTurn, PACE.afterBuy);
    return;
  }
  const b = BY_ID[id];
  if (p.coins < b.cost || !p.free()) return;
  state.pending = id;
  sfx?.select?.();
  table.showFreeCells(0, true);
  say(`Куда поставить: ${b.name}?`);
  drawShop();
}

function onCanvasClick(ev) {
  if (!state.pending || state.phase !== 'buy') return;
  const cell = table.pick(ev.clientX, ev.clientY, 0);
  const p = active();
  if (!cell || p.grid[cell.r][cell.c]) return;
  const id = state.pending;
  state.pending = null;
  state.phase = 'wait';
  table.showFreeCells(0, false);
  announce(p, applyBuy(p, { kind: 'building', id, cost: BY_ID[id].cost, cell: [cell.r, cell.c] },
                       state.shop, Math.floor(state.turn / PLAYERS)));
  $('skip').hidden = true;
  setTimeout(endTurn, PACE.afterBuy);
}

// ---------- интерфейс ----------
function drawPlayers() {
  $('players').innerHTML = state.players.map((p, i) => `
    <div class="chip ${i === state.turn % PLAYERS ? 'on' : ''} ${i === 0 ? 'me' : ''}">
      <b>${p.name}</b>
      <span class="coins">${p.coins}</span>
      <span class="mons">${'◆'.repeat(p.monuments.length)}${'◇'.repeat(4 - p.monuments.length)}</span>
    </div>`).join('');
}

function drawShop() {
  const p = active();
  const human = p.human && state.phase === 'buy';
  const mon = state.players[0].nextMonument();
  const cards = state.shop.slots().map(s => {
    const b = BY_ID[s.id];
    const can = human && state.players[0].coins >= b.cost && state.players[0].free();
    return `<button class="card ${b.cls} ${can ? '' : 'off'} ${state.pending === b.id ? 'sel' : ''}"
             data-kind="building" data-id="${b.id}" ${can ? '' : 'disabled'}>
      <span class="num">${b.num.length ? b.num.join('·') : '—'}</span>
      <span class="nm">${b.name}</span>
      <span class="pay">${b.pay ? (b.cls === 'рынок' ? '↤' : '+') + b.pay : 'сосед'}</span>
      <span class="cost">${b.cost}</span>
      ${s.count > 1 ? `<span class="cnt">×${s.count}</span>` : ''}
    </button>`;
  }).join('');
  const monCard = mon ? `<button class="card mon ${human && state.players[0].coins >= mon.cost ? '' : 'off'}"
      data-kind="monument" data-id="${mon.id}"
      ${human && state.players[0].coins >= mon.cost ? '' : 'disabled'}>
      <span class="num">◆</span><span class="nm">${mon.name}</span>
      <span class="pay">${mon.effect}</span><span class="cost">${mon.cost}</span>
    </button>` : '';
  $('shop').innerHTML = monCard + cards;
}

function say(text) { $('msg').textContent = text; }

// Всплывающая монета: обычный DOM поверх канваса — дёшево и читается на любом фоне.
function pop(world, text, cls) {
  const [x, y] = table.toScreen(world);
  const el = document.createElement('div');
  el.className = 'pop ' + cls;
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  $('pops').appendChild(el);
  setTimeout(() => el.remove(), 1100);
}

// ---------- события ----------
$('roll').onclick = () => { sfx?.tap?.(); doRoll(); };
$('skip').onclick = () => {
  if (state.phase !== 'buy' || !active().human) return;
  state.pending = null;
  state.phase = 'wait';
  table.showFreeCells(0, false);
  $('skip').hidden = true;
  announce(active(), { kind: 'none' });
  setTimeout(endTurn, 300);
};
$('shop').onclick = e => {
  const card = e.target.closest('.card');
  if (card) pickCard(card.dataset.kind, card.dataset.id);
};
$('scene').addEventListener('click', onCanvasClick);
$('rotate').onclick = () => { sfx?.tap?.(); table.rotate(); };
$('mute').onclick = () => {
  state.muted = !state.muted;
  sfx?.setMuted?.(state.muted);
  $('mute').textContent = state.muted ? 'звук ✕' : 'звук ♪';
};
$('again').onclick = () => { $('over').hidden = true; newGame(); };
addEventListener('resize', relayout);

// первый жест разблокирует звук — политика браузеров, библиотека делает это сама
addEventListener('pointerdown', () => sfx?.music?.start?.('farm', 0.35), { once: true });

// ---------- цикл ----------
let last = performance.now(), lastW = 0, lastH = 0;
function frame(t) {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  if (innerWidth !== lastW || innerHeight !== lastH) {   // сторож размера: resize и
    lastW = innerWidth; lastH = innerHeight;             // ResizeObserver не приходят,
    relayout();                                          // пока страница не рисует кадры
  }
  table.update(dt);
  requestAnimationFrame(frame);
}

newGame();
requestAnimationFrame(frame);

// Отладочный автопилот: играет за человека той же логикой, что ИИ. Нужен, чтобы прогнать
// партию целиком и увидеть поздние стадии (монументы, победу) без сорока кликов руками.
// В релизной сборке этот блок удаляется вместе с window.game.
function autoStep() {
  const p = active();
  if (state.phase === 'roll') { doRoll(); return 'roll'; }
  if (state.phase === 'buy' && p.human) {
    const buy = chooseBuy(p, state.shop);
    if (buy && buy.kind === 'building') buy.cell = buy.cell || p.bestCell(buy.id);
    state.phase = 'wait';
    $('skip').hidden = true;
    announce(p, applyBuy(p, buy, state.shop, Math.floor(state.turn / PLAYERS)));
    if (!state.winner) setTimeout(endTurn, PACE.afterBuy);
    return 'buy';
  }
  return state.phase;
}

window.game = {
  state, table, newGame, autoStep,
  // темп в норме рассчитан на человека; для прогона партии его можно ужать
  fast(k = 6) {
    for (const key of Object.keys(PACE)) PACE[key] = Math.round(BASE_PACE[key] / k);
    table.rollDur = 0.85 / k;
  },
  // прогон N шагов с паузой: возвращает промис, чтобы дождаться конца партии
  async auto(steps = 200, delay = 40) {
    for (let i = 0; i < steps && !state.winner; i++) {
      autoStep();
      await new Promise(r => setTimeout(r, delay));
    }
    return { turn: state.turn, ownTurns: Math.ceil((state.turn + 1) / PLAYERS),
             winner: state.winner ? state.winner.name : null,
             coins: state.players.map(x => x.coins),
             mons: state.players.map(x => x.monuments.length),
             built: state.players.map(x => x.list.length) };
  },
};
