// «Таверна у края Хмари» — мета между сменами: день, монеты, слава, улучшения, рецепты,
// склад редких продуктов, походы искателей. Чистый модуль: время приходит параметром
// (`now`, мс), поэтому поход при закрытой игре — это просто большой `now` при загрузке.
// Главы, сцены и пир — в story.js: мета зовёт его при настройке и итоге смены.

import { DISHES, UPGRADES, ROUTES, SEEKERS, PANTRY, RARE, META, RULES, FINDS, STAFF, FLOW, PRESSURE, GOODS, GOODS_PER_DAY } from './data.js';
import { mulberry32 } from './shift.js';
import { storyGuests, feastSetup, applyFeast, riddlesOn, skyOf, SCENES } from './story.js';

const byId = (list, id) => list.find(x => x.id === id);

export function newGame() {
  return {
    v: 2,
    day: 1,
    coins: 0,
    fame: 0,
    owned: {},      // купленные улучшения
    recipes: {},    // купленные рецепты
    known: {},      // какие редкие продукты уже приходили
    stock: {},      // склад редких продуктов
    // joined — искатель пришёл по сюжету; до этого его карточка пустая и в поход он не ходит.
    seekers: Object.fromEntries(SEEKERS.map(s => [s.id, {
      joined: false, state: 'home', route: null, sentAt: 0, returnAt: 0, fed: false, fedOnTrip: false, trips: 0, loot: null, find: null,
    }])),
    // Помощники: joined — нанят сценой; day — в какой день (бард считает от него долг).
    staff: Object.fromEntries(STAFF.map(s => [s.id, { joined: false, day: 0 }])),
    // История: глава, с какого дня она идёт, флаги (открытые маршруты, находки, пройденные
    // главы), показанные сцены, неудачные попытки пира текущей главы.
    story: { chapter: 1, chapterAt: 1, flags: {}, seen: {}, feastTries: 0 },
    last: null,     // итог прошлой смены
  };
}

// Что дают купленные улучшения: места и слоты — максимумом, бонусы — суммой.
const SUMMED = new Set(['patienceBonus', 'tipBonus', 'hearthFaster', 'roastBonus', 'cauldronFaster', 'pourFaster', 'pourEasier', 'aleBonus', 'brothBonus', 'chopsLess']);
// Ступень потока: сколько помощников нанято (FLOW).
export function flowOf(state) {
  return FLOW[Math.min(FLOW.length - 1, STAFF.filter(st => state.staff[st.id]?.joined).length)];
}

// Места и поток — от ступени; прибавки к ценам — от ступеней улучшений и помощников.
export function effects(state) {
  const e = {
    seats: flowOf(state).seats, hearthSlots: RULES.hearthSlots, cauldronSlots: 0, patienceBonus: 0, tipBonus: 0,
    hearthFaster: 0, roastBonus: 0, cauldronFaster: 0, pourFaster: 0, pourEasier: 0, aleBonus: 0, brothBonus: 0, chopsLess: 0,
  };
  const add = apply => { for (const [k, v] of Object.entries(apply)) e[k] = SUMMED.has(k) ? e[k] + v : Math.max(e[k], v); };
  for (const u of UPGRADES) if (state.owned[u.id]) add(u.apply);
  for (const st of STAFF) if (st.bonus && state.staff[st.id]?.joined) add(st.bonus);
  return e;
}

// Что помощники делают в смене (shift.js cfg.staff).
export function staffEffects(state) {
  const e = { clear: 0, pour: 0, fire: 0, slow: 0 };
  for (const st of STAFF) if (state.staff[st.id]?.joined) Object.assign(e, st.apply);
  return e;
}

// Команда: кто нанят, жалованье, сколько смен бард ещё отрабатывает долг.
export function staffList(state) {
  return STAFF.filter(st => state.staff[st.id]?.joined).map(st => ({
    id: st.id, name: st.name, wage: st.wage,
    debt: st.debtDays ? Math.max(0, st.debtDays - (state.day - state.staff[st.id].day)) : 0,
  }));
}

// Жалованье за сегодняшнюю смену: всем нанятым, кроме тех, кто отрабатывает долг.
export function wagesDue(state) {
  return staffList(state).reduce((sum, st) => sum + (st.debt > 0 ? 0 : st.wage), 0);
}

export function menu(state) {
  return Object.keys(DISHES).filter(id => !DISHES[id].recipe || state.recipes[id]);
}

// Кладовая: базовые ящики всегда, редкие — после первого появления продукта.
export function pantryIds(state) {
  return [...PANTRY, ...RARE.filter(id => state.known[id])];
}

// Купленный декор — его рисуют зал и сцены.
export function decorOf(state) {
  return UPGRADES.filter(u => u.decor && state.owned[u.id]).map(u => u.id);
}

// Обучающие гости первого дня (до Грума): по одному блюду на каждое новое действие.
export const TUTORIAL = [
  { race: 'human', items: ['ale'] },
  { race: 'dwarf', items: ['bread_cheese'] },
];

// Давление главы: пауза между гостями и размер заказа (PRESSURE); после финала — как в главе 5.
export function pressureOf(state) {
  const P = PRESSURE.chapters;
  return P[Math.min(P.length, Math.max(1, state.story.chapter)) - 1];
}

// В пир гости терпеливее после каждой неудачной попытки (feast.ease).
export function shiftSetup(state) {
  const e = effects(state), feast = feastSetup(state), p = pressureOf(state);
  // Первый день — обучение: эль, хлеб с сыром, потом Грум со жарким (его сюжетный визит).
  const learn = state.day === 1 && !state.story.flags.tutorial;
  const scripted = storyGuests(state);
  const tutorial = learn ? [...TUTORIAL.map(x => ({ ...x, items: [...x.items] })), ...scripted.map(x => ({ items: x.items, regular: x.regular, line: x.line }))] : [];
  return {
    ...e,
    arrivalGap: p.gap,
    orderItems: p.items,
    tempo: !learn,
    tutorial,
    patienceBonus: e.patienceBonus + (feast ? feast.ease : 0),
    arrivalMul: flowOf(state).gap,
    menu: menu(state),
    stock: { ...state.stock },
    regulars: SEEKERS
      .filter(s => state.seekers[s.id].joined && state.seekers[s.id].state === 'home')
      .map(s => ({ id: s.id, race: s.race, seed: s.seed, favorite: s.favorite })),
    decor: decorOf(state),
    staff: staffEffects(state),
    scripted: learn ? [] : scripted,
    feast,
    riddles: riddlesOn(state),
    sky: skyOf(state),
  };
}

// Итог смены — в состояние. Слава не уходит ниже нуля: открытое славой не закрывается.
// Жалованье — за каждую смену, касса в минус не уходит. Возвращает итог пира (null —
// обычный день) и жалованье — для отчёта.
export function applyShift(state, sum) {
  const wages = wagesDue(state);
  state.coins = Math.max(0, state.coins + sum.coins - wages);
  state.fame = Math.max(0, state.fame + sum.fame);
  state.stock = { ...sum.stockLeft };
  for (const id of sum.fed || []) if (state.seekers[id]) state.seekers[id].fed = true;
  for (const id of sum.met || []) state.story.flags['met_' + id] = true;
  const feast = applyFeast(state, sum);
  if (sum.tutorial) state.story.flags.tutorial = true;
  state.last = { day: state.day, ...sum, wages };
  state.day += 1;
  return { feast, wages };
}

// С какой славы ступень продаётся.
export function unlockFame(u) {
  return u.fame || 0;
}

// Лавка: следующая ступень каждой лестницы и рецепты, продукты которых уже приходили.
// Ступень до порога славы видна с замком. Рецепт блюда со своей станцией отдельно не
// продаётся — его даёт станция. Четыре лестницы и до трёх рецептов — не больше восьми карточек.
export function shopItems(state) {
  const items = [];
  for (const u of UPGRADES) {
    if (state.owned[u.id] || (u.requires && !state.owned[u.requires]) || (u.known && !state.known[u.known])) continue;
    const locked = state.fame < (u.fame || 0);
    items.push({ kind: 'upgrade', id: u.id, name: u.name, price: u.price, fame: u.fame || 0, locked, can: !locked && state.coins >= u.price });
  }
  for (const [id, d] of Object.entries(DISHES)) {
    if (!d.recipe || d.station || state.recipes[id]) continue;
    if (!Object.keys(d.needs).every(n => state.known[n])) continue;
    items.push({ kind: 'recipe', id, name: d.name, price: d.recipe, fame: 0, locked: false, can: state.coins >= d.recipe });
  }
  items.splice(8);   // рецепт сверх восьми карточек подождёт, пока освободится место
  // торговец — на свободные места лавки (не больше восьми карточек), пока сегодня не куплено
  for (const id of goodsToday(state)) {
    if (items.length >= 8) break;
    const g = GOODS[id];
    items.push({ kind: 'goods', id, name: g.name, n: g.n, price: g.price, fame: 0, locked: false, can: state.coins >= g.price });
  }
  return items;
}

// Что торговец продаёт сегодня: два знакомых редких продукта по кругу от дня; купленное
// сегодня уже не предлагается.
export function goodsToday(state) {
  const known = Object.keys(GOODS).filter(id => state.known[id]);
  if (!known.length) return [];
  const out = [];
  for (let k = 0; k < Math.min(GOODS_PER_DAY, known.length); k++) out.push(known[(state.day + k) % known.length]);
  return out.filter(id => !(state.bought || {})[id + ':' + state.day]);
}

export function buy(state, kind, id) {
  const item = shopItems(state).find(x => x.kind === kind && x.id === id);
  if (!item || !item.can) return false;
  state.coins -= item.price;
  if (kind === 'goods') {
    state.stock[id] = (state.stock[id] || 0) + item.n;
    state.bought = { [id + ':' + state.day]: true, ...Object.fromEntries(Object.entries(state.bought || {}).filter(([k]) => k.endsWith(':' + state.day))) };
    return true;
  }
  if (kind === 'upgrade') {
    state.owned[id] = true;
    for (const r of byId(UPGRADES, id).recipes || []) state.recipes[r] = true;
  } else state.recipes[id] = true;
  return true;
}

// Маршрут открыт, когда его открыл сюжет и славы хватает; closed — чем закрыт.
export function routes(state) {
  return ROUTES.map(r => {
    const story = !r.flag || !!state.story.flags[r.flag];
    return { ...r, open: story && state.fame >= r.fame, closed: !story ? 'story' : state.fame < r.fame ? 'fame' : null };
  });
}

// Уровень искателя — от числа походов (META.levels); next — сколько походов до следующего.
export function levelOf(s) {
  const level = META.levels.filter(n => s.trips >= n).length;
  const next = META.levels[level];
  return { level, next: next === undefined ? null : next - s.trips };
}

// Дорос ли искатель до маршрута: дальние ходят только опытные.
export const canGo = (s, route) => levelOf(s).level >= (route.level || 1);

// Сытость уходит в поход вместе с искателем: следующий поход — снова кормить.
export function sendSeeker(state, seekerId, routeId, now) {
  const s = state.seekers[seekerId], r = routes(state).find(x => x.id === routeId);
  if (!s || !s.joined || s.state !== 'home' || !r || !r.open || !canGo(s, r)) return false;
  Object.assign(s, { state: 'away', route: routeId, sentAt: now, returnAt: now + r.minutes * 60000, fedOnTrip: s.fed, fed: false });
  return true;
}

function hash(str) {
  let h = 2166136261;
  for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// Добыча детерминирована: искатель, номер похода, маршрут. Перезагрузка её не перебрасывает.
// Опытный искатель приносит больше: каждый уровень сверх первого — на META.levelLoot.
export function rollLoot(seekerId, trips, routeId, fed, level = 1) {
  const r = byId(ROUTES, routeId);
  const rng = mulberry32(hash(`${seekerId}:${trips}:${routeId}`));
  const loot = {};
  for (const [id, lo, hi] of r.loot) {
    let n = lo + Math.floor(rng() * (hi - lo + 1));
    if (fed) n = Math.ceil(n * META.fedLootMul);
    if (level > 1 && n > 0) n = Math.round(n * (1 + META.levelLoot * (level - 1)));
    if (n > 0) loot[id] = n;
  }
  return loot;
}

// Кто вернулся к этому часу — с добычей в руках; забирает её игрок тапом (collect).
// Сюжетная находка — на первом возвращении нужного искателя с нужного маршрута, когда её
// глава уже идёт: находки следующих глав раньше времени не выпадают.
export function updateSeekers(state, now) {
  const back = [];
  for (const [id, s] of Object.entries(state.seekers)) {
    if (s.state !== 'away' || now < s.returnAt) continue;
    s.state = 'back';
    s.loot = rollLoot(id, s.trips, s.route, s.fedOnTrip, levelOf(s).level);
    s.find = FINDS.find(f => f.seeker === id && f.route === s.route && (f.chapter || 1) <= state.story.chapter && !state.story.flags[f.id])?.id || null;
    back.push(id);
  }
  return back;
}

export function collect(state, seekerId) {
  const s = state.seekers[seekerId];
  if (!s || s.state !== 'back') return null;
  const loot = s.loot;
  for (const [id, n] of Object.entries(loot)) {
    state.stock[id] = (state.stock[id] || 0) + n;
    state.known[id] = true;
  }
  if (s.find) state.story.flags[s.find] = true;
  Object.assign(s, { state: 'home', route: null, loot: null, find: null, trips: s.trips + 1, fedOnTrip: false });
  return loot;
}

// Отладка: сразу после главы 1 со всей командой, чтобы увидеть помощников, не играя девять
// дней. Сцены главы 1 и найма отмечены показанными (не всплывают разом), главы 2–5 идут
// дальше как обычно; долг барда отработан, славы хватает на всех помощников. Кнопка — в меню
// на локальном сервере или с ?debug=1 (main.js).
export function debugTeam(state) {
  const s = state.story;
  if (s.chapter < 2) { s.chapter = 2; s.chapterAt = state.day; }
  for (const f of ['forest', 'marsh', 'sign', 'chapter1', 'met_fiorin']) s.flags[f] = true;
  for (const sc of SCENES) if ((sc.chapter || 1) <= 1 || sc.hire) s.seen[sc.id] = true;
  s.feastTries = 0;
  for (const id of ['grum', 'sorel']) state.seekers[id].joined = true;
  const debt = Math.max(0, ...STAFF.map(st => st.debtDays || 0));
  state.day = Math.max(state.day, debt + 2);
  for (const st of STAFF) state.staff[st.id] = { joined: true, day: state.day - debt - 1 };
  state.fame = Math.max(state.fame, ...STAFF.map(st => st.fame));
}

export function save(state) { return JSON.stringify(state); }

// Чужая версия и битый текст — null: игра начнётся заново, а не упадёт. Сохранение шага 2
// (v1) тоже начинается заново — с главы 1. Искатели, добавленные в data.js позже,
// и помощники появляются и в старом сохранении.
export function load(text) {
  if (!text) return null;
  try {
    const s = JSON.parse(text);
    if (!s || s.v !== 2) return null;
    const fresh = newGame();
    for (const id of Object.keys(fresh.seekers)) if (!s.seekers?.[id]) (s.seekers ||= {})[id] = fresh.seekers[id];
    for (const id of Object.keys(fresh.staff)) if (!s.staff?.[id]) (s.staff ||= {})[id] = fresh.staff[id];
    s.story = { ...fresh.story, ...(s.story || {}) };   // поля истории, добавленные позже (chapterAt)
    return { ...fresh, ...s };
  } catch (e) {
    return null;
  }
}
