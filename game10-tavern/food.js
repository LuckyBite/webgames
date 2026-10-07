// «Таверна у края Хмари» — продукты, кружка, тарелка.
//
// Продукты рисуются кодом, а если loadArt загрузил art/<id>.webp — картинкой в тот же квадрат
// (спека, «Графика»; промпты в prompts/, обработка в art-tool.html). Право на акцент — у еды:
// здесь самые насыщенные цвета кадра. Кружка и тарелка анимируются и остаются кодом.
// Каждая функция рисует в квадрате size × size с центром (cx, cy); внутри — единицы ±50.

import { DISHES, INGREDIENTS } from './data.js';

// Загруженные картинки: id → Image. Пока loadArt никто не вызвал, карта пуста и всё
// рисуется кодом, поэтому без партии из генератора игра не меняется.
const ART = new Map();

// Загружает base<id>.webp для каждого id; что не загрузилось, остаётся на коде. Вне браузера
// (тесты, симулятор) ничего не делает. Возвращает карту загруженного.
export function loadArt(ids, base = 'art/') {
  if (typeof Image === 'undefined') return Promise.resolve(ART);
  return Promise.all(ids.map(id => new Promise(resolve => {
    const img = new Image();
    img.onload = () => { ART.set(id, img); resolve(); };
    img.onerror = () => resolve();
    img.src = `${base}${id}.webp`;
  }))).then(() => ART);
}

function unit(ctx, cx, cy, size, fn) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  fn();
  ctx.restore();
}
function ell(ctx, x, y, rx, ry, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); }
function poly(ctx, pts, color) {
  ctx.fillStyle = color; ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath(); ctx.fill();
}
function line(ctx, pts, color, w) {
  ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.stroke();
}
function steak(ctx, base, marble) {
  ctx.fillStyle = '#f1e6d2'; ctx.fillRect(18, -5, 26, 10);
  ell(ctx, 45, -6, 6, 6, '#f1e6d2'); ell(ctx, 45, 6, 6, 6, '#f1e6d2');
  ell(ctx, -6, 2, 34, 26, base);
  line(ctx, [[-26, -6], [-10, 2], [4, -8], [16, 4]], marble, 4);
}

const DRAW = {
  bread(ctx) {
    ell(ctx, 0, 8, 40, 24, '#b8753a');
    ell(ctx, 0, 0, 38, 21, '#e3a95e');
    for (const x of [-18, 0, 18]) line(ctx, [[x - 7, 8], [x + 7, -8]], '#b8753a', 4);
  },
  cheese(ctx) {
    poly(ctx, [[-40, 24], [40, 24], [40, 2], [-16, -22]], '#f4c542');
    poly(ctx, [[-16, -22], [40, 2], [40, -6], [-10, -28]], '#ffdb6e');
    ell(ctx, 12, 10, 6, 5, '#d9a52c'); ell(ctx, -8, 15, 4, 3.5, '#d9a52c'); ell(ctx, 28, 15, 4, 3.5, '#d9a52c');
  },
  onion(ctx) {
    ell(ctx, 0, 10, 30, 30, '#9b4a8c');
    ctx.strokeStyle = '#c47bb4'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(-8, 8, 14, 22, 0, Math.PI * 0.6, Math.PI * 1.4); ctx.stroke();
    line(ctx, [[0, -18], [-6, -36]], '#6f9a4a', 5);
    line(ctx, [[0, -18], [6, -38]], '#8fbf5a', 5);
    for (const [x, dx] of [[-6, -2], [0, 0], [6, 2]]) line(ctx, [[x, 40], [x + dx, 46]], '#d8c8a0', 2);
  },
  meat(ctx) { steak(ctx, '#d0575b', '#f0b0a8'); },
  roast(ctx) {
    steak(ctx, '#9a4f24', '#c9763a');
    for (const x of [-22, -8, 6]) line(ctx, [[x, -14], [x + 12, 18]], '#5a2a12', 4);
  },
  burnt(ctx) {
    steak(ctx, '#2e2622', '#4a3e36');
    line(ctx, [[-10, -30], [-16, -40], [-8, -50]], 'rgba(200,190,180,0.6)', 3);
    line(ctx, [[8, -30], [2, -42], [10, -52]], 'rgba(200,190,180,0.5)', 3);
  },
  mushroom(ctx) {
    ctx.fillStyle = '#efe2c4'; ctx.fillRect(-8, 0, 16, 30);
    ell(ctx, 0, 0, 34, 20, '#b8612e');
    ell(ctx, 0, -6, 30, 14, '#d0783a');
    for (const [x, y] of [[-14, -6], [6, -12], [16, -2]]) ell(ctx, x, y, 4, 3, '#f1e6d2');
  },
  honey(ctx) {
    ctx.fillStyle = '#e0a82a'; ctx.beginPath(); ctx.roundRect(-26, -22, 52, 56, 10); ctx.fill();
    ctx.fillStyle = '#f4c64a'; ctx.fillRect(-18, -12, 12, 36);
    ctx.fillStyle = '#8a5a34'; ctx.fillRect(-30, -34, 60, 14);
    line(ctx, [[-30, -27], [30, -27]], '#6b4423', 3);
  },
  berries(ctx) {
    line(ctx, [[0, -30], [8, -40]], '#5a7a3a', 4);
    poly(ctx, [[8, -40], [30, -44], [16, -30]], '#6f9a4a');
    for (const [x, y] of [[-14, 0], [12, -4], [0, 16], [-2, -16], [18, 16]]) {
      ell(ctx, x, y, 13, 13, '#3d4f9a');
      ell(ctx, x - 4, y - 4, 3.5, 3.5, '#8a9ad8');
    }
  },
  pepper(ctx) {
    ctx.fillStyle = '#d42a22';
    ctx.beginPath(); ctx.moveTo(-26, -20);
    ctx.quadraticCurveTo(10, -30, 30, 10); ctx.quadraticCurveTo(34, 30, 20, 38); ctx.quadraticCurveTo(22, 10, -20, -4);
    ctx.closePath(); ctx.fill();
    line(ctx, [[-4, -18], [14, -8], [24, 12]], '#ff7a4a', 3);
    line(ctx, [[-26, -20], [-36, -30], [-30, -40]], '#4f7a2a', 5);
    poly(ctx, [[20, 38], [26, 46], [14, 44]], '#ffb347');
  },
  broth(ctx) {
    ell(ctx, 0, 12, 40, 22, '#6b4a2e');
    ell(ctx, 0, 2, 38, 14, '#8a5a3a');
    ell(ctx, 0, 2, 32, 10, '#c07a2e');
    for (const [x, y] of [[-12, 0], [8, 4], [16, -2]]) ell(ctx, x, y, 5, 3, '#8a4a22');
    line(ctx, [[-10, -12], [-14, -24], [-8, -34]], 'rgba(232,217,189,0.7)', 3);
    line(ctx, [[10, -12], [6, -26], [12, -36]], 'rgba(232,217,189,0.6)', 3);
  },
  // Нарезанное (шаг 3г): кольца лука, ломтики сыра и хлеба — так части лежат на тарелке и
  // в ящиках кладовой.
  onion_cut(ctx) {
    for (const [x, y, r] of [[-14, 6, 18], [10, -4, 20], [12, 16, 15]]) {
      ctx.strokeStyle = '#9b4a8c'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#e8c8e0'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(x, y, r * 0.62, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke();
    }
  },
  cheese_cut(ctx) {
    // три ломтика веером: толстый край корки снизу, дырочки
    for (const [dx, dy, a] of [[-12, 6, -0.35], [0, 0, 0], [12, 6, 0.35]]) {
      ctx.save(); ctx.translate(dx, dy); ctx.rotate(a);
      ctx.fillStyle = '#e8b030'; ctx.beginPath(); ctx.roundRect(-13, -22, 26, 40, 4); ctx.fill();
      ctx.fillStyle = '#ffd860'; ctx.beginPath(); ctx.roundRect(-13, -22, 26, 36, 4); ctx.fill();
      ell(ctx, -4, -8, 3, 3.5, '#e0a42a'); ell(ctx, 5, 2, 2.2, 2.6, '#e0a42a');
      ctx.restore();
    }
  },
  bread_cut(ctx) {
    for (const [x, y] of [[-12, 4], [10, -4]]) {
      ell(ctx, x, y, 24, 22, '#b8753a');
      ell(ctx, x, y, 19, 17, '#f1d39a');
      for (const [px, py] of [[-6, -4], [4, 6], [6, -8], [-4, 8]]) ell(ctx, x + px, y + py, 1.6, 1.6, '#d8b070');
    }
  },
  honey_drop(ctx) {
    ell(ctx, 0, 6, 26, 14, '#d99a22');
    ell(ctx, -4, 2, 18, 9, '#f2c04a');
    ell(ctx, -10, -1, 6, 3, 'rgba(255,240,190,0.8)');
  },
  broth_scorched(ctx) {
    ell(ctx, 0, 12, 40, 22, '#4a3424');
    ell(ctx, 0, 2, 38, 14, '#6a4428');
    ell(ctx, 0, 2, 32, 10, '#8a5422');
    for (const [x, y] of [[-14, 2], [6, 6], [18, -2]]) ell(ctx, x, y, 5, 3, '#2a1a10');
  },
  broth_burnt(ctx) {
    ell(ctx, 0, 12, 40, 22, '#3a2a1e');
    ell(ctx, 0, 2, 38, 14, '#2a1e16');
    ell(ctx, 0, 2, 32, 10, '#1a120c');
    line(ctx, [[-6, -12], [-12, -26], [-4, -38]], 'rgba(160,150,140,0.6)', 3);
  },
};

export function drawItem(ctx, id, cx, cy, size) {
  const img = ART.get(id);
  if (img) { ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size); return; }
  const f = DRAW[id];
  if (f) unit(ctx, cx, cy, size, () => f(ctx));
}

// Кружка: деревянная, на клёпках, с медными обручами; эль янтарный, в нём поднимаются
// пузырьки; пена — шапкой из кругов. fill 0..1 — сколько налито; state — null (льётся) |
// 'full' | 'short' | 'spilled'. t — время, для пузырьков (без него — неподвижно).
export function drawMug(ctx, cx, cy, size, fill, state, t = 0) {
  unit(ctx, cx, cy, size, () => {
    // ручка
    ctx.strokeStyle = '#5a3418'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(24, -16); ctx.bezierCurveTo(48, -16, 48, 22, 24, 22); ctx.stroke();
    ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(26, -13); ctx.bezierCurveTo(42, -12, 42, 18, 26, 19); ctx.stroke();
    // корпус чуть шире книзу
    const body = () => { ctx.beginPath(); ctx.moveTo(-26, -30); ctx.lineTo(26, -30); ctx.lineTo(29, 36); ctx.quadraticCurveTo(0, 42, -29, 36); ctx.closePath(); };
    body(); ctx.fillStyle = '#9a6436'; ctx.fill();
    ctx.save(); body(); ctx.clip();
    const level = Math.max(0, Math.min(1, fill));
    if (level > 0) {
      const top = 36 - 64 * level;
      const g = ctx.createLinearGradient(0, top, 0, 38);
      g.addColorStop(0, '#f2c25a'); g.addColorStop(1, '#c27a1e');
      ctx.fillStyle = g; ctx.fillRect(-30, top, 60, 80);
      ctx.fillStyle = 'rgba(255,240,200,0.7)';
      for (let k = 0; k < 6; k++) {
        const life = (t * 0.8 + k * 0.37) % 1, bx = -18 + ((k * 13) % 36), by = 34 - life * (34 - top);
        if (by > top + 3) { ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    // клёпки дерева видны сквозь эль чуть-чуть — кружка не стеклянная, эль виден сверху
    ctx.fillStyle = 'rgba(90,52,24,0.55)';
    for (const x of [-14, 0, 14]) ctx.fillRect(x - 1, -30, 2, 70);
    ctx.restore();
    // обручи
    ctx.fillStyle = '#b98a3e';
    ctx.fillRect(-27, -24, 54, 5); ctx.fillRect(-29, 24, 58, 5);
    ctx.fillStyle = 'rgba(255,230,160,0.5)'; ctx.fillRect(-27, -24, 54, 1.5); ctx.fillRect(-29, 24, 58, 1.5);
    // блик
    ctx.fillStyle = 'rgba(255,220,170,0.18)'; ctx.fillRect(-22, -28, 6, 62);
    // пена шапкой: чем ближе к полной, тем выше
    const foam = state === 'full' || state === 'spilled' ? 1 : state === 'short' ? 0.35 : Math.max(0, (level - 0.5) * 2);
    if (foam > 0 && level > 0) {
      const top = state ? -30 : 36 - 64 * level;
      ctx.fillStyle = '#f6ecd4';
      for (const [x, r] of [[-20, 8], [-9, 10], [3, 11], [15, 9], [24, 6]]) {
        ctx.beginPath(); ctx.arc(x, top - r * 0.35 * foam, r * (0.6 + 0.4 * foam), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = 'rgba(200,170,120,0.35)';
      ctx.beginPath(); ctx.ellipse(0, top + 4, 24, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (state === 'spilled') {
      ctx.fillStyle = '#f3e6c8';
      ctx.beginPath(); ctx.moveTo(-26, -30); ctx.quadraticCurveTo(-34, -6, -30, 12); ctx.quadraticCurveTo(-25, 14, -24, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(25, -30); ctx.quadraticCurveTo(33, 4, 30, 22); ctx.quadraticCurveTo(25, 24, 24, 6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(226,176,74,0.55)'; ctx.beginPath(); ctx.ellipse(0, 42, 36, 5, 0, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// Мясо на решётке: top — какой видна верхняя сторона (0 — сырая, 1 — прожарена, 2 —
// уголь), edge — нижняя, она видна каёмкой по краю; marks — полоски от решётки на верхней.
const RAW = [201, 76, 82], DONE = [150, 72, 30], COAL = [46, 38, 34];
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const rgb = c => `rgb(${c[0]},${c[1]},${c[2]})`;
const cookColor = v => rgb(v <= 1 ? mix(RAW, DONE, Math.max(0, v)) : mix(DONE, COAL, Math.min(1, v - 1)));
export function drawGrillMeat(ctx, cx, cy, size, { top = 0, edge = 0, marks = false, gloss = false, t = 0 } = {}) {
  unit(ctx, cx, cy, size, () => {
    ctx.fillStyle = '#f1e6d2'; ctx.fillRect(18, -5, 26, 10);              // косточка
    ell(ctx, 45, -6, 6, 6, '#f1e6d2'); ell(ctx, 45, 6, 6, 6, '#f1e6d2');
    ell(ctx, -6, 4, 35, 27, cookColor(edge));                               // нижняя сторона — каёмкой
    ell(ctx, -6, 1, 32, 24, cookColor(top));
    line(ctx, [[-26, -6], [-10, 2], [4, -8], [16, 4]], top > 0.5 ? 'rgba(220,150,90,0.5)' : '#f0b0a8', 4);
    if (marks) for (const x of [-24, -10, 4]) line(ctx, [[x, -18], [x + 12, 20]], 'rgba(40,18,8,0.75)', 4);
    if (gloss) { ctx.fillStyle = 'rgba(255,230,180,0.35)'; ctx.beginPath(); ctx.ellipse(-16, -10, 10, 4, -0.4, 0, Math.PI * 2); ctx.fill(); }
    if (top < 2 && top > 0.2 || edge > 0.2 && edge < 2) {                    // шипит: капли жира
      ctx.fillStyle = 'rgba(255,220,140,0.8)';
      for (let k = 0; k < 4; k++) {
        const life = (t * 2.2 + k * 0.29) % 1;
        ctx.globalAlpha = 1 - life;
        ctx.beginPath(); ctx.arc(-30 + k * 18, 22 - life * 26, 1.8, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (top >= 2) {
      for (const [x, ph] of [[-12, 0], [6, 0.5]]) {
        const life = (t * 0.7 + ph) % 1;
        ctx.globalAlpha = 0.6 * (1 - life);
        ell(ctx, x + Math.sin(t * 2 + ph * 6) * 4, -20 - life * 40, 8 + life * 8, 6 + life * 6, '#6a625c');
      }
      ctx.globalAlpha = 1;
    }
  });
}

// Части раскладываются по гнёздам тарелки в порядке, в котором их положили. Нарезаемое лежит
// нарезанным; мёд и перец, положенные штрихом через тарелку («красиво»), — полосой и россыпью
// поверх всего (quals — качество частей, как shift.plateQ).
export const SPOTS = [[-0.17, -0.04], [0.17, -0.04], [0, 0.13], [0, -0.2]];
// pop — 0..1, как давно легла последняя часть: она падает сверху и сжимается 1,35 → 1.
export function drawPlate(ctx, parts, cx, cy, d, quals = [], pop = 1) {
  ell(ctx, cx, cy + d * 0.04, d * 0.5, d * 0.36, '#bfb49a');
  ell(ctx, cx, cy, d * 0.5, d * 0.36, '#e8e0cc');
  ell(ctx, cx, cy, d * 0.38, d * 0.26, '#d8ceb6');
  const nice = [];
  parts.forEach((id, k) => {
    const [ox, oy] = SPOTS[k] || [0, 0];
    if ((id === 'honey' || id === 'pepper') && quals[k] === 'nice') { nice.push(id); return; }
    const look = INGREDIENTS[id]?.cut ? id + '_cut' : id === 'honey' ? 'honey_drop' : id === 'broth' && quals[k] === 'scorched' ? 'broth_scorched' : id;
    const last = k === parts.length - 1 && pop < 1, e = last ? 1 - (1 - pop) ** 3 : 1;
    drawItem(ctx, look, cx + ox * d, cy + oy * d - (1 - e) * d * 0.12, d * 0.42 * (last ? 1.35 - 0.35 * e : 1));
  });
  for (const id of nice) {
    if (id === 'honey') {
      ctx.strokeStyle = 'rgba(232,168,42,0.95)'; ctx.lineWidth = Math.max(2, d * 0.03); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // мягкая волна с петлёй и каплями — как льют с ложки, а не по линейке
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const u = k / 40, x = cx - d * 0.3 + d * 0.6 * u, y = cy + Math.sin(u * Math.PI * 3.2) * d * 0.09 - Math.cos(u * 9) * d * 0.015;
        if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,230,150,0.7)'; ctx.lineWidth = Math.max(1, d * 0.008); ctx.stroke();
      ctx.fillStyle = 'rgba(232,168,42,0.95)';
      for (const u of [0.18, 0.52, 0.83]) { ctx.beginPath(); ctx.arc(cx - d * 0.3 + d * 0.6 * u, cy + Math.sin(u * Math.PI * 3.2) * d * 0.09, d * 0.022, 0, Math.PI * 2); ctx.fill(); }
    } else {
      for (let k = 0; k < 14; k++) {
        const a = k * 2.4, r = d * (0.06 + (k % 5) * 0.05);
        ctx.fillStyle = k % 3 ? '#d42a22' : '#ff7a3a';
        ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.6, d * 0.014, d * 0.008, a, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

// Значок для тикета: эль — кружкой, еда — тарелкой с частями. Так по тикету видно,
// что собирать, даже когда название не влезает.
export function drawDishIcon(ctx, dishId, cx, cy, size) {
  const d = DISHES[dishId];
  if (d.drink) drawMug(ctx, cx, cy, size * 0.9, 0.9, 'full');
  else drawPlate(ctx, d.parts, cx, cy, size);
}
