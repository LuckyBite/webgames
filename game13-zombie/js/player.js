// Игрок: передвижение, камера от третьего лица, оружие, показатели выживания.
import * as THREE from 'three';
import { Input } from './input.js';
import { Assets, cloneCharacter, makeMesh, fitScale, handBone, relaxArms, Selection, styleMaterial } from './assets.js';
import { WEAPONS, ITEMS, Inventory, POCKET_SLOTS } from './items.js';
import { audio } from './audio.js';
import { STEP } from './physics.js';
import { weaponModel, WMODEL, WHOLD, poseHeld } from './weapons3d.js';

export const SLOTS = ['melee', 'pistol', 'long1', 'long2', 'throw'];
const SLOT_OF = w => w.slot === 'long' ? 'long1' : w.slot;

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const _vq = [];
const _up = new THREE.Vector3(0, 1, 0), _rq = new THREE.Quaternion(), _rq2 = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const V = () => new THREE.Vector3();
const _ia = V(), _ib = V(), _ic = V(), _id = V(), _ie = V(), _ip = V(), _it = V(), _iu = V(), _iv = V(), _if = V(), _ir = V(), _is = V(), _ig = V(), _ip2 = V(), _ip3 = V(), _iy = V(), _il = V();
const _iq = new THREE.Quaternion(), _iw = new THREE.Quaternion(), _ifd = V(), _iw2 = V();
const angDiff = (a, b) => ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

export class Player {
  constructor(game, charKey) {
    this.g = game;
    this.pos = new THREE.Vector3();
    this.vy = 0;
    this.onGround = true;
    this.yaw = 0;          // куда смотрит тело
    this.camYaw = 0;       // орбита камеры
    this.camPitch = -0.15;
    this.r = 0.35; this.h = 1.75;
    this.hp = 100; this.stam = 100; this.food = 100; this.water = 100;
    this.bleed = 0; this.infect = 0; this.regen = 0;
    this.armorBody = null; this.armorHead = null;
    this.eq = { melee: null, pistol: null, long1: null, long2: null, throw: null, body: null, head: null, bag: null };
    this.inv = new Inventory(POCKET_SLOTS);
    this.cur = 'pistol';
    this.cool = 0;          // до следующего выстрела
    this.reloading = 0;     // осталось секунд перезарядки
    this.using = null;      // {item, t, total} — бинт, еда
    this.spread = 0;        // накопленный разброс
    this.recoil = 0;
    this.aiming = false;
    this.crouch = false;
    this.sprinting = false;
    this.stepT = 0;
    this.noise = 0;         // шум за кадр (для зомби)
    this.dead = false;
    this.vehicle = null;
    this.light = true;
    this.kills = 0;
    this.hurtT = 0;
    this.meleeT = 0;
    this.attackAnim = 0;
    this.shoulder = 1;      // 1 — правое плечо, -1 — левое
    this.twist = 0;         // доворот корпуса к прицелу относительно ног
    this.vaultSt = null;    // идёт перелаз
    this.makeModel(charKey);
  }

  makeModel(key) {
    if (!Assets.gltf[key]) key = Selection.heroes.find(k => Assets.gltf[k]) || Object.keys(Assets.gltf).find(k => /^psx_[mf]_/.test(k));
    const vis = this.model ? this.model.root.visible : true;
    if (this.model) this.g.scene.remove(this.model.root);
    if (this.weaponMesh && this.weaponMesh.parent) this.weaponMesh.parent.remove(this.weaponMesh);
    // вшитое в модель оружие прячем (всё нескелетное), вешаем своё; анимации — общие, от Мэтта
    const c = cloneCharacter(key, { hideRigid: true });
    c.root.scale.setScalar(heroScale(key));
    this.model = c;
    this.charKey = key;
    this.hand = handBone(c.bones);
    c.root.visible = vis;
    c.root.position.copy(this.pos);
    this.g.scene.add(c.root);
    this.anim = null;
    this.upAnim = null; this.upName = null;
    this.buildLayers();
    this.play('Idle');
    this.weaponMesh = null;
    this.weaponKey = null;
    this.refreshWeaponModel();
  }

  // Два слоя: ноги (ходьба, бег, присед) и верх (поза с оружием, прицел, перезарядка).
  // Клипы режем по костям: у «ног» нет рук и груди, у «верха» есть только они.
  buildLayers() {
    const c = this.model;
    const U = /(Spine1|Spine2|Chest|Neck|Head|Shoulder|Arm|Hand|Thumb|Index|Middle|Ring|Pinky|Clavicle)/i;
    const cut = (name, upper) => {
      const a = c.actions[name];
      if (!a) return null;
      const clip = a.getClip();
      const tr = clip.tracks.filter(t => U.test(t.name.split('.')[0]) === upper);
      if (!tr.length || tr.length === clip.tracks.length) return null;
      return c.mixer.clipAction(new THREE.AnimationClip(clip.name + (upper ? '_U' : '_L'), clip.duration, tr));
    };
    c.legs = {}; c.upper = {};
    for (const n of ['Idle', 'Walk', 'Run', 'Duck', 'Crouch_Walk', 'Jump', 'Jump_Idle', 'Walk_Gun', 'Run_Gun', 'Idle_Gun']) c.legs[n] = cut(n, false);
    for (const n of ['Aim', 'Idle_Gun', 'Reload', 'Shoot']) c.upper[n] = cut(n, true);
  }

  // верхний слой: name = null — снять
  playUpper(name, fade = 0.15) {
    const a = name ? this.model.upper[name] : null;
    if (this.upAnim === a) return a;
    if (this.upAnim) this.upAnim.fadeOut(fade);
    if (a) { a.reset().setEffectiveWeight(1).fadeIn(fade); a.setLoop(name === 'Reload' ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = true; a.play(); }
    this.upAnim = a; this.upName = name;
    return a;
  }

  play(name, fade = 0.18, once = false, legs = false) {
    const a = (legs && this.model.legs && this.model.legs[name]) || this.model.actions[name];
    if (!a || this.anim === a) return;
    if (this.anim) this.anim.fadeOut(fade);
    a.reset().setEffectiveWeight(1).fadeIn(fade);
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat);
    a.clampWhenFinished = once;
    a.play();
    this.anim = a;
    this.animName = name;
  }

  get weapon() {
    const it = this.eq[this.cur];
    if (!it) return this.cur === 'melee' ? WEAPONS.fists : null;
    return WEAPONS[it.id];
  }
  get weaponItem() { return this.eq[this.cur]; }

  // v2.1: огнестрел живёт в мире и каждый кадр встаёт в кисть, ствол — точно по прицелу (aimWeapon);
  // холодное и метательное — в кисти (хват подобран по кадрам: рукоять поперёк кулака)
  refreshWeaponModel() {
    const it = this.eq[this.cur];
    const id = it ? it.id : null;
    if (id === this.weaponKey) return;
    if (this.weaponMesh) this.weaponMesh.parent && this.weaponMesh.parent.remove(this.weaponMesh);
    this.weaponMesh = null;
    this.weaponKey = id;
    this.gunHeld = false; this.meleeHeld = false;
    const m = id ? weaponModel(id) : null;
    if (!m) return;
    const w = WEAPONS[id];
    if (w && !w.melee && !w.throw) {
      this.g.scene.add(m);
      this.gunHeld = true;
    } else {
      // холодное и метательное тоже в мире: каждый кадр в ладонь, клинок вперёд-вниз (poseHeld)
      this.g.scene.add(m);
      this.meleeHeld = true;
    }
    this.weaponMesh = m;
  }

  // точка дула в мире (для вспышки и гильз)
  muzzlePos() {
    const m = this.weaponMesh;
    if (!m || !this.gunHeld) return null;
    const o = WMODEL[this.weaponKey];
    const L = o ? o.len * (1 - o.grip) : 0.2;
    return tmpV2.set(0, 0.03, -L).applyEuler(m.rotation).add(m.position).clone();
  }

  // огнестрел: в кисть, ствол по прицелу. Наготове — чуть вниз, на бегу — к земле
  aimWeapon() {
    const m = this.weaponMesh;
    if (m && this.meleeHeld) {
      m.visible = this.model.root.visible && !this.dead && !this.using;
      const fk = (WHOLD[this.weaponKey] || {}).fingK ?? 0.5;
      poseHeld(m, this.hand, -Math.sin(this.yaw), -Math.cos(this.yaw), this.attackAnim > 0 ? Math.max(0.8, fk) : fk);
      return;
    }
    if (!m || !this.gunHeld) return;
    m.visible = this.model.root.visible && !this.dead && !this.using;
    // рукоять в ладони: от запястья (начало кости) на ~8 см к пальцам (ось Y кости кисти)
    this.hand.getWorldPosition(m.position);
    this.hand.getWorldQuaternion(tmpQ);
    m.position.addScaledVector(tmpV2.set(0, 1, 0).applyQuaternion(tmpQ), 0.08);
    // в руках (IK): рукоять ровно в точке хвата, ствол по прицелу
    if (this.gripPt && this.aimMode) {
      m.position.copy(this.gripPt);
      m.position.y -= 0.015;
      m.rotation.set(this.gripPitch, this.gripYaw, 0, 'YXZ');
      return;
    }
    const up = this.upName;
    const yaw = up ? this.camYaw : this.yaw;
    const pitch = up === 'Reload' ? -0.7 : -0.95;
    m.rotation.set(pitch, yaw, 0, 'YXZ');
  }

  handWorldScale() {
    this.model.root.updateMatrixWorld(true);
    this.hand.getWorldScale(tmpV);
    return tmpV.x || 1;
  }

  // ---------- видимая броня ----------
  // Бронежилет собран кодом (в паках его нет) и каждый кадр встаёт на грудь модели. Каску убрали из игры.
  poseGear() {
    const want = { body: this.eq.body ? this.eq.body.id : null, head: null };
    this.gear = this.gear || {};
    for (const s of ['body', 'head']) {
      const cur = this.gear[s];
      if ((cur ? cur.id : null) === want[s]) continue;
      if (cur) this.g.scene.remove(cur.m);
      this.gear[s] = want[s] ? { id: want[s], m: s === 'body' ? makeVest() : makeHelmet() } : null;
      if (this.gear[s]) this.g.scene.add(this.gear[s].m);
    }
    if (!this.gear.body && !this.gear.head) return;
    const B = this.model.bones;
    if (this._gearOf !== this.model) {
      const f = re => Object.values(B).find(b => re.test(b.name));
      this._gb = { chest: f(/Spine2$/) || f(/Spine1$/) || f(/Spine$/), head: f(/Head$/), top: f(/HeadTop_End$/), la: f(/LeftArm$/), ra: f(/RightArm$/) };
      this._gearOf = this.model;
    }
    const gb = this._gb, vis = this.model.root.visible && !this.dead;
    const yaw = this.yaw + (this.twist || 0);
    if (this.gear.body && gb.chest) {
      const m = this.gear.body.m;
      m.visible = vis;
      gb.chest.getWorldPosition(m.position);
      m.position.y -= 0.06;
      if (gb.la && gb.ra) { const w = gb.la.getWorldPosition(_ia).distanceTo(gb.ra.getWorldPosition(_ib)); m.scale.set(w / 0.36, 1, 1); }
      m.rotation.set(0, yaw, 0);
    }
    if (this.gear.head && gb.head) {
      const m = this.gear.head.m;
      m.visible = vis;
      gb.head.getWorldPosition(m.position);
      if (gb.top) m.position.lerp(gb.top.getWorldPosition(_ic), 0.62); else m.position.y += 0.12;
      gb.head.getWorldQuaternion(_iq);
      m.rotation.set(0, yaw, 0);
    }
  }
  refreshGear() { if (this.gear) for (const s in this.gear) if (this.gear[s]) { this.g.scene.remove(this.gear[s].m); this.gear[s] = null; } }

  // ---------- инвентарь ----------
  bagSlots() { return this.eq.bag ? ITEMS[this.eq.bag.id].slots : 0; }
  resizeInv() { return this.inv.resize(POCKET_SLOTS + this.bagSlots()); }
  ammoCount(type) { return this.inv.count('ammo_' + type); }

  // поднять предмет: оружие — в пустой слот экипировки, остальное в рюкзак. Возвращает остаток.
  give(item) {
    const def = ITEMS[item.id];
    if (!def) return null;
    if (def.kind === 'weapon') {
      const w = WEAPONS[item.id];
      if (w.throw) {
        if (!this.eq.throw) { this.eq.throw = { id: item.id, n: item.n }; return null; }
        if (this.eq.throw.id === item.id) { this.eq.throw.n = Math.min(def.stack, this.eq.throw.n + item.n); return null; }
      } else {
        const slots = w.slot === 'long' ? ['long1', 'long2'] : [w.slot];
        for (const s of slots) if (!this.eq[s]) { this.eq[s] = Object.assign({}, item); if (this.cur === s) this.refreshWeaponModel(); return null; }
      }
    }
    if (def.kind === 'gear') {
      const slot = def.gear;
      if (!this.eq[slot]) { this.eq[slot] = Object.assign({ dur: def.dur }, item); if (slot === 'bag') this.resizeInv(); return null; }
    }
    return this.inv.add(item);
  }

  // ---------- кадр ----------
  update(dt) {
    if (this.dead) { this.mixUpdate(dt); this.aimWeapon(); this.poseGear(); return; }
    const g = this.g;
    this.noise = 0;
    const look = Input.look;
    const sens = 0.0023 * Input.sens * (this.aiming ? (this.weapon && this.weapon.scope ? 0.35 : 0.6) : 1);
    this.camYaw -= look.x * sens + Input.stickLook.x * dt * 2.6;
    this.camPitch -= (look.y * sens + Input.stickLook.y * dt * 2.0) * (Input.invertY ? -1 : 1);
    this.camPitch = Math.max(-1.25, Math.min(0.9, this.camPitch));

    if (this.vehicle) { this.mixUpdate(dt); this.stats(dt, 0); this.aimWeapon(); this.poseGear(); return; }

    // смена оружия
    for (let i = 0; i < 5; i++) if (Input.pressed.has('slot' + (i + 1))) this.switchTo(SLOTS[i]);
    if (Input.wheel || Input.pressed.has('slotNext') || Input.pressed.has('slotPrev')) {
      const dir = Input.wheel > 0 || Input.pressed.has('slotNext') ? 1 : -1;
      let i = SLOTS.indexOf(this.cur);
      for (let k = 0; k < 5; k++) { i = (i + dir + 5) % 5; if (this.eq[SLOTS[i]] || SLOTS[i] === 'melee') break; }
      this.switchTo(SLOTS[i]);
    }
    if (Input.pressed.has('crouch')) this.crouch = !this.crouch;
    if (Input.pressed.has('light')) { this.light = !this.light; audio.play('click', null, { vol: 0.5 }); }
    if (Input.pressed.has('shoulder')) this.shoulder *= -1;

    const w = this.weapon;
    this.aiming = Input.held.has('aim') && !!w && !this.using;
    const wantSprint = Input.held.has('sprint') && Input.move.y > 0.3 && !this.aiming && !this.winded && !this.crouch;
    this.sprinting = wantSprint;
    if (this.sprinting && this.crouch) this.crouch = false;

    // перелаз через забор: идёт сам, управление ждёт
    if (this.vaultSt) { this.doVault(dt); return; }

    // движение относительно камеры
    let mx = Input.move.x, my = Input.move.y;
    const mag = Math.min(1, Math.hypot(mx, my));
    let speed = this.sprinting ? 7.4 : this.crouch ? 2.0 : this.aiming ? 2.7 : 4.0;
    if (this.using) speed *= 0.5;
    if (this.food <= 0 || this.water <= 0) speed *= 0.8;
    const sy = Math.sin(this.camYaw), cy = Math.cos(this.camYaw);
    // вперёд по камере = (-sin, -cos)
    const vx = (-sy * my + cy * mx) * speed, vz = (-cy * my - sy * mx) * speed;
    const moving = mag > 0.1;
    if (moving) {
      g.phys.moveCircle(this.pos, this.r, this.h, vx * dt, vz * dt);
    } else g.phys.resolve(this.pos, this.r, this.h);
    // поворот тела. С оружием наготове ноги идут туда, куда идём (не больше ~60° от прицела),
    // остаток угла добирает корпус (twist в animate). Назад — пятимся лицом к прицелу.
    const facingCam = this.aiming || Input.held.has('fire') || this.cool > 0.05;
    const moveYaw = moving ? Math.atan2(-vx, -vz) : this.yaw;
    let targetYaw = moveYaw;
    this.backpedal = false;
    if (facingCam) {
      targetYaw = this.camYaw;
      if (moving) {
        let d = angDiff(moveYaw, this.camYaw);
        if (Math.abs(d) > 1.9) { this.backpedal = true; d = angDiff(moveYaw + Math.PI, this.camYaw); }
        targetYaw = this.camYaw + Math.max(-0.6, Math.min(0.6, d));
      }
    }
    this.yaw = lerpAngle(this.yaw, targetYaw, Math.min(1, dt * (facingCam ? 14 : 10)));
    this.twist = facingCam ? angDiff(this.camYaw, this.yaw) : this.twist * Math.max(0, 1 - dt * 8);

    // вертикаль: гравитация, ступени, прыжок
    const gy = g.phys.groundAt(this.pos.x, this.pos.z, this.pos.y, this.r * 0.7);
    if (this.onGround && Input.pressed.has('jump') && this.stam > 5) {
      // перед носом низкое препятствие (забор, ящик, капот) — перелезаем, иначе обычный прыжок
      const dir = moving ? Math.atan2(-vx, -vz) : this.yaw;
      if (!this.tryVault(dir)) { this.vy = 5.6; this.onGround = false; this.stam -= 5; this.play('Jump', 0.1, true); }
      else return;
    }
    this.vy -= 18 * dt;
    this.pos.y += this.vy * dt;
    if (this.pos.y <= gy) {
      if (!this.onGround && this.vy < -11) this.damage((-this.vy - 11) * 6, 'fall');
      this.pos.y = gy; this.vy = 0; this.onGround = true;
    } else if (this.pos.y > gy + 0.05) this.onGround = false;
    // в воду — нельзя (берег обрывом), выталкивает назад
    if (g.world.isInWater(this.pos.x, this.pos.z) && this.pos.y < 0.2) { this.pos.x -= 4 * dt * 4; this.damage(2 * dt, 'water'); }

    // шаги и шум
    if (moving && this.onGround) {
      this.stepT -= dt * (this.sprinting ? 1.8 : this.crouch ? 0.6 : 1.1);
      if (this.stepT <= 0) {
        this.stepT = 0.5;
        if (!this.crouch) audio.play(g.groundKind(this.pos.x, this.pos.z) === 'grass' ? 'stepGrass' : 'step', null, { vol: this.sprinting ? 0.35 : 0.2 });
      }
      this.noise = Math.max(this.noise, this.sprinting ? 14 : this.crouch ? 2 : 6);
    }

    // выносливость
    // одышка: выдохся — бежать нельзя, пока силы не вернутся до 25 (иначе бег/шаг мигают каждый кадр).
    // v2.1: полного бака хватает на ~14 с бега (было 6 с, пользователь: «стамины маловато»)
    if (this.stam <= 0) this.winded = true;
    else if (this.winded && this.stam >= 25) this.winded = false;
    if (this.sprinting && moving) this.stam = Math.max(0, this.stam - 7 * dt);
    else this.stam = Math.min(100, this.stam + (this.crouch || !moving ? 26 : 16) * dt);

    this.combat(dt, w);
    this.stats(dt, moving ? (this.sprinting ? 1.6 : 1) : 0.7);
    // сначала ставим модель, потом анимация и IK рук (иначе руки отстают на кадр от тела)
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw + Math.PI; // модель смотрит в +z, у нас вперёд — это -z
    this.animate(dt, moving, w);
    this.aimWeapon(); this.poseGear();
  }

  // Перелаз: впереди (до 1.4 м) препятствие высотой до 1.6 м и толщиной до 1.2 м, за ним есть где встать
  tryVault(yaw) {
    const ph = this.g.phys, p = this.pos;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let top = -1, near = -1;
    for (let d = 0.35; d <= 1.4; d += 0.15) {
      const x = p.x + fx * d, z = p.z + fz * d;
      for (const b of ph.query(x - 0.1, z - 0.1, x + 0.1, z + 0.1, _vq)) {
        if (!b.solid || b.tag === 'npc' || x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
        if (b.maxY <= p.y + STEP || b.minY > p.y + 1.2) continue;
        if (b.maxY - p.y > 1.6) return false; // высокая стена
        if (near < 0) near = d;
        top = Math.max(top, b.maxY);
      }
      if (near >= 0 && d - near > 1.2) return false; // слишком толстое
      if (near >= 0 && top >= 0) {
        // ищем, где приземлиться
        const lx = p.x + fx * (d + 0.55), lz = p.z + fz * (d + 0.55);
        const gy = ph.groundAt(lx, lz, top + 0.2, 0.25);
        let clear = gy < top - 0.3 && !ph.blocked(lx, gy, lz, this.r * 0.9, 1.6);
        if (clear) {
          // над препятствием не должно быть балки
          const hit = ph.raycast(p.x, top + 1.7, p.z, fx, 0, fz, d + 0.6);
          if (hit && hit.box.tag !== 'ground') clear = false;
        }
        if (clear) {
          this.vaultSt = { x0: p.x, z0: p.z, y0: p.y, x1: lx, z1: lz, y1: gy, top, t: 0, dur: 0.38 + (top - p.y) * 0.18 };
          this.yaw = yaw; this.stam -= 6; this.vy = 0;
          this.play('Jump', 0.08, true);
          audio.play('wood', null, { vol: 0.25, rate: 1.4 });
          this.noise = Math.max(this.noise, 5);
          return true;
        }
      }
    }
    return false;
  }
  doVault(dt) {
    const v = this.vaultSt;
    v.t += dt;
    const k = Math.min(1, v.t / v.dur);
    this.pos.x = v.x0 + (v.x1 - v.x0) * k;
    this.pos.z = v.z0 + (v.z1 - v.z0) * k;
    // дуга: подъём до верха препятствия и спуск
    const arc = Math.sin(k * Math.PI);
    this.pos.y = (v.y0 + (v.y1 - v.y0) * k) + Math.max(0, v.top + 0.15 - Math.max(v.y0, v.y1)) * (k < 0.5 ? Math.min(1, arc * 1.3) : arc);
    if (k >= 1) { this.vaultSt = null; this.pos.y = v.y1; this.vy = 0; this.onGround = true; }
    this.mixUpdate(dt);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.yaw + Math.PI;
    this.aimWeapon(); this.poseGear();
    this.stats(dt, 1);
  }

  switchTo(slot) {
    if (slot !== 'melee' && !this.eq[slot]) return;
    if (this.cur === slot) return;
    this.cur = slot;
    this.reloading = 0;
    this.cool = Math.max(this.cool, 0.25);
    this.refreshWeaponModel();
    audio.play('latch', null, { vol: 0.35 });
  }

  combat(dt, w) {
    const g = this.g;
    this.cool = Math.max(0, this.cool - dt);
    this.spread = Math.max(0, this.spread - dt * 0.12);
    this.recoil = Math.max(0, this.recoil - dt * 4);
    this.attackAnim = Math.max(0, this.attackAnim - dt);
    // использование предмета (бинт/еда) прерывается атакой
    if (this.using) {
      this.using.t -= dt;
      if (this.using.t <= 0) { g.applyItem(this.using.item); this.using = null; }
      if (Input.pressed.has('fire')) { this.using = null; g.ui.toast('Отменено'); }
      return;
    }
    if (!w) return;
    const it = this.weaponItem;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.finishReload();
      // дробовик: по одному патрону, стрельба прерывает
      if (w.perShell && Input.pressed.has('fire') && it.mag > 0) this.reloading = 0;
      else return;
    }
    if (Input.pressed.has('reload') && w.mag) this.startReload();
    if (w.throw) {
      if (Input.pressed.has('fire') && this.cool <= 0 && it && it.n > 0) this.throwIt(w, it);
      return;
    }
    const trigger = w.auto ? Input.held.has('fire') : Input.pressed.has('fire');
    if (!trigger || this.cool > 0) return;
    if (w.melee) return this.melee(w);
    if (!it) return;
    if (it.mag <= 0) {
      audio.play('empty', null, { vol: 0.6 });
      this.cool = 0.3;
      if (this.ammoCount(w.ammo) > 0) this.startReload();
      return;
    }
    this.fire(w, it);
  }

  startReload() {
    const w = this.weapon, it = this.weaponItem;
    if (!w || !w.mag || !it || it.mag >= w.mag || this.ammoCount(w.ammo) <= 0) return;
    this.reloading = w.reload;
    audio.play(w.perShell ? 'pump' : w.slot === 'pistol' ? 'reload_pistol' : 'reload_rifle', null, { vol: 0.6 });
  }
  finishReload() {
    const w = this.weapon, it = this.weaponItem;
    if (!w || !it) return;
    const need = w.perShell ? 1 : w.mag - it.mag;
    const got = this.inv.take('ammo_' + w.ammo, need);
    it.mag += got;
    if (w.perShell && it.mag < w.mag && this.ammoCount(w.ammo) > 0) { this.reloading = w.reload; audio.play('pump', null, { vol: 0.4, rate: 1.3 }); }
  }

  // точка прицела: луч из камеры через центр экрана
  aimRay() {
    const cam = this.g.camera;
    const o = cam.position.clone();
    const d = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    return { o, d };
  }

  fire(w, it) {
    const g = this.g;
    it.mag--;
    this.cool = w.rate;
    const { o, d } = this.aimRay();
    // точка, куда смотрит прицел
    const maxT = w.range;
    const hitW = g.phys.raycast(o.x, o.y, o.z, d.x, d.y, d.z, maxT + 6);
    const hitZ = g.zombies.raycast(o, d, hitW ? hitW.t : maxT + 6);
    let aimT = hitZ ? hitZ.t : hitW ? hitW.t : maxT;
    const target = o.clone().addScaledVector(d, aimT);
    // пуля летит из ствола (грудь игрока) в точку прицела — нельзя стрелять сквозь угол у себя под носом
    const muzzle = this.pos.clone(); muzzle.y += this.crouch ? 1.05 : 1.45;
    muzzle.x += -Math.sin(this.yaw) * 0.5; muzzle.z += -Math.cos(this.yaw) * 0.5;
    const pellets = w.pellets || 1;
    const baseSpread = (w.spread + this.spread) * (this.aiming ? 0.45 : 1) * (this.crouch ? 0.75 : 1) * (this.sprinting ? 2.5 : 1) * (Input.isTouch && !this.aiming ? 0.7 : 1);
    let pierce = w.pierce || 1;
    for (let p = 0; p < pellets; p++) {
      const dir = target.clone().sub(muzzle).normalize();
      dir.x += (Math.random() - 0.5) * 2 * baseSpread; dir.y += (Math.random() - 0.5) * 2 * baseSpread; dir.z += (Math.random() - 0.5) * 2 * baseSpread;
      dir.normalize();
      const wh = g.phys.raycast(muzzle.x, muzzle.y, muzzle.z, dir.x, dir.y, dir.z, w.range);
      let lim = wh ? wh.t : w.range;
      let left = pierce;
      const ignore = new Set();
      while (left-- > 0) {
        const zh = g.zombies.raycast(muzzle, dir, lim, ignore);
        if (!zh) break;
        const fall = Math.max(0.35, 1 - zh.t / w.range * 0.6);
        g.zombies.hit(zh.z, w.dmg * fall * (zh.head ? 2.5 : 1), dir, w.knock || 0.6, zh.head, this);
        g.fx.blood(muzzle.clone().addScaledVector(dir, zh.t), dir);
        ignore.add(zh.z);
        if (left <= 0) lim = zh.t;
      }
      if (wh && (lim === (wh ? wh.t : -1))) g.fx.impact(muzzle.clone().addScaledVector(dir, wh.t), wh.box);
      g.fx.tracer(muzzle, muzzle.clone().addScaledVector(dir, Math.min(lim, 60)));
    }
    this.spread = Math.min(0.08, this.spread + w.spread * 0.6);
    this.recoil = Math.min(0.3, this.recoil + w.recoil);
    this.camPitch += w.recoil * (this.aiming ? 0.5 : 0.8);
    this.camYaw += (Math.random() - 0.5) * w.recoil * 0.4;
    // у автомата и ПП в файле очередь — играем один выстрел
    audio.play(w.sound, null, { vol: 0.9, cut: w.sound === 'rifle' || w.sound === 'smg' ? 0.17 : 0 });
    if (w.sound === 'shotgun') setTimeout(() => audio.play('pump', null, { vol: 0.4 }), 350);
    g.fx.flash(this.muzzlePos() || muzzle);
    g.fx.shell(this.muzzlePos() || muzzle, this.yaw, w);
    this.noise = Math.max(this.noise, w.noise);
    g.zombies.hearNoise(this.pos, w.noise);
    this.attackAnim = 0.15;
  }

  melee(w) {
    const g = this.g;
    this.cool = w.rate;
    this.attackAnim = 0.4;
    this.play(w.id === 'fists' ? 'Punch' : this.eq.melee && this.eq.melee.id === 'knife' ? 'Stab' : 'Slash', 0.08, true);
    if (this.stam > 5) this.stam -= 5;
    audio.play(w.sound, null, { vol: 0.5 });
    // удар приходится на середине замаха
    setTimeout(() => {
      if (this.dead) return;
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const hits = g.zombies.inCone(this.pos, fwd, w.range + 0.4, 0.8);
      let n = 0;
      for (const z of hits) {
        if (n++ >= 2) break; // ударом задеваем не больше двух
        g.zombies.hit(z, w.dmg * (this.stam < 10 ? 0.6 : 1), fwd, w.knock, false, this);
        g.fx.blood(z.pos.clone().setY(1.3), fwd);
        audio.play(w.dmg > 40 ? 'hitHeavy' : 'hit', z.pos, { vol: 0.7 });
      }
      this.noise = Math.max(this.noise, w.noise);
    }, w.rate * 350);
  }

  throwIt(w, it) {
    const g = this.g;
    it.n--;
    this.cool = w.rate;
    const { d } = this.aimRay();
    const v = d.clone().multiplyScalar(17); v.y += 4.5;
    const p = this.pos.clone(); p.y += 1.6;
    g.fx.throwable(w, p, v);
    audio.play('swing', null, { vol: 0.5 });
    this.attackAnim = 0.3;
    if (it.n <= 0) { this.eq.throw = null; this.switchTo('pistol'); if (!this.eq.pistol) this.switchTo('melee'); this.refreshWeaponModel(); }
  }

  animate(dt, moving, w) {
    const gun = w && !w.melee && !w.throw;
    let a;
    // лечится или ест: бинт и аптечка — присел и возится с повязкой, еда и вода — руками у лица
    const useAnim = this.using && !moving ? (ITEMS[this.using.item.id].kind === 'med' ? 'Fix' : 'Interact') : null;
    if (useAnim && this.model.actions[useAnim]) a = useAnim;
    else if (this.attackAnim > 0 && w && w.melee) a = this.animName; // держим удар
    else if (!this.onGround) a = this.animName === 'Jump' ? 'Jump' : 'Jump_Idle';
    else if ((this.crouch || this.searching) && !moving) a = 'Duck';
    else if (moving) a = this.sprinting ? (gun ? 'Run_Gun' : 'Run') : (gun ? 'Walk_Gun' : 'Walk');
    else a = this.aiming && this.model.actions.Aim ? 'Aim' : gun || this.aiming ? 'Idle_Gun' : 'Idle';
    // ствол в руках: верх держит оружие (наготове или в прицеле), ноги живут своей анимацией
    // верхний слой — только перезарядка; держит оружие IK рук (armIK): наготове или в прицеле
    let up = null;
    this.aimMode = null;
    if (gun && this.onGround && !this.sprinting && !this.searching && !this.using && !(this.attackAnim > 0 && w.melee)) {
      if (this.reloading > 0 && this.model.upper.Reload) up = 'Reload';
      else this.aimMode = this.aiming || this.cool > 0.05 || Input.held.has('fire') ? 'Aim' : 'Ready';
    }
    if (up || this.aimMode) {
      if (a === 'Idle_Gun' || a === 'Aim') a = 'Idle';
      if (a === 'Walk_Gun') a = 'Walk';
    }
    this.play(a, 0.18, false, !!up);
    const ua = this.playUpper(up);
    if (ua && up === 'Reload' && this.weapon) ua.timeScale = ua.getClip().duration / Math.max(0.4, this.weapon.reload || 1.5);
    if (this.anim) this.anim.timeScale = (moving && !this.sprinting && this.crouch ? 0.6 : 1) * (this.backpedal ? -0.85 : 1);
    this.mixUpdate(dt);
    if (!this.aimMode) relaxArms(this.model, 0.3);
    // корпус к прицелу: поворот (twist) и наклон по камере, раскладываем по позвонкам в мировых осях
    const pitch = this.aimMode === 'Aim' || this.aiming ? this.camPitch * 0.6 + this.recoil * 0.5 : 0;
    const twist = this.twist || 0;
    if (Math.abs(twist) > 0.01 || Math.abs(pitch) > 0.01) this.bendSpine(twist, pitch);
    if (this.aimMode) { this.saveArms(); this.armIK(w); } else this.gripPt = null;
  }

  // позвонки модели (Mixamo: Spine, Spine1, Spine2; Quaternius: Torso) — ищем один раз
  spineBones() {
    if (this._spine && this._spineOf === this.model) return this._spine;
    const B = this.model.bones;
    let list = ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2'].map(n => B[n]).filter(Boolean);
    if (!list.length) list = Object.values(B).filter(b => /spine|chest|torso/i.test(b.name)).slice(0, 3);
    this._spine = list; this._spineOf = this.model;
    return list;
  }
  bendSpine(twist, pitch) {
    const list = this.spineBones();
    if (!list.length) return;
    this.model.root.updateMatrixWorld(true);
    const n = list.length;
    const right = tmpV2.set(Math.cos(this.camYaw), 0, -Math.sin(this.camYaw));
    _rq.setFromAxisAngle(_up, twist / n).multiply(_rq2.setFromAxisAngle(right, pitch / n));
    for (const b of list) {
      b.parent.getWorldQuaternion(_pq);
      // q_local' = parent⁻¹ · R · parent · q_local; исходный поворот запоминаем и возвращаем перед
      // следующим кадром анимации: иначе доворот копится, если клип не трогает эту кость (корпус крутился волчком)
      if (!b._pre) b._pre = b.quaternion.clone();
      tmpQ.copy(_pq).invert().multiply(_rq).multiply(_pq);
      b.quaternion.premultiply(tmpQ);
      b.updateMatrixWorld(true);
    }
  }
  // ---------- руки к оружию (двухсуставный IK) ----------
  // Поза «с пистолетом» из общей библиотеки ставила руки далеко от тела, и оружие висело криво.
  // Теперь кисти сами тянутся к точкам на оружии: правая — к рукояти, левая — к рукояти (пистолет) или цевью.
  armBones() {
    if (this._arms && this._armsOf === this.model) return this._arms;
    const B = Object.values(this.model.bones);
    const f = re => B.find(b => re.test(b.name));
    const side = s => ({ a: f(new RegExp(s + 'Arm$')), b: f(new RegExp(s + 'ForeArm$')), c: f(new RegExp(s + 'Hand$')) });
    this._arms = { R: side('Right'), L: side('Left'), chest: f(/Spine2$/) || f(/Spine1$/) || f(/Spine$/) || f(/Neck$/) };
    this._armsOf = this.model;
    return this._arms;
  }
  // T — цель кисти, P — куда смотрит локоть
  ik2(arm, T, P) {
    if (!arm.a || !arm.b || !arm.c) return;
    const A = arm.a.getWorldPosition(_ia), Bp = arm.b.getWorldPosition(_ib), C = arm.c.getWorldPosition(_ic);
    const l1 = A.distanceTo(Bp), l2 = Bp.distanceTo(C);
    const dir = _id.subVectors(T, A); let d = dir.length();
    if (d < 1e-4) return;
    dir.divideScalar(d);
    d = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, d));
    const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const perp = _ip.subVectors(P, A); perp.addScaledVector(dir, -perp.dot(dir)).normalize();
    const E = _ie.copy(A).addScaledVector(dir, l1 * cosA).addScaledVector(perp, l1 * sinA);
    const Tc = _it.copy(A).addScaledVector(dir, d);
    this.aimBone(arm.a, _iu.subVectors(Bp, A).normalize(), _iv.subVectors(E, A).normalize());
    arm.b.getWorldPosition(Bp); arm.c.getWorldPosition(C);
    this.aimBone(arm.b, _iu.subVectors(C, Bp).normalize(), _iv.subVectors(Tc, Bp).normalize());
  }
  // кисть пальцами (ось +Y кости) в сторону dir
  orientHand(hand, dir) {
    if (!hand) return;
    hand.getWorldQuaternion(_iq);
    const cur = _iu.set(0, 1, 0).applyQuaternion(_iq);
    this.aimBone(hand, cur, dir);
  }
  // повернуть кость в мире так, чтобы направление from стало to
  aimBone(bone, from, to) {
    _iq.setFromUnitVectors(from, to);
    bone.parent.getWorldQuaternion(_pq);
    bone.getWorldQuaternion(_iw);
    _iw.premultiply(_iq);
    bone.quaternion.copy(_pq.invert().multiply(_iw));
    bone.updateMatrixWorld(true);
  }
  armIK(w) {
    const arms = this.armBones();
    if (!arms.R.a || !arms.chest || !this.weaponMesh || !this.gunHeld) { this.gripPt = null; return; }
    const long = w.slot === 'long';
    const up = this.aimMode;
    // руки и ствол — туда, куда смотрит корпус (ноги + доворот), а не камера: иначе на ходу руки выворачивало вбок
    const yaw = this.yaw + (this.twist || 0); this.gripYaw = yaw;
    const pitch = up === 'Aim' ? this.camPitch + this.recoil * 0.6 : -0.38;
    const fwd = _if.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = _ir.set(Math.cos(yaw), 0, -Math.sin(yaw));
    const shR = arms.R.a.getWorldPosition(_is);
    const reach = arms.R.a.position.length() > 0 ? 1 : 1;
    // длина руки модели
    const la = arms.R.a.getWorldPosition(_ia).distanceTo(arms.R.b.getWorldPosition(_ib)) + arms.R.b.getWorldPosition(_ib).distanceTo(arms.R.c.getWorldPosition(_ic));
    // как держать — из общей таблицы WHOLD (weapons3d.js)
    const H = WHOLD[this.weaponKey] || WHOLD.pistol, M = WMODEL[this.weaponKey] || WMODEL.pistol;
    this.gripFwd = (this.gripFwd || new THREE.Vector3()).copy(fwd); this.gripPitch = pitch;
    const chest = arms.chest.getWorldPosition(_ig);
    const grip = this.gripPt || (this.gripPt = new THREE.Vector3());
    if (H.stock) {
      // приклад в правое плечо: рукоять впереди плеча на длину приклада (от рукояти до заднего конца)
      grip.copy(shR).addScaledVector(right, -0.04).addScaledVector(_iy.set(0, 1, 0), -0.06).addScaledVector(fwd, M.len * M.grip + 0.03);
    } else {
      const k = up === 'Aim' ? H.aimK : H.readyK;
      grip.copy(shR).addScaledVector(right, -0.12 * reach).addScaledVector(fwd, la * k);
      grip.y = Math.min(grip.y, up === 'Aim' ? chest.y + 0.12 : chest.y - H.readyDrop);
    }
    const poleR = _ip2.copy(shR).addScaledVector(right, 0.5).add(_iy.set(0, -0.8, 0)).addScaledVector(fwd, -0.2);
    // кисть: пальцы вдоль ствола и чуть вниз, рукоять в ладони (≈7 см от запястья к пальцам)
    const fdir = _ifd.copy(fwd).addScaledVector(_iy.set(0, 1, 0), -0.35).normalize();
    const PALM = 0.07;
    const wristR = _iw2.copy(grip).addScaledVector(fdir, -PALM);
    this.ik2(arms.R, wristR, poleR);
    this.orientHand(arms.R.c, fdir);
    if (arms.L.a) {
      // левая: у пистолета — под правой кистью (подхват), у длинного — на цевье
      const tl = _il.copy(grip).addScaledVector(fwd, H.left || -0.01).addScaledVector(right, H.left ? 0 : -0.05);
      tl.y -= H.left ? 0.04 : 0.045;
      tl.addScaledVector(fdir, -PALM);
      const poleL = _ip3.copy(arms.L.a.getWorldPosition(_ia)).addScaledVector(right, -0.6).add(_iy.set(0, -0.8, 0));
      this.ik2(arms.L, tl, poleL);
      this.orientHand(arms.L.c, fdir);
    }
    // фактическая ладонь правой руки — точка рукояти (оружие ставится туда, а не в запястье)
    if (arms.R.c) { arms.R.c.getWorldPosition(grip); arms.R.c.getWorldQuaternion(_iq); grip.addScaledVector(_iv.set(0, 1, 0).applyQuaternion(_iq), PALM); }
  }

  // руки, которые двигал IK, возвращаем перед кадром анимации (если клип их не трогает, поворот копился бы)
  saveArms() {
    const a = this.armBones();
    for (const s of [a.R, a.L]) for (const b of [s.a, s.b, s.c]) if (b && !b._pre) b._pre = b.quaternion.clone();
  }
  mixUpdate(dt) {
    if (this._arms) for (const s of [this._arms.R, this._arms.L]) for (const b of [s.a, s.b, s.c]) if (b && b._pre) { b.quaternion.copy(b._pre); b._pre = null; }
    if (this._spine) for (const b of this._spine) if (b._pre) { b.quaternion.copy(b._pre); b._pre = null; }
    this.model.mixer.update(dt);
  }

  stats(dt, activity) {
    const g = this.g;
    this.food = Math.max(0, this.food - dt * 100 / 2160 * activity);
    this.water = Math.max(0, this.water - dt * 100 / 1440 * activity);
    let dhp = 0;
    if (this.food <= 0) dhp -= 0.4;
    if (this.water <= 0) dhp -= 0.6;
    if (this.bleed > 0) { dhp -= 0.7 * this.bleed; }
    if (this.infect > 0) { this.infect += dt / 600; dhp -= 0.15 + this.infect * 0.4; }
    if (this.regen > 0) { const k = Math.min(this.regen, 6 * dt); this.regen -= k; this.hp = Math.min(100, this.hp + k); }
    // естественное восстановление, если сыт и напоен
    if (this.food > 60 && this.water > 60 && this.bleed <= 0 && this.infect <= 0) dhp += 0.25;
    this.hp = Math.min(100, this.hp + dhp * dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    if (this.hp <= 0 && !this.dead) g.onPlayerDeath();
  }

  damage(n, src, from) {
    if (this.dead || n <= 0 || this.god) return; // god — бессмертие с тестового стенда
    let k = 1;
    for (const s of ['body', 'head']) {
      const a = this.eq[s];
      // броня держит и укусы, и ножи, и пули культистов; удар по броне звенит и мигает полосой в HUD
      if (a && (src === 'zombie' || src === 'cultist')) {
        const def = ITEMS[a.id]; k -= def.armor; a.dur -= n * 0.6; this.armorHitT = 0.25;
        audio.play('ric', null, { vol: 0.35, rate: 0.8 });
        if (a.dur <= 0) { this.eq[s] = null; this.g.ui.toast(def.name + (s === 'head' ? ' разбита' : ' разбит')); this.refreshGear(); }
      }
    }
    n *= Math.max(0.3, k);
    this.hp -= n;
    this.hurtT = 0.5;
    this.g.ui.hurt(from);
    if (src === 'zombie') {
      if (Math.random() < 0.22) { this.bleed = Math.min(2, this.bleed + 1); this.g.ui.toast('Кровотечение. Нужен бинт'); }
      if (Math.random() < 0.06 && this.infect <= 0) { this.infect = 0.01; this.g.ui.toast('Укус. Начинается заражение'); }
    }
    if (this.hp <= 0) this.g.onPlayerDeath();
    else if (Math.random() < 0.5) this.play('HitReact', 0.05, true);
  }
}

// бронежилет: корпус, две пластины, подсумки; смотрит в −z (вперёд), ширина под плечи подгоняется масштабом
let _vestMat = null;
function makeVest() {
  const g = new THREE.Group();
  _vestMat = _vestMat || [styleMaterial(new THREE.MeshLambertMaterial({ color: 0x3b4232 })), styleMaterial(new THREE.MeshLambertMaterial({ color: 0x262a22 }))];
  const box = (m, w, h, d, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); };
  box(_vestMat[0], 0.36, 0.4, 0.27, 0, 0, 0);
  box(_vestMat[1], 0.3, 0.3, 0.03, 0, 0.02, -0.15);
  box(_vestMat[1], 0.3, 0.3, 0.03, 0, 0.02, 0.15);
  for (const x of [-0.1, 0, 0.1]) box(_vestMat[0], 0.08, 0.1, 0.05, x, -0.12, -0.17);
  box(_vestMat[1], 0.06, 0.1, 0.27, -0.15, 0.22, 0); box(_vestMat[1], 0.06, 0.1, 0.27, 0.15, 0.22, 0);
  return g;
}
// каска: полусфера с ободком
function makeHelmet() {
  const g = new THREE.Group();
  const m = styleMaterial(new THREE.MeshLambertMaterial({ color: 0x4a5236 }));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m);
  dome.scale.set(1, 0.85, 1.1); dome.castShadow = true; g.add(dome);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.02, 10), m);
  rim.scale.set(1, 1, 1.12); g.add(rim);
  return g;
}

// масштаб, при котором персонаж ростом ~1.75 м; модели из разных наборов в разных единицах
const HERO_H = 1.75, scaleCache = {};
export function heroScale(key) {
  if (scaleCache[key]) return scaleCache[key];
  const g = Assets.gltf[key];
  let h = 0;
  g.scene.updateMatrixWorld(true);
  g.scene.traverse(o => {
    if (!o.isSkinnedMesh) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    h = Math.max(h, b.max.y - Math.min(0, b.min.y));
  });
  return (scaleCache[key] = h > 0.1 ? HERO_H / h : 1.2);
}

export function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return a + d * t;
}

// ---------- камера ----------
export class ThirdPersonCamera {
  constructor(camera, phys) {
    this.cam = camera;
    this.phys = phys;
    this.dist = 3.4;
    this.cur = new THREE.Vector3();
    this.fovBase = 62;
    this.zoom = 0;
    this.shake = 0;
  }
  update(dt, p) {
    const aim = p.aiming && !p.vehicle;
    const scope = aim && p.weapon && p.weapon.scope;
    this.zoom += ((aim ? 1 : 0) - this.zoom) * Math.min(1, dt * 10);
    let dist, height, side, pivot = new THREE.Vector3();
    if (p.vehicle) {
      const v = p.vehicle;
      dist = v.camDist || 7; height = v.camHeight || 2.2; side = 0;
      pivot.copy(v.pos); pivot.y += v.camPivot || 1.2;
    } else {
      dist = THREE.MathUtils.lerp(3.4, scope ? 0.6 : 1.5, this.zoom);
      height = p.crouch ? 1.15 : 1.62;
      side = THREE.MathUtils.lerp(0.55, 0.62, this.zoom) * p.shoulder;
      pivot.copy(p.pos); pivot.y += height;
    }
    const yaw = p.camYaw, pitch = p.camPitch;
    const back = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), -Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const shoulderPt = pivot.clone().addScaledVector(right, side);
    // упор камеры в стены: луч от плеча назад
    let d = dist;
    // в машине луч не должен упираться в её же корпус (иначе камера садилась на капот)
    const hit = this.phys.raycast(shoulderPt.x, shoulderPt.y, shoulderPt.z, back.x, back.y, back.z, dist + 0.3, p.vehicle || undefined);
    if (hit) d = Math.max(0.3, hit.t - 0.3);
    const want = shoulderPt.clone().addScaledVector(back, d);
    if (want.y < 0.3) want.y = 0.3;
    this.cur.copy(want);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2);
      this.cur.x += (Math.random() - 0.5) * this.shake * 0.3;
      this.cur.y += (Math.random() - 0.5) * this.shake * 0.3;
    }
    this.cam.position.copy(this.cur);
    const look = this.cur.clone().addScaledVector(back, -10);
    this.cam.lookAt(look);
    const fov = scope ? 22 : THREE.MathUtils.lerp(this.fovBase, 48, this.zoom);
    if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 12); this.cam.updateProjectionMatrix(); }
  }
}
