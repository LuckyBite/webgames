// «Удачный Квартал» — игровое ядро: состояние города, разрешение броска, выбор покупки.
//
// Этот модуль общий для симулятора (sim.mjs) и для игры (proto.js). Разделять их нельзя:
// весь баланс из economy.js проверен прогоном именно этих функций, и вторая копия правил
// в рендере рано или поздно разъедется с первой.
//
// Единственное, что ядро знает про показ: `resolveRoll` возвращает не сумму, а СПИСОК
// событий выплат. Симулятору хватает суммы, а игре нужно, из какого дома вылетела монета
// и в чей карман — иначе бросок нечем анимировать.

import { RULES, BUILDINGS, MONUMENTS, BY_ID, incomePerRound } from './economy.js';

// Характеры ИИ. monThreshold — потолок отношения «цена монумента / доход за круг»:
// сколько кругов игрок согласен окупать замороженные в монументе деньги. Большое
// значение = нетерпеливый, хватает монумент при первой возможности.
export const POLICIES = [
  { id: 'доход',     monThreshold: 4,   likes: null,    name: 'жадный до дохода' },
  { id: 'монументы', monThreshold: 999, likes: null,    name: 'рвётся к монументам' },
  { id: 'рынок',     monThreshold: 6,   likes: 'рынок', name: 'давит рынками' },
  { id: 'баланс',    monThreshold: 8,   likes: null,    name: 'ровный' },
];

export class Player {
  constructor(seat, policy, opts = {}) {
    this.seat = seat;
    this.policy = policy;
    this.human = !!opts.human;
    this.name = opts.name || (policy ? policy.name : 'игрок');
    this.coins = RULES.startCoins + (opts.seatBonus ?? RULES.seatBonus) * seat;
    this.grid = Array.from({ length: RULES.gridN }, () => Array(RULES.gridN).fill(null));
    this.list = [];                 // { id, r, c, earned, boughtRound }
    this.monuments = [];
    this.emptyShelf = 0;            // ход без покупки: на витрине нечего взять по деньгам
    this.noRoom = 0;                // ход без покупки: остров застроен
    this.ownTurns = 0;
    for (const id of RULES.startBuildings) this.place(id, 0);
  }

  get mods() {
    return {
      workshopBonus: this.monuments.includes('bashnya') ? 1 : 0,
      tradeBonus:    this.monuments.includes('port')    ? 1 : 0,
    };
  }

  neighbours(r, c) {
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
      .filter(([y, x]) => y >= 0 && x >= 0 && y < RULES.gridN && x < RULES.gridN)
      .map(([y, x]) => this.grid[y][x]).filter(Boolean);
  }

  // Соседский бонус считается в момент выплаты, а не покупки: поставил рядом позже —
  // старое здание тоже начало получать больше. Это и делает место вторым ресурсом.
  adjBonus(entry) {
    const b = BY_ID[entry.id];
    if (!b.adj) return 0;
    const n = this.neighbours(entry.r, entry.c).filter(e => BY_ID[e.id].tag === b.adj.tag).length;
    return Math.min(n, b.adj.cap) * b.adj.per;
  }

  // Насколько вырастет доход, если поставить здание сюда: и своя прибавка за соседей,
  // и прибавка соседям за нас.
  cellGain(id, r, c, players = 4) {
    const b = BY_ID[id];
    const probe = { id, r, c };
    let gain = incomePerRound({ ...b, pay: b.pay + this.adjBonus(probe) }, players, this.mods)
             - incomePerRound(b, players, this.mods);
    for (const nb of this.neighbours(r, c)) {
      const nbB = BY_ID[nb.id];
      if (!nbB.adj || nbB.adj.tag !== b.tag) continue;
      const before = this.adjBonus(nb);
      const after = Math.min(before / Math.max(nbB.adj.per, 1) + 1, nbB.adj.cap) * nbB.adj.per;
      gain += incomePerRound({ ...nbB, pay: nbB.pay + after }, players, this.mods)
            - incomePerRound({ ...nbB, pay: nbB.pay + before }, players, this.mods);
    }
    return gain;
  }

  bestCell(id, players = 4) {
    let best = null, bestScore = -Infinity;
    const mid = (RULES.gridN - 1) / 2;
    for (let r = 0; r < RULES.gridN; r++) for (let c = 0; c < RULES.gridN; c++) {
      if (this.grid[r][c]) continue;
      // Прирост дохода решает всё, но при РАВНОМ приросте (а он равен у половины зданий)
      // простой перебор всегда возвращал первую клетку — города вырастали стеной вдоль
      // дальнего края. Тай-брейк тянет к центру и слегка петляет, чтобы улица не была
      // прямой; веса на два порядка меньше монеты и на баланс не влияют.
      const jitter = ((r * 7 + c * 13 + this.list.length * 5) % 7) * 0.0007;
      const score = this.cellGain(id, r, c, players)
                  - 0.004 * (Math.abs(r - mid) + Math.abs(c - mid)) + jitter;
      if (score > bestScore) { bestScore = score; best = [r, c]; }
    }
    return best;
  }

  place(id, round, cell = null) {
    const at = cell || this.bestCell(id);
    if (!at) return null;
    const entry = { id, r: at[0], c: at[1], earned: 0, boughtRound: round };
    this.grid[at[0]][at[1]] = entry;
    this.list.push(entry);
    return entry;
  }

  free() { return this.list.length < RULES.gridN * RULES.gridN; }

  income(players = 4) {
    return this.list.reduce((s, e) => {
      const b = BY_ID[e.id];
      return s + incomePerRound({ ...b, pay: b.pay + this.adjBonus(e) }, players, this.mods);
    }, 0);
  }

  nextMonument(monuments = MONUMENTS) {
    return monuments.find(m => !this.monuments.includes(m.id)) || null;
  }
}

// ---------- витрина ----------
// Держит `slots` РАЗНЫХ позиций, но одинаковые карты складываются в одну стопку и слот
// не занимают — как на столе. Выбрасывать дубликат из колоды нельзя: так витрина съедала
// колоду тем быстрее, чем она шире.
export function makeShop(rnd, opts = {}) {
  const mode = opts.mode || RULES.shopMode;
  const slotCount = opts.slots || RULES.showcaseSlots;
  const deck = [];
  for (const b of BUILDINGS) for (let i = 0; i < RULES.copiesPerBuilding; i++) deck.push(b.id);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  if (mode === 'catalog') {
    return { mode, slots: () => BUILDINGS.map(b => ({ id: b.id, count: 99 })),
             available: () => BUILDINGS.map(b => b.id), take: () => {}, left: () => 99 };
  }
  const slots = [];
  const refill = () => {
    while (slots.length < slotCount && deck.length) {
      const next = deck.pop();
      const same = slots.find(s => s.id === next);
      if (same) same.count++; else slots.push({ id: next, count: 1 });
    }
  };
  refill();
  return {
    mode: 'showcase',
    slots: () => slots.map(s => ({ ...s })),
    available: () => slots.map(s => s.id),
    left: () => deck.length,
    take: id => {
      const i = slots.findIndex(s => s.id === id);
      if (i < 0) return;
      if (--slots[i].count <= 0) slots.splice(i, 1);
      refill();
    },
  };
}

// ---------- разрешение броска ----------
// Порядок как в настолке: сначала чужие рынки (могут обобрать бросившего), потом
// промыслы у всех, потом мастерские активного. Возвращает список выплат по одной штуке.
export function resolveRoll(players, activeIndex, roll, opts = {}) {
  const marketTax = opts.marketTax ?? RULES.marketTaxPerMonument;
  const taxFree = opts.taxFree ?? RULES.marketTaxFree;
  const a = players[activeIndex];
  const events = [];
  const tax = marketTax * Math.max(0, a.monuments.length - taxFree);

  for (let k = 1; k < players.length; k++) {
    const p = players[(activeIndex + k) % players.length];
    for (const e of p.list) {
      const b = BY_ID[e.id];
      if (b.cls !== 'рынок' || !b.num.includes(roll)) continue;
      const want = b.pay + p.adjBonus(e) + tax;
      const got = Math.min(want, a.coins);
      a.coins -= got; p.coins += got; e.earned += got;
      events.push({ cls: 'рынок', to: p, from: a, entry: e, amount: got, denied: want - got });
    }
  }
  for (const p of players) {
    for (const e of p.list) {
      const b = BY_ID[e.id];
      if (b.cls !== 'промысел' || !b.num.includes(roll)) continue;
      const gain = b.pay + p.adjBonus(e) + p.mods.tradeBonus;
      p.coins += gain; e.earned += gain;
      events.push({ cls: 'промысел', to: p, from: null, entry: e, amount: gain, denied: 0 });
    }
  }
  for (const e of a.list) {
    const b = BY_ID[e.id];
    if (b.cls !== 'мастерская' || !b.num.includes(roll)) continue;
    const gain = b.pay + a.adjBonus(e) + a.mods.workshopBonus;
    a.coins += gain; e.earned += gain;
    events.push({ cls: 'мастерская', to: a, from: null, entry: e, amount: gain, denied: 0 });
  }
  return events;
}

// Монеты, которые капают в начале своего хода за уже построенные монументы.
export function startOfTurnIncome(p) {
  let gain = 0;
  if (p.monuments.includes('ratusha')) gain += 1;
  if (p.monuments.includes('sobor')) gain += 2;
  p.coins += gain;
  return gain;
}

// ---------- выбор покупки (он же подсказка для человека) ----------
export function rankOptions(p, shop, opts = {}) {
  const playerCount = opts.playerCount || 4;
  if (!p.free()) return [];
  return shop.available()
    .map(id => BY_ID[id])
    .filter(b => b.cost <= p.coins)
    .map(b => {
      const cell = p.bestCell(b.id, playerCount);
      const gain = cell ? p.cellGain(b.id, cell[0], cell[1], playerCount)
                        + incomePerRound(b, playerCount, p.mods) : 0;
      const likeBonus = p.policy && p.policy.likes && b.cls === p.policy.likes ? 1.35 : 1;
      return { b, cell, gain, score: (gain / Math.max(b.cost, 1)) * likeBonus };
    })
    .filter(o => o.score > 0)
    .sort((x, y) => y.score - x.score);
}

export function chooseBuy(p, shop, opts = {}) {
  const monuments = opts.monuments || MONUMENTS;
  const playerCount = opts.playerCount || 4;
  const nextMon = p.nextMonument(monuments);
  const inc = Math.max(p.income(playerCount), 0.5);
  if (nextMon && p.coins >= nextMon.cost) {
    const threshold = p.policy ? p.policy.monThreshold : 6;
    if (nextMon.cost / inc <= threshold || p.monuments.length === monuments.length - 1)
      return { kind: 'monument', id: nextMon.id, cost: nextMon.cost };
  }
  const options = rankOptions(p, shop, opts);
  if (!options.length) return null;
  return { kind: 'building', id: options[0].b.id, cost: options[0].b.cost, cell: options[0].cell };
}

// Применяет покупку. Возвращает, что именно произошло, — вызывающему коду нужно и для
// анимации, и для статистики.
export function applyBuy(p, buy, shop, round, monuments = MONUMENTS) {
  if (!buy) {
    if (p.free()) p.emptyShelf++; else p.noRoom++;
    return { kind: 'none' };
  }
  if (buy.kind === 'monument') {
    p.coins -= buy.cost;
    p.monuments.push(buy.id);
    return { kind: 'monument', id: buy.id, index: p.monuments.length,
             won: p.monuments.length === monuments.length };
  }
  p.coins -= buy.cost;
  const entry = p.place(buy.id, round, buy.cell);
  shop.take(buy.id);
  return { kind: 'building', id: buy.id, entry };
}

// Детерминированный ГПСЧ: одинаковый seed — одинаковая партия. Нужен и симулятору
// (воспроизводимость прогона), и игре (можно переиграть ту же раздачу).
export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
