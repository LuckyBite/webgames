// Построение сцены v2 из плана города (city.js) на PSX-паках (assets/env, envkit.js).
//  - земля: canvas-текстуры (кварталы, окрестности) + море; дороги и тротуары — плитки Urban Stacked Pack
//  - дома без входа: фасады из модулей ALEX (2×2 м × 1.4), плоская крыша с карнизом, вывески из общего атласа
//  - здания с входом: детали Urban 3×3 м, проём двери, пол и потолок, мебель Bolillo/офиса, контейнеры лута
//  - всё статичное — BatchedMesh на материал (один вызов отрисовки на материал), отсечение по дальности
//  - коллайдеры: AABB в physics.js; контейнеры лута регистрируются в world.containers
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Assets, styleMaterial, Selection } from './assets.js';
import { PITCH, ROAD, SIDE, N, HALF, COAST_X, WORLD, streetLine, SHELL_TYPES, MOD, CELL, districtAt, onRoad, JUNK } from './city.js';
// мелкие лекарства из PSX Med Pack, что рассыпаны по полу (флаконы, блистеры, шприц, пластырь)
const MEDS = [['med_13'], ['med_18'], ['med_19'], ['med_20'], ['med_7'], ['med_17'], ['med_14'], ['med_9'], ['med_3'], ['med_5']];

const CHUNK = 128;
const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const S_MOD = MOD / 2; // масштаб модулей ALEX

export class World {
  constructor(scene, physics, plan, renderer) {
    this.scene = scene;
    this.phys = physics;
    this.plan = plan;
    this.r = renderer;
    this.containers = [];
    this.interact = [];
    this.shellIndex = {};
    this.lamps = [];
    this.batches = {};
    this.batchItems = [];
    this.items = [];
    this.chunks = new Map();
    this.colGeo = new Map();
    this.fires = [];
    this.water = null;
    this.vcMat = styleMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.signs = [];
    this.boxesByTex = new Map();
    this.R = mulberry(31);
    this.missing = 0;
  }

  build() {
    this.buildGround();
    this.buildRoads();
    this.buildBuildings();
    this.buildShells();
    this.buildFences();
    this.buildStreetProps();
    this.buildSpecials();
    this.flushBatches();
    this.flushSigns();
    this.flushContainers();
    this.flushChunks();
    this.buildBounds();
    this.buildGrass();
    if (this.missing) console.warn('нет шаблонов для', this.missing, 'деталей');
  }

  // ---------------- размещение деталей ----------------
  // key — шаблон Assets.tpl ('env_…:имя'). s — число или {x,y,z}.
  // opts: fitH/fitL — подогнать высоту/длину, solid: true | 'trunk' | 'car' | 'furn' | false, color — оттенок экземпляра
  place(key, x, y, z, ry, s = 1, opts = {}) {
    // детали, которые пользователь не берёт в проект (витрина → selection.json, envOff), не ставим
    if (!this.envOff) this.envOff = new Set(Selection.envOff || []);
    if (this.envOff.has(key)) return null;
    const t = Assets.tpl[key];
    if (!t) { this.missing++; return null; }
    (this.used || (this.used = new Set())).add(key);
    if (opts.fitH) s = opts.fitH / Math.max(0.01, t.size.y);
    if (opts.fitL) s = opts.fitL / Math.max(0.01, t.size.x, t.size.z);
    // подгонка размера не должна раздувать мелочь в великана (так полочка 4 см стала плитой на улице)
    if ((opts.fitH || opts.fitL) && s > 6) { console.warn('подгонка ×' + s.toFixed(1) + ' для', key); s = 1; }
    const sv = typeof s === 'number' ? _s.set(s, s, s) : _s.set(s.x, s.y, s.z);
    _p.set(x, y, z); _q.setFromAxisAngle(UP, ry);
    const m = new THREE.Matrix4().compose(_p, _q, sv);
    const r = Math.max(t.size.x, t.size.z, t.size.y) * Math.max(sv.x, sv.y, sv.z) * 0.6;
    this.items.push({ key, m, x, z, r, color: opts.color, far: opts.far });
    if (opts.solid) this.colliderFor(t, x, y, z, ry, sv.x, opts.solid);
    return { t, s: sv.x };
  }

  colliderFor(t, x, y, z, ry, s, mode) {
    const sx = t.size.x * s, sy = t.size.y * s, sz = t.size.z * s;
    const cx = (t.box.min.x + t.box.max.x) / 2 * s, cz = (t.box.min.z + t.box.max.z) / 2 * s;
    const c = Math.cos(ry), sn = Math.sin(ry);
    const wx = x + cx * c + cz * sn, wz = z - cx * sn + cz * c;
    if (mode === 'trunk') return this.phys.addBox(x, y, z, 0.45, Math.max(2, sy), 0.45, { tag: 'trunk' });
    if (mode === 'car') return this.phys.addRotatedBox(wx, y, wz, sx * 0.95, Math.min(sy, 1.5), sz * 0.95, ry, { tag: 'car' });
    return this.phys.addRotatedBox(wx, y + t.box.min.y * s, wz, sx * 0.95, sy, sz * 0.95, ry, { tag: mode === 'furn' ? 'furn' : 'static' });
  }

  flushBatches() {
    const groups = new Map();
    for (const it of this.items) {
      for (const part of Assets.tpl[it.key].parts) {
        const mk = part.material.uuid;
        if (!groups.has(mk)) groups.set(mk, { material: part.material, geos: new Map(), list: [] });
        const gr = groups.get(mk);
        if (!gr.geos.has(part.geometry)) gr.geos.set(part.geometry, null);
        gr.list.push({ it, geometry: part.geometry });
      }
    }
    for (const [mk, gr] of groups) {
      let verts = 0;
      for (const g of gr.geos.keys()) verts += g.attributes.position.count;
      const bm = new THREE.BatchedMesh(gr.list.length, verts, 0, gr.material);
      bm.castShadow = true; bm.receiveShadow = true;
      bm.perObjectFrustumCulled = true; bm.sortObjects = false;
      for (const g of gr.geos.keys()) gr.geos.set(g, bm.addGeometry(g));
      const hasColor = gr.list.some(e => e.it.color);
      for (const e of gr.list) {
        const id = bm.addInstance(gr.geos.get(e.geometry));
        bm.setMatrixAt(id, e.it.m);
        if (hasColor) bm.setColorAt(id, e.it.color || WHITE);
        this.batchItems.push({ bm, id, x: e.it.x, z: e.it.z, r: e.it.r, far: e.it.far, vis: true });
      }
      this.scene.add(bm);
      this.batches[mk] = bm;
    }
    this.items.length = 0;
  }

  // ---------------- земля ----------------
  buildGround() {
    const P = this.plan;
    // плоскость только под городом (до внешних улиц), вокруг — земля окрестностей
    const span = HALF * 2 + ROAD, S = 2048, ppm = S / span;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d');
    const X = x => (x + span / 2) * ppm, Z = z => (z + span / 2) * ppm;
    // за городом трава как у окрестностей, в черте города асфальт под плитками улиц
    g.fillStyle = '#4b5640'; g.fillRect(0, 0, S, S);
    const E = HALF + ROAD / 2;
    g.fillStyle = '#3a3c38'; g.fillRect(X(-E), Z(-E), 2 * E * ppm, 2 * E * ppm);
    const BC = { downtown: '#5a5b57', residential: '#45503b', industrial: '#53514c', port: '#56564f', park: '#3e5335', camp: '#4d4a3e' };
    for (const b of P.blocks) {
      const h = PITCH / 2 - ROAD / 2;
      g.fillStyle = BC[b.d] || '#4b4d48';
      g.fillRect(X(b.cx - h), Z(b.cz - h), 2 * h * ppm, 2 * h * ppm);
    }
    const R = mulberry(7);
    for (let i = 0; i < 9000; i++) {
      const x = R() * S, y = R() * S, r = 0.5 + R() * 2.5;
      g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.035)';
      g.fillRect(x, y, r, r);
    }
    for (let i = 0; i < 120; i++) {
      g.fillStyle = 'rgba(60,8,8,0.35)';
      const x = R() * S, y = R() * S;
      for (let k = 0; k < 6; k++) g.fillRect(x + (R() - 0.5) * 8, y + (R() - 0.5) * 8, 1 + R() * 3, 1 + R() * 3);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.r.trackTexture(tex);
    const city = new THREE.Mesh(new THREE.PlaneGeometry(span, span, 40, 40), styleMaterial(new THREE.MeshLambertMaterial({ map: tex, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3 }), { detail: { tex: groundDetail(this.r), rep: span / 3 } })); // сетка, а не один квадрат: в PS1 огромные полигоны дёргались и кривили края дорог
    city.rotation.x = -Math.PI / 2; city.position.y = -0.01; city.receiveShadow = true; // чуть ниже нуля, а асфальт плиток дорог (плитка на y −0.155, асфальт в ней на +0.16) чуть выше: его видно, и персонажи не висят.
    // polygonOffset отодвигает землю по глубине с учётом наклона: в PS1 снап вершин сдвигает треугольники на пиксель, и под острым углом земля пробивала асфальт полосами
    this.scene.add(city);

    const S2 = 1024, span2 = 2200, p2 = S2 / span2;
    const c2 = document.createElement('canvas'); c2.width = c2.height = S2;
    const g2 = c2.getContext('2d');
    const X2 = x => (x + span2 / 2) * p2, Z2 = z => (z + span2 / 2) * p2;
    g2.fillStyle = '#4b5640'; g2.fillRect(0, 0, S2, S2);
    for (let i = 0; i < 26000; i++) {
      g2.fillStyle = ['rgba(70,80,52,0.5)', 'rgba(90,86,62,0.45)', 'rgba(55,64,45,0.5)', 'rgba(100,96,80,0.25)'][i & 3];
      g2.fillRect(R() * S2, R() * S2, 1 + R() * 3, 1 + R() * 3);
    }
    for (let i = 0; i < 40; i++) {
      g2.fillStyle = ['rgba(98,90,60,0.35)', 'rgba(60,70,44,0.4)', 'rgba(110,100,72,0.3)'][i % 3];
      g2.fillRect(R() * S2, R() * S2, 20 + R() * 60, 20 + R() * 60);
    }
    g2.fillStyle = '#35373a';
    const seg = (x0, z0, x1, z1, w) => {
      const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2);
      for (let i = 0; i <= n; i++) { const t = i / n; g2.fillRect(X2(x0 + (x1 - x0) * t) - w * p2 / 2, Z2(z0 + (z1 - z0) * t) - w * p2 / 2, w * p2, w * p2); }
    };
    for (const pr of P.props) if (pr.special === 'road') seg(pr.x0, pr.z0, pr.x1, pr.z1, pr.w + 2);
    const af = P.airfield;
    if (af) { g2.fillStyle = '#3a3c3f'; g2.fillRect(X2(af.x - af.w / 2), Z2(af.z - af.len / 2), af.w * p2, af.len * p2);
      g2.fillStyle = '#2f3134'; g2.fillRect(X2(af.x + af.w / 2), Z2(af.z - 140), 40 * p2, 50 * p2); }
    const mil = P.military;
    g2.fillStyle = '#58564c'; g2.fillRect(X2(mil.x - mil.w / 2), Z2(mil.z - mil.d / 2), mil.w * p2, mil.d * p2);
    g2.fillStyle = '#7d7660'; g2.fillRect(X2(COAST_X - 14), 0, 14 * p2, S2);
    const tex2 = new THREE.CanvasTexture(c2);
    tex2.colorSpace = THREE.SRGBColorSpace;
    this.r.trackTexture(tex2);
    const land = new THREE.Mesh(new THREE.PlaneGeometry(span2, span2, 110, 110), styleMaterial(new THREE.MeshLambertMaterial({ map: tex2, polygonOffset: true, polygonOffsetFactor: 6, polygonOffsetUnits: 6 }), { detail: { tex: groundDetail(this.r), rep: span2 / 3 } }));
    land.rotation.x = -Math.PI / 2; land.position.y = -0.03; land.receiveShadow = true;
    this.scene.add(land);
    const rw = new THREE.Group();
    const lm = styleMaterial(new THREE.MeshLambertMaterial({ color: 0x9a9480 }));
    if (af) for (let z = -af.len / 2 + 20; z < af.len / 2 - 20; z += 18) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 8), lm);
      d.rotation.x = -Math.PI / 2; d.position.set(af.x, 0.03, af.z + z); rw.add(d);
    }
    this.scene.add(rw);
    const wm = new THREE.MeshLambertMaterial({ color: 0x2d3f4a, transparent: true, opacity: 0.92 });
    styleMaterial(wm);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(1400, 2400, 70, 120), wm);
    water.rotation.x = -Math.PI / 2; water.position.set(COAST_X + 700, -0.6, 0); water.receiveShadow = true;
    this.scene.add(water);
    this.water = water;
    // бортик набережной: длинный бокс порезан на куски по 20 м (цельный в 2400 м дёргался в PS1),
    // верх на 6 см выше земли, чтобы не спорил с ней по глубине
    const bank = new THREE.Mesh(new THREE.BoxGeometry(2, 3, 2400, 1, 1, 120), styleMaterial(new THREE.MeshLambertMaterial({ color: 0x5d5a50 })));
    bank.position.set(COAST_X + 1, -1.44, 0);
    this.scene.add(bank);
  }

  // ---------------- дороги и тротуары ----------------
  buildRoads() {
    // плитка 16×16 ужата: поперёк до ширины улицы, вдоль — три прямые между перекрёстками
    const T = 16, seg = (PITCH - ROAD) / 3, ax = ROAD / T;
    const sj = { x: ax, y: 1, z: ax }, ss = { x: ax, y: 1, z: seg / T };
    for (let i = 0; i <= N; i++) {
      const l = streetLine(i);
      for (let j = 0; j <= N; j++) {
        const m = streetLine(j);
        this.place('env_urban_roads:road_1_junction', l, -0.155, m, 0, sj, { far: true });
        if (j === N) continue;
        for (let k = 0; k < 3; k++) {
          const t = m + ROAD / 2 + seg / 2 + k * seg;
          this.place('env_urban_roads:road_1_straight', l, -0.155, t, 0, ss, { far: true });
          this.place('env_urban_roads:road_1_straight', t, -0.155, l, Math.PI / 2, ss, { far: true });
        }
      }
    }
    // пешеходные переходы («зебра») у каждого перекрёстка: полосы на общей текстуре, одной сеткой
    {
      const zc = document.createElement('canvas'); zc.width = 64; zc.height = 16;
      const zx = zc.getContext('2d');
      zx.clearRect(0, 0, 64, 16);
      for (let i = 0; i < 8; i++) { zx.fillStyle = 'rgba(190,190,180,0.55)'; zx.fillRect(i * 8 + 1, 0, 5, 16); }
      for (let k = 0; k < 40; k++) { zx.clearRect(Math.random() * 64, Math.random() * 16, 1 + Math.random() * 2, 1 + Math.random() * 2); }
      const zt = new THREE.CanvasTexture(zc); zt.colorSpace = THREE.SRGBColorSpace; zt.magFilter = THREE.NearestFilter;
      this.r.trackTexture(zt);
      const geos = [];
      const D = ROAD / 2 + 1.4, W = ROAD * 0.78, L = 2.2;
      for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
        const x = streetLine(i), z = streetLine(j);
        for (const [ox, oz, rot] of [[0, -D, 0], [0, D, 0], [-D, 0, Math.PI / 2], [D, 0, Math.PI / 2]]) {
          if (Math.abs(z + oz) > HALF + 1 || Math.abs(x + ox) > HALF + 1) continue;
          const g = new THREE.PlaneGeometry(W, L).rotateX(-Math.PI / 2).rotateY(rot);
          g.translate(x + ox, 0.05, z + oz);
          geos.push(g);
        }
      }
      if (geos.length) {
        const m = new THREE.Mesh(mergeGeometries(geos), styleMaterial(new THREE.MeshLambertMaterial({ map: zt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })));
        m.receiveShadow = true; m.renderOrder = 1;
        this.scene.add(m);
      }
    }
    // тротуары: три куска на сторону квартала, бордюр 0.17 м — у коллайдера та же высота
    const off = PITCH / 2 - ROAD / 2 - SIDE / 2;
    const sw = { x: 1, y: 1, z: seg / T };
    for (const w of this.plan.walks) {
      for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        for (let k = -1; k <= 1; k++) {
          const x = w.x + nx * off + (nz ? k * seg : 0), z = w.z + nz * off + (nx ? k * seg : 0);
          this.place('env_urban_roads:road_side_full', x, -0.15, z, nx ? (nx > 0 ? 0 : Math.PI) : (nz > 0 ? Math.PI / 2 : -Math.PI / 2), sw);
        }
        const len = PITCH - ROAD;
        this.phys.addBox(w.x + nx * off, 0, w.z + nz * off, nx ? SIDE : len, 0.17, nx ? len : SIDE, { tag: 'curb', noRay: true });
      }
    }
  }

  // ---------------- дома без входа ----------------
  buildBuildings() {
    for (const b of this.plan.buildings) {
      if (b.kind === 'pre') this.place(b.id, b.x, 0, b.z, b.ry, b.s || 1, { solid: true, far: true });
      else this.modHouse(b);
    }
  }

  // локальная система дома: фасад вдоль +x от 0, лицом к +z, глубина в −z; (x,z) плана — центр
  modHouse(b) {
    const R = this.R;
    const W = b.cols * MOD, D = b.rows * MOD;
    const c = Math.cos(b.ry), s = Math.sin(b.ry);
    const ox = b.x + (-W / 2) * c + (D / 2) * s, oz = b.z - (-W / 2) * s + (D / 2) * c;
    const tx = (lx, lz) => ox + lx * c + lz * s, tz = (lx, lz) => oz - lx * s + lz * c;
    const mod = (name, lr, lx, ly, lz) => this.place('env_building:' + name, tx(lx, lz), ly, tz(lx, lz), b.ry + lr, S_MOD, { far: true });
    const mat = b.mat, f = b.floors;
    const win = pickR(R, WINS), win2 = pickR(R, WINS);
    const doorAt = Math.floor(b.cols / 2);
    const FRONT = -Math.PI / 2, BACK = Math.PI / 2, LEFT = Math.PI, RIGHT = 0;
    for (let y = 0; y < f; y++) {
      for (let i = 0; i < b.cols; i++) {
        let p = mat + '_window' + (i % 3 === 1 ? win2 : win);
        if (y === 0 && i === doorAt) p = mat + '_door0' + (1 + Math.floor(R() * 3));
        else if (y === 0 && b.shop) p = mat + '_window0' + (1 + (i % 6));
        else if (R() < 0.12) p = mat + '_wall';
        mod(p, FRONT, i * MOD, y * MOD, 0);
        mod(R() < 0.6 ? mat + '_wall' : mat + '_window' + win, BACK, (i + 1) * MOD, y * MOD, -D);
      }
      for (let j = 0; j < b.rows; j++) {
        // левая стена развёрнута на 180°: модуль ложится от точки вперёд (+z), поэтому ставим её в дальний край клетки,
        // иначе стена торчит на модуль перед фасадом, а сзади остаётся дыра
        mod(R() < 0.5 ? mat + '_wall' : mat + '_window' + win, LEFT, 0, y * MOD, -(j + 1) * MOD);
        mod(R() < 0.5 ? mat + '_wall' : mat + '_window' + win, RIGHT, W, y * MOD, -j * MOD);
      }
    }
    const top = f * MOD;
    this.addBoxWorld(b.x, top + 0.15, b.z, W, 0.3, D, b.ry, 0x4a4b4c, false);
    for (let i = 0; i < b.cols; i++) mod(mat + '_roof_long_norm', FRONT, i * MOD, top, 0);
    // кондиционер не вешаем на этаж с вывеской: он торчит на 0.4 м и прошивал её
    const acY = b.sign ? 2 : 1;
    if (f > acY && R() < 0.7) mod('ac_unit', FRONT, (b.cols - 1) * MOD + 0.4, acY * MOD + 0.6, 0.1);
    this.place('env_building:gutter', tx(0.05, 0.05), 0, tz(0.05, 0.05), b.ry, { x: S_MOD, y: f * S_MOD, z: S_MOD }, { far: true });
    if (b.sign) this.sign(b.sign, b.signBg, tx(W / 2, 0.14), MOD + 0.75, tz(W / 2, 0.14), b.ry, Math.min(W - 1, 8), 1.4);
    const swap = Math.abs(s) > 0.5;
    this.phys.addBox(b.x, 0, b.z, (swap ? D : W) - 0.1, top + 0.3, (swap ? W : D) - 0.1, { tag: 'static' });
  }

  // ---------------- вывески: общий атлас ----------------
  sign(text, bg, x, y, z, ry, w, h) { this.signs.push({ text, bg, x, y, z, ry, w, h }); }
  flushSigns() {
    if (!this.signs.length) return;
    const CW = 128, CH = 24, cols = 8, rows = Math.ceil(this.signs.length / cols);
    const c = document.createElement('canvas'); c.width = CW * cols; c.height = CH * rows;
    const x = c.getContext('2d');
    const geos = [];
    this.signs.forEach((s, i) => {
      const cx = (i % cols) * CW, cy = Math.floor(i / cols) * CH;
      x.fillStyle = s.bg || '#3a3f45'; x.fillRect(cx, cy, CW, CH);
      x.fillStyle = '#e8e2c8'; x.font = 'bold 14px sans-serif'; x.textAlign = 'center';
      x.fillText(s.text, cx + CW / 2, cy + 17, CW - 8);
      for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(20,18,15,${Math.random() * 0.35})`; x.fillRect(cx + Math.random() * CW, cy + Math.random() * CH, 2, 2); }
      const g = new THREE.PlaneGeometry(s.w, s.h);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, (cx + uv.getX(k) * CW) / c.width, 1 - (cy + (1 - uv.getY(k)) * CH) / c.height);
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(s.x, s.y, s.z), new THREE.Quaternion().setFromAxisAngle(UP, s.ry), new THREE.Vector3(1, 1, 1)));
      geos.push(g);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    this.r.trackTexture(t);
    const m = new THREE.Mesh(mergeGeometries(geos), styleMaterial(new THREE.MeshLambertMaterial({ map: t })));
    m.receiveShadow = true;
    this.scene.add(m);
  }

  // ---------------- здания с входом (детали Urban 3×3 м) ----------------
  buildShells() { for (const sh of this.plan.shells) { this.shellIndex[sh.id] = sh; this.buildShell(sh); } }

  buildShell(sh) {
    const T = SHELL_TYPES[sh.type];
    const st = sh.style || T.style;
    const c = Math.round(Math.cos(sh.ry)), s = Math.round(Math.sin(sh.ry));
    const tx = (lx, lz) => sh.x + lx * c + lz * s, tz = (lx, lz) => sh.z - lx * s + lz * c;
    const W = sh.w, D = sh.d, hw = W / 2, hd = D / 2;
    const floors = T.tall ? 2 : 1, H = floors * CELL;
    const part = (name, lr, lx, ly, lz) => this.place('env_urban_building_parts:' + name, tx(lx, lz), ly, tz(lx, lz), sh.ry + lr, 1);
    // ось детали: плоскость с нормалью +x, ширина вдоль z. Лицом к +z: поворот −90°
    const FRONT = -Math.PI / 2, BACK = Math.PI / 2, LEFT = Math.PI, RIGHT = 0;
    const R = this.R;
    const wallOrWin = () => R() < 0.45 ? st + '_wall_window_' + (1 + Math.floor(R() * 2)) : st + '_wall';
    const doorAt = Math.floor(sh.cols / 2);
    const doorX = -hw + CELL / 2 + doorAt * CELL;
    const wallBox = (lx, lz, w, d) => {
      const rw = Math.abs(c) ? w : d, rd = Math.abs(c) ? d : w;
      this.phys.addBox(tx(lx, lz), 0, tz(lx, lz), rw, H, rd, { tag: 'wall' });
    };
    for (let y = 0; y < floors; y++) {
      for (let i = 0; i < sh.cols; i++) {
        const lx = -hw + CELL / 2 + i * CELL;
        part(y === 0 && i === doorAt ? st + '_wall_door_frame' : (y === 0 ? wallOrWin() : st + '_wall'), FRONT, lx, y * CELL, hd);
        part(y === 0 ? wallOrWin() : st + '_wall', BACK, lx, y * CELL, -hd);
      }
      for (let j = 0; j < sh.rows; j++) {
        const lz = -hd + CELL / 2 + j * CELL;
        part(y === 0 ? wallOrWin() : st + '_wall', LEFT, -hw, y * CELL, lz);
        part(y === 0 ? wallOrWin() : st + '_wall', RIGHT, hw, y * CELL, lz);
      }
    }
    for (const [lx, lz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) for (let y = 0; y < floors; y++) part(st + '_wall_corner', 0, lx, y * CELL, lz);
    // стены-коллайдеры: перед с проёмом 1.6 м у двери
    const WT = 0.3, door = 1.6;
    const l1 = doorX - door / 2 - (-hw), l2 = hw - (doorX + door / 2);
    wallBox(-hw + l1 / 2, hd, l1, WT); wallBox(hw - l2 / 2, hd, l2, WT);
    wallBox(0, -hd, W, WT); wallBox(-hw, 0, WT, D); wallBox(hw, 0, WT, D);
    // пол, потолок-крыша
    this.addBoxWorld(sh.x, 0.04, sh.z, W, 0.08, D, sh.ry, T.floor, false);
    this.addBoxWorld(sh.x, H + 0.15, sh.z, W + 0.4, 0.3, D + 0.4, sh.ry, 0x45464a, false);
    this.phys.addBox(sh.x, H, sh.z, Math.abs(c) ? W : D, 0.3, Math.abs(c) ? D : W, { tag: 'wall' });
    // перегородка у больших зданий (проход посередине)
    if (W >= 24) {
      const pz = -hd / 3;
      for (let i = 0; i < sh.cols; i++) {
        const lx = -hw + CELL / 2 + i * CELL;
        if (Math.abs(lx) < CELL) continue;
        part(st + '_wall', FRONT, lx, 0, pz);
      }
      wallBox(-hw / 2 - CELL / 2, pz, hw - CELL, WT); wallBox(hw / 2 + CELL / 2, pz, hw - CELL, WT);
    }
    const sg = sh.sign || T.sign;
    // вывеска под краем крыши и чуть впереди него: крыша выступает на 0.2 м, в той же плоскости вывеска мерцала
    if (sg) this.sign(sg[0], sg[1], tx(doorX, hd + 0.3), 2.45, tz(doorX, hd + 0.3), sh.ry, Math.min(W - 2, 8), 1.0);
    this.furnish(sh, T, tx, tz, hw, hd);
    sh.door = { x: tx(doorX, hd + 1.2), z: tz(doorX, hd + 1.2) };
    sh.inside = { x: tx(0, 0), z: tz(0, 0) };
    sh.minX = Math.min(tx(-hw, -hd), tx(hw, hd)); sh.maxX = Math.max(tx(-hw, -hd), tx(hw, hd));
    sh.minZ = Math.min(tz(-hw, -hd), tz(hw, hd)); sh.maxZ = Math.max(tz(-hw, -hd), tz(hw, hd));
  }

  // в аптеке и больнице на полу рассыпаны лекарства (PSX Med Pack): только вид, лут в шкафах
  floorMeds(put, hw, hd, n) {
    const R = this.R;
    for (let i = 0; i < n; i++)
      put('env_x_items:' + MEDS[Math.floor(R() * MEDS.length)][0], (R() - 0.5) * (2 * hw - 2), (R() - 0.5) * (2 * hd - 3), R() * 6.28, { fitL: 0.12 + R() * 0.1, solid: false, dy: 0.02 });
  }

  // мебель вдоль стен; часть мебели — контейнеры лута
  furnish(sh, T, tx, tz, hw, hd) {
    const loot = T.loot.slice();
    const next = () => loot.length ? loot.shift() : null;
    const back = -hd + 0.6;
    const doorLX = -hw + CELL / 2 + Math.floor(sh.cols / 2) * CELL; // где дверь (как в buildShell)
    const put = (key, lx, lz, rot, o = {}) => {
      const wx = tx(lx, lz), wz = tz(lx, lz);
      const r = this.place(key, wx, 0.08 + (o.dy || 0), wz, sh.ry + rot, o.s || 1, { fitH: o.fitH, fitL: o.fitL, solid: o.solid === false ? false : 'furn' });
      if (o.loot) this.addContainer(o.loot, wx, 1, wz, sh.id, { label: o.label || 'Обыскать', chance: 1, radius: 2.6 });
      return r;
    };
    const I = 'env_interior:', O = 'env_office:', R = this.R, X = 'env_x_furn:';
    switch (sh.type) {
      case 'house':
        // половина домов обставлена старьём (PSX Derelict Furniture): ржавый холодильник, продавленный диван
        const old = R() < 0.5;
        put(old ? X + 'fridge' : I + 'refrigerator_02', -hw + 0.8, back, 0, { fitH: 1.9, loot: 'fridge', label: 'Холодильник' });
        put(I + 'stove', -hw + 2.1, back, 0, { fitH: 0.95, loot: 'kitchen', label: 'Кухонный шкаф' });
        put(I + 'washbasin_02', -hw + 3.3, back, 0, { fitH: 0.95 });
        put(old ? X + 'shelf' : O + 'book_case_with_back_small', hw - 1.4, back, 0, { fitH: 1.9, loot: 'wardrobe', label: 'Шкаф' });
        put(old ? X + 'mattress' : I + 'bed_08', hw - 1.2, 0.4, -Math.PI / 2, old ? { fitL: 1.9, solid: false } : { fitL: 2.1 });
        put(old ? X + 'couch' : I + 'armchair_03', -hw + 1, 1.2, Math.PI / 2, { fitH: old ? 0.85 : 0.95 });
        if (old) put(X + 'chair', -hw + 3.6, 1.6, 2.6, { fitH: 1 });
        if (R() < 0.5) put(X + 'vase', hw - 0.6, hd - 0.6, 0, { fitH: 0.4, solid: false });
        put(I + 'table_35', -hw + 2.8, 1, 0, { fitH: 0.78 });
        put(I + 'tv', -hw + 0.5, -1, Math.PI / 2, { fitH: 0.9 });
        put(I + 'cajonera', hw - 0.6, hd - 1.4, -Math.PI / 2, { fitH: 0.8, loot: 'house', label: 'Комод' });
        put(I + 'dirty_clothes_01', -hw + 1.2, hd - 1, 0, { fitL: 0.7, solid: false });
        break;
      case 'shop':
        put(O + 'desk1', hw - 1.6, hd - 1.8, Math.PI, { loot: 'desk', label: 'Касса' });
        put(O + 'book_case_with_back', -hw + 1.4, 0.4, Math.PI / 2, { fitH: 1.9, loot: 'shelf', label: 'Полка' });
        put(O + 'book_case_with_back', 0, -0.4, 0, { fitH: 1.9, loot: 'shelf', label: 'Полка' });
        put(I + 'refrigerator', hw - 1.1, back, 0, { fitH: 2.1, loot: 'fridge', label: 'Холодильник с напитками' });
        put(O + 'book_case_small', -hw + 1.2, back, 0, { fitH: 1.9 });
        put('env_items:box', -hw + 0.8, hd - 1.2, 0.3, { fitH: 0.6, loot: 'trash', label: 'Коробки' });
        break;
      case 'supermarket':
        for (let i = 0; i < 4; i++) {
          const lx = -hw + 4 + i * ((2 * hw - 8) / 3);
          put(O + 'book_case_with_back', lx, -1, 0, { fitH: 2, loot: next(), label: 'Полка' });
          put(O + 'book_case_with_back', lx, 2.5, Math.PI, { fitH: 2 });
        }
        put(I + 'refrigerator', -hw + 1.2, back, 0, { fitH: 2.1, loot: next(), label: 'Холодильник с напитками' });
        put(I + 'refrigerator', hw - 1.2, back, 0, { fitH: 2.1, loot: next(), label: 'Холодильник с напитками' });
        put(O + 'desk1', hw - 3, hd - 2, Math.PI, {});
        break;
      case 'pharmacy':
        put(O + 'book_case_with_back_small', -hw + 1, back, 0, { fitH: 2, loot: next(), label: 'Аптечная полка' });
        put(O + 'book_case_with_back_small', hw - 1.4, back, 0, { fitH: 2, loot: next(), label: 'Аптечная полка' });
        put(O + 'file_cabinet_larger', 0, back, 0, { fitH: 1.4, loot: next(), label: 'Шкаф с лекарствами' });
        put(O + 'desk2', 0, 1.2, Math.PI, {});
        this.floorMeds(put, hw, hd, 4);
        break;
      case 'police':
        for (let i = 0; i < 3; i++) put(O + 'file_cabinet_largest', -hw + 1.5 + i * 1.6, back, 0, { loot: next(), label: 'Шкафчик' });
        // столы по бокам от прохода к двери: стол прямо у двери запирал мертвецов внутри
        put(O + 'desk1', doorLX - 5.5, 1, 0, {}); put(O + 'desk2', doorLX + 5, 1, 0, {});
        put(O + 'office_chair_black', doorLX - 5.1, 2, Math.PI, { solid: false }); put(O + 'office_chair_grey', doorLX + 5.4, 2, Math.PI, { solid: false });
        put(O + 'book_case', hw - 1.5, back, 0, { loot: next(), label: 'Оружейный шкаф' });
        put(O + 'whiteboard', -2, back + 0.1, 0, { solid: false });
        put(O + 'water_cooler', hw - 0.6, hd - 1, 0, {});
        break;
      case 'hospital':
        for (let i = 0; i < 4; i++) put(I + 'bed_08', -hw + 2 + i * 3.2, 2, 0, { fitL: 2.1 });
        for (let i = 0; i < 4; i++) put(O + 'file_cabinet_larger', -hw + 2 + i * 3.6, back, 0, { fitH: 1.4, loot: next(), label: 'Медицинский шкаф' });
        put(O + 'desk2', hw - 3, hd - 2.5, Math.PI, { loot: next(), label: 'Стол регистратуры' });
        this.floorMeds(put, hw, hd, 6);
        break;
      case 'gas':
        put(O + 'book_case_with_back', -hw + 1.2, back, 0, { fitH: 1.9, loot: next(), label: 'Стеллаж' });
        put(O + 'book_case_with_back', 0, back, 0, { fitH: 1.9, loot: next(), label: 'Стеллаж' });
        put(I + 'refrigerator', hw - 1.2, back, 0, { fitH: 2.1, loot: next(), label: 'Холодильник' });
        put(O + 'desk1', hw - 2, hd - 1.6, Math.PI, {});
        break;
      case 'warehouse':
        for (let i = 0; i < 4; i++) {
          const lx = -hw + 3 + i * ((2 * hw - 6) / 3);
          put('env_items:box', lx, back + 0.7, 0, { fitH: 1.3, loot: next(), label: 'Ящик' });
          put('env_items:box', lx + 1.4, 0, 0.3, { fitH: 1.1 });
          put('env_items:barrel', lx - 1, 1.5, 0, { fitH: 1.1 });
          if (R() < 0.6) put('env_x_street:jerrycan', lx + 0.8, 1.6, R() * 6, { fitH: 0.46, solid: false });
        }
        break;
      case 'barracks':
        for (let i = 0; i < 5; i++) put(I + 'bed_07', -hw + 2 + i * 2.8, back + 1.2, 0, { fitL: 2.1 });
        for (let i = 0; i < 3; i++) put(O + 'file_cabinet_largest', -hw + 3 + i * 4, hd - 1, Math.PI, { loot: next(), label: 'Армейский шкафчик' });
        put('env_x_survival:ammunition', hw - 1.2, 0, 0.4, { fitL: 0.6 });
        break;
    }
    // сор на полу: в заброшенных зданиях всегда что-то валяется
    for (let i = 0; i < 2 + Math.floor(R() * 3); i++) {
      const [k, s] = JUNK[Math.floor(R() * JUNK.length)];
      put('env_x_trash:' + k, (R() - 0.5) * (2 * hw - 2), (R() - 0.5) * (2 * hd - 2.5), R() * 6.28, { s, solid: false, dy: 0.03 }); // чуть над полом, иначе плоский сор мерцает
    }
  }

  // ---------------- заборы участков ----------------
  buildFences() {
    const STY = {
      picket: ['env_urban_fences:white_picket_fence_closed_left', 1.37], wood: ['env_urban_fences:wooden_fence_closed', 1.2],
      drystone: ['env_urban_fences:drystone_wall_capped', 0.85], brick: ['env_urban_fences:brick_wall_one_overhang', 2.1],
      metal: ['env_urban_fences:metalfence_both_sides_topbar', 1.7], plackard: ['env_urban_fences:plackard_closed', 2.5],
    };
    for (const f of this.plan.fences) {
      const [key, h] = STY[f.style] || STY.picket;
      const t = Assets.tpl[key];
      if (!t) continue;
      const len = Math.max(t.size.x, t.size.z) * 0.98;
      const x0 = f.x - f.w / 2, x1 = f.x + f.w / 2, z0 = f.z - f.d / 2, z1 = f.z + f.d / 2;
      const gap = 6;
      const run = (ax, az, bx, bz) => {
        const L = Math.hypot(bx - ax, bz - az);
        if (L < 0.5) return;
        const n = Math.max(1, Math.round(L / len));
        const dx = (bx - ax) / n, dz = (bz - az) / n;
        const ry = Math.abs(dx) > Math.abs(dz) ? 0 : Math.PI / 2;
        for (let i = 0; i < n; i++) this.place(key, ax + dx * (i + 0.5), 0, az + dz * (i + 0.5), ry, 1);
        this.phys.addBox((ax + bx) / 2, 0, (az + bz) / 2, Math.abs(bx - ax) || 0.25, h, Math.abs(bz - az) || 0.25, { tag: 'wall' });
      };
      const side = (ax, az, bx, bz, open) => {
        if (!open) return run(ax, az, bx, bz);
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, dx = Math.sign(bx - ax), dz = Math.sign(bz - az);
        run(ax, az, mx - dx * gap / 2, mz - dz * gap / 2);
        run(mx + dx * gap / 2, mz + dz * gap / 2, bx, bz);
      };
      side(x0, z0, x1, z0, f.openSide === 'n'); side(x0, z1, x1, z1, f.openSide === 's');
      side(x0, z0, x0, z1, f.openSide === 'w'); side(x1, z0, x1, z1, f.openSide === 'e');
    }
  }

  // ---------------- деревья, фонари, мусор, остовы машин ----------------
  buildStreetProps() {
    const P = this.plan, R = this.R;
    const PARK = ['tree15', 'tree16', 'tree18', 'tree19', 'tree20', 'tree22', 'tree23', 'tree24', 'tree25'];
    const WILD = ['tree01', 'tree02', 'tree04', 'tree07', 'tree08', 'tree09', 'tree10', 'tree11', 'tree14', 'tree17', 'tree21', 'tree26', 'tree27'];
    const AUTUMN = ['tree28', 'tree29', 'tree30', 'tree32', 'tree33', 'tree34', 'tree36'];
    const BUSH = ['bush02', 'bush04', 'bush06', 'bush08', 'bush01'];
    for (const tr of P.trees) {
      let id, h;
      if (tr.bush) { id = pickR(R, BUSH); h = 1.2 + R() * 0.8; }
      else if (tr.wild) { id = R() < 0.25 ? pickR(R, AUTUMN) : pickR(R, WILD); h = (7 + R() * 5) * tr.s; }
      else { id = R() < 0.2 ? pickR(R, AUTUMN) : pickR(R, PARK); h = (6 + R() * 3) * tr.s; }
      this.place('env_trees:' + id, tr.x, 0, tr.z, R() * 6.28, 1, { fitH: h, solid: tr.bush ? false : 'trunk' });
    }
    for (const l of P.lights) {
      this.place('env_urban_traffic_lights:street_light', l.x, 0, l.z, l.ry + (l.x > 0 ? 0 : Math.PI), 1, { solid: 'trunk' });
      this.lamps.push({ x: l.x, z: l.z, on: l.on });
    }
    for (const pr of P.props) {
      if (!pr.env) continue;
      // lie — мелочь лежит на том, что под ней (тротуар выше дороги на бордюр)
      if (pr.lie) pr.y = this.phys.groundAt(pr.x, pr.z, 0.3, 0.05) + 0.02;
      const r = this.place(pr.env, pr.x, pr.y || 0, pr.z, pr.ry || 0, pr.scale || 1, { fitH: pr.fitH, fitL: pr.fitL, solid: pr.solid || false, far: pr.far || pr.dacha });
      if (r && pr.loot) this.addContainer(pr.loot, pr.x, (pr.y || 0) + 1, pr.z, null, { chance: pr.lootChance ?? 1, label: pr.label || 'Обыскать' });
    }
    // остовы машин (машины на ходу — в vehicles.js)
    for (const c of P.cars) {
      if (c.works) continue;
      const key = 'env_cars:' + c.model;
      if (!Assets.tpl[key]) continue;
      // остов чуть ржавее, но не чёрный (тёмный оттенок умножался на текстуру и машина выходила чёрной)
      const color = c.model === 'car6' ? null : c.wreck ? new THREE.Color(0.7, 0.6, 0.52) : new THREE.Color(0.86, 0.87, 0.89);
      this.place(key, c.x, 0, c.z, c.ry, 1, { fitL: c.model === 'car8' ? 5.2 : 4.4, color, solid: 'car' });
      // багажник — только сзади машины
      const back = (c.model === 'car8' ? 2.6 : 2.2) + 0.3;
      this.addContainer('car', c.x - Math.sin(c.ry) * back, 0.9, c.z - Math.cos(c.ry) * back, null, { chance: c.wreck ? 0.35 : 0.8, label: 'Багажник', radius: 1.3 });
    }
  }

  // ---------------- особые объекты ----------------
  buildSpecials() {
    for (const pr of this.plan.props) {
      if (!pr.special) continue;
      switch (pr.special) {
        case 'campWall': this.campWall(pr); break;
        case 'campfire':
          this.place('env_camp:campfire_grill', pr.x, 0, pr.z, 0, 1.2, { solid: true });
          this.fires.push({ x: pr.x, y: 0.6, z: pr.z, big: true, camp: true });
          break;
        case 'stash': this.place('env_items:box', pr.x, 0, pr.z, 0.3, 1, { fitH: 0.9, solid: true });
          this.interact.push({ kind: 'stash', x: pr.x, y: 0.6, z: pr.z, label: 'Тайник лагеря' }); break;
        case 'bed': this.place('env_interior:bed_07', pr.x, 0, pr.z, 0, 1, { fitL: 2.1, solid: false });
          this.interact.push({ kind: 'bed', x: pr.x, y: 0.4, z: pr.z, label: 'Кровать: поспать до утра' }); break;
        case 'workbench':
          this.place('env_interior:table_19', pr.x, 0, pr.z, Math.PI, 1, { fitH: 0.9, solid: true });
          this.place('env_items:hammer', pr.x + 0.3, 0.92, pr.z, 0.4, 1, { fitL: 0.4 });
          this.interact.push({ kind: 'bench', x: pr.x, y: 1, z: pr.z, label: 'Верстак' }); break;
        case 'generator':
          this.place('env_items:conditioner', pr.x, 0, pr.z, 0, 1, { fitH: 1.2, solid: true });
          this.interact.push({ kind: 'generator', x: pr.x, y: 1, z: pr.z, label: 'Генератор' }); break;
        case 'pier':
          this.addBox(pr.x, 0.05, pr.z, pr.w, 0.5, pr.d, 0x5a4a38, true, true); // верх настила на 0.3 м
          for (let k = -pr.w / 2 + 2; k < pr.w / 2; k += 6) for (const s of [-1, 1]) this.addBox(pr.x + k, -1.5, pr.z + s * (pr.d / 2 - 0.3), 0.4, 2.5, 0.4, 0x3b3128, false);
          break;
        case 'canopy':
          this.addBox(pr.x, pr.h, pr.z, pr.w, 0.4, pr.d, 0x8a8478, false);
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.addBox(pr.x + sx * (pr.w / 2 - 1), pr.h / 2, pr.z + sz * (pr.d / 2 - 1), 0.4, pr.h, 0.4, 0x6c6860, true);
          break;
        case 'pump':
          this.addBox(pr.x, 0.8, pr.z, 0.8, 1.6, 0.6, 0x7d3a30, true);
          this.addContainer('gas', pr.x, 1, pr.z, null, { chance: 0.5, label: 'Колонка: слить бензин', only: 'fuel' });
          break;
        case 'tower':
          this.addBox(pr.x, 5, pr.z, 4, 10, 4, 0x7d7a70, true);
          this.addBox(pr.x, 10.6, pr.z, 6, 1.2, 6, 0x3a4048, false);
          break;
        case 'roadblock':
          for (let k = -2; k <= 2; k++) {
            const off = k * 2.2;
            this.place(k % 2 ? 'env_urban_cones_barriers:jersey_barrier_dirty' : 'env_camp:sandbags_wall', pr.x + (pr.ry ? 0 : off), 0, pr.z + (pr.ry ? off : 0), pr.ry, 1, { solid: true });
          }
          this.place('env_camp:hedgehog', pr.x + (pr.ry ? 3 : 0), 0, pr.z + (pr.ry ? 0 : 3), 0.5, 1, { solid: true });
          this.place('env_items:box', pr.x + 3, 0, pr.z + 3, 0.2, 1, { fitH: 0.8 });
          this.addContainer('police', pr.x + 3, 0.6, pr.z + 3, null, { chance: 0.6, label: 'Ящик блокпоста' });
          break;
        case 'mcrate':
          this.place('env_items:box', pr.x, 0, pr.z, 0, 1, { fitH: 0.9, solid: true });
          this.addContainer(pr.loot, pr.x, 0.6, pr.z, null, { chance: 1, label: 'Военный ящик' });
          break;
        case 'container': this.container(pr); break;
        case 'pond': {
          // илистый берег, под ним тёмное дно, сверху полупрозрачная вода как у моря; по краю камыш
          const disc = (r, y, mat) => { const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), mat); m.rotation.x = -Math.PI / 2; m.position.set(pr.x, y, pr.z); m.receiveShadow = true; this.scene.add(m); return m; };
          disc(pr.r + 0.9, 0.02, styleMaterial(new THREE.MeshLambertMaterial({ color: 0x3f3a2c, polygonOffset: true, polygonOffsetFactor: -1 })));
          disc(pr.r, 0.03, styleMaterial(new THREE.MeshLambertMaterial({ color: 0x141c1e, polygonOffset: true, polygonOffsetFactor: -2 })));
          const w = disc(pr.r - 0.15, 0.06, styleMaterial(new THREE.MeshLambertMaterial({ color: 0x3a5560, emissive: 0x0c1418, transparent: true, opacity: 0.78, depthWrite: false })));
          w.renderOrder = 2;
          for (let i = 0; i < 18; i++) { const a = this.R() * 6.28, rr = pr.r - 0.2 + this.R() * 0.8; this.place('env_trees:' + pickR(this.R, ['bush02', 'bush04', 'bush06']), pr.x + Math.cos(a) * rr, 0, pr.z + Math.sin(a) * rr, this.R() * 6.28, 1, { fitH: 0.5 + this.R() * 0.4 }); }
          break;
        }
      }
    }
  }

  // стена лагеря из металлолома и фанеры (PSX Post-Apocalypse Kit) или бетонная ограда базы
  campWall(pr) {
    const R = this.R;
    const x0 = pr.x - pr.w / 2, x1 = pr.x + pr.w / 2, z0 = pr.z - pr.d / 2, z1 = pr.z + pr.d / 2, gw = 8;
    const H = pr.military ? 2.5 : 2.6;
    const pieces = pr.military ? ['env_urban_fences:plackard_closed', 'env_urban_fences:plackard_closed_full', 'env_urban_fences:plackard_open_patched']
      : ['env_camp:wall_scrap', 'env_camp:wall_scrap_sprayed', 'env_camp:wall_plywood', 'env_camp:wall_scrap'];
    const run = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az);
      const t = Assets.tpl[pieces[0]];
      const len = t ? Math.max(t.size.x, t.size.z) : 2;
      const n = Math.max(1, Math.round(L / len));
      const dx = (bx - ax) / n, dz = (bz - az) / n;
      const ry = Math.abs(dx) > Math.abs(dz) ? 0 : Math.PI / 2;
      for (let i = 0; i < n; i++) this.place(pickR(R, pieces), ax + dx * (i + 0.5), 0, az + dz * (i + 0.5), ry + (R() < 0.5 ? 0 : Math.PI), { x: L / n / len, y: 1, z: 1 });
      this.phys.addBox((ax + bx) / 2, 0, (az + bz) / 2, Math.abs(bx - ax) || 0.6, H, Math.abs(bz - az) || 0.6, { tag: 'wall' });
    };
    run(x0, z0, x1, z0); run(x0, z0, x0, z1); run(x1, z0, x1, z1);
    run(x0, z1, pr.x - gw / 2, z1); run(pr.x + gw / 2, z1, x1, z1);
    if (!pr.military) {
      for (const sx of [-1, 1]) this.place('env_camp:gate_side', pr.x + sx * (gw / 2 + 0.6), 0, z1, 0, 1.2, { solid: true });
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) this.place('env_camp:post_scrap', x, 0, z, 0, 1);
      for (let i = 0; i < 3; i++) this.place('env_camp:hedgehog', pr.x - 7 + i * 7, 0, z1 + 5, R() * 3, 1, { solid: true });
      this.place('env_camp:barricade_tyres', pr.x - 9, 0, z1 + 1.5, 0.1, 1, { solid: true });
      this.place('env_camp:sandbags_wall', pr.x + 9, 0, z1 + 1.2, 0, 1, { solid: true });
    } else {
      for (const sx of [-1, 1]) this.addBox(pr.x + sx * (gw / 2 + 0.5), 3, z1, 1, 6, 1, 0x4a4136, true);
      for (const [tx, tz] of [[x0 + 4, z0 + 4], [x1 - 4, z0 + 4], [x0 + 4, z1 - 4], [x1 - 4, z1 - 4]]) {
        this.addBox(tx, 3, tz, 0.4, 6, 0.4, 0x3d3f36, true);
        this.addBox(tx, 6.2, tz, 3, 0.3, 3, 0x4a4b40, false);
      }
    }
  }

  // грузовой контейнер: ребристые стенки кодом (в PSX-паках контейнеров нет)
  container(pr) {
    if (!this.boxesByTex.has(pr.color)) this.boxesByTex.set(pr.color, []);
    const g = new THREE.BoxGeometry(6, 2.6, 2.44);
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(pr.x, (pr.y || 0) + 1.3, pr.z), new THREE.Quaternion().setFromAxisAngle(UP, pr.ry), new THREE.Vector3(1, 1, 1)));
    this.boxesByTex.get(pr.color).push(g);
    this.phys.addRotatedBox(pr.x, pr.y || 0, pr.z, 6, 2.6, 2.44, pr.ry, { tag: 'static' });
    if (pr.loot) this.addContainer(pr.loot, pr.x, (pr.y || 0) + 1, pr.z, null, { chance: 1, label: 'Обыскать контейнер', radius: 3.4 });
  }
  flushContainers() {
    for (const [col, geos] of this.boxesByTex) {
      const c = document.createElement('canvas'); c.width = 64; c.height = 32;
      const x = c.getContext('2d');
      x.fillStyle = col; x.fillRect(0, 0, 64, 32);
      for (let i = 0; i < 64; i += 4) { x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(i, 0, 1, 32); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(i + 2, 0, 1, 32); }
      for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(110,55,25,${Math.random() * 0.45})`; x.fillRect(Math.random() * 64, Math.random() * 32, 2 + Math.random() * 4, 1 + Math.random() * 3); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
      this.r.trackTexture(t);
      const m = new THREE.Mesh(mergeGeometries(geos), styleMaterial(new THREE.MeshLambertMaterial({ map: t })));
      m.castShadow = m.receiveShadow = true;
      this.scene.add(m);
    }
  }

  addContainer(type, x, y, z, shellId, o = {}) {
    const id = 'c' + this.containers.length;
    this.containers.push({ id, type, x, y, z, shellId, items: null, lootedDay: -99, chance: o.chance ?? 1, label: o.label || 'Обыскать', r: o.radius || 1.8, only: o.only });
  }

  // коробка с цветом вершин в чанк + коллайдер (для того, что собирается из простых форм)
  addBox(x, y, z, w, h, d, color, solid, noRay) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    this.pushGeo(g, color, x, z);
    if (solid) this.phys.addBox(x, y - h / 2, z, w, h, d, { tag: 'wall', noRay: !!noRay });
  }
  // то же с поворотом на кратный 90° угол (размеры меняются местами)
  addBoxWorld(x, y, z, w, h, d, ry, color, solid) {
    const swap = Math.abs(Math.round(Math.sin(ry))) === 1;
    this.addBox(x, y, z, swap ? d : w, h, swap ? w : d, color, solid);
  }

  pushGeo(g, color, x, z) {
    const geo = g.index ? g.toNonIndexed() : g;
    for (const a of Object.keys(geo.attributes)) if (!['position', 'normal'].includes(a)) geo.deleteAttribute(a);
    const n = geo.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = color instanceof THREE.Color ? color : new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const k = Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK);
    if (!this.colGeo.has(k)) this.colGeo.set(k, []);
    this.colGeo.get(k).push(geo);
  }

  flushChunks() {
    for (const [k, list] of this.colGeo) {
      const g = mergeGeometries(list, false);
      const m = new THREE.Mesh(g, this.vcMat);
      m.castShadow = true; m.receiveShadow = true;
      g.computeBoundingSphere();
      this.scene.add(m);
      this.chunks.set(k, m);
    }
    this.colGeo.clear();
  }

  buildBounds() {
    const W = WORLD;
    this.phys.addBox(-W - 5, 0, 0, 10, 50, 2 * W, { tag: 'bound' });
    this.phys.addBox(0, 0, -W - 5, 2 * W, 50, 10, { tag: 'bound' });
    this.phys.addBox(0, 0, W + 5, 2 * W, 50, 10, { tag: 'bound' });
    this.buildMountains();
  }

  // Горы кольцом на севере, западе и юге (на востоке — море до горизонта): край мира, за которым ничего нет.
  // Низкополигональная лента: подножие, гребень с зубцами, задний склон; цвет по высоте (трава, камень, снег).
  buildMountains() {
    const W = WORLD, R = mulberry(77);
    const pos = [], col = [];
    const A0 = 0.75, A1 = Math.PI * 2 - 0.75, S = 120; // угол от востока (+x), восточный сектор пустой
    const ring = [];
    for (let i = 0; i <= S; i++) {
      const a = A0 + (A1 - A0) * i / S;
      const edge = Math.min(1, Math.min(i, S - i) / 10); // к морю горы сходят на нет
      const h = (28 + R() * 38 + Math.sin(a * 5) * 10) * edge + 4;
      const r0 = W + 12, r1 = W + 48 + R() * 20, r2 = W + 130;
      const c = Math.cos(a), s = Math.sin(a);
      ring.push([[c * r0, -0.2, s * r0], [c * r1, h, s * r1], [c * r2, h * 0.55, s * r2]]);
    }
    const tint = y => y < 6 ? [0.28, 0.33, 0.22] : y < 40 ? [0.36, 0.35, 0.33] : [0.72, 0.74, 0.76];
    const tri = (p, q, r) => { for (const v of [p, q, r]) { pos.push(...v); col.push(...tint(v[1])); } };
    for (let i = 0; i < S; i++) for (let k = 0; k < 2; k++) {
      const a = ring[i][k], b = ring[i][k + 1], c2 = ring[i + 1][k], d = ring[i + 1][k + 1];
      tri(a, c2, b); tri(b, c2, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, styleMaterial(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide })));
    m.receiveShadow = true;
    this.scene.add(m);
  }

  // Пучки травы на газонах и за городом: два скрещённых квадрата с прозрачной текстурой, одной сеткой (InstancedMesh)
  buildGrass() {
    const c = document.createElement('canvas'); c.width = c.height = 32;
    const x = c.getContext('2d'), R = mulberry(5);
    for (let i = 0; i < 16; i++) {
      const bx = 3 + R() * 26, lean = (R() - 0.5) * 8, h = 14 + R() * 16;
      x.strokeStyle = ['#3e4f2c', '#4f6236', '#5d6f3e', '#6b7a46', '#465a30'][Math.floor(R() * 5)];
      x.lineWidth = 2;
      x.beginPath(); x.moveTo(bx, 32); x.lineTo(bx + lean, 32 - h); x.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    this.r.trackTexture(tex);
    const quad = () => new THREE.PlaneGeometry(0.6, 0.42).translate(0, 0.21, 0);
    const geo = mergeGeometries([quad(), quad().rotateY(Math.PI / 2)]);
    const mat = styleMaterial(new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
    const pts = [];
    const ok = (px, pz) => {
      if (px > COAST_X - 4) return false;
      if ((this.plan.ponds || []).some(p => Math.hypot(p.x - px, p.z - pz) < p.r - 0.3)) return false; // в пруду травы нет, по краю камыш
      const city = Math.abs(px) < HALF + ROAD / 2 && Math.abs(pz) < HALF + ROAD / 2;
      if (city) {
        const d = districtAt(this.plan, px, pz);
        if (d !== 'residential' && d !== 'park') return false;
        if (onRoad(px, pz) || shellAt(this, px, pz)) return false;
      } else if (districtAt(this.plan, px, pz) === 'military') return false;
      if (this.phys.groundAt(px, pz, 1, 0.2) > 0.05) return false;   // тротуар, плиты, мебель
      return !this.phys.blocked(px, 0, pz, 0.25, 1);
    };
    const W = WORLD;
    for (let gx = -W; gx < W && pts.length < 11000; gx += 1) for (let gz = -W; gz < W && pts.length < 11000; gz += 1) {
      const city = Math.abs(gx) < HALF + 8 && Math.abs(gz) < HALF + 8;
      if (R() > (city ? 0.55 : 0.09)) continue;
      const px = gx + R(), pz = gz + R();
      if (ok(px, pz)) pts.push([px, pz]);
    }
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3();
    pts.forEach(([px, pz], i) => {
      const s = 0.7 + R() * 0.7;
      M.compose(V.set(px, 0, pz), Q.setFromAxisAngle(UP, R() * 3.14), Sc.set(s, s * (0.8 + R() * 0.5), s));
      im.setMatrixAt(i, M);
    });
    im.receiveShadow = true;
    this.scene.add(im);
    this.grassN = pts.length;
  }

  update(cx, cz, viewDist) {
    const d2 = viewDist * viewDist;
    const farD2 = (viewDist * 1.6) ** 2;
    for (const b of this.batchItems) {
      const dx = b.x - cx, dz = b.z - cz;
      const dd = dx * dx + dz * dz - b.r * b.r;
      const vis = dd < (b.far ? farD2 : d2);
      if (vis !== b.vis) { b.vis = vis; b.bm.setVisibleAt(b.id, vis); }
    }
    for (const [k, m] of this.chunks) {
      const s = m.geometry.boundingSphere;
      m.visible = Math.hypot(s.center.x - cx, s.center.z - cz) - s.radius < viewDist * 1.2;
    }
  }

  isInWater(x, z) { return x > COAST_X + 1; }
}

const WHITE = new THREE.Color(1, 1, 1);
// мелкая пиксельная «трава и крошка» (серая вокруг 0.5: умножается на цвет карты x2), повторяется плиткой 3×3 м
let _detail = null;
function groundDetail(r) {
  if (_detail) return _detail;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), R = mulberry(11);
  x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 700; i++) { const v = 96 + Math.floor(R() * 70); x.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')'; x.fillRect(Math.floor(R() * 64), Math.floor(R() * 64), 1, 1 + Math.floor(R() * 3)); }
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(70,70,70,0.5)'; x.fillRect(Math.floor(R() * 64), Math.floor(R() * 64), 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.colorSpace = THREE.NoColorSpace;
  r.trackTexture(t);
  return (_detail = t);
}
const WINS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
function pickR(R, a) { return a[Math.floor(R() * a.length)]; }
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function shellAt(world, x, z) {
  for (const id in world.shellIndex) {
    const s = world.shellIndex[id];
    if (x > s.minX && x < s.maxX && z > s.minZ && z < s.maxZ) return s;
  }
  return null;
}
