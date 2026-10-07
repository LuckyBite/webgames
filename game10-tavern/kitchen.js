// «Таверна у края Хмари» — экран кухни: окно раздачи с лицами гостей, планка тикетов,
// станции, доска сборки, кладовая. Свет по тезису — от очага; еда — самое яркое в кадре.

import { drawHead, moodValue } from './chars.js';
import { reaction } from './hall.js';
import { drawItem, drawMug, drawPlate, drawDishIcon, drawGrillMeat, SPOTS } from './food.js';
import { DISHES, INGREDIENTS, COOKERS, RIDDLES, KITCHEN } from './data.js';
import { dishOnPlate, moodOf, similarity } from './shift.js';
import { lookOf } from './hall.js';
import { drawFire, drawZhar } from './fire.js';
import { drawKitchenStaff, staffLook } from './staff.js';
import { font, fitFont, wrap, badge, COLOR } from './ui.js';
import { tr, tf } from './i18n.js';
import { lightKitchen, contactShadow } from './light.js';

const MOOD_COLOR = { calm: '#5dbb63', wait: '#efa630', angry: '#e0523f' };
const dragging = (ui, kind, i) => ui.drag && ui.drag.source.kind === kind && (i === undefined || ui.drag.source.i === i);

function hint(ctx, text, x, y) {
  ctx.fillStyle = '#b8a488'; ctx.font = font(12, 400); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(tr(text), x, y);
  ctx.textAlign = 'left';
}

// Окно раздачи (шаг 3д): гнёзда открытых заказов, а не места зала. В гнезде — лицо гостя и
// кольцо терпения; над окном — сколько гостей в зале ещё ждут, чтобы у них приняли заказ.
function drawHatch(ctx, K, shift, t, ui) {
  const h = K.hatch;
  ctx.fillStyle = '#4a2f1d'; ctx.fillRect(h.x - 4, h.y - 4, h.w + 8, h.h + 8);
  ctx.fillStyle = '#1a110b'; ctx.fillRect(h.x, h.y, h.w, h.h);
  shift.slots.forEach((seatIdx, k) => {
    const r = K.faces[k];
    if (!r) return;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2, d = r.w, g = seatIdx >= 0 ? shift.seats[seatIdx].guest : null;
    ctx.fillStyle = '#2c1c12'; ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fill();
    if (!g) {
      // только что накормленный ещё сияет в окне; потом в гнезде — ждущий из зала
      const gh = ui?.ghost?.[k];
      if (gh && t - gh.t0 < 0.7) {
        const a = 1 - (t - gh.t0) / 0.7;
        ctx.save(); ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(cx, cy, d / 2 - 3, 0, Math.PI * 2); ctx.clip();
        drawHead(ctx, gh.look, { m: -1, t }, cx, cy + d * 0.06 - (1 - a) * d * 0.25, d * 1.05);
        ctx.restore();
        ctx.strokeStyle = COLOR.gold; ctx.lineWidth = 3 + 4 * a; ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(cx, cy, d / 2 + (1 - a) * 8, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
        return;
      }
      drawWaiting(ctx, shift, k, cx, cy, d, t);
      return;
    }
    const frac = g.patience / g.patienceMax;
    const re = reaction(ui || {}, seatIdx, g, t);
    const m = re ? re.m : g.eating > 0 ? 0 : moodValue(frac, shift.rules.moodCalm, shift.rules.moodAngry);
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, d / 2 - 3, 0, Math.PI * 2); ctx.clip();
    drawHead(ctx, lookOf(g), { m, t }, cx + (re ? re.shake * d * 0.1 : 0), cy + d * 0.06 - (re ? re.hop * d * 0.12 : 0), d * 1.05);
    ctx.restore();
    // кольцо терпения: цвет — настроение, длина — остаток
    ctx.strokeStyle = g.eating > 0 ? COLOR.good : MOOD_COLOR[moodOf(g, shift.rules)];
    ctx.lineWidth = Math.max(3, d * 0.07);
    ctx.beginPath(); ctx.arc(cx, cy, d / 2 - 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (g.eating > 0 ? 1 : frac)); ctx.stroke();
  });
  const d = ui?.drag;
  if (d && (d.source.kind === 'plate' || d.source.kind === 'mug')) {
    const y = d.y - 34;
    K.faces.forEach((r, k) => {
      if (shift.slots[k] < 0 || d.x < r.x || d.x > r.x + r.w || y < r.y || y > r.y + r.h) return;
      ctx.strokeStyle = COLOR.gold; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 + 4, 0, Math.PI * 2); ctx.stroke();
    });
  }
  const waiting = shift.seats.filter(s => s.guest && !s.guest.taken).length;
  if (waiting) {
    const full = !shift.canTake();
    const text = full ? tf('окно полно · в зале ждут {n}', { n: waiting }) : tf('в зале ждут: {n}', { n: waiting });
    ctx.font = font(12, 700);
    const w = ctx.measureText(text).width + 14, x = h.x + h.w - w - 4, y = h.y - 2;
    ctx.fillStyle = full ? '#e0523f' : '#f2b84b';
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 6);
    ctx.beginPath(); ctx.roundRect(x, y, w, 18, 9); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#2a1408'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + 9.5);
    ctx.textAlign = 'left';
  }
}

// Пустое гнездо, а в зале ждут: лицо ждущего тускло, кольцо пунктиром и «!» — тап по нему
// принимает заказ прямо с кухни (shift.waitingFor).
function drawWaiting(ctx, shift, k, cx, cy, d, t) {
  const i = shift.waitingFor(k);
  if (i < 0) return;
  const g = shift.seats[i].guest, frac = g.patience / g.patienceMax;
  ctx.save(); ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(cx, cy, d / 2 - 3, 0, Math.PI * 2); ctx.clip();
  drawHead(ctx, lookOf(g), { m: moodValue(frac, shift.rules.moodCalm, shift.rules.moodAngry), t }, cx, cy + d * 0.06, d * 1.05);
  ctx.restore();
  ctx.strokeStyle = MOOD_COLOR[moodOf(g, shift.rules)]; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.arc(cx, cy, d / 2 - 1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke(); ctx.setLineDash([]);
  const bob = Math.sin(t * 6) * 2, bx = cx + d * 0.34, by = cy - d * 0.34 + bob;
  ctx.fillStyle = '#f2b84b'; ctx.beginPath(); ctx.arc(bx, by, Math.max(9, d * 0.16), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = font(Math.max(12, d * 0.22), 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', bx, by + 1);
  ctx.textAlign = 'left';
}

// Загадка на узком тикете — знак вопроса: фраза видна в зале и по тапу на лицо в окне.
function riddleMark(ctx, cx, cy, size) {
  ctx.fillStyle = '#5a3a6a'; ctx.beginPath(); ctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f2d98a'; ctx.font = font(size * 0.55, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('?', cx, cy + size * 0.03);
  ctx.textAlign = 'left';
}

function ticketIcon(ctx, it, cx, cy, size) {
  ctx.globalAlpha = it.served ? 0.35 : 1;
  if (it.riddle && !it.served) riddleMark(ctx, cx, cy, size);
  else drawDishIcon(ctx, it.dish, cx, cy, size);
  ctx.globalAlpha = 1;
  if (it.served) {
    ctx.strokeStyle = '#3f8f3a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - size * 0.25, cy); ctx.lineTo(cx - size * 0.05, cy + size * 0.2); ctx.lineTo(cx + size * 0.3, cy - size * 0.25); ctx.stroke();
  }
}

// Тикет висит под лицом своего гостя. Узкий тикет — только значки: по тарелке видно состав.
function drawTickets(ctx, K, shift) {
  const aim = target(shift, true);
  const r = K.rail;
  ctx.fillStyle = '#b08a4a'; ctx.fillRect(r.x, r.y, r.w, 4);
  shift.slots.forEach((seatIdx, k) => {
    const g = seatIdx >= 0 ? shift.seats[seatIdx].guest : null;
    if (!g || !K.tickets[k]) return;
    const tk = K.tickets[k], x = tk.x + 3, y = tk.y + 6, w = tk.w - 6, h = tk.h - 8;
    ctx.fillStyle = COLOR.paper; ctx.fillRect(x, y, w, h);
    ctx.textBaseline = 'middle';
    if (!g.taken) {
      ctx.fillStyle = COLOR.ink; ctx.font = font(h * 0.5, 700); ctx.textAlign = 'center';
      ctx.fillText('?', x + w / 2, y + h / 2);
      ctx.textAlign = 'left';
      return;
    }
    const n = g.items.length;
    if (w >= 150) {
      const rowH = h / n, icon = Math.min(rowH * 0.9, 34);
      g.items.forEach((it, k) => {
        const cy = y + rowH * (k + 0.5);
        ticketIcon(ctx, it, x + 5 + icon / 2, cy, icon);
        ctx.fillStyle = it.served ? 'rgba(58,36,20,0.35)' : COLOR.ink; ctx.textAlign = 'left';
        if (it.riddle && !it.served) {
          // фраза загадки остаётся на тикете текстом (спека), в две строки
          const px = Math.max(10, Math.min(13, rowH * 0.4));
          ctx.font = font(px, 400);
          const lines = wrap(ctx, tr(RIDDLES.find(r => r.id === it.riddle).text), w - icon - 14).slice(0, 2);
          lines.forEach((l, j) => ctx.fillText(l, x + icon + 10, cy + (j - (lines.length - 1) / 2) * px * 1.15));
          return;
        }
        const name = tr(DISHES[it.dish].name);
        fitFont(ctx, name, w - icon - 14, Math.min(15, rowH * 0.5), 11);
        ctx.fillText(name, x + icon + 10, cy);
      });
    } else {
      const rowH = h / n;
      g.items.forEach((it, j) => {
        const cy = y + rowH * (j + 0.5);
        if (it.served || it.riddle || DISHES[it.dish].drink) {
          ticketIcon(ctx, it, x + w / 2, cy, Math.min(rowH * 0.95, w * 0.5));
          return;
        }
        // галочки — только у позиции, которую сейчас собирают на тарелке
        const parts = DISHES[it.dish].parts, sz = Math.min(rowH * 0.95, (w - 4) / parts.length);
        const mine = aim && aim.seat === seatIdx && aim.dish === it.dish && !aim.used;
        if (mine) aim.used = true;
        const have = mine ? [...shift.plate] : [];
        parts.forEach((p, q) => {
          const px = x + 2 + sz * (q + 0.5) + ((w - 4) - sz * parts.length) / 2;
          drawItem(ctx, INGREDIENTS[p].cut ? p + '_cut' : p === 'honey' ? 'honey_drop' : p, px, cy, sz * 0.95);
          const at = have.indexOf(p);
          if (at >= 0) {
            have.splice(at, 1);
            ctx.strokeStyle = '#3f8f3a'; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.moveTo(px - sz * 0.2, cy + sz * 0.15); ctx.lineTo(px - sz * 0.02, cy + sz * 0.32); ctx.lineTo(px + sz * 0.3, cy - sz * 0.05); ctx.stroke();
          }
        });
        if (j < n - 1) { ctx.fillStyle = 'rgba(58,36,20,0.18)'; ctx.fillRect(x + 4, y + rowH * (j + 1), w - 8, 1); }
      });
    }
  });
}

// Бочка стоя: клёпки, железные обручи, блик от огня; медный кран с рычагом внизу, кружка прямо
// под краном. Рычаг откинут, пока льётся; струя короткая и янтарная. Шкала — на бочке, у
// крана: зелёная полоса — отпускать здесь, золотая отметка — сколько налито.
function drawBarrel(ctx, K, shift, ui, t) {
  const r = K.barrel, b = shift.barrel;
  const mugSize = Math.min(r.w * 0.5, r.h * 0.34);
  const bw = Math.min(r.w * 0.8, (r.h - mugSize * 1.15) * 0.8), bh = Math.min(r.h - mugSize * 1.2, bw * 1.35);
  const bcx = r.x + r.w * 0.46, by = r.y + 2, bcy = by + bh / 2;
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(bcx - bw * 0.4, by);
    ctx.quadraticCurveTo(bcx - bw * 0.56, bcy, bcx - bw * 0.4, by + bh);
    ctx.lineTo(bcx + bw * 0.4, by + bh);
    ctx.quadraticCurveTo(bcx + bw * 0.56, bcy, bcx + bw * 0.4, by);
    ctx.closePath();
  };
  const g = ctx.createLinearGradient(bcx - bw / 2, 0, bcx + bw / 2, 0);
  g.addColorStop(0, '#4a2a14'); g.addColorStop(0.35, '#a86c38'); g.addColorStop(0.6, '#8a5428'); g.addColorStop(1, '#3a200e');
  body(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); body(); ctx.clip();
  ctx.strokeStyle = 'rgba(40,20,8,0.45)'; ctx.lineWidth = 1.5;
  for (let k = -2; k <= 2; k++) {                                          // клёпки — дугами
    const x = bcx + k * bw * 0.17;
    ctx.beginPath(); ctx.moveTo(x - k * bw * 0.02, by); ctx.quadraticCurveTo(x + k * bw * 0.04, bcy, x - k * bw * 0.02, by + bh); ctx.stroke();
  }
  ctx.fillStyle = '#5e5850';
  for (const k of [0.16, 0.84]) ctx.fillRect(bcx - bw, by + bh * k - bh * 0.035, bw * 2, bh * 0.07);
  ctx.fillStyle = 'rgba(220,210,190,0.35)';
  for (const k of [0.16, 0.84]) ctx.fillRect(bcx - bw, by + bh * k - bh * 0.035, bw * 2, bh * 0.015);
  ctx.fillStyle = 'rgba(255,200,130,0.16)'; ctx.fillRect(bcx - bw * 0.22, by, bw * 0.1, bh);   // блик
  ctx.restore();
  ctx.fillStyle = '#2e1a0c'; ctx.beginPath(); ctx.ellipse(bcx, by + 3, bw * 0.4, bh * 0.05, 0, 0, Math.PI * 2); ctx.fill();
  // кран внизу бочки, кружка под ним
  const tapY = by + bh * 0.7, tapX = bcx + bw * 0.1, tapL = bw * 0.36;
  ctx.fillStyle = '#b07a2e'; ctx.beginPath(); ctx.roundRect(tapX, tapY - 5, tapL, 10, 4); ctx.fill();
  ctx.fillStyle = '#c8893a'; ctx.beginPath(); ctx.roundRect(tapX + tapL - 9, tapY - 3, 9, 15, 3); ctx.fill();
  ctx.fillStyle = 'rgba(255,230,160,0.6)'; ctx.fillRect(tapX + 2, tapY - 4, tapL - 4, 2);
  const la = b.pouring ? -0.35 : -1.5, lx = tapX + tapL * 0.55, ll = bh * 0.22;
  ctx.strokeStyle = '#3a2210'; ctx.lineWidth = 5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(lx, tapY - 5); ctx.lineTo(lx + Math.cos(la) * ll, tapY - 5 + Math.sin(la) * ll); ctx.stroke();
  ctx.fillStyle = '#c8893a'; ctx.beginPath(); ctx.arc(lx + Math.cos(la) * ll, tapY - 5 + Math.sin(la) * ll, 4.5, 0, Math.PI * 2); ctx.fill();
  // кружка прямо под краном: в высокой ячейке она не уезжает вниз, и струя остаётся короткой
  const mx = tapX + tapL - 4.5, my = Math.min(r.y + r.h - mugSize * 0.52, tapY + 14 + mugSize * 0.62);
  if (b.pouring) {
    const top = tapY + 12, bot = my - mugSize * 0.32 + mugSize * 0.64 * (1 - Math.max(0.05, b.fill)) * 0.9;
    ctx.fillStyle = '#e2a43a'; ctx.fillRect(mx - 2.5, top, 5, Math.max(0, bot - top));
    ctx.fillStyle = 'rgba(255,236,190,0.7)'; ctx.fillRect(mx - 1, top, 1.5, Math.max(0, bot - top));
  }
  if ((b.pouring || b.mug) && !dragging(ui, 'mug')) {
    drawMug(ctx, mx, my, mugSize, b.mug ? (b.mug === 'short' ? 0.55 : 1) : b.fill, b.mug, t);
  }
  // шкала на боку бочки слева
  const gx = bcx - bw * 0.36, gw = 7, gy = by + bh * 0.26, gh = bh * 0.5;
  ctx.fillStyle = 'rgba(20,12,8,0.85)'; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 3); ctx.fill();
  ctx.fillStyle = '#5dbb63'; ctx.fillRect(gx + 1, gy + 1, gw - 2, (gh - 2) * (1 - shift.cfg.pourPerfect));
  ctx.fillStyle = '#e0523f'; ctx.fillRect(gx + 1, gy + 1, gw - 2, 2);
  const lvl = b.pouring ? b.fill : b.mug ? (b.mug === 'short' ? 0.55 : 1) : 0;
  if (lvl > 0) { ctx.fillStyle = COLOR.gold; ctx.fillRect(gx - 3, gy + gh * (1 - Math.min(1, lvl)) - 2, gw + 6, 4); }
  if (!b.pouring && !b.mug) hint(ctx, 'держи', mx, r.y + r.h - 4);
}

// Очаг — дом Жара: его лицо в пламени под решёткой; говорит, пока на экране его подсказка.
// С Тимкой огонь выше: он раздувает Жар.
function drawStationBoxes(ctx, K, shift, t, talk, flare = 1) {
  const hb = K.hearthBox;
  ctx.fillStyle = '#4a4038'; ctx.beginPath(); ctx.roundRect(hb.x, hb.y, hb.w, hb.h, 10); ctx.fill();
  ctx.fillStyle = '#140b07'; ctx.fillRect(hb.x + 6, hb.y + hb.h * 0.55, hb.w - 12, hb.h * 0.4);
  drawFire(ctx, hb.x + hb.w / 2, hb.y + hb.h - 6, hb.w * 0.8, hb.h * 0.42 * (1 + shift.cfg.staff.fire) * flare, t, { logs: true });
  drawZhar(ctx, hb.x + hb.w / 2, hb.y + hb.h * 0.8, Math.min(hb.w * 0.34, hb.h * 0.3), t, { talk });
  const cb = K.cauldronBox;
  if (!cb) return;
  ctx.fillStyle = '#3a322c'; ctx.beginPath(); ctx.roundRect(cb.x, cb.y, cb.w, cb.h, 10); ctx.fill();
  drawFire(ctx, cb.x + cb.w / 2, cb.y + cb.h - 6, cb.w * 0.6, cb.h * 0.22, t + 1.3, { sparks: false, seed: 2 });
}

// Подпись-призыв над слотом: «переверни!», «помешай» — пульсирует, пока ждёт.
function ask(ctx, text, cx, y, t, color) {
  text = tr(text);
  const px = 13, pulse = 1 + 0.06 * Math.sin(t * 9);
  ctx.font = font(px * pulse, 700);
  const w = ctx.measureText(text).width + 12;
  ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(cx - w / 2, y - 10, w, 20, 10); ctx.fill();
  ctx.fillStyle = '#2a1408'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, y + 1);
  ctx.textAlign = 'left';
}

// Слот очага: решётка, мясо стороной вверх; каёмка — как прожарилась нижняя сторона.
function drawGrillSlot(ctx, shift, ui, i, r, t) {
  const c = shift.cookers[i], { phase, frac } = shift.phaseOf(i);
  const cx = r.x + r.w / 2, cy = r.y + r.h * 0.5, d = Math.min(r.w * 0.95, r.h * 0.85);
  ctx.strokeStyle = '#2a2420'; ctx.lineWidth = 3;
  for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(cx - d * 0.55, cy + k * d * 0.14); ctx.lineTo(cx + d * 0.55, cy + k * d * 0.14); ctx.stroke(); }
  if (!c.item || dragging(ui, 'cooker', i)) return;
  // переворот: мясо подлетает и сжимается по высоте ~0,3 с
  const fa = ui.anim?.flip?.[i], fk = fa !== undefined && t - fa < 0.3 ? (t - fa) / 0.3 : 1;
  const lift = fk < 1 ? Math.sin(fk * Math.PI) * d * 0.35 : 0, squash = fk < 1 ? Math.abs(Math.cos(fk * Math.PI)) : 1;
  ctx.save(); ctx.translate(cx, cy - lift); ctx.scale(1, Math.max(0.15, squash));
  if (c.item === 'burnt') drawGrillMeat(ctx, 0, 0, d, { top: 2, edge: 2, t });
  else if (phase === 'side1') drawGrillMeat(ctx, 0, 0, d, { top: 0, edge: frac, t });
  else if (phase === 'flip') drawGrillMeat(ctx, 0, 0, d, { top: 0, edge: 1 + frac * 0.6, t });
  else if (phase === 'side2') drawGrillMeat(ctx, 0, 0, d, { top: 1, edge: frac, marks: true, t });
  else drawGrillMeat(ctx, 0, 0, d, { top: 1, edge: 1 + (1 - frac) * 0.4, marks: true, gloss: true, t });
  ctx.restore();
  if (phase === 'flip') {
    ctx.strokeStyle = frac > 0.6 ? '#e0523f' : '#f2b84b'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, d * 0.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - frac)); ctx.stroke();
    ask(ctx, 'переверни!', cx, r.y + 10 - Math.abs(Math.sin(t * 6)) * 4, t, frac > 0.6 ? '#ff8a6a' : '#f2c25a');
  } else if (phase === 'side1' || phase === 'side2') {
    ctx.strokeStyle = '#efa630'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, cy, d * 0.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
  } else if (phase === 'ready') {
    ctx.strokeStyle = Math.sin(t * 10) > 0 ? '#5dbb63' : '#8fd07a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, d * 0.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
    for (let k = 0; k < 2; k++) {                                         // пар над готовым
      const life = (t * 0.8 + k * 0.5) % 1;
      ctx.globalAlpha = 0.5 * (1 - life); ctx.strokeStyle = '#efe2c4'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - d * 0.15 + k * d * 0.3, cy - d * 0.2 - life * d * 0.5);
      ctx.quadraticCurveTo(cx - d * 0.05 + k * d * 0.3, cy - d * 0.35 - life * d * 0.5, cx - d * 0.15 + k * d * 0.3, cy - d * 0.5 - life * d * 0.5); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

// Слот котла: котёл бурлит; когда просит помешать — круговая стрелка и «помешай», круг пальца
// (ui.stir) рисуется дугой прогресса; пригоревшее — накипь по краю и сизый дым.
function drawPotSlot(ctx, shift, ui, i, r, t) {
  const c = shift.cookers[i], { phase, frac } = shift.phaseOf(i);
  const pw = Math.min(r.w * 0.92, r.h * 1.1), ph = Math.min(r.h * 0.62, pw * 0.85), px = r.x + r.w / 2, py = r.y + r.h * 0.5;
  // котёл: тёмный чугун с ободом и ушками
  ctx.fillStyle = '#1e1a18'; ctx.beginPath(); ctx.ellipse(px, py, pw / 2, ph / 2, 0, 0, Math.PI); ctx.fill();
  ctx.fillRect(px - pw / 2, py - ph * 0.05, pw, ph * 0.1);
  ctx.fillStyle = '#2e2a26'; ctx.beginPath(); ctx.ellipse(px, py - ph * 0.05, pw / 2, ph * 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#4a443e'; ctx.lineWidth = 3; ctx.stroke();
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(px + s * pw * 0.52, py, ph * 0.1, 0, Math.PI * 2); ctx.stroke(); }
  if (!c.item || dragging(ui, 'cooker', i)) return;
  // содержимое по фазе
  const scorched = c.scorched || c.item === 'burnt';
  const soup = c.item === 'burnt' ? '#2a1e16' : phase === 'ready' ? (scorched ? '#7a4a22' : '#c07a2e') : '#8a6a4a';
  ctx.fillStyle = soup; ctx.beginPath(); ctx.ellipse(px, py - ph * 0.05, pw * 0.44, ph * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  if (scorched) { ctx.strokeStyle = '#140e0a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(px, py - ph * 0.05, pw * 0.42, ph * 0.11, 0, 0, Math.PI * 2); ctx.stroke(); }
  if (c.item !== 'burnt') {
    // пузыри: чем дальше варка, тем чаще
    const n = phase === 'ready' ? 3 : 2 + Math.round(frac * 4);
    for (let k = 0; k < n; k++) {
      const life = (t * (1.2 + k * 0.2) + k * 0.37) % 1, bx = px + Math.sin(k * 7.1) * pw * 0.3;
      ctx.globalAlpha = 1 - life; ctx.strokeStyle = '#f0d8a8'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(bx, py - ph * 0.06, 2 + life * 4, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  // половник ходит по кругу после помешивания
  const sa = ui.anim?.stir?.[i], stirring = sa !== undefined && t - sa < 0.6;
  const la = stirring ? (t - sa) * 10 : 0.6;
  ctx.strokeStyle = '#8a7a6a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(px + Math.cos(la) * pw * 0.2, py - ph * 0.08 + Math.sin(la) * ph * 0.06); ctx.lineTo(px + Math.cos(la) * pw * 0.3 + pw * 0.15, py - ph * 0.55); ctx.stroke();
  if (scorched) {
    for (let k = 0; k < 2; k++) {
      const life = (t * 0.6 + k * 0.5) % 1;
      ctx.globalAlpha = 0.5 * (1 - life); ctx.fillStyle = '#6a7080';
      ctx.beginPath(); ctx.ellipse(px - pw * 0.1 + k * pw * 0.2, py - ph * 0.3 - life * ph * 0.8, 6 + life * 8, 4 + life * 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  if (phase === 'stir') {
    // круговая стрелка; ведёт пальцем — дуга прогресса
    const rr = Math.min(pw, ph * 1.6) * 0.42, spin = t * 3;
    ctx.strokeStyle = frac > 0.6 ? '#ff8a6a' : '#f2c25a'; ctx.lineWidth = 3; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(px, py - ph * 0.05, rr, spin, spin + Math.PI * 1.6); ctx.stroke(); ctx.setLineDash([]);
    const ea = spin + Math.PI * 1.6, ax = px + Math.cos(ea) * rr, ay = py - ph * 0.05 + Math.sin(ea) * rr;
    ctx.fillStyle = ctx.strokeStyle; ctx.beginPath();
    ctx.moveTo(ax + Math.cos(ea + Math.PI / 2) * 8, ay + Math.sin(ea + Math.PI / 2) * 8);
    ctx.lineTo(ax + Math.cos(ea) * 6, ay + Math.sin(ea) * 6); ctx.lineTo(ax - Math.cos(ea) * 6, ay - Math.sin(ea) * 6); ctx.closePath(); ctx.fill();
    if (ui.stir && ui.stir.slot === i) {
      ctx.strokeStyle = '#8fd07a'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(px, py - ph * 0.05, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, ui.stir.angle / (Math.PI * 1.5))); ctx.stroke();
    }
    ask(ctx, 'помешай', px, r.y + 10, t, frac > 0.6 ? '#ff8a6a' : '#f2c25a');
  } else if (phase === 'cook') {
    ctx.strokeStyle = '#efa630'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(px, py, Math.min(r.w, r.h) * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
  } else if (phase === 'ready') {
    ctx.strokeStyle = Math.sin(t * 10) > 0 ? '#5dbb63' : '#8fd07a'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(px, py, Math.min(r.w, r.h) * 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); ctx.stroke();
  }
}

function drawCookers(ctx, K, shift, ui, t) {
  const talk = !!(ui.toast && ui.toast.who === 'zhar' && t < ui.toast.until);
  const fl = ui.flare !== undefined && t - ui.flare < 0.6 ? 1 + 0.35 * Math.sin((t - ui.flare) / 0.6 * Math.PI) : 1;
  drawStationBoxes(ctx, K, shift, t, talk || fl > 1, fl);
  shift.cookers.forEach((c, i) => {
    const slot = K.cookers[i];
    if (!slot) return;
    if (c.station === 'hearth') drawGrillSlot(ctx, shift, ui, i, slot.r, t);
    else drawPotSlot(ctx, shift, ui, i, slot.r, t);
  });
}

function drawBucket(ctx, K) {
  const r = K.bucket, w = Math.min(r.w * 0.8, r.h * 0.6), h = w * 0.9;
  const x = r.x + (r.w - w) / 2, y = r.y + r.h - h - 16;
  ctx.fillStyle = '#6b4a2e';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w * 0.88, y + h); ctx.lineTo(x + w * 0.12, y + h); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2a2a24'; ctx.beginPath(); ctx.ellipse(x + w / 2, y, w / 2, w * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#3e2a1a'; ctx.fillRect(x + 2, y + h * 0.35, w - 4, 4);
  hint(ctx, 'помои', r.x + r.w / 2, r.y + r.h - 2);
}

// Колода: срез бревна с кольцами; на нём продукт, нож над ним. Удар (ui.anim.chop) — нож
// падает, отлетают кусочки; продукт тает с каждым ударом.
function drawBlock(ctx, K, shift, ui, t) {
  const r = K.block, b = shift.block;
  const w = Math.min(r.w * 0.9, r.h * 1.3), h = Math.min(r.h * 0.62, w * 0.5), cx = r.x + r.w / 2, cy = r.y + r.h * 0.58;
  ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.ellipse(cx, cy + h * 0.18, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#b08050'; ctx.beginPath(); ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(110,70,36,0.6)'; ctx.lineWidth = 1.5;
  for (const k of [0.75, 0.5, 0.25]) { ctx.beginPath(); ctx.ellipse(cx, cy, w / 2 * k, h / 2 * k, 0, 0, Math.PI * 2); ctx.stroke(); }
  for (const [dx, dy] of [[-0.2, -0.1], [0.15, 0.12], [0.05, -0.2]]) {      // зарубки от ножа
    ctx.strokeStyle = 'rgba(70,40,20,0.5)'; ctx.beginPath(); ctx.moveTo(cx + dx * w, cy + dy * h); ctx.lineTo(cx + dx * w + w * 0.08, cy + dy * h + h * 0.05); ctx.stroke();
  }
  const since = t - (ui.anim?.chop ?? -9), hit = since < 0.18;
  if (b.item) {
    const left = b.left / shift.cfg.chops, size = Math.min(w, h * 2) * 0.55;
    // целый продукт съёживается к краю, нарезанное — горкой рядом
    drawItem(ctx, b.item, cx - w * 0.12 + (1 - left) * w * 0.05, cy - h * 0.12, size * (0.55 + 0.45 * left));
    if (left < 1) drawItem(ctx, b.item + '_cut', cx + w * 0.24, cy - h * 0.05, size * 0.6);
    if (hit) {                                                               // отлетают кусочки
      for (let k = 0; k < 5; k++) {
        const a = -Math.PI / 2 + (k - 2) * 0.5, dist = since / 0.18 * size * 0.6;
        ctx.fillStyle = b.item === 'onion' ? '#c47bb4' : b.item === 'cheese' ? '#ffdb6e' : '#f1d39a';
        ctx.beginPath(); ctx.arc(cx + w * 0.05 + Math.cos(a) * dist, cy - h * 0.2 + Math.sin(a) * dist, 2.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // нож: поднят над продуктом, при ударе опущен
  const kx = cx + w * 0.02, ky = cy - h * (hit ? 0.25 : 0.95) - (b.item ? 0 : -h * 0.3);
  const kl = w * 0.42;
  ctx.save(); ctx.translate(kx, ky); ctx.rotate(hit ? 0.05 : -0.25);
  ctx.fillStyle = '#d8dde0'; ctx.beginPath(); ctx.moveTo(-kl / 2, 0); ctx.lineTo(kl / 2, 0); ctx.lineTo(kl / 2 - 6, h * 0.22); ctx.lineTo(-kl / 2, h * 0.18); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(-kl / 2, 0, kl, 2);
  ctx.fillStyle = '#4a2a14'; ctx.beginPath(); ctx.roundRect(-kl / 2 - kl * 0.35, -2, kl * 0.36, h * 0.18, 3); ctx.fill();
  ctx.restore();
  const label = b.item ? tf('стучи по колоде · {n}', { n: b.left }) : tr('колода');
  ctx.fillStyle = b.item ? COLOR.gold : '#c9a57a';
  fitFont(ctx, label, r.w - 8, 13, 9);
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(label, cx, r.y + 4);
  ctx.textAlign = 'left';
}

function drawBoard(ctx, K, shift, ui, t) {
  const b = K.board, p = K.plate;
  ctx.fillStyle = '#7a4e2c'; ctx.beginPath(); ctx.roundRect(b.x, b.y, b.w, b.h, 14); ctx.fill();
  ctx.strokeStyle = '#6a4224'; ctx.lineWidth = 2;
  for (let k = 1; k < 5; k++) { const y = b.y + (b.h * k) / 5; ctx.beginPath(); ctx.moveTo(b.x + 12, y); ctx.lineTo(b.x + b.w - 12, y); ctx.stroke(); }
  drawBlock(ctx, K, shift, ui, t);
  if (!dragging(ui, 'plate')) {
    contactShadow(ctx, p.x + p.w / 2, p.y + p.h / 2 + p.w * 0.14, p.w * 1.05, 0.8);
    const pop = ui.anim?.plate !== undefined ? Math.min(1, (t - ui.anim.plate) / 0.15) : 1;
    drawPlate(ctx, shift.plate, p.x + p.w / 2, p.y + p.h / 2, p.w, shift.plateQ, pop);
    // рецепт сложился — золотое кольцо расходится по краю тарелки
    const done = ui.anim?.dish !== undefined ? (t - ui.anim.dish) / 0.5 : 1;
    if (done < 1) {
      ctx.strokeStyle = COLOR.gold; ctx.globalAlpha = 1 - done; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, p.y + p.h / 2, p.w * (0.5 + done * 0.15), p.w * (0.36 + done * 0.12), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // мёд или перец тянут над тарелкой — полоса будущего штриха
  const d = ui.drag;
  if (d && d.source.kind === 'pantry' && INGREDIENTS[d.source.id]?.garnish && d.path) {
    const inside = d.path.filter(([x, y]) => x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h);
    if (inside.length > 1) {
      ctx.strokeStyle = d.source.id === 'honey' ? 'rgba(232,168,42,0.8)' : 'rgba(212,42,34,0.7)';
      ctx.lineWidth = Math.max(3, p.w * 0.03); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); inside.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    }
  }
  const dish = dishOnPlate(shift.plate);
  const area = K.plateArea;
  const aim = !dish && target(shift);
  const missing = aim ? missingParts(DISHES[aim].parts, shift.plate) : [];
  // призрак недостающего — тускло вокруг тарелки, чтобы было видно, что положить
  if (aim && missing.length && !dragging(ui, 'plate')) {
    ctx.globalAlpha = 0.32 + 0.1 * Math.sin(t * 4);
    // на тех местах тарелки, куда части лягут (food.js SPOTS)
    missing.forEach((m, k) => {
      const [ox, oy] = SPOTS[shift.plate.length + k] || [0, 0];
      drawItem(ctx, INGREDIENTS[m].cut ? m + '_cut' : m === 'honey' ? 'honey_drop' : m, p.x + p.w / 2 + ox * p.w, p.y + p.h / 2 + oy * p.w, p.w * 0.42);
    });
    ctx.globalAlpha = 1;
  }
  const label = dish ? tr(DISHES[dish].name)
    : aim ? tf('{dish}: + {parts}', { dish: tr(DISHES[aim].name), parts: missing.map(m => tr(INGREDIENTS[m].name)).join(', ') })
    : shift.plate.length ? '…' : tr('тарелка');
  ctx.fillStyle = dish ? '#fff1c1' : '#c9a57a';
  fitFont(ctx, label, area.w - 20, 16, 11);
  ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText(label, area.x + area.w / 2, area.y + area.h - 6);
  ctx.textAlign = 'left';
}

// Чего не хватает на тарелке до блюда parts (мультимножества).
function missingParts(parts, plate) {
  const have = [...plate];
  return parts.filter(p => { const k = have.indexOf(p); if (k < 0) return true; have.splice(k, 1); return false; });
}

// Какое блюдо собирается: с непустой тарелкой — открытая позиция, на которую она больше всего
// похожа и в которой нет лишнего; с пустой — у самого нетерпеливого гостя с принятым заказом.
// withSeat — вернуть и место гостя: { dish, seat } (тикет отмечает галочками свою строку).
function target(shift, withSeat = false) {
  const open = shift.seats.map((s, seat) => ({ g: s.guest, seat })).filter(x => x.g && x.g.taken && !(x.g.eating > 0))
    .sort((a, b) => a.g.patience / a.g.patienceMax - b.g.patience / b.g.patienceMax)
    .flatMap(x => x.g.items.filter(it => !it.served && it.dish && !DISHES[it.dish].drink).map(it => ({ dish: it.dish, seat: x.seat })));
  let best = null;
  if (!shift.plate.length) best = open[0] || null;
  else {
    let sim = 0;
    for (const o of open) {
      const parts = DISHES[o.dish].parts;
      if (shift.plate.some(p => !parts.includes(p))) continue;
      const v = similarity(parts, shift.plate);
      if (v > sim) { sim = v; best = o; }
    }
  }
  return withSeat ? best && { ...best } : best && best.dish;
}

// Ящики кладовой; у редких — счётчик, пустой ящик бледнеет. У нарезаемых — целый продукт и
// горка нарезанного со счётчиком порций; пусто — «нарежь».
function drawPantry(ctx, K, shift) {
  for (const { id, r } of K.pantry) {
    const ing = INGREDIENTS[id], rare = ing.rare, n = shift.stock[id] || 0;
    ctx.fillStyle = rare ? '#3e2a36' : '#4a2f1d'; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 8); ctx.fill();
    ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 2; ctx.strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
    const s = Math.min(r.w, r.h);
    if (ing.cut) {
      const cut = shift.cut[id] || 0;
      drawItem(ctx, id, r.x + r.w * 0.36, r.y + r.h * 0.48, s * 0.62);
      if (cut > 0) drawItem(ctx, id + '_cut', r.x + r.w * 0.7, r.y + r.h * 0.62, s * 0.48);
      const bx = r.x + r.w - 12, by = r.y + 12;
      ctx.fillStyle = cut > 0 ? '#8fd07a' : '#6b5a4a'; ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLOR.ink; ctx.font = font(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(cut), bx, by + 0.5);
      if (!cut) { ctx.fillStyle = '#c9a57a'; ctx.font = font(Math.max(9, Math.min(11, s * 0.16)), 500); ctx.textBaseline = 'bottom'; ctx.fillText(tr('нарежь'), r.x + r.w / 2, r.y + r.h - 3); }
      ctx.textAlign = 'left';
      continue;
    }
    ctx.globalAlpha = rare && n <= 0 ? 0.3 : 1;
    drawItem(ctx, id, r.x + r.w / 2, r.y + r.h / 2, s * 0.8);
    ctx.globalAlpha = 1;
    if (rare) {
      const bx = r.x + r.w - 12, by = r.y + 12;
      ctx.fillStyle = n > 0 ? COLOR.gold : '#6b5a4a'; ctx.beginPath(); ctx.arc(bx, by, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = COLOR.ink; ctx.font = font(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(n), bx, by + 0.5);
      ctx.textAlign = 'left';
    }
  }
}

export function drawKitchen(ctx, K, shift, ui, t) {
  const S = K.stage, hb = K.hearthBox;
  ctx.save();
  ctx.beginPath(); ctx.rect(S.x, S.y, S.w, S.h); ctx.clip();
  ctx.fillStyle = '#2b1a11'; ctx.fillRect(S.x, S.y, S.w, S.h);
  const gx = hb.x + hb.w / 2, gy = hb.y + hb.h;
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(S.w, S.h) * 0.6);
  glow.addColorStop(0, 'rgba(255,140,50,0.35)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(S.x, S.y, S.w, S.h);
  drawHatch(ctx, K, shift, t, ui);
  drawTickets(ctx, K, shift);
  drawBarrel(ctx, K, shift, ui, t);
  drawCookers(ctx, K, shift, ui, t);
  drawKitchenStaff(ctx, K, shift, t);
  drawBucket(ctx, K);
  drawBoard(ctx, K, shift, ui, t);
  lightKitchen(ctx, K, shift, t);   // до кладовой: пустые редкие ящики не тонут в тени
  drawPantry(ctx, K, shift);
  ctx.restore();
}
