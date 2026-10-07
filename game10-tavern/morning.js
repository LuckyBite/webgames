// «Таверна у края Хмари» — экран утра: карта маршрутов, искатели, лавка улучшений и
// рецептов, кнопка «Открыть таверну». Только рисует состояние меты (meta.js); что делает
// тап — решает main.js.

import { SEEKERS, DISHES, INGREDIENTS } from './data.js';
import { routes, shopItems, staffList, levelOf, canGo } from './meta.js';
import { drawHead, makeLook } from './chars.js';
import { drawItem, drawMug, drawDishIcon } from './food.js';
import { drawFire } from './fire.js';
import { AVATAR, shopIcon, shopCompact } from './layout.js';
import { font, fitFont, wrap, COLOR } from './ui.js';
import { feastReady } from './story.js';
import { staffLook } from './staff.js';
import { tr, tf, list } from './i18n.js';

const LOOKS = Object.fromEntries(SEEKERS.map(s => [s.id, Object.assign(makeLook(s.race, s.seed), s.look)]));
export function seekerLook(id) { return LOOKS[id]; }

const ROUTE_COLOR = { forest: '#6f9a4a', marsh: '#4a8a8a', ruins: '#9a8a5a', peaks: '#8a7a9a', edge: '#5a6a8a' };
const center = r => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const two = v => String(v).padStart(2, '0');
  return h ? `${h}:${two(m)}:${two(ss)}` : `${m}:${two(ss)}`;
}

function panel(ctx, r, fill, stroke) {
  ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
}

function drawMap(ctx, M, state, ui, t) {
  const m = M.map;
  panel(ctx, m, '#e3d2a4');
  ctx.strokeStyle = '#b89a62'; ctx.lineWidth = 2; ctx.strokeRect(m.x + 6, m.y + 6, m.w - 12, m.h - 12);
  // таверна — в левом верхнем углу (внизу её закрывала бы подпись ближнего маршрута),
  // дорога к маршрутам пунктиром
  const hx = m.x + 26, hy = m.y + 34;
  ctx.fillStyle = '#6b4423'; ctx.fillRect(hx - 10, hy - 8, 20, 14);
  ctx.fillStyle = '#8a3f1e'; ctx.beginPath(); ctx.moveTo(hx - 13, hy - 8); ctx.lineTo(hx, hy - 20); ctx.lineTo(hx + 13, hy - 8); ctx.closePath(); ctx.fill();
  ctx.setLineDash([6, 6]); ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(hx, hy);
  for (const p of M.routes) { const c = center(p.r); ctx.lineTo(c.x, c.y); }
  ctx.stroke(); ctx.setLineDash([]);
  const rs = routes(state);
  M.routes.forEach((p, k) => {
    const r = rs[k], c = center(p.r), d = p.r.w;
    ctx.fillStyle = r.open ? ROUTE_COLOR[r.id] : '#b8a88a';
    ctx.beginPath(); ctx.arc(c.x, c.y, d / 2, 0, Math.PI * 2); ctx.fill();
    const fits = !ui.selected || canGo(state.seekers[ui.selected], r);
    if (ui.selected && r.open && fits) { ctx.strokeStyle = '#fff1c1'; ctx.lineWidth = 3 + Math.sin(t * 6) * 1.5; ctx.stroke(); }
    ctx.globalAlpha = r.open ? 1 : 0.45;
    drawItem(ctx, r.loot[0][0], c.x, c.y, d * 0.62);
    ctx.globalAlpha = 1;
    // подпись в две строки, название и время: пять маршрутов по одной строке не помещаются
    const sub = !r.open ? (r.closed === 'story' ? tr('закрыто') : tf('слава {n}', { n: r.fame })) : fits ? tf('{n} мин', { n: r.minutes }) : tf('нужен ур. {n}', { n: r.level });
    const rname = tr(r.name);
    const px = fitFont(ctx, rname, Math.min(m.w * 0.3, 150), 12, 9);
    // подпись крайнего маршрута не выходит за край карты: центр сдвигается внутрь
    const half = ctx.measureText(rname).width / 2 + 4;
    const lx = Math.max(m.x + half, Math.min(m.x + m.w - half, c.x));
    const ly = Math.min(p.r.y + d + 2, m.y + m.h - 2 * px - 6);
    ctx.fillStyle = COLOR.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(rname, lx, ly);
    ctx.font = font(px - 1, 400); ctx.fillStyle = '#6b4a2a';
    ctx.fillText(sub, lx, ly + px + 1);
    ctx.textAlign = 'left';
  });
}

// Что даёт покупка — простыми словами по apply из data.js UPGRADES. У рецепта описание
// собирается из состава и цены блюда (recipeDesc).
export const UPGRADE_DESC = {
  grill: 'Три места на очаге, жарит быстрее, жаркое дороже',
  forge: 'Жарит ещё быстрее, жаркое ещё дороже',
  cauldron: 'Котёл на кухне, варит грибную похлёбку',
  copper: 'Варит быстрее, похлёбка дороже',
  cauldron2: 'Два котла на кухне, похлёбка ещё дороже',
  tap: 'Эль льётся быстрее, налить ровно проще',
  darkale: 'Эль вдвое дороже',
  rug: 'Гости ждут дольше, чаевые больше',
  banner: 'Гости ждут ещё дольше, чаевые больше',
  antlers: 'Гости ждут намного дольше, чаевые больше',
  knife: 'Режет быстрее: на продукт на удар меньше',
};

export function recipeDesc(id) {
  const d = DISHES[id];
  const parts = list(d.parts.map(p => tr(INGREDIENTS[p].name)));
  const text = tf('{parts} · {n} монет', { parts: parts.charAt(0).toUpperCase() + parts.slice(1), n: d.price });
  // неразрывные пробелы: цена с «монет» и точка не отрываются при переносе
  return text.replace(' · ', ' · ').replace(/(\d) /g, '$1 ');
}

export function shopDesc(it) {
  if (it.kind === 'goods') return tf('Торговец: +{n} в кладовую на сегодня и дальше', { n: it.n });
  return it.kind === 'recipe' ? recipeDesc(it.id) : tr(UPGRADE_DESC[it.id] || '');
}

// Кегль с весом: fitFont из ui.js знает только вес 500.
function fitW(ctx, text, maxW, px, minPx, weight) {
  let size = px;
  ctx.font = font(size, weight);
  while (size > minPx && ctx.measureText(text).width > maxW) { size -= 1; ctx.font = font(size, weight); }
  return size;
}

// Строки статуса: «в пути · 5:00» рвётся по точке, остальное — по словам; не больше двух.
function statusLines(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return [text];
  if (text.includes(' · ')) return text.split(' · ');
  const lines = wrap(ctx, text, maxW);
  return lines.length <= 2 ? lines : [lines[0], lines.slice(1).join(' ')];
}

// Пустой силуэт вместо портрета: имя сюжет заранее не выдаёт.
function silhouette(ctx, cx, cy, d) {
  ctx.fillStyle = '#1a110b'; ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2a1b12'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#3a2a1e';
  ctx.beginPath(); ctx.arc(cx, cy - d * 0.1, d * 0.2, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, cy + d * 0.36, d * 0.32, d * 0.2, 0, Math.PI, 0); ctx.fill();
}

// Мешок с добычей у портрета: искатель вернулся, добычу пора забрать.
function sack(ctx, cx, cy, s) {
  ctx.fillStyle = '#a8794a'; ctx.strokeStyle = '#3a2519'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.12, s * 0.42, s * 0.38, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - s * 0.16, cy - s * 0.2); ctx.lineTo(cx, cy - s * 0.46); ctx.lineTo(cx + s * 0.16, cy - s * 0.2); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#6b4423'; ctx.fillRect(cx - s * 0.2, cy - s * 0.24, s * 0.4, s * 0.09);
  ctx.fillStyle = COLOR.gold; ctx.beginPath(); ctx.arc(cx + s * 0.08, cy + s * 0.16, s * 0.1, 0, Math.PI * 2); ctx.fill();
}

// Где что в карточке искателя: портрет сверху, под ним имя и статус. В широкой карточке (одна
// на всю ширину) портрет слева, текст справа.
function cardBlock(r) {
  // портрет не меньше 48; в высокой карточке широкого экрана — крупнее
  const d = Math.round(Math.max(AVATAR, Math.min(84, r.w * 0.6, r.h - 64)));
  if (r.w >= 220) {
    const cx = r.x + 10 + d / 2, cy = r.y + r.h / 2, tx = cx + d / 2 + 12;
    return { across: true, d, cx, cy, tx, tw: r.x + r.w - tx - 8, ny: cy - 11, sy: cy + 11 };
  }
  const blockH = d + 4 + 16 + 2 * 14, oy = r.y + Math.max(6, (r.h - blockH) / 2);
  return { across: false, d, cx: r.x + r.w / 2, cy: oy + d / 2, tx: r.x + r.w / 2, tw: r.w - 8, ny: oy + d + 12, sy: oy + d + 27 };
}

function drawText(ctx, B, name, status, nameColor, statusColor) {
  ctx.textAlign = B.across ? 'left' : 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = nameColor;
  fitW(ctx, name, B.tw, 15, 10, 700);
  ctx.fillText(name, B.tx, B.ny);
  ctx.fillStyle = statusColor;
  const px = fitW(ctx, status, B.tw, 13, 11, 500);
  const lines = statusLines(ctx, status, B.tw);
  lines.forEach((l, k) => {
    ctx.font = font(px, 500);
    if (ctx.measureText(l).width > B.tw) fitW(ctx, l, B.tw, px, 9, 500);
    ctx.fillText(l, B.tx, B.sy + k * 14);
  });
  ctx.textAlign = 'left';
}

// Не пришедшие искатели одной карточкой: силуэты внахлёст и «скоро придут». Без c.joined в
// раскладке у каждого своя карточка — тогда один силуэт и «пока никого».
function drawSoonCard(ctx, r, n) {
  panel(ctx, r, '#2a1b12');
  const B = cardBlock(r);
  const k = Math.max(1, Math.min(3, n)), step = B.d * 0.42;
  const x0 = B.across ? B.cx : B.cx - ((k - 1) * step) / 2;
  for (let j = k - 1; j >= 0; j--) silhouette(ctx, x0 + j * step, B.cy, B.d);
  if (B.across) { B.tx += (k - 1) * step; B.tw -= (k - 1) * step; }
  const text = n > 1 ? tr('скоро придут') : n === 1 ? tr('скоро придёт') : tr('пока никого');
  // имени нет — строка статуса встаёт на его место, по середине под силуэтами (или справа)
  drawText(ctx, { ...B, sy: B.across ? B.cy : B.ny + 6 }, '', text, '#8a7a60', '#8a7a60');
}

function drawCrew(ctx, M, state, ui, now, t) {
  for (const { id, soon, r } of M.seekers) {
    const def = SEEKERS.find(s => s.id === id), s = state.seekers[id], sel = ui.selected === id;
    if (soon) { drawSoonCard(ctx, r, soon.filter(x => !state.seekers[x].joined).length); continue; }
    if (!s.joined) { drawSoonCard(ctx, r, 0); continue; }
    const back = s.state === 'back';
    panel(ctx, r, sel ? '#5a3a24' : back ? '#4a3018' : '#3a2519', sel || back ? COLOR.gold : null);
    if (back) {   // золотая рамка дышит, пока добычу не забрали
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 4);
      ctx.strokeStyle = COLOR.gold; ctx.lineWidth = 5; ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 12); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const B = cardBlock(r), { d, cx, cy } = B;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fillStyle = '#1a110b'; ctx.fill(); ctx.clip();
    drawHead(ctx, seekerLook(id), { m: 0, t }, cx, cy + d * 0.06, d * 1.05);
    ctx.restore();
    // уровень — значком на портрете: растёт с походами, открывает дальние маршруты
    const lv = levelOf(s).level, br = 10, bx = cx + d * 0.42, by = cy + d * 0.36;
    ctx.fillStyle = '#d8a84a'; ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2519'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = COLOR.ink; ctx.font = font(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(lv), bx, by + 0.5);
    ctx.textAlign = 'left';
    if (back) sack(ctx, cx - d * 0.44, cy + d * 0.28 + Math.sin(t * 5) * 1.5, 22);
    const status = s.state === 'away' ? tf('в пути · {time}', { time: clock(s.returnAt - now) })
      : tr(back ? 'забери добычу' : sel ? 'выбери маршрут' : s.fed ? 'дома, после обеда' : 'дома');
    drawText(ctx, B, tr(def.name), status, COLOR.paper, back ? COLOR.gold : '#c9b48a');
  }
}

// ---------- лавка ----------

// Рисунок товара кодом в квадрате b: огонь с жарким — очагу, котёл — котлам, кружка — элю,
// убранство — само собой, рецепт — тарелкой с его составом.
function drawShopIcon(ctx, it, b, t) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, s = b.w;
  if (it.kind === 'recipe') { drawDishIcon(ctx, it.id, cx, cy, s * 0.95); return; }
  if (it.kind === 'goods') { drawItem(ctx, it.id, cx, cy, s * 0.8); return; }
  if (it.id === 'knife') {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.6);
    ctx.fillStyle = '#d8dde0'; ctx.beginPath(); ctx.moveTo(-s * 0.05, -s * 0.06); ctx.lineTo(s * 0.4, -s * 0.06); ctx.lineTo(s * 0.32, s * 0.08); ctx.lineTo(-s * 0.05, s * 0.06); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a2a14'; ctx.beginPath(); ctx.roundRect(-s * 0.38, -s * 0.06, s * 0.34, s * 0.12, 3); ctx.fill();
    ctx.restore();
    return;
  }
  switch (it.id) {
    case 'grill': case 'forge': {
      drawFire(ctx, cx, b.y + s * 0.98, s * 0.8, s * 0.5, t, { logs: true, sparks: false, seed: 3 });
      ctx.strokeStyle = '#2a2420'; ctx.lineWidth = Math.max(2, s * 0.05);
      const gy = b.y + s * 0.52;
      ctx.beginPath(); ctx.moveTo(b.x + s * 0.08, gy); ctx.lineTo(b.x + s * 0.92, gy);
      if (it.id === 'forge') for (let k = 1; k < 6; k++) { const x = b.x + s * (0.08 + k * 0.14); ctx.moveTo(x, gy - s * 0.07); ctx.lineTo(x, gy + s * 0.07); }
      ctx.stroke();
      drawItem(ctx, 'roast', cx, gy - s * 0.16, s * 0.5);
      return;
    }
    case 'cauldron': case 'copper': case 'cauldron2': {
      const two = it.id === 'cauldron2', pots = two ? [cx - s * 0.23, cx + s * 0.23] : [cx];
      const pw = s * (two ? 0.46 : 0.8), copper = it.id === 'copper';
      drawFire(ctx, cx, b.y + s, s * 0.7, s * 0.3, t, { sparks: false, seed: 5 });
      for (const px of pots) {
        const py = b.y + s * 0.5, ph = pw * 0.8;
        ctx.fillStyle = copper ? '#b8693a' : '#1e1a18';
        ctx.beginPath(); ctx.ellipse(px, py, pw / 2, ph / 2, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = copper ? '#d88a52' : '#3a3430';
        ctx.beginPath(); ctx.ellipse(px, py, pw / 2, ph * 0.18, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#c07a2e'; ctx.beginPath(); ctx.ellipse(px, py, pw * 0.42, ph * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    case 'tap': case 'darkale':
      ctx.save();
      if (it.id === 'darkale') ctx.filter = 'brightness(0.55) saturate(1.3)';
      drawMug(ctx, cx - s * 0.05, cy, s * 0.8, 0.9, 'full', t);
      ctx.restore();
      return;
    case 'rug':
      ctx.fillStyle = '#b8863a'; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.08, s * 0.47, s * 0.27, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#7a2e2a'; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.08, s * 0.39, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d8b25a'; ctx.beginPath(); ctx.ellipse(cx, cy + s * 0.08, s * 0.14, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      return;
    case 'banner': {
      const bw = s * 0.5, bh = s * 0.8, bx = cx - bw / 2, by = b.y + s * 0.12;
      ctx.fillStyle = '#4a2a5a';
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + bw, by); ctx.lineTo(bx + bw, by + bh);
      ctx.lineTo(cx, by + bh - bw * 0.35); ctx.lineTo(bx, by + bh); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#d8b25a'; ctx.beginPath(); ctx.arc(cx, by + bh * 0.4, bw * 0.22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6b4423'; ctx.fillRect(bx - s * 0.06, by - s * 0.06, bw + s * 0.12, s * 0.08);
      return;
    }
    case 'antlers': {
      const k = s / 100, ay = cy + s * 0.22;
      ctx.strokeStyle = '#d8c8a8'; ctx.lineWidth = Math.max(2, 6 * k); ctx.lineCap = 'round';
      ctx.beginPath();
      for (const sg of [-1, 1]) {
        ctx.moveTo(cx + sg * 8 * k, ay); ctx.quadraticCurveTo(cx + sg * 34 * k, ay - 8 * k, cx + sg * 44 * k, ay - 52 * k);
        ctx.moveTo(cx + sg * 22 * k, ay - 6 * k); ctx.lineTo(cx + sg * 22 * k, ay - 34 * k);
        ctx.moveTo(cx + sg * 36 * k, ay - 20 * k); ctx.lineTo(cx + sg * 48 * k, ay - 26 * k);
      }
      ctx.stroke(); ctx.lineCap = 'butt';
      ctx.fillStyle = '#6b4a2e'; ctx.beginPath(); ctx.ellipse(cx, ay, 14 * k, 10 * k, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
  }
}

// Описание под именем: кегль уменьшается, пока строки не влезут по высоте; если и мелким не
// влезает — последняя строка с многоточием.
function drawDesc(ctx, text, x, y, maxW, maxH, color, start = 12) {
  if (!text || maxH < 10) return;
  let px = start, lines;
  for (;; px--) {
    ctx.font = font(px, 400);
    lines = wrap(ctx, text, maxW);
    if (px <= 9 || lines.length * px * 1.2 <= maxH) break;
  }
  const fit = Math.max(1, Math.floor(maxH / (px * 1.2)));
  if (lines.length > fit) {
    lines = lines.slice(0, fit);
    let last = lines[fit - 1];
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    lines[fit - 1] = last.trimEnd() + '…';
  }
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  lines.forEach((l, k) => ctx.fillText(l, x, y + k * px * 1.2));
}

function coin(ctx, x, y, r) { ctx.fillStyle = COLOR.gold; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

// Цена (монета и число) или порог славы (звезда); до порога товар виден, но не продаётся.
// align: 'center' — под рисунком узкой карточки, 'left' — в тексте низкой, 'right' — в строке.
function priceText(it, short) {
  return it.locked ? (short ? String(it.fame) : tf('слава {n}', { n: it.fame })) : String(it.price);
}
function drawPrice(ctx, it, x, y, align) {
  const short = align !== 'right', text = priceText(it, short);
  ctx.font = font(13, 700);
  const w = ctx.measureText(text).width + 16, x0 = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
  if (it.locked) star(ctx, x0 + 6, y, 7, '#8a7a60'); else coin(ctx, x0 + 6, y, 6);
  ctx.font = font(13, 700);
  ctx.fillStyle = it.locked || !it.can ? '#9a8a70' : COLOR.gold; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x0 + 16, y + 0.5);
  return w;
}

function drawBuyButton(ctx, r, it) {
  panel(ctx, r, it.can ? '#8a3f1e' : '#3a2a20', it.can ? '#e0a050' : '#5a4a3a');
  const label = tf('Купить за {price}', { price: it.price });
  ctx.fillStyle = it.can ? '#fff4e0' : '#9a8a70'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const px = fitW(ctx, label, r.w - 12, 16, 10, 700);
  if (ctx.measureText(label).width <= r.w - 8) ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  else {   // совсем узко — в две строки
    wrap(ctx, label, r.w - 8).slice(0, 2).forEach((l, k) => ctx.fillText(l, r.x + r.w / 2, r.y + r.h / 2 + (k - 0.5) * px * 1.1));
  }
  ctx.textAlign = 'left';
}

// Лавка: рисунок слева, имя и что даёт покупка в середине, цена справа (в узкой карточке — под
// рисунком). Первый тап выделяет карточку (ui.shopSel, ставит main.js): золотая рамка и кнопка
// «Купить за N» на месте цены или текста; второй тап по кнопке покупает.
function drawShop(ctx, M, state, ui, t) {
  const items = shopItems(state);
  if (!items.length) {
    ctx.fillStyle = '#c9b48a'; ctx.font = font(15, 400); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tr('Всё куплено'), M.shop.x + M.shop.w / 2, M.shop.y + M.shop.h / 2);
    ctx.textAlign = 'left';
    return;
  }
  const rowsWide = M.shopWideRows;
  M.shopCells.forEach((r, k) => {
    const it = items[k];
    if (!it) return;
    const sel = ui.shopSel === k && !it.locked, buy = M.shopBuy[k];
    panel(ctx, r, sel ? '#5a3a24' : it.can ? '#4a2f1d' : '#2e1e14', it.can ? '#8a6a3a' : null);
    if (sel) { ctx.strokeStyle = COLOR.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.roundRect(r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, 11); ctx.stroke(); }
    const b = shopIcon(r, rowsWide);
    ctx.save(); ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 12); ctx.clip();
    ctx.globalAlpha = it.locked ? 0.45 : 1;
    drawShopIcon(ctx, it, b, t);
    ctx.restore();
    const compact = shopCompact(r, rowsWide);
    if (!rowsWide && !compact) drawPrice(ctx, it, b.x + b.w / 2, b.y + b.h + 8, 'center');
    if (sel) drawBuyButton(ctx, buy, it);
    if (sel && !rowsWide) return;      // в узкой карточке кнопка встаёт на место текста
    const tx = b.x + b.w + 8;
    let right = r.x + r.w - 8;
    if (rowsWide) right = sel ? buy.x - 8 : right - drawPrice(ctx, it, right, r.y + r.h / 2, 'right') - 8;
    const tw = right - tx;
    // в узкой карточке у рецепта без «Рецепт:» — тарелка на рисунке и цена блюда в описании и так
    // говорят, что это рецепт, а место нужно описанию
    const dish = tr(it.name);
    const title = it.kind !== 'recipe' ? dish : rowsWide ? tf('Рецепт: {name}', { name: dish }) : dish.charAt(0).toUpperCase() + dish.slice(1);
    ctx.fillStyle = it.locked ? '#9a8a70' : COLOR.paper; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    // в просторной строке широкого экрана кегль крупнее
    const big = rowsWide ? Math.round(Math.max(14, Math.min(17, r.h * 0.22))) : compact ? 13 : 14;
    const npx = fitW(ctx, title, tw, big, compact ? 10 : 11, 700);
    let ty = r.y + (compact ? 4 : 6);
    if (ctx.measureText(title).width > tw) {
      let lines = wrap(ctx, title, tw);
      if (lines.length > 2) lines = [lines[0], lines.slice(1).join(' ')];
      lines.forEach((l, i) => ctx.fillText(l, tx, ty + i * npx * 1.15));
      ty += lines.length * npx * 1.15 + 1;
    } else { ctx.fillText(title, tx, ty); ty += npx * 1.3; }
    if (compact) {
      // цена строкой под именем, за ней описание, сколько влезет
      const py = Math.min(ty + 7, r.y + r.h - 9);
      const pw = drawPrice(ctx, it, tx, py, 'left');
      drawDesc(ctx, shopDesc(it), tx + pw + 4, py - 6, tw - pw - 4, 13, it.locked ? '#8a7a60' : '#c9b48a');
      return;
    }
    drawDesc(ctx, shopDesc(it), tx, ty, tw, r.y + r.h - 4 - ty, it.locked ? '#8a7a60' : '#c9b48a', big - 2);
  });
}

function star(ctx, x, y, r, color) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

// Команда таверны под искателями: голова, имя, жалованье за смену; бард в долгу — «долг».
function drawStaffStrip(ctx, M, state, t) {
  const r = M.staff;
  if (!r) return;
  const list = staffList(state);
  if (!list.length) return;
  const w = r.w / list.length, d = r.h - 4;
  list.forEach((st, k) => {
    const x = r.x + k * w, cy = r.y + r.h / 2, cx = x + d / 2 + 2;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2); ctx.fillStyle = '#1a110b'; ctx.fill(); ctx.clip();
    drawHead(ctx, staffLook(st.id), { m: 0, t }, cx, cy + d * 0.06, d * 1.05);
    ctx.restore();
    const label = st.debt > 0 ? tf('{name}: долг', { name: tr(st.name) }) : `${tr(st.name)} · ${st.wage}`;
    ctx.fillStyle = '#c9b48a'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    fitFont(ctx, label, w - d - 10, 12, 9);
    ctx.fillText(label, x + d + 6, cy + 1);
  });
}

function drawButton(ctx, r, label) {
  panel(ctx, r, '#8a3f1e', '#c9763a');
  ctx.fillStyle = '#fff4e0'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  fitFont(ctx, label, r.w - 24, 20, 13);
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  ctx.textAlign = 'left';
}

export function drawMorning(ctx, M, state, ui, t, now) {
  const S = M.stage;
  ctx.fillStyle = '#26170f'; ctx.fillRect(S.x, S.y, S.w, S.h);
  drawMap(ctx, M, state, ui, t);
  drawCrew(ctx, M, state, ui, now, t);
  drawStaffStrip(ctx, M, state, t);
  drawShop(ctx, M, state, ui, t);
  drawButton(ctx, M.button, tr(feastReady(state) ? 'Начать пир' : 'Открыть таверну'));
}
