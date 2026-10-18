// Паки окружения PSX (assets/env/*.glb, собирает tools/convert.html): один GLB на пак, деталь — узел верхнего уровня.
// Детали приводятся к общему виду: центр по x/z в нуле, низ на y=0. Модули домов (env_building) — исключение:
// у них опора в углу (плоскость 2×2 м, x=0, z от −2 до 0, нормаль +x), по ней собираются фасады.
// Материалы переводятся в Lambert со стилем игры (обесцвечивание, PS1-дрожание) — как остальной мир.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { toLambert, Assets, bakeTemplate } from './assets.js';

export const Env = { pieces: {}, index: {} };
const PIVOT = { env_building: true };          // не центрировать
const DOUBLE = { env_building: true, env_camp: true }; // одиночные плоскости видны с обеих сторон
const matCache = new Map();

export async function loadEnvPacks(names, base = '', onTexture) {
  const loader = new GLTFLoader();
  await Promise.all(names.map(async name => {
    const g = await loader.loadAsync(base + 'assets/env/' + name + '.glb');
    const root = g.scene.children.length === 1 && g.scene.children[0].children.length ? g.scene.children[0] : g.scene;
    for (const p of [...root.children]) {
      p.updateMatrixWorld(true);
      p.traverse(o => {
        if (!o.isMesh) return;
        const conv = m => {
          if (!matCache.has(m.uuid)) {
            const lm = toLambert(m);
            if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.minFilter = THREE.NearestMipmapNearestFilter; if (onTexture) onTexture(m.map); }
            if (DOUBLE[name]) lm.side = THREE.DoubleSide;
            if (m.alphaTest) { lm.alphaTest = m.alphaTest; lm.side = THREE.DoubleSide; }
            matCache.set(m.uuid, lm);
          }
          return matCache.get(m.uuid);
        };
        o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
        o.castShadow = true; o.receiveShadow = true;
      });
      const box = new THREE.Box3().setFromObject(p);
      const holder = new THREE.Group();
      holder.add(p);
      if (!PIVOT[name] && !box.isEmpty()) {
        const c = box.getCenter(new THREE.Vector3());
        p.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
      }
      const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
      Env.pieces[name + ':' + p.name] = { obj: holder, size };
    }
  }));
}

// ---------- для игры: детали → шаблоны Assets.tpl (их расставляет World пакетами BatchedMesh) ----------
// масштаб пака к метрам: интерьер Bolillo и деревья в сантиметрах
export const PACK_SCALE = { env_interior: 0.01, env_trees: 0.01 };
const SOLID_TEX = { env_x_rocks: true };
const PLANAR = { env_building: true, env_urban_building_parts: true, env_camp: true, env_urban_fences: true, env_urban_buildings_prebuild: true };
export async function bakeEnv(names, base = '', onProgress) {
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all(names.map(async name => {
    let g;
    try { g = await loader.loadAsync(base + 'assets/env/' + name + '.glb'); }
    catch (e) { console.warn('env fail', name, e && e.message); return; }
    const root = g.scene.children.length === 1 && g.scene.children[0].children.length ? g.scene.children[0] : g.scene;
    const k = PACK_SCALE[name] || 1;
    for (const p of [...root.children]) {
      p.traverse(o => {
        if (!o.isMesh) return;
        for (const m of [].concat(o.material)) {
          if (PLANAR[name]) m.side = THREE.DoubleSide;
          if (SOLID_TEX[name]) m.alphaTest = 0; // у текстуры камней альфа случайная: конвертер принял её за прозрачность
          if (m.map && m.alphaTest) m.side = THREE.DoubleSide;
        }
      });
      const holder = new THREE.Group();
      holder.add(p);
      holder.scale.setScalar(k);
      holder.updateMatrixWorld(true);
      if (!PIVOT[name]) {
        // внешние паки (env_x_): рамка по вершинам, а не по повёрнутой рамке геометрии, иначе низ уходит и деталь висит
        const box = new THREE.Box3().setFromObject(holder, name.startsWith('env_x_'));
        if (!box.isEmpty()) {
          const c = box.getCenter(new THREE.Vector3());
          p.position.x -= c.x / k; p.position.z -= c.z / k; p.position.y -= box.min.y / k;
        }
      }
      bakeTemplate(name + ':' + p.name, holder, 'env');
    }
    done++;
    if (onProgress) onProgress(done / names.length);
  }));
}

// копия детали (геометрия и материалы общие). fitH — высота в метрах, fitL — длинная сторона в метрах
export function envClone(id, o = {}) {
  const p = Env.pieces[id];
  if (!p) { console.warn('нет детали', id); return new THREE.Group(); }
  const c = p.obj.clone(true);
  let s = o.scale || 1;
  if (o.fitH) s = o.fitH / Math.max(1e-3, p.size.y);
  if (o.fitL) s = o.fitL / Math.max(1e-3, p.size.x, p.size.z);
  c.scale.setScalar(s);
  return c;
}
export const envSize = id => Env.pieces[id] ? Env.pieces[id].size : null;
