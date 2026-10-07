// «Таверна у края Хмари» — сцена: диалог поверх пустого зала. Говорящий крупно (искатель —
// тот же векторный персонаж, Жар — лицо в пламени), плашка с именем и печатающимся текстом,
// «Пропустить». Что делает тап — решает main.js; здесь только рисунок.

import { SEEKERS, STAFF } from './data.js';
import { SPEAKERS } from './story.js';
import { decorOf } from './meta.js';
import { skyOf } from './story.js';
import { drawEmptyHall } from './hall.js';
import { drawGuest } from './chars.js';
import { seekerLook } from './morning.js';
import { drawZharPortrait } from './fire.js';
import { staffLook, KID } from './staff.js';
import { font, fitFont, wrap, COLOR } from './ui.js';
import { tr } from './i18n.js';

export const TYPE_SPEED = 45;   // знаков в секунду
export const typed = (scene, now) => Math.floor((now - scene.t0) * TYPE_SPEED);

// Искатель или помощник — бюстом над плашкой: тот же персонаж, что у стойки, только крупнее. Фигура в
// chars.js — 166 единиц от макушки до низа плеч (y = 110), низ плеч ставится на низ портрета;
// у рассказчика портрета нет.
function drawSpeaker(ctx, P, who, t, talk, fire = 1) {
  // Жар растёт вместе с огнём: пока тлеет — маленький огонёк у низа портрета
  if (who === 'zhar') { const k = 0.4 + 0.6 * fire; drawZharPortrait(ctx, { x: P.x + P.w * (1 - k) / 2, y: P.y + P.h * (1 - k), w: P.w * k, h: P.h * k }, t, talk); return; }
  const st = STAFF.find(s => s.id === who);
  if (!st && !SEEKERS.some(s => s.id === who)) return;
  const k = Math.min(P.w / 130, P.h / 175) * (st?.kid ? KID : 1);   // дети — ниже ростом
  drawGuest(ctx, st ? staffLook(who) : seekerLook(who), { m: 0, t, chew: talk }, P.x + P.w / 2, P.y + P.h - 30 * k, k);
}

// Кегль — самый крупный, при котором вся реплика влезает в плашку. Текст раскладывается по
// строкам целиком и открывается по знакам — строки не прыгают, пока печатается.
function drawBox(ctx, B, line, n, t) {
  ctx.fillStyle = COLOR.paper; ctx.beginPath(); ctx.roundRect(B.x, B.y, B.w, B.h, 14); ctx.fill();
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2; ctx.stroke();
  const name = tr(SPEAKERS[line.who] || '');
  const setFont = px => { ctx.font = name ? font(px, 500) : `italic ${font(px, 400)}`; };
  let px = Math.round(Math.min(22, Math.max(15, B.h * 0.12))), lines;
  for (;; px--) {
    setFont(px);
    lines = wrap(ctx, line.text, B.w - 32);
    if (28 + (name ? px * 1.5 : 0) + lines.length * px * 1.35 <= B.h || px <= 12) break;
  }
  let y = B.y + 14;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  if (name) {
    ctx.font = font(px, 700); ctx.fillStyle = '#8a3f1e';
    ctx.fillText(name, B.x + 16, y);
    y += px * 1.5;
    setFont(px);
  }
  ctx.fillStyle = COLOR.ink;
  let left = n;
  for (const l of lines) {
    if (left <= 0) break;
    ctx.fillText(l.slice(0, left), B.x + 16, y);
    left -= l.length + 1;
    y += px * 1.35;
  }
  if (n >= line.text.length && Math.sin(t * 5) > -0.3) {
    const x = B.x + B.w - 22, yy = B.y + B.h - 18;
    ctx.fillStyle = '#8a3f1e';
    ctx.beginPath(); ctx.moveTo(x - 7, yy - 4); ctx.lineTo(x + 7, yy - 4); ctx.lineTo(x, yy + 4); ctx.closePath(); ctx.fill();
  }
}

// Название игры поверх первого кадра.
function drawTitle(ctx, S, dt) {
  ctx.globalAlpha = Math.min(1, dt / 0.8);
  const px = Math.min(44, S.w / 11);
  ctx.font = font(px, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(12,7,4,0.8)';
  const title = tr('Таверна у края Хмари');
  ctx.strokeText(title, S.x + S.w / 2, S.y + S.h * 0.06); ctx.fillStyle = COLOR.gold; ctx.fillText(title, S.x + S.w / 2, S.y + S.h * 0.06);
  ctx.globalAlpha = 1; ctx.textAlign = 'left';
}

// Приглашение подкинуть полено: полено качается над очагом, подпись под ним.
function drawLogPrompt(ctx, H, t) {
  const S = H.stage, x = S.x + S.w * 0.62, y = S.y + (H.guestTop - S.y) * 0.25 + Math.sin(t * 4) * 6;
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.25);
  ctx.fillStyle = '#6b4423'; ctx.beginPath(); ctx.roundRect(-34, -10, 68, 20, 8); ctx.fill();
  ctx.fillStyle = '#c49a6a'; ctx.beginPath(); ctx.ellipse(34, 0, 6, 10, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.font = font(16, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillStyle = COLOR.gold;
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(12,7,4,0.85)';
  const s = tr('Тапни, подкинь полено');
  ctx.strokeText(s, x, y + 22); ctx.fillText(s, x, y + 22); ctx.textAlign = 'left';
}

function drawSkip(ctx, r) {
  ctx.fillStyle = 'rgba(28,18,12,0.85)'; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill();
  ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = COLOR.paper;
  const label = tr('Пропустить ›');
  fitFont(ctx, label, r.w - 16, 15, 11);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.textAlign = 'left';
}

// Сила огня в сцене: в пробуждении очаг тлеет, пока не подкинули полено (scene.lit), потом за
// 1,5 с разгорается. В остальных сценах — полный огонь.
export const fireOf = (scene, t) => (scene.id !== 'wake' ? 1 : scene.lit === undefined ? 0.15 : Math.min(1, 0.15 + (t - scene.lit) / 1.5));

export function drawScene(ctx, SL, scene, state, t) {
  const S = SL.stage, line = scene.lines[scene.k], n = typed(scene, t), fire = fireOf(scene, t);
  ctx.save();
  ctx.beginPath(); ctx.rect(S.x, S.y, S.w, S.h); ctx.clip();
  drawEmptyHall(ctx, SL.back, t, decorOf(state), skyOf(state), fire);
  // виньетка вместо ровной вуали: середина с огнём видна, края тонут во тьме
  const v = ctx.createRadialGradient(S.x + S.w / 2, S.y + S.h * 0.4, Math.min(S.w, S.h) * 0.2, S.x + S.w / 2, S.y + S.h * 0.4, Math.max(S.w, S.h) * 0.75);
  v.addColorStop(0, `rgba(12,7,4,${0.15 + 0.35 * (1 - fire)})`); v.addColorStop(1, 'rgba(12,7,4,0.85)');
  ctx.fillStyle = v; ctx.fillRect(S.x, S.y, S.w, S.h);
  if (scene.id === 'wake' && scene.k === 0) drawTitle(ctx, S, t - scene.t0);
  if (line.log && scene.lit === undefined && n >= line.text.length) drawLogPrompt(ctx, SL.back, t);
  drawSpeaker(ctx, SL.portrait, line.who, t, n < line.text.length, fire);
  drawBox(ctx, SL.box, line, n, t);
  drawSkip(ctx, SL.skip);
  ctx.restore();
}
