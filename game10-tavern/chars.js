// «Таверна у края Хмари» — векторные персонажи.
//
// Гость — набор деталей; мимика терпения — плавная смена бровей, рта и румянца (спека,
// «Графика»). Все смотрят в одну сторону, поэтому ракурс один; портрет для диалога — тот же
// персонаж крупнее. Контуры записаны строками SVG-путей: Path2D читает их напрямую, деталь
// можно перерисовать в любом векторном редакторе и вставить сюда.
//
// Система координат: центр головы в (0, 0), линия стойки — y = 80, верх шлема — y ≈ −56.

import { mulberry32 } from './shift.js';

export const RIG = { counter: 80, headCy: -8 };

const P = d => new Path2D(d);
const PATH = {
  body: P('M-58,110 C-56,62 -32,44 0,44 C32,44 56,62 58,110 Z'),
  collar: P('M-20,50 L0,74 L20,50'),
  helmet: P('M-36,-12 C-36,-54 36,-54 36,-12 Z'),
  helmetShine: P('M-24,-30 C-18,-44 -4,-48 6,-47'),
  hood: P('M-42,20 C-46,-40 -20,-60 0,-60 C20,-60 46,-40 42,20 C36,-18 24,-36 0,-38 C-24,-36 -36,-18 -42,20 Z'),
  beardLong: P('M-33,4 C-42,48 -20,86 0,98 C20,86 42,48 33,4 C22,26 -22,26 -33,4 Z'),
  beardShort: P('M-32,6 C-35,30 -18,50 0,54 C18,50 35,30 32,6 C22,24 -22,24 -32,6 Z'),
  beardLines: P('M-18,40 C-16,58 -10,72 -4,82 M8,44 C9,60 12,70 16,78 M-26,26 C-26,40 -22,52 -18,60'),
  mustacheL: P('M-1,17 C-10,12 -22,15 -27,25 C-17,22 -9,23 -1,21 Z'),
  mustacheR: P('M1,17 C10,12 22,15 27,25 C17,22 9,23 1,21 Z'),
  earElfL: P('M-29,-4 L-58,-28 L-31,10 Z'),
  earElfR: P('M29,-4 L58,-28 L31,10 Z'),
  earOrcL: P('M-29,-6 L-48,-16 L-31,8 Z'),
  earOrcR: P('M29,-6 L48,-16 L31,8 Z'),
  hairBack: P('M-36,-6 C-40,-44 -16,-52 0,-52 C16,-52 40,-44 36,-6 C40,30 44,60 42,90 L-42,90 C-44,60 -40,30 -36,-6 Z'),
  hairFront: P('M-33,-8 C-34,-40 -10,-44 0,-44 C10,-44 34,-40 33,-8 C24,-28 10,-32 0,-24 C-10,-32 -24,-28 -33,-8 Z'),
  topknot: P('M-9,-34 C-12,-54 12,-54 9,-34 Z'),
  tuskL: P('M-15,28 L-12,16 L-9,28 Z'),
  tuskR: P('M9,28 L12,16 L15,28 Z'),
  sweat: P('M36,-24 C33,-18 32,-14 35,-12 C38,-14 38,-19 36,-24 Z'),
  // гоблин: длинные уши в стороны, нос крючком, клок волос
  earGoblinL: P('M-27,-8 L-70,-22 L-60,-6 L-29,10 Z'),
  earGoblinR: P('M27,-8 L70,-22 L60,-6 L29,10 Z'),
  noseGoblin: P('M-4,0 C-2,-4 4,-4 6,2 L14,16 C8,18 0,16 -5,12 Z'),
  tuft: P('M-4,-28 C-12,-48 -2,-44 0,-34 C2,-46 12,-48 4,-28 Z'),
  // человек: короткая стрижка шапкой; уборы — шапка, поварской колпак, берет с пером
  hairShort: P('M-32,-8 C-34,-38 -12,-46 0,-46 C12,-46 34,-38 32,-8 C26,-24 14,-30 0,-28 C-14,-30 -26,-24 -32,-8 Z'),
  cap: P('M-34,-14 C-34,-44 34,-44 34,-14 Z'),
  toque: P('M-24,-20 L-26,-38 C-40,-44 -34,-66 -18,-60 C-14,-76 14,-76 18,-60 C34,-66 40,-44 26,-38 L24,-20 Z'),
  beret: P('M-36,-18 C-40,-34 -10,-46 14,-42 C34,-40 42,-30 34,-20 C14,-26 -14,-26 -36,-18 Z'),
  feather: P('M20,-40 C30,-60 44,-70 52,-72 C46,-62 36,-50 24,-38 Z'),
};

// Ткани приглушены: право на акцент — у еды (тезис арт-дирекции).
const SKIN = {
  dwarf: ['#e8b48a', '#d49a70', '#f0c49e'], orc: ['#8fae6a', '#7a9a58', '#a5ba7c'], elf: ['#f3dcc4', '#e6c6a4', '#caa384'],
  goblin: ['#8f9e6c', '#7d8f68', '#a0a874'], human: ['#f1c9a5', '#dcaa82', '#b07b56', '#7c5038'],
};
const HAIR = {
  dwarf: ['#c4622d', '#7a4526', '#a09a90', '#3e2c20'], orc: ['#2e2a26', '#4a3a2a'], elf: ['#e8d38a', '#dcdce4', '#3a2a24', '#b8733a'],
  goblin: ['#2e2a24', '#4a3e30'], human: ['#2e241c', '#6b4424', '#c49a5a', '#8a2e22', '#9a9a92'],
};
// Голова по расе: полуоси эллипса.
const HEAD = { dwarf: [32, 34], orc: [34, 33], elf: [30, 35], goblin: [29, 30], human: [31, 34] };
const CLOTH = ['#56694a', '#6a4a6e', '#4a5a78', '#7a5236', '#8a3f3a'];
const METAL = ['#8f989e', '#a08c62'];
const RIM = 'rgba(255,170,90,0.45)';   // тёплый контур от камина за спиной

function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c * k)));
  return '#' + ((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0');
}

export function makeLook(race, seed) {
  const r = mulberry32(seed);
  const pick = a => a[Math.floor(r() * a.length)];
  const look = {
    race, skin: pick(SKIN[race]), hair: pick(HAIR[race]), cloth: pick(CLOTH), metal: pick(METAL),
    blink: r() * 4, breath: r() * Math.PI * 2, hat: 'none', beard: null,
  };
  if (race === 'dwarf') { look.hat = r() < 0.6 ? 'helmet' : 'hood'; look.beard = r() < 0.7 ? 'long' : 'short'; }
  if (race === 'orc') look.hat = r() < 0.5 ? 'topknot' : 'bald';
  if (race === 'elf') look.hat = r() < 0.5 ? 'circlet' : 'none';
  // новые расы — своими ветками: у старых те же случайные числа, внешность гостей не сдвинулась
  if (race === 'goblin') look.hat = r() < 0.35 ? 'cap' : 'none';
  if (race === 'human') {
    look.hair2 = pick(['short', 'short', 'long', 'bald']);
    look.hat = r() < 0.2 ? 'hood' : r() < 0.3 ? 'cap' : 'none';
    look.beard = r() < 0.3 ? 'short' : null;
  }
  return look;
}

// Доля терпения → настроение 0..2. Между порогами — плавно, чтобы лицо менялось на глазах.
export function moodValue(frac, calm = 0.6, angry = 0.3) {
  if (frac >= calm) return 0;
  if (frac >= angry) return (calm - frac) / (calm - angry);
  return Math.min(2, 1 + (angry - frac) / angry);
}

// Ключевые кадры мимики для m = 0, 1, 2: [x1, y1, cx, cy, x2, y2] квадратичной кривой.
const BROW = [[-19, -11, -12, -16, -5, -11], [-19, -12, -12, -12, -5, -12], [-20, -16, -12.5, -12.5, -5, -9]];
const MOUTH = [[-9, 31, 0, 39, 9, 31], [-7, 34, 0, 34, 7, 33], [-9, 36, 0, 28, 9, 36]];
// m < 0 — радость (до −1): брови вверх, улыбка шире, глаза дугами, румянец.
const BROW_JOY = [-19, -14, -12, -22, -5, -15];
const MOUTH_JOY = [-12, 28, 0, 46, 12, 28];
function key(frames, m) {
  if (m < 0) {
    const joy = frames === BROW ? BROW_JOY : MOUTH_JOY, k = Math.min(1, -m);
    return frames[0].map((v, i) => v + (joy[i] - v) * k);
  }
  const a = Math.min(1, Math.floor(m)), k = m - a;
  return frames[a].map((v, i) => v + (frames[a + 1][i] - v) * k);
}

function drawFigure(ctx, look, { m = 0, t = 0, chew = false, headOnly = false }) {
  const fill = (path, color) => { ctx.fillStyle = color; ctx.fill(path); };
  const ell = (x, y, rx, ry, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  const mouthDy = look.beard ? 0 : -10;     // без бороды рот выше — иначе он ниже подбородка
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (look.race === 'elf' || look.hair2 === 'long') fill(PATH.hairBack, shade(look.hair, 0.8));
  if (!headOnly) {
    ctx.strokeStyle = RIM; ctx.lineWidth = 5; ctx.stroke(PATH.body);
    fill(PATH.body, look.cloth);
    ctx.strokeStyle = shade(look.cloth, 0.7); ctx.lineWidth = 3; ctx.stroke(PATH.collar);
  }
  const ear = shade(look.skin, 0.92);
  if (look.race === 'dwarf' || look.race === 'human') { ell(-33, 0, 6, 9, ear); ell(33, 0, 6, 9, ear); }
  if (look.race === 'goblin') { fill(PATH.earGoblinL, ear); fill(PATH.earGoblinR, ear); }
  if (look.race === 'orc') { fill(PATH.earOrcL, ear); fill(PATH.earOrcR, ear); }
  if (look.race === 'elf') { fill(PATH.earElfL, ear); fill(PATH.earElfR, ear); }

  const [hrx, hry] = HEAD[look.race];
  ctx.beginPath(); ctx.ellipse(0, -4, hrx, hry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = RIM; ctx.lineWidth = 5; ctx.stroke();
  ctx.fillStyle = look.skin; ctx.fill();

  if (look.hat === 'helmet') {
    fill(PATH.helmet, look.metal);
    ctx.strokeStyle = shade(look.metal, 1.25); ctx.lineWidth = 3; ctx.stroke(PATH.helmetShine);
    ctx.fillStyle = shade(look.metal, 0.78); ctx.fillRect(-38, -17, 76, 9);
    for (const x of [-24, 0, 24]) ell(x, -12.5, 2, 2, shade(look.metal, 1.25));
  }
  if (look.hat === 'hood') fill(PATH.hood, look.cloth);
  if (look.hat === 'topknot') fill(PATH.topknot, look.hair);
  if (look.race === 'goblin') fill(PATH.tuft, look.hair);
  if (look.race === 'elf' || look.hair2 === 'long') fill(PATH.hairFront, look.hair);
  if (look.hair2 === 'short') fill(PATH.hairShort, look.hair);
  if (look.hat === 'cap') fill(PATH.cap, shade(look.cloth, 0.85));
  if (look.hat === 'toque') { fill(PATH.toque, '#f4f1ea'); ctx.strokeStyle = '#cfc8b8'; ctx.lineWidth = 2; ctx.stroke(PATH.toque); }
  if (look.hat === 'beret') { fill(PATH.feather, '#d8b25a'); fill(PATH.beret, '#7a2e3a'); }
  if (look.hat === 'circlet') {
    ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, -22, 31, 8, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
  }
  if (look.beard) {
    fill(look.beard === 'long' ? PATH.beardLong : PATH.beardShort, look.hair);
    if (look.beard === 'long') { ctx.strokeStyle = shade(look.hair, 1.15); ctx.lineWidth = 2.5; ctx.stroke(PATH.beardLines); }
  }

  if (look.race === 'orc') ell(0, 8, 11, 7, shade(look.skin, 0.85));
  else if (look.race === 'elf') ell(0, 6, 5, 7, shade(look.skin, 0.9));
  else if (look.race === 'goblin') fill(PATH.noseGoblin, shade(look.skin, 0.82));
  else if (look.race === 'human') ell(0, 9, 6.5, 7, shade(look.skin, 0.88));
  else ell(0, 10, 9, 8, shade(look.skin, 0.88));
  if (look.beard) { fill(PATH.mustacheL, shade(look.hair, 0.82)); fill(PATH.mustacheR, shade(look.hair, 0.82)); }

  // глаза моргают раз в ~4 с, у каждого гостя своя фаза; от радости щурятся дугами
  if (m <= -0.5) {
    ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(-12, 0, 5, Math.PI * 1.15, Math.PI * 1.85); ctx.moveTo(17, -1.6); ctx.arc(12, 0, 5, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.globalAlpha = Math.min(1, -m) * 0.6; ell(-20, 10, 7, 4.5, '#ef8a72'); ell(20, 10, 7, 4.5, '#ef8a72'); ctx.globalAlpha = 1;
  } else if ((t + look.blink) % 4.2 < 0.13) {
    ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-16, -2); ctx.lineTo(-8, -2); ctx.moveTo(8, -2); ctx.lineTo(16, -2); ctx.stroke();
  } else {
    const er = look.race === 'goblin' ? 4.8 : 3.6;    // у гоблина глаза навыкате
    ell(-12, -2, er, er, '#2a1a12'); ell(12, -2, er, er, '#2a1a12');
    ell(-11, -3.2, er * 0.3, er * 0.3, '#fff4e6'); ell(13, -3.2, er * 0.3, er * 0.3, '#fff4e6');
  }

  const b = key(BROW, m);
  ctx.strokeStyle = shade(look.hair, 0.7);
  ctx.lineWidth = look.race === 'orc' ? 5 : 3.5;
  ctx.beginPath();
  ctx.moveTo(b[0], b[1]); ctx.quadraticCurveTo(b[2], b[3], b[4], b[5]);
  ctx.moveTo(-b[0], b[1]); ctx.quadraticCurveTo(-b[2], b[3], -b[4], b[5]);
  ctx.stroke();
  if (look.scar) { ctx.strokeStyle = '#b8705e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(9, -20); ctx.lineTo(17, 4); ctx.stroke(); }

  if (chew && Math.sin(t * 14) > 0) ell(0, 33 + mouthDy, 5, 3.5, '#5a2414');
  else {
    const mo = key(MOUTH, m);
    ctx.strokeStyle = '#5a2414'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(mo[0], mo[1] + mouthDy); ctx.quadraticCurveTo(mo[2], mo[3] + mouthDy, mo[4], mo[5] + mouthDy); ctx.stroke();
  }
  if (look.race === 'orc') { fill(PATH.tuskL, '#f1ead8'); fill(PATH.tuskR, '#f1ead8'); }

  // румянец злости, капля пота ожидания, пар ярости
  const blush = Math.max(0, Math.min(1, m - 1));
  if (blush > 0) { ctx.globalAlpha = blush * 0.8; ell(-19, 9, 7, 4.5, '#e0705a'); ell(19, 9, 7, 4.5, '#e0705a'); ctx.globalAlpha = 1; }
  const sweat = Math.max(0, 1 - Math.abs(m - 1) * 2);
  if (sweat > 0) { ctx.globalAlpha = sweat; fill(PATH.sweat, '#9fd0e6'); ctx.globalAlpha = 1; }
  if (m > 1.5) {
    const rise = (t * 20) % 10;
    ctx.globalAlpha = Math.min(1, (m - 1.5) * 2);
    ctx.strokeStyle = '#d9c9b0'; ctx.lineWidth = 3;
    ctx.beginPath();
    for (const sx of [-26, 26]) { ctx.moveTo(sx, -58 - rise); ctx.bezierCurveTo(sx - 4, -64 - rise, sx + 4, -68 - rise, sx, -74 - rise); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export const SMALL = 0.85;   // полурослик — ниже остальных, голова в окне раздачи та же

export function drawGuest(ctx, look, o, x, y, s) {
  const breath = 1 + 0.012 * Math.sin((o.t || 0) * 2 + look.breath);   // дыхание — от линии стойки
  if (look.small) s *= SMALL;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s * breath);
  ctx.translate(0, -RIG.counter);
  drawFigure(ctx, look, o);
  ctx.restore();
}

export function drawHead(ctx, look, o, cx, cy, d) {
  const s = d / 124;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);
  ctx.translate(0, -RIG.headCy);
  drawFigure(ctx, look, { ...o, headOnly: true });
  ctx.restore();
}
