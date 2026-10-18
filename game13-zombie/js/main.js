// Точка входа: загрузка, сборка мира, игровой цикл, сутки и свет, взаимодействия, сохранения.
import * as THREE from 'three';
import { Renderer } from './render.js';
const STYLE_OK = ['hyb', 'ps1'];
import { Assets, loadAll, loadSelection, Selection, SAT, TINT, relaxArms } from './assets.js';
import { Physics } from './physics.js';
import { bakeEnv } from './envkit.js';

const ENV_PACKS = ['env_building', 'env_urban_roads', 'env_urban_fences', 'env_urban_litter', 'env_urban_bus_stops', 'env_urban_traffic_lights',
  'env_urban_cones_barriers', 'env_urban_buildings_prebuild', 'env_urban_building_parts', 'env_urban_pipes', 'env_urban_vents', 'env_cars', 'env_trees',
  'env_camp', 'env_items', 'env_interior', 'env_office',
  // v2.8: внешние паки с itch.io (CREDITS.md)
  'env_x_street', 'env_x_trash', 'env_x_furn', 'env_x_items', 'env_x_survival', 'env_x_camp', 'env_x_houses', 'env_x_rocks'];
import { World, shellAt } from './world.js';
import { buildPlan, districtAt, onRoad, blockCenter } from './city.js';
import { Input, initInput, beginFrame, endFrame, requestLock } from './input.js';
import { Player, ThirdPersonCamera } from './player.js';
import { Zombies } from './zombies.js';
import { FX } from './fx.js';
import { Vehicles } from './vehicles.js';
import { Quests } from './quests.js';
import { CampLife } from './camplife.js';
import { HEROES } from './heroes.js';
import { installInteractions } from './interact.js';
import { Loot } from './loot.js';
import { UI } from './ui.js';
import { ITEMS, WEAPONS, POCKET_SLOTS } from './items.js';
import { audio, SILENT } from './audio.js';

// v1 (папка v1/) хранит свой сейв отдельно
const SAVE_KEY = 'zcity_save_v2', SET_KEY = 'zcity_settings_v1';
// ВРЕМЕННО для проверки: сутки за 1 минуту (было 24 * 60 — 24 минуты)
const DAY_SEC = 10 * 60; // реальных секунд в игровых сутках: 10 минут (решение пользователя 17.10)

class Game {
  constructor() {
    this.state = 'loading';
    this.time = 0;          // реальное время в игре, с
    this.day = 0;
    this.hour = 7;
    this.frame = 0;
    this.viewDist = 180;
    this.settings = Object.assign({ style: 'hyb', quality: 1, sens: 1, volume: 0.8, invertY: false, zombieMul: 1 }, readJSON(SET_KEY));
    this.stash = { items: [], cap: 24, resize(n) { this.cap = n; } };
    this.saveT = 0;
    this.power = false;
  }

  async init() {
    const canvas = document.getElementById('c');
    this.renderer = new Renderer(canvas);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 900);
    initInput(canvas);
    if (Input.isTouch && !readJSON(SET_KEY)) this.settings.quality = 0.8;
    this.ui = new UI(this);
    this.applySettings();
    this.resize();
    addEventListener('resize', () => this.resize());
    // первый жест разблокирует звук (в тест-режиме ?silent=1 звук не создаётся вовсе)
    // фон (ветер, ночь) — процедурный, из общей библиотеки shared/sfx.js; в тест-режиме не грузится вовсе
    if (!SILENT) { const sc = document.createElement('script'); sc.src = '../shared/sfx.js'; document.head.appendChild(sc); }
    const unlock = () => audio.unlock();
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);

    await loadSelection();
    const fails = await loadAll((k, key) => this.ui.loading(k * 0.85, 'Загрузка моделей'));
    if (fails.length) console.warn('не загрузились', fails);
    // окружение PSX: детали паков → шаблоны (дома, улица, машины, интерьер, лагерь)
    this.ui.loading(0.86, 'Загрузка города');
    await bakeEnv(ENV_PACKS, '', k => this.ui.loading(0.86 + k * 0.08, 'Загрузка города'));
    for (const t of Assets.textures) this.renderer.trackTexture(t);
    this.ui.loading(0.88, 'Строю город');
    await tick();

    this.lights();
    this.plan = buildPlan(1337);
    this.phys = new Physics();
    this.world = new World(this.scene, this.phys, this.plan, this.renderer);
    this.world.build();
    this.ui.loading(0.95, 'Расставляю машины');
    await tick();
    this.fx = new FX(this);
    this.zombies = new Zombies(this);
    this.loot = new Loot(this);
    this.vehicles = new Vehicles(this);
    this.vehicles.build(this.plan);
    this.quests = new Quests(this);
    this.quests.spawnNpcs(this.plan);
    this.camp = new CampLife(this);
    this.camp.build(this.plan, this.quests.npcs);
    this.player = new Player(this, this.heroKey());
    this.camCtl = new ThirdPersonCamera(this.camera, this.phys);
    this.fx.smokeCols = this.smokeSpots();
    this.ui.bakeMap();
    this.placeStart();
    this.update(0.016, true);
    this.ui.hideLoading();
    this.state = 'menu';
    this.ui.show('menu');
    this.last = performance.now();
    requestAnimationFrame(t => this.loop(t));
    window.__game = this;
    // отладка: прокрутить мир на sec секунд и отрисовать кадр синхронно
    window.__step = (sec = 0.1) => { const n = Math.max(1, Math.round(sec / 0.033)); for (let i = 0; i < n; i++) { beginFrame(); if (!this.ui.open) this.update(0.033); endFrame(); } this.renderer.render(this.scene, this.camera); };
  }

  // ---------- свет и атмосфера ----------
  lights() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0x9aa6b0, 0x3a3d38, 0.9);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xc8d0d8, 1.6);
    this.sun.castShadow = this.renderer.style.shadows;
    const sz = Input.isTouch ? 1024 : 2048;
    this.sun.shadow.mapSize.set(sz, sz);
    const sc = this.sun.shadow.camera;
    sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    s.add(this.sun, this.sun.target);
    this.renderer.shadowLights.add(this.sun);
    this.flash = new THREE.SpotLight(0xffe2b8, 0, 34, 0.42, 0.55, 1.3);
    this.flash.target = new THREE.Object3D();
    s.add(this.flash, this.flash.target);
    this.campLight = new THREE.PointLight(0xffb070, 0, 40, 1.4);
    s.add(this.campLight);
    s.fog = new THREE.FogExp2(0x8e979c, 0.007);
    s.background = new THREE.Color(0x8e979c);
  }

  isNight() { return this.hour < 5.5 || this.hour >= 20.5; }
  dusk() { return this.hour < 7 || this.hour >= 19; }

  updateSky() {
    const h = this.hour;
    // 0 ночью, 1 днём, плавные сумерки 5–7.5 и 18.5–21
    const k = h < 5 || h > 21 ? 0 : h < 7.5 ? smooth((h - 5) / 2.5) : h > 18.5 ? smooth((21 - h) / 2.5) : 1;
    this.dayK = k;
    const fogDay = new THREE.Color(0x8e979c), fogNight = new THREE.Color(0x0c1117), fogDusk = new THREE.Color(0x5a5a68);
    const c = fogNight.clone().lerp(k < 0.5 ? fogDusk : fogDay, k < 0.5 ? k * 2 : 1).lerp(fogDay, k > 0.5 ? (k - 0.5) * 2 : 0);
    this.scene.fog.color.copy(c);
    this.scene.background.copy(c);
    const fm = this.renderer.style.fogMul;
    this.scene.fog.density = (0.0062 + (1 - k) * 0.016) * fm;
    this.viewDist = Math.round((110 + k * 90) / Math.sqrt(fm));
    this.camera.far = this.viewDist * 2;
    this.camera.updateProjectionMatrix();
    // один холодный источник: пасмурное солнце днём, луна ночью
    const sunCol = new THREE.Color(0x6d82a8).lerp(new THREE.Color(0xc8d0d8), k);
    this.sun.color.copy(sunCol);
    // с r155 свет физический: старые значения умножаем на π
    this.sun.intensity = (0.3 + k * 1.2) * Math.PI;
    this.hemi.intensity = (0.3 + k * 1.3) * Math.PI; // пасмурно: рассеянный свет сильнее солнца
    this.hemi.color.set(0x26324a).lerp(new THREE.Color(0x9aa6b0), k);
    this.hemi.groundColor.set(0x14161a).lerp(new THREE.Color(0x55584f), k);
    SAT.value = 0.42 + k * 0.1;
    TINT.value.set(0xb8c4d8).lerp(new THREE.Color(0xd8dee6), k);
    // солнце ходит по небу, луна стоит выше и с другой стороны
    const a = (h / 24) * Math.PI * 2;
    this.sunDir = k > 0.2 ? new THREE.Vector3(Math.cos(a) * 0.6, 0.75, 0.35).normalize() : new THREE.Vector3(-0.4, 0.8, -0.45).normalize();
  }

  updateLights() {
    const p = this.player;
    const c = p.vehicle ? p.vehicle.pos : p.pos;
    // тень следует за игроком, привязка к текселю убирает дрожание
    const step = 84 / this.sun.shadow.mapSize.x;
    const tx = Math.round(c.x / step) * step, tz = Math.round(c.z / step) * step;
    this.sun.target.position.set(tx, 0, tz);
    this.sun.position.set(tx + this.sunDir.x * 120, this.sunDir.y * 120, tz + this.sunDir.z * 120);
    // фонарик: тёплый круг света
    const on = p.light && !p.vehicle && !p.dead && this.dayK < 0.75;
    this.flash.intensity = on ? 46 * (1 - this.dayK * 0.8) : 0;
    if (on) {
      const cam = this.camera;
      const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
      this.flash.position.set(p.pos.x - Math.sin(p.yaw) * 0.3, p.pos.y + 1.45, p.pos.z - Math.cos(p.yaw) * 0.3);
      this.flash.target.position.copy(cam.position).addScaledVector(d, 18);
    }
    const camp = this.plan.camp;
    this.campLight.position.set(camp.x, 6, camp.z);
    this.campLight.intensity = this.power && this.dayK < 0.6 ? 30 : 0;
  }

  smokeSpots() {
    const out = [];
    for (const [gx, gz] of [[5, 2], [9, 6], [3, 4], [7, 10], [11, 1]]) { const [x, z] = blockCenter(gx, gz); out.push({ x, z, t: Math.random() }); }
    out.push({ x: this.plan.military.x + 30, z: this.plan.military.z, t: 0 });
    return out;
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.resize(w, h);
    this.camera.aspect = w / h;
    // в портрете шире угол, чтобы видеть по бокам
    this.camCtlFov = w < h ? 74 : 62;
    if (this.camCtl) this.camCtl.fovBase = this.camCtlFov;
    this.camera.updateProjectionMatrix();
  }

  applySettings() {
    const s = this.settings;
    this.renderer.renderScale = s.quality;
    if (!STYLE_OK.includes(s.style)) s.style = 'hyb'; // «Чёткий» убран из выбора
    this.renderer.setStyle(s.style);
    if (this.sun) this.sun.castShadow = this.renderer.style.shadows;
    Input.sens = s.sens; Input.invertY = s.invertY;
    audio.setVolume(s.volume);
    try { localStorage.setItem(SET_KEY, JSON.stringify(s)); } catch (e) {}
    this.resize();
  }

  // ---------- старт, смерть, сон ----------
  placeStart() {
    const s = this.plan.start, p = this.player;
    p.pos.set(s.x, 0, s.z);
    p.yaw = 0; p.camYaw = 0; p.camPitch = -0.12;
  }

  starterKit() {
    const p = this.player;
    for (const k in p.eq) p.eq[k] = null;
    p.inv.slots.fill(null);
    p.resizeInv();
    // с чем герой начинает, зависит от его истории (js/heroes.js): у полицейских пистолет, у бабушки печенье и бинты
    const kit = (HEROES[p.charKey] && HEROES[p.charKey].kit) || [['bandage', 1], ['water', 1]];
    for (const [id, n] of kit) {
      const w = WEAPONS[id];
      p.give(Object.assign({ id, n }, w && w.mag ? { mag: w.mag } : {}));
    }
    p.cur = ['long1', 'pistol', 'melee'].find(s => p.eq[s]) || 'melee';
    p.weaponKey = null;
    p.refreshWeaponModel();
  }

  start(fresh) {
    if (fresh) { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} if (this.started) { location.reload(); return; } }
    this.started = true;
    if (!fresh && this.hasSave()) this.load();
    else { this.starterKit(); this.placeStart(); this.hour = 7; this.day = 0; setTimeout(() => this.ui.toast('Подойди к Михалычу в лагере. Он у костра'), 1500); }
    this.state = 'play';
    this.ui.open = null;
    this.ui.el.scr.classList.add('hide');
    document.body.classList.remove('scr-open');
    audio.unlock();
    requestLock();
    this.ui.updateLockHint();
  }

  toMenu() { location.reload(); }

  onPlayerDeath() {
    const p = this.player;
    if (p.dead) return;
    p.dead = true;
    p.hp = 0;
    if (p.vehicle) this.vehicles.exit(true);
    p.play('Death', 0.1, true); p.playUpper(null);
    // всё снаряжение остаётся в рюкзаке на месте гибели
    const items = [];
    for (const k in p.eq) if (p.eq[k]) { items.push(p.eq[k]); p.eq[k] = null; }
    for (const it of p.inv.slots) if (it) items.push(it);
    p.inv.slots.fill(null);
    for (const d of this.loot.drops.slice()) if (d.kind === 'death') this.loot.removeDrop(d);
    if (items.length) this.loot.drop(p.pos.x, p.pos.z, items, 'Твой рюкзак', 'death');
    p.refreshWeaponModel();
    audio.play('zAttack', null, { vol: 0.7 });
    setTimeout(() => this.ui.show('death'), 2200);
    this.save();
  }

  respawn() {
    const p = this.player;
    p.dead = false;
    p.hp = 100; p.stam = 100; p.food = Math.max(p.food, 60); p.water = Math.max(p.water, 60);
    p.bleed = 0; p.infect = 0; p.using = null; p.reloading = 0;
    p.resizeInv();
    this.starterKit();
    this.placeStart();
    p.play('Idle', 0.1);
    this.zombies.clear();
    this.save();
    if (!Input.isTouch) requestLock();
    this.ui.toast('Рюкзак отмечен на карте');
  }

  sleep() {
    const p = this.player;
    const add = (24 - this.hour + 7) % 24;
    this.hour = 7;
    this.day += 1;
    p.food = Math.max(5, p.food - add * 2.2);
    p.water = Math.max(5, p.water - add * 3);
    p.hp = Math.min(100, p.hp + 35);
    p.stam = 100;
    this.zombies.clear();
    this.ui.toast('Ты проспал до утра');
    this.save();
  }

  onPower() { this.power = true; }

  inCamp(x, z, r) { const c = this.plan.camp; if (r === undefined) r = c.r + 1; return Math.abs(x - c.x) < r && Math.abs(z - c.z) < r; }
  assetsOk(k) { return !!(Assets.gltf[k] || Assets.tpl[k]); }
  groundKind(x, z) {
    if (onRoad(x, z) || shellAt(this.world, x, z)) return 'hard';
    const d = districtAt(this.plan, x, z);
    return ['park', 'outskirts', 'residential', 'camp', 'airfield'].includes(d) ? 'grass' : 'hard';
  }

  // ---------- предметы ----------
  useItem(id) {
    const p = this.player;
    const d = ITEMS[id];
    if (!d || p.using || p.vehicle || p.dead || p.inv.count(id) < 1) return false;
    p.using = { item: { id }, t: d.use || 1, total: d.use || 1 };
    audio.play('bag', null, { vol: 0.4 });
    return true;
  }

  applyItem(item) {
    const p = this.player, d = ITEMS[item.id];
    if (!d || p.inv.take(item.id, 1) < 1) return;
    if (d.heal) p.hp = Math.min(100, p.hp + d.heal);
    if (d.stopBleed) p.bleed = 0;
    if (d.regen) p.regen += d.regen;
    if (d.cure) p.infect = 0;
    if (d.food) p.food = Math.max(0, Math.min(100, p.food + d.food));
    if (d.water) p.water = Math.max(0, Math.min(100, p.water + d.water));
    if (d.stam) p.stam = Math.min(100, p.stam + d.stam);
    audio.play(d.kind === 'med' ? 'bag' : 'pickup', null, { vol: 0.4 });
  }

  quickUse(kind) {
    const p = this.player;
    const has = id => p.inv.count(id) > 0;
    let order;
    if (kind === 'heal') order = p.bleed > 0 ? ['bandage', 'medkit'] : p.infect > 0 ? ['antidote', 'bandage', 'medkit'] : p.hp < 50 ? ['medkit', 'bandage', 'pills'] : ['bandage', 'pills', 'medkit'];
    else if (kind === 'eat') order = ['canned', 'beans', 'chips', 'choco'];
    else order = ['water', 'soda', 'energy'];
    const id = order.find(has);
    if (!id) { this.ui.toast({ heal: 'Нечем лечиться', eat: 'Еды нет', drink: 'Воды нет' }[kind]); return; }
    this.useItem(id);
  }

  equipFromInv(i) {
    const p = this.player, it = p.inv.slots[i];
    if (!it) return;
    const d = ITEMS[it.id];
    let slot;
    if (d.kind === 'weapon') {
      const w = WEAPONS[it.id];
      if (w.throw) slot = 'throw';
      else if (w.slot === 'long') slot = !p.eq.long1 ? 'long1' : !p.eq.long2 ? 'long2' : (p.cur === 'long2' ? 'long2' : 'long1');
      else slot = w.slot;
      if (slot === 'throw' && p.eq.throw && p.eq.throw.id === it.id) {
        const k = Math.min(it.n, d.stack - p.eq.throw.n); p.eq.throw.n += k; it.n -= k; if (!it.n) p.inv.slots[i] = null; return;
      }
    } else if (d.kind === 'gear') slot = d.gear;
    else return;
    const old = p.eq[slot];
    p.eq[slot] = it;
    p.inv.slots[i] = old || null;
    if (slot === 'bag') { const left = p.resizeInv(); if (left.length) this.dropNear(left); }
    if (d.kind === 'weapon') { p.cur = slot; p.reloading = 0; }
    p.refreshWeaponModel();
    audio.play('latch', null, { vol: 0.4 });
  }

  unequip(slot) {
    const p = this.player, it = p.eq[slot];
    if (!it) return;
    if (slot === 'bag') {
      p.eq.bag = null;
      const left = p.resizeInv();
      const rest = p.inv.add(it);
      if (rest) left.push(rest);
      if (left.length) { this.dropNear(left); this.ui.toast('Не влезло, лежит рядом'); }
      return;
    }
    if (p.inv.freeSlots() < 1) { this.ui.toast('Нет места'); return; }
    p.inv.add(it);
    p.eq[slot] = null;
    if (p.cur === slot) p.cur = p.eq.pistol ? 'pistol' : 'melee';
    p.refreshWeaponModel();
  }

  dropFromInv(i) { const it = this.player.inv.removeAt(i); if (it) this.dropNear([it]); }
  dropEq(slot) {
    const p = this.player, it = p.eq[slot];
    if (!it) return;
    p.eq[slot] = null;
    const items = [it];
    if (slot === 'bag') items.push(...p.resizeInv());
    if (p.cur === slot) p.cur = p.eq.pistol ? 'pistol' : 'melee';
    p.refreshWeaponModel();
    this.dropNear(items);
  }
  dropNear(items) {
    const p = this.player;
    // каждая вещь ложится отдельно у ног и видна своей моделью
    items.forEach((it, k) => {
      const a = p.yaw + (k - (items.length - 1) / 2) * 0.5, x = p.pos.x - Math.sin(a) * 0.9, z = p.pos.z - Math.cos(a) * 0.9;
      const def = ITEMS[it.id];
      this.loot.drop(x, z, [it], 'Поднять: ' + (def ? def.name : 'вещь') + (it.n > 1 ? ' ×' + it.n : ''), 'small');
    });
    audio.play('bag', null, { vol: 0.4 });
  }
  giveOrDrop(item) {
    const rest = this.player.give(item);
    if (rest) { this.dropNear([rest]); this.ui.toast('Не влезло, лежит рядом'); }
  }
  onPickup(it) {
    const d = ITEMS[it.id];
    if (d.kind === 'weapon' && !this._gunHint && WEAPONS[it.id].mag) { this._gunHint = true; this.ui.toast('Оружие в руках: 1–5 или колесо мыши'); }
  }

  // ---------- кадр ----------
  loop(t) {
    requestAnimationFrame(tt => this.loop(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0.016);
    this.last = t;
    beginFrame();
    if (this.state === 'play' && !this.ui.open) this.update(dt);
    else if (this.state === 'menu' && this.ui.open === 'hero') this.heroCam(dt);
    else if (this.state === 'menu') this.menuCam(dt);
    this.renderer.render(this.scene, this.camera);
    endFrame();
  }

  // герой, выбранный в прошлый раз, если он ещё в списке
  heroKey() {
    const list = Selection.heroes.filter(k => Assets.gltf[k] || !this.player);
    return list.includes(this.settings.hero) ? this.settings.hero : (list[0] || Selection.heroes[0]);
  }
  heroList() { return Selection.heroes.filter(k => Assets.gltf[k]); }
  setHero(key) {
    this.settings.hero = key;
    try { localStorage.setItem(SET_KEY, JSON.stringify(this.settings)); } catch (e) {}
    if (this.player.charKey !== key) this.player.makeModel(key);
  }

  // выбор героя: персонаж у костра лицом к камере
  heroCam(dt) {
    this.time += dt;
    const c = this.plan.camp, p = this.player;
    p.pos.set(c.x + 2.2, 0, c.z + 4);
    p.yaw = Math.PI + Math.sin(this.time * 0.6) * 0.5;
    p.model.root.visible = true;
    p.model.root.position.copy(p.pos);
    p.model.root.rotation.y = p.yaw + Math.PI;
    // стоит спокойно, иногда говорит руками; оружие на этом экране спрятано
    p.play(this.time % 10 < 7 ? 'Idle' : (p.model.actions.Talk_Idle ? 'Talk_Idle' : 'Idle'));
    if (p.weaponMesh) p.weaponMesh.visible = false;
    p.model.mixer.update(dt);
    relaxArms(p.model, 0.3);
    const portrait = innerWidth < innerHeight;
    this.camera.position.set(p.pos.x + (portrait ? 0 : 0.9), 1.25, p.pos.z + (portrait ? 4.2 : 3.4));
    this.camera.lookAt(p.pos.x + (portrait ? 0 : 0.9), portrait ? 0.7 : 0.95, p.pos.z);
    this.world.update(this.camera.position.x, this.camera.position.z, this.viewDist);
    this.fx.update(dt);
    this.quests.updateNpcs(dt);
  }

  // в меню камера медленно кружит над лагерем
  menuCam(dt) {
    this.time += dt;
    const c = this.plan.camp, a = this.time * 0.05;
    this.camera.position.set(c.x + Math.cos(a) * 60, 28, c.z + 30 + Math.sin(a) * 60);
    this.camera.lookAt(c.x, 2, c.z + 10);
    this.world.update(this.camera.position.x, this.camera.position.z, this.viewDist);
    this.fx.update(dt);
    this.quests.updateNpcs(dt);
  }

  update(dt, first = false) {
    const p = this.player;
    this.frame++;
    this.time += dt;
    if (!first) {
      this.hour += dt * 24 / DAY_SEC;
      if (this.hour >= 24) { this.hour -= 24; this.day++; }
    }
    this.updateSky();
    // клавиши экранов
    const P = Input.pressed;
    if (!first) {
      if (P.has('inv')) return this.ui.show('inv');
      if (P.has('map')) return this.ui.show('map');
      if (P.has('quests')) return this.ui.show('quests');
      if (P.has('pause')) return this.ui.show('pause');
      if (!p.dead) {
        if (P.has('heal')) this.quickUse('heal');
        if (P.has('eat')) this.quickUse('eat');
        if (P.has('drink')) this.quickUse('drink');
        if (P.has('throw') && p.eq.throw) p.switchTo('throw');
        if (P.has('horn') && p.vehicle && p.vehicle.kind === 'car') { if (!this._hornT || this.time - this._hornT > 0.6) { this._hornT = this.time; audio.play('horn', null, { vol: 0.7, jitter: false }); this.zombies.hearNoise(p.vehicle.pos, 70); } }
      }
    }
    // F у машины (или в ней) — заправка/ремонт вместо фонарика
    if (this._alt && P.has('light') && !first) { P.delete('light'); this.doAlt(this._alt); }
    p.update(dt);
    this.updateSearch(dt);
    this.vehicles.update(dt);
    this.zombies.update(dt);
    this.fx.update(dt);
    this.loot.update(dt);
    this.quests.update(dt);
    // взаимодействие
    const target = this.findInteract();
    this._alt = target ? target.alt || null : p.vehicle ? this.vehAlt(p.vehicle) : null;
    this.ui.setPrompt(target ? target.label : '', target ? target.short : '', this._alt);
    if (P.has('use') && !first) {
      if (p.vehicle) this.vehicles.exit();
      else if (target) this.interact(target);
    }
    this.camCtl.update(dt, p);
    const L = audio.listener;
    L.x = this.camera.position.x; L.z = this.camera.position.z; L.yaw = -p.camYaw; // курс по компасу
    this.world.update(this.camera.position.x, this.camera.position.z, this.viewDist);
    this.updateLights();
    this.ui.update(dt);
    this.ambience(dt);
    this.saveT += dt;
    if (this.saveT > 30 && !p.dead && !first) { this.saveT = 0; this.save(); }
  }

  // фон: ветер днём, ночные шорохи ночью; изредка далёкий вопль или выстрел где-то в городе
  ambience(dt) {
    if (SILENT) return;
    const S = typeof SFX !== 'undefined' ? SFX : null;
    // в лагере — потрескивание костра, на улице ветер, ночью шорохи
    const want = this.inCamp(this.player.pos.x, this.player.pos.z) ? 'hearth' : this.isNight() ? 'night' : 'wind';
    if (S && audio.ctx && this._amb !== want) { try { S.setVolume(this.settings.volume * 0.8); S.amb.start(want); this._amb = want; } catch (e) {} }
    this._farT = (this._farT ?? 15) - dt;
    if (this._farT <= 0) {
      this._farT = 18 + Math.random() * 35;
      const a = Math.random() * 6.28, d = 70 + Math.random() * 60, p = this.player.pos;
      const at = { x: p.x + Math.cos(a) * d, z: p.z + Math.sin(a) * d };
      if (Math.random() < 0.7) audio.play('zAlert', at, { vol: 0.9, range: 60, rate: 0.75 + Math.random() * 0.3, lowpass: 900 });
      else audio.play('far', at, { vol: 0.8, range: 90 });
    }
  }

  // ---------- сохранение ----------
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  save() {
    if (this.state !== 'play') return;
    const p = this.player;
    const s = {
      v: 1, day: this.day, hour: this.hour, power: this.power,
      p: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, hp: p.hp, stam: p.stam, food: p.food, water: p.water, bleed: p.bleed, infect: p.infect,
        eq: p.eq, inv: p.inv.slots, cur: p.cur, kills: p.kills, dead: p.dead, hero: p.charKey },
      quests: this.quests.toJSON(), loot: this.loot.toJSON(), veh: this.vehicles.toJSON(), stash: this.stash,
      zsp: this.zombies.shellSpawned, csp: this.zombies.cultSpawned || {},
    };
    if (p.vehicle) { s.p.x = p.vehicle.pos.x; s.p.z = p.vehicle.pos.z; }
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  load() {
    const s = readJSON(SAVE_KEY);
    if (!s) return;
    const p = this.player;
    this.day = s.day || 0; this.hour = s.hour ?? 7; this.power = !!s.power;
    const q = s.p;
    Object.assign(p, { hp: q.hp, stam: q.stam, food: q.food, water: q.water, bleed: q.bleed, infect: q.infect, kills: q.kills || 0, cur: q.cur || 'pistol' });
    p.eq = Object.assign({ melee: null, pistol: null, long1: null, long2: null, throw: null, body: null, head: null, bag: null }, q.eq);
    if (q.hero && q.hero !== p.charKey && Assets.gltf[q.hero]) p.makeModel(q.hero);
    p.inv.slots = (q.inv || []).map(x => x && ITEMS[x.id] ? x : null);
    p.inv.resize(POCKET_SLOTS + p.bagSlots());
    p.pos.set(q.x, q.y || 0, q.z);
    p.yaw = p.camYaw = q.yaw || 0;
    if (this.phys.blocked(p.pos.x, p.pos.y, p.pos.z, 0.35, 1.7)) this.placeStart();
    p.refreshWeaponModel();
    this.vehicles.load(s.veh);
    this.loot.load(s.loot);
    this.quests.load(s.quests);
    if (s.stash) { this.stash.items = s.stash.items || []; this.stash.cap = s.stash.cap || 24; }
    // кого уже заселяли в здания и логова: без этого после загрузки охрана и культисты появлялись заново
    this.zombies.shellSpawned = s.zsp || {}; this.zombies.cultSpawned = s.csp || {};
    if (q.dead || p.hp <= 0) this.respawn();
  }
}

function readJSON(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function smooth(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }
function tick() { return new Promise(r => setTimeout(r, 0)); }

installInteractions(Game);
const game = new Game();
game.init().catch(e => {
  console.error(e);
  const m = document.getElementById('lmsg');
  if (m) m.textContent = 'Ошибка загрузки: ' + e.message;
});
