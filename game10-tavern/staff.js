// «Таверна у края Хмари» — персонал в кадре: Шмыг убирает место у стойки, Фиорин с лютней у
// камина, Ирма у бочки, Тимка в колпаке у очага. Только рисунок: что они делают, решает
// shift.js (cfg.staff, help, barrel.by).

import { STAFF } from './data.js';
import { makeLook, drawGuest, drawHead } from './chars.js';

const LOOKS = Object.fromEntries(STAFF.map(s => [s.id, Object.assign(makeLook(s.race, s.seed), s.look)]));
export const staffLook = id => LOOKS[id];
export const KID = 0.82;   // дети в кадре меньше взрослых

// Фиорин у камина: сбоку от огня, с лютней, над ним плывут ноты. Рисуется до гостей — он за ними.
function drawBard(ctx, H, A, t) {
  const k = H.scale * (A.deep ? 0.55 : 0.42);
  const x = Math.min(A.fx + A.fw + 34 * k, H.stage.x + H.stage.w - 40 * k);
  const y = A.deep ? A.wallBottom + (H.guestTop - A.wallBottom) * 0.25 : A.wallBottom;
  drawGuest(ctx, LOOKS.fiorin, { m: 0, t }, x, y, k);
  ctx.save();
  ctx.translate(x, y - 20 * k);
  ctx.rotate(-0.5 + Math.sin(t * 3) * 0.05);
  ctx.fillStyle = '#9a5a2a'; ctx.beginPath(); ctx.ellipse(-8 * k, 0, 16 * k, 12 * k, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5a3418'; ctx.fillRect(6 * k, -3 * k, 34 * k, 6 * k);
  ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(-8 * k, 0, 4 * k, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f2d98a'; ctx.font = `${Math.max(10, Math.round(18 * k))}px serif`; ctx.textAlign = 'center';
  for (let n = 0; n < 3; n++) {
    const life = (t * 0.5 + n / 3) % 1;
    ctx.globalAlpha = (1 - life) * 0.9;
    ctx.fillText(n % 2 ? '♫' : '♪', x + 30 * k + Math.sin(t * 2 + n) * 10 * k, y - 150 * k - life * 60 * k);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

export function drawHallStaffBack(ctx, H, shift, A, t) {
  if (shift.cfg.staff.slow) drawBard(ctx, H, A, t);
}

// Шмыг встаёт на место ушедшего гостя, ростом с ребёнка: стойка или стол закрывает его по
// грудь. kind — рисовать только у стойки или только за столами (они на разной глубине).
export function drawHallStaffFront(ctx, H, shift, t, kind) {
  const i = shift.help.clear, P = H.seats[i];
  if (i < 0 || !P || P.kind !== kind) return;
  const k = P.scale * KID;
  drawGuest(ctx, LOOKS.shmyg, { m: 0, t }, P.cx, P.base + 8 * k, k);
}

// Тряпка Шмыга ходит по стойке или столу поверх посуды.
export function drawRag(ctx, H, shift, t, kind) {
  const i = shift.help.clear, P = H.seats[i];
  if (i < 0 || !P || P.kind !== kind) return;
  const x = P.cx + Math.sin(t * 12) * 18 * P.scale, y = P.spot.y + P.spot.h * 0.3;
  ctx.fillStyle = '#c9b48a';
  ctx.beginPath(); ctx.ellipse(x, y, 16 * P.scale, 6 * P.scale, Math.sin(t * 12) * 0.3, 0, Math.PI * 2); ctx.fill();
}

// Кухня: Ирма — над краном бочки (кивает, пока наливает), Тимка — у огня.
export function drawKitchenStaff(ctx, K, shift, t) {
  const S = shift.cfg.staff;
  if (S.pour) {
    const r = K.barrel, d = Math.min(r.w * 0.42, r.h * 0.42);
    const bob = shift.barrel.by ? Math.sin(t * 8) * 1.5 : 0;
    drawHead(ctx, LOOKS.irma, { m: 0, t }, r.x + r.w * 0.72, r.y + d * 0.5 + bob, d);
  }
  // Тимка — внизу слева у огня, будто раздувает мехи: вверху очага его голова закрыла бы мясо
  if (S.fire) {
    const hb = K.hearthBox, d = Math.min(hb.w * 0.28, hb.h * 0.32) * KID;
    drawHead(ctx, LOOKS.timka, { m: 0, t }, hb.x + d * 0.55, hb.y + hb.h - d * 0.6 - Math.abs(Math.sin(t * 4)) * 2, d);
  }
}
