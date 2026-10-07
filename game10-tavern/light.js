// «Таверна у края Хмари» — свет. Тезис арт-дирекции: весь свет от очага, остальное
// принадлежит холодной Хмари. Здесь он проходит по всему кадру разом (AUDIT.md, пункт 12).
//
// Как устроено. Кадр уже нарисован, поверх кладём три слоя:
//  1) multiply — карта света: белое у огня и на лицах с едой, холодное #2a3048 по краям,
//     притемнённый верх стены и фасад стойки. Карта рисуется один раз в маленький
//     оффскрин-канвас (четверть размера, градиенты всё равно гладкие) и потом только
//     растягивается одним drawImage. Пересобирается, когда меняется размер, место огня,
//     места гостей или ступень вечера (их 16 на смену).
//  2) lighter — тёплая добавка у огня. Градиент тоже из кэша, мерцание — масштаб и
//     globalAlpha с тем же flick, что в hall.js drawBack.
//  3) туман снизу (только зал) — по силе тумана главы shift.cfg.sky.fog.
// Итого за вызов: одна заливка во весь экран и две-три частичные — на телефоне держит 60 fps.
//
// Вечер внутри смены: по доле свечи shift.t / shiftSeconds края темнеют и синеют, свет
// огня теплеет и сжимается — к концу остаётся только очаг. На пиру свечи нет, вечер стоит.

const COLD = [42, 48, 72];            // #2a3048 — Хмарь по краям кадра
const Q = 4;                          // во сколько раз карта мельче экрана
const FEAST_EVENING = 0.4;            // на пиру вечер не движется
const STEPS = 16;                     // ступени вечера: карта пересобирается раз в ~11 с

// ---------- общее ----------

const flickOf = t => 0.92 + 0.08 * Math.sin(t * 7) * Math.sin(t * 3.1);   // как в hall.js
const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const rgb = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const clamp01 = v => Math.max(0, Math.min(1, v));

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

// Небольшой кэш карт: стенд и раскладка «рядом» рисуют несколько размеров в одном кадре,
// одна запись трепалась бы. Старые записи выбрасываются по порядку вставки.
const maps = new Map();
function cached(key, build) {
  let v = maps.get(key);
  if (!v) {
    v = build();
    maps.set(key, v);
    if (maps.size > 8) maps.delete(maps.keys().next().value);
  }
  return v;
}

// Вечер смены 0..1, ступенями — чтобы карта не пересобиралась каждый кадр.
function eveningOf(shift) {
  if (!shift) return 0;
  if (shift.cfg?.feast) return FEAST_EVENING;
  const k = clamp01(shift.t / (shift.rules?.shiftSeconds || 180));
  return Math.round(k * STEPS) / STEPS;
}

// Пятно света на карте: тёплый белый в центре, на краю — ничего. Эллипс через масштаб.
function pool(m, x, y, rx, ry, a, color = [255, 244, 228]) {
  m.save();
  m.translate(x, y); m.scale(1, ry / rx);
  const g = m.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgb(color, a)); g.addColorStop(0.55, rgb(color, a * 0.7)); g.addColorStop(1, rgb(color, 0));
  m.fillStyle = g; m.fillRect(-rx, -rx, rx * 2, rx * 2);
  m.restore();
}

// Основа карты: радиальный спад от огня к холоду краёв. e — вечер.
function falloff(m, S, x, y, R, e, soft = 0) {
  const g = m.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, rgb([255, 246, 232]));
  g.addColorStop(0.3, rgb(mix([236, 214, 192], [226, 188, 150], e)));
  g.addColorStop(0.58, rgb(mix([150, 132, 140], [118, 98, 112], e)));       // #7a6a70 к вечеру гуще
  g.addColorStop(1, rgb(mix(mix([74, 80, 108], COLD, e), [128, 126, 146], soft)));
  m.fillStyle = g; m.fillRect(S.x, S.y, S.w, S.h);
}

function newMap(S) {
  const c = canvas(Math.max(1, Math.ceil(S.w / Q)), Math.max(1, Math.ceil(S.h / Q)));
  const m = c.getContext('2d');
  m.scale(1 / Q, 1 / Q);
  m.translate(-S.x, -S.y);      // на карте те же координаты, что и на экране
  return { c, m };
}

// Тёплая добавка у источника: градиент в нуле координат, мерцание — через transform.
function warmGlow(ctx, x, y, r, a, t) {
  const g = cached('glow', () => {
    const c = canvas(1, 1).getContext('2d');
    const gr = c.createRadialGradient(0, 0, 0, 0, 0, 1);
    gr.addColorStop(0, 'rgba(255,150,60,1)'); gr.addColorStop(0.4, 'rgba(230,110,40,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    return gr;
  });
  const f = flickOf(t);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = a * (0.75 + 0.25 * (f - 0.84) / 0.16);
  ctx.translate(x, y); ctx.scale(r * f, r * f);
  ctx.fillStyle = g; ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

// Карта света: mul — затемнение и холод (multiply), add — тёплый подсвет лиц и еды (lighter).
// Две заливки во весь экран, обе из кэша.
function applyMap(ctx, S, map) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(map.mul, S.x, S.y, S.w, S.h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(map.add, S.x, S.y, S.w, S.h);
  ctx.restore();
}

// Тёплый подсвет на карте add: лица и еда выходят светлее всего вокруг. a — сила.
const KEY = [255, 196, 140];
const keyLight = (m, x, y, rx, ry, a) => pool(m, x, y, rx, ry, a, KEY);

// ---------- контактная тень ----------

// Мягкая эллиптическая тень под предметом или гостем: x, y — центр на линии опоры, w — ширина,
// k — сила 0..1 (по умолчанию 1: в центре около rgba(0,0,0,0.35)). Спрайт один на всё.
export function contactShadow(ctx, x, y, w, k = 1) {
  if (!(w > 0) || k <= 0) return;
  const sprite = cached('shadow', () => {
    const c = canvas(128, 128), m = c.getContext('2d');
    const g = m.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(10,6,4,0.55)'); g.addColorStop(0.5, 'rgba(10,6,4,0.32)'); g.addColorStop(1, 'rgba(10,6,4,0)');
    m.fillStyle = g; m.fillRect(0, 0, 128, 128);
    return c;
  });
  const h = w * 0.26;
  const a = ctx.globalAlpha;
  ctx.globalAlpha = a * Math.min(1, k) * 0.65;
  ctx.drawImage(sprite, x - w / 2, y - h / 2, w, h);
  ctx.globalAlpha = a;
}

// ---------- зал ----------

// Где голова гостя: chars.js рисует голову на (0, −4) в системе, сдвинутой на RIG.counter = 80
// вверх от линии опоры, радиус головы ~34. Отсюда центр лица ≈ base − 84·scale.
const FACE_Y = 84, FACE_R = 34;

// busy[i] — место занято: тёплый подсвет только на живых лицах, пустое место не светится.
function hallMap(H, A, e, busy) {
  const S = H.stage, c = H.counter;
  const { m, c: cv } = newMap(S), { m: b, c: bv } = newMap(S);
  const fx = A.fx + A.fw / 2, fy = A.fy + A.fh * 0.7;
  const R = Math.hypot(Math.max(fx - S.x, S.x + S.w - fx), Math.max(fy - S.y, S.y + S.h - fy)) * (1.05 - 0.2 * e);
  falloff(m, S, fx, fy, R, e);

  // верх стены и балки уходят в темноту: свет огня не поднимается выше полки
  const topEnd = Math.min(A.fy, S.y + S.h * 0.4);
  const gt = m.createLinearGradient(0, S.y, 0, topEnd);
  gt.addColorStop(0, rgb(mix([40, 44, 66], [24, 26, 42], e), 0.6 + 0.2 * e)); gt.addColorStop(1, rgb(COLD, 0));
  m.fillStyle = gt; m.fillRect(S.x, S.y, S.w, topEnd - S.y);

  // лица: пятно на голове и плечах каждого места, у дальних столов слабее
  H.seats.forEach((P, i) => {
    const s = P.scale, near = P.kind === 'counter';
    pool(m, P.cx, P.base - FACE_Y * s, FACE_R * 2.4 * s, FACE_R * 2.1 * s, near ? 0.95 : 0.7);
    if (busy[i]) keyLight(b, P.cx, P.base - FACE_Y * s, FACE_R * 1.5 * s, FACE_R * 1.4 * s, (near ? 0.2 : 0.12) * (1 - 0.3 * e));
  });
  // место еды на стойке — перед гостем
  for (const P of H.seats) if (P.kind === 'counter') {
    const sp = P.spot;
    pool(m, sp.x + sp.w / 2, c.y + c.h * 0.3, sp.w * 0.42, c.h * 0.5, 0.45);
  }
  // фасад стойки темнеет книзу: самой светлой в зале она быть не должна
  const gc = m.createLinearGradient(0, c.y + c.h * 0.25, 0, c.y + c.h);
  gc.addColorStop(0, rgb([30, 28, 44], 0)); gc.addColorStop(1, rgb([30, 28, 44], 0.5 + 0.15 * e));
  m.fillStyle = gc; m.fillRect(S.x, c.y + c.h * 0.25, S.w, c.h * 0.75);
  return { mul: cv, add: bv };
}

// Туман у пола: языки Хмари, тянет сквозняком из двери. fog — 0..1 из главы.
function drawFog(ctx, S, fog, t) {
  if (fog <= 0) return;
  const h = S.h * 0.26, y0 = S.y + S.h - h;
  const g = cached(`fog:${S.y + S.h}:${h}`, () => {
    const gr = canvas(1, 1).getContext('2d').createLinearGradient(0, y0, 0, S.y + S.h);
    gr.addColorStop(0, 'rgba(120,134,168,0)'); gr.addColorStop(1, 'rgba(120,134,168,1)');
    return gr;
  });
  ctx.save();
  ctx.globalAlpha = 0.32 * fog;
  ctx.fillStyle = g; ctx.fillRect(S.x, y0, S.w, h);
  // три языка ползут вбок, каждый своей скоростью
  const puff = cached('puff', () => {
    const c = canvas(128, 128), m = c.getContext('2d');
    const gr = m.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(150,164,196,1)'); gr.addColorStop(0.5, 'rgba(150,164,196,0.5)'); gr.addColorStop(1, 'rgba(150,164,196,0)');
    m.fillStyle = gr; m.fillRect(0, 0, 128, 128);
    return c;
  });
  for (let k = 0; k < 3; k++) {
    const rw = S.w * 0.36, rh = h * 0.42;
    const span = S.w + rw * 2, x = S.x - rw + ((t * (9 + k * 5) + k * span / 3) % span);
    ctx.globalAlpha = (0.16 + 0.06 * k) * fog;
    ctx.drawImage(puff, x - rw, S.y + S.h - h * (0.1 + 0.16 * k) - rh, rw * 2, rh * 2);
  }
  ctx.restore();
}

// Свет зала. Звать в конце drawHall внутри его clip, после гостей и стойки, до реплик и «!».
// fire — то, что возвращает drawBack: { fx, fy, fw, fh, wallBottom, deep }.
export function lightHall(ctx, H, shift, t, fire) {
  const S = H.stage;
  const A = fire || { fx: S.x + S.w * 0.45, fy: S.y + S.h * 0.3, fw: S.w * 0.1, fh: S.h * 0.1 };
  const e = eveningOf(shift);
  const seatsKey = H.seats.map(P => `${Math.round(P.cx)},${Math.round(P.base)},${P.scale.toFixed(3)}`).join(';');
  const busy = H.seats.map((_, i) => !!(shift?.seats?.[i]?.guest));
  const key = `hall:${busy.map(Number).join('')}:${S.x},${S.y},${S.w},${S.h}:${Math.round(A.fx)},${Math.round(A.fy)},${Math.round(A.fw)},${Math.round(A.fh)}:${seatsKey}:${e}`;
  applyMap(ctx, S, cached(key, () => hallMap(H, A, e, busy)));
  // тёплый ореол у огня: к вечеру ярче, свет сжимается к очагу
  const fx = A.fx + A.fw / 2, fy = A.fy + A.fh * 0.7;
  warmGlow(ctx, fx, fy, Math.max(A.fw * 1.9, S.w * 0.35), 0.12 + 0.08 * e, t);   // drawBack уже светит сам
  drawFog(ctx, S, shift?.cfg?.sky ? shift.cfg.sky.fog * (shift.cfg.sky.dawn ? 0.5 : 1) : 0, t);
}

// ---------- кухня ----------

function kitchenMap(K, e) {
  const S = K.stage, hb = K.hearthBox;
  const { m, c: cv } = newMap(S), { m: a, c: av } = newMap(S);
  const fx = hb.x + hb.w / 2, fy = hb.y + hb.h * 0.75;
  const R = Math.hypot(Math.max(fx - S.x, S.x + S.w - fx), Math.max(fy - S.y, S.y + S.h - fy)) * (1.1 - 0.15 * e);
  falloff(m, S, fx, fy, R, e, 0.45);   // кухня — рабочий экран: края мягче, чем в зале
  // доска с тарелкой — самое светлое: еда
  const p = K.plate, b = K.board;
  pool(m, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.6, b.h * 0.6, 0.55);
  pool(m, p.x + p.w / 2, p.y + p.h / 2, p.w * 0.85, p.h * 0.85, 0.95);
  keyLight(a, p.x + p.w / 2, p.y + p.h / 2, p.w * 0.6, p.h * 0.6, 0.16);
  // лица в окне раздачи и тикеты под ними: люди и заказ должны читаться
  const h = K.hatch;
  for (const f of K.faces || []) {
    pool(m, f.x + f.w / 2, f.y + f.h / 2, f.w * 0.9, f.h * 0.9, 0.85);
    keyLight(a, f.x + f.w / 2, f.y + f.h / 2, f.w * 0.5, f.h * 0.5, 0.12);
  }
  if (K.rail) pool(m, K.rail.x + K.rail.w / 2, K.rail.y + K.rail.h / 2, K.rail.w * 0.6, K.rail.h * 1.2, 0.6);
  else pool(m, h.x + h.w / 2, h.y + h.h / 2, h.w * 0.6, h.h, 0.6);
  // бочка и котёл — в полутени, но различимы
  if (K.barrel) pool(m, K.barrel.x + K.barrel.w / 2, K.barrel.y + K.barrel.h / 2, K.barrel.w * 0.7, K.barrel.h * 0.7, 0.4);
  // кладовая — кнопки игрока: значки должны читаться и на холодном краю
  for (const { r } of K.pantry || []) pool(m, r.x + r.w / 2, r.y + r.h / 2, r.w * 0.75, r.h * 0.75, 0.6);
  return { mul: cv, add: av };
}

// Свет кухни. Звать в конце drawKitchen внутри его clip. Источник — очаг K.hearthBox.
export function lightKitchen(ctx, K, shift, t) {
  const S = K.stage, hb = K.hearthBox;
  const e = eveningOf(shift);
  const key = `kitchen:${S.x},${S.y},${S.w},${S.h}:${Math.round(hb.x)},${Math.round(hb.y)},${Math.round(hb.w)},${Math.round(hb.h)}:${Math.round(K.plate.x)},${Math.round(K.plate.y)}:${e}`;
  applyMap(ctx, S, cached(key, () => kitchenMap(K, e)));
  warmGlow(ctx, hb.x + hb.w / 2, hb.y + hb.h * 0.75, Math.max(hb.w * 1.3, Math.min(S.w, S.h) * 0.5), 0.22 + 0.08 * e, t);
}
