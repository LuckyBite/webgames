// «Таверна у края Хмари» — экран зала: гости у стойки лицом к игроку, за спинами камин.
// Свет по тезису: единственный тёплый источник — камин; в окне холодная Хмарь.

import { drawGuest, makeLook, moodValue } from './chars.js';
import { DISHES, OPENERS, SEEKERS, STAFF, RIDDLES } from './data.js';
import { drawPlate, drawMug } from './food.js';
import { lightHall, contactShadow } from './light.js';
import { mulberry32 } from './shift.js';
import { font, wrap, COLOR } from './ui.js';
import { drawFire } from './fire.js';
import { tr, list } from './i18n.js';
import { drawHallStaffBack, drawHallStaffFront, drawRag } from './staff.js';

// Сюжетный гость — искатель или будущий помощник (Фиорин приходит гостем).
const PEOPLE = [...SEEKERS, ...STAFF];

// Искатель выглядит всегда одинаково: генератор даёт основу, SEEKERS.look — неизменные черты.
const looks = new Map();
export function lookOf(g) {
  const key = g.id + ':' + g.seed;
  if (!looks.has(key)) {
    const look = makeLook(g.race, g.seed);
    const seeker = g.regular && PEOPLE.find(s => s.id === g.regular);
    if (seeker) Object.assign(look, seeker.look);
    looks.set(key, look);
  }
  return looks.get(key);
}

// Реплика заказа: блюда — с зачином по расе, загадка — своей фразой следом.
export function orderLine(g) {
  const r = mulberry32(g.seed ^ 0x9e3779b9);
  const opener = tr(OPENERS[g.race][Math.floor(r() * OPENERS[g.race].length)]);
  const names = g.items.filter(it => !it.riddle).map(it => tr(DISHES[it.dish].acc || DISHES[it.dish].name));
  const riddle = g.items.find(it => it.riddle);
  return [names.length ? `${opener} ${list(names)}.` : '', riddle ? tr(RIDDLES.find(x => x.id === riddle.riddle).text) : ''].filter(Boolean).join(' ');
}
export const hasRiddle = g => g.items.some(it => it.riddle && !it.served);

// Завсегдатаи за дальним столом — тёмные силуэты в свете свечи. Не гости игрока, а жизнь
// зала: заполнение по тезису, движение покоя — кивают над кружками.
function drawBackTable(ctx, cx, y, w, k, t, phase) {
  for (const side of [-1, 1]) {
    const x = cx + side * w * 0.42, bob = Math.sin(t * 1.3 + phase + side) * 1.5 * k;
    ctx.fillStyle = '#170e09';
    ctx.beginPath(); ctx.ellipse(x, y - 14 * k, 16 * k, 22 * k, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + side * 2 * k, y - 44 * k + bob, 11 * k, 12 * k, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#3a2416'; ctx.fillRect(cx - w / 2, y - 4 * k, w, 8 * k);
  ctx.fillRect(cx - w * 0.4, y, 5 * k, 22 * k); ctx.fillRect(cx + w * 0.4 - 5 * k, y, 5 * k, 22 * k);
  const glow = ctx.createRadialGradient(cx, y - 14 * k, 0, cx, y - 14 * k, 60 * k);
  glow.addColorStop(0, 'rgba(255,190,100,0.35)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(cx - 60 * k, y - 74 * k, 120 * k, 120 * k);
  ctx.fillStyle = '#efe2c4'; ctx.fillRect(cx - 2 * k, y - 16 * k, 4 * k, 12 * k);
  ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.ellipse(cx, y - 20 * k, 2.5 * k, 4 * k + Math.sin(t * 9 + phase), 0, 0, Math.PI * 2); ctx.fill();
}

function drawLamp(ctx, x, top, y, t, phase, lit = true) {
  const sway = Math.sin(t * 0.9 + phase) * 3;
  ctx.strokeStyle = '#1a100a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + sway, y); ctx.stroke();
  if (!lit) {
    ctx.fillStyle = '#2a1e16';
    ctx.beginPath(); ctx.moveTo(x + sway - 10, y); ctx.lineTo(x + sway + 10, y); ctx.lineTo(x + sway + 14, y + 16); ctx.lineTo(x + sway - 14, y + 16); ctx.closePath(); ctx.fill();
    return;
  }
  const glow = ctx.createRadialGradient(x + sway, y + 10, 0, x + sway, y + 10, 70);
  glow.addColorStop(0, 'rgba(255,190,100,0.4)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(x + sway - 70, y - 60, 140, 140);
  ctx.fillStyle = '#3a2a1e';
  ctx.beginPath(); ctx.moveTo(x + sway - 10, y); ctx.lineTo(x + sway + 10, y); ctx.lineTo(x + sway + 14, y + 16); ctx.lineTo(x + sway - 14, y + 16); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ffcf7a'; ctx.beginPath(); ctx.ellipse(x + sway, y + 19, 7, 5, 0, 0, Math.PI * 2); ctx.fill();
}

// fire — сила огня 0..1: в первой сцене очаг тлеет, пока игрок не подкинет полено (п. 14).
function drawBack(ctx, H, t, decor, sky, fire = 1) {
  const S = H.stage;
  const backH = H.guestTop - S.y, guestH = H.counter.y - H.guestTop;
  // Высокий кадр показывает зал вглубь: задняя стена → пол со столами → гости у стойки.
  // В низком (альбом) глубины нет — камин стоит прямо за спинами гостей.
  const deep = backH > guestH * 1.2;
  const wallBottom = deep ? S.y + backH * 0.62 : H.guestTop + guestH * 0.45;
  const wallH = deep ? wallBottom - S.y : backH;
  ctx.fillStyle = '#26170f'; ctx.fillRect(S.x, S.y, S.w, S.h);
  ctx.strokeStyle = '#2f1d13'; ctx.lineWidth = 3;
  for (let x = S.x + S.w / 10; x < S.x + S.w; x += S.w / 5) { ctx.beginPath(); ctx.moveTo(x, S.y); ctx.lineTo(x, deep ? wallBottom : H.counter.y); ctx.stroke(); }
  if (deep) {
    ctx.fillStyle = '#1d120b'; ctx.fillRect(S.x, wallBottom, S.w, H.counter.y - wallBottom);
    ctx.strokeStyle = '#26170f'; ctx.lineWidth = 2;
    for (let k = 1; k < 6; k++) {
      const y = wallBottom + (H.counter.y - wallBottom) * (k / 6) ** 1.6;   // доски пола сгущаются к стене
      ctx.beginPath(); ctx.moveTo(S.x, y); ctx.lineTo(S.x + S.w, y); ctx.stroke();
    }
    if (decor.includes('rug')) {
      const cx = S.x + S.w * 0.55, ry = wallBottom + (H.guestTop - wallBottom) * 0.3, rh = (H.guestTop - wallBottom) * 0.16;
      ctx.fillStyle = '#b8863a'; ctx.beginPath(); ctx.ellipse(cx, ry, S.w * 0.3, rh, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a2e2a'; ctx.beginPath(); ctx.ellipse(cx, ry, S.w * 0.27, rh * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  // окно в Хмарь: холодное, с текущим туманом. Туман густеет от главы к главе (story.skyOf),
  // после финала за стеклом рассвет — тёплое небо и редкая дымка
  const ww = Math.min(S.w * (deep ? 0.24 : 0.2), 160);
  const wh = Math.min(Math.max(40, wallH * 0.55), deep ? ww * 1.4 : Infinity);
  const wx = S.x + S.w * 0.07, wy = S.y + wallH * 0.15;
  const fog = sky ? sky.fog : 0.35, dawn = !!sky?.dawn;
  if (dawn) {
    const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
    g.addColorStop(0, '#5a6a9a'); g.addColorStop(0.55, '#e8a070'); g.addColorStop(1, '#ffd38a');
    ctx.fillStyle = g;
  } else ctx.fillStyle = '#2d3850';
  ctx.fillRect(wx, wy, ww, wh);
  ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
  if (dawn) { ctx.fillStyle = '#fff1c1'; ctx.beginPath(); ctx.arc(wx + ww * 0.62, wy + wh * 0.82, ww * 0.16, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = `rgba(110,122,150,${fog * 0.6})`; ctx.fillRect(wx, wy, ww, wh);   // общая пелена
  const banks = 2 + Math.round(fog * 4);
  for (let k = 0; k < banks; k++) {
    const fx = wx + ((t * (8 + k * 5) + k * 60) % (ww + 80)) - 40;
    ctx.fillStyle = dawn ? `rgba(255,230,200,${0.15 + k * 0.03})` : `rgba(120,135,165,${0.2 + fog * 0.25 + k * 0.04})`;
    ctx.beginPath(); ctx.ellipse(fx, wy + wh * (0.2 + (k % 4) * 0.2), 40 + fog * 20, 12 + fog * 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = '#1a100a'; ctx.lineWidth = 5; ctx.strokeRect(wx, wy, ww, wh);
  ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();

  // камин стоит у задней стены; в низком кадре огонь виден между плечами гостей
  const fw = Math.min(S.w * 0.34, 260), fh = Math.min((wallBottom - S.y) * 0.6, fw * 0.9);
  const fx = S.x + S.w * 0.62 - fw / 2, fy = wallBottom - fh;
  const flick = 0.92 + 0.08 * Math.sin(t * 7) * Math.sin(t * 3.1);
  const gcx = fx + fw / 2, gcy = fy + fh * 0.7;
  const glow = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, Math.max(S.w, S.h) * (0.2 + 0.35 * fire) * flick);
  glow.addColorStop(0, `rgba(255,150,60,${0.12 + 0.3 * fire})`); glow.addColorStop(0.5, 'rgba(200,90,30,0.14)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(S.x, S.y, S.w, S.h);
  ctx.fillStyle = '#4a4038'; ctx.fillRect(fx, fy, fw, fh);
  ctx.fillStyle = '#5a5046'; ctx.fillRect(fx - 8, fy - 10, fw + 16, 14);
  ctx.fillStyle = '#140b07'; ctx.fillRect(fx + fw * 0.15, fy + fh * 0.3, fw * 0.7, fh * 0.7);
  drawFire(ctx, fx + fw / 2, fy + fh, fw * 0.62 * (0.4 + 0.6 * fire), fh * 0.62 * (0.15 + 0.85 * fire), t, { logs: true, seed: 5, sparks: fire > 0.5 });

  // полка с кружками
  const sx = S.x + S.w * 0.8, sy = S.y + wallH * 0.3, sw = Math.min(S.w * 0.16, 130);
  ctx.fillStyle = '#4a2f1d'; ctx.fillRect(sx, sy, sw, 6);
  for (let k = 0; k < 3; k++) { ctx.fillStyle = '#8a5a34'; ctx.fillRect(sx + 6 + k * (sw / 3), sy - 18, sw / 3 - 12, 18); }

  if (decor.includes('banner')) {
    const bw = Math.min(S.w * 0.1, 56), bh = Math.max(40, wallH * 0.32), bx = sx + sw / 2 - bw / 2, by = sy + 14;
    ctx.fillStyle = '#4a2a5a';
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw / 2, by + bh - bw * 0.35); ctx.lineTo(bx, by + bh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d8b25a'; ctx.beginPath(); ctx.arc(bx + bw / 2, by + bh * 0.4, bw * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b4423'; ctx.fillRect(bx - 4, by - 4, bw + 8, 5);
  }
  if (decor.includes('antlers')) {
    const ax = fx + fw / 2, ay = fy - 16;
    ctx.strokeStyle = '#d8c8a8'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const s of [-1, 1]) {
      ctx.moveTo(ax + s * 6, ay); ctx.quadraticCurveTo(ax + s * 34, ay - 6, ax + s * 44, ay - 30);
      ctx.moveTo(ax + s * 24, ay - 6); ctx.lineTo(ax + s * 26, ay - 24);
      ctx.moveTo(ax + s * 36, ay - 14); ctx.lineTo(ax + s * 48, ay - 16);
    }
    ctx.stroke();
    ctx.fillStyle = '#6b4a2e'; ctx.beginPath(); ctx.ellipse(ax, ay, 10, 7, 0, 0, Math.PI * 2); ctx.fill();
  }

  if (deep) {
    const lampY = S.y + wallH * 0.22;
    // лампы загораются по очереди, когда огонь разгорелся
    drawLamp(ctx, S.x + S.w * 0.38, S.y, lampY, t, 0, fire > 0.6);
    drawLamp(ctx, S.x + S.w * 0.68, S.y, lampY * 0.9 + S.y * 0.1, t, 2, fire > 0.85);
  }
  return { fx, fy, fw, fh, wallBottom, deep };   // где камин и пол — бард встаёт рядом (staff.js)
}

// Посуда и монеты за ушедшим гостем на его месте — тап по месту собирает. y — где лежат.
function drawDirty(ctx, sp, y, amount, size) {
  const cx = sp.x + sp.w / 2, d = Math.min(sp.w * 0.5, size);
  ctx.fillStyle = '#b8ad96'; ctx.beginPath(); ctx.ellipse(cx - d * 0.2, y, d * 0.45, d * 0.18, 0, 0, Math.PI * 2); ctx.fill();
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = k % 2 ? '#e8b84a' : '#ffd166';
    ctx.beginPath(); ctx.ellipse(cx + d * 0.35, y - k * d * 0.08, d * 0.16, d * 0.07, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = COLOR.gold; ctx.font = font(Math.max(12, d * 0.28), 700);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,8,0.7)'; ctx.strokeText('+' + amount, cx, y + d * 0.38);
  ctx.fillText('+' + amount, cx, y + d * 0.38);
  ctx.textAlign = 'left';
}

function drawCounter(ctx, H, shift) {
  const c = H.counter;
  ctx.fillStyle = '#6b4423'; ctx.fillRect(c.x, c.y, c.w, c.h);
  ctx.fillStyle = '#8a5a36'; ctx.fillRect(c.x, c.y, c.w, Math.max(4, c.h * 0.08));
  ctx.strokeStyle = '#583719'; ctx.lineWidth = 2;
  for (let k = 1; k < 4; k++) { const y = c.y + (c.h * k) / 4; ctx.beginPath(); ctx.moveTo(c.x, y); ctx.lineTo(c.x + c.w, y); ctx.stroke(); }
  if (!shift) return;
  shift.seats.forEach((seat, i) => {
    const P = H.seats[i];
    if (seat.guest && P.kind === 'counter') contactShadow(ctx, P.cx, c.y + c.h * 0.06, 90 * P.scale, 0.9);
  });
  shift.seats.forEach((seat, i) => {
    if (seat.dirty && H.seats[i].kind === 'counter') drawDirty(ctx, H.seats[i].spot, c.y + c.h * 0.35, seat.dirty, c.h * 0.9);
  });
}

// Стол на двоих: столешница, край, свеча посередине со своим светом. Ножки уходят за гостей стойки.
function drawTable(ctx, r, t, k) {
  const glow = ctx.createRadialGradient(r.x + r.w / 2, r.y, 0, r.x + r.w / 2, r.y, r.w * 0.6);
  glow.addColorStop(0, 'rgba(255,190,100,0.28)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow; ctx.fillRect(r.x - r.w * 0.2, r.y - r.w * 0.6, r.w * 1.4, r.w * 1.2);
  ctx.fillStyle = '#3a2416';
  ctx.fillRect(r.x + r.w * 0.08, r.y + r.h, r.w * 0.06, r.h * 3);
  ctx.fillRect(r.x + r.w * 0.86, r.y + r.h, r.w * 0.06, r.h * 3);
  ctx.fillStyle = '#5a3820'; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, r.h * 0.3); ctx.fill();
  ctx.fillStyle = '#7a4e2c'; ctx.fillRect(r.x + 2, r.y, r.w - 4, Math.max(2, r.h * 0.35));
  const cx = r.x + r.w / 2, ch = r.h * 1.1;
  ctx.fillStyle = '#efe2c4'; ctx.fillRect(cx - r.h * 0.12, r.y - ch, r.h * 0.24, ch);
  ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.ellipse(cx, r.y - ch - r.h * 0.25, r.h * 0.13, r.h * 0.26 + Math.sin(t * 9 + k) * 0.6, 0, 0, Math.PI * 2); ctx.fill();
}

function drawTables(ctx, H, shift, t) {
  H.tables.forEach((r, k) => {
    drawTable(ctx, r, t, k);
    if (!shift) return;
    shift.seats.forEach((seat, i) => {
      if (seat.dirty && H.seats[i].kind === 'table' && H.seats[i].table === k) drawDirty(ctx, H.seats[i].spot, r.y + r.h * 0.2, seat.dirty, r.h * 2.6);
    });
  });
}

// Реакция гостя на подачу (main.js кладёт ui.react[место] = { id, kind, t0 }): «joy» — сияет и
// подпрыгивает, «meh» — хмурится, «no» — мотает головой. Возвращает мимику и смещения или null.
export const REACT_SEC = 0.9;
export function reaction(ui, i, g, t) {
  const re = ui.react?.[i];
  if (!re || re.id !== g.id || t - re.t0 > REACT_SEC) return null;
  const k = (t - re.t0) / REACT_SEC;
  if (re.kind === 'joy') return { m: -1, hop: Math.max(0, Math.sin(Math.min(1, k * 2.2) * Math.PI)) * 0.6, shake: 0 };
  if (re.kind === 'meh') return { m: 1.2, hop: 0, shake: 0 };
  return { m: 1.7, hop: 0, shake: Math.sin(k * 28) * (1 - k) * 0.6 };
}

// Где на стойке или столе стоит еда гостя и лежат монеты за ним: точка и размер.
function spotOf(H, P) {
  if (P.kind === 'counter') return { x: P.spot.x + P.spot.w / 2, y: H.counter.y + H.counter.h * 0.35, d: Math.min(P.spot.w * 0.5, H.counter.h * 0.9) };
  const r = H.tables[P.table];
  return { x: P.spot.x + P.spot.w / 2, y: r.y + r.h * 0.2, d: Math.min(P.spot.w * 0.5, r.h * 2.6) };
}

// Еда перед гостем, пока он ест (main.js кладёт ui.meal[место] = { id, items, total }): тарелка и
// кружка, части тают по мере еды, эль убывает.
function drawMeals(ctx, H, shift, ui, t, kind) {
  shift.seats.forEach((seat, i) => {
    const g = seat.guest, P = H.seats[i], meal = ui.meal?.[i];
    if (!g || P.kind !== kind || !meal || meal.id !== g.id || !(g.eating > 0)) return;
    const { x, y, d } = spotOf(H, P), left = Math.max(0, Math.min(1, g.eating / meal.total));
    contactShadow(ctx, x, y + d * 0.14, d * 1.2, 0.7);
    const n = meal.items.length;
    meal.items.forEach((dish, k) => {
      const ox = n > 1 ? (k - (n - 1) / 2) * d * 0.62 : 0, D = DISHES[dish];
      if (D.drink) drawMug(ctx, x + ox, y - d * 0.12, d * 0.62, 0.15 + 0.8 * left, 'full', t);
      else drawPlate(ctx, D.parts.slice(0, Math.max(0, Math.ceil(D.parts.length * left - 0.01))), x + ox, y, d * 1.1);
    });
  });
}

// Уходящие (ui.leaving): сытый подпрыгивает и опускается за стойку или стол, злой мотает
// головой и уходит вбок. Рисуются там же, где сидели, до стойки — она их и закрывает.
function drawLeaving(ctx, H, ui, t, kind) {
  ui.leaving = (ui.leaving || []).filter(l => t - l.t0 < 0.8);
  for (const l of ui.leaving) {
    const P = H.seats[l.seat];
    if (!P || P.kind !== kind) continue;
    const k = (t - l.t0) / 0.8;
    if (l.angry) {
      const dx = (k * k) * H.stage.w * 0.7 * (P.cx < H.stage.x + H.stage.w / 2 ? -1 : 1) + Math.sin(k * 30) * 4 * (1 - k);
      ctx.globalAlpha = 1 - k * 0.5;
      drawGuest(ctx, l.look, { m: 2, t }, P.cx + dx, P.base, P.scale);
    } else {
      const hop = k < 0.3 ? -Math.sin(k / 0.3 * Math.PI) * 10 * P.scale / 0.6 : ((k - 0.3) / 0.7) ** 2 * 150 * P.scale;
      drawGuest(ctx, l.look, { m: -1, t }, P.cx, P.base + hop, P.scale);
    }
    ctx.globalAlpha = 1;
  }
}

// Зал без гостей — фон сцен.
export function drawEmptyHall(ctx, H, t, decor, sky, fire = 1) {
  drawBack(ctx, H, t, decor, sky, fire);
  drawTables(ctx, H, null, t);
  drawCounter(ctx, H, null);
}

function exclaim(ctx, x, y, t) {
  const bob = Math.sin(t * 6) * 3;
  ctx.fillStyle = '#f2b84b'; ctx.beginPath(); ctx.arc(x, y - 16 + bob, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.font = font(20, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('!', x, y - 15 + bob);
  ctx.textAlign = 'left';
}

function speech(ctx, H, cx, top, text) {
  const S = H.stage;
  const px = Math.max(13, Math.min(17, S.w / 26));
  ctx.font = font(px, 400);
  const maxW = Math.min(S.w - 24, 260);
  const lines = wrap(ctx, text, maxW - 24);
  const w = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width)) + 24);
  const lh = px * 1.3, h = lines.length * lh + 16;
  const x = Math.max(S.x + 12, Math.min(S.x + S.w - 12 - w, cx - w / 2));
  const y = Math.max(S.y + 8, top - h - 30);
  ctx.fillStyle = COLOR.paper;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx - 8, y + h - 1); ctx.lineTo(cx + 8, y + h - 1); ctx.lineTo(cx, y + h + 12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  lines.forEach((l, k) => ctx.fillText(l, x + 12, y + 8 + k * lh));
}

// Табличка с именем на стойке перед искателем — чтобы своих отличали от прохожих.
function namePlate(ctx, H, cx, name) {
  const c = H.counter;
  ctx.font = font(Math.max(11, Math.min(14, c.h * 0.22)), 700);
  const w = ctx.measureText(name).width + 16, h = Math.max(18, c.h * 0.3), y = c.y + c.h * 0.62;
  ctx.fillStyle = COLOR.paper; ctx.beginPath(); ctx.roundRect(cx - w / 2, y, w, h, 6); ctx.fill();
  ctx.fillStyle = COLOR.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, cx, y + h / 2 + 1);
  ctx.textAlign = 'left';
}

export function drawHall(ctx, H, shift, ui, t) {
  const S = H.stage, R = shift.rules;
  ctx.save();
  ctx.beginPath(); ctx.rect(S.x, S.y, S.w, S.h); ctx.clip();
  const A = drawBack(ctx, H, t, shift.cfg.decor, shift.cfg.sky);
  drawHallStaffBack(ctx, H, shift, A, t);
  // сначала дальние — за столами, потом стол, потом ближние — у стойки и сама стойка
  const guest = kind => {
    drawLeaving(ctx, H, ui, t, kind);
    shift.seats.forEach((seat, i) => {
      const g = seat.guest, P = H.seats[i];
      if (!g || P.kind !== kind) return;
      // ест — доволен; иначе лицо по терпению; поверх — реакция на подачу (ui.react)
      let m = g.eating > 0 ? -0.35 : moodValue(g.patience / g.patienceMax, R.moodCalm, R.moodAngry);
      const re = reaction(ui, i, g, t);
      let dx = 0, dy = 0;
      if (re) {
        m = re.m;
        dy = -re.hop * 8 * P.scale / 0.6;
        dx = re.shake * 6 * P.scale / 0.6;
      }
      const born = ui.born[g.id];
      const rise = born === undefined ? 0 : Math.max(0, 1 - (t - born) / 0.35);   // поднимается из-за стола или стойки
      drawGuest(ctx, lookOf(g), { m, t, chew: g.eating > 0 && !re }, P.cx + dx, P.base + rise * 60 * P.scale + dy, P.scale);
    });
  };
  guest('table');
  drawHallStaffFront(ctx, H, shift, t, 'table');
  drawTables(ctx, H, shift, t);
  drawMeals(ctx, H, shift, ui, t, 'table');
  drawRag(ctx, H, shift, t, 'table');
  guest('counter');
  drawHallStaffFront(ctx, H, shift, t, 'counter');
  drawCounter(ctx, H, shift);
  drawMeals(ctx, H, shift, ui, t, 'counter');
  drawRag(ctx, H, shift, t, 'counter');
  lightHall(ctx, H, shift, t, A);   // свет от очага — до «!», табличек и реплик: их не темнить
  shift.seats.forEach((seat, i) => {
    const g = seat.guest, P = H.seats[i];
    if (g && !g.taken) exclaim(ctx, P.cx, P.top - 6, t);
    if (g && g.regular && P.kind === 'counter') namePlate(ctx, H, P.cx, tr(PEOPLE.find(s => s.id === g.regular).name));
    const sp = ui.speech[i];
    if (g && sp && sp.id === g.id && t < sp.until) speech(ctx, H, P.cx, P.top, tr(g.line) || orderLine(g));
  });
  ctx.restore();
}
