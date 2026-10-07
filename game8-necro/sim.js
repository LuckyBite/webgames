// Боевая модель. Чистая логика: ни DOM, ни WebGL, ни спрайтов.
// Тик принимает состояние и возвращает события — рендер их проигрывает.
// Тот же файл гоняют node-тесты и симулятор баланса.

import { UNDEAD, HEROES, SCHOOLS, circleMod, TICK_HZ, TUNING } from './data.js';
import { SPELL_DEFS, deckMods, freshDeck } from './cards.js';

// Сила стороны одной цифрой. Нужна и балансу, и правилу «сложность относительна»:
// трудно не на ярусе N, а когда твоя армия до этого яруса ещё не доросла.
export const unitPower = u => (u.maxHp * u.atk) / u.period;
export const sidePower = arr => arr.reduce((a, u) => a + unitPower(u), 0);

const STEP = 1 / TICK_HZ;

/* ═══════════════ Детерминированный RNG ═══════════════ */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let uidSeq = 1;

/* ═══════════════ Создание юнитов ═══════════════ */
export function starMul(stars) { return 1 + TUNING.starStep * (stars - 1); }

// cards — модификаторы колоды (deckMods из cards.js): школа юнита берёт свои множители
export function makeUndead(defId, stars = 1, slot = 0, mods = null, cards = null) {
  const d = UNDEAD[defId];
  const m = starMul(stars);
  const sc = cards ? cards.school[d.school] : null;
  const hm = m * (mods ? mods.hpMul : 1) * (sc ? sc.hpMul : 1);
  const am = m * (mods ? mods.atkMul : 1) * (sc ? sc.atkMul : 1);
  return {
    uid: uidSeq++, side: 'undead', defId, name: d.name, sprite: d.sprite,
    school: d.school, row: d.row, slot, stars, tier: d.tier,
    maxHp: Math.round(d.hp * hm), hp: Math.round(d.hp * hm),
    atk: Math.round(d.atk * am), armor: d.armor || 0, period: d.period,
    poison: d.poison || 0, splash: d.splash || 0,
    heal: d.heal ? Math.round(d.heal * m) : 0,
    ignoreArmor: !!d.ignoreArmor,
    thorns: Math.max(d.thorns || 0, cards && d.school === 'bone' ? cards.boneThorns : 0),
    poisonPct: cards && d.school === 'rot' ? cards.rotPoison : 0,
    pierce: d.ignoreArmor ? 1 : (cards && d.school === 'soul' ? cards.soulPierce : 0),
    speedMul: 1 + (cards && d.school === 'soul' ? cards.soulSpeed : 0),
    blast: cards && d.school === 'dust' ? cards.dustBlast : 0,
    shield: 0, shieldT: 0,
    hitsBackRow: !!d.hitsBackRow, deathSpawn: d.deathSpawn || null,
    timer: d.period, alive: true, poisonT: 0, poisonDps: 0,
  };
}

export function makeHero(entry, slot) {
  const d = entry.def, s = entry.scale || 1;
  return {
    uid: uidSeq++, side: 'heroes', defId: d.id, name: d.name, sprite: d.sprite,
    school: d.school, row: d.row, slot, champion: !!entry.champion,
    maxHp: Math.round(d.hp * s), hp: Math.round(d.hp * s),
    atk: Math.round(d.atk * s), armor: d.armor || 0, period: d.period,
    heal: d.heal ? Math.round(d.heal * s) : 0, aura: d.aura || 0, splash: d.splash || 0,
    timer: d.period, alive: true, poisonT: 0, poisonDps: 0,
  };
}

/* ═══════════════ Бой ═══════════════ */
// mods — следствия гримуара (grimoireMods из data.js), cards — колоды (deckMods из
// cards.js); без них бой идёт по базе: один шквал, никаких пассивок
export function newBattle(armyDefs, partyEntries, seed, mods = null, cards = null) {
  const M = { hpMul: 1, atkMul: 1, spellMul: 1, cdMul: 1, ...(mods || {}) };
  const K = cards || deckMods(freshDeck());
  const undead = armyDefs
    .map((a, i) => (a ? makeUndead(a.defId, a.stars, i, M, K) : null))
    .filter(Boolean);
  const heroes = partyEntries.map((e, i) => makeHero(e, i));

  // Аура паладина — разовая прибавка брони переднему ряду союзников.
  for (const h of heroes) {
    if (!h.aura) continue;
    for (const o of heroes) if (o !== h && o.row === 'front') o.armor += h.aura;
  }

  return {
    t: 0, acc: 0, rng: makeRng(seed >>> 0), mods: M,
    undead, heroes, enrage: 1,
    cards: K, spells: K.spells.slice(), spellCds: Object.fromEntries(K.spells.map(id => [id, 0])),
    curseT: 0, stunT: 0, frenzy: { undead: 0, heroes: 0 },
    over: null,
  };
}

const living = arr => arr.filter(u => u.alive);

function pickTarget(state, attacker) {
  const foes = living(attacker.side === 'undead' ? state.heroes : state.undead);
  if (!foes.length) return null;
  // Жнец бьёт задний ряд врага — единственный способ достать жреца, пока стоит стена
  if (attacker.hitsBackRow) {
    const back = foes.filter(f => f.row === 'back');
    if (back.length) return back.reduce((a, b) => (a.slot <= b.slot ? a : b));
  }
  if (attacker.row === 'front') {
    const front = foes.filter(f => f.row === 'front');
    const pool = front.length ? front : foes;
    return pool.reduce((a, b) => (a.slot <= b.slot ? a : b));
  }
  // задний ряд бьёт слабейшего по текущему HP, при равенстве — меньший слот
  return foes.reduce((a, b) => (b.hp < a.hp || (b.hp === a.hp && b.slot < a.slot) ? b : a));
}

/* Всё, что происходит при гибели, в одном месте. Раньше смерть разбиралась в трёх
   местах (удар, шипы, яд), и новая реакция на смерть забывалась бы в одном из них. */
function kill(state, u, events, extra = {}) {
  u.hp = 0; u.alive = false;
  events.push({ type: 'death', uid: u.uid, side: u.side, school: u.school, ...extra });
  if (u.side === 'undead') {
    // Гнилой громила оставляет после себя Ходячий труп
    if (u.deathSpawn) {
      const spawn = makeUndead(u.deathSpawn, 1, u.slot, state.mods, state.cards);
      spawn.spawned = true;         // панель армии не путает его с хозяином слота
      state.undead.push(spawn);
      events.push({ type: 'spawn', uid: spawn.uid, side: 'undead' });
    }
    // «Прах к праху»: павший проклятый бьёт всех живых героев
    if (u.blast) for (const h of living(state.heroes)) damage(state, u, h, u.atk * u.blast, events, 'blast');
  } else if (state.cards.rotFeast) {
    // «Пир»: смерть героя лечит живых гнилых
    for (const a of living(state.undead)) {
      if (a.school !== 'rot') continue;
      const amount = Math.min(Math.round(a.maxHp * state.cards.rotFeast), a.maxHp - a.hp);
      if (amount > 0) { a.hp += amount; events.push({ type: 'heal', uid: a.uid, amount }); }
    }
  }
}

function damage(state, from, to, raw, events, kind = 'hit') {
  // Фантом проходит сквозь броню целиком, «Сквозь доспех» частью
  const pierce = from.ignoreArmor ? 1 : (from.pierce || 0);
  const armor = to.armor * (1 - pierce);
  // Разброс ±jitter от rng боя: повторы отличаются, но прогон с тем же сидом точен
  const spread = 1 - TUNING.jitter + state.rng() * 2 * TUNING.jitter;
  // «Проклятие»: герои под ним получают на 30% больше
  const vuln = to.side === 'heroes' && state.curseT > 0 ? 1.3 : 1;
  let dmg = Math.max(1, Math.round(raw * spread * state.enrage * vuln * circleMod(from.school, to.school) - armor));
  // «Костяная стена»: щит съедает урон первым
  let absorbed = 0;
  if (to.shield > 0) { absorbed = Math.min(to.shield, dmg); to.shield -= absorbed; dmg -= absorbed; }
  to.hp -= dmg;
  const killed = to.hp <= 0 && to.alive;
  // mod уходит наружу, чтобы рендер показал преимущество круга школ, а не только цифру
  events.push({ type: kind, from: from.uid, to: to.uid, dmg, absorbed, killed,
                school: from.school, mod: circleMod(from.school, to.school) });
  if (killed) kill(state, to, events);
  // Лич-прислужник и «Осколки» возвращают часть полученного урона в лицо ударившему
  if (to.thorns && dmg > 0 && from.uid && from.alive) {
    const back = Math.max(1, Math.round(dmg * to.thorns));
    from.hp -= back;
    events.push({ type: 'thorns', from: to.uid, to: from.uid, dmg: back, killed: from.hp <= 0 });
    if (from.hp <= 0 && from.alive) kill(state, from, events);
  }
  return killed;
}

function act(state, u, events) {
  // «Вой»: оглушённые герои пропускают ход целиком, и удар, и лечение
  if (u.side === 'heroes' && state.stunT > 0) return;
  const allies = u.side === 'undead' ? state.undead : state.heroes;

  // Жрец лечит слабейшего союзника, если есть кого лечить
  // Лечит только по-настоящему раненых: иначе целитель бесконечно подливает по капле
  // тому, кто и так почти цел, и бой перестаёт сходиться в принципе
  if (u.heal) {
    const hurt = living(allies).filter(a => a.hp < a.maxHp * TUNING.healBelow);
    if (hurt.length) {
      const t = hurt.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a));
      const amount = Math.min(u.heal, t.maxHp - t.hp);
      t.hp += amount;
      events.push({ type: 'heal', uid: t.uid, amount });
      return;
    }
  }

  const target = pickTarget(state, u);
  if (!target) return;

  damage(state, u, target, u.atk, events);

  // Яд: свой у Чумного носителя и «Заразные удары» у всей гнилой нежити
  const dps = Math.max(u.poison || 0, u.atk * (u.poisonPct || 0));
  if (dps && target.alive) {
    // max только с действующим ядом: сила давно кончившегося не должна вернуться
    target.poisonDps = target.poisonT > 0 ? Math.max(target.poisonDps, dps) : dps;
    target.poisonT = Math.max(target.poisonT, 3);
  }

  // Колдун задевает соседей
  if (u.splash) {
    const foes = living(u.side === 'undead' ? state.heroes : state.undead)
      .filter(f => f.uid !== target.uid).slice(0, u.splash);
    for (const f of foes) damage(state, u, f, u.atk * 0.6, events, 'splash');
  }
}

function step(state, events) {
  state.t += STEP;
  // Эскалация урона после enrageAt: любой бой сходится, пата не существует
  state.enrage = 1 + Math.max(0, state.t - TUNING.enrageAt) / TUNING.enragePer;
  for (const id in state.spellCds) if (state.spellCds[id] > 0) state.spellCds[id] = Math.max(0, state.spellCds[id] - STEP);
  if (state.curseT > 0) state.curseT = Math.max(0, state.curseT - STEP);
  if (state.stunT > 0) state.stunT = Math.max(0, state.stunT - STEP);
  for (const side of ['undead', 'heroes']) {
    if (state.frenzy[side] > 0) state.frenzy[side] = Math.max(0, state.frenzy[side] - STEP);
  }

  const all = [...state.undead, ...state.heroes];

  // Яд тикает до атак, чтобы отравленный мог умереть, не успев ударить
  for (const u of all) {
    if (!u.alive) continue;
    // Щит «Костяной стены» живёт 6 секунд, неистраченный сгорает
    if (u.shieldT > 0) { u.shieldT -= STEP; if (u.shieldT <= 0) { u.shieldT = 0; u.shield = 0; } }
    if (u.poisonT <= 0) continue;
    u.poisonT = Math.max(0, u.poisonT - STEP);
    u.hp -= u.poisonDps * STEP;
    // Кончившийся яд забывает силу: иначе слабый удар продлевал бы давно ушедшую чуму
    if (u.poisonT <= 0) u.poisonDps = 0;
    if (u.hp <= 0) kill(state, u, events, { poison: true });
  }

  for (const u of all) {
    if (!u.alive) continue;
    const speed = (state.frenzy[u.side] > 0 ? 1.5 : 1) * (u.speedMul || 1);
    u.timer -= STEP * speed;
    if (u.timer <= 0) { u.timer += u.period; act(state, u, events); }
  }

  if (!living(state.heroes).length) state.over = 'undead';
  else if (!living(state.undead).length) state.over = 'heroes';
  if (state.over) events.push({ type: 'end', winner: state.over });
}

// Реальное время → фиксированные шаги. Возвращает события за кадр.
export function tick(state, dt) {
  const events = [];
  if (state.over) return events;
  state.acc += Math.min(dt, 0.5);          // защита от прыжка после сворачивания вкладки
  let guard = 0;
  while (state.acc >= STEP && !state.over && guard++ < 20) {
    state.acc -= STEP;
    step(state, events);
  }
  return events;
}

/* ═══════════════ Заклинания некроманта ═══════════════
   У каждого своя перезарядка (решение пользователя 2026-10-07). Сила считается от
   атаки сильнейшего живого слуги: заклинания растут вместе с армией. */
export function spellCooldown(state, id) {
  const base = id === 'bolt' ? state.cards.boltCd : SPELL_DEFS[id].cd;
  return base * state.mods.cdMul * state.cards.cdMul;
}

// Реклама «Перезарядить»: все кнопки разом готовы
export function resetCooldowns(state) {
  for (const id in state.spellCds) state.spellCds[id] = 0;
}

export function castSpell(state, id) {
  const events = [];
  if (state.over || !state.spells.includes(id) || state.spellCds[id] > 0) return events;
  const alive = living(state.undead);
  const mul = state.mods.spellMul;                 // «Тёмное знание» из гримуара
  const best = alive.reduce((m, u) => Math.max(m, u.atk), 0);
  const caster = { uid: 0, school: null, side: 'undead' };

  if (id === 'bolt') {
    for (const h of living(state.heroes)) damage(state, caster, h, best * 1.5 * mul * state.cards.boltMul, events, 'spell');
  } else if (id === 'wall') {
    for (const u of alive) { u.shield = Math.round(u.maxHp * 0.3 * mul); u.shieldT = 6; }
  } else if (id === 'rise') {
    const fallen = state.undead.filter(u => !u.alive);
    if (fallen.length) {
      // Сильнейший из павших, а не первый по списку: игрок ждёт от кнопки лучшего
      const u = fallen.reduce((a, b) => (unitPower(b) > unitPower(a) ? b : a));
      u.alive = true; u.hp = Math.round(u.maxHp * Math.min(1, 0.5 * mul)); u.timer = u.period;
      events.push({ type: 'rise', uid: u.uid });
    } else {
      for (const u of alive) {
        const amount = Math.min(Math.round(u.maxHp * 0.3 * mul), u.maxHp - u.hp);
        if (amount > 0) { u.hp += amount; events.push({ type: 'heal', uid: u.uid, amount }); }
      }
    }
  } else if (id === 'plague') {
    // За 5 секунд яд даёт суммарно 2 × атаку сильнейшего
    const dps = best * 2 * mul / 5;
    for (const h of living(state.heroes)) { h.poisonDps = h.poisonT > 0 ? Math.max(h.poisonDps, dps) : dps; h.poisonT = 5; }
  } else if (id === 'frenzy') {
    state.frenzy.undead = 5 * mul;
  } else if (id === 'howl') {
    state.stunT = 2 * mul;
  } else if (id === 'curse') {
    state.curseT = 8 * mul;
  } else if (id === 'drain') {
    const foes = living(state.heroes);
    if (foes.length) damage(state, caster, foes.reduce((a, b) => (b.hp > a.hp ? b : a)), best * 4 * mul, events, 'spell');
  } else {
    return events;
  }

  state.spellCds[id] = spellCooldown(state, id);
  events.push({ type: 'spell', id });
  if (!living(state.heroes).length) { state.over = 'undead'; events.push({ type: 'end', winner: 'undead' }); }
  return events;
}

/* ═══════════════ Ритуал ═══════════════ */
// Выбор по нормализованным весам: {ключ: доля}.
export function weightedPick(rng, weights) {
  let r = rng(), acc = 0;
  const keys = Object.keys(weights);
  for (const k of keys) { acc += weights[k]; if (r <= acc) return k; }
  return keys[keys.length - 1];
}

export function findById(state, uid) {
  return state.undead.find(u => u.uid === uid) || state.heroes.find(u => u.uid === uid) || null;
}
