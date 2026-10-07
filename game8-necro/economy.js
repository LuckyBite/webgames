// Правила экономики: добыча останков и ритуал.
// Вынесены сюда, чтобы игра и симулятор баланса считали ОДНО И ТО ЖЕ.
// Пока эти правила жили в main.js, симулятор пришлось бы писать их копией — и любая
// правка цены расходилась бы с проверкой молча.

import { UNDEAD, UNDEAD_IDS, SCHOOL_IDS, schoolWeights, tierWeights,
         TUNING, densityCap, tierCap } from './data.js';
import { weightedPick } from './sim.js';

export function emptyRemains() {
  const r = {};
  for (const s of SCHOOL_IDS) r[s] = [0, 0, 0, 0];   // индексы 1..3 — плотности
  return r;
}

/* Контрольная точка внутри яруса. Ярус — цепочка из десяти боёв, а цепочка возводит
   шанс в степень: даже 90% на партию дают 35% на ярус, 95% дают 60%. Из-за этого
   ярус либо берётся всегда, либо не берётся никогда, и полосы, где заклинания решают
   исход, не существует в принципе. Точка на пятой партии ломает цепочку надвое и
   заодно убирает главную обиду: проигрыш перестаёт стирать весь ярус. */
export const CHECKPOINT = 5;
export const rollbackTo = partyIndex => (partyIndex > CHECKPOINT ? CHECKPOINT + 1 : 1);

// Плотность добычи: обычные партии дают обычное, пятая — густое, чемпион — кристаллы.
// Глубина может поставить потолок — см. TUNING.depthGate.
export function densityForParty(index, champion, tier = 99, rng = null) {
  let d = index === 10 ? (champion ? 3 : 2) : index === 5 ? 2 : 1;
  if (TUNING.depthGate === 'density') d = Math.min(d, densityCap(tier));
  if (TUNING.depthGate === 'rareCrystal' && d === 3 && rng && rng() > TUNING.gateCrystalChance) d = 2;
  return d;
}

// Останки падают по школе УБИТОГО ГЕРОЯ, а не по школе яруса.
// mods — гримуар: lootMul («Богатая жатва») добрасывает лишний останок с вероятностью
// дробной части, denseChance («Тлен») поднимает обычный до густого.
export function awardRemains(remains, party, partyIndex, tier = 99, rng = null, mods = null) {
  const got = {};
  const lootMul = mods ? mods.lootMul : 1;
  const dense = mods ? mods.denseChance : 0;
  for (const entry of party) {
    const s = entry.def.school;
    let d = densityForParty(partyIndex, entry.champion, tier, rng);
    if (d === 1 && dense > 0 && rng && rng() < dense) d = 2;
    let n = Math.floor(lootMul) + (rng && rng() < lootMul % 1 ? 1 : 0);
    remains[s][d] += n;
    got[s] = (got[s] || 0) + n;
  }
  return got;
}

// Один ритуал: школа по весам набора, тир по сумме плотностей.
// bonus — путь школы из колоды ({ school: 1 }): школа весит так, будто в круге лишний
// её останок. На тир он не влияет: плотность приносят только настоящие останки.
export function rollRitual(rng, slots, tier = 99, bonus = null) {
  const weighted = bonus
    ? slots.concat(Object.entries(bonus).flatMap(([s, n]) => Array.from({ length: n }, () => ({ school: s, density: 0 }))))
    : slots;
  const school = weightedPick(rng, schoolWeights(weighted));
  const sum = slots.reduce((a, s) => a + s.density, 0);
  const tw = tierWeights(sum);
  const total = tw.reduce((a, b) => a + b, 0);
  const norm = {};
  tw.forEach((w, i) => { if (w > 0) norm[i + 1] = w / total; });
  let t = Number(weightedPick(rng, norm));
  if (TUNING.depthGate === 'tierCap') t = Math.min(t, tierCap(tier));
  const defId = UNDEAD_IDS.find(id => UNDEAD[id].school === school && UNDEAD[id].tier === t);
  return { school, tier: t, defId: defId || null };
}

// Простая стратегия закладки: берём самые густые останки, какие есть.
// Симулятор ею пользуется как моделью «игрок не дурак, но и не оптимизатор».
export function pickSlots(remains, count = 3) {
  const pool = [];
  for (const s of SCHOOL_IDS) for (let d = 3; d >= 1; d--) {
    for (let k = 0; k < remains[s][d]; k++) pool.push({ school: s, density: d });
  }
  if (pool.length < count) return null;
  pool.sort((a, b) => b.density - a.density);
  const slots = pool.slice(0, count);
  for (const s of slots) remains[s.school][s.density]--;
  return slots;
}
