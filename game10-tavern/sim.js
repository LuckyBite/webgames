// «Таверна у края Хмари» — симулятор меты: дни подряд — утро (сцены, покупки и походы по
// простой политике), смена ботом, итог. Без побочных эффектов: его гоняют тесты и
// консольный sim.mjs. Сцены в симуляторе не показываются — сразу их последствия.
//
// Модель времени: день ≈ 4 минуты (смена 3 + утро и отчёт 1). Игра — сессиями по
// sessionDays дней, между ними gapHours часов: так в прогон попадают и короткие походы
// посреди сессии, и длинные — пока игра закрыта.

import { Shift } from './shift.js';
import { makeBot } from './bot.js';
import { newGame, shopItems, buy, routes, sendSeeker, updateSeekers, collect, shiftSetup, applyShift, unlockFame, canGo } from './meta.js';
import { nextScene, playScene, SCENES } from './story.js';
import { UPGRADES, DISHES, RARE, STAFF, FLOW, CHAPTERS, FINDS } from './data.js';

export const DAY_MS = 4 * 60 * 1000;

// Модели игрока: умелый быстрее человека, средний — человек, который освоился, новичок —
// ещё осваивается (им меряется пир главы 1: к пятому дню игрок не набил руку). Все жарят
// заранее, но не больше одного куска наперёд: без предела готовое сгорает, пока собирается
// другое (при пяти местах — по 50 кусков за смену), и замер мест врёт в минус.
const PLAYER = { precook: true, precookMax: 1 };
export const BOTS = {
  good:    { actionTime: 0.7, switchTime: 0.5, ...PLAYER },
  average: { actionTime: 1.0, switchTime: 0.8, ...PLAYER },
  novice:  { actionTime: 1.3, switchTime: 1.0, ...PLAYER },
};

function playShift(setup, bot, seed) {
  const s = new Shift({ seed, setup });
  const b = makeBot(bot);
  for (let k = 0; k < 30000 && !s.over; k++) { s.update(0.05); b(s); }
  return { ...s.summary(), actions: b.actions };
}

// Сцены без показа — сразу их последствия (искатели, маршруты).
export function playScenes(state) {
  for (let sc = nextScene(state); sc; sc = nextScene(state)) playScene(state, sc.id);
}

// Середина игры для замеров: глава 1 пройдена, рецепты без станций куплены, редкого — по
// stock штук, искатели в походе — их визиты не смешиваются с эффектом улучшения.
export function midGame(owned = {}, stock = 6, staff = []) {
  const state = newGame();
  state.day = 10;
  state.story.chapter = 2;
  for (const f of ['forest', 'marsh', 'sign', 'chapter1']) state.story.flags[f] = true;
  for (const sc of SCENES) state.story.seen[sc.id] = true;
  for (const [id, d] of Object.entries(DISHES)) if (d.recipe && !d.station) state.recipes[id] = true;
  for (const id of RARE) { state.known[id] = true; state.stock[id] = stock; }
  state.owned = { ...owned };
  for (const x of UPGRADES) if (owned[x.id]) for (const r of x.recipes || []) state.recipes[r] = true;
  for (const s of Object.values(state.seekers)) Object.assign(s, { joined: true, state: 'away' });
  for (const id of staff) state.staff[id] = { joined: true, day: 1 };
  return state;
}

// Таверна к тому времени, когда слава дошла до fame: пришли помощники с порогом не выше (с
// ними — их ступень потока) и куплены все ступени, открывшиеся раньше. Ступень и помощник
// меряются там, где их покупают, а не в пустой таверне: при трёх местах и редких гостях
// скорость ничего не стоит, при пяти и частых — стоит.
export function stateAt(fame, { stock = 6 } = {}) {
  const staff = STAFF.filter(x => x.fame <= fame).map(x => x.id);
  const owned = {};
  for (const u of UPGRADES) if (unlockFame(u) < fame) owned[u.id] = true;
  return midGame(owned, stock, staff);
}

// over — что подменить в настройке смены (ступень потока при замере помощника).
function measure(makeState, bot, seeds, over = {}) {
  let coins = 0, left = 0, actions = 0, served = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const sum = playShift({ ...shiftSetup(makeState()), ...over }, bot, seed);
    coins += sum.coins; left += sum.left; actions += sum.actions; served += sum.served;
  }
  return { coins: coins / seeds, left: left / seeds, actions: actions / seeds, served: served / seeds };
}

// Контролируемый замер окупаемости: одна и та же смена (зерно) со ступенью и без — в таверне
// её порога славы (stateAt). Последовательный замер «до и после покупки» врёт: покупки идут
// подряд, эффекты смешиваются.
export function marginal(upgradeId, { bot = BOTS.average, seeds = 8, stock = 6 } = {}) {
  const u = UPGRADES.find(x => x.id === upgradeId);
  const base = () => {
    const s = stateAt(unlockFame(u), { stock });
    delete s.owned[u.id];
    for (let r = u.requires; r; r = UPGRADES.find(x => x.id === r).requires) s.owned[r] = true;
    return s;
  };
  const withIt = () => {
    const s = base();
    s.owned[u.id] = true;
    for (const r of u.recipes || []) s.recipes[r] = true;
    return s;
  };
  const before = measure(base, bot, seeds), after = measure(withIt, bot, seeds);
  const gain = after.coins - before.coins;
  return { gain, payback: gain > 0 ? u.price / gain : Infinity, before, after };
}

// Помощник — две колонки (спека, «Экономика»: одно число врёт): прирост выручки против
// жалованья и сколько действий он экономит игроку. Таверна — его порога славы, поток — его
// ступени и в замере без него: помощник приходит вместе с нагрузкой, вопрос — справится ли
// игрок с этой нагрузкой без него.
export function staffMarginal(id, { bot = BOTS.average, seeds = 8, stock = 6 } = {}) {
  const k = STAFF.findIndex(x => x.id === id), st = STAFF[k];
  const flow = FLOW[Math.min(FLOW.length - 1, k + 1)], over = { seats: flow.seats, arrivalMul: flow.gap };
  const at = (joined) => () => {
    const s = stateAt(st.fame, { stock });
    s.staff[id] = { joined, day: 1 };
    return s;
  };
  const without = measure(at(false), bot, seeds, over), withIt = measure(at(true), bot, seeds, over);
  // Действия — на одного накормленного: с помощником игрок успевает больше гостей и в сумме
  // делает больше, хотя на каждого — меньше (замер шага 3г). saved — при нагрузке «с ним».
  const per = m => m.actions / Math.max(1, m.served);
  return { gain: withIt.coins - without.coins, saved: (per(without) - per(withIt)) * withIt.served, wage: st.wage, without, with: withIt };
}

// Доля пиров главы chapter, пройденных с попытки tries + 1 (позади tries неудач — гости
// терпеливее). Глава 1 — как к пиру у среднего игрока: owned куплено, искатели в походе.
// Главы 2–5 — таверна своего порога славы (stateAt): помощники и ступени, открытые к нему,
// загадки с главы 2.
export function feastRate(bot, { chapter = 1, tries = 0, seeds = 40, owned = { rug: true, grill: true } } = {}) {
  const ch = CHAPTERS.find(c => c.id === chapter);
  let ok = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    let state;
    if (chapter === 1) {
      state = newGame();
      state.day = 5;
      state.owned = { ...owned };
      for (const s of Object.values(state.seekers)) Object.assign(s, { joined: true, state: 'away' });
    } else state = stateAt(ch.fame);
    state.story.chapter = chapter;
    state.story.flags[ch.find] = true;
    state.story.feastTries = tries;
    state.fame = Math.max(state.fame, ch.fame);
    const setup = shiftSetup(state);
    if (playShift(setup, bot, 7000 + seed).served >= setup.feast.goal) ok++;
  }
  return ok / seeds;
}

// Утро простого игрока: забрать добычу; досмотреть сцены; купить всё по карману, от
// дешёвого к дорогому; сытых искателей — в поход (разных — на разные маршруты, от дальнего),
// голодных — оставить на смену дома, чтобы накормить любимым; второй день подряд голодным
// не держать.
export function morningPolicy(state, now, ctx = { idle: {} }, onBuy = () => {}) {
  updateSeekers(state, now);
  for (const id of Object.keys(state.seekers)) if (state.seekers[id].state === 'back') collect(state, id);
  playScenes(state);
  for (;;) {
    const next = shopItems(state).filter(x => x.can && x.kind !== 'goods').sort((a, b) => a.price - b.price)[0];
    if (!next) break;
    onBuy(next);
    buy(state, next.kind, next.id);
  }
  // торговец — когда ступеней в лавке не осталось, а монет больше, чем на два дня жалованья
  for (const g of shopItems(state).filter(x => x.kind === 'goods')) if (!shopItems(state).some(x => x.kind !== 'goods') && state.coins > g.price + 300) buy(state, 'goods', g.id);
  const open = routes(state).filter(r => r.open).reverse();
  if (!open.length) return;
  // Цель главы — первой: искатель с находкой идёт за ней сразу, как велит шапка утра.
  const ch = CHAPTERS.find(c => c.id === state.story.chapter);
  const find = ch && !state.story.flags[ch.find] && FINDS.find(f => f.id === ch.find);
  if (find && state.seekers[find.seeker]?.joined && state.seekers[find.seeker].state === 'home' && sendSeeker(state, find.seeker, find.route, now)) ctx.idle[find.seeker] = 0;
  let k = 0;
  for (const [id, s] of Object.entries(state.seekers)) {
    if (!s.joined || s.state !== 'home') continue;
    if (s.fed || (ctx.idle[id] || 0) >= 1) {
      // дальние маршруты — только тем, кто до них дорос
      const mine = open.filter(r => canGo(s, r));
      if (mine.length) sendSeeker(state, id, mine[k++ % mine.length].id, now);
      ctx.idle[id] = 0;
    } else ctx.idle[id] = (ctx.idle[id] || 0) + 1;
  }
}

export function simulate({ days = 30, seed = 1, bot = BOTS.good, sessionDays = 6, gapHours = 8 } = {}) {
  const state = newGame();
  const ctx = { idle: {} };
  const log = [], purchases = [];
  let now = 0;
  for (let d = 0; d < days; d++) {
    if (d > 0 && d % sessionDays === 0) now += gapHours * 3600 * 1000;
    const recent = log.slice(-3);
    const avg = recent.length ? recent.reduce((a, x) => a + x.coins, 0) / recent.length : 0;
    morningPolicy(state, now, ctx, item => purchases.push({ ...item, day: state.day, shifts: avg ? item.price / avg : Infinity }));
    const open = routes(state).filter(r => r.open).map(r => r.id);
    const setup = shiftSetup(state);
    const sum = playShift(setup, bot, seed * 1000 + d);
    const { feast, wages } = applyShift(state, sum);
    now += DAY_MS;
    const rare = Object.values(sum.used).reduce((a, n) => a + n, 0);
    log.push({
      day: state.day - 1, coins: sum.coins, served: sum.served, left: sum.left, fame: state.fame, bank: state.coins, rare, seats: setup.seats,
      open, chapter: state.story.chapter, feast: feast ? (feast.ok ? 'ok' : 'fail') : null,
      wages, staff: Object.values(state.staff).filter(x => x.joined).length,
    });
  }
  return { state, log, purchases };
}
