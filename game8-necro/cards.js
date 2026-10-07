// Карточки некроманта: древо развития внутри забега.
// Спека: docs/superpowers/specs/2026-10-07-necro-card-tree-design.md.
//
// Чистые данные и правила, без DOM: их гоняют игра, node-тесты и симулятор баланса.
// Ветки — четыре школы нежити (решение пользователя): карточка школы усиливает её
// нежить, а «путь школы» делает её чаще в ритуале. Так выбор карточек и выбор, кого
// поднимать, становятся одним решением.

import { SCHOOL_IDS } from './data.js';

export const MAX_SPELLS = 4;

// cd — секунды до следующего каста; у каждого заклинания своя (решение пользователя)
export const SPELL_DEFS = {
  bolt:   { school: null,   cd: 10 },
  wall:   { school: 'bone', cd: 20 },
  rise:   { school: 'rot',  cd: 15 },
  plague: { school: 'rot',  cd: 16 },
  frenzy: { school: 'soul', cd: 18 },
  howl:   { school: 'soul', cd: 20 },
  curse:  { school: 'dust', cd: 20 },
  drain:  { school: 'dust', cd: 12 },
};

export const CARDS = [
  { id: 'wall',       school: 'bone', kind: 'spell',   spell: 'wall',   max: 1 },
  { id: 'boneHp',     school: 'bone', kind: 'passive', max: 3 },
  { id: 'boneThorns', school: 'bone', kind: 'passive', max: 3 },
  { id: 'boltUp',     school: 'bone', kind: 'upgrade', spell: 'bolt',   max: 2 },
  { id: 'rise',       school: 'rot',  kind: 'spell',   spell: 'rise',   max: 1 },
  { id: 'plague',     school: 'rot',  kind: 'spell',   spell: 'plague', max: 1 },
  { id: 'rotPoison',  school: 'rot',  kind: 'passive', max: 3 },
  { id: 'rotFeast',   school: 'rot',  kind: 'passive', max: 3 },
  { id: 'frenzy',     school: 'soul', kind: 'spell',   spell: 'frenzy', max: 1 },
  { id: 'howl',       school: 'soul', kind: 'spell',   spell: 'howl',   max: 1 },
  { id: 'soulPierce', school: 'soul', kind: 'passive', max: 2 },
  { id: 'soulSpeed',  school: 'soul', kind: 'passive', max: 3 },
  { id: 'curse',      school: 'dust', kind: 'spell',   spell: 'curse',  max: 1 },
  { id: 'drain',      school: 'dust', kind: 'spell',   spell: 'drain',  max: 1 },
  { id: 'dustCd',     school: 'dust', kind: 'passive', max: 3 },
  { id: 'dustBlast',  school: 'dust', kind: 'passive', max: 2 },
];

// Значение ранга: RANKS[id][ранг − 1]. Цифры из спеки, правятся только там и здесь
export const RANKS = {
  boneHp: [0.20, 0.40, 0.60], boneThorns: [0.15, 0.25, 0.35], boltUp: [0.4, 0.8],
  rotPoison: [0.15, 0.25, 0.35], rotFeast: [0.10, 0.15, 0.20],
  soulPierce: [0.5, 1], soulSpeed: [0.15, 0.25, 0.35],
  dustCd: [0.10, 0.18, 0.25], dustBlast: [0.5, 1],
};

// Путь школы: [сколько взятий нужно, прибавка к здоровью и атаке]; старший порог первым
const PATH_STEPS = [[6, 0.30], [3, 0.15]];

const byId = Object.fromEntries(CARDS.map(c => [c.id, c]));
export const cardById = id => byId[id] || null;

export function freshDeck() {
  return { picks: {}, spells: ['bolt'], taken: [] };
}

// Сейв — данные снаружи: берём только известное и в допустимых пределах
export function sanitizeDeck(raw) {
  const d = freshDeck();
  if (!raw || typeof raw !== 'object') return d;
  if (raw.picks && typeof raw.picks === 'object') {
    for (const [id, r] of Object.entries(raw.picks)) {
      const c = byId[id];
      if (!c) continue;
      const rank = Math.min(c.max, Math.max(0, r | 0));
      if (rank) d.picks[id] = rank;
    }
  }
  if (Array.isArray(raw.spells)) {
    const sp = [...new Set(raw.spells.filter(id => SPELL_DEFS[id]))].slice(0, MAX_SPELLS);
    // Пустой список заклинаний — битый сейв: без кнопок игрок остался бы без рук
    d.spells = sp.length ? sp : ['bolt'];
  }
  if (raw.again && typeof raw.again === 'object') {
    for (const [id, r] of Object.entries(raw.again)) {
      const n = Math.min(50, Math.max(0, r | 0));
      if (byId[id]?.kind === 'spell' && d.picks[id] && n) (d.again = d.again || {})[id] = n;
    }
  }
  if (Array.isArray(raw.taken)) d.taken = raw.taken.filter(k => typeof k === 'string').slice(-200);
  return d;
}

export const rankOf = (deck, id) => deck.picks[id] || 0;

// Каждое взятие, включая повышение ранга, — карточка своей школы
export function schoolCount(deck, school) {
  let n = 0;
  for (const [id, r] of Object.entries(deck.picks)) if (byId[id]?.school === school) n += r;
  // Повторные взятия заклинания после его замены: ранг упёрся в 1, а взятие всё равно в счёт
  for (const [id, r] of Object.entries(deck.again || {})) if (byId[id]?.school === school) n += r;
  return n;
}

export function pathBonus(deck, school) {
  const n = schoolCount(deck, school);
  for (const [need, bonus] of PATH_STEPS) if (n >= need) return bonus;
  return 0;
}

export function canOffer(deck, c) {
  if (c.kind === 'spell') return !deck.spells.includes(c.spell);
  if (c.kind === 'upgrade') return deck.spells.includes(c.spell) && rankOf(deck, c.id) < c.max;
  return rankOf(deck, c.id) < c.max;
}

/* Три карточки, по возможности из трёх разных школ: выбор между ветками, а не между
   тремя вариантами одной. Если открытых школ меньше трёх, добираем из оставшегося. */
export function offerCards(deck, rng, n = 3) {
  const open = CARDS.filter(c => canOffer(deck, c));
  const schools = SCHOOL_IDS.filter(s => open.some(c => c.school === s));
  for (let i = schools.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [schools[i], schools[j]] = [schools[j], schools[i]];
  }
  const out = [];
  for (const s of schools.slice(0, n)) {
    const pool = open.filter(c => c.school === s);
    out.push(pool[Math.floor(rng() * pool.length)].id);
  }
  const rest = open.filter(c => !out.includes(c.id));
  while (out.length < n && rest.length) out.push(rest.splice(Math.floor(rng() * rest.length), 1)[0].id);
  return out;
}

export function needsReplace(deck, cardId) {
  const c = byId[cardId];
  return !!c && c.kind === 'spell' && deck.spells.length >= MAX_SPELLS;
}

/* Взять карточку. Заклинание при полных слотах требует replaceSpell — какое
   заклинание уходит; без него карточка не берётся (false), и игрок может выбрать
   другую из трёх. Отметку «за эту партию взято» ставит вызывающий (markTaken). */
export function applyCard(deck, cardId, replaceSpell = null) {
  const c = byId[cardId];
  if (!c || !canOffer(deck, c)) return false;
  if (c.kind === 'spell') {
    if (deck.spells.length < MAX_SPELLS) deck.spells.push(c.spell);
    else {
      const at = deck.spells.indexOf(replaceSpell);
      if (at < 0) return false;
      deck.spells[at] = c.spell;
    }
  }
  // Заклинание, ушедшее при замене, можно взять снова: ранг уже 1, поэтому взятие
  // для пути школы копим отдельно, иначе карточка за партию ушла бы впустую
  if (c.kind === 'spell' && rankOf(deck, cardId) >= c.max) {
    deck.again = deck.again || {};
    deck.again[cardId] = (deck.again[cardId] || 0) + 1;
  }
  deck.picks[cardId] = Math.min(c.max, rankOf(deck, cardId) + 1);
  return true;
}

// Ключ — «ярус:партия» или 'start' (узел гримуара «Первая карточка»)
export function markTaken(deck, key) { if (!deck.taken.includes(key)) deck.taken.push(key); }
export const isTaken = (deck, key) => deck.taken.includes(key);

const val = (deck, id) => { const r = rankOf(deck, id); return r ? RANKS[id][r - 1] : 0; };

/* Всё, что колода значит для боя, одним плоским объектом. sim.js не знает про
   карточки: он получает только эти числа. */
export function deckMods(deck) {
  const school = {};
  const ritualBonus = {};
  for (const s of SCHOOL_IDS) {
    const p = pathBonus(deck, s);
    school[s] = { hpMul: (1 + p) * (s === 'bone' ? 1 + val(deck, 'boneHp') : 1), atkMul: 1 + p };
    if (p > 0) ritualBonus[s] = 1;
  }
  return {
    school, ritualBonus, spells: deck.spells.slice(),
    boneThorns: val(deck, 'boneThorns'),
    rotPoison: val(deck, 'rotPoison'),
    rotFeast: val(deck, 'rotFeast'),
    soulPierce: val(deck, 'soulPierce'),
    soulSpeed: val(deck, 'soulSpeed'),
    dustBlast: val(deck, 'dustBlast'),
    cdMul: 1 - val(deck, 'dustCd'),
    boltMul: 1 + val(deck, 'boltUp'),
    boltCd: rankOf(deck, 'boltUp') >= 2 ? 7 : SPELL_DEFS.bolt.cd,
  };
}
