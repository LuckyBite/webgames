// «Таверна у края Хмари» — огонь и Жар. Огонь в доме один: очаг кухни, камин зала и котёл —
// один рисунок разного размера. Жар — лицо в пламени очага; тот же рисунок крупно — портрет
// в сценах, мелко — значок подсказок (спека, «Шаг 3а»).
//
// Движение покоя без состояния: всё считается от времени t, поэтому огонь одинаково горит в
// смене, в сцене и в лаборатории (lab.html).

// Слои пламени снаружи внутрь: цвет, доля размера, число языков. Во внутренних слоях языков
// меньше — иначе узкий слой превращается в гребёнку игл.
const LAYERS = [['#9e2a0a', 1, 7], ['#e2561a', 0.8, 6], ['#f79a2a', 0.58, 5], ['#ffd45e', 0.36, 3]];

// Силуэт слоя — одна кривая через языки: у каждого выпуклые бока и вершина, которую качает
// тягой; между языками — сплошное тело пламени. Высота языка дышит своей частотой, крайние
// ниже средних.
function layerPath(ctx, cx, by, w, h, t, k, n, seed) {
  const lw = w * k, x0 = cx - lw / 2, step = lw / n, half = (n - 1) / 2 || 1;
  const valley = by - h * k * 0.24;
  ctx.beginPath();
  ctx.moveTo(x0 + step * 0.35, by);
  ctx.quadraticCurveTo(x0, by, x0, valley);
  for (let i = 0; i < n; i++) {
    const edge = Math.abs(i - half) / half;
    const breathe = 0.6 + 0.4 * Math.sin(t * (3.1 + i * 0.73) + i * 1.9 + seed);
    const tip = Math.max(h * k * 0.3, h * k * (1 - edge * 0.5) * breathe);
    const sway = Math.sin(t * 2.3 + i * 1.3 + seed) * step * 0.3;
    const xl = x0 + step * i, xr = xl + step, xm = xl + step / 2 + sway, ty = by - tip;
    ctx.bezierCurveTo(xl + step * 0.05, by - tip * 0.55, xm - step * 0.32, ty + tip * 0.22, xm, ty);
    ctx.bezierCurveTo(xm + step * 0.32, ty + tip * 0.22, xr - step * 0.05, by - tip * 0.55, xr, valley);
  }
  ctx.quadraticCurveTo(x0 + lw, by, x0 + lw - step * 0.35, by);
  ctx.closePath();
}

function drawLogs(ctx, cx, by, w, t) {
  ctx.fillStyle = '#3a2213';
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.translate(cx, by - w * 0.05);
    ctx.rotate(s * 0.18);
    ctx.beginPath(); ctx.roundRect(-w * 0.42, -w * 0.05, w * 0.84, w * 0.1, w * 0.05); ctx.fill();
    ctx.restore();
  }
  // угли тлеют: пульс у каждого свой
  for (let k = 0; k < 5; k++) {
    const x = cx + (k - 2) * w * 0.14, glow = 0.55 + 0.45 * Math.sin(t * (1.7 + k * 0.4) + k * 2.3);
    ctx.fillStyle = `rgba(255,${Math.round(90 + 70 * glow)},40,${0.5 + 0.5 * glow})`;
    ctx.beginPath(); ctx.ellipse(x, by - w * 0.02, w * 0.06, w * 0.025, 0, 0, Math.PI * 2); ctx.fill();
  }
}

// Искры: у каждой своя фаза жизни, поднимаются и гаснут; случайность — от номера, не от rng.
function drawSparks(ctx, cx, by, w, h, t, seed) {
  ctx.fillStyle = '#ffd98a';
  for (let k = 0; k < 7; k++) {
    const life = (t * (0.45 + k * 0.05) + k * 0.37 + seed) % 1;
    const x = cx + Math.sin(k * 12.9898 + seed) * w * 0.3 + Math.sin(t * 3 + k) * w * 0.05;
    const y = by - h * (0.4 + life * 1.1);
    ctx.globalAlpha = (1 - life) * 0.9;
    ctx.beginPath(); ctx.arc(x, y, Math.max(1, w * 0.012) * (1 - life * 0.5), 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function drawFire(ctx, cx, by, w, h, t, { logs = false, sparks = true, seed = 0 } = {}) {
  // Панель браузера при смене размера бывает на кадр почти нулевой: отрицательный радиус
  // эллипса бросает исключение, поэтому такой огонь не рисуется вовсе.
  if (!(w > 0 && h > 0)) return;
  // огонь светит сам — свечение вокруг него, а не только градиент на фоне сцены
  const R = Math.max(w, h) * 0.9, gy = by - h * 0.3;
  const glow = ctx.createRadialGradient(cx, gy, 0, cx, gy, R);
  glow.addColorStop(0, 'rgba(255,150,60,0.32)'); glow.addColorStop(1, 'rgba(255,120,40,0)');
  ctx.fillStyle = glow; ctx.fillRect(cx - R, gy - R, 2 * R, 2 * R);
  if (logs) drawLogs(ctx, cx, by, w, t);
  LAYERS.forEach(([color, k, n], j) => { ctx.fillStyle = color; layerPath(ctx, cx, by, w, h, t, k, n, seed + j * 1.7); ctx.fill(); });
  // раскалённое ядро у основания
  const cy = by - h * 0.07, cr = w * 0.2;
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
  core.addColorStop(0, 'rgba(255,248,215,0.75)'); core.addColorStop(1, 'rgba(255,220,120,0)');
  ctx.fillStyle = core; ctx.beginPath(); ctx.ellipse(cx, cy, cr, h * 0.12, 0, 0, Math.PI * 2); ctx.fill();
  if (sparks) drawSparks(ctx, cx, by, w, h, t, seed);
}

// Лицо Жара: глаза-угли, брови-язычки, рот. Сердит по привычке — внутренние концы бровей
// ниже. talk — рот ходит, пока на экране его реплика; моргает раз в ~5 с.
export function drawZhar(ctx, cx, cy, d, t, { talk = false } = {}) {
  const u = d / 100;   // лицо — 100 единиц в ширину
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(u, u);
  // лицо светится изнутри пламени — иначе глаза висят поверх огня наклейкой
  const aura = ctx.createRadialGradient(0, 6, 0, 0, 6, 62);
  aura.addColorStop(0, 'rgba(255,170,60,0.6)'); aura.addColorStop(1, 'rgba(255,120,30,0)');
  ctx.fillStyle = aura; ctx.fillRect(-62, -56, 124, 124);
  const blink = t % 5.3 < 0.14;
  for (const s of [-1, 1]) {
    const ex = s * 22;
    const g = ctx.createRadialGradient(ex, 0, 0, ex, 0, 22);
    g.addColorStop(0, 'rgba(255,250,220,0.8)'); g.addColorStop(1, 'rgba(255,230,150,0)');
    ctx.fillStyle = g; ctx.fillRect(ex - 22, -22, 44, 44);
    if (blink) {
      ctx.strokeStyle = '#7a2206'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex - 11, 0); ctx.lineTo(ex + 11, 0); ctx.stroke();
    } else {
      ctx.fillStyle = '#fff6d8'; ctx.beginPath(); ctx.ellipse(ex, 0, 12, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#6a1c04'; ctx.beginPath(); ctx.ellipse(ex - s * 2, 1, 4, 6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#8a2a08';
    ctx.beginPath();
    ctx.moveTo(s * 8, -12);
    ctx.quadraticCurveTo(s * 22, -24, s * 38, -22);
    ctx.quadraticCurveTo(s * 24, -16, s * 8, -8);
    ctx.closePath(); ctx.fill();
  }
  const open = talk ? 4 + 7 * Math.abs(Math.sin(t * 11)) : 0;
  if (open > 0) {
    ctx.fillStyle = '#6a1c04'; ctx.beginPath(); ctx.ellipse(0, 26, 10, open, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = '#6a1c04'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-11, 28); ctx.quadraticCurveTo(0, 23, 11, 28); ctx.stroke();
  }
  ctx.restore();
}

// Портрет для сцен: устье очага во весь прямоугольник, в нём огонь и Жар крупно.
export function drawZharPortrait(ctx, r, t, talk) {
  const w = Math.min(r.w * 0.75, r.h * 0.8), h = w * 1.05, cx = r.x + r.w / 2, by = r.y + r.h;
  ctx.fillStyle = '#3a322c';
  ctx.beginPath(); ctx.roundRect(cx - w * 0.62, by - h * 1.05, w * 1.24, h * 1.05, [w * 0.5, w * 0.5, 0, 0]); ctx.fill();
  ctx.fillStyle = '#140b07';
  ctx.beginPath(); ctx.roundRect(cx - w * 0.52, by - h * 0.95, w * 1.04, h * 0.95, [w * 0.44, w * 0.44, 0, 0]); ctx.fill();
  drawFire(ctx, cx, by, w * 0.9, h * 0.85, t, { logs: true });
  drawZhar(ctx, cx, by - h * 0.32, w * 0.42, t, { talk });
}

// Значок подсказки: Жар в круглом окошке.
export function drawZharBadge(ctx, cx, cy, d, t) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#2a1208'; ctx.fill(); ctx.clip();
  drawFire(ctx, cx, cy + d * 0.5, d * 1.1, d * 0.95, t, { sparks: false });
  drawZhar(ctx, cx, cy + d * 0.12, d * 0.62, t);
  ctx.restore();
}
