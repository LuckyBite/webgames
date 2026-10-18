// Загрузка и подготовка ассетов.
//  - статичные модели (Kenney, реквизит Quaternius) → «шаблоны»: части {geometry, material} с запечёнными трансформами узлов
//  - персонажи и зомби → GLTF целиком, клонируются через SkeletonUtils.clone, анимации общие
//  - все материалы мира переводятся в Lambert (дешевле на телефонах) и получают
//    общие униформы стиля: дрожание вершин (PS1) и обесцвечивание (тезис «город остыл»)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SNAP } from './render.js';

// насыщенность мира: 1 — как в ассетах, 0 — ч/б. Акцентные материалы не обесцвечиваются.
export const SAT = { value: 0.5 };
export const TINT = { value: new THREE.Color(0xd8dee6) }; // холодный общий оттенок

export function styleMaterial(m, opts = {}) {
  if (!m || m.userData.styled) return m;
  m.userData.styled = true;
  const accent = !!opts.accent;
  m.onBeforeCompile = s => {
    s.uniforms.uSnap = SNAP;
    s.uniforms.uSat = accent ? { value: 1 } : SAT;
    s.uniforms.uTint = accent ? { value: new THREE.Color(1, 1, 1) } : TINT;
    s.vertexShader = 'uniform vec2 uSnap;\n' + s.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nif(uSnap.x>0.0){vec2 sn0=gl_Position.xy/gl_Position.w;vec2 sn1=floor(sn0*uSnap+0.5)/uSnap;gl_Position.xy=mix(sn0,sn1,smoothstep(4.0,16.0,gl_Position.w))*gl_Position.w;}');
    // гниль (зомби из людей): кожа и одежда сереют, по текстуре проступают пятна запёкшейся крови и грязи
    const rot = opts.rot && m.map ? `{float h1=fract(sin(dot(floor(vMapUv*64.),vec2(12.9898,78.233)))*43758.5453);
      float h2=fract(sin(dot(floor(vMapUv*9.+.37),vec2(39.3,11.7)))*24634.6345);
      float h3=fract(sin(dot(floor(vMapUv*23.+.11),vec2(7.1,91.7)))*1597.31);
      float l0=dot(diffuseColor.rgb,vec3(.299,.587,.114));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(l0)*vec3(.8,.86,.76),.6);
      float blood=step(.78,h2)*step(.45,h3)*step(.25,h1);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.16,.025,.02),blood*.8);
      diffuseColor.rgb*=mix(1.,.6,step(.93,h1)*step(.5,h2));}` : '';
    // detail — мелкая повторяющаяся текстура поверх крупной карты цвета (трава, крошка): x2, серый = без изменений
    const det = opts.detail && m.map ? (s.uniforms.uDetail = { value: opts.detail.tex }, s.uniforms.uDetRep = { value: opts.detail.rep },
      'diffuseColor.rgb*=texture2D(uDetail,vMapUv*uDetRep).rgb*2.0;') : '';
    s.fragmentShader = 'uniform float uSat;uniform vec3 uTint;' + (det ? 'uniform sampler2D uDetail;uniform float uDetRep;' : '') + '\n' + s.fragmentShader.replace('#include <color_fragment>',
      '#include <color_fragment>\n' + rot + det + '{float l=dot(diffuseColor.rgb,vec3(.299,.587,.114));diffuseColor.rgb=mix(vec3(l),diffuseColor.rgb,uSat)*uTint;}');
  };
  m.customProgramCacheKey = () => accent ? 'acc' : opts.detail ? 'det' + opts.detail.rep : opts.rot && m.map ? 'rot' : 'world';
  return m;
}

// Standard → Lambert с сохранением цвета/текстуры
export function toLambert(src, opts = {}) {
  const m = new THREE.MeshLambertMaterial({
    color: src.color ? src.color.clone() : new THREE.Color(1, 1, 1),
    map: src.map || null,
    transparent: src.transparent, opacity: src.opacity,
    alphaTest: src.alphaTest || 0,
    side: src.side,
    vertexColors: src.vertexColors,
  });
  if (src.emissive && src.emissive.getHex() && !opts.noEmissive) {
    m.emissive = src.emissive.clone();
    m.emissiveMap = src.emissiveMap || null;
    m.emissiveIntensity = src.emissiveIntensity ?? 1;
  }
  m.name = src.name;
  if (opts.skinned) m.skinning = true;
  return styleMaterial(m, opts);
}

const loader = new GLTFLoader();

// Манифест: ключ → путь. Статичные модели помечены kit, персонажи — anim.
const K = 'assets/kenney/', Q = 'assets/q/';
export const MANIFEST = {};
function addKit(kit, names) { for (const n of names) MANIFEST[kit + ':' + n] = { url: K + kit + '/' + n + '.glb', kit }; }
// v2: город собирается из PSX-паков окружения (envkit.js, assets/env). Из старых китов остаются лодки Kenney
// и мелочь Quaternius (кровь на асфальте, оружие, которого нет в PSX-паках).
addKit('water', ['boat-speed-a', 'boat-speed-b', 'boat-speed-d', 'boat-speed-g', 'boat-speed-j']);
for (const n of ['Blood_1', 'Blood_2', 'Blood_3'])
  MANIFEST['apoc:' + n] = { url: Q + n + '.glb', kit: 'apoc' };
// v2.1: из оружия Quaternius остались ПП, граната и бутылка; остальное — PSX-пак и модели кодом (weapons3d.js)
for (const n of ['w_smg', 'w_grenade', 'w_molotov'])
  MANIFEST[n] = { url: Q + n + '.glb', kit: 'weapon' };
// персонажи и зомби грузятся по выбору из витрины (assets/selection.json, tools/gallery.html).
export const DEFAULT_SELECTION = {heroes: ['hh_survivor_woman', 'psx_m_17_police', 'psx_m_15', 'psx_m_male_44', 'psx_m_23_firefighter', 'psx_f_17_female_police', 'psx_f_female_04', 'psx_f_43_female', 'psx_m_27_hm', 'hh_office_worker'], survivors: ['psx_m_male_42', 'psx_m_male_34', 'psx_f_29_female', 'psx_m_25_doctor', 'psx_f_38_female', 'psx_m_male_49'], humanZombies: ['psx_m_01', 'psx_m_03', 'psx_m_04', 'psx_m_07', 'psx_m_09', 'psx_m_12', 'psx_m_18_police', 'psx_m_24_firefighter', 'psx_m_26_doctor', 'psx_m_28_hm', 'psx_m_male_35', 'psx_m_male_39', 'psx_m_male_47', 'psx_m_male_53', 'psx_f_31_female', 'psx_f_33_female', 'psx_f_36_female', 'psx_f_female_05', 'psx_f_female_10', 'psx_f_24_female_doctor', 'psx_f_20_female_police'], npc: {chief: 'psx_m_sheriff_n', medic: 'psx_f_23_female_doctor', trader: 'psx_m_male_43'}, zombies: {'hh_zombie_woman':'walker', 'psx_k_monster_06':'runner', 'psx_k_monster_07':'fat', 'psx_k_monster_08':'fat'}, carsOff: [], cultists: ['psx_k_killer_05', 'psx_k_killer_06', 'psx_k_killer_08']};
export const Selection = structuredClone(DEFAULT_SELECTION);

export async function loadSelection() {
  try {
    const r = await fetch('assets/selection.json', { cache: 'no-store' });
    if (r.ok) Object.assign(Selection, await r.json());
  } catch (e) { /* остаёмся на выборе по умолчанию */ }
  // для проверок: ?heroes=char_swat,char_punk добавляет героев, не трогая selection.json
  const extra = new URLSearchParams(location.search).get('heroes');
  if (extra) for (const k of extra.split(',')) if (k && !Selection.heroes.includes(k)) Selection.heroes.unshift(k);
  const keys = new Set([...Selection.heroes, ...Selection.survivors, ...Selection.humanZombies,
    ...Object.values(Selection.npc), ...Object.keys(Selection.zombies), ...(Selection.cultists || [])]);
  // PSX-персонажи (Characters PSX, heyheythere) лежат в assets/psx; у моделей Mixamo анимации общие — psx_anims
  const url = n => (/^(psx_|hh_)/.test(n) ? 'assets/psx/' : Q) + n + '.glb';
  if ([...keys].some(k => k.startsWith('psx_'))) keys.add('psx_anims');
  for (const n of keys) MANIFEST[n] = { url: url(n), anim: true };
  for (const k of Selection.carsOff || []) delete MANIFEST[k.startsWith('car_') ? 'apoc:' + k : 'car:' + k];
  return Selection;
}

// модели зомби по типам из выбора; люди-зомби добавляются к ходокам
export function zombieModels(type) {
  const out = Object.keys(Selection.zombies).filter(k => Selection.zombies[k] === type && MANIFEST[k]);
  // люди-зомби всегда идут в ходоки, а типу без своих моделей отдаются целиком (бегун, толстяк, ползун из людей)
  if (type === 'walker' || !out.length) out.push(...Selection.humanZombies.filter(k => MANIFEST[k]));
  return out.length ? out : Selection.humanZombies.filter(k => MANIFEST[k]);
}

export const Assets = {
  gltf: {},       // ключ → gltf (персонажи)
  tpl: {},        // ключ → {parts:[{geometry, material}], box:Box3, size:Vector3}
  kitMats: {},    // kit → общий материал (у Kenney одна текстура на кит)
  scenes: {},     // исходные сцены машин (колёса отдельными узлами)
  textures: new Set(),
  tintCache: {},   // материал персонажа + оттенок → общий материал (один на тип зомби)
};

// Перегоняет сцену GLTF в набор частей с запечёнными матрицами.
// Части с одинаковым материалом сливаются в одну геометрию.
export function bakeTemplate(key, scene, kit) {
  scene.updateMatrixWorld(true);
  const byMat = new Map();
  scene.traverse(o => {
    if (!o.isMesh || o.isSkinnedMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    // оставляем только нужные атрибуты, чтобы геометрии сливались
    for (const a of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(a)) g.deleteAttribute(a);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    const geos = mats.length > 1 && g.groups.length ? splitGroups(g) : [g];
    geos.forEach((gg, i) => {
      const src = mats[Math.min(i, mats.length - 1)];
      const mk = src.uuid;
      if (!byMat.has(mk)) byMat.set(mk, { src, geos: [] });
      byMat.get(mk).geos.push(gg.index ? gg.toNonIndexed() : gg);
    });
  });
  const parts = [];
  for (const { src, geos } of byMat.values()) {
    const geometry = geos.length > 1 ? mergeGeometries(geos, false) : geos[0];
    let material;
    // у кита Kenney одна текстура: общий материал на кит, чтобы BatchedMesh собрал всё в один вызов
    if (kit === 'env') {
      if (!Assets.kitMats['env:' + src.uuid]) {
        if (src.map) { src.map.colorSpace = THREE.SRGBColorSpace; Assets.textures.add(src.map); }
        // цвета вершин при запекании выбрасываются: материал не должен их ждать, иначе деталь чёрная
        const lm = toLambert(src); lm.vertexColors = false;
        Assets.kitMats['env:' + src.uuid] = lm;
      }
      material = Assets.kitMats['env:' + src.uuid];
    } else if (src.map && kit && kit !== 'apoc' && kit !== 'weapon' && kit !== 'furniture') {
      const mk = kit + ':' + src.name;
      if (!Assets.kitMats[mk]) {
        Assets.kitMats[mk] = toLambert(src);
        if (src.map) { src.map.colorSpace = THREE.SRGBColorSpace; Assets.textures.add(src.map); }
      }
      material = Assets.kitMats[mk];
    } else {
      material = toLambert(src);
      if (src.map) { src.map.colorSpace = THREE.SRGBColorSpace; Assets.textures.add(src.map); }
    }
    parts.push({ geometry, material });
  }
  const box = new THREE.Box3();
  for (const p of parts) { p.geometry.computeBoundingBox(); box.union(p.geometry.boundingBox); }
  const size = box.getSize(new THREE.Vector3());
  Assets.tpl[key] = { parts, box, size };
}

function splitGroups(g) {
  const out = [];
  const src = g.index ? g.toNonIndexed() : g;
  for (const gr of g.groups) {
    const part = new THREE.BufferGeometry();
    for (const [n, a] of Object.entries(src.attributes)) {
      const arr = a.array.slice(gr.start * a.itemSize, (gr.start + gr.count) * a.itemSize);
      part.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize));
    }
    out.push(part);
  }
  return out;
}

export async function loadAll(onProgress, filter) {
  const keys = Object.keys(MANIFEST).filter(k => !filter || filter(k));
  let done = 0;
  const fails = [];
  const one = async key => {
    const e = MANIFEST[key];
    try {
      const g = await loader.loadAsync(e.url);
      if (e.anim) {
        g.scene.traverse(o => {
          if (o.isMesh) {
            o.frustumCulled = false;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            const conv = mats.map(m => { if (m.map) { m.map.colorSpace = THREE.SRGBColorSpace; Assets.textures.add(m.map); } return toLambert(m); });
            o.material = Array.isArray(o.material) ? conv : conv[0];
            o.castShadow = true;
          }
        });
        Assets.gltf[key] = g;
      } else {
        // у машин и лодок храним и исходную сцену: колёса — отдельные узлы, их крутим
        if (e.kit === 'car' || key.startsWith('apoc:car_') || e.kit === 'water') Assets.scenes[key] = g.scene;
        bakeTemplate(key, g.scene, e.kit);
      }
    } catch (err) {
      fails.push(key);
      console.warn('asset fail', key, err && err.message);
    }
    done++;
    if (onProgress) onProgress(done / keys.length, key);
  };
  // ограничиваем параллельность — на телефонах иначе подвисает декодирование
  const queue = keys.slice();
  const workers = Array.from({ length: 8 }, async () => { while (queue.length) await one(queue.shift()); });
  await Promise.all(workers);
  return fails;
}

// Клон персонажа: {root, mixer, actions, bones}
export function cloneCharacter(key, opts = {}) {
  const g = Assets.gltf[key];
  const root = SkeletonUtils.clone(g.scene);
  const bones = {};
  const hide = opts.hide || [];
  root.traverse(o => {
    if (o.isBone) bones[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true;
      o.frustumCulled = false;
      // вшитое оружие и прочие жёсткие детали прячем: всё, что не скелетный меш
      if (hide.includes(o.name) || (opts.hideRigid && !o.isSkinnedMesh)) o.visible = false;
      if (opts.tint && o.material && !Array.isArray(o.material)) {
        // clone() не переносит onBeforeCompile: снимаем метку и стилизуем заново, иначе клон останется ярким
        const tk = o.material.uuid + opts.tint + (opts.rot ? 'r' : '') + (opts.bright || '');
        const shared = Assets.tintCache[tk];
        if (shared) o.material = shared;
        else {
          const m = o.material.clone();
          m.userData.styled = false;
          styleMaterial(m, { rot: opts.rot });
          m.color.multiply(new THREE.Color(opts.tint));
          if (opts.bright) m.color.multiplyScalar(opts.bright); // слишком тёмные текстуры (чёрная кожа) иначе сливаются в силуэт
          Assets.tintCache[tk] = m;
          o.material = m;
        }
      }
    }
  });
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  // PSX-персонажи на скелете Mixamo делят библиотеку psx_anims (люди, зомби с приставкой Z_, стрельба)
  const mixamo = !!bones.mixamorigHips;
  const asZombie = !!opts.zombie; // человек-зомби: походка, удар и смерть мертвеца (клипы Z_*)
  let src = [];
  if (mixamo && Assets.gltf.psx_anims && key !== 'psx_anims') src = retarget('psx_anims', key, bones);
  // зомби из человека: клипы Z_* встают на обычные имена раньше человеческих
  if (asZombie) for (const c of src) if (c.name.startsWith('Z_')) { const n = c.name.slice(2); if (!actions[n]) actions[n] = mixer.clipAction(c); }
  if (asZombie && actions.Walk && !actions.Run) actions.Run = actions.Walk;
  // порядок: свои анимации модели, их синонимы под наши имена, и только потом чужие на пустые места
  const add = clips => { for (const clip of clips) { const n = clip.name.replace(/^.*\|/, '').replace(/^(Man|Female)_/, ''); if (!actions[n]) actions[n] = mixer.clipAction(clip); } };
  const alias = () => { for (const [want, alts] of Object.entries(ANIM_ALIAS)) if (!actions[want]) { const a = alts.find(n => actions[n]); if (a) actions[want] = actions[a]; } };
  add(g.animations);
  const own = new Set(Object.keys(actions));
  for (const want of ['Idle_Gun', 'Walk_Gun', 'Run_Gun', 'HitReact', 'Punch']) if (!actions[want]) { const a = ANIM_ALIAS[want].find(n => own.has(n) && !/^Idle$|^Walk$|^Run$/.test(n)); if (a) actions[want] = actions[a]; }
  add(src);
  alias();
  // человеческий клип смерти в библиотеке не роняет тело (таз остаётся на высоте) — падают все как в клипе зомби
  if (actions.Z_Death) actions.Death = actions.Z_Death;
  return { root, mixer, actions, bones, mixamo };
}

// Руки ближе к телу. У моделей поза покоя с разведёнными руками (A-поза), и клипы её наследуют:
// персонажи ходили «пугалом». Поверх кадра анимации у плеча убираем часть бокового отведения
// (мах вперёд-назад остаётся). Кадр анимации каждый раз пишет кости заново, поэтому правка не копится.
const _ra = new THREE.Vector3(), _rb = new THREE.Vector3(), _rx = new THREE.Vector3(), _rd = new THREE.Vector3(), _rq = new THREE.Quaternion(), _rp = new THREE.Quaternion(), _rw = new THREE.Quaternion();
export function relaxArms(c, keep = 0.3) {
  if (!c._arms) {
    const B = Object.values(c.bones);
    const f = re => B.find(b => re.test(b.name));
    c._arms = [[f(/LeftArm$/), f(/LeftForeArm$/)], [f(/RightArm$/), f(/RightForeArm$/)]].filter(a => a[0] && a[1]);
  }
  if (!c._arms.length) return;
  c.root.updateMatrixWorld(true);
  c.root.getWorldQuaternion(_rq);
  _rx.set(1, 0, 0).applyQuaternion(_rq); // боковая ось тела
  for (const [up, low] of c._arms) {
    up.getWorldPosition(_ra); low.getWorldPosition(_rb);
    const d = _rd.subVectors(_rb, _ra).normalize();
    const side = d.dot(_rx);
    const want = _rb.copy(d).addScaledVector(_rx, -side * (1 - keep)).normalize();
    // повернуть плечо в мире, чтобы d стало want
    _rq.setFromUnitVectors(d, want);
    up.parent.getWorldQuaternion(_rp); up.getWorldQuaternion(_rw);
    _rw.premultiply(_rq);
    up.quaternion.copy(_rp.invert().multiply(_rw));
    up.updateMatrixWorld(true);
  }
}

// Перенос чужих анимаций на модель того же скелета. Повороты берём как есть, а смещения костей
// масштабируем под длину кости у этой модели: иначе пропорции образца сгибают её (бёдра уезжают вниз).
const retCache = {};
function retarget(from, to, bones) {
  const ck = from + '>' + to;
  if (retCache[ck]) return retCache[ck];
  const srcBones = {};
  const sRoot = Assets.gltf[from].scene;
  sRoot.traverse(o => { if (o.isBone) srcBones[o.name] = o; });
  sRoot.updateMatrixWorld(true);
  let tRoot = Object.values(bones)[0];
  while (tRoot.parent) tRoot = tRoot.parent;
  tRoot.updateMatrixWorld(true);
  // Поправка на разную позу покоя костей. У моделей Characters PSX кости сориентированы по-разному
  // (таз, ноги, руки), и клип, скопированный «как есть», разворачивал тело вбок, а ноги и руки — криво.
  // Мировой поворот кости относительно покоя у модели тот же, что у источника:
  //   q_модели = inv(Pм)·Pи · q_источника · inv(Bи)·Bм,  P — мировой поворот родителя в покое, B — самой кости.
  const corr = {};
  const wq = o => o.getWorldQuaternion(new THREE.Quaternion());
  const C = bn => {
    if (corr[bn] !== undefined) return corr[bn];
    const s = srcBones[bn], d = bones[bn];
    if (!s || !d || !s.parent || !d.parent) return (corr[bn] = null);
    const c1 = wq(d.parent).invert().multiply(wq(s.parent)), c2 = wq(s).invert().multiply(wq(d));
    const same = q => Math.abs(Math.abs(q.w) - 1) < 1e-5;
    return (corr[bn] = same(c1) && same(c2) ? null : { c1, c2 });
  };
  const q = new THREE.Quaternion(), v = new THREE.Vector3();
  retCache[ck] = Assets.gltf[from].animations.map(c => new THREE.AnimationClip(c.name, c.duration, c.tracks.flatMap(t => {
    if (t.name.endsWith('.quaternion')) {
      const bn = t.name.slice(0, -11), k = C(bn);
      if (!k) return [/Hips.quaternion$/.test(t.name) ? t.clone() : t];
      const nt = t.clone();
      for (let i = 0; i < nt.values.length; i += 4) { q.fromArray(nt.values, i); q.premultiply(k.c1).multiply(k.c2); q.toArray(nt.values, i); }
      return [nt];
    }
    if (!t.name.endsWith('.position')) return [];
    const bn = t.name.slice(0, -9), s = srcBones[bn], d = bones[bn];
    if (!s || !d) return [];
    const k = s.position.length() > 1e-5 ? d.position.length() / s.position.length() : 1;
    const kc = C(bn);
    const nt = t.clone();
    for (let i = 0; i < nt.values.length; i += 3) { v.fromArray(nt.values, i).multiplyScalar(k); if (kc) v.applyQuaternion(kc.c1); v.toArray(nt.values, i); }
    return [nt];
  })));
  return retCache[ck];
}

const ANIM_ALIAS = {
  Idle: ['Idle_Neutral', 'Idle_Gun'], Idle_Gun: ['Idle_Shoot', 'Idle_Gun_Pointing', 'Idle'], Walk: ['Walk_Gun', 'Run'], Walk_Gun: ['Walk_Shoot', 'Walk'],
  Run: ['Run_Gun'], Run_Gun: ['Run_Shoot', 'Run'], Duck: ['Idle_Neutral', 'Idle'], Jump: ['Roll', 'Jump_Idle', 'Idle'],
  Jump_Idle: ['Jump', 'Idle'], Punch: ['Punch_Right', 'Punch_Left', 'Kick_Right'], Slash: ['Sword_Slash', 'SwordSlash', 'Punch_Right', 'Punch'],
  Stab: ['Sword_Slash', 'SwordSlash', 'Punch_Right', 'Punch'], HitReact: ['HitRecieve', 'HitRecieve_2'], Wave: ['Interact', 'Yes'],
};

// кость кисти, к которой крепим оружие: у разных скелетов называется по-разному
export function handBone(bones) {
  for (const n of ['Middle1L', 'mixamorigRightHand', 'RightHand', 'FistL', 'HandL', 'WristL', 'Fist.L', 'Hand.L', 'LowerArmL']) if (bones[n]) return bones[n];
  return Object.values(bones).find(b => /hand|fist|wrist/i.test(b.name)) || Object.values(bones)[0];
}

// Обычный (не skinned) меш из шаблона — для оружия в руках, лута на земле, транспорта
export function makeMesh(key, opts = {}) {
  const t = Assets.tpl[key];
  if (!t) return new THREE.Group();
  const g = new THREE.Group();
  for (const p of t.parts) {
    const m = new THREE.Mesh(p.geometry, opts.material || p.material);
    m.castShadow = opts.shadow !== false;
    m.receiveShadow = !!opts.receive;
    g.add(m);
  }
  return g;
}

// Масштаб, при котором самая длинная сторона модели = len метров
export function fitScale(key, len) {
  const t = Assets.tpl[key];
  if (!t) return 1;
  return len / Math.max(t.size.x, t.size.y, t.size.z);
}
