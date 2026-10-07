// «Таверна у края Хмари» — логика смены без отрисовки.
//
// Модуль общий для игры, тестов, бота (bot.js) и симулятора (sim.js); про канвас он не знает.
// Всё, что видит игрок, рендер берёт из состояния и из очереди событий (drain): монета
// вылетает из места, гость хмурится, мясо подгорает — это события, а не догадки рендера.
//
// Мета (meta.js) передаёт смене `setup`: места, слоты станций, меню, склад редких продуктов,
// бонусы ступеней улучшений, искателей, которые сегодня дома, и помощников; история
// (story.js) — сюжетных гостей и пир. Без setup смена та же, что в срезе шага 1, вплоть до
// порядка случайных чисел — баланс шага 1 утверждён плейтестом.

import { RULES, DISHES, DISH_WEIGHTS, RACES, INGREDIENTS, COOKERS, BASE_MENU, META, RIDDLES, KITCHEN, HALL, PRESSURE } from './data.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function moodOf(guest, rules = RULES) {
  const f = guest.patience / guest.patienceMax;
  return f > rules.moodCalm ? 'calm' : f > rules.moodAngry ? 'wait' : 'angry';
}

// Похожесть двух наборов частей (мультимножеств): |пересечение| / |объединение|.
// «Почти то» блюдо — это одна лишняя или недостающая часть: для блюд из 2–3 частей
// похожесть ≥ 0,5, совсем чужое блюдо даёт 0.
export function similarity(a, b) {
  const count = arr => arr.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map());
  const ca = count(a), cb = count(b);
  let inter = 0, union = 0;
  for (const k of new Set([...ca.keys(), ...cb.keys()])) {
    const x = ca.get(k) || 0, y = cb.get(k) || 0;
    inter += Math.min(x, y);
    union += Math.max(x, y);
  }
  return union ? inter / union : 0;
}

// Блюдо, которое сейчас на тарелке, если состав совпал точно.
export function dishOnPlate(plate) {
  for (const [id, d] of Object.entries(DISHES)) {
    if (!d.drink && similarity(d.parts, plate) === 1) return id;
  }
  return null;
}

// Места зала (шаг 3д): сначала стойка — одно место, с шести мест два; дальше столы на двоих.
// Общее для логики и раскладки: номер места один и тот же.
export function seatPlan(n) {
  const counter = Math.min(n, n >= 6 ? 2 : 1), plan = [];
  for (let k = 0; k < counter; k++) plan.push({ kind: 'counter', table: -1 });
  for (let k = 0; k < n - counter; k++) plan.push({ kind: 'table', table: Math.floor(k / HALL.table) });
  return plan;
}

// Звёзды смены (отчёт): три — никто не ушёл и хотя бы половина позиций на три звезды; две —
// ушло не больше одного; иначе одна.
export function shiftStars(sum) {
  const st = sum.stars || { 1: 0, 2: 0, 3: 0 }, all = st[1] + st[2] + st[3];
  if (sum.left === 0 && all && st[3] / all >= 0.5) return 3;
  return sum.left <= 1 ? 2 : 1;
}

export class Shift {
  constructor({ seed = 1, rules = RULES, autoArrive = true, setup = {} } = {}) {
    this.rules = rules;
    this.rng = mulberry32(seed);
    this.autoArrive = autoArrive;
    // Помощники (шаг 3б, meta.js staffEffects): clear — за сколько секунд служка убирает
    // место, pour — до какой доли бармен наливает кружку, fire — на сколько Тимка ускоряет
    // огонь, slow — на сколько бард замедляет терпение. Нули — помощника нет.
    const staff = { clear: 0, pour: 0, fire: 0, slow: 0, ...(setup.staff || {}) };
    const fire = 1 - staff.fire;
    this.cfg = {
      seats: setup.seats ?? rules.seats,
      menu: setup.menu ?? BASE_MENU,
      // на пиру гости нетерпеливее обычного (feast.patience), декор и неудачи прибавляют
      patienceMul: (1 + (setup.patienceBonus ?? 0)) * (setup.feast?.patience ?? 1) * KITCHEN.patienceMul,
      tipShare: rules.tipShare + (setup.tipBonus ?? 0),
      roastBonus: setup.roastBonus ?? 0,     // блюда с жарким дороже (жаровня, решётка)
      aleBonus: setup.aleBonus ?? 0,         // эль дороже (тёмный эль)
      brothBonus: setup.brothBonus ?? 0,     // похлёбка дороже (медный и большой котёл)
      cookMul: { hearth: (1 - (setup.hearthFaster ?? 0)) * fire, cauldron: (1 - (setup.cauldronFaster ?? 0)) * fire },
      pourSeconds: rules.pourSeconds * (1 - (setup.pourFaster ?? 0)),
      pourPerfect: rules.pourPerfect - (setup.pourEasier ?? 0),
      staff,
      arrivalMul: setup.arrivalMul ?? 1,     // пауза между гостями: меньше единицы — гости чаще
      regulars: setup.regulars ?? [],
      decor: setup.decor ?? [],
      // Сюжетные гости: приходят в свою секунду на первое свободное место (story.js).
      scripted: (setup.scripted ?? []).map(x => ({ ...x })),
      // Пир: ровно guests гостей по items позиций с паузой gap, без свечи (story.js).
      feast: setup.feast ?? null,
      orderItems: setup.feast?.items ?? setup.orderItems ?? rules.orderItems,
      arrivalGap: setup.arrivalGap ?? rules.arrivalGap,   // пауза между гостями по главе (PRESSURE)
      chops: KITCHEN.chops - (setup.chopsLess ?? 0),      // ударов на продукт (острый нож — меньше)
      // Темп внутри смены: разогрев, наплыв и подтяжка, когда никто не ждёт (PRESSURE). Без
      // setup — выключено: смена как в шаге 1.
      tempo: !!setup.tempo && !setup.feast,
      riddles: setup.riddles ?? false,   // гости с загадками (с главы 2, story.js)
      sky: setup.sky ?? null,            // окно в Хмарь: туман главы и рассвет (только рисунок)
      // Обучение первого дня (разбор 2026-10-07, п. 5): гости по одному из этого списка — каждый
      // следующий, когда ушёл предыдущий; их терпение не тает, свеча пока стоит, случайных
      // гостей нет. Элемент — { items, race } или сюжетный { items, regular, line }.
      tutorial: (setup.tutorial ?? []).map(x => ({ ...x })),
    };
    this.t = 0;
    this.closing = false;   // свеча догорела: новых гостей нет
    this.over = false;      // смена кончилась: ушёл последний
    this.nextArrival = rules.firstArrival;
    this.paused = 0;          // секунды, когда свеча стояла (обучение)
    this.tutNext = rules.firstArrival;   // когда зайдёт следующий обучающий гость
    this.nextId = 1;
    this.arrived = 0;         // сколько гостей село за смену — пир считает по нему
    this.met = [];            // сюжетные гости, которые зашли за смену
    this.help = { clear: -1, clearT: 0 };   // какое место сейчас убирает служка
    this.seats = seatPlan(this.cfg.seats).map(p => ({ guest: null, dirty: 0, kind: p.kind, table: p.table }));
    // Окно раздачи: в каждом гнезде — номер места гостя с открытым заказом или −1.
    this.slots = Array(Math.min(HALL.hatch, this.cfg.seats)).fill(-1);
    // Слоты станций подряд: сначала очаг, потом котёл. Номер слота общий для логики и раскладки.
    // Очаг: side — какой стороной жарится мясо (0 — первой, 1 — перевёрнуто). Котёл: stirred —
    // помешали, scorched — пропустили помешивание, похлёбка пригорела (шаг 3г).
    this.cookers = [
      ...Array.from({ length: setup.hearthSlots ?? rules.hearthSlots }, () => ({ station: 'hearth', item: null, t: 0, side: 0 })),
      ...Array.from({ length: setup.cauldronSlots ?? 0 }, () => ({ station: 'cauldron', item: null, t: 0, stirred: false, scorched: false })),
    ];
    this.barrel = { pouring: false, fill: 0, mug: null, by: null };   // mug: null | 'full' | 'short' | 'spilled'; by: 'staff' — наливает бармен
    this.plate = [];
    // Качество каждой части на тарелке, по порядку plate: 'ok', 'nice' (штрих полосой через
    // тарелку) или 'scorched' (пригоревшая похлёбка). Из него — множитель цены при подаче.
    this.plateQ = [];
    // Колода: что лежит и сколько ударов осталось; cut — нарезанные порции в ящиках кладовой.
    this.block = { item: null, left: 0 };
    this.cut = Object.fromEntries(Object.keys(INGREDIENTS).filter(id => INGREDIENTS[id].cut).map(id => [id, 0]));
    this.stock = { ...(setup.stock || {}) };
    this.used = {};             // сколько редких потрачено за смену
    this.fed = [];              // искатели, накормленные любимым блюдом
    this.visited = new Set();   // искатели, уже заходившие в эту смену
    this.stats = { coins: 0, tips: 0, fame: 0, served: 0, left: 0, autoCollected: 0, riddles: { best: 0, ok: 0, miss: 0 }, stars: { 1: 0, 2: 0, 3: 0 }, streakBest: 0, idle: 0, perfect: 0 };
    this.streak = 0;          // подряд подано на три звезды
    this.calm = 0;            // сколько секунд никто не ждёт (подтяжка гостей)
    this.rushed = false;      // наплыв уже объявлен
    this.events = [];
  }

  // Идёт обучение: ещё есть кого вывести или обучающий гость в зале.
  tutorialOn() { return this.cfg.tutorial.length > 0 || this.seats.some(s => s.guest?.tutorial); }
  // Свеча: время смены без пауз обучения.
  candle() { return this.t - this.paused; }

  // Слоты очага — первые в cookers, поэтому их номера совпадают с номерами cookers.
  get hearth() { return this.cookers.filter(c => c.station === 'hearth'); }

  // Сколько готовится на станции с учётом улучшений (большая жаровня жарит быстрее).
  cookTime(station) { return COOKERS[station].cookSeconds * this.cfg.cookMul[station]; }

  // Сколько готовое держится до подгорания. Ускорение сокращает ожидание, но не приближает
  // подгорание: срок сгорания от закладки всегда прежний (cookSeconds + readySeconds), поэтому
  // окно «готово» растёт на сэкономленное. Иначе быстрый огонь бьёт по медленному игроку —
  // замер шага 3б: с Тимкой средний бот терял выручку на сгоревшем.
  readyTime(station) { const d = COOKERS[station]; return d.readySeconds + d.cookSeconds - this.cookTime(station); }

  // Окно переворота по тому же правилу: первая сторона быстрее — окно дольше, мясо без
  // переворота горит в тот же срок от закладки (шаг 3г).
  flipTime() { return KITCHEN.flipWindow + (COOKERS.hearth.cookSeconds - this.cookTime('hearth')) / 2; }

  emit(type, data = {}) { this.events.push({ type, t: this.t, ...data }); }
  drain() { const e = this.events; this.events = []; return e; }
  rand(lo, hi) { return lo + (hi - lo) * this.rng(); }
  randInt(lo, hi) { return lo + Math.floor(this.rng() * (hi - lo + 1)); }

  // ---------- гости ----------

  freeSeats() {
    return this.seats.map((s, i) => (!s.guest && !s.dirty ? i : -1)).filter(i => i >= 0);
  }

  // Можно ли подать блюдо: оно в меню, есть его станция и хватает редких продуктов с учётом
  // уже заказанного, но не поданного, — кто заказал раньше, тот и съест последний мёд.
  canOffer(dish, pending = []) {
    const d = DISHES[dish];
    if (!this.cfg.menu.includes(dish)) return false;
    if (d.station && !this.cookers.some(c => c.station === d.station)) return false;
    if (!d.needs) return true;
    const reserved = {};
    const add = id => { for (const [k, n] of Object.entries(DISHES[id].needs || {})) reserved[k] = (reserved[k] || 0) + n; };
    for (const seat of this.seats) for (const it of seat.guest?.items || []) if (!it.served && it.dish) add(it.dish);
    pending.forEach(add);
    return Object.entries(d.needs).every(([k, n]) => (this.stock[k] || 0) - (reserved[k] || 0) >= n);
  }

  // ---------- загадки ----------

  // Чем ответить на загадку: первый ответ, который можно подать, сначала из точных.
  riddleAnswer(id) {
    const r = RIDDLES.find(x => x.id === id);
    return [...r.best, ...r.ok].find(d => this.canOffer(d)) || null;
  }

  // Попадание: в точку, подходит или мимо.
  riddleGrade(id, dish) {
    const r = RIDDLES.find(x => x.id === id);
    return r.best.includes(dish) ? 'best' : r.ok.includes(dish) ? 'ok' : 'miss';
  }

  // Загадка, у которой хоть один ответ можно подать с учётом остальных позиций заказа.
  rollRiddle(items) {
    const pool = RIDDLES.filter(r => [...r.best, ...r.ok].some(d => this.canOffer(d, items)));
    return pool.length ? pool[Math.floor(this.rng() * pool.length)].id : null;
  }

  // Позиции заказа без повторов, по весам блюд, только из того, что можно подать.
  // prefer — любимое блюдо искателя: идёт первым, если его можно приготовить. Случайный гость
  // с главы 2 иногда вместо последней позиции загадывает загадку ({ riddle }); искатели и
  // сюжетные гости — нет. Без загадок случайные числа не тратятся: смена без setup — как в шаге 1.
  rollOrder(prefer) {
    const [lo, hi] = this.cfg.orderItems;
    const n = this.randInt(lo, hi);
    const items = [];
    if (prefer && this.canOffer(prefer, items)) items.push(prefer);
    while (items.length < n) {
      const pool = Object.keys(DISH_WEIGHTS).filter(id => !items.includes(id) && this.canOffer(id, items));
      if (!pool.length) break;
      const total = pool.reduce((sum, id) => sum + DISH_WEIGHTS[id], 0);
      let r = this.rng() * total, pick = pool[0];
      for (const id of pool) { r -= DISH_WEIGHTS[id]; if (r < 0) { pick = id; break; } }
      items.push(pick);
    }
    if (this.cfg.riddles && !prefer && items.length && this.rng() < META.riddleChance) {
      const riddle = this.rollRiddle(items.slice(0, -1));
      if (riddle) items[items.length - 1] = { riddle };
    }
    return items;
  }

  // Искатель, который дома, заходит раз за смену — вместо случайного гостя. Без искателей
  // случайные числа не тратятся, чтобы смена без setup не отличалась от шага 1.
  pickRegular() {
    const left = this.cfg.regulars.filter(r => !this.visited.has(r.id));
    if (!left.length || this.rng() >= META.regularChance) return null;
    return left[Math.floor(this.rng() * left.length)];
  }

  // Посадить гостя. Прибытия по таймеру, тесты и бот идут через этот же метод.
  seatGuest(i, { race, items, regular, line } = {}) {
    const seat = this.seats[i];
    if (!seat || seat.guest || seat.dirty) return null;
    const dishes = items || this.rollOrder(regular?.favorite);
    const max = (this.rules.patienceBase + this.rules.patiencePerItem * (dishes.length - 1)) * this.cfg.patienceMul;
    const guest = {
      id: this.nextId++,
      race: regular ? regular.race : race || RACES[Math.floor(this.rng() * RACES.length)],
      seed: regular ? regular.seed : Math.floor(this.rng() * 1e9),
      regular: regular ? regular.id : null,
      favorite: regular ? regular.favorite : null,
      // Позиция: блюдо или загадка (dish появляется, когда её разгадали); pay — что заработала.
      items: dishes.map(x => (typeof x === 'string'
        ? { dish: x, riddle: null, served: false, result: null, pay: 0 }
        : { dish: null, riddle: x.riddle, served: false, result: null, pay: 0 })),
      taken: false,
      patience: max,
      patienceMax: max,
      bill: 0,        // уже заработано за поданное
      eating: 0,      // > 0 — ест, терпение не тает
      doneFrac: 0,    // доля терпения в момент, когда подали последнее
      line: line || null,   // сюжетная реплика вместо обычной
    };
    if (regular) this.visited.add(regular.id);
    seat.guest = guest;
    this.arrived++;
    this.emit('arrive', { seat: i, regular: guest.regular });
    return guest;
  }

  // Заказ уходит в окно раздачи, если там есть гнездо; иначе гость ждёт, а его терпение тает.
  takeOrder(i, slot) {
    const g = this.seats[i]?.guest;
    if (!g || g.taken) return false;
    const k = slot !== undefined && this.slots[slot] === -1 ? slot : this.slots.indexOf(-1);
    if (k < 0) { this.emit('reject', { why: 'hatch', seat: i }); return false; }
    g.taken = true;
    this.slots[k] = i;
    this.emit('order', { seat: i, slot: k });
    return true;
  }

  canTake() { return this.slots.includes(-1); }
  // Гость из зала, которого окно раздачи показывает в пустом гнезде k (−1 — никого): k-е пустое
  // гнездо — k-й из ждущих. Тап по нему принимает заказ, не уходя с кухни.
  waitingFor(k) {
    if (this.slots[k] !== -1) return -1;
    const j = this.slots.slice(0, k).filter(x => x === -1).length;
    return this.waitingSeats()[j] ?? -1;
  }
  // Кто в зале ждёт, чтобы у него приняли заказ: самые нетерпеливые первыми (окно раздачи
  // показывает их в пустых гнёздах — заказ можно принять, не уходя с кухни).
  waitingSeats() {
    return this.seats.map((s, i) => ({ i, g: s.guest })).filter(x => x.g && !x.g.taken)
      .sort((a, b) => a.g.patience / a.g.patienceMax - b.g.patience / b.g.patienceMax).map(x => x.i);
  }
  slotOf(i) { return this.slots.indexOf(i); }
  freeSlot(i) { const k = this.slots.indexOf(i); if (k >= 0) this.slots[k] = -1; }

  // Куда сесть: обычный гость — за стол, искатель и сюжетный — к стойке; нет такого места —
  // любое свободное.
  prefer(free, kind) {
    const own = free.filter(i => this.seats[i].kind === kind);
    return own.length ? own : free;
  }

  // Посуда и монеты за ушедшим гостем: место занято, пока их не убрать.
  clearSeat(i) {
    const seat = this.seats[i];
    if (!seat || !seat.dirty) return false;
    const amount = seat.dirty;
    this.stats.coins += amount;
    seat.dirty = 0;
    this.emit('coins', { seat: i, amount });
    return true;
  }

  // Сытый гость оставляет счёт и чаевые; голодный — только счёт за поданное.
  // Искатель, получивший любимое блюдо точно, уходит в поход сытым.
  leave(i, angry) {
    const seat = this.seats[i], g = seat.guest;
    let tip = 0;
    let perfect = false;
    if (angry) {
      this.stats.left++;
      this.stats.fame += this.rules.fameLeft;
      this.breakStreak();
    } else {
      // чаевые — от полной цены заказа; загадка стоит столько, сколько за неё заплатили;
      // серия точных подач прибавляет к доле чаевых
      const full = g.items.reduce((sum, it) => sum + (it.riddle ? it.pay : DISHES[it.dish].price), 0);
      tip = Math.round(full * this.cfg.tipShare * g.doneFrac * (1 + this.streakTip()));
      this.stats.tips += tip;
      this.stats.served++;
      if (g.doneFrac > this.rules.moodCalm) this.stats.fame += this.rules.fameHappy;
      perfect = g.items.every(it => it.stars === 3);
      if (perfect) this.stats.perfect++;
      if (g.regular && g.items.some(it => it.dish === g.favorite && it.result === 'exact')) {
        this.fed.push(g.regular);
        this.emit('fed', { seat: i, id: g.regular });
      }
    }
    this.freeSlot(i);
    seat.guest = null;
    seat.dirty = g.bill + tip;
    if (g.tutorial) this.tutNext = this.t + 1.5;
    this.emit('leave', { seat: i, angry, amount: seat.dirty, tip, perfect, guest: g });
  }

  // ---------- качество и серия ----------

  streakTip() { return Math.min(KITCHEN.streakTipMax, KITCHEN.streakTip * this.streak); }

  breakStreak() {
    if (this.streak >= 2) this.emit('streakLost', { n: this.streak });
    this.streak = 0;
  }

  // Звёзды позиции: 1 — «почти то», пригорело или недолив; 3 — всё свежее (top) и гость ещё
  // не злится; иначе 2.
  starsFor(g, result, top, low) {
    if (result !== 'exact' || low) return 1;
    return top && g.patience / g.patienceMax > this.rules.moodAngry ? 3 : 2;
  }

  // ---------- кухня ----------

  // Базовые продукты бесконечны; редкий — минус один со склада.
  take(id) {
    if (!INGREDIENTS[id]?.rare) return true;
    if (!(this.stock[id] > 0)) { this.emit('reject', { why: 'stock', id }); return false; }
    this.stock[id]--;
    this.used[id] = (this.used[id] || 0) + 1;
    return true;
  }

  // На тарелку: нарезаемое — только нарезанным (из ящика), штрих — с длиной полосы stroke
  // (доля ширины тарелки, 0 — просто бросили): длинная полоса — «красиво». q — качество части,
  // которую кладёт станция (пригоревшая похлёбка).
  addToPlate(id, { stroke = 0, q = 'base' } = {}) {
    const ing = INGREDIENTS[id];
    if (!ing || ing.raw) { this.emit('reject', { why: 'raw' }); return false; }
    if (this.plate.length >= this.rules.plateMax) { this.emit('reject', { why: 'full' }); return false; }
    if (ing.cut && !(this.cut[id] > 0)) { this.emit('reject', { why: 'uncut', id }); return false; }
    if (!this.take(id)) return false;
    if (ing.cut) this.cut[id]--;
    const quality = ing.garnish ? (stroke >= KITCHEN.garnishStroke ? 'nice' : 'ok') : q;
    this.plate.push(id);
    this.plateQ.push(quality);
    this.emit('plate', { id, quality });
    return true;
  }

  // Множитель цены за то, как собрано: штрих «красиво» — дороже (один раз на блюдо),
  // пригоревшая похлёбка — дешевле.
  plateMul() {
    let mul = 1;
    if (this.plateQ.includes('nice')) mul *= 1 + KITCHEN.garnishBonus;
    if (this.plateQ.includes('scorched')) mul *= KITCHEN.scorchedMul;
    return mul;
  }

  // ---------- колода ----------

  // Нарезаемое из кладовой — на колоду (базовые продукты бесконечны, ничего не списывается).
  putOnBlock(id) {
    if (!INGREDIENTS[id]?.cut) { this.emit('reject', { why: 'notcut' }); return false; }
    if (this.block.item) { this.emit('reject', { why: 'block' }); return false; }
    if (this.cut[id] >= KITCHEN.cutMax) { this.emit('reject', { why: 'cutFull', id }); return false; }
    this.block = { item: id, left: this.cfg.chops };
    this.emit('block', { id });
    return true;
  }

  // Удар ножом — порция в ящик. Последний удар освобождает колоду. В полный ящик не режем.
  chop() {
    const b = this.block;
    if (!b.item) return false;
    if (this.cut[b.item] >= KITCHEN.cutMax) { this.emit('reject', { why: 'cutFull', id: b.item }); return false; }
    this.cut[b.item]++;
    b.left--;
    this.emit('chop', { id: b.item, left: b.left });
    if (b.left <= 0) this.block = { item: null, left: 0 };
    return true;
  }

  dumpPlate() {
    if (!this.plate.length) return false;
    this.plate = [];
    this.plateQ = [];
    this.emit('dump', { what: 'plate' });
    return true;
  }

  // Сырьё — на свою станцию: мясо на очаг, грибы в котёл. Без номера — в первый свободный слот.
  putOn(station, slot) {
    const def = COOKERS[station];
    const i = slot ?? this.cookers.findIndex(c => c.station === station && !c.item);
    const c = this.cookers[i];
    if (!def || !c || c.station !== station || c.item) { this.emit('reject', { why: station === 'hearth' ? 'hearth' : 'cauldron' }); return false; }
    if (!this.take(def.from)) return false;
    Object.assign(c, { item: def.from, t: 0, side: 0, stirred: false, scorched: false });
    this.emit('sizzle', { slot: i, station });
    return true;
  }

  // Что сейчас со слотом станции — для логики, бота и рисунка. phase: 'empty', 'side1'
  // (жарится первая сторона), 'flip' (ждёт переворота), 'side2', 'cook' (котёл варит), 'stir'
  // (котёл ждёт помешивания), 'ready', 'burnt'; frac — доля этой фазы, от 0 до 1.
  phaseOf(i) {
    const c = this.cookers[i];
    if (!c || !c.item) return { phase: 'empty', frac: 0 };
    if (c.item === 'burnt') return { phase: 'burnt', frac: 1 };
    const def = COOKERS[c.station], cook = this.cookTime(c.station);
    if (c.item === def.to) return { phase: 'ready', frac: Math.max(0, 1 - (c.t - cook) / this.readyTime(c.station)) };
    if (c.station === 'hearth') {
      const half = cook / 2;
      if (c.side) return { phase: 'side2', frac: Math.min(1, (c.t - half) / half) };
      return c.t < half ? { phase: 'side1', frac: c.t / half } : { phase: 'flip', frac: Math.min(1, (c.t - half) / this.flipTime()) };
    }
    const at = cook * KITCHEN.stirAt;
    if (!c.stirred && !c.scorched && c.t >= at) return { phase: 'stir', frac: Math.min(1, (c.t - at) / KITCHEN.stirWindow) };
    return { phase: 'cook', frac: c.t / cook };
  }

  // Перевернуть мясо: только когда первая сторона дожарилась. Вторая жарится столько же.
  flip(i) {
    const c = this.cookers[i];
    if (this.phaseOf(i).phase !== 'flip') { if (c?.item === COOKERS.hearth.from) this.emit('reject', { why: 'early' }); return false; }
    c.side = 1;
    c.t = this.cookTime('hearth') / 2;
    this.emit('flip', { slot: i });
    return true;
  }

  // Помешать котёл: только пока он просит.
  stir(i) {
    const c = this.cookers[i];
    if (this.phaseOf(i).phase !== 'stir') return false;
    c.stirred = true;
    this.emit('stir', { slot: i });
    return true;
  }

  // Снять со станции: готовое — на тарелку, сгоревшее — в помои, сырое — нельзя.
  takeFrom(i) {
    const c = this.cookers[i];
    if (!c || !c.item) return false;
    if (c.item === 'burnt') return this.discard(i);
    const def = COOKERS[c.station];
    if (c.item !== def.to) {
      const ph = this.phaseOf(i).phase;
      if (ph === 'flip') return this.flip(i);
      if (ph === 'stir') return this.stir(i);
      this.emit('reject', { why: 'raw' });
      return false;
    }
    const fresh = this.phaseOf(i).frac >= KITCHEN.fresh;
    if (!this.addToPlate(def.to, { q: c.scorched ? 'scorched' : fresh ? 'fresh' : 'ok' })) return false;
    Object.assign(c, { item: null, t: 0, side: 0, stirred: false, scorched: false });
    return true;
  }

  discard(i) {
    const c = this.cookers[i];
    if (!c || !c.item) return false;
    Object.assign(c, { item: null, t: 0, side: 0, stirred: false, scorched: false });
    this.emit('dump', { what: 'cooker', slot: i });
    return true;
  }

  putOnHearth(slot) { return this.putOn('hearth', slot); }
  takeFromHearth(i) { return this.takeFrom(i); }
  discardHearth(i) { return this.discard(i); }

  // Бочка — жест «держи»: кран открыт, пока палец на бочке.
  startPour() {
    const b = this.barrel;
    if (b.pouring || b.mug) return false;
    b.pouring = true;
    b.fill = 0;
    this.emit('pour');
    return true;
  }

  stopPour() {
    const b = this.barrel;
    if (!b.pouring || b.by) return false;
    b.pouring = false;
    if (b.fill < this.rules.pourMin) { b.fill = 0; this.emit('reject', { why: 'empty' }); return false; }
    b.mug = b.fill >= this.cfg.pourPerfect ? 'full' : 'short';
    this.emit('poured', { quality: b.mug });
    return true;
  }

  dumpMug() {
    if (!this.barrel.mug) return false;
    this.barrel.mug = null;
    this.barrel.fill = 0;
    this.emit('dump', { what: 'mug' });
    return true;
  }

  // ---------- подача ----------

  // Кружку или тарелку — гостю на месте i. Не то, что он просил, — отказ и минус терпение.
  // Загадка принимает любое целое блюдо, которого гость не заказывал отдельно: плата по
  // попаданию (best / ok / miss), недолив и здесь режет оплату вдвое.
  serve(i, source) {
    const g = this.seats[i]?.guest;
    if (!g || !g.taken || g.eating > 0) return false;
    const open = g.items.filter(it => !it.served);
    const riddle = open.find(it => it.riddle) || null;
    let item = null, share = 0, dish = null, grade = null, quality = null, mul = 1, top = false, low = false;
    if (source === 'mug') {
      const mug = this.barrel.mug;
      if (mug !== 'full' && mug !== 'short') return false;
      item = open.find(it => it.dish && DISHES[it.dish].drink) || null;
      if (item) dish = item.dish;
      else if (riddle) { item = riddle; dish = 'ale'; grade = this.riddleGrade(riddle.riddle, dish); }
      if (item) {
        share = mug === 'full' ? 1 : this.rules.wrongShare;
        top = this.barrel.fill >= this.cfg.pourPerfect + KITCHEN.aleTop[0] && this.barrel.fill <= KITCHEN.aleTop[1];
        low = mug !== 'full';
        this.barrel.mug = null;
        this.barrel.fill = 0;
      }
    } else if (source === 'plate') {
      if (!this.plate.length) return false;
      let best = 0;
      for (const it of open) {
        if (!it.dish || DISHES[it.dish].drink) continue;
        const sim = similarity(DISHES[it.dish].parts, this.plate);
        if (sim > best) { best = sim; item = it; }
      }
      const exact = dishOnPlate(this.plate);
      if (best < 1 && riddle && exact) { item = riddle; dish = exact; grade = this.riddleGrade(riddle.riddle, dish); best = 1; }
      else if (best < this.rules.nearMiss) item = null;
      else dish = item.dish;
      if (item) {
        share = best === 1 ? 1 : this.rules.wrongShare;
        mul = this.plateMul();
        quality = this.plateQ.includes('nice') ? 'nice' : this.plateQ.includes('scorched') ? 'scorched' : null;
        low = this.plateQ.includes('scorched');
        top = !this.plateQ.includes('ok');
        this.plate = [];
        this.plateQ = [];
      }
    } else return false;

    if (!item) {
      g.patience = Math.max(0, g.patience - this.rules.refusePenalty * g.patienceMax);
      this.breakStreak();
      this.emit('refuse', { seat: i });
      return 'refused';
    }
    const result = share === 1 ? 'exact' : 'near';
    const stars = grade === 'miss' ? 1 : this.starsFor(g, result, top, low);
    mul *= KITCHEN.starMul[stars];
    item.served = true;
    item.result = result;
    item.dish = dish;
    item.stars = stars;
    this.stats.stars[stars]++;
    if (stars === 3) {
      this.streak++;
      this.stats.streakBest = Math.max(this.stats.streakBest, this.streak);
      if (this.streak % KITCHEN.streakFame === 0) this.stats.fame++;
      this.emit('streak', { n: this.streak, seat: i });
    } else this.breakStreak();
    const d = DISHES[dish];
    const bonus = d.drink ? this.cfg.aleBonus
      : d.parts.includes('roast') ? this.cfg.roastBonus
      : d.parts.includes('broth') ? this.cfg.brothBonus : 0;
    const pay = Math.round(d.price * share * mul * (1 + bonus) * (grade ? META.riddleMul[grade] : 1));
    item.pay = pay;
    g.bill += pay;
    if (grade) this.stats.riddles[grade]++;
    this.emit('served', { seat: i, slot: this.slotOf(i), dish, result, pay, grade, quality, stars, streak: this.streak });
    if (g.items.every(it => it.served)) {
      this.freeSlot(i);                         // всё подано — гнездо окна раздачи свободно
      const linger = this.seats[i].kind === 'table' && this.cfg.seats >= 5 ? HALL.linger : 0;
      g.eating = this.rules.eatSeconds + linger;
      g.doneFrac = g.patience / g.patienceMax;
      this.emit('complete', { seat: i });
    }
    return result;
  }

  // ---------- помощники ----------

  // Сколько напитков ждут гости с принятым заказом, кроме того, что уже в кружке.
  openDrinks() {
    let n = 0;
    for (const seat of this.seats) {
      const g = seat.guest;
      if (!g || !g.taken || g.eating > 0) continue;
      n += g.items.filter(it => !it.served && it.dish && DISHES[it.dish].drink).length;
    }
    return n - (this.barrel.mug === 'full' || this.barrel.mug === 'short' ? 1 : 0);
  }

  // Помощники руками: служка убирает места по одному, бармен наливает эль, когда его ждут, и
  // отпускает кран вовремя. Людей и сборку они у игрока не забирают (спека, «Персонал»).
  // Тимка и бард меняют числа — они в cfg, здесь их нет.
  updateStaff(dt) {
    const S = this.cfg.staff, h = this.help, b = this.barrel;
    if (S.clear) {
      if (h.clear < 0) {
        const i = this.seats.findIndex(s => s.dirty && !s.guest);
        if (i >= 0) { h.clear = i; h.clearT = S.clear; this.emit('staff', { who: 'clear', seat: i }); }
      } else if (!this.seats[h.clear].dirty) h.clear = -1;          // игрок успел сам
      else if ((h.clearT -= dt) <= 0) { this.clearSeat(h.clear); h.clear = -1; }
    }
    if (S.pour && !b.pouring && !b.mug && this.openDrinks() > 0) {
      Object.assign(b, { pouring: true, fill: 0, by: 'staff' });
      this.emit('pour', { by: 'staff' });
    }
  }

  // ---------- время ----------

  update(dt) {
    if (this.over) return;
    const R = this.rules;
    this.t += dt;
    const feast = this.cfg.feast;
    // Свеча кончает обычную смену; пир кончается, когда пришли все его гости.
    const tut = this.tutorialOn();
    if (tut) this.paused += dt;
    if (!this.closing && (feast ? this.arrived >= feast.guests : this.candle() >= R.shiftSeconds)) { this.closing = true; this.emit('closing'); }

    // Обучающий гость — следующий, когда предыдущий ушёл и место убрано.
    if (this.cfg.tutorial.length && !this.seats.some(s => s.guest?.tutorial) && this.t >= this.tutNext) {
      const free = this.prefer(this.freeSeats(), 'counter');
      if (free.length) {
        const x = this.cfg.tutorial.shift();
        if (x.regular) this.met.push(x.regular.id);
        const g = this.seatGuest(free[0], x.regular ? { regular: x.regular, items: x.items, line: x.line } : { race: x.race, items: x.items });
        g.tutorial = true;
        this.tutNext = Infinity;
      }
    }

    // Сюжетный гость приходит в свою секунду на первое свободное место — даже после заката
    // и даже на грязное (монеты оттуда — в кассу): пока он не зашёл, глава стоит.
    const due = this.cfg.scripted.findIndex(x => this.t >= x.at);
    if (due >= 0) {
      const free = this.prefer(this.freeSeats(), 'counter');
      const i = free.length ? free[0] : this.seats.findIndex(s => !s.guest);
      if (i >= 0) {
        if (this.seats[i].dirty) this.autoCollect(i);
        const [x] = this.cfg.scripted.splice(due, 1);
        this.met.push(x.regular.id);
        this.seatGuest(i, { regular: x.regular, items: x.items, line: x.line });
      }
    }

    // Никто не ждёт — ни заказа, ни блюда: время простоя (метрика sim.js) и подтяжка гостя.
    const waiting = this.seats.some(s => s.guest && !(s.guest.eating > 0));
    if (!this.closing && !waiting) { this.calm += dt; this.stats.idle += dt; } else this.calm = 0;
    if (this.cfg.tempo && !this.closing) {
      const P = PRESSURE;
      if (this.calm >= P.pullAfter && this.nextArrival - this.t > P.pullGap[1] && this.freeSeats().length) {
        this.nextArrival = this.t + this.rand(P.pullGap[0], P.pullGap[1]);
        this.calm = 0;
      }
      if (!this.rushed && this.candle() >= P.rush[0] * R.shiftSeconds) { this.rushed = true; this.emit('rush'); }
    }

    if (tut) this.nextArrival = Math.max(this.nextArrival, this.t + 3);   // в обучении — по одному
    if (this.autoArrive && !this.closing && !tut && this.t >= this.nextArrival) {
      const free = this.freeSeats();
      if (free.length) {
        const regular = this.pickRegular(), pool = this.prefer(free, regular ? 'counter' : 'table');
        const i = pool[Math.floor(this.rng() * pool.length)];
        this.seatGuest(i, { regular });
        // Поток гостей задаёт мета (FLOW, arrivalMul): растёт по ходу игры вместе с местами.
        const gap = feast ? feast.gap : this.cfg.arrivalGap;
        this.nextArrival = this.t + this.rand(gap[0], gap[1]) * this.cfg.arrivalMul * this.tempoMul();
      }
    }

    this.seats.forEach((seat, i) => {
      const g = seat.guest;
      if (!g) return;
      if (g.eating > 0) {
        g.eating -= dt;
        if (g.eating <= 0) this.leave(i, false);
        return;
      }
      if (!g.tutorial) g.patience -= dt * (1 - this.cfg.staff.slow);
      if (g.patience <= 0) { g.patience = 0; this.leave(i, true); }
    });

    this.cookers.forEach((c, i) => {
      if (!c.item || c.item === 'burnt') return;
      const def = COOKERS[c.station], cook = this.cookTime(c.station);
      const was = this.phaseOf(i).phase;
      c.t += dt;
      // Не перевернул вовремя — нижняя сторона сгорела. Не помешал — похлёбка пригорела, но варится.
      if (c.station === 'hearth' && c.item === def.from && !c.side && c.t >= cook / 2 + this.flipTime()) {
        c.item = 'burnt'; this.breakStreak(); this.emit('burnt', { slot: i, station: c.station }); return;
      }
      if (c.station === 'cauldron' && c.item === def.from && !c.stirred && !c.scorched && c.t >= cook * KITCHEN.stirAt + KITCHEN.stirWindow) {
        c.scorched = true; this.emit('scorch', { slot: i });
      }
      const now = this.phaseOf(i).phase;
      if (now !== was && (now === 'flip' || now === 'stir')) this.emit('ask', { slot: i, what: now });
      if (c.item === def.from && c.t >= cook && (c.station !== 'hearth' || c.side)) { c.item = def.to; this.emit('ready', { slot: i, station: c.station }); }
      if (c.item === def.to && c.t >= cook + this.readyTime(c.station)) { c.item = 'burnt'; this.breakStreak(); this.emit('burnt', { slot: i, station: c.station }); }
    });

    this.updateStaff(dt);

    const b = this.barrel;
    if (b.pouring) {
      b.fill += dt / this.cfg.pourSeconds;
      if (b.by && b.fill >= this.cfg.staff.pour) {
        Object.assign(b, { pouring: false, by: null, mug: 'full' });
        this.emit('poured', { quality: 'full', by: 'staff' });
      } else if (b.fill >= 1) { b.fill = 1; b.pouring = false; b.mug = 'spilled'; this.emit('spill'); }
    }

    if (this.closing && this.seats.every(s => !s.guest) && !this.cfg.scripted.length) this.finish();
  }

  // Множитель паузы между гостями по доле свечи: разогрев, обычный ход, наплыв.
  tempoMul() {
    if (!this.cfg.tempo) return 1;
    const f = this.candle() / this.rules.shiftSeconds, { warm, rush } = PRESSURE;
    return f >= warm[0] && f < warm[1] ? warm[2] : f >= rush[0] && f < rush[1] ? rush[2] : 1;
  }

  // Несобранные монеты — в кассу сами: теряется только место, не деньги (спека, «Смена»).
  autoCollect(i) {
    const seat = this.seats[i];
    this.stats.coins += seat.dirty;
    this.stats.autoCollected += seat.dirty;
    seat.dirty = 0;
  }

  finish() {
    this.over = true;
    this.seats.forEach((seat, i) => { if (seat.dirty) this.autoCollect(i); });
    this.emit('over');
  }

  summary() {
    const f = this.cfg.feast;
    return {
      ...this.stats, riddles: { ...this.stats.riddles }, stars: { ...this.stats.stars }, t: this.t, arrived: this.arrived, met: [...this.met],
      stockLeft: { ...this.stock }, used: { ...this.used }, fed: [...this.fed], tutorial: this.cfg.tutorial.length === 0 && this.seats.every(s => !s.guest?.tutorial),
      feast: f ? { id: f.id, guests: f.guests, goal: f.goal } : null,
    };
  }
}
