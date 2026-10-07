// Сцена three.js. Знает про геометрию, свет и спрайты — и ничего не знает о правилах боя.
// Граница наружу: init / resize / frame / pick.

import * as THREE from 'three';
import { spriteCanvas, spriteFrames, floorCanvas, wallCanvas, bloodCanvas, glowCanvas,
         vignetteCanvas, shadowCanvas, SPRITE_W, SPRITE_H } from './sprites.js';
import { SCHOOLS, GORE } from './data.js';
import { STONE, COLD, NECRO, FIRE, BLOOD, SCHOOL_RAMP, INK, NO_TINT, num } from './palette.js';

// Короткие псевдонимы: в рендере цвет пишется как C.fire, а не числом
const C = {
  ink: num(INK), noTint: num(NO_TINT),
  stone0: num(STONE[0]), stone3: num(STONE[3]),
  cold1: num(COLD[1]), cold4: num(COLD[4]),
  necro1: num(NECRO[1]), necro2: num(NECRO[2]),
  fire: num(FIRE[2]),
  blood1: num(BLOOD[1]), blood2: num(BLOOD[2]),
  sarc: num(SCHOOL_RAMP.dust[0]), sarcLid: num(SCHOOL_RAMP.dust[1]),
};

/* Коридор идёт вдоль оси Z: нежить у саркофага (+Z), герои спускаются с лестницы (−Z).
   Ориентация меняет не сцену, а только положение камеры — в портрете смотрим вдоль
   коридора, в альбоме сбоку. Раскладка боя от этого разворачивается сама. */
const CORRIDOR_HALF = 9;
const ROW_Z = { undead: { front: 2.0, back: 3.5 }, heroes: { front: -2.0, back: -3.5 } };
const SLOT_X = 1.05;
const UNIT_H = 2.0;                 // высота спрайта в мире
// Ширина считается по КАЖДОМУ спрайту, а не по общей константе: матрицы переезжают
// с 12×16 на 20×28 постепенно, и общий множитель раздавил бы половину из них.
const widthFor = canvas => UNIT_H * canvas.width / canvas.height;
const UNIT_W = UNIT_H * SPRITE_W / SPRITE_H;   // запасное значение для теней и рамок
const TARGET_BUFFER_H = 400;        // кадр рендерится мелко и растягивается целым множителем

let renderer, scene, camera, canvasEl;
let ambient, torches = [], necroLight, necro, necroCast = 0, stairLight;
let partyLight, vignette;
// Тезис в одну строку кода: доля живых героев правит цветом всей комнаты.
// 1 — зал залит чужим холодом, 0 — упал в твой зелёный.
const COLD_TONE = new THREE.Color(num(COLD[1]));
const NECRO_TONE = new THREE.Color(num(NECRO[0]));
// В альбомной камера смотрит сбоку: ближняя стена закрыла бы весь бой, а колонны
// при таком ракурсе читаются чёрными балками с потолка. И то и другое прячем —
// ровно так же поступает любая изометрия.
let wallNear = null, columns = null;
let glowTex, bloodTex, shadowTex;
const nicheRight = [];
const unitViews = new Map();        // uid → { group, sprite, glow, bar, def }
const particles = [];
const decals = [];

/* Текстуры и плоскости спрайтов — ОДНИ на вид, а не на юнита. Пока каждый юнит
   получал собственную CanvasTexture, каждая партия оставляла её на GPU навсегда:
   syncUnits снимал группу со сцены, но ничего не освобождал, и за длинную идл-сессию
   память росла без потолка. Материал остаётся личным — у него живёт tint удара. */
const spriteTexCache = new Map();
const spriteGeoCache = new Map();
function spriteTex(name) {
  if (!spriteTexCache.has(name)) spriteTexCache.set(name, texFromCanvas(spriteCanvas(name)));
  return spriteTexCache.get(name);
}
/* Текстуры кадров анимации — тоже общие на вид. Кэш обязателен: без него каждый кадр
   боя создавал бы новые CanvasTexture, то есть возвращал бы утечку, закрытую в v2. */
const frameTexCache = new Map();
function frameTexes(name) {
  if (!frameTexCache.has(name)) {
    frameTexCache.set(name, spriteFrames(name).map(c => texFromCanvas(c)));
  }
  return frameTexCache.get(name);
}
function spriteGeo(name) {
  if (!spriteGeoCache.has(name)) {
    const art = spriteCanvas(name);
    spriteGeoCache.set(name, new THREE.PlaneGeometry(widthFor(art), UNIT_H));
  }
  return spriteGeoCache.get(name);
}
// Общие плоскости мелочей юнита — им незачем быть личными
let shadowGeo, glowGeo, lampGeo, barGeo, particleGeo, decalGeo, decalMat;
let sarcSeam = null;               // зелёная щель саркофага, пульсирует в такт necroLight
let landscape = false;
/* Тряска кадра. Держим базовую позицию камеры отдельно и смещаем от неё: ортокамера
   стоит на несимметричной пирамиде, и трогать сам фрустум ради дрожи нельзя. */
let shake = 0;
const camHome = new THREE.Vector3();
let frameCount = 0;
let flash = 0;

function texFromCanvas(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/* ═══════════════ Постройка подземелья ═══════════════ */
function buildDungeon() {
  // Коридор узкий намеренно: в портрете видимая ширина кадра мала, и при широком зале
  // стены просто не попадают в рамку — остаётся голый пол без глубины.
  // Процедурные текстуры — запасные: настоящие тайлы кладёт setLook(), когда картинки
  // декодированы. Материалы запоминаются, чтобы менять облик без пересборки сцены.
  const floorMat = env.floor = new THREE.MeshLambertMaterial({ map: texFromCanvas(floorCanvas(), [5, 12]) });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 24), floorMat);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wallMat = env.wall = new THREE.MeshLambertMaterial({ map: texFromCanvas(wallCanvas(), [8, 2]) });
  const colMat = env.col = new THREE.MeshLambertMaterial({ map: texFromCanvas(wallCanvas(), [2, 3]) });
  // Десять колонн одним инстансом: они одинаковы, а вызовы рисования дорого стоят
  const colGeo = new THREE.CylinderGeometry(0.36, 0.44, 5, 8);
  columns = new THREE.InstancedMesh(colGeo, colMat, 10);
  let ci = 0;
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5, 24), wallMat);
    wall.position.set(sx * 4.2, 2.5, 0);
    scene.add(wall);
    if (sx > 0) wallNear = wall;
    // Колонны вдоль стен — они дают глубину при взгляде вдоль коридора
    for (let i = -2; i <= 2; i++) {
      columns.setMatrixAt(ci++, tmpMat4.makeTranslation(sx * 3.4, 2.5, i * 4.4));
    }
  }
  scene.add(columns);

  // Лестница, по которой спускаются герои
  const stairMat = env.stair = new THREE.MeshLambertMaterial({ map: texFromCanvas(wallCanvas(), [4, 1]) });
  for (let i = 0; i < 7; i++) {
    const stp = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 0.9), stairMat);
    stp.position.set(0, i * 0.4 + 0.2, -6.8 - i * 0.9);
    scene.add(stp);
  }

  /* Саркофаг некроманта — то, что герои пытаются достать.
     Камень тёмный, а зелёная — только щель под крышкой (BasicMaterial не зависит от
     света). В v1 корпус был из светлой ступени рампы, и под necroLight + светом партии
     превращался в белую плиту — самое яркое пятно кадра, что ломало право на акцент:
     ярче всех обязан быть живой герой, а не мебель. */
  const sarcMat = env.sarc = new THREE.MeshLambertMaterial({ map: texFromCanvas(wallCanvas(), [2, 1]) });
  const sarc = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 3.2), sarcMat);
  sarc.position.set(0, 0.5, 7.6);
  scene.add(sarc);
  const seam = new THREE.Mesh(
    new THREE.BoxGeometry(1.86, 0.07, 3.26),
    new THREE.MeshBasicMaterial({ color: C.necro2, transparent: true })
  );
  seam.position.set(0, 1.02, 7.6);
  scene.add(seam);
  sarcSeam = seam;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.28, 3.6), new THREE.MeshLambertMaterial({ color: C.stone3 }));
  lid.position.set(0, 1.2, 7.6);
  scene.add(lid);

  buildNiches();
  buildDebris();
}

/* ═══════════════ Облик: тайлы, декор, некромант ═══════════════
   Пол и стены — тайлы DCSS (решение пользователя 2026-10-07), выбираются в «Склепе».
   Плотность пикселя та же, что у спрайтов: тайл 32 px ложится на 2 единицы мира,
   как фигура 32 px высотой UNIT_H = 2. Иначе пол выглядел бы мельче или крупнее
   стоящих на нём героев. */
const env = {};
const TILE_WORLD = 2;                 // сколько мира на один тайл 32 px
const PATCH = 8;                      // текстура — кусок 8×8 тайлов, дальше повтор
const PATCH_WORLD = PATCH * TILE_WORLD;
let decorViews = [], decorRight = [];
let necroFig = null;

// Кусок из случайных вариантов семейства. Сид фиксированный: пол не «прыгает» от загрузки к загрузке
function tileCanvas(imgs, seed) {
  const c = document.createElement('canvas');
  c.width = c.height = PATCH * 32;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  let s = seed;
  for (let j = 0; j < PATCH; j++) for (let i = 0; i < PATCH; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    x.drawImage(imgs[s % imgs.length], i * 32, j * 32);
  }
  return c;
}

function retexture(mat, canvas, worldW, worldH) {
  if (mat.map) mat.map.dispose();
  mat.map = texFromCanvas(canvas, [worldW / PATCH_WORLD, worldH / PATCH_WORLD]);
  mat.needsUpdate = true;      // смена карты — редкое событие, пересборка программы тут допустима
}

function billboard(img, h) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(img, 0, 0);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(h * img.width / img.height, h),
    new THREE.MeshLambertMaterial({ map: texFromCanvas(c), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide })
  );
  return m;
}

function dropMesh(m) { scene.remove(m); m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); }

/* look = { floor: [Image], wall: [Image], decor: [Image], necro: Image } — картинки уже
   декодированы (это забота main.js). Любое поле можно опустить — тогда не трогаем. */
export function setLook(look) {
  if (look.floor?.length) retexture(env.floor, tileCanvas(look.floor, 7), 9, 24);
  if (look.wall?.length) {
    const wc = tileCanvas(look.wall, 11);
    retexture(env.wall, wc, 24, 5);
    retexture(env.col, wc, 2.5, 5);
    retexture(env.stair, wc, 5, 0.9);
    retexture(env.sarc, wc, 3.2, 1);
    retexture(env.niche, wc, 1.5, 0.3);
  }
  if (look.decor) {
    for (const m of decorViews) dropMesh(m);
    decorViews = []; decorRight = [];
    /* Декор — между колоннами (колонны стоят на z кратных 4.4), у самой стены, чтобы не
       заходить на боевые дорожки. Один и тот же набор зеркально на обе стороны; правая
       прячется в альбоме вместе с ближней стеной. */
    const zs = [-6.6, -2.2, 2.2, 6.6];
    look.decor.forEach((img, i) => {
      for (const sx of [-1, 1]) {
        const m = billboard(img, UNIT_H);
        m.position.set(sx * 3.7, UNIT_H / 2, zs[i % zs.length]);
        scene.add(m);
        decorViews.push(m);
        if (sx > 0) decorRight.push(m);
      }
    });
    for (const m of decorRight) m.visible = !landscape;
  }
  if (look.necro) {
    if (necroFig) dropMesh(necroFig);
    /* Некромант в сцене (решение пользователя 2026-10-07, отменяет решение 2026-08-11
       держать его только в интерфейсе). Стоит перед саркофагом, со стороны боя, и чуть
       мельче юнитов: так он читается хозяином зала, а не ещё одним бойцом, и не
       перекрывает задний ряд нежити — ровно на этом в v1 большой билборд и провалился. */
    necroFig = billboard(look.necro, NECRO_H);
    necroFig.position.set(0, NECRO_H / 2, NECRO_Z);
    scene.add(necroFig);
  }
}
/* Место выведено из ракурса портретной камеры (42° сверху-сзади): саркофаг ближе к
   камере, чем фигура, и закрывает её снизу. На z 5.7 он прятал 63% роста, оставался
   один капюшон. На 4.8 закрыто меньше 0.3 единицы, а макушка проецируется лишь на
   ноги заднего ряда нежити (z 3.5), не выше. */
const NECRO_H = 1.5;
const NECRO_Z = 4.8;

/* Ниши в стенах вместо арок над коридором.
   Арки пробовались и отвергнуты: при камере под 42° перекладина у потолка проецируется
   на пол широкой чёрной полосой, режет кадр на горизонтальные ломти и прячет за собой
   юнитов. Ниши дают ту же глубину — стена перестаёт быть плоской коробкой, — но не
   попадают между камерой и боем вообще. */
/* Ниши тоже инстансами — по одному меша на провал и на перекладину. Правая сторона
   прячется в альбомной ориентации, поэтому левые и правые лежат РАЗНЫМИ инстансами:
   у InstancedMesh видимость одна на весь набор, скрыть половину нельзя. */
function buildNiches() {
  const deep = new THREE.MeshLambertMaterial({ color: C.stone0 });
  const frame = env.niche = new THREE.MeshLambertMaterial({ map: texFromCanvas(wallCanvas(), [1, 2]) });
  const holeGeo = new THREE.BoxGeometry(0.5, 1.7, 1.1);
  const archGeo = new THREE.BoxGeometry(0.56, 0.3, 1.5);
  const zs = [-9.0, -4.6, 0, 4.6, 9.0];

  for (const sx of [-1, 1]) {
    const holes = new THREE.InstancedMesh(holeGeo, deep, zs.length);
    const arches = new THREE.InstancedMesh(archGeo, frame, zs.length);
    zs.forEach((z, i) => {
      holes.setMatrixAt(i, tmpMat4.makeTranslation(sx * 4.05, 2.2, z));
      arches.setMatrixAt(i, tmpMat4.makeTranslation(sx * 4.02, 3.2, z));
    });
    scene.add(holes, arches);
    if (sx > 0) nicheRight.push(holes, arches);   // прячутся вместе с ближней стеной
  }
}

/* Заполнение по тезису: место, не занятое механикой, занято тем, что ты уже убил.
   Раскладка по хешу, а не случайная, — иначе мусор прыгал бы при каждой загрузке.
   Гуще к стенам: середина коридора — боевые дорожки, их занимать нельзя. */
/* Обломки — ОДИН InstancedMesh, а не 90 объектов. Замер: 90 отдельных Mesh давали
   176 вызовов рисования на кадр, из них половину — этот мусор. На мобильном профиле
   счёт вызовов дороже числа треугольников, и именно он ограничивает, сколько
   «памяти подземелья» можно себе позволить. С инстансингом заполнение перестаёт
   стоить дорого: запас слотов рассчитан на двадцать ярусов вперёд. */
const DEBRIS_BASE = 90, DEBRIS_ROOM = 150;
let debris = null, debrisUsed = 0;
const tmpMat4 = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpVec = new THREE.Vector3();
const tmpScale = new THREE.Vector3();

function addDebrisPiece(x, z, w, d, rotY, bone) {
  if (!debris || debrisUsed >= DEBRIS_BASE + DEBRIS_ROOM) return;
  tmpQuat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
  tmpVec.set(x, 0.03, z);
  tmpScale.set(w, 0.05, d);
  debris.setMatrixAt(debrisUsed, tmpMat4.compose(tmpVec, tmpQuat, tmpScale));
  // Кость или камень различаются цветом инстанса: два материала стоили бы двух мешей
  debris.setColorAt(debrisUsed, bone ? DEBRIS_BONE : DEBRIS_CHIP);
  debrisUsed++;
  debris.count = debrisUsed;
  debris.instanceMatrix.needsUpdate = true;
  if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
}

const DEBRIS_BONE = new THREE.Color(num(SCHOOL_RAMP.bone[0]));
const DEBRIS_CHIP = new THREE.Color(num(STONE[0]));

function buildDebris() {
  debris = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshLambertMaterial(),
    DEBRIS_BASE + DEBRIS_ROOM
  );
  debris.count = 0;
  scene.add(debris);

  let s = 1337;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < DEBRIS_BASE; i++) {
    const edge = rnd();
    const x = (rnd() < 0.5 ? -1 : 1) * (1.9 + edge * edge * 2.0);   // к стенам гуще
    const z = -11 + rnd() * 22;
    const bone = rnd() < 0.55;
    const w = bone ? 0.12 + rnd() * 0.2 : 0.1 + rnd() * 0.16;
    addDebrisPiece(x, z, w, w * (0.3 + rnd() * 0.7), rnd() * Math.PI, bone);
  }
}

// Интенсивность в three физическая: при decay 2 освещённость падает как 1/d².
// Факел силой 26 на десяти метрах даёт 0.26 — то есть темноту. Отсюда сотни, а не десятки.
function addTorch(x, z) {
  const light = new THREE.PointLight(C.fire, 62, 22, 2);
  light.position.set(x, 3.2, z);
  scene.add(light);
  const flame = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.8),
    new THREE.MeshBasicMaterial({ map: texFromCanvas(glowCanvas()), color: C.fire, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  flame.position.copy(light.position);
  scene.add(flame);
  torches.push({ light, flame, base: 62, phase: Math.abs(x * 7 + z * 13) % 100 });
}

/* ═══════════════ Инициализация ═══════════════ */
export function init(canvas) {
  canvasEl = canvas;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(C.ink);
  scene.fog = new THREE.FogExp2(C.ink, 0.030);

  // Ambient держим низким осознанно: весь стиль строится на пятнах факельного света
  // и темноте между ними. Поднять его — и глубина сцены исчезает в равномерной заливке.
  ambient = new THREE.AmbientLight(C.cold1, 0.34);
  scene.add(ambient);

  buildDungeon();
  addTorch(-3.5, -2.2); addTorch(3.5, -2.2);
  addTorch(-3.5, 4.2);  addTorch(3.5, 4.2);

  // Холодный свет из проёма наверху лестницы: даёт героям читаемый силуэт
  // и единственную небо-голубую ноту в кадре, где всё остальное — огонь и гниль.
  stairLight = new THREE.PointLight(C.cold4, 90, 26, 2);
  stairLight.position.set(0, 6.5, -10.5);
  scene.add(stairLight);

  // Свечение самого некроманта — единственный зелёный источник в кадре
  necroLight = new THREE.PointLight(C.necro2, 60, 18, 2);
  necroLight.position.set(0, 2.2, 8.2);
  scene.add(necroLight);

  /* Некроманта на сцене НЕТ — он живёт в интерфейсе (решение 2026-08-11).
     Игрок не участник боя, а тот, через чью раму на этот бой смотрят. Побочно это
     снимает проблему, из-за которой билборд дважды переставляли: фигура в три метра
     у саркофага перекрывала на экране весь задний ряд нежити вместе с павшими.
     В сцене от него остаётся только зелёный свет над саркофагом. */

  /* Свет, который герои приносят с собой. Один сводный источник на всю партию,
     а не шесть точечных: шесть PointLight на мобильном профиле не окупаются, а
     разницы в кадре нет — важна суммарная яркость, а не её раскладка по головам.
     Цвет школы каждого героя несёт его личный огонёк (квад), а не этот источник.
     Висит на 3.6, а не на 2.4: вплотную к спрайтам он пересвечивал ближнего героя
     в белое пятно без деталей — v1 этим страдал на каждом кадре. */
  partyLight = new THREE.PointLight(C.cold4, 0, 24, 2);
  partyLight.position.set(0, 3.6, -2.5);
  scene.add(partyLight);

  glowTex = texFromCanvas(glowCanvas());
  bloodTex = texFromCanvas(bloodCanvas());
  shadowTex = texFromCanvas(shadowCanvas());

  // Общая геометрия мелочей: полосы тоньше v1 — толстые красные плиты над головами
  // были самым дешёвым на вид элементом кадра
  shadowGeo = new THREE.PlaneGeometry(UNIT_W * 0.95, UNIT_W * 0.62);
  glowGeo = new THREE.PlaneGeometry(2.0, 2.0);
  lampGeo = new THREE.PlaneGeometry(0.66, 0.66);
  barGeo = new THREE.PlaneGeometry(1.0, 0.07);
  particleGeo = new THREE.BoxGeometry(1, 1, 1);
  decalGeo = new THREE.PlaneGeometry(1.7, 1.7);
  decalMat = new THREE.MeshBasicMaterial({ map: bloodTex, transparent: true, opacity: 0.85, depthWrite: false });

  camera = new THREE.OrthographicCamera(-8, 8, 8, -8, 0.1, 100);
  scene.add(camera);

  // Виньетка висит на камере, поэтому не зависит ни от ракурса, ни от ориентации
  vignette = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: texFromCanvas(vignetteCanvas()), transparent: true, depthTest: false })
  );
  vignette.position.z = -1;
  vignette.renderOrder = 999;
  camera.add(vignette);
}

/* ═══════════════ Камера и размер ═══════════════ */
/* insets — сколько пикселей экрана занял интерфейс (сверху, снизу, справа). Раньше
   сдвиг пирамиды стоял константами 0.72/1.28 и 0.74/1.26, подобранными под одну
   раскладку: любая панель другой высоты немедленно наезжала на бой, а на 360×640
   под ней пряталось 13 юнитов из 14. Теперь бой кадрируется в тот прямоугольник,
   который интерфейс реально оставил. */
export function resize(w, h, insets = { top: 0, bottom: 0, left: 0, right: 0 }) {
  landscape = w > h * 1.15;
  const s = Math.max(1, Math.round(h / TARGET_BUFFER_H));   // только целый множитель
  renderer.setSize(Math.round(w / s), Math.round(h / s), false);
  canvasEl.style.width = w + 'px';
  canvasEl.style.height = h + 'px';

  if (landscape) {
    camera.position.set(14, 13, 0.5);          // смотрим сбоку: коридор ложится горизонтально
    camera.lookAt(0, 1.4, 0.5);
  } else {
    camera.position.set(1.2, 12, 13);          // смотрим вдоль коридора: герои сверху, нежить снизу
    camera.lookAt(0, 1.0, 0.8);
  }
  camHome.copy(camera.position);
  wallNear.visible = !landscape;
  columns.visible = !landscape;
  for (const m of nicheRight) m.visible = !landscape;
  for (const m of decorRight) m.visible = !landscape;

  /* Кадр смещаем несимметричной пирамидой, а не поворотом камеры. Считаем так:
     сначала берём прямоугольник экрана, свободный от интерфейса, и требуем, чтобы
     бой целиком поместился в него по высоте. Затем пирамиду раздуваем обратно на
     занятые интерфейсом поля — их содержимое уходит ПОД панели, а бой остаётся в
     свободной части. Никаких подобранных на глаз коэффициентов. */
  const freeW = Math.max(1, w - insets.left - insets.right);
  const freeH = Math.max(1, h - insets.top - insets.bottom);
  /* Габариты боя в мире. Строй занимает z от −3.5 до 3.5 плюс рост фигур, поэтому
     запрашиваем чуть больше: остальное — пол, стены и лестница, они и дают глубину.
     Числа подобраны так, чтобы в свободной области не оставалось пустой полосы пола. */
  const battleHalfH = landscape ? 4.2 : 5.6;      // половина высоты боя в мире
  /* Ширина здесь главнее высоты: замер показал, что крупность боя на всех проверенных
     экранах ограничивает именно она (строй по X занимает 6.3 мира при шести бойцах),
     и уменьшение высоты не давало ничего. Отсюда запас по ширине минимальный. */
  // 3.8 давало запас всего 0.15 мира при шести героях, и крайний боец упирался в
  // край кадра: строй по X — 6.3, плюс собственная ширина спрайта и полоса здоровья.
  const battleHalfW = landscape ? 7.6 : 4.1;
  // Мир-на-пиксель берём по более тесной оси свободного окна
  const unit = Math.min(freeH / (2 * battleHalfH), freeW / (2 * battleHalfW));
  const halfWorldW = w / 2 / unit, halfWorldH = h / 2 / unit;
  // Центр свободной области в пикселях относительно центра экрана
  const offX = (insets.left - insets.right) / 2 / unit;
  const offY = (insets.bottom - insets.top) / 2 / unit;
  camera.left = -halfWorldW - offX;
  camera.right = halfWorldW - offX;
  camera.top = halfWorldH - offY;
  camera.bottom = -halfWorldH - offY;
  camera.updateProjectionMatrix();

  // Квад виньетки растягивается ровно на пирамиду камеры
  vignette.scale.set(camera.right - camera.left, camera.top - camera.bottom, 1);
  vignette.position.set((camera.left + camera.right) / 2, (camera.top + camera.bottom) / 2, -1);
}

/* ═══════════════ Юниты ═══════════════ */
// Позиция считается по месту в строю, а не по номеру слота армии: слоты бывают
// разрежены (второй и четвёртый пусты), и по ним строй уехал бы вбок.
function unitPosition(side, row, index, count) {
  const z = ROW_Z[side][row];
  const x = (index - (count - 1) / 2) * SLOT_X;
  return { x, z };
}

function makeUnitView(u) {
  const group = new THREE.Group();

  const tone = u.school ? SCHOOLS[u.school].glow : C.noTint;

  // Пятно под ногами. Без него все фигуры висят над полом — самый заметный признак
  // дешёвой сцены и самый дешёвый в починке.
  const shadow = new THREE.Mesh(
    shadowGeo,
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.6, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  group.add(shadow);

  const glow = new THREE.Mesh(
    glowGeo,
    new THREE.MeshBasicMaterial({
      map: glowTex, color: tone,
      transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.02;
  group.add(glow);

  /* Огонёк, который герой несёт с собой. Он и есть право на акцент: самое яркое
     пятно кадра — то, что надо погасить. И он же сообщает школу героя, поэтому
     сам спрайт может остаться холодным, как того требует тезис. */
  let lamp = null;
  if (u.side === 'heroes') {
    lamp = new THREE.Mesh(
      lampGeo,
      new THREE.MeshBasicMaterial({
        map: glowTex, color: tone,
        transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    // Сбоку от тела, а не поверх: иначе аддитивное свечение съедает силуэт носителя
    lamp.position.set(0.62, UNIT_H * 0.55, 0.06);
    group.add(lamp);
  }

  const sprite = new THREE.Mesh(
    spriteGeo(u.sprite),
    new THREE.MeshLambertMaterial({
      map: spriteTex(u.sprite),
      transparent: true, alphaTest: 0.5, side: THREE.DoubleSide,
    })
  );
  sprite.position.y = UNIT_H / 2;
  sprite.userData.uid = u.uid;
  group.add(sprite);

  const barBg = new THREE.Mesh(
    barGeo,
    new THREE.MeshBasicMaterial({ color: C.stone0, depthTest: false, transparent: true })
  );
  barBg.position.y = UNIT_H + 0.22;
  barBg.renderOrder = 10;
  group.add(barBg);

  const barFill = new THREE.Mesh(
    barGeo,
    new THREE.MeshBasicMaterial({ color: u.side === 'undead' ? C.necro1 : C.blood2, depthTest: false, transparent: true })
  );
  barFill.position.y = UNIT_H + 0.22;
  barFill.renderOrder = 11;
  group.add(barFill);

  /* Масса по тиру: T3 и T4 крупнее — гача обязана быть видна на поле, а не только
     в цифрах. Мировая высота спрайта фиксированная, поэтому рост даёт масштаб группы. */
  const mass = u.tier ? 1 + 0.09 * (u.tier - 1) : 1;
  const base = mass * (u.champion ? 1.45 : 1);
  group.scale.setScalar(base);

  /* Аура чемпиона. Он вдвое крупнее и вдвое опаснее, но до сих пор отличался ТОЛЬКО
     размером — на глаз это читалось как «герой, стоящий ближе». Пульсирующее пятно
     под ногами делает из него событие, а право на акцент не нарушено: чемпион и есть
     то, что надо погасить. */
  let aura = null;
  if (u.champion) {
    aura = new THREE.Mesh(
      glowGeo,
      new THREE.MeshBasicMaterial({
        map: glowTex, color: C.blood2,
        transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    aura.rotation.x = -Math.PI / 2;
    aura.position.y = 0.015;
    aura.scale.setScalar(2.1);       // шире тени: пятно должно выходить за фигуру
    group.add(aura);
  }

  scene.add(group);
  return { group, sprite, glow, lamp, shadow, barBg, barFill, aura,
           frames: frameTexes(u.sprite), baseScale: base,
           lunge: 0, hurt: 0, born: 0.32, phase: (u.uid * 37) % 100 };
}

// Личные материалы юнита освобождаются здесь же; геометрия и текстуры общие, их не трогаем
function dropUnitView(uid, v) {
  scene.remove(v.group);
  for (const m of [v.shadow, v.glow, v.lamp, v.sprite, v.barBg, v.barFill, v.aura]) {
    if (m) m.material.dispose();
  }
  unitViews.delete(uid);
}

export function syncUnits(state) {
  const seen = new Set();
  for (const side of ['undead', 'heroes']) {
    const arr = state[side];
    arr.forEach((u, idx) => {
      seen.add(u.uid);
      let v = unitViews.get(u.uid);
      if (!v) { v = makeUnitView(u); unitViews.set(u.uid, v); }
      const p = unitPosition(u.side, u.row, idx, arr.length);
      v.group.position.set(p.x, 0, p.z);
      v.home = p;
    });
  }
  for (const [uid, v] of unitViews) {
    if (!seen.has(uid)) dropUnitView(uid, v);
  }
}

/* ═══════════════ Кровь, куски, пыль ═══════════════
   Спека: любой эффект крови обязан спрашивать GORE. Здесь это единственная развилка. */
function spawnBurst(pos, count, colorHex, big) {
  for (let i = 0; i < count; i++) {
    const size = big ? 0.12 + Math.random() * 0.16 : 0.06 + Math.random() * 0.07;
    // Геометрия у всех частиц одна, размер задаёт масштаб — на GPU не остаётся мусора
    const m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: colorHex }));
    m.scale.setScalar(size);
    m.position.copy(pos);
    scene.add(m);
    particles.push({
      mesh: m, life: 0.8 + Math.random() * 0.5,
      v: new THREE.Vector3((Math.random() - 0.5) * 3.2, 1.6 + Math.random() * 2.8, (Math.random() - 0.5) * 3.2),
    });
  }
}

function spawnHitFx(view) {
  const p = view.group.position.clone().setY(UNIT_H * 0.55);
  if (GORE) spawnBurst(p, 5, C.blood1, false);
  else spawnBurst(p, 4, C.stone3, false);
}

function spawnDeathFx(view, school) {
  const p = view.group.position.clone().setY(UNIT_H * 0.5);
  if (GORE) {
    spawnBurst(p, 14, C.blood1, true);
    const d = new THREE.Mesh(decalGeo, decalMat);   // геометрия и материал общие на все лужи
    d.rotation.x = -Math.PI / 2;
    d.rotation.z = Math.random() * Math.PI;
    d.position.set(view.group.position.x, 0.03, view.group.position.z);
    scene.add(d);
    decals.push(d);
    if (decals.length > 24) scene.remove(decals.shift());
  } else {
    spawnBurst(p, 12, school ? SCHOOLS[school].tint : C.stone3, false);
  }
}

/* Заклинания колоды различимы цветом школы: кнопок теперь до восьми, и без
   своего всплеска игрок не понял бы, какое из них сработало. Частицы над теми,
   на кого легло заклинание, а не над некромантом: важно, куда оно попало. */
const SPELL_FX = {
  wall:   { color: num(SCHOOL_RAMP.bone[2]), side: 'undead' },
  plague: { color: num(SCHOOL_RAMP.rot[2]),  side: 'heroes' },
  howl:   { color: num(SCHOOL_RAMP.soul[2]), side: 'heroes' },
  curse:  { color: num(SCHOOL_RAMP.dust[2]), side: 'heroes' },
  drain:  { color: num(SCHOOL_RAMP.dust[2]), side: 'target' },
};

function spellFx(state, id, targetUid) {
  const fx = SPELL_FX[id];
  if (!fx) return;                                   // bolt, rise, frenzy — как раньше
  const burstOver = uid => {
    const v = unitViews.get(uid);
    if (v) spawnBurst(v.group.position.clone().setY(UNIT_H * 0.7), 6, fx.color, false);
  };
  if (fx.side === 'target') { if (targetUid != null) burstOver(targetUid); return; }
  for (const u of state[fx.side]) if (u.alive) burstOver(u.uid);
}

/* ═══════════════ Движение покоя ═══════════════
   Четыре вещи шевелятся, когда игрок ничего не делает, и все с разной частотой:
   жаровни (0.21 и 0.07), пульс саркофага (0.05), капли со свода (по счётчику) и
   пар над свежими трупами. Совпади частоты — сцена начнёт «дышать» целиком и
   станет выглядеть дешевле неподвижной. */
let dripTimer = 0, vaporTimer = 0, sparkTimer = 0, moteTimer = 0;

/* Искры над жаровнями и пылинки в свете. Пятая и шестая «вещи покоя» — и самые
   выгодные: неподвижный источник света читается как нарисованный, а поднимающаяся
   искра сообщает, что огонь живой. Частоты снова свои (0.13 и 0.9 секунды), чтобы
   сцена не задышала целиком в одном ритме. */
function stepAmbientFx(dt) {
  sparkTimer -= dt;
  if (sparkTimer <= 0 && torches.length) {
    sparkTimer = 0.13;
    const t = torches[frameCount % torches.length];
    const m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: C.fire, transparent: true }));
    m.scale.setScalar(0.05 + Math.random() * 0.04);
    m.position.set(t.flame.position.x + (Math.random() - 0.5) * 0.3, t.flame.position.y + 0.1,
                   t.flame.position.z + (Math.random() - 0.5) * 0.3);
    scene.add(m);
    // Искра всплывает и гаснет: float-частица не падает и тает по прозрачности
    particles.push({ mesh: m, life: 0.5 + Math.random() * 0.6,
                     v: new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.9 + Math.random() * 0.7, (Math.random() - 0.5) * 0.4),
                     float: true });
  }

  moteTimer -= dt;
  if (moteTimer <= 0) {
    moteTimer = 0.9;
    const m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: C.stone3, transparent: true, opacity: 0.4 }));
    m.scale.setScalar(0.04);
    m.position.set((Math.random() - 0.5) * 7, 0.6 + Math.random() * 2.6, (Math.random() - 0.5) * 18);
    scene.add(m);
    particles.push({ mesh: m, life: 2.6, v: new THREE.Vector3(0, 0.16, 0), float: true });
  }
}

function stepIdleMotion(state, dt) {
  dripTimer -= dt;
  if (dripTimer <= 0) {
    dripTimer = 0.6 + (frameCount % 11) * 0.13;
    const x = ((frameCount * 37) % 70) / 10 - 3.5;
    const z = ((frameCount * 53) % 160) / 10 - 8;
    const m = new THREE.Mesh(particleGeo, new THREE.MeshBasicMaterial({ color: C.cold1 }));
    m.scale.set(0.05, 0.16, 0.05);
    m.position.set(x, 4.6, z);
    scene.add(m);
    particles.push({ mesh: m, life: 1.4, v: new THREE.Vector3(0, -0.6, 0) });
  }

  // Пар поднимается только над СВЕЖИМИ трупами — над теми, кто пал в текущей партии
  vaporTimer -= dt;
  if (vaporTimer <= 0) {
    vaporTimer = 0.5;
    const fallen = [...state.undead, ...state.heroes].filter(u => !u.alive);
    if (fallen.length) {
      const u = fallen[frameCount % fallen.length];
      const v = unitViews.get(u.uid);
      if (v) {
        const m = new THREE.Mesh(
          particleGeo,
          new THREE.MeshBasicMaterial({ color: C.stone3, transparent: true, opacity: 0.5 })
        );
        m.scale.setScalar(0.09);
        m.position.set(v.group.position.x + (Math.sin(frameCount) * 0.3), 0.15, v.group.position.z);
        scene.add(m);
        particles.push({ mesh: m, life: 1.8, v: new THREE.Vector3(0, 0.42, 0), float: true });
      }
    }
  }
}

function stepParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.float) {                                   // пар не падает, а всплывает и тает
      p.mesh.position.addScaledVector(p.v, dt);
      p.mesh.material.opacity = Math.max(0, p.life * 0.28);
    } else {
      p.v.y -= 9 * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.v.set(0, 0, 0); }
    }
    // Геометрия общая — освобождается только личный материал
    if (p.life <= 0) { scene.remove(p.mesh); p.mesh.material.dispose(); particles.splice(i, 1); }
  }
}

/* ═══════════════ Кадр ═══════════════ */
export function frame(state, events, dt) {
  frameCount++;

  // Урон заклинания приходит отдельным событием раньше объявления {type:'spell', id},
  // а у объявления цели нет — «Иссушению» цель берём из последнего удара заклинанием
  let spellTarget = null;
  for (const e of events) {
    if (e.type === 'spell' && e.id) {
      spellFx(state, e.id, spellTarget);
      flash = 0.35; necroCast = 0.5; shake = Math.max(shake, e.id === 'howl' ? 0.25 : 0.16);
      spellTarget = null;
    } else if (e.type === 'hit' || e.type === 'splash' || e.type === 'spell' || e.type === 'thorns' || e.type === 'blast') {
      if (e.type === 'spell') spellTarget = e.to;
      const v = e.to != null ? unitViews.get(e.to) : null;
      if (v) { v.hurt = 0.16; spawnHitFx(v); }
      const a = e.from != null ? unitViews.get(e.from) : null;
      if (a) a.lunge = 0.18;
      /* Преимущество круга школ — видимое событие, а не строка в таблице. Удар со
         множителем 1.3 добавляет искры цвета школы атакующего: игрок читает, что состав
         армии подобран верно, ни на что не нажимая. Раньше круг был невидим целиком. */
      if (v && e.mod > 1.1) {
        spawnBurst(v.group.position.clone().setY(UNIT_H * 0.6), 4,
                   e.school && SCHOOLS[e.school] ? SCHOOLS[e.school].glow : C.necro2, false);
        shake = Math.max(shake, 0.06);
      }
      if (e.type === 'spell') { flash = 0.35; necroCast = 0.5; shake = Math.max(shake, 0.16); }
    } else if (e.type === 'death') {
      const v = unitViews.get(e.uid);
      if (v) spawnDeathFx(v, e.school);
      // Падение чемпиона обязано ощущаться: он был вдвое крупнее и вдвое дольше стоял
      if (v && v.aura) shake = Math.max(shake, 0.3);
    } else if (e.type === 'rise') {
      const v = unitViews.get(e.uid);
      if (v) { spawnBurst(v.group.position.clone().setY(0.4), 16, C.necro2, false); flash = 0.3; necroCast = 0.5; }
    } else if (e.type === 'heal') {
      const v = unitViews.get(e.uid);
      if (v) spawnBurst(v.group.position.clone().setY(1.0), 4, C.necro1, false);
    }
  }

  // Мерцание факелов — по счётчику кадров, без плавных синусоид на каждый пиксель
  torches.forEach((t, i) => {
    const n = Math.sin((frameCount + t.phase) * 0.21 + i) * 0.5 + Math.sin((frameCount + t.phase) * 0.07) * 0.5;
    t.light.intensity = t.base * (0.78 + n * 0.22);
    t.flame.scale.setScalar(0.9 + n * 0.18);
  });
  /* ГЛАВНОЕ МЕСТО ТЕЗИСА. Доля живых героев правит светом всей комнаты: пока их много,
     зал залит чужим холодом; каждая смерть гасит часть этого света, и в конце боя
     комната падает в твой зелёный. Победа читается как «мир стал твоего цвета». */
  const totalHeroes = state.heroes.length || 1;
  const aliveHeroes = state.heroes.filter(h => h.alive).length;
  const foreign = aliveHeroes / totalHeroes;

  /* Свет партии считан, а не подобран на глаз. При decay 2 освещённость равна I/d²;
     источник висит в 2.67 м от центра спрайта, и прежние 96 давали 13.5 против 1.79
     от факела — в семь раз ярче, отсюда чемпион выгорал в белое пятно без деталей.
     Двадцать даёт 2.8: герой по-прежнему самое яркое в кадре (право на акцент), но
     остаётся фигурой, а не силуэтом. */
  partyLight.intensity = aliveHeroes ? 6 + aliveHeroes * 3.5 : 0;
  if (aliveHeroes) {
    let cx = 0, cz = 0;
    for (const h of state.heroes) if (h.alive) { const v = unitViews.get(h.uid); if (v) { cx += v.group.position.x; cz += v.group.position.z; } }
    partyLight.position.set(cx / aliveHeroes, 2.4, cz / aliveHeroes);
  }

  ambient.color.copy(NECRO_TONE).lerp(COLD_TONE, foreign);
  necroLight.intensity = (60 + (1 - foreign) * 80) + Math.sin(frameCount * 0.05) * 12;
  // Щель саркофага дышит той же частотой, что и его свет — это один организм
  if (sarcSeam) sarcSeam.material.opacity = 0.62 + (1 - foreign) * 0.2 + Math.sin(frameCount * 0.05) * 0.16;
  if (flash > 0) { flash = Math.max(0, flash - dt * 2); }
  ambient.intensity = 0.20 + (1 - foreign) * 0.14 + flash * 2.0;

  necroCast = Math.max(0, necroCast - dt);   // читается и интерфейсом (лицо в шапке)

  /* Некромант дышит, а на касте вскидывается: подаётся вверх и вперёд к бою. Декор
     и фигура смотрят в камеру, как юниты, — иначе в альбоме они видны ребром. */
  if (necroFig) {
    const cast = necroCast / 0.5;
    necroFig.position.y = NECRO_H / 2 + Math.sin(frameCount * 0.06) * 0.04 + cast * 0.25;
    necroFig.position.z = NECRO_Z - cast * 0.35;
    necroFig.scale.setScalar(1 + cast * 0.08);
    necroFig.quaternion.copy(camera.quaternion);
  }
  for (const m of decorViews) m.quaternion.copy(camera.quaternion);

  /* Виньетка сгущается, когда армия тает. Это не украшение и не индикатор: в идле
     игрок смотрит на сцену, а не на полоски, и «дела плохи» обязано быть видно самой
     картинкой. Края темнеют — кадр сжимается вокруг остатков строя. */
  const aliveUndead = state.undead.filter(u => u.alive).length;
  const undeadShare = aliveUndead / (state.undead.length || 1);
  // Базовая прозрачность 0.85, а не 1: запас нужен, чтобы виньетке было куда сгущаться.
  // Выше единицы уходить нельзя — альфа просто перенасыщается без видимого эффекта.
  vignette.material.opacity = Math.min(1, 0.85 + Math.max(0, 0.45 - undeadShare) * 0.34);

  const camQ = camera.quaternion;
  for (const side of ['undead', 'heroes']) {
    const arr = state[side];
    arr.forEach(u => {
      const v = unitViews.get(u.uid);
      if (!v) return;

      /* Павшие НЕ исчезают, а заваливаются набок и темнеют.
         Пока они пропадали, поле после боя выглядело пустым, а «Восстать!» — сломанным:
         поднимать было нечего видеть, хотя механика отрабатывала верно. */
      if (!u.alive) {
        v.group.visible = true;
        // Масштаб мог остаться сжатым от выпада, в котором юнита и убили
        v.group.scale.setScalar(v.baseScale);
        // Плашмя на пол, а не набок: при взгляде сверху лежащий спрайт виден целиком
        // и читается однозначно, а завалившийся вбок — почти как стоящий.
        v.sprite.rotation.set(-Math.PI / 2, 0, u.side === 'undead' ? 0 : Math.PI);
        v.sprite.position.y = 0.06;
        v.sprite.renderOrder = 2;
        v.sprite.material.color.setHex(u.side === 'undead' ? (SCHOOLS[u.school] ? SCHOOLS[u.school].dim : C.stone0) : C.cold1);
        v.barBg.visible = v.barFill.visible = false;
        v.group.position.y = 0;
        if (v.lamp) v.lamp.material.opacity = 0;   // герой умер — его огонёк погас
        /* Под павшей нежитью пульсирует свечение её школы. Это не украшение:
           тёмный силуэт плашмя на буром полу теряется целиком, а игрок обязан видеть,
           есть ли у «Восстать!» цель. У героев такой метки нет — их не поднять. */
        if (u.side === 'undead') {
          const pulse = 0.34 + Math.sin(frameCount * 0.09) * 0.16;
          v.glow.material.opacity = pulse;
          v.glow.scale.setScalar(1.15);
        } else {
          v.glow.material.opacity = 0;
        }
        return;
      }
      v.glow.scale.setScalar(1);
      /* Право на акцент: светится ТОЛЬКО живой герой. Своя нежить приглушена намеренно —
         иначе кадр превращается в равномерную гирлянду и глаз не находит цель. */
      v.glow.material.opacity = u.side === 'heroes' ? 0.5 : 0;
      if (v.lamp) {
        v.lamp.quaternion.copy(camQ);
        v.lamp.material.opacity = 0.58 + Math.sin((frameCount + u.uid * 17) * 0.11) * 0.16;
      }
      v.sprite.position.y = UNIT_H / 2;
      v.sprite.renderOrder = 0;

      v.sprite.quaternion.copy(camQ);
      v.barBg.quaternion.copy(camQ);
      v.barFill.quaternion.copy(camQ);

      // Выпад в сторону противника при ударе
      v.lunge = Math.max(0, v.lunge - dt);
      const dir = side === 'undead' ? -1 : 1;
      const bob = Math.sin((frameCount + u.uid * 9) * 0.08) * 0.045;
      v.group.position.z = v.home.z + dir * v.lunge * 3.2;
      v.group.position.y = bob;

      /* Кадр анимации. Замах — пока юнит в выпаде, иначе покой и вдох попеременно.
         Фаза своя у каждого (uid), чтобы строй не дышал синхронно, как один организм. */
      const frame = v.lunge > 0.05 ? 2 : (Math.floor((frameCount + v.phase) / 26) % 2);
      const tex = v.frames[frame];
      /* Только присваивание, БЕЗ needsUpdate. Флаг заставляет three пересобирать
         программу шейдера, и на восьми юнитах это стоило 12 мс на кадр против 0.9 —
         замерено. Смена одной готовой текстуры на другую пересборки не требует. */
      if (v.sprite.material.map !== tex) v.sprite.material.map = tex;

      v.hurt = Math.max(0, v.hurt - dt);
      /* Удар — ВСПЫШКА ИЗНУТРИ, а не перекраска. Умножение цвета на кровяной
         (так было) заливало фигуру плоским красным и съедало весь рисунок: приём из
         игр, где спрайт мигал целиком. Эмиссия сохраняет детали и укладывается в тезис
         («нежить светится изнутри»), а тёплый тон читается как попадание. */
      v.sprite.material.emissive.setHex(v.hurt > 0 ? C.blood1 : 0x000000);
      // Дрожь от боли: сдвиг вбок на пиксель мира. Тинт один читается как смена палитры,
      // а не как удар — вместе они дают чувство попадания.
      if (v.hurt > 0) v.group.position.x = v.home.x + (v.hurt > 0.08 ? 0.06 : -0.06);
      else v.group.position.x = v.home.x;

      /* Появление: новичок вырастает из пола за треть секунды. Посмертный спавн громилы
         иначе возникает готовой фигурой посреди кадра — читается как сбой рендера. */
      if (v.born > 0) {
        v.born = Math.max(0, v.born - dt);
        const t = 1 - v.born / 0.32;
        v.group.scale.setScalar(v.baseScale * (0.4 + 0.6 * t));
      } else {
        // Squash на пике выпада: масса подаётся вперёд и слегка приседает
        const sq = v.lunge > 0 ? v.lunge * 0.5 : 0;
        v.group.scale.set(v.baseScale * (1 + sq), v.baseScale * (1 - sq * 0.7), v.baseScale);
      }

      // Полоса видна только у раненых: целая армия не носит над головой красные плиты
      const frac = Math.max(0, u.hp / u.maxHp);
      v.barBg.visible = v.barFill.visible = frac < 0.999;
      v.barFill.scale.x = frac;
      v.barFill.position.x = -(1 - frac) * 0.5;
      // Цвет полосы падает вместе с здоровьем: «кто вот-вот умрёт» видно без чтения цифр
      v.barFill.material.color.setHex(
        u.side === 'undead' ? (frac > 0.35 ? C.necro1 : C.fire) : (frac > 0.35 ? C.blood2 : C.blood1));
      if (v.aura) v.aura.material.opacity = 0.45 + Math.sin(frameCount * 0.07) * 0.18;
      // Свечение здесь НЕ трогаем: им распоряжается право на акцент выше по функции
    });
  }

  stepIdleMotion(state, dt);
  stepAmbientFx(dt);
  stepParticles(dt);

  // Тряска гаснет быстро и всегда возвращает камеру домой — иначе кадр уползёт
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.6);
    camera.position.set(
      camHome.x + (Math.random() - 0.5) * shake,
      camHome.y + (Math.random() - 0.5) * shake,
      camHome.z + (Math.random() - 0.5) * shake);
  } else if (!camera.position.equals(camHome)) {
    camera.position.copy(camHome);
  }

  renderer.render(scene, camera);
}

/* ═══════════════ Глубина ═══════════════
   Два следствия тезиса, которых до сих пор не было в коде, хотя они прописаны в
   palette.js: «чем глубже, тем меньше верхнего света доходит» и «память подземелья:
   кости копятся по ярусам». Обе стоят десяти строк и дают ощущение спуска — то, чего
   в игре про углубление подземелья не хватало сильнее всего.

   Свет с лестницы гаснет к ярусу 12 до пятой части: бой всё больше идёт в твоих цветах.
   Кости добавляются по горсти на ярус и остаются навсегда — их пределом стоит потолок
   объектов сцены, чтобы длинный забег не превратился в свалку. */
let depthShown = 0;
export function setDepth(tier) {
  if (!stairLight) return;
  stairLight.intensity = Math.max(18, 90 * Math.pow(0.88, tier - 1));
  // Кости добавляются один раз на ярус, а не на каждую партию
  if (tier <= depthShown) return;
  depthShown = tier;
  let s = 7717 + tier * 131;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 6; i++) {
    const edge = rnd();
    const x = (rnd() < 0.5 ? -1 : 1) * (1.9 + edge * edge * 2.0);
    const w = 0.12 + rnd() * 0.2;
    addDebrisPiece(x, -11 + rnd() * 22, w, w * (0.3 + rnd() * 0.7), rnd() * Math.PI, true);
  }
}

/* ═══════════════ Попадание тапа ═══════════════
   В 2.5D это уже настоящий raycast, а не проверка прямоугольников.
   Именно этот вызов не даст ui.js сломаться при переходе на полноценное 3D. */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
export function pick(x, y) {
  const r = canvasEl.getBoundingClientRect();
  ndc.x = ((x - r.left) / r.width) * 2 - 1;
  ndc.y = -((y - r.top) / r.height) * 2 + 1;
  ray.setFromCamera(ndc, camera);
  const meshes = [...unitViews.values()].filter(v => v.group.visible).map(v => v.sprite);
  const hit = ray.intersectObjects(meshes, false)[0];
  return hit ? hit.object.userData.uid : null;
}

// Счётчик живого в сцене: частицы и декали добавляются напрямую, и проверить их
// иначе нечем — заодно ловит утечку, если dispose где-то перестанет вызываться
export function debugScene() {
  const r = renderer.info.render;
  return { объектов_в_сцене: scene.children.length, частиц: particles.length,
           лужи: decals.length, видов: unitViews.size,
           текстур_кадров: frameTexCache.size, тряска: +shake.toFixed(2),
           // Вызовы рисования и программы шейдеров: рост программ по ходу боя означает,
           // что материалы пересобираются — самая дорогая ошибка в этом рендере
           вызовов_на_кадр: r.calls, треугольников: r.triangles,
           программ: renderer.info.programs ? renderer.info.programs.length : -1,
           текстур_в_памяти: renderer.info.memory.textures,
           геометрий: renderer.info.memory.geometries };
}

/* Замер раскладки: где юниты и саркофаг оказываются НА ЭКРАНЕ. Иначе перекрытие боя
   интерфейсом проверяется на глаз, а глаз проверяет одно разрешение из десяти. */
export function debugLayout() {
  const r = canvasEl.getBoundingClientRect();
  const toScreen = (v3) => {
    const p = v3.clone().project(camera);
    return { x: Math.round((p.x * 0.5 + 0.5) * r.width), y: Math.round((-p.y * 0.5 + 0.5) * r.height) };
  };
  const items = [];
  for (const [uid, v] of unitViews) {
    const foot = toScreen(v.group.position.clone());
    const head = toScreen(v.group.position.clone().setY(UNIT_H * v.baseScale));
    items.push({ uid, x: foot.x, top: head.y, bottom: foot.y });
  }
  return { экран: { w: Math.round(r.width), h: Math.round(r.height) }, юниты: items,
           саркофаг: toScreen(new THREE.Vector3(0, 1.2, 7.6)),
           лестница: toScreen(new THREE.Vector3(0, 1.0, -7.5)) };
}

// Отладочный зонд: что на самом деле происходит с объектом юнита в сцене
export function debugUnit(uid) {
  const v = unitViews.get(uid);
  if (!v) return { есть_вид: false, всего_видов: unitViews.size };
  return {
    есть_вид: true,
    группа_видима: v.group.visible,
    в_сцене: !!v.group.parent,
    позиция_группы: v.group.position.toArray().map(n => +n.toFixed(2)),
    поворот_спрайта: v.sprite.rotation.toArray().slice(0, 3).map(n => +n.toFixed(2)),
    y_спрайта: +v.sprite.position.y.toFixed(2),
    цвет: '#' + v.sprite.material.color.getHexString(),
  };
}

// Интерфейс спрашивает, был ли только что каст: некромант реагирует уже там
export function castPulse() { return necroCast; }

export function clearDecals() {
  for (const d of decals) scene.remove(d);
  decals.length = 0;
}
