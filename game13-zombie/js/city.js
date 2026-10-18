// План города v2 (PSX-паки): районы, кварталы, участки, точки интереса, спавн машин и лута.
// Чистые данные (без three.js), детерминированно от seed — Node-тесты подключают напрямую.
// Оси: x — восток, z — юг (север = -z). Единицы — метры.
// Улица 16 м (плитка дороги Urban Stacked Pack), тротуар 3 м внутри квартала.
// Дома без входа — фасады из модулей ALEX (2.8 м), здания с входом — детали Urban 3×3 м.
import { rng } from './items.js';

// v2.1: город плотнее. Улица 10 м (плитка дороги Urban, ужатая поперёк), квартал 52 м: на 16-метровых улицах
// пользователь чувствовал «очень большие расстояния», асфальт был шириной в пять полос.
export const PITCH = 44;          // шаг кварталов (v2.3: 44 — «город пустоват», плотнее)
export const ROAD = 10;           // ширина улицы (плитка дороги)
export const ASPHALT = 7.5;       // проезжая часть для карты
export const SIDE = 3;            // тротуар
// Прототип v2 — 3×3 квартала (пользователь проверяет стиль и механику), полный город — 13×13 (?city=full).
// N, HALF, COAST_X меняются в buildPlan: импорты ES-модулей видят новое значение.
export const FULL = typeof location !== 'undefined' && /[?&]city=full/.test(location.search);
export let N = FULL ? 13 : 3;          // кварталов по стороне
export let HALF = N * PITCH / 2;
export let COAST_X = HALF + 10;        // берег моря на востоке
export let WORLD = FULL ? 900 : HALF + 80;  // граница мира (по модулю): горы в ~80 м от окраины, на машине рукой подать
export const MOD = 2.8;           // модуль фасада ALEX (2 м × 1.4)
export const CELL = 3;            // клетка здания с входом (детали Urban)
export const INNER = (PITCH - ROAD) / 2 - SIDE; // 21: от центра квартала до фасадной линии
export const KIT_SCALE = { car: 1 };

export const blockCenter = (gx, gz) => [-HALF + PITCH * gx + PITCH / 2, -HALF + PITCH * gz + PITCH / 2];
export const streetLine = i => -HALF + PITCH * i;

export const DISTRICT_NAMES = {
  downtown: 'Центр', residential: 'Жилой район', industrial: 'Промзона', port: 'Порт',
  park: 'Парк', camp: 'Лагерь', airfield: 'Аэродром', military: 'Военная база', outskirts: 'Окраина',
};

const POI_BLOCKS = {
  '5,5': 'police', '7,7': 'hospital', '6,4': 'supermarket', '4,7': 'pharmacy', '8,5': 'pharmacy',
  '1,6': 'gas', '10,9': 'gas', '6,11': 'gas', '3,9': 'park', '9,3': 'park', '2,11': 'camp',
  '10,1': 'warehouse_yard', '11,2': 'warehouse_yard', '12,4': 'port_yard', '12,8': 'port_yard',
};

// прототип: центр с полицией, супермаркетом и аптекой, жилые кварталы с заправкой, парк и лагерь
const PROTO = {
  '0,0': ['residential'], '1,0': ['downtown', 'supermarket'], '2,0': ['residential'],
  '0,1': ['residential', 'gas'], '1,1': ['downtown', 'police'], '2,1': ['downtown', 'pharmacy'],
  '0,2': ['camp', 'camp'], '1,2': ['park', 'park'], '2,2': ['residential'],
};
const poiAt = (gx, gz) => N === 13 ? POI_BLOCKS[gx + ',' + gz] : (PROTO[gx + ',' + gz] || [])[1];
function district(gx, gz) {
  if (N !== 13) return (PROTO[gx + ',' + gz] || ['residential'])[0];
  const poi = POI_BLOCKS[gx + ',' + gz];
  if (poi === 'park') return 'park';
  if (poi === 'camp') return 'camp';
  if (gx === 12) return 'port';
  if (Math.abs(gx - 6) <= 2 && Math.abs(gz - 6) <= 2) return 'downtown';
  if (gz <= 3 && gx >= 7) return 'industrial';
  return 'residential';
}

// отделки модулей ALEX
export const MOD_MATS = ['redbrick', 'greybrick', 'greyplaster', 'redplaster', 'orangeplaster'];

export function buildPlan(seed = 1337) {
  const R = rng(seed);
  const pick = a => a[Math.floor(R() * a.length)];
  shellId = 0;
  const plan = {
    seed, blocks: [], buildings: [], shells: [], props: [], cars: [], boats: [], planes: [], lots: [], cults: [],
    lights: [], trees: [], fences: [], containers: [], zones: [], pois: [], spawns: {}, walks: [],
  };
  for (let gx = 0; gx < N; gx++) for (let gz = 0; gz < N; gz++) {
    const [cx, cz] = blockCenter(gx, gz);
    const d = district(gx, gz);
    const poi = poiAt(gx, gz) || null;
    const b = { gx, gz, cx, cz, d, poi };
    plan.blocks.push(b);
    // тротуар по периметру квартала (у лагеря — стена)
    if (d !== 'camp') plan.walks.push({ x: cx, z: cz });
    if (d === 'downtown') fillDowntown(plan, b, R, pick);
    else if (d === 'residential') fillResidential(plan, b, R, pick);
    else if (d === 'industrial') fillIndustrial(plan, b, R, pick);
    else if (d === 'port') fillPort(plan, b, R, pick);
    else if (d === 'park') fillPark(plan, b, R, pick);
    else if (d === 'camp') fillCamp(plan, b, R, pick);
  }
  streets(plan, R, pick);
  dress(plan, R, pick);
  outskirts(plan, R, pick);
  plan.start = { x: plan.camp.x, z: plan.camp.z + plan.camp.r + 5, ry: Math.PI }; // напротив южных ворот лагеря
  return plan;
}

// ---------- стороны квартала ----------
// ry — поворот, при котором фасад (локальное +z) смотрит на улицу; (ax, az) — направление локального +x
const SIDES = [
  { name: 'n', ry: Math.PI, nx: 0, nz: -1, ax: -1, az: 0 },
  { name: 's', ry: 0, nx: 0, nz: 1, ax: 1, az: 0 },
  { name: 'w', ry: -Math.PI / 2, nx: -1, nz: 0, ax: 0, az: 1 },
  { name: 'e', ry: Math.PI / 2, nx: 1, nz: 0, ax: 0, az: -1 },
];
// центр постройки шириной w и глубиной d, фасадом на сторону sd, сдвиг вдоль стороны t (от −INNER)
function onSide(b, sd, t, w, d) {
  const fx = b.cx + sd.nx * INNER, fz = b.cz + sd.nz * INNER;
  const mid = t + w / 2;
  return { x: fx + sd.ax * mid - sd.nx * d / 2, z: fz + sd.az * mid - sd.nz * d / 2, ry: sd.ry };
}

function modBuilding(o) {
  // o: {x,z,ry, cols, rows, floors, mat, sign?, signBg?, shop?}; x,z — центр; w,d — метры
  return Object.assign({ kind: 'mod', w: o.cols * MOD, d: o.rows * MOD }, o);
}

const SIGNS = [['ПРОДУКТЫ', '#5a3d22'], ['ХОЗТОВАРЫ', '#3a4a3a'], ['ОПТИКА', '#2f3f5a'], ['КАФЕ', '#5a2e2e'], ['БАР', '#3c2a40'],
  ['ЗАПЧАСТИ', '#3a3f55'], ['СВЯЗЬ', '#2d4a52'], ['ЦВЕТЫ', '#4a5a2a'], ['ОДЕЖДА', '#4a3a52'], ['ЛОМБАРД', '#5a4a1e']];

function fillDowntown(plan, b, R, pick) {
  const poiShell = shellForPoi(b.poi);
  const tall = N === 13 ? Math.abs(b.gx - 6) <= 1 && Math.abs(b.gz - 6) <= 1 : b.gx === 1 && b.gz === 1;
  // занятые прямоугольники квартала: дома с разных сторон не должны залезать друг в друга
  const rects = [];
  const free = (p, w, d) => {
    const sw = Math.abs(Math.sin(p.ry)) > 0.5, hx = (sw ? d : w) / 2, hz = (sw ? w : d) / 2;
    const r = { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz };
    if (rects.some(q => r.x0 < q.x1 + 0.4 && r.x1 > q.x0 - 0.4 && r.z0 < q.z1 + 0.4 && r.z1 > q.z0 - 0.4)) return false;
    rects.push(r); return true;
  };
  // сначала юг (там здание с входом), потом север, потом короткие восток и запад
  [SIDES[1], SIDES[0], SIDES[2], SIDES[3]].forEach(sd => {
    const si = SIDES.indexOf(sd);
    const margin = si >= 2 ? 6 : 0;
    let t = -INNER + margin;
    const end = INNER - margin;
    // здание-точка интереса — посередине южной стороны, остальное заполняется вокруг него
    if (poiShell && sd.name === 's') {
      const w = poiShell.cols * CELL, d = poiShell.rows * CELL;
      const p = onSide(b, sd, -w / 2, w, d);
      free(p, w, d);
      plan.shells.push(shell(b, poiShell.type, p.x, p.z, poiShell.cols, poiShell.rows, p.ry));
    }
    let shellPlaced = true;
    while (t < end - 6) {
      if (!shellPlaced && t > -INNER + 3) {
        const w = poiShell.cols * CELL, d = poiShell.rows * CELL;
        if (t + w > end) break;
        const p = onSide(b, sd, t, w, d);
        free(p, w, d);
        plan.shells.push(shell(b, poiShell.type, p.x, p.z, poiShell.cols, poiShell.rows, p.ry));
        t += w + 1; shellPlaced = true; continue;
      }
      // панелька 17×17 вместо ряда фасадов
      if (tall && si < 2 && R() < 0.3 && t + 14 <= end) {
        const p = onSide(b, sd, t, 13.6, 13.6);
        if (free(p, 13.6, 13.6)) {
          plan.buildings.push({ kind: 'pre', id: 'env_urban_buildings_prebuild:' + pick(['flat_square_concrete', 'flat_square_brick', 'flat_square_concrete_alt', 'flat_square_brick_alt']), x: p.x, z: p.z, ry: p.ry, s: 0.8, w: 13.6, d: 13.6 });
          t += 14.4; continue;
        }
      }
      // магазинчик с открытой дверью (Urban 3 м): прилавок, полки, холодильник
      if (si < 2 && R() < 0.3 && t + 12 <= end) {
        const c2 = 3 + Math.floor(R() * 2), w2 = c2 * CELL, d2 = 3 * CELL;
        const p = onSide(b, sd, t, w2, d2);
        if (free(p, w2, d2)) {
          const sh = shell(b, 'shop', p.x, p.z, c2, 3, p.ry);
          const sg = pick(SIGNS); sh.sign = sg; sh.style = pick(['brick', 'fancy_brick', 'stuco']);
          plan.shells.push(sh);
          t += w2 + 0.6; continue;
        }
      }
      const cols = 3 + Math.floor(R() * 3), rows = 3 + Math.floor(R() * 2);
      const w = cols * MOD;
      if (t + w > end) { t += 1; continue; }
      const p = onSide(b, sd, t, w, rows * MOD);
      if (!free(p, w, rows * MOD)) { t += 1; continue; }
      const shop = R() < 0.5;
      const sg = shop ? pick(SIGNS) : null;
      plan.buildings.push(modBuilding({ x: p.x, z: p.z, ry: p.ry, cols, rows, floors: (tall ? 4 : 3) + Math.floor(R() * (tall ? 4 : 3)), mat: pick(MOD_MATS), shop, sign: sg && sg[0], signBg: sg && sg[1] }));
      t += w + 0.4 + R() * 1.2;
    }
  });
  // двор: парковка и мусор, только на свободном месте
  const yard = pad => { for (let k = 0; k < 12; k++) { const x = b.cx + (R() - 0.5) * (INNER * 2 - 4), z = b.cz + (R() - 0.5) * (INNER * 2 - 4); if (!rects.some(q => x > q.x0 - pad && x < q.x1 + pad && z > q.z0 - pad && z < q.z1 + pad)) return [x, z]; } return null; };
  for (let i = 0; i < 2 + Math.floor(R() * 2); i++) { const s = yard(3); if (s) plan.cars.push(carSpot(s[0], s[1], R() * 6.28, R, 'parking')); }
  const ds = yard(1.5);
  if (ds) plan.props.push({ env: R() < 0.4 ? 'env_x_street:dumpster' : 'env_urban_litter:' + pick(['dumpster_full_lid_open', 'dumpster_full_no_lid_blue', 'dumpster_diagonal_full_open_red', 'dumpster_diagonal_closed']), x: ds[0], z: ds[1], ry: R() * 6.28, solid: true, loot: 'trash', lootChance: 0.6, label: 'Обыскать мусорный бак' });
  for (let i = 0; i < 4; i++) { const s = yard(0.5); if (s) plan.props.push({ env: 'env_urban_litter:' + pick(['trashbag_1', 'trashbag_2', 'trashpile_1', 'trashbag_1_blue']), x: s[0], z: s[1], ry: R() * 6.28 }); }
}

function fillResidential(plan, b, R, pick) {
  const gasShell = b.poi === 'gas';
  const lots = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  // два участка из четырёх — дома с открытой дверью (внутри комната с мебелью и лутом)
  const shellLot = gasShell ? 0 : Math.floor(R() * 4), shellLot2 = gasShell ? 3 : (shellLot + 1 + Math.floor(R() * 3)) % 4;
  const L = INNER;
  lots.forEach(([lx, lz], i) => {
    const x = b.cx + lx * L / 2, z = b.cz + lz * L / 2;
    const ry = lz < 0 ? Math.PI : 0; // фасадом к ближней улице (север/юг)
    const front = lz < 0 ? -1 : 1;
    if (gasShell && i <= 1) {
      if (i === 0) {
        const gx = b.cx, gz = b.cz - L / 2;
        plan.shells.push(shell(b, 'gas', gx - 7, gz + 1.5, 4, 3, Math.PI));
        plan.props.push({ special: 'canopy', x: gx + 7, z: gz - 2, w: 12, d: 8, h: 5.2 });
        plan.props.push({ special: 'pump', x: gx + 3.5, z: gz - 2 }, { special: 'pump', x: gx + 10.5, z: gz - 2 });
        plan.cars.push(carSpot(gx + 7, gz - 2, Math.PI, R, 'gas')); // между колонками, носом к улице
      }
      return;
    }
    plan.lots.push({ x, z, front, lx, d: b.d });
    if (i === shellLot || i === shellLot2) { const sh = shell(b, 'house', x, z + front * 1.8, 3, 3, ry); sh.style = pick(['stuco', 'brick', 'stuco', 'fancy_brick']); plan.shells.push(sh); }
    else plan.buildings.push(modBuilding({ x, z: z + front * 2, ry, cols: 3, rows: 3, floors: 1 + Math.floor(R() * 2), mat: pick(MOD_MATS) }));
    plan.fences.push({ x, z, w: L - 1, d: L - 1, openSide: lz < 0 ? 'n' : 's', style: pick(['picket', 'picket', 'wood', 'drystone', 'brick']) });
    if (R() < 0.75) plan.trees.push({ x: x + (R() - 0.5) * 14, z: z - front * 7 + (R() - 0.5) * 3, s: 0.9 + R() * 0.6 });
    if (R() < 0.45) plan.cars.push(carSpot(x + lx * 5.6, z + front * 3.4, (front > 0 ? 0 : Math.PI) + (R() - 0.5) * 0.15, R, 'driveway'));
    if (R() < 0.5) plan.props.push({ env: 'env_urban_litter:' + pick(['trash_can', 'trash_can_alt1_full', 'trash_can_overflowing']), x: x - lx * 5, z: z + front * 8.5, ry: R() * 6.28, solid: true, loot: 'trash', lootChance: 0.5, label: 'Обыскать бак' });
  });
}

function fillIndustrial(plan, b, R, pick) {
  if (b.poi === 'warehouse_yard') {
    plan.shells.push(shell(b, 'warehouse', b.cx, b.cz - 6, 8, 5, Math.PI));
    containersYard(plan, b, R, 6);
  } else {
    const n = R() < 0.5 ? 1 : 2;
    const s = n === 1 ? 2.6 : 1.7;
    for (let i = 0; i < n; i++)
      plan.buildings.push({ kind: 'pre', id: 'env_urban_buildings_prebuild:hangar1', x: b.cx + (n === 1 ? 0 : (i ? 11 : -11)), z: b.cz - 4, ry: R() < 0.5 ? 0 : Math.PI, s, w: 11.6 * s, d: 8 * s });
    containersYard(plan, b, R, 3);
  }
  plan.fences.push({ x: b.cx, z: b.cz, w: INNER * 2 - 1, d: INNER * 2 - 1, openSide: 's', style: 'metal' });
  if (R() < 0.5) plan.cars.push(carSpot(b.cx + (R() - 0.5) * 18, b.cz + INNER - 8, R() * 6.28, R, 'yard', 'truck'));
  plan.props.push({ env: 'env_urban_pipes:' + pick(['pipe', 'pipe_rusted', 'pipe_corner_rusted']), x: b.cx - 14, z: b.cz + 14, ry: R() * 3, fitL: 4 });
}

// грузовые контейнеры собираются кодом (в PSX-паках их нет)
function containersYard(plan, b, R, n) {
  for (let i = 0; i < n; i++) {
    const x = b.cx + (i % 3 - 1) * 9 + (R() - 0.5) * 2, z = b.cz + 9 + Math.floor(i / 3) * 6;
    const st = R() < 0.3 ? 2 : 1;
    for (let k = 0; k < st; k++)
      plan.props.push({ special: 'container', x, z, y: k * 2.6, ry: Math.PI / 2 + (R() - 0.5) * 0.15, color: ['#6a3b2c', '#2f4a5a', '#4a5a3a', '#7a6a3a', '#5a5a5a'][Math.floor(R() * 5)], loot: k === 0 && R() < 0.4 ? 'warehouse' : null });
  }
}

function fillPort(plan, b, R, pick) {
  if (b.poi === 'port_yard') plan.shells.push(shell(b, 'warehouse', b.cx - 6, b.cz, 8, 5, -Math.PI / 2));
  else containersYard(plan, b, R, 6 + Math.floor(R() * 3));
  const pz = b.cz;
  plan.props.push({ special: 'pier', x: COAST_X + 22, z: pz, w: 40, d: 7 });
  if (b.gz % 2 === 0) plan.boats.push({ model: pick(['boat-speed-a', 'boat-speed-b', 'boat-speed-d', 'boat-speed-g', 'boat-speed-j']), x: COAST_X + 26, z: pz + 5.4, ry: Math.PI / 2, fuel: 0.3 + R() * 0.6 });
}

function fillPark(plan, b, R, pick) {
  // пруд первым: деревья, кусты, трава и мусор в воде не стоят (plan.ponds проверяют dress и трава)
  const pond = { special: 'pond', x: b.cx + (R() - 0.5) * 10, z: b.cz + (R() - 0.5) * 10, r: 7 + R() * 3 };
  plan.props.push(pond); (plan.ponds || (plan.ponds = [])).push(pond);
  const dry = (x, z, m) => Math.hypot(x - pond.x, z - pond.z) > pond.r + m;
  for (let i = 0; i < 40; i++) { const x = b.cx + (R() - 0.5) * (INNER * 2 - 4), z = b.cz + (R() - 0.5) * (INNER * 2 - 4); if (dry(x, z, 2.5)) plan.trees.push({ x, z, s: 0.8 + R() * 0.9, park: true }); }
  for (let i = 0; i < 10; i++) { const x = b.cx + (R() - 0.5) * (INNER * 2 - 4), z = b.cz + (R() - 0.5) * (INNER * 2 - 4); if (dry(x, z, 1.5)) plan.trees.push({ x, z, s: 1, bush: true }); }
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; plan.props.push({ env: 'env_urban_bus_stops:busstop_bench', x: b.cx + Math.cos(a) * 15, z: b.cz + Math.sin(a) * 15, ry: -a + Math.PI / 2, solid: true }); }
  plan.zones.push({ type: 'park', x: b.cx, z: b.cz, w: INNER * 2, d: INNER * 2 });
}

function fillCamp(plan, b, R, pick) {
  // стена лагеря по краю квартала (квартал 42 м между улицами)
  const W = PITCH - ROAD - 2, h = W / 2;
  plan.camp = { x: b.cx, z: b.cz, r: h };
  plan.zones.push({ type: 'camp', x: b.cx, z: b.cz, w: W + 4, d: W + 4 });
  plan.props.push({ special: 'campWall', x: b.cx, z: b.cz, w: W, d: W, gate: 's' });
  plan.props.push({ special: 'campfire', x: b.cx, z: b.cz + 2 });
  const tents = [[-10, -10], [0, -12], [10, -10], [-12, 5], [12, 5]];
  // палатки разные: старые купола и туристические (Demolished Campground, 3Dexter)
  const TENT = ['env_x_camp:tents_green_0', 'env_camp:tent_dome', 'env_x_camp:tents_orange_0', 'env_x_camp:tents_green_2', 'env_camp:tent_dome'];
  tents.forEach(([tx, tz], i) => plan.props.push({ env: TENT[i], x: b.cx + tx, z: b.cz + tz, ry: Math.atan2(-tx, -tz), solid: true, scale: TENT[i].startsWith('env_x') ? 1.2 : 1.0 }));
  for (const [cx, cz] of [[-2.5, 3.5], [2.6, 3.8], [0, -0.8]]) plan.props.push({ env: 'env_camp:chair_camp', x: b.cx + cx, z: b.cz + cz, ry: Math.atan2(-cx, -(cz - 2)) });
  plan.props.push({ env: 'env_camp:sign_survivors', x: b.cx + 6, z: b.cz + h + 1.5, ry: 0, solid: true });
  for (let i = 0; i < 3; i++) plan.props.push({ env: 'env_camp:supply_crate_food', x: b.cx + 8 + i * 0.9, z: b.cz - 6, ry: 0.2 * i });
  plan.props.push({ special: 'stash', x: b.cx + 9, z: b.cz - 3 });
  plan.props.push({ special: 'bed', x: b.cx - 9, z: b.cz - 3 });
  plan.props.push({ special: 'workbench', x: b.cx + 4, z: b.cz - 8 });
  plan.props.push({ special: 'generator', x: b.cx - h + 3, z: b.cz - h + 3 });
  // жилой лагерь: ящики, бочки, дрова, лавка Гоши, мешки у ворот, фонари
  const C = (env, x, z, o = {}) => plan.props.push(Object.assign({ env, x: b.cx + x, z: b.cz + z, ry: o.ry ?? R() * 0.6 }, o));
  C('env_camp:supply_crate_food', -6, -7.4, { solid: true }); C('env_camp:supply_crate_food', -5, -7.6, { ry: 0.4, solid: true });
  C('env_items:box', -7.1, -7.2, { fitH: 0.7, solid: true }); C('env_items:box', -7.1, -7.2 + 0.05, { fitH: 0.5, y: 0.7 });
  for (const [x, z] of [[-h + 2, -h + 6], [-h + 2.9, -h + 6.4], [h - 2, -h + 2], [h - 2.8, -h + 2.4], [h - 2, 1]]) C('env_items:barrel', x, z, { fitH: 1, solid: true });
  C('env_urban_fences:wooden_fence_pile', -12.5, -1.5, { ry: 1.2 });
  C('env_interior:table_35', -6.2, 8, { fitH: 0.78, solid: true, ry: 0 });
  C('env_items:box', -5.6, 8, { fitH: 0.35, y: 0.78 }); C('env_items:bottles', -6.6, 8, { fitH: 0.3, y: 0.78 });
  C('env_items:box', -4.6, 9.4, { fitH: 0.6, solid: true }); C('env_items:box', -4.6, 10.3, { fitH: 0.6, solid: true });
  C('env_interior:table_35', 4.2, -8.2, { fitH: 0.8, solid: true, ry: 0 });
  for (const sx of [-1, 1]) C('env_camp:sandbags_wall', sx * 6.5, h - 1.6, { ry: 0, solid: true });
  C('env_interior:dirty_clothes_01', 2.6, 3.8, { fitL: 0.6, y: 0.45 });
  C('env_items:first_aid_kit', 8.6, 4.4, { fitL: 0.35, y: 0.02 });
  // быт: тент от дождя, спальники у палаток, фонарь на столе, котелок у костра, рюкзак, чурбаки
  C('env_x_camp:tarps_green_0', -12.6, -6.5, { ry: Math.PI / 2, scale: 1.3, solid: true });
  C('env_x_camp:sleepingbags_green_0', -7.4, -10.6, { ry: 0.8 }); C('env_x_camp:sleepingbags_green_1', 7.2, -10.4, { ry: -0.7 });
  C('env_x_survival:farol', 4.5, -8.2, { fitH: 0.32, y: 0.8 });
  C('env_x_survival:casserole', 1.3, 3.4, { fitL: 0.38 });
  C('env_x_survival:backpack', -8.4, -1.7, { fitH: 0.5, ry: 2.4 });
  C('env_x_survival:trunk', -11.2, 1.2, { fitH: 0.5, solid: true }); C('env_x_survival:trunk_01', -11.6, 2.4, { fitL: 1.1, ry: 0.3 });
  C('env_x_street:jerrycan', -h + 3.8, -h + 2.6, { fitH: 0.46, ry: 0.5 });
  for (const [x, z] of [[-h + 1.2, 0], [h - 1.2, -6]]) C('env_urban_traffic_lights:light', x, z, { ry: 0, solid: 'trunk' });
  plan.npcs = [
    { id: 'chief', name: 'Михалыч', role: 'Глава лагеря', x: b.cx - 3, z: b.cz - 3, ry: 0.4 },
    { id: 'medic', name: 'Вера', role: 'Медик', x: b.cx + 8, z: b.cz + 5, ry: -0.6 },
    { id: 'trader', name: 'Гоша', role: 'Торговец', x: b.cx - 8, z: b.cz + 9, ry: 0.9 },
  ];
}

// ---------- здания с входом ----------
function shellForPoi(p) {
  return {
    police: { type: 'police', cols: 8, rows: 4 }, hospital: { type: 'hospital', cols: 9, rows: 4 },
    supermarket: { type: 'supermarket', cols: 8, rows: 4 }, pharmacy: { type: 'pharmacy', cols: 5, rows: 4 },
  }[p] || null;
}

// style — отделка деталей Urban (brick, fancy_brick, stuco); sign — вывеска над входом
export const SHELL_TYPES = {
  house:       { name: 'Дом', loot: ['house', 'fridge', 'house'], style: 'stuco', floor: 0x5a4632, zombies: [0, 2], sign: null },
  shop:        { name: 'Магазин', loot: ['shelf', 'shelf', 'desk', 'fridge'], style: 'brick', floor: 0x6e6a62, zombies: [0, 2], sign: null },
  supermarket: { name: 'Супермаркет', loot: ['shelf', 'shelf', 'shelf', 'shelf', 'fridge', 'fridge'], style: 'fancy_brick', floor: 0x77746c, zombies: [3, 6], sign: ['СУПЕРМАРКЕТ', '#7a5a1e'] },
  pharmacy:    { name: 'Аптека', loot: ['pharmacy', 'pharmacy', 'pharmacy'], style: 'stuco', floor: 0x7e837c, zombies: [1, 3], sign: ['АПТЕКА', '#2d5a3a'] },
  police:      { name: 'Полицейский участок', loot: ['police', 'police', 'police', 'house'], style: 'brick', floor: 0x55575c, zombies: [4, 8], guard: true, sign: ['ПОЛИЦИЯ', '#2f4a78'] },
  hospital:    { name: 'Больница', loot: ['pharmacy', 'pharmacy', 'pharmacy', 'pharmacy', 'fridge'], style: 'stuco', floor: 0x8e9290, zombies: [5, 10], guard: true, sign: ['БОЛЬНИЦА', '#8a2e2e'] },
  gas:         { name: 'Заправка', loot: ['gas', 'gas', 'fridge'], style: 'stuco', floor: 0x6b6862, zombies: [1, 3], sign: ['ЗАПРАВКА', '#8a3a2e'] },
  warehouse:   { name: 'Склад', loot: ['warehouse', 'warehouse', 'warehouse', 'warehouse'], style: 'brick', floor: 0x4e4c48, zombies: [2, 5], tall: true },
  barracks:    { name: 'Казарма', loot: ['military', 'military', 'military'], style: 'brick', floor: 0x4a4b40, zombies: [4, 8], guard: true },
};

let shellId = 0;
// cols, rows — в клетках по 3 м; x, z — центр
function shell(b, type, x, z, cols, rows, ry) {
  return { kind: 'shell', id: 'sh' + (shellId++), type, x, z, cols, rows, w: cols * CELL, d: rows * CELL, ry, gx: b ? b.gx : -1, gz: b ? b.gz : -1 };
}

// ---------- улицы ----------
function streets(plan, R, pick) {
  const curb = ROAD / 2 + 0.7;
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
    const lx = streetLine(i), z0 = -HALF + PITCH * j;
    if (R() < 0.6) plan.lights.push({ x: lx + (R() < 0.5 ? -1 : 1) * curb, z: z0 + PITCH / 2, ry: 0, on: R() < 0.12 });
    if (R() < 0.5) plan.cars.push(carSpot(lx + (R() < 0.5 ? -2.2 : 2.2), z0 + 14 + R() * (PITCH - 28), (R() < 0.5 ? 0 : Math.PI) + (R() - 0.5) * 0.6, R, 'street'));
    const lz = streetLine(i), x0 = -HALF + PITCH * j;
    if (R() < 0.6) plan.lights.push({ x: x0 + PITCH / 2, z: lz + (R() < 0.5 ? -1 : 1) * curb, ry: Math.PI / 2, on: R() < 0.12 });
    if (R() < 0.5) plan.cars.push(carSpot(x0 + 14 + R() * (PITCH - 28), lz + (R() < 0.5 ? -2.2 : 2.2), (R() < 0.5 ? 1 : -1) * Math.PI / 2 + (R() - 0.5) * 0.6, R, 'street'));
    if (R() < 0.45) plan.props.push({ env: 'env_urban_litter:' + pick(['trashbag_1', 'trashbag_2', 'trashbag_3', 'trashpile_1', 'trashpile_2', 'trashbag_1_red', 'trashbag_2_blue']), x: lx + (R() < 0.5 ? -1 : 1) * (curb + 0.3 + R() * 1.6), z: z0 + R() * PITCH, ry: R() * 6.28 });
    if (R() < 0.15) plan.props.push({ env: 'env_urban_cones_barriers:' + pick(['traffic_cone_round', 'construction_cone', 'type_2_barrier_top', 'jersey_barrier_dirty']), x: lx + (R() - 0.5) * 6, z: z0 + 10 + R() * (PITCH - 20), ry: R() * 6.28, solid: true });
    if (R() < 0.12) plan.props.push({ env: 'env_urban_litter:' + pick(['trash_can', 'metaltrashcan_beaten', 'trash_can_overflowing']), x: lx + (R() < 0.5 ? -1 : 1) * (curb + 0.4), z: z0 + R() * PITCH, ry: R() * 6.28, solid: true, loot: 'trash', lootChance: 0.35, label: 'Обыскать урну' });
  }
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    if (R() < 0.2) plan.props.push({ env: 'env_urban_traffic_lights:traffic_light', x: streetLine(i) + curb, z: streetLine(j) + curb, ry: Math.PI, solid: 'trunk' });
    if (R() < 0.06) plan.props.push({ env: 'env_urban_bus_stops:' + pick(['busstop', 'busstop_alt', 'busstop_graffiti', 'busstop_round_roof']), x: streetLine(i) + curb + 1.2, z: streetLine(j) + 20, ry: -Math.PI / 2, solid: true });
  }
  for (const [x, z, ry] of [[streetLine(4), streetLine(6) + 22, 0], [streetLine(9), streetLine(7) - 22, 0], [streetLine(6) + 22, streetLine(4), Math.PI / 2]])
    plan.props.push({ special: 'roadblock', x, z, ry });
}

// ---------- наполнение (v2.1: «квартал сырой, ничего не расставлено») ----------
// Тротуары: урны, скамейки, столбики, мешки, деревья. Дворы: столы со стульями, кусты, бочки, ящики,
// баррикады выживших. Центр: мусорки, коробки, трубы. Улицы: аварии с конусами и заграждениями.
// Всё ставится только на свободное место: здания, фонари и машины не задеваем.
// [деталь, масштаб]: у пака банки и бутылки крупноваты, ужимаем до настоящих
export const JUNK = [['litter_1', 1], ['litter_2', 1], ['news_1', 0.7], ['news_2', 0.8], ['news_3', 0.8], ['paper_1', 0.5], ['paper_2', 0.5],
  ['flat_can_1', 0.6], ['flat_can_2', 0.6], ['flat_can_3', 0.5], ['flat_can_4', 0.6], ['glass_shards_1', 0.8], ['glass_shards_2', 0.8],
  ['can_1_crushed', 0.45], ['can_3_crushed', 0.45], ['can_5_crushed', 0.45], ['can_8_crushed', 0.45], ['coffee_cup_crushed', 0.45],
  ['chip_bag_1', 0.45], ['chip_bag_3', 0.45], ['paper_bag_3', 0.6], ['glassbottle_2_broken', 0.4], ['glassbottle_4_broken', 0.4], ['mask_1', 0.5], ['pills_1', 0.5]];
const JUNK_HEAVY = [['concrete_debris_1', 1], ['concrete_debris_2', 0.8], ['wooden_plank_1', 1], ['wooden_plank_3', 1], ['sheet_metal_1', 0.9],
  ['sheet_metal_2', 1], ['brick_1', 0.45], ['rebar', 1], ['cinder_block_1', 0.4], ['wheel_1', 0.35], ['news_stack', 0.6]];
function dress(plan, R, pick) {
  const occ = [];
  const rect = (x, z, w, d, ry) => { const sw = Math.abs(Math.sin(ry || 0)) > 0.5; const hx = (sw ? d : w) / 2, hz = (sw ? w : d) / 2; return { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz }; };
  for (const b of plan.buildings) occ.push(rect(b.x, b.z, b.w || 10, b.d || 10, b.ry));
  for (const s of plan.shells) occ.push(rect(s.x, s.z, s.w + 1.5, s.d + 1.5, s.ry));
  for (const p of plan.props) if (p.special === 'canopy' || p.special === 'pump') occ.push(rect(p.x, p.z, (p.w || 1.5) + 1, (p.d || 1.5) + 1, 0));
  const free = (x, z, r) => !occ.some(q => x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r)
    && !(plan.ponds || []).some(p => Math.hypot(p.x - x, p.z - z) < p.r + r + 0.5)
    && !plan.lights.some(l => Math.hypot(l.x - x, l.z - z) < r + 0.8) && !plan.cars.some(c => Math.hypot(c.x - x, c.z - z) < r + 2.6)
    && !plan.trees.some(t => Math.hypot(t.x - x, t.z - z) < r + 0.8) && !plan.props.some(p => p.env && Math.hypot(p.x - x, p.z - z) < r + 0.5);
  const put = (o, r = 0.8) => { if (!free(o.x, o.z, r)) return false; plan.props.push(o); return true; };
  const bin = (x, z) => put({ env: 'env_urban_litter:' + pick(['metaltrashcan_overflowing', 'metaltrashcan_beaten_filled', 'trash_can_alt1_full', 'metaltrashcan_open_filled', 'trash_can']), x, z, ry: R() * 6.28, solid: true, loot: 'trash', lootChance: 0.45, label: 'Обыскать урну' }, 0.7);
  const bag = (x, z) => R() < 0.35
    ? put({ env: pick(['env_x_street:trash_bag', 'env_x_trash:trashbag_1', 'env_x_trash:trashbag_2']), x, z, ry: R() * 6.28, fitH: 0.55 + R() * 0.25 }, 0.6)
    : put({ env: 'env_urban_litter:' + pick(['trashbag_1', 'trashbag_2', 'trashbag_3', 'trashbag_2_blue', 'trashbag_1_white', 'trashpile_1', 'trashpile_2']), x, z, ry: R() * 6.28 }, 0.6);
  // мелкий сор под ногами (Trash and Debris): газеты, банки, стекло, обломки; лежит на тротуаре, не мешает ходить
  const junk = (x, z, heavy) => { const [k, s] = pick(heavy ? JUNK_HEAVY : JUNK); return put({ env: 'env_x_trash:' + k, x, z, ry: R() * 6.28, scale: s, lie: true }, 0.25); };

  for (const b of plan.blocks) {
    if (b.d === 'camp') continue;
    // тротуары: полоса между фасадами и бордюром
    for (const sd of SIDES) {
      const off = INNER + SIDE * 0.7;
      for (let t = -INNER + 1.5; t < INNER - 1; t += 3 + R() * 3.5) {
        const x = b.cx + sd.nx * off + sd.ax * t, z = b.cz + sd.nz * off + sd.az * t;
        const k = R();
        if (b.d === 'downtown') {
          if (k < 0.16) put({ env: 'env_urban_bus_stops:' + pick(['busstop_bench', 'busstop_bench_alt', 'busstop_single_seat_loose']), x, z, ry: sd.ry, solid: true }, 1.6);
          else if (k < 0.34) bin(x, z);
          else if (k < 0.5) put({ env: 'env_urban_cones_barriers:' + pick(['simple_bollard', 'square_bollard', 'retro_bollard', 'concrete_retro_bollard']), x, z, ry: 0, solid: true }, 0.4);
          else if (k < 0.78) bag(x + (R() - 0.5), z + (R() - 0.5));
          else junk(x + (R() - 0.5) * 2, z + (R() - 0.5) * 2);
          if (R() < 0.5) junk(x + (R() - 0.5) * 3, z + (R() - 0.5) * 2);
        } else {
          if (k < 0.3 && free(x, z, 1.4)) plan.trees.push({ x, z, s: 0.6 + R() * 0.35 });
          else if (k < 0.45) bin(x, z);
          else if (k < 0.62) bag(x + (R() - 0.5), z + (R() - 0.5));
          else if (k < 0.68) put({ env: 'env_urban_cones_barriers:' + pick(['traffic_cone_round', 'construction_cone']), x, z, ry: R() * 6.28 }, 0.4);
          else if (k < 0.9) junk(x + (R() - 0.5) * 2, z + (R() - 0.5) * 2);
        }
        // ещё сор: на тротуаре и у бордюра на проезжей части (ветром сдуло)
        for (let j = 0; j < 2; j++) if (R() < 0.6) junk(x + sd.ax * (R() - 0.5) * 3 + sd.nx * (R() - 0.3) * 2, z + sd.az * (R() - 0.5) * 3 + sd.nz * (R() - 0.3) * 2);
        if (R() < 0.35) junk(x + sd.nx * (SIDE * 0.5 + 0.6 + R()), z + sd.nz * (SIDE * 0.5 + 0.6 + R()), R() < 0.25);
      }
    }
    // центр: двор за домами
    if (b.d === 'downtown') {
      for (let i = 0; i < 22; i++) {
        const x = b.cx + (R() - 0.5) * (INNER * 2 - 4), z = b.cz + (R() - 0.5) * (INNER * 2 - 4);
        const k = R();
        if (k < 0.18) put({ env: R() < 0.35 ? 'env_x_street:dumpster' : 'env_urban_litter:' + pick(['dumpster_full_no_lid', 'dumpster_empty_lid_open_blue', 'dumpster_full_lid_open_red', 'dumpster_diagonal_closed_red']), x, z, ry: R() * 6.28, solid: true, loot: 'trash', lootChance: 0.6, label: 'Обыскать мусорный бак' }, 1.6);
        else if (k < 0.4) put({ env: R() < 0.5 ? 'env_x_trash:' + pick(['cardboardbox_1', 'cardboardbox_2', 'cardboardbox_3']) : 'env_items:box', x, z, ry: R() * 6.28, fitH: 0.5 + R() * 0.4, solid: true, loot: R() < 0.4 ? 'trash' : null, lootChance: 0.6, label: 'Коробки' }, 0.8);
        else if (k < 0.55) put({ env: R() < 0.5 ? 'env_x_street:barrel' : 'env_items:barrel', x, z, ry: R() * 6.28, fitH: 1, solid: true }, 0.7);
        else if (k < 0.65) put({ env: 'env_urban_pipes:' + pick(['pipe_rusted', 'pipe', 'pipe_corner_rusted']), x, z, ry: R() * 6.28, fitL: 3 }, 1.6);
        else if (k < 0.75) put({ env: 'env_urban_vents:' + pick(['duct', 'duct_long', 'duct_corner_rounded']), x, z, ry: R() * 6.28 }, 1.4);
        else if (k < 0.85) junk(x, z, R() < 0.6);
        else bag(x, z);
      }
    }
    if (b.d === 'park') {
      for (let i = 0; i < 6; i++) {
        const x = b.cx + (R() - 0.5) * (INNER * 2 - 6), z = b.cz + (R() - 0.5) * (INNER * 2 - 6);
        if (i < 2) { if (put({ env: 'env_interior:table_35', x, z, ry: R() * 6.28, fitH: 0.75, solid: true }, 1.4)) put({ env: 'env_interior:chair_02', x: x + 1, z, ry: -Math.PI / 2, fitH: 0.9 }, 0.3); }
        else if (i < 4) bin(x, z); else bag(x, z);
      }
    }
  }

  // дворы жилых участков (сторона двора противоположна улице)
  for (const lot of plan.lots) {
    const bx = lot.x, bz = lot.z - lot.front * 4.6;
    const k = R();
    if (k < 0.55 && put({ env: 'env_interior:table_35', x: bx + (R() - 0.5) * 6, z: bz, ry: R() * 0.4, fitH: 0.75, solid: true }, 1.2)) {
      const t = plan.props[plan.props.length - 1];
      put({ env: 'env_interior:' + pick(['chair_02', 'chair_04', 'chair_22']), x: t.x - 1, z: t.z, ry: Math.PI / 2, fitH: 0.9 }, 0.2);
      if (R() < 0.6) put({ env: 'env_interior:' + pick(['chair_02', 'chair_04']), x: t.x + 1.1, z: t.z + 0.3, ry: -Math.PI / 2 + 0.5, fitH: 0.9 }, 0.2);
    }
    for (let i = 0; i < 2 + Math.floor(R() * 3); i++) { const x = bx + (R() - 0.5) * 11, z = lot.z - lot.front * (5.7 + R() * 0.5); if (free(x, z, 0.9)) plan.trees.push({ x, z, s: 1, bush: true }); }
    const sx = lot.x - lot.lx * 5.4, sz = lot.z + (R() - 0.5) * 5;
    if (R() < 0.6) bin(sx, sz);
    if (R() < 0.5) put({ env: 'env_items:barrel', x: sx, z: sz + 1.4, ry: R() * 6, fitH: 1, solid: true }, 0.6);
    if (R() < 0.45) put({ env: 'env_items:box', x: sx - lot.lx * 0.3, z: sz - 1.6, ry: R() * 6, fitH: 0.55, solid: true, loot: 'trash', lootChance: 0.5, label: 'Коробки' }, 0.6);
    if (R() < 0.35) bag(bx + (R() - 0.5) * 8, bz + (R() - 0.5) * 3);
    // брошенная мебель во дворе, канистра у дома, сор
    if (R() < 0.3) put({ env: 'env_x_furn:' + pick(['couch', 'mattress', 'chair', 'fridge']), x: bx + (R() - 0.5) * 8, z: bz + (R() - 0.5) * 2, ry: R() * 6.28, solid: true }, 1);
    if (R() < 0.3) put({ env: 'env_x_street:jerrycan', x: sx + lot.lx * 0.6, z: sz - 0.6, ry: R() * 6.28, fitH: 0.46, loot: R() < 0.5 ? 'canister' : null, lootChance: 0.6, label: 'Канистра' }, 0.3);
    for (let i = 0; i < 2; i++) if (R() < 0.6) junk(bx + (R() - 0.5) * 9, bz + (R() - 0.5) * 3, R() < 0.3);
    // выжившие держали оборону: шины и мешки у дома
    if (R() < 0.3) put({ env: R() < 0.5 ? 'env_camp:barricade_tyres' : 'env_camp:sandbags_wall', x: lot.x + lot.lx * 5.2, z: lot.z - lot.front * 1, ry: Math.PI / 2, solid: true }, 1.2);
    if (R() < 0.25) put({ env: 'env_urban_fences:wooden_fence_pile', x: bx + (R() - 0.5) * 8, z: bz + 1, ry: R() * 6 }, 1.2);
  }

  // логова культистов: костёр, шины, мусор, граффити. Сначала ищем место во дворе, потом на улицах квартала
  // (в жилых кварталах дворы заняты участками с заборами)
  const lair = b => {
    for (let k = 0; k < 90; k++) {
      const sp = k < 30 ? INNER * 2 - 8 : PITCH - 2;
      const x = b.cx + (R() - 0.5) * sp, z = b.cz + (R() - 0.5) * sp;
      if (!free(x, z, 3.2)) continue;
      plan.cults.push({ x, z });
      plan.props.push({ special: 'campfire', x, z, cult: true });
      for (let i = 0; i < 3; i++) { const a = i * 2.1 + R(); put({ env: 'env_camp:barricade_tyres', x: x + Math.cos(a) * 3.2, z: z + Math.sin(a) * 3.2, ry: a, solid: true }, 1); }
      for (let i = 0; i < 2; i++) { const a = R() * 6.28; put({ env: 'env_camp:chair_camp', x: x + Math.cos(a) * 1.8, z: z + Math.sin(a) * 1.8, ry: a + Math.PI }, 0.3); }
      for (let i = 0; i < 3; i++) bag(x + (R() - 0.5) * 7, z + (R() - 0.5) * 7);
      put({ env: 'env_urban_bus_stops:' + pick(['graffiti', 'graffiti_alt', 'graffiti_alt2', 'graffiti_alt3']), x: x + 2.4, z: z - 2.4, ry: R() * 6.28 }, 0.5);
      put({ env: 'env_items:box', x: x - 2.2, z: z + 2.4, ry: R(), fitH: 0.6, solid: true, loot: 'cultist', lootChance: 0.9, label: 'Ящик культистов' }, 0.6);
      return true;
    }
  };
  // заражённость кварталов: 0 тихо, 1 как обычно, 2 много, 3 кишит. Рядом с лагерем не выше 1.
  // В кишащих кварталах стоят орды (10–18 мертвецов толпой), в «много» — иногда толпа поменьше.
  plan.hordes = [];
  // самый дальний от лагеря квартал всегда кишит, следующий за ним — не меньше «много»
  const byFar = plan.blocks.filter(b => b.d !== 'camp').sort((a, b) => Math.hypot(b.cx - (plan.camp?.x ?? 0), b.cz - (plan.camp?.z ?? 0)) - Math.hypot(a.cx - (plan.camp?.x ?? 0), a.cz - (plan.camp?.z ?? 0)));
  for (const b of plan.blocks) {
    const nearCamp = plan.camp && Math.hypot(b.cx - plan.camp.x, b.cz - plan.camp.z) < PITCH * 1.6;
    const r = R();
    b.inf = b.d === 'camp' ? 0 : nearCamp ? (r < 0.4 ? 0 : 1) : r < 0.15 ? 0 : r < 0.5 ? 1 : r < 0.78 ? 2 : 3;
    if (b === byFar[0]) b.inf = 3; else if (b === byFar[1]) b.inf = Math.max(b.inf, 2);
    const groups = b.inf === 3 ? 1 + (R() < 0.5 ? 1 : 0) : b.inf === 2 && R() < 0.5 ? 1 : 0;
    for (let i = 0, k = 0; i < groups && k < 40; k++) {
      const x = b.cx + (R() - 0.5) * (PITCH - 4), z = b.cz + (R() - 0.5) * (PITCH - 4);
      if (!free(x, z, 2.5)) continue;
      plan.hordes.push({ x, z, n: b.inf === 3 ? 10 + Math.floor(R() * 9) : 6 + Math.floor(R() * 4) });
      i++;
    }
  }
  // логова — в двух кварталах дальше всего от лагеря выживших (раньше одно было в парке у самого лагеря)
  const cx = plan.camp ? plan.camp.x : 0, cz = plan.camp ? plan.camp.z : 0;
  const far = plan.blocks.filter(b => b.d !== 'camp' && b.d !== 'port').sort((a, b) => Math.hypot(b.cx - cx, b.cz - cz) - Math.hypot(a.cx - cx, a.cz - cz));
  for (let i = 0, made = 0; i < far.length && made < 2; i++) if (lair(far[i])) made++;

  // улицы: аварии и заграждения посреди дороги
  for (let i = 0; i <= N; i++) for (let j = 0; j < N; j++) {
    if (R() > 0.35) continue;
    const vert = R() < 0.5, l = streetLine(i), m = -HALF + PITCH * j + PITCH / 2 + (R() - 0.5) * 16;
    const x = vert ? l + (R() - 0.5) * 3 : m, z = vert ? m : l + (R() - 0.5) * 3;
    if (!free(x, z, 2.5)) continue;
    const c = carSpot(x, z, (vert ? 0 : Math.PI / 2) + (R() - 0.5) * 1.2, R, 'street');
    c.works = false; c.wreck = true; if (R() < 0.5) c.model = 'car6';
    plan.cars.push(c);
    const ax = vert ? 0 : 1, az = vert ? 1 : 0;
    for (const s of [-1, 1]) put({ env: 'env_urban_cones_barriers:' + pick(['traffic_cone_round', 'construction_cone', 'traffic_cone_square']), x: x + ax * s * 4 + (R() - 0.5), z: z + az * s * 4 + (R() - 0.5), ry: R() * 6 }, 0.3);
    if (R() < 0.6) put({ env: 'env_urban_cones_barriers:' + pick(['type_3_barrier_broken_planks', 'type_3_barrier_2_planks', 'type_2_barrier_top', 'jersey_barrier_dirty']), x: x + ax * 6, z: z + az * 6, ry: vert ? 0 : Math.PI / 2, solid: true }, 0.8);
    bag(x - ax * 3 + 1.5 * az, z - az * 3 + 1.5 * ax);
  }
}

// ---------- за городом ----------
function outskirts(plan, R, pick) {
  if (!FULL) return outskirtsProto(plan, R, pick);
  const ax = -HALF - 170, az = 0;
  plan.airfield = { x: ax, z: az, len: 520, w: 30 };
  plan.zones.push({ type: 'airfield', x: ax, z: az, w: 120, d: 600 });
  plan.shells.push(shell(null, 'warehouse', ax + 55, az - 120, 10, 7, -Math.PI / 2));
  plan.buildings.push({ kind: 'pre', id: 'env_urban_buildings_prebuild:hangar1', x: ax + 52, z: az - 60, ry: -Math.PI / 2, s: 3, w: 34.8, d: 24 });
  plan.props.push({ special: 'tower', x: ax + 50, z: az + 60 });
  plan.planes.push({ x: ax, z: az + 230, ry: 0, fuel: 0.55 }); // носом на север, впереди почти вся полоса
  plan.planes.push({ x: ax + 40, z: az - 120, ry: -Math.PI / 2, fuel: 0.2 });
  plan.props.push({ special: 'road', x0: -HALF, z0: 0, x1: ax + 20, z1: az, w: ASPHALT });

  const mx = 40, mz = -HALF - 190;
  plan.military = { x: mx, z: mz, w: 150, d: 110 };
  plan.zones.push({ type: 'military', x: mx, z: mz, w: 150, d: 110 });
  plan.props.push({ special: 'campWall', x: mx, z: mz, w: 150, d: 110, gate: 's', military: true });
  plan.shells.push(shell(null, 'barracks', mx - 40, mz - 20, 9, 4, 0));
  plan.shells.push(shell(null, 'barracks', mx + 40, mz - 20, 9, 4, 0));
  plan.shells.push(shell(null, 'warehouse', mx, mz - 35, 9, 6, Math.PI));
  for (let i = 0; i < 5; i++) plan.props.push({ special: 'mcrate', x: mx - 30 + i * 14, z: mz + 20, loot: 'military' });
  for (let i = 0; i < 6; i++) plan.props.push({ env: 'env_camp:sandbags_wall', x: mx - 15 + i * 2, z: mz + 46, ry: 0, solid: true });
  for (let i = 0; i < 3; i++) plan.cars.push(carSpot(mx - 50 + i * 12, mz + 34, Math.PI / 2, R, 'military', 'military'));
  plan.props.push({ special: 'road', x0: streetLine(6) + 40, z0: -HALF, x1: mx, z1: mz + 55, w: ASPHALT });
  plan.pois.push({ type: 'military', x: mx, z: mz, name: 'Военная база' });

  for (let i = 0; i < 260; i++) {
    const a = R() * 6.28, r = HALF + 40 + R() * 420;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (x > COAST_X - 10) continue;
    if (Math.abs(x - ax) < 70 && Math.abs(z - az) < 300) continue;
    if (Math.abs(x - mx) < 90 && Math.abs(z - mz) < 70) continue;
    plan.trees.push({ x, z, s: 0.9 + R() * 1.1, wild: true, bush: R() < 0.2 });
  }
  for (let i = 0; i < 6; i++) {
    const a = R() * 6.28, r = HALF + 80 + R() * 250;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (x > COAST_X - 30 || (Math.abs(x - ax) < 80 && Math.abs(z - az) < 300) || (Math.abs(x - mx) < 100 && Math.abs(z - mz) < 80)) continue;
    plan.shells.push(shell(null, 'house', x, z, 4, 3, Math.floor(R() * 4) * Math.PI / 2));
  }

  for (const s of plan.shells) if (['police', 'hospital', 'supermarket', 'pharmacy', 'gas'].includes(s.type))
    plan.pois.push({ type: s.type, x: s.x, z: s.z, name: SHELL_TYPES[s.type].name, shell: s.id });
  plan.pois.push({ type: 'camp', x: plan.camp.x, z: plan.camp.z, name: 'Лагерь выживших' });
  plan.pois.push({ type: 'airfield', x: ax, z: az, name: 'Аэродром' });
  plan.pois.push({ type: 'port', x: COAST_X - 20, z: blockCenter(12, 6)[1], name: 'Порт' });
}

// прототип: маленький блокпост военных сразу за северной окраиной (Мясник для последнего задания),
// лесополоса вокруг, аэродрома нет
function outskirtsProto(plan, R, pick) {
  const mx = 0, mz = -HALF - 40;
  plan.airfield = null;
  plan.military = { x: mx, z: mz, w: 64, d: 44 };
  plan.zones.push({ type: 'military', x: mx, z: mz, w: 64, d: 44 });
  plan.props.push({ special: 'campWall', x: mx, z: mz, w: 64, d: 44, gate: 's', military: true });
  plan.shells.push(shell(null, 'barracks', mx - 12, mz - 12, 7, 4, 0));
  for (let i = 0; i < 3; i++) plan.props.push({ special: 'mcrate', x: mx + 10 + i * 5, z: mz - 10, loot: 'military' });
  for (let i = 0; i < 5; i++) plan.props.push({ env: 'env_camp:sandbags_wall', x: mx + 8 + i * 2, z: mz + 6, ry: 0, solid: true });
  for (let i = 0; i < 2; i++) plan.cars.push(carSpot(mx + 10 + i * 9, mz + 12, Math.PI / 2, R, 'military', 'military'));
  plan.props.push({ special: 'road', x0: mx, z0: -HALF, x1: mx, z1: mz + 22, w: ASPHALT });
  plan.pois.push({ type: 'military', x: mx, z: mz, name: 'Блокпост военных' });
  // дачи у подножия гор (PS1 House Pack, najjar320): стиль у них другой, поэтому подальше от города, сплошные, без входа
  const DACHA = ['dacha', 'izba', 'log_cabin', 'single_pen', 'tiny_house', 'chalet', 'shotgun', 'cape_cod', 'hip_roof', 'i_house', 'double_pile', 'tract_ranch', 'saddlebag', 'pyramidal', 'foursquare', 'bungalow'];
  const near = [];
  const okOut = (x, z, r) => x < COAST_X - 20 && !(Math.abs(x - mx) < 45 + r && Math.abs(z - mz) < 35 + r) && !(Math.abs(x - mx) < 8 + r && z < -HALF)
    && !near.some(q => Math.hypot(q.x - x, q.z - z) < q.r + r);
  for (let k = 0, n = 0; k < 300 && n < 11; k++) {
    const a = R() * 6.28, r = WORLD - 32 + R() * 20;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.max(Math.abs(x), Math.abs(z)) > WORLD - 10 || !okOut(x, z, 9)) continue;
    const ry = Math.round(Math.atan2(-x, -z) / (Math.PI / 2)) * Math.PI / 2; // фасадом к городу, по сторонам света
    plan.props.push({ env: 'env_x_houses:' + DACHA[n % DACHA.length], x, z, ry, solid: true, dacha: true });
    const fx = x + Math.sin(ry) * 7, fz = z + Math.cos(ry) * 7;
    plan.props.push({ env: 'env_x_trash:cardboardbox_' + (1 + (n % 3)), x: fx + 1.5, z: fz, ry: R() * 6, fitH: 0.6, solid: true, loot: 'house', lootChance: 0.7, label: 'Ящик у дачи' });
    if (R() < 0.5) plan.props.push({ env: 'env_x_furn:' + ['couch', 'mattress', 'chair', 'fridge'][n % 4], x: fx - 2, z: fz + 1, ry: R() * 6.28, solid: true });
    near.push({ x, z, r: 9 }); n++;
  }
  // камни (Rocks PSX Low Poly, dripsone): россыпью за окраиной, крупные гуще к горам
  // big_rock из пака не берём: тёмный шпиль без текстуры; крупные валуны — увеличенные средние
  const ROCKS = [['mediun_rock', 2.6, 4], ['mediun_rock', 1.2, 2], ['mediun_rock_2', 1, 1.8], ['mediun_rock_3', 1.2, 2], ['small_rock', 0.4, 0.8]];
  for (let k = 0, n = 0; k < 400 && n < 46; k++) {
    const a = R() * 6.28, r = HALF + 14 + R() * (WORLD - HALF - 18);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.max(Math.abs(x), Math.abs(z)) > WORLD - 4 || !okOut(x, z, 2)) continue;
    const far = (r - HALF) / (WORLD - HALF);
    const [key, l0, l1] = ROCKS[R() < far * 0.5 ? 0 : 1 + Math.floor(R() * 4)];
    const L = l0 + R() * (l1 - l0);
    plan.props.push({ env: 'env_x_rocks:' + key, x, z, ry: R() * 6.28, fitL: L, solid: L > 1.1, far: L > 2 });
    if (L > 1.1) near.push({ x, z, r: L * 0.6 });
    n++;
  }
  // брошенная туристическая стоянка: рваные палатки, спальники, кострище, рюкзак с остатками
  for (let k = 0; k < 60; k++) {
    const a = R() * 6.28, r = HALF + 30 + R() * 25;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    if (!okOut(cx, cz, 8)) continue;
    near.push({ x: cx, z: cz, r: 8 });
    const P = (env, dx, dz, o = {}) => plan.props.push(Object.assign({ env, x: cx + dx, z: cz + dz, ry: o.ry ?? R() * 6.28 }, o));
    P('env_x_camp:campfire_lowpoly_0', 0, 0, { fitL: 1.4 });
    P('env_x_camp:damagedtents_darkblue_0', -4, -2, { scale: 1.2, solid: true }); P('env_x_camp:damagedtents_yellow_3', 3.5, -3, { scale: 1.2, solid: true });
    P('env_x_camp:damagedtents_darkblue_4', 4, 3, { scale: 1.2, solid: true });
    P('env_x_camp:tentscraps_orange_1', -3, 3.5); P('env_x_camp:damagedtarps_darkblue_1', -5.5, 1.5);
    P('env_x_camp:damagedsleepingbags_orange_2', -1.6, 2); P('env_x_camp:damagedsleepingbags_orange_3', 1.8, -1.4);
    P('env_x_survival:backpack001', 0.8, 1.6, { fitH: 0.5, loot: 'house', lootChance: 1, label: 'Обыскать рюкзак' });
    P('env_x_survival:farol_g', -0.9, -1.2, { fitH: 0.3 }); P('env_x_survival:casserole', 0.9, 0.2, { fitL: 0.38 });
    plan.pois.push({ type: 'campsite', x: cx, z: cz, name: 'Брошенная стоянка' });
    break;
  }
  for (let i = 0; i < 140; i++) {
    const a = R() * 6.28, r = HALF + 20 + R() * 60;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (x > COAST_X - 10) continue;
    if (near.some(q => Math.hypot(q.x - x, q.z - z) < q.r + 1)) continue;
    if (Math.abs(x - mx) < 45 && Math.abs(z - mz) < 35) continue;
    if (Math.abs(x - mx) < 8 && z < -HALF && z > mz) continue;
    plan.trees.push({ x, z, s: 0.9 + R() * 1.1, wild: true, bush: R() < 0.2 });
  }
  for (const s of plan.shells) if (['police', 'hospital', 'supermarket', 'pharmacy', 'gas'].includes(s.type))
    plan.pois.push({ type: s.type, x: s.x, z: s.z, name: SHELL_TYPES[s.type].name, shell: s.id });
  plan.pois.push({ type: 'camp', x: plan.camp.x, z: plan.camp.z, name: 'Лагерь выживших' });
}

// ---------- машины (PSX Style Cars, GGBot) ----------
const CAR_MODELS = ['car', 'car2', 'car3', 'car4', 'car5', 'car5', 'car7', 'car8', 'car5_police', 'car5_taxi'];
function carSpot(x, z, ry, R, where, cls) {
  let model = CAR_MODELS[Math.floor(R() * CAR_MODELS.length)];
  if (cls === 'truck') model = 'car8';
  if (cls === 'military') model = R() < 0.5 ? 'car4' : 'car8';
  const works = where === 'military' ? R() < 0.7 : where === 'gas' ? true : R() < 0.45;
  const wreck = !works && R() < 0.4;
  if (wreck && R() < 0.6) model = 'car6';
  // зажигание: ok — заводится сразу, timing — надо поймать момент (мини-игра), dead — сел аккумулятор
  const ign = R() < 0.35 ? 'ok' : R() < 0.8 ? 'timing' : 'dead';
  return { model, x, z, ry, works, fuel: works ? 0.12 + R() * 0.5 : 0, wreck, where, ign };
}

export function onRoad(x, z) {
  const fx = ((x + HALF) % PITCH + PITCH) % PITCH, fz = ((z + HALF) % PITCH + PITCH) % PITCH;
  const inCity = Math.abs(x) <= HALF + ROAD / 2 && Math.abs(z) <= HALF + ROAD / 2;
  return inCity && (fx < ROAD / 2 || fx > PITCH - ROAD / 2 || fz < ROAD / 2 || fz > PITCH - ROAD / 2);
}

export function districtAt(plan, x, z) {
  if (plan.camp && Math.abs(x - plan.camp.x) < plan.camp.r + 1 && Math.abs(z - plan.camp.z) < plan.camp.r + 1) return 'camp';
  for (const zn of plan.zones) if (Math.abs(x - zn.x) < zn.w / 2 && Math.abs(z - zn.z) < zn.d / 2) return zn.type;
  if (x > COAST_X) return 'sea';
  if (Math.abs(x) > HALF + 6 || Math.abs(z) > HALF + 6) return 'outskirts';
  const gx = Math.floor((x + HALF) / PITCH), gz = Math.floor((z + HALF) / PITCH);
  const b = plan.blocks[gx * N + gz];
  return b ? b.d : 'outskirts';
}
