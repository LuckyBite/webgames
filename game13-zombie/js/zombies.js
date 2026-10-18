// Зомби: спавн кольцом вокруг игрока, слух и зрение, погоня без навмеша
// (прямая видимость → идут прямо, иначе по «хлебным крошкам» следа игрока), атака, смерть.
// Модели клонируются из пула по типу, чтобы не дёргать сборщик мусора.
import * as THREE from 'three';
import { cloneCharacter, zombieModels, Assets, Selection, handBone, relaxArms } from './assets.js';
import { weaponModel, poseHeld, WHOLD } from './weapons3d.js';
import { heroScale } from './player.js';
import { rayCylinder } from './physics.js';
import { rollLoot } from './items.js';
import { districtAt, WORLD, PITCH } from './city.js';
import { shellAt } from './world.js';
import { SHELL_TYPES } from './city.js';
import { audio } from './audio.js';

export const ZTYPES = {
  walker:  { name: 'Ходок', model: null, hp: 100, speed: 2.4, dmg: 12, scale: 1.25, r: 0.38, h: 1.75, tint: 0xb4c2b6, run: 'Walk', runRate: 1.6 },
  runner:  { name: 'Бегун', model: null, hp: 70, speed: 5.2, dmg: 9, scale: 1.15, r: 0.36, h: 1.8, tint: 0xa8b4b0, run: 'Run', runRate: 1.05 },
  fat:     { name: 'Толстяк', model: null, hp: 320, speed: 1.8, dmg: 26, scale: 1.12, r: 0.6, h: 1.85, tint: 0xb8bca8, run: 'Walk', runRate: 1.2, shove: true },
  crawler: { name: 'Ползун', model: null, hp: 60, speed: 1.4, dmg: 15, scale: 1.25, r: 0.4, h: 0.75, tint: 0xa6b0a8, run: 'Crawl', runRate: 1.2, low: true },
  // культисты: живые люди без следов заражения, с оружием; зомби их не трогают
  cultist: { name: 'Культист', model: 'psx_k_killer_05', hp: 90, speed: 4.4, dmg: 10, scale: 1, r: 0.36, h: 1.8, run: 'Run', runRate: 1, cult: true },
  boss:    { name: 'Мясник', model: 'psx_k_monster_08', hp: 1100, speed: 2.6, dmg: 38, scale: 1.55, r: 0.85, h: 2.55, tint: 0xc89080, run: 'Walk', runRate: 1.4, shove: true, boss: true },
};

// плотность (сколько держать вокруг игрока) по районам
const DENSITY = { downtown: 26, residential: 16, industrial: 18, port: 14, park: 12, military: 30, airfield: 8, outskirts: 5, camp: 0, sea: 0 };
const MIX = { // веса типов
  downtown: [['walker', 6], ['runner', 2], ['fat', 1]],
  military: [['walker', 4], ['runner', 3], ['fat', 2]],
  default:  [['walker', 7], ['runner', 1.2], ['fat', 0.7]],
};

const tmp = new THREE.Vector3();

export class Zombies {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.pool = {};
    this.crumbs = [];       // след игрока
    this.spawnT = 0;
    this.groanT = 0;
    this.killed = 0;
    this.shellSpawned = {}; // id здания → день, когда в нём заселили охрану
  }

  get alive() { return this.list.filter(z => !z.dead); }

  // ---------- создание ----------
  take(type) {
    const T = ZTYPES[type];
    // модель типа — случайная из выбранных в витрине (у босса всегда своя)
    // только модели со скелетом: у части Characters PSX в папке Rig скелета нет
    const list = T.boss ? [Assets.gltf.psx_k_monster_08 ? 'psx_k_monster_08' : (Selection.humanZombies || []).find(k => Assets.gltf[k])]
      : T.cult ? (Selection.cultists || []).filter(k => Assets.gltf[k] && hasSkin(k))
      : zombieModels(type).filter(k => Assets.gltf[k] && hasSkin(k));
    const key = list.length ? list[Math.floor(Math.random() * list.length)] : T.model;
    const pk = type + ':' + key;
    const p = this.pool[pk] || (this.pool[pk] = []);
    let c = p.pop();
    if (!c && T.cult) {
      // культист — обычный человек: человеческие анимации, без гнили и оттенка
      c = cloneCharacter(key, { hideRigid: true });
      c.root.scale.setScalar(heroScale(key));
      c.hand = handBone(c.bones);
      c.rateMul = 1;
      c.poolKey = pk;
      c.meshes = [];
      c.root.traverse(o => { if (o.isMesh) c.meshes.push(o); });
    }
    if (!c) {
      const human = /^(char_|psx_|hh_office|hh_survivor)/.test(key);
      // человек-зомби: анимации мертвеца, бледный зелёно-серый оттенок, оружие спрятано
      c = cloneCharacter(key, human ? { tint: /^psx_|^hh_/.test(key) ? 0xd2dccb : 0x9aac98, rot: /^psx_|^hh_/.test(key) && !/monster/.test(key), hideRigid: true, zombie: true } : { tint: T.tint, bright: BRIGHT[key] });
      const s = key === T.model ? T.scale : heroScale(key) * (human ? 1 : T.h / 1.75);
      c.root.scale.setScalar(s);
      if (human) {
        // из человека делаем тип: толстяк — шире, ползун — на корточках, бегун — быстрая походка мертвеца
        if (type === 'fat' || T.boss) c.root.scale.set(s * 1.45, s * (T.boss ? 1.3 : 1.03), s * 1.45);
        if (T.low) { c.actions.Crawl = c.actions.Crouch_Walk || c.actions.Walk; c.actions.Idle = c.actions.Duck || c.actions.Idle; }
        c.rateMul = type === 'runner' ? 2.1 : 1;
      }
      c.poolKey = pk;
      c.meshes = [];
      c.root.traverse(o => { if (o.isMesh) c.meshes.push(o); });
    }
    for (const a of Object.values(c.actions)) a.stop();
    c.root.visible = true;
    this.g.scene.add(c.root);
    return c;
  }

  spawnAt(type, x, z, o = {}) {
    const T = ZTYPES[type];
    const c = this.take(type);
    const zb = {
      type, T, c, pos: new THREE.Vector3(x, 0, z), yaw: Math.random() * 6.28, hp: T.hp * (o.hpMul || 1), maxHp: T.hp * (o.hpMul || 1),
      r: T.r, h: T.h, state: 'idle', target: null, alertT: 0, atkT: 0, atkHit: false, stagger: 0, kx: 0, kz: 0,
      lookT: Math.random() * 0.5, wanderT: 0, wx: 0, wz: 0, stuckT: 0, lastX: x, lastZ: z, sideT: 0, side: 1,
      crumb: -1, dead: false, deadT: 0, anim: null, animName: '', sway: Math.random() * 6.28, lod: 0, shell: o.shell || null,
      guard: !!o.guard, quest: o.quest || null, loot: o.loot || null, speedMul: (o.speedMul || 1) * (0.85 + Math.random() * 0.3),
    };
    if (T.cult) this.armCultist(zb, o);
    c.root.position.copy(zb.pos);
    this.play(zb, 'Idle');
    if (c.actions.Idle) c.actions.Idle.time = Math.random() * 2;
    this.list.push(zb);
    return zb;
  }

  play(z, name, fade = 0.2, once = false, rate = 1) {
    const acts = z.c.actions;
    let a = acts[name];
    if (!a) a = acts[{ Punch: 'Idle_Attack', Idle_Attack: 'Run_Attack', Crawl: 'Walk', Run: 'Walk' }[name]] || acts.Walk || acts.Idle;
    if (!a) return;
    a.timeScale = rate;
    if (z.anim === a) return;
    if (z.anim) z.anim.fadeOut(fade);
    a.reset().setEffectiveWeight(1).fadeIn(fade);
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat);
    a.clampWhenFinished = once;
    a.play();
    z.anim = a; z.animName = name;
  }

  // оружие культиста: чаще холодное, иногда голые руки, изредка пистолет или бензопила (у игрока она только с их трупов)
  armCultist(z, o) {
    const r = Math.random();
    z.weapon = o.weapon || (r < 0.06 ? 'pistol' : r < 0.16 ? 'chainsaw' : r < 0.34 ? 'fists' : ['knife', 'knife', 'bat', 'axe'][Math.floor(Math.random() * 4)]);
    z.dmg = { fists: 7, knife: 14, bat: 18, axe: 24, pistol: 7, chainsaw: 32 }[z.weapon];
    z.home = o.home || { x: z.pos.x, z: z.pos.z };
    z.shootT = 1 + Math.random();
    z.speedMul *= 0.95 + Math.random() * 0.15;
    const m = z.weapon !== 'fists' ? weaponModel(z.weapon) : null;
    // оружие стоит в мире и каждый кадр встаёт в ладонь (poseHeld): оси кисти у моделей разные
    if (m && z.c.hand) { this.g.scene.add(m); z.wmesh = m; }
  }

  remove(z) {
    if (z.wmesh && z.wmesh.parent) z.wmesh.parent.remove(z.wmesh);
    this.g.scene.remove(z.c.root);
    if (z.drop && z.drop.kind === 'body' && this.g.loot.drops.includes(z.drop)) this.g.loot.removeDrop(z.drop);
    (this.pool[z.c.poolKey] || (this.pool[z.c.poolKey] = [])).push(z.c);
    const i = this.list.indexOf(z);
    if (i >= 0) this.list.splice(i, 1);
  }

  clear() { for (const z of this.list.slice()) this.remove(z); this.crumbs.length = 0; }

  pickType(d, R = Math.random) {
    const mix = MIX[d] || MIX.default;
    const tot = mix.reduce((s, m) => s + m[1], 0);
    let x = R() * tot;
    for (const [t, w] of mix) { x -= w; if (x <= 0) return t; }
    return 'walker';
  }

  // ---------- голоса ----------
  // У каждого зомби свой голос: высота по типу и свой набор файлов. Звук зависит от состояния:
  // покой — редкий стон, заметил — вопль один раз, погоня — рык, замах — выкрик, ранение, смерть.
  // Одновременно звучит не больше трёх голосов, чтобы толпа не сливалась в одно и то же.
  voiceOf(z) {
    if (z.vo) return z.vo;
    const T = z.type, R = Math.random;
    const base = { walker: [0.86, 1.08], runner: [1.1, 1.3], fat: [0.66, 0.78], crawler: [0.95, 1.12], boss: [0.52, 0.58] }[T] || [0.9, 1.1];
    const pool = key => { const n = audio.count(key), out = []; while (out.length < Math.min(3, n)) { const i = Math.floor(R() * n); if (!out.includes(i)) out.push(i); } return out; };
    z.vo = { rate: base[0] + R() * (base[1] - base[0]), lp: T === 'fat' ? 2600 : T === 'boss' ? 1700 : 0,
      pool: { zIdle: pool('zIdle'), zAlert: pool('zAlert'), zAttack: pool('zAttack'), zDie: pool('zDie') }, next: 0, step: 0 };
    return z.vo;
  }
  voice(z, kind) {
    const vo = this.voiceOf(z), t = this.g.time;
    this.voices = (this.voices || []).filter(e => e > t);
    const urgent = kind === 'die' || kind === 'attack' || kind === 'alert';
    if (!urgent && (t < vo.next || this.voices.length >= 3)) return;
    if (urgent && this.voices.length >= 5) return;
    const K = {
      idle:   ['zIdle', 0.42, 18, 1, [7, 16]],
      chase:  ['zIdle', 0.6, 26, 1.15, [2.6, 5]],
      alert:  ['zAlert', 0.85, 36, 1, [5, 8]],
      attack: ['zAttack', 0.8, 20, 1, [1.2, 2]],
      hurt:   ['zAttack', 0.5, 20, 1.3, [0.8, 1.6]],
      die:    ['zDie', 0.8, 28, 1, [99, 99]],
    }[kind];
    if (kind === 'hurt' && Math.random() < 0.4) return;
    const src = audio.play(K[0], z.pos, { vol: K[1], range: K[2], rate: vo.rate * K[3], pool: vo.pool[K[0]], lowpass: vo.lp || undefined });
    vo.next = t + K[4][0] + Math.random() * (K[4][1] - K[4][0]);
    if (src) this.voices.push(t + (src.dur || 1));
  }
  // шарканье и топот ближних
  steps(z, dt, dist) {
    if (dist > 14 || !z.anim || z.animName === 'Idle') return;
    const vo = this.voiceOf(z);
    const sp = z.state === 'chase' ? z.T.speed : 0.6;
    vo.step -= dt * Math.max(0.8, sp * 0.8);
    if (vo.step > 0) return;
    vo.step = 1;
    const k = { fat: [0.16, 0.55], boss: [0.25, 0.45], runner: [0.12, 0.9], crawler: [0.05, 0.6] }[z.type] || [0.07, 0.7];
    audio.play(this.g.groundKind(z.pos.x, z.pos.z) === 'grass' ? 'stepGrass' : 'step', z.pos, { vol: k[0], rate: k[1], range: 10 });
  }

  // ---------- спавн ----------
  populate(dt) {
    const g = this.g, p = g.player;
    const px = p.vehicle ? p.vehicle.pos.x : p.pos.x, pz = p.vehicle ? p.vehicle.pos.z : p.pos.z;
    // далеко ушедших убираем
    for (const z of this.list.slice()) {
      const d = Math.hypot(z.pos.x - px, z.pos.z - pz);
      if ((z.dead && z.deadT > 60) || (!z.quest && d > (z.guard ? 160 : 125) && !(z.dead && d < 60))) this.remove(z);
    }
    // охрана зданий: заселяем, когда игрок подошёл
    for (const id in g.world.shellIndex) {
      const s = g.world.shellIndex[id];
      const T = SHELL_TYPES[s.type];
      if (!T.zombies[1]) continue;
      const d = Math.hypot(s.x - px, s.z - pz);
      if (d > 70 || d < 12) continue;
      if (this.shellSpawned[id] !== undefined && g.day - this.shellSpawned[id] < 2) continue;
      this.shellSpawned[id] = g.day;
      const n = T.zombies[0] + Math.floor(Math.random() * (T.zombies[1] - T.zombies[0] + 1));
      const district = districtAt(g.plan, s.x, s.z);
      for (let i = 0; i < n; i++) {
        const x = s.inside.x + (Math.random() - 0.5) * (s.maxX - s.minX - 3), z = s.inside.z + (Math.random() - 0.5) * (s.maxZ - s.minZ - 3);
        if (g.phys.blocked(x, 0.1, z, 0.4, 1.7)) continue;
        this.spawnAt(this.pickType(district), x, z, { guard: true, shell: id });
      }
    }
    // культисты: группа у своего костра, появляется, когда игрок рядом; заново — через 2 игровых дня
    this.cultSpawned = this.cultSpawned || {};
    (g.plan.cults || []).forEach((s, i) => {
      const d = Math.hypot(s.x - px, s.z - pz);
      if (d > 75 || d < 12) return;
      if (this.cultSpawned[i] !== undefined && g.day - this.cultSpawned[i] < 2) return;
      this.cultSpawned[i] = g.day;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const a = k / n * 6.28 + Math.random() * 0.5, r = 1.8 + Math.random() * 1.2;
        const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
        if (g.phys.blocked(x, 0.1, z, 0.4, 1.7)) continue;
        this.spawnAt('cultist', x, z, { guard: true, home: { x: s.x, z: s.z } });
      }
    });
    // орды: толпа стоит в кишащем квартале, появляется, когда игрок подошёл; заново — через 3 игровых дня
    this.hordeSpawned = this.hordeSpawned || {};
    (g.plan.hordes || []).forEach((h, i) => {
      const d = Math.hypot(h.x - px, h.z - pz);
      if (d > 80 || d < 28) return;
      if (this.hordeSpawned[i] !== undefined && g.day - this.hordeSpawned[i] < 3) return;
      this.hordeSpawned[i] = g.day;
      for (let k = 0; k < h.n; k++) {
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * (2 + h.n * 0.35);
        const x = h.x + Math.cos(a) * r, z = h.z + Math.sin(a) * r;
        if (g.phys.blocked(x, 0.1, z, 0.4, 1.7) || shellAt(g.world, x, z)) continue;
        const zb = this.spawnAt(this.pickType(districtAt(g.plan, x, z)), x, z, { horde: true });
        zb.horde = true;
      }
    });
    this.siege(dt, px, pz);
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 0.7;
    const here = districtAt(g.plan, px, pz);
    let want = (DENSITY[here] ?? 10) * INF_MUL[blockAt(g.plan, px, pz)?.inf ?? 1];
    if (g.isNight()) want = Math.round(want * 1.45);
    want = Math.round(want * g.settings.zombieMul);
    const free = this.list.filter(z => !z.dead && !z.guard && !z.quest && !z.horde).length;
    if (free >= want || this.list.length > 110) return;
    // до трёх за тик, кольцом 45–90 м
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 45;
      const x = px + Math.cos(a) * r, z = pz + Math.sin(a) * r;
      const d = districtAt(g.plan, x, z);
      if (d === 'camp' || d === 'sea' || g.world.isInWater(x, z)) continue;
      if (Math.abs(x) > WORLD - 20 || Math.abs(z) > WORLD - 20) continue;
      if (g.inCamp(x, z, g.plan.camp.r + 14)) continue;
      if (shellAt(g.world, x, z)) continue;
      if (g.phys.blocked(x, 0.1, z, 0.45, 1.7)) continue;
      if (g.phys.groundAt(x, z, 0.5) > 0.3) continue;
      // часть групп стоит толпой
      const n = Math.random() < 0.25 ? 2 + Math.floor(Math.random() * 3) : 1;
      for (let i = 0; i < n; i++) {
        const zx = x + (Math.random() - 0.5) * 4, zz = z + (Math.random() - 0.5) * 4;
        if (!g.phys.blocked(zx, 0.1, zz, 0.45, 1.7)) this.spawnAt(this.pickType(d), zx, zz, { speedMul: g.isNight() ? 1.15 : 1 });
      }
    }
  }

  // осада: иногда ночью к лагерю идёт толпа. Пока игрок в лагере или рядом, раз в ночь с шансом;
  // мертвецы появляются за стеной и идут на шум лагеря, жители отбиваются (camplife)
  siege(dt, px, pz) {
    const g = this.g, camp = g.plan.camp;
    if (!camp || !g.isNight() || g.day < 2) return;
    const night = g.day + (g.hour < 12 ? -0.5 : 0); // ночь после полуночи — та же ночь
    if (this.siegeNight === night) return;
    if (Math.hypot(camp.x - px, camp.z - pz) > 90) return;
    this.siegeNight = night;
    if (Math.random() > 0.45) return;
    const n = 12 + Math.floor(Math.random() * 8);
    const a0 = Math.random() * 6.28;
    let made = 0;
    for (let k = 0; k < n * 3 && made < n; k++) {
      const a = a0 + (Math.random() - 0.5) * 0.9, r = camp.r + 40 + Math.random() * 18;
      const x = camp.x + Math.cos(a) * r, z = camp.z + Math.sin(a) * r;
      if (g.world.isInWater(x, z) || Math.abs(x) > WORLD - 20 || Math.abs(z) > WORLD - 20) continue;
      if (shellAt(g.world, x, z) || g.phys.blocked(x, 0.1, z, 0.45, 1.7)) continue;
      const zb = this.spawnAt(this.pickType('residential'), x, z, { speedMul: 1.1 });
      zb.horde = true; zb.state = 'investigate'; zb.target = { x: camp.x + (Math.random() - 0.5) * 8, z: camp.z + camp.r + 2 };
      made++;
    }
    if (made) g.ui.toast('К лагерю идут мертвецы!');
  }

  // ---------- кадр ----------
  update(dt) {
    const g = this.g, p = g.player;
    this.populate(dt);
    // след игрока
    const pp = p.vehicle ? p.vehicle.pos : p.pos;
    const last = this.crumbs[this.crumbs.length - 1];
    if (!last || Math.hypot(last.x - pp.x, last.z - pp.z) > 2) {
      this.crumbs.push({ x: pp.x, z: pp.z });
      if (this.crumbs.length > 90) this.crumbs.shift();
    }
    this.groanT -= dt;
    // шум от игрока (шаги, мотор)
    if (p.noise > 0) this.hearNoise(pp, p.noise, true);

    const night = g.isNight();
    const sight = (night ? (p.light ? 18 : 11) : 26) * (p.crouch ? 0.6 : 1);
    const list = this.list;
    for (let i = 0; i < list.length; i++) {
      const z = list[i];
      const dx = pp.x - z.pos.x, dz = pp.z - z.pos.z;
      const dist = Math.hypot(dx, dz);
      // LOD: дальних обновляем реже
      z.lod = dist > 80 ? 4 : dist > 45 ? 2 : 1;
      z.acc = (z.acc || 0) + dt;
      if ((g.frame + i) % z.lod) continue;
      const zdt = Math.min(0.25, z.acc); z.acc = 0;
      z.c.root.visible = dist < g.viewDist + 10;
      // тень только у ближних: скелетные модели в проходе теней — самая дорогая часть кадра
      const sh = dist < 24;
      if (sh !== z.c.shadow) { z.c.shadow = sh; for (const m of z.c.meshes) m.castShadow = sh; }
      if (z.dead) { z.deadT += zdt; if (z.c.root.visible) z.c.mixer.update(zdt); if (z.deadT > 52) z.c.root.position.y -= zdt * 0.25; continue; }
      this.think(z, zdt, dist, dx, dz, sight, pp);
      if (z.c.root.visible) z.c.mixer.update(zdt);
      z.c.root.position.copy(z.pos);
      // покачивание на месте («движение покоя»)
      z.c.root.rotation.y = z.yaw + (z.state === 'idle' ? Math.sin(g.time * 0.9 + z.sway) * 0.15 : 0);
      // руки поправляем у ближних в каждом кадре, где обновилась анимация: через кадр поза скакала и руки тряслись
      if (z.c.root.visible && dist < 25) relaxArms(z.c, z.T.cult ? 0.3 : 0.45);
      if (z.wmesh) { z.wmesh.visible = z.c.root.visible; if (z.c.root.visible) { const fk = (WHOLD[z.weapon] || {}).fingK ?? 0.1; poseHeld(z.wmesh, z.c.hand, Math.sin(z.yaw), Math.cos(z.yaw), z.atkT > 0 ? Math.max(0.8, fk) : fk); } }
    }
    // расталкивание
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || a.lod > 1) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = a.r + b.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2), k = (rr - d) / d * 0.5;
          a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k;
        }
      }
    }
  }

  think(z, dt, dist, dx, dz, sight, pp) {
    const g = this.g, p = g.player, T = z.T;
    const inVeh = !!p.vehicle;
    const flying = inVeh && p.vehicle.kind === 'plane' && p.vehicle.air;
    const targetable = !p.dead && !flying && !(inVeh && p.vehicle.kind === 'boat');
    // зрение (раз в 0.3 с)
    z.lookT -= dt;
    if (z.lookT <= 0 && targetable) {
      z.lookT = 0.3;
      const fwdDot = (dx * -Math.sin(z.yaw + Math.PI) + dz * -Math.cos(z.yaw + Math.PI)) / Math.max(0.01, dist);
      const canSee = dist < 3.5 || (dist < sight && (fwdDot > 0.1 || z.state !== 'idle') && this.los(z, pp));
      if (canSee) {
        if (z.state !== 'chase') { z.state = 'chase'; this.voice(z, 'alert'); }
        z.alertT = 6; z.seen = true; z.crumb = -1;
        z.target = pp;
      } else z.seen = false;
      if (z.state === 'chase' && !canSee) { z.alertT -= 0.3; if (z.alertT <= 0) { z.state = 'investigate'; z.target = { x: pp.x, z: pp.z }; } }
    }
    if (!targetable && z.state === 'chase') { z.state = 'investigate'; z.target = { x: pp.x, z: pp.z }; }
    // стон
    if (dist < 28) { if (!T.cult) this.voice(z, z.state === 'chase' ? 'chase' : 'idle'); this.steps(z, dt, dist); }

    // отброс и оглушение
    if (z.kx || z.kz) {
      g.phys.moveCircle(z.pos, wallR(z), z.h, z.kx * dt, z.kz * dt);
      z.kx *= Math.max(0, 1 - dt * 6); z.kz *= Math.max(0, 1 - dt * 6);
      if (Math.abs(z.kx) + Math.abs(z.kz) < 0.1) z.kx = z.kz = 0;
    }
    if (z.stagger > 0) { z.stagger -= dt; return; }
    if (T.cult && this.thinkCult(z, dt, dist, dx, dz, pp, targetable)) return;

    // атака
    if (z.atkT > 0) {
      z.atkT -= dt;
      z.yaw = Math.atan2(dx, dz);
      if (!z.atkHit && z.atkT < 0.65) {
        z.atkHit = true;
        if (targetable && dist < z.r + 0.35 + 1.0) {
          if (inVeh) { p.vehicle.damage((z.dmg || T.dmg) * 0.5, 'zombie'); }
          else {
            p.damage(z.dmg || T.dmg, T.cult ? 'cultist' : 'zombie', z.pos);
            if (T.shove) { const k = 1 / Math.max(0.1, dist); g.phys.moveCircle(p.pos, p.r, p.h, dx * k * 1.4, dz * k * 1.4); g.camCtl.shake = 0.6; }
          }
          audio.play('hit', p.pos, { vol: 0.5, rate: 0.8 });
        }
      }
      if (z.atkT <= 0) this.play(z, 'Idle', 0.15);
      return;
    }
    if (z.state === 'chase' && targetable && dist < z.r + 0.35 + 0.75 && (dist < 0.8 || this.los(z, pp))) {
      z.atkT = T.cult ? 0.95 : 1.15; z.atkHit = false;
      if (T.cult) { audio.play(z.weapon === 'chainsaw' ? 'chop' : 'swing', z.pos, { vol: z.weapon === 'chainsaw' ? 0.8 : 0.5 }); this.play(z, z.weapon === 'fists' ? 'Punch' : 'Slash', 0.08, true, 1.15); }
      else { this.voice(z, 'attack'); this.play(z, T.low ? 'HitReact' : 'Punch', 0.1, true, 1.1); }
      return;
    }

    // куда идём
    let tx = null, tz = null, speed = 0, anim = 'Idle', rate = 1;
    if (z.state === 'chase') {
      if (z.seen || dist < 4) { tx = pp.x; tz = pp.z; }
      // игрок в здании, а зомби снаружи (или наоборот) — сначала к двери, а не в стену
      else {
        // по следу: самая свежая видимая крошка
        if (z.crumb < 0 || (z.crumbT = (z.crumbT || 0) - dt) <= 0) { z.crumb = this.findCrumb(z); z.crumbT = 0.6; }
        const c = this.crumbs[z.crumb];
        if (c) { tx = c.x; tz = c.z; if (Math.hypot(c.x - z.pos.x, c.z - z.pos.z) < 1.2) z.crumb = Math.min(this.crumbs.length - 1, z.crumb + 1); }
        else { tx = pp.x; tz = pp.z; }
      }
      const dr = this.doorFor(z, pp);
      if (dr) { tx = dr.x; tz = dr.z; }
      // культисты с холодным заходят с боков: каждый держит свою сторону, пока не подойдёт близко
      else if (T.cult && z.weapon !== 'pistol' && dist > 3.5) {
        if (!z.flank) z.flank = (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.5);
        const k = Math.min(7, dist * 0.45) * z.flank;
        tx += -dz / dist * k; tz += dx / dist * k;
      }
      speed = T.speed * z.speedMul * (g.isNight() ? 1.12 : 1);
      anim = T.run; rate = T.runRate * (z.c.rateMul || 1) * Math.min(1.6, speed / T.speed);
    } else if (z.state === 'investigate' && z.target) {
      tx = z.target.x; tz = z.target.z;
      speed = Math.min(T.speed, 1.6) * z.speedMul; anim = T.low ? 'Crawl' : 'Walk'; rate = 1;
      if (Math.hypot(tx - z.pos.x, tz - z.pos.z) < 2) { z.state = 'idle'; z.target = null; }
    } else {
      // бродят понемногу
      z.wanderT -= dt;
      if (z.wanderT <= 0) {
        z.wanderT = 3 + Math.random() * 6;
        if (Math.random() < 0.45) { const a = Math.random() * 6.28; z.wx = z.pos.x + Math.cos(a) * 6; z.wz = z.pos.z + Math.sin(a) * 6; }
        else z.wx = null;
      }
      if (z.wx != null && !z.guard) { tx = z.wx; tz = z.wz; speed = 0.55; anim = T.low ? 'Crawl' : 'Walk'; rate = 0.55; if (Math.hypot(tx - z.pos.x, tz - z.pos.z) < 1) z.wx = null; }
    }
    if (tx != null && speed > 0) {
      let mx = tx - z.pos.x, mz = tz - z.pos.z;
      const md = Math.hypot(mx, mz) || 1;
      mx /= md; mz /= md;
      // обход: если застрял — шаг в сторону
      if (z.sideT > 0) { z.sideT -= dt; const sx = -mz * z.side, sz = mx * z.side; mx = mx * 0.3 + sx; mz = mz * 0.3 + sz; }
      z.yaw = lerpAngle(z.yaw, Math.atan2(mx, mz), Math.min(1, dt * 8));
      const step = Math.min(md, speed * dt);
      g.phys.moveCircle(z.pos, wallR(z), z.h, mx * step, mz * step, T.low ? 0.45 : 1.2);
      z.stuckT += dt;
      if (z.stuckT > 1.2) {
        const moved = Math.hypot(z.pos.x - z.lastX, z.pos.z - z.lastZ);
        if (moved < speed * 0.35) { z.sideT = 0.9; z.side = Math.random() < 0.5 ? 1 : -1; }
        z.stuckT = 0; z.lastX = z.pos.x; z.lastZ = z.pos.z;
      }
      this.play(z, anim, 0.25, false, rate);
    } else this.play(z, 'Idle', 0.3);
    // опора
    z.pos.y = g.phys.groundAt(z.pos.x, z.pos.z, z.pos.y, z.r * 0.6);
  }

  // культист: стрелок держит дистанцию и стреляет, раненый отступает, без цели бродит у своего костра
  thinkCult(z, dt, dist, dx, dz, pp, targetable) {
    const g = this.g, T = z.T;
    const toYaw = Math.atan2(dx, dz);
    if (z.fleeT > 0) {
      z.fleeT -= dt;
      z.yaw = lerpAngle(z.yaw, toYaw + Math.PI, Math.min(1, dt * 8));
      const sp = T.speed * 1.1 * dt;
      g.phys.moveCircle(z.pos, z.r + 0.2, z.h, Math.sin(z.yaw) * sp, Math.cos(z.yaw) * sp, 1.2);
      this.play(z, 'Run', 0.2);
      z.pos.y = g.phys.groundAt(z.pos.x, z.pos.z, z.pos.y, z.r * 0.6);
      return true;
    }
    if (z.weapon === 'pistol' && z.state === 'chase' && targetable && z.seen && dist < 20) {
      z.yaw = lerpAngle(z.yaw, toYaw, Math.min(1, dt * 8));
      if (dist < 6) {
        // слишком близко — пятится
        const sp = 2.2 * dt;
        g.phys.moveCircle(z.pos, z.r + 0.2, z.h, -Math.sin(toYaw) * sp, -Math.cos(toYaw) * sp, 1.2);
        this.play(z, 'Walk', 0.2, false, -1);
      } else this.play(z, z.c.actions.Aim ? 'Aim' : 'Idle_Gun', 0.2);
      z.shootT -= dt;
      if (z.shootT <= 0) { z.shootT = 1.1 + Math.random() * 1.2; this.cultShoot(z, dist); }
      z.pos.y = g.phys.groundAt(z.pos.x, z.pos.z, z.pos.y, z.r * 0.6);
      return true;
    }
    // без цели: топчутся у своего места
    if (z.state === 'idle' && z.home) {
      z.wanderT -= dt;
      if (z.wanderT <= 0) { z.wanderT = 3 + Math.random() * 5; const a = Math.random() * 6.28, r = Math.random() * 5; z.wx = z.home.x + Math.cos(a) * r; z.wz = z.home.z + Math.sin(a) * r; }
      const mx = z.wx - z.pos.x, mz = z.wz - z.pos.z, md = Math.hypot(mx, mz);
      if (md > 0.6) {
        z.yaw = lerpAngle(z.yaw, Math.atan2(mx, mz), Math.min(1, dt * 5));
        const sp = Math.min(md, 1.1 * dt);
        g.phys.moveCircle(z.pos, z.r + 0.2, z.h, mx / md * sp, mz / md * sp, 1.2);
        this.play(z, 'Walk', 0.3);
      } else this.play(z, 'Idle', 0.3);
      z.pos.y = g.phys.groundAt(z.pos.x, z.pos.z, z.pos.y, z.r * 0.6);
      return true;
    }
    return false;
  }
  // выстрел культиста: неточный, чем дальше — тем реже попадает
  cultShoot(z, dist) {
    const g = this.g, p = g.player;
    const m = new THREE.Vector3(z.pos.x + Math.sin(z.yaw) * 0.5, z.pos.y + 1.4, z.pos.z + Math.cos(z.yaw) * 0.5);
    let chance = Math.max(0.1, Math.min(0.5, 0.55 - dist * 0.025));
    if (p.crouch) chance *= 0.7;
    if (p.sprinting) chance *= 0.6;
    const hit = Math.random() < chance;
    const to = new THREE.Vector3(p.pos.x + (hit ? 0 : (Math.random() - 0.5) * 3), p.pos.y + 1.2 + (hit ? 0 : (Math.random() - 0.3) * 1.5), p.pos.z + (hit ? 0 : (Math.random() - 0.5) * 3));
    audio.play('pistol', z.pos, { vol: 0.8, range: 50 });
    g.fx.flash(m);
    g.fx.tracer(m, to);
    this.hearNoise(z.pos, 40);
    if (hit) { if (p.vehicle) p.vehicle.damage(6, 'shot'); else p.damage(11, 'cultist', z.pos); }
    else g.fx.impact(to, null);
  }

  // путь через дверь: точка у двери снаружи и шаг внутрь
  doorFor(z, pp) {
    const w = this.g.world;
    const ps = shellAt(w, pp.x, pp.z), zs = shellAt(w, z.pos.x, z.pos.z);
    z.thin = false;
    if (ps === zs) return null;
    const s = zs || ps;
    if (!s.door || !s.inside) return null;
    const dx = s.inside.x - s.door.x, dz = s.inside.z - s.door.z, L = Math.hypot(dx, dz) || 1;
    const inPt = { x: s.door.x + dx / L * 2.6, z: s.door.z + dz / L * 2.6 };
    const near = (q, r) => Math.hypot(q.x - z.pos.x, q.z - z.pos.z) < r;
    // в проёме держимся от стен только на свой радиус: с запасом для рук (wallR) дверь 1.6 м была впритык и мертвецы застревали
    z.thin = near({ x: s.door.x + dx / L * 1.2, z: s.door.z + dz / L * 1.2 }, 2.4);
    // насколько продвинулся вдоль оси двери наружу от точки перед проёмом (раньше выбор шёл по радиусу 0.9 м:
    // отойдя от точки к двери, мертвец снова получал её целью и топтался в проёме)
    const out = ((z.pos.x - inPt.x) * -dx + (z.pos.z - inPt.z) * -dz) / L;
    const side = Math.abs(((z.pos.x - inPt.x) * dz - (z.pos.z - inPt.z) * dx) / L); // сбоку от оси
    if (zs) return out > -0.6 && side < 1.2 ? s.door : inPt;   // выходит: к проёму изнутри, потом наружу
    return out < 2 && side < 1.2 ? inPt : s.door;             // входит: к двери снаружи, потом внутрь
  }

  los(z, pp) {
    const g = this.g;
    const oy = z.pos.y + z.h * 0.85, ty = (pp.y || 0) + 1.5;
    const dx = pp.x - z.pos.x, dy = ty - oy, dz = pp.z - z.pos.z;
    const d = Math.hypot(dx, dy, dz);
    if (d < 0.5) return true;
    const h = g.phys.raycast(z.pos.x, oy, z.pos.z, dx / d, dy / d, dz / d, d);
    return !h || h.t > d - 0.6 || (h.box.ref && h.box.ref === g.player.vehicle);
  }

  findCrumb(z) {
    const g = this.g;
    const cr = this.crumbs;
    let near = -1, nd = 1e9;
    for (let i = cr.length - 1, k = 0; i >= 0 && k < 30; i--, k++) {
      const c = cr[i];
      const dx = c.x - z.pos.x, dz = c.z - z.pos.z, d = Math.hypot(dx, dz);
      if (d < nd) { nd = d; near = i; }
      if (d > 50) continue;
      const h = g.phys.raycast(z.pos.x, z.pos.y + 1, z.pos.z, dx / d, 0, dz / d, d);
      if (!h || h.t > d - 0.4) return i;
    }
    return near;
  }

  // шум: все в радиусе идут на звук, ближние сразу в погоню
  hearNoise(pos, radius, fromPlayer = false) {
    for (const z of this.list) {
      if (z.dead) continue;
      const d = Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z);
      if (d > radius) continue;
      if (z.state === 'chase') { z.alertT = Math.max(z.alertT, 4); continue; }
      if (fromPlayer && d < radius * 0.45) { z.state = 'chase'; z.alertT = 4; z.target = pos; }
      else { z.state = 'investigate'; z.target = { x: pos.x + (Math.random() - 0.5) * 6, z: pos.z + (Math.random() - 0.5) * 6 }; }
    }
  }

  // ---------- урон ----------
  // луч против всех живых: {z, t, head}
  raycast(o, d, maxT, ignore) {
    let best = null, bt = maxT;
    for (const z of this.list) {
      if (z.dead || (ignore && ignore.has(z))) continue;
      const dx = z.pos.x - o.x, dz = z.pos.z - o.z;
      if (dx * dx + dz * dz > (bt + 2) * (bt + 2)) continue;
      const t = rayCylinder(o.x, o.y, o.z, d.x, d.y, d.z, z.pos.x, z.pos.y, z.pos.z, z.r * (z.T.boss ? 1 : 1.05), z.h, bt);
      if (t !== null && t < bt) {
        bt = t;
        const y = o.y + d.y * t;
        best = { z, t, head: y > z.pos.y + z.h * (z.T.low ? 0.55 : 0.8) };
      }
    }
    return best;
  }

  inCone(pos, fwd, range, halfAngle) {
    const cos = Math.cos(halfAngle);
    const out = [];
    for (const z of this.list) {
      if (z.dead) continue;
      const dx = z.pos.x - pos.x, dz = z.pos.z - pos.z;
      const d = Math.hypot(dx, dz) - z.r;
      if (d > range) continue;
      if (d > 0.4 && (dx * fwd.x + dz * fwd.z) / Math.hypot(dx, dz) < cos) continue;
      out.push({ z, d });
    }
    out.sort((a, b) => a.d - b.d);
    return out.map(o => o.z);
  }

  hit(z, dmg, dir, knock = 0.6, head = false, src = null) {
    if (z.dead) return;
    z.hp -= dmg;
    const kb = knock * (z.T.boss ? 0.2 : z.T.shove ? 0.4 : 1);
    if (dir) { z.kx += dir.x * kb * 2.2; z.kz += dir.z * kb * 2.2; }
    z.state = 'chase'; z.alertT = 6; z.target = this.g.player.pos;
    if (head && this.g.ui) this.g.ui.hitmark(true);
    else if (this.g.ui) this.g.ui.hitmark(false);
    if (z.hp <= 0) return this.die(z, src, head);
    if (z.T.cult) { if (z.hp < z.maxHp * 0.35 && !z.fled && Math.random() < 0.6) { z.fled = true; z.fleeT = 2.5 + Math.random() * 2; } }
    else this.voice(z, 'hurt');
    if (dmg > z.maxHp * 0.3 || kb > 2) { z.stagger = Math.min(0.6, 0.15 + kb * 0.1); this.play(z, 'HitReact', 0.05, true); z.atkT = 0; }
  }

  die(z, src, head) {
    z.dead = true; z.deadT = 0; z.state = 'dead';
    this.play(z, 'Death', 0.08, true);
    if (!z.T.cult) this.voice(z, 'die');
    else audio.play('hitHeavy', z.pos, { vol: 0.6 });
    this.killed++;
    const g = this.g;
    if (src === g.player || src === 'vehicle' || src === 'explosion') g.player.kills++;
    // дроп
    let items = z.loot ? z.loot.slice() : rollLoot(z.T.boss ? 'boss' : z.T.cult ? 'cultist' : 'zombie', Math.random);
    // бензопила выпадает редко: чаще она разбита в бою
    if (z.T.cult && z.weapon && z.weapon !== 'fists' && (z.weapon !== 'chainsaw' || Math.random() < 0.3)) items.unshift(z.weapon === 'pistol' ? { id: 'pistol', n: 1, mag: Math.floor(Math.random() * 7) } : { id: z.weapon, n: 1 });
    if (z.wmesh && z.wmesh.parent) { z.wmesh.parent.remove(z.wmesh); z.wmesh = null; }
    // обыскивается само тело (без ящика); у Мясника — сумка, она остаётся
    if (items.length) z.drop = g.loot.drop(z.pos.x, z.pos.z, items, z.T.boss ? 'Останки Мясника' : 'Обыскать карманы', z.T.boss ? 'bag' : 'body');
    g.quests.onKill(z);
    if (g.ui) g.ui.killmark(head);
  }

  // взрыв/огонь: урон по радиусу
  explode(pos, radius, dmg, src = 'explosion', fire = false) {
    for (const z of this.list) {
      if (z.dead) continue;
      const dx = z.pos.x - pos.x, dz = z.pos.z - pos.z, d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const k = fire ? 1 : 1 - d / radius * 0.7;
      const dir = tmp.set(dx / (d || 1), 0, dz / (d || 1));
      this.hit(z, dmg * k, fire ? null : dir, fire ? 0 : 4 * k, false, src);
    }
  }
}

export function lerpAngle(a, b, t) {
  const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

const skinOk = {};
function hasSkin(k) {
  if (skinOk[k] === undefined) { let s = false; Assets.gltf[k].scene.traverse(o => { if (o.isSkinnedMesh) s = true; }); skinOk[k] = s; }
  return skinOk[k];
}

// радиус для стен: вытянутые руки не должны пролезать сквозь стену. Толстяк и Мясник растянуты вширь,
// руки у них длиннее — запас больше (друг с другом зомби толкаются по обычному z.r)
// модели с почти чёрной текстурой: в тумане и под затемнением мертвеца читались чёрным силуэтом
const BRIGHT = {}; // { модель: множитель } — psx_k_killer_03 был здесь, но его убрали из выбора
// во сколько раз больше бродячих мертвецов в квартале по его заражённости (0 тихо … 3 кишит)
const INF_MUL = [0.35, 1, 1.7, 2.6];
const blockAt = (plan, x, z) => plan.blocks.find(b => Math.abs(x - b.cx) <= PITCH / 2 && Math.abs(z - b.cz) <= PITCH / 2);

function wallR(z) { return z.thin ? z.r : z.r + (z.T.shove ? 0.8 : z.T.cult ? 0.25 : 0.4); }
