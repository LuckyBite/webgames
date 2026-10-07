// «Таверна у края Хмари» — наставник первого дня (разбор 2026-10-07, п. 5).
//
// Вместо тостов — кольцо на том, что нажать, и короткая строка рядом. Шаг выводится из
// состояния смены: какой обучающий гость в зале и что ему нужно. Ошибся игрок — шаг сам
// покажет, как исправить (лишнее на тарелке — в помои, перелилось — вылить).

import { DISHES, INGREDIENTS, COOKERS } from './data.js';
import { dishOnPlate } from './shift.js';
import { font, wrap, COLOR } from './ui.js';
import { tr, tf } from './i18n.js';

const pantryRect = (K, id) => K.pantry.find(p => p.id === id)?.r;
const nameOf = id => tr(INGREDIENTS[id].name);

// Шаг: { text, rect } в координатах экрана или null (наставник молчит).
export function tutorStep(shift, L, ui) {
  if (!shift.tutorialOn()) return null;
  const s = shift, K = L.kitchen, H = L.hall, split = L.mode === 'split';
  const onKitchen = split || ui.screen === 'kitchen', onHall = split || ui.screen === 'hall';
  const gi = s.seats.findIndex(x => x.guest?.tutorial);
  const dirty = s.seats.findIndex(x => x.dirty);
  if (gi < 0) {
    if (dirty < 0) return null;
    return onHall ? { text: tr('Гость оставил монеты. Тапни, чтобы собрать'), rect: H.seats[dirty].hit } : { text: tr('Монеты собирают в зале'), rect: L.tabs.hall };
  }
  const g = s.seats[gi].guest;
  if (!g.taken) {
    if (onHall) return { text: tr('Пришёл гость! Тапни его, он скажет заказ'), rect: H.seats[gi].hit };
    const k = s.slots.findIndex((x, j) => s.waitingFor(j) === gi);
    return { text: tr('Тапни лицо с «!», это гость из зала'), rect: K.faces[k] };
  }
  if (g.eating > 0) return dirty >= 0 && onHall ? { text: tr('Гость оставил монеты. Тапни, чтобы собрать'), rect: H.seats[dirty].hit } : null;
  if (!onKitchen) return { text: tr('Заказ на кухне. Иди туда'), rect: L.tabs.kitchen };
  const face = K.faces[s.slotOf(gi)];
  const it = g.items.find(x => !x.served), D = DISHES[it.dish];
  if (D.drink) {
    const b = s.barrel;
    if (b.mug === 'spilled') return { text: tr('Перелилось. Тапни кружку, вылей'), rect: K.barrel };
    if (b.mug) return { text: tr('Тяни кружку на лицо гостя'), rect: face };
    if (b.pouring) return { text: tr('Держи! Отпусти на зелёной полосе'), rect: K.barrel };
    return { text: tr('Зажми бочку и держи, эль польётся'), rect: K.barrel };
  }
  if (dishOnPlate(s.plate) === it.dish) return { text: tr('Готово! Тяни тарелку на лицо гостя'), rect: face };
  if (s.plate.some(p => !D.parts.includes(p))) return { text: tr('Лишнее на тарелке. Тяни её в помои'), rect: K.bucket };
  const have = [...s.plate];
  const need = D.parts.filter(p => { const k = have.indexOf(p); if (k < 0) return true; have.splice(k, 1); return false; });
  let waitCook = null;
  for (const p of need) {
    const st = Object.keys(COOKERS).find(k => COOKERS[k].to === p);
    if (st) {
      const i = s.cookers.findIndex(c => c.station === st && c.item && c.item !== 'burnt');
      const burnt = s.cookers.findIndex(c => c.station === st && c.item === 'burnt');
      if (burnt >= 0) return { text: tr('Сгорело. Тяни в помои'), rect: K.cookers[burnt].r };
      if (i < 0) return { text: tf('Тапни ящик: {name} ляжет на огонь', { name: nameOf(COOKERS[st].from) }), rect: pantryRect(K, COOKERS[st].from) };
      const ph = s.phaseOf(i).phase;
      if (ph === 'flip') return { text: tr('Мясо просит перевернуть. Тапни его!'), rect: K.cookers[i].r };
      if (ph === 'stir') return { text: tr('Помешай: веди пальцем по кругу'), rect: K.cookers[i].r };
      if (ph === 'ready') return { text: tr('Готово! Тапни, оно ляжет на тарелку'), rect: K.cookers[i].r };
      waitCook = waitCook || { text: tr('Жарится. Смотри на кольцо вокруг'), rect: K.cookers[i].r };
      continue;
    }
    if (INGREDIENTS[p].cut) {
      if (s.cut[p] > 0) return { text: tf('Тапни ящик: {name} ляжет на тарелку', { name: nameOf(p) }), rect: pantryRect(K, p) };
      if (s.block.item === p) return { text: tr('Стучи по колоде, режь'), rect: K.block };
      if (s.block.item) return { text: tf('Сначала дорежь на колоде: {name}', { name: nameOf(s.block.item) }), rect: K.block };
      return { text: tf('Тапни ящик: {name} ляжет на колоду', { name: nameOf(p) }), rect: pantryRect(K, p) };
    }
    return { text: tf('Тапни ящик: {name}', { name: nameOf(p) }), rect: pantryRect(K, p) };
  }
  return waitCook;
}

// Кольцо вокруг цели и строка рядом: над целью, если сверху есть место, иначе под ней.
export function drawTutor(ctx, step, W, H, t) {
  if (!step || !step.rect) return;
  const r = step.rect, pad = 6 + 3 * Math.sin(t * 6);
  ctx.strokeStyle = COLOR.gold; ctx.lineWidth = 4;
  ctx.shadowColor = 'rgba(255,209,102,0.8)'; ctx.shadowBlur = 12;
  ctx.beginPath(); ctx.roundRect(r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad, 12); ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.font = font(15, 600);
  const maxW = Math.min(W - 24, 300), lines = wrap(ctx, step.text, maxW - 24);
  const w = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width)) + 24), h = lines.length * 20 + 14;
  const above = r.y - pad - h - 10 > 50;
  const x = Math.max(12, Math.min(W - 12 - w, r.x + r.w / 2 - w / 2));
  const y = above ? r.y - pad - h - 10 : Math.min(H - h - 8, r.y + r.h + pad + 10);
  ctx.fillStyle = 'rgba(28,18,12,0.94)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 10); ctx.fill();
  ctx.strokeStyle = COLOR.gold; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = COLOR.paper; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  lines.forEach((l, k) => ctx.fillText(l, x + w / 2, y + 7 + 10 + k * 20));
  ctx.textAlign = 'left';
}
