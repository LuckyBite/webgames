// Лут в мире: контейнеры (строит world.js, наполняются при первом обыске и восстанавливаются
// через 2 игровых дня) и выпавшие кучки (с зомби, рюкзак на месте смерти, квестовые находки).
// Всё, что помогает выжить, светится тёплым акцентом.
import * as THREE from 'three';
import { makeMesh, fitScale, styleMaterial, Assets } from './assets.js';
import { rollLoot, ITEMS } from './items.js';
import { weaponModel } from './weapons3d.js';

let dropN = 0;

export class Loot {
  constructor(game) {
    this.g = game;
    this.drops = [];
    // тёплый отблеск под находкой
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffb050, transparent: true, opacity: 0.35, depthWrite: false });
    this.glowGeo = new THREE.CircleGeometry(0.45, 12).rotateX(-Math.PI / 2);
  }

  // контейнер: наполнить при открытии
  fill(c) {
    const g = this.g;
    if (c.items === null || (g.day - c.openedDay >= 2 && !c.items.length)) {
      if (c.only === 'fuel') c.items = Math.random() < c.chance ? [{ id: 'fuel', n: 1 }] : [];
      else c.items = Math.random() < c.chance ? rollLoot(c.type, Math.random) : [];
      c.openedDay = g.day;
      c.touched = true;
    }
    if (c.force) { c.items.push(...c.force); c.force = null; }
    return c.items;
  }

  drop(x, z, items, label = 'Обыскать', kind = 'small', tag = null) {
    const g = this.g;
    const y = Math.max(0, g.phys.groundAt(x, z, 2));
    const d = { id: 'd' + (dropN++), x, y, z, items: items.map(i => Object.assign({}, i)), label, kind, tag, r: kind === 'bag' || kind === 'death' ? 2 : 1.6 };
    this.makeMesh(d);
    this.drops.push(d);
    return d;
  }

  makeMesh(d) {
    const g = this.g;
    const grp = new THREE.Group();
    // карманы тела: модели нет, лежит сам зомби; только слабый отблеск.
    // Выброшенное и выпавшее лежит своей моделью (по первому предмету): оружие, аптечка, банка, коробка патронов
    if (d.kind !== 'body') grp.add(this.itemMesh(d));
    const glow = new THREE.Mesh(this.glowGeo, this.glowMat);
    glow.position.y = 0.03;
    grp.add(glow);
    grp.position.set(d.x, d.y, d.z);
    grp.rotation.y = Math.random() * 6.28;
    g.scene.add(grp);
    d.mesh = grp;
  }

  itemMesh(d) {
    const it = d.items[0];
    const def = it && ITEMS[it.id];
    if (d.kind === 'death' || d.kind === 'bag' || !def) return sized('env_items:garbagebag', 0.7);
    if (def.kind === 'weapon') {
      const w = weaponModel(it.id);
      if (w) { const g = new THREE.Group(); w.rotation.z = Math.PI / 2; w.position.y = 0.04; g.add(w); return g; }
    }
    // своя модель у частых предметов (паки с itch.io, v2.8), остальное по виду предмета
    const own = {
      medkit: ['env_x_items:med_2', 0.36], bandage: ['env_x_items:med_14', 0.14], pills: ['env_x_items:med_13', 0.1],
      antidote: ['env_x_items:med_17', 0.15], meds_box: ['env_x_items:med_1', 0.3],
      water: ['env_x_trash:waterbottle', 0.3], soda: ['env_x_survival:can_soda', 0.12], energy: ['env_x_trash:can_3', 0.14],
      canned: ['env_x_survival:can', 0.12], beans: ['env_x_trash:tin_1', 0.12], chips: ['env_x_trash:chip_bag_1', 0.25],
      fuel: ['env_x_street:jerrycan', 0.46], battery: ['env_x_survival:battery', 0.08], scrap: ['env_x_trash:sheet_metal_2', 0.45],
      parts: ['env_x_items:wrench', 0.3], bag_s: ['env_x_survival:backpack', 0.45], bag_m: ['env_x_survival:backpack', 0.55],
      bag_l: ['env_x_survival:backpack001', 0.65],
    }[it.id] || (/^ammo_/.test(it.id) ? ['env_x_survival:ammunition', 0.22] : null);
    if (own && Assets.tpl[own[0]]) return sized(own[0], own[1]);
    const pick = {
      med: ['env_items:first_aid_kit', 0.32], food: [/water|soda|energy/.test(it.id) ? 'env_items:energy_drink' : 'env_items:mre', 0.22],
      ammo: ['env_items:box', 0.18], fuel: ['env_items:barrel', 0.45], gear: [def.gear === 'head' ? 'env_items:gasmask' : 'env_items:garbagebag', 0.4],
      mat: ['env_items:box', 0.28], quest: ['env_items:box', 0.25],
    }[def.kind] || ['env_items:box', 0.3];
    return sized(pick[0], pick[1]);
    function sized(key, len) { const m = makeMesh(key); m.scale.setScalar(fitScale(key, len)); return m; }
  }

  removeDrop(d) {
    this.g.scene.remove(d.mesh);
    this.drops.splice(this.drops.indexOf(d), 1);
  }

  // пустые кучки убираем после закрытия окна
  cleanup() {
    for (const d of this.drops.slice()) if (!d.items.length) this.removeDrop(d);
  }

  update(dt) {
    // отблеск пульсирует, дальние кучки прячем
    const p = this.g.player.pos;
    const k = 0.25 + Math.sin(this.g.time * 3) * 0.1;
    this.glowMat.opacity = k;
    for (const d of this.drops) d.mesh.visible = Math.abs(d.x - p.x) + Math.abs(d.z - p.z) < 120;
  }

  toJSON() {
    const g = this.g;
    const cont = {};
    for (const c of g.world.containers) if (c.touched) cont[c.id] = [c.openedDay, c.items];
    const drops = this.drops.filter(d => d.items.length && d.kind !== 'small' && d.kind !== 'body').map(d => ({ x: d.x, z: d.z, items: d.items, label: d.label, kind: d.kind, tag: d.tag }));
    return { cont, drops };
  }
  load(s) {
    if (!s) return;
    const g = this.g;
    const byId = {};
    for (const c of g.world.containers) byId[c.id] = c;
    for (const id in s.cont || {}) { const c = byId[id]; if (c) { c.openedDay = s.cont[id][0]; c.items = s.cont[id][1]; c.touched = true; } }
    for (const d of s.drops || []) this.drop(d.x, d.z, d.items.filter(i => ITEMS[i.id]), d.label, d.kind, d.tag);
  }
}
