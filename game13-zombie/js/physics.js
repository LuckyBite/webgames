// Статичная геометрия столкновений: AABB-коробки в пространственной сетке.
// Персонажи — вертикальные цилиндры (круг в XZ + высота), скользят вдоль стен,
// заступают на уступы до STEP. Пули — луч по ячейкам сетки (DDA).

const CELL = 8;
export const STEP = 0.45;

export class Physics {
  constructor() {
    this.boxes = [];
    this.grid = new Map();
    this.dynamic = []; // подвижные коробки (машины): {box, ref}, проверяются перебором
    this._stamp = 0;
  }
  key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

  // b = {minX,minY,minZ,maxX,maxY,maxZ, tag?, ref?, solid?}
  add(b) {
    b.id = this.boxes.length;
    b._s = 0;
    if (b.solid === undefined) b.solid = true;
    this.boxes.push(b);
    const x0 = Math.floor(b.minX / CELL), x1 = Math.floor(b.maxX / CELL);
    const z0 = Math.floor(b.minZ / CELL), z1 = Math.floor(b.maxZ / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const k = this.key(x, z);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, a = []);
      a.push(b);
    }
    return b;
  }
  addBox(cx, cy, cz, sx, sy, sz, extra) {
    return this.add(Object.assign({ minX: cx - sx / 2, maxX: cx + sx / 2, minY: cy, maxY: cy + sy, minZ: cz - sz / 2, maxZ: cz + sz / 2 }, extra));
  }
  // повёрнутую коробку приближаем набором маленьких AABB вдоль длинной оси
  addRotatedBox(cx, cy, cz, sx, sy, sz, ry, extra) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const ax = Math.abs(c) > 0.97 || Math.abs(s) > 0.97;
    if (ax) {
      const swap = Math.abs(s) > 0.97;
      return [this.addBox(cx, cy, cz, swap ? sz : sx, sy, swap ? sx : sz, extra)];
    }
    const long = Math.max(sx, sz), short = Math.min(sx, sz);
    const n = Math.max(2, Math.ceil(long / short));
    const dirX = sx >= sz ? c : s, dirZ = sx >= sz ? -s : c;
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      out.push(this.addBox(cx + dirX * t * long, cy, cz + dirZ * t * long, short * 0.9, sy, short * 0.9, extra));
    }
    return out;
  }

  query(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const st = ++this._stamp;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const a = this.grid.get(this.key(x, z));
      if (!a) continue;
      for (const b of a) if (b._s !== st) { b._s = st; out.push(b); }
    }
    for (const d of this.dynamic) {
      const b = d.box;
      if (b.maxX >= minX && b.minX <= maxX && b.maxZ >= minZ && b.minZ <= maxZ) out.push(b);
    }
    return out;
  }

  // высота опоры под точкой: верх самой высокой коробки, на которую можно встать с высоты y
  groundAt(x, z, y, r = 0.25) {
    const list = this.query(x - r, z - r, x + r, z + r, _q);
    let g = 0;
    for (const b of list) {
      if (!b.solid) continue;
      if (x + r <= b.minX || x - r >= b.maxX || z + r <= b.minZ || z - r >= b.maxZ) continue;
      if (b.maxY <= y + STEP && b.maxY > g) g = b.maxY;
    }
    return g;
  }

  // Двигает цилиндр (pos — {x,y,z}, ноги) на dx,dz. Возвращает true, если упёрся.
  // step — какой высоты препятствие перешагиваем (зомби лезут через низкие заборы)
  moveCircle(pos, r, h, dx, dz, step = STEP) {
    let hit = false;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * 0.8)));
    const sx = dx / steps, sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      pos.x += sx; pos.z += sz;
      if (this.resolve(pos, r, h, step)) hit = true;
    }
    return hit;
  }

  resolve(pos, r, h, step = STEP) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      const list = this.query(pos.x - r, pos.z - r, pos.x + r, pos.z + r, _q);
      let moved = false;
      for (const b of list) {
        if (!b.solid) continue;
        // коробки ниже уступа и выше головы не мешают
        if (b.maxY <= pos.y + step || b.minY >= pos.y + h) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let ddx = pos.x - cx, ddz = pos.z - cz;
        const d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = r - d;
          pos.x += ddx / d * push; pos.z += ddz / d * push;
        } else {
          // центр внутри коробки — выталкиваем по ближайшей грани
          const l = pos.x - b.minX, rr = b.maxX - pos.x, f = pos.z - b.minZ, k = b.maxZ - pos.z;
          const m = Math.min(l, rr, f, k);
          if (m === l) pos.x = b.minX - r; else if (m === rr) pos.x = b.maxX + r;
          else if (m === f) pos.z = b.minZ - r; else pos.z = b.maxZ + r;
        }
        hit = moved = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  // есть ли пересечение цилиндра с геометрией (для проверки места спавна)
  blocked(x, y, z, r, h) {
    const list = this.query(x - r, z - r, x + r, z + r, _q);
    for (const b of list) {
      if (!b.solid || b.maxY <= y + STEP || b.minY >= y + h) continue;
      const cx = Math.max(b.minX, Math.min(x, b.maxX)), cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
    }
    return false;
  }

  // Луч: возвращает {t, box, nx,ny,nz} ближайшего попадания или null.
  // Перебираем ячейки сетки вдоль луча (DDA), внутри — тест «слэбами».
  raycast(ox, oy, oz, dx, dy, dz, maxT, ignore) {
    const st = ++this._stamp;
    let best = null, bestT = maxT;
    const test = b => {
      if (b._s === st) return; b._s = st;
      if (b === ignore || b.noRay || (ignore && b.ref === ignore)) return;
      const r = rayBox(ox, oy, oz, dx, dy, dz, b, bestT);
      if (r !== null && r < bestT) { bestT = r; best = b; }
    };
    for (const d of this.dynamic) test(d.box);
    let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDX = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : Infinity;
    const tDZ = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : Infinity;
    let tMX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity;
    let tMZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz)) : Infinity;
    let t = 0;
    for (let i = 0; i < 400 && t <= bestT; i++) {
      const a = this.grid.get(this.key(cx, cz));
      if (a) for (const b of a) test(b);
      if (tMX < tMZ) { t = tMX; tMX += tDX; cx += stepX; } else { t = tMZ; tMZ += tDZ; cz += stepZ; }
    }
    // пол (y=0)
    if (dy < -1e-6) { const tg = -oy / dy; if (tg > 0 && tg < bestT) { bestT = tg; best = GROUND; } }
    if (!best) return null;
    return { t: bestT, box: best };
  }
}

export const GROUND = { tag: 'ground', minX: -1e9, maxX: 1e9, minY: -1, maxY: 0, minZ: -1e9, maxZ: 1e9 };
const _q = [];

export function rayBox(ox, oy, oz, dx, dy, dz, b, maxT) {
  let t0 = 0, t1 = maxT;
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? ox : a === 1 ? oy : oz;
    const d = a === 0 ? dx : a === 1 ? dy : dz;
    const mn = a === 0 ? b.minX : a === 1 ? b.minY : b.minZ;
    const mx = a === 0 ? b.maxX : a === 1 ? b.maxY : b.maxZ;
    if (Math.abs(d) < 1e-9) { if (o < mn || o > mx) return null; continue; }
    let ta = (mn - o) / d, tb = (mx - o) / d;
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  return t0;
}

// луч против вертикального цилиндра (зомби): возвращает t или null
export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cy, cz, r, h, maxT) {
  const px = ox - cx, pz = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const b = 2 * (px * dx + pz * dz);
  const c = px * px + pz * pz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0 || t > maxT) return null;
  const y = oy + dy * t;
  if (y < cy || y > cy + h) return null;
  return t;
}
