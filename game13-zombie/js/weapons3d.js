// Модели оружия в руках и на земле (v2.1).
// Пистолет и револьвер собраны кодом в PS1-духе (в PSX-паках пистолетов нет, а бластер Quaternius
// выбивался из стиля). Автомат, дробовик, мачете, бита, топор — из PSX-пака предметов (env_items).
// Каждая модель приводится к общему виду: ствол/лезвие смотрит в −z, рукоять внизу (−y), точка хвата в начале координат.
import * as THREE from 'three';
import { Assets, makeMesh, styleMaterial } from './assets.js';

// key — шаблон; len — длина модели, м; fz/fy — развернуть по длине/по высоте; grip — где хват по длине (0 — у заднего конца, 1 — у дула)
export const WMODEL = {
  pistol:   { proc: 'pistol', len: 0.21, grip: 0.25 },
  revolver: { proc: 'revolver', len: 0.27, grip: 0.2 },
  smg:      { key: 'w_smg', len: 0.5, grip: 0.45 },
  rifle:    { key: 'env_items:automatic_rifle', len: 0.92, grip: 0.42, fz: true },
  sniper:   { key: 'env_items:automatic_rifle', len: 1.12, grip: 0.38, scope: true, fz: true },
  shotgun:  { key: 'env_items:shotgun', len: 0.98, grip: 0.3, fz: true },
  knife:    { proc: 'knife', len: 0.3, grip: 0.3 },
  machete:  { key: 'env_items:machette', len: 0.6, grip: 0.12 },
  crowbar:  { key: 'env_items:crowbar', len: 0.75, grip: 0.1 },
  bat:      { key: 'env_items:bat', len: 0.86, grip: 0.08 },
  axe:      { key: 'env_items:axe', len: 0.82, grip: 0.1 },
  chainsaw: { key: 'env_x_street:chainsaw_psx_glb', len: 0.95, grip: 0.2, fz: true }, // только у культистов (PSX Chainsaw)
  grenade:  { key: 'w_grenade', len: 0.12, grip: 0.5 },
  molotov:  { key: 'w_molotov', len: 0.26, grip: 0.3 },
};

// Как держать (одна таблица на всё оружие):
//  stock  — приклад в плечо: рукоять ставится от плеча вперёд на длину приклада
//  aimK / readyK — насколько вытянута правая рука в прицеле / наготове (доля длины руки), readyDrop — наготове ниже груди
//  left   — где левая рука вдоль ствола от рукояти (м); 0 — подхват под правой кистью
//  fingK  — холодное: клинок вперёд (0) или вдоль пальцев вниз (1)
export const WHOLD = {
  pistol:   { aimK: 0.95, readyK: 0.9, readyDrop: 0.2, left: 0 },
  revolver: { aimK: 0.95, readyK: 0.9, readyDrop: 0.2, left: 0 },
  smg:      { aimK: 0.8, readyK: 0.75, readyDrop: 0.15, left: 0.2 },
  rifle:    { stock: true, left: 0.3 },
  sniper:   { stock: true, left: 0.36 },
  shotgun:  { stock: true, left: 0.42 },
  knife:    { fingK: 0.15 },
  machete:  { fingK: 0.35 },
  bat:      { fingK: 0.55 },
  crowbar:  { fingK: 1.6 }, // висит почти вдоль ноги, крюком вниз (при 0.5 торчала вперёд перед телом)
  axe:      { fingK: 0.55 },
  chainsaw: { fingK: 0.1 },
  grenade:  { fingK: 0.3 },
  molotov:  { fingK: 0.3 },
};

const cache = {};
let gunMat = null, gripMat = null, woodMat = null;
function mats() {
  if (gunMat) return;
  gunMat = styleMaterial(new THREE.MeshLambertMaterial({ color: 0x3c4047 }));
  gripMat = styleMaterial(new THREE.MeshLambertMaterial({ color: 0x1b1a19 }));
  woodMat = styleMaterial(new THREE.MeshLambertMaterial({ color: 0x5a3a24 }));
}

// коробка: размеры и центр в метрах, ствол по −z
function bx(g, m, w, h, d, x, y, z, rx = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true;
  g.add(b);
}

function procPistol() {
  mats();
  const g = new THREE.Group();
  bx(g, gunMat, 0.03, 0.034, 0.19, 0, 0.03, -0.05);            // затвор
  bx(g, gunMat, 0.026, 0.02, 0.16, 0, 0.006, -0.045);          // рамка
  bx(g, gripMat, 0.028, 0.1, 0.042, 0, -0.045, 0.02, 0.22);    // рукоять с наклоном
  bx(g, gunMat, 0.006, 0.018, 0.03, 0, -0.012, -0.03);         // спуск
  bx(g, gunMat, 0.012, 0.012, 0.012, 0, 0.003, -0.15);         // дуло
  return g;
}
function procKnife() {
  mats();
  const g = new THREE.Group();
  bx(g, gripMat, 0.025, 0.03, 0.11, 0, 0, 0.03);              // рукоять
  bx(g, gunMat, 0.05, 0.035, 0.012, 0, 0.002, -0.025);        // гарда
  const blade = styleMaterial(new THREE.MeshLambertMaterial({ color: 0x9aa0a8 }));
  bx(g, blade, 0.006, 0.028, 0.17, 0, 0.004, -0.115);         // клинок
  return g;
}
function procRevolver() {
  mats();
  const g = new THREE.Group();
  bx(g, gunMat, 0.022, 0.024, 0.17, 0, 0.032, -0.1);           // ствол
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.045, 8), gunMat);
  cyl.rotation.x = Math.PI / 2; cyl.position.set(0, 0.022, -0.005); g.add(cyl);
  bx(g, gunMat, 0.022, 0.03, 0.06, 0, 0.012, 0.03);            // рамка
  bx(g, woodMat, 0.026, 0.09, 0.04, 0, -0.04, 0.05, 0.35);     // деревянная рукоять
  bx(g, gunMat, 0.006, 0.016, 0.02, 0, -0.008, 0.012);
  return g;
}

// сцена шаблона → группа в общем виде
function fromTemplate(o) {
  const t = Assets.tpl[o.key];
  if (!t) return null;
  const m = makeMesh(o.key, { shadow: true });
  const sz = t.size.toArray(), c = t.box.getCenter(new THREE.Vector3()).toArray();
  const L = sz.indexOf(Math.max(...sz));
  const rest = [0, 1, 2].filter(i => i !== L);
  const H = sz[rest[0]] >= sz[rest[1]] ? rest[0] : rest[1];
  // базис: длинная ось → z, высота → y
  const ax = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
  const zA = ax[L].clone().multiplyScalar(o.fz ? 1 : -1), yA = ax[H].clone().multiplyScalar(o.fy ? -1 : 1);
  const xA = new THREE.Vector3().crossVectors(yA, zA);
  const basis = new THREE.Matrix4().makeBasis(xA, yA, zA).invert();
  const s = o.len / sz[L];
  const inner = new THREE.Group();
  m.position.set(-c[0], -c[1], -c[2]);
  inner.add(m);
  inner.applyMatrix4(basis);
  inner.scale.multiplyScalar(s);
  inner.position.multiplyScalar(s);
  // хват: от центра сдвигаем к заднему концу (по +z)
  const outer = new THREE.Group();
  inner.position.z += (o.grip - 0.5) * o.len;
  outer.add(inner);
  return outer;
}

// Оружие в руке, поставленное в мире каждый кадр: рукоять в ладони, клинок/ствол — вперёд по телу
// и немного вдоль пальцев (fingK: 0 — строго вперёд, как у пистолета; ~0.6 — клинок вперёд-вниз у опущенной руки,
// при замахе клинок идёт за кистью). Оси кисти у разных скелетов разные, поэтому поворот к кисти не привязываем.
const _hp = new THREE.Vector3(), _hq = new THREE.Quaternion(), _hf = new THREE.Vector3(), _hd = new THREE.Vector3();
const _hx = new THREE.Vector3(), _hy = new THREE.Vector3(), _hz = new THREE.Vector3(), _hm = new THREE.Matrix4(), _hu = new THREE.Vector3(0, 1, 0);
export function poseHeld(m, hand, fwdX, fwdZ, fingK = 0.6) {
  hand.getWorldPosition(_hp); hand.getWorldQuaternion(_hq);
  const fing = _hf.set(0, 1, 0).applyQuaternion(_hq);
  _hp.addScaledVector(fing, 0.07);
  const blade = _hd.set(fwdX, 0, fwdZ).multiplyScalar(1).addScaledVector(fing, fingK).normalize();
  _hz.copy(blade).negate();
  _hx.crossVectors(_hu, _hz); if (_hx.lengthSq() < 1e-6) _hx.set(1, 0, 0); _hx.normalize();
  _hy.crossVectors(_hz, _hx);
  m.quaternion.setFromRotationMatrix(_hm.makeBasis(_hx, _hy, _hz));
  m.position.copy(_hp);
}

// новая модель оружия по id (или null)
export function weaponModel(id) {
  const o = WMODEL[id];
  if (!o) return null;
  let g;
  if (o.proc === 'pistol') g = procPistol();
  else if (o.proc === 'revolver') g = procRevolver();
  else if (o.proc === 'knife') g = procKnife();
  else g = fromTemplate(o);
  if (!g) return null;
  if (o.scope) { mats(); bx(g, gunMat, 0.04, 0.04, 0.26, 0, 0.09, -0.12); }
  return g;
}
