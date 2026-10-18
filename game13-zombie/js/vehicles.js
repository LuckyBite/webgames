// Транспорт: машины (аркадная физика, топливо, прочность, давят зомби), катер (только по воде,
// качается на волне), самолёт (разбег, взлёт с 28 м/с, полёт туда, куда смотрит камера,
// посадка при вертикальной скорости до 6 м/с, удар о здание — авария).
// Соглашение: yaw = 0 → вперёд по -z (как у камеры). Модели Kenney/Quaternius смотрят в +z.
import * as THREE from 'three';
import { Assets, makeMesh, styleMaterial } from './assets.js';
import { KIT_SCALE, COAST_X } from './city.js';
import { Input } from './input.js';
import { audio } from './audio.js';

const NAMES = {
  car: 'Универсал', car2: 'Седан', car3: 'Хэтчбек', car4: 'Минивэн', car5: 'Седан', car5_police: 'Полицейская машина', car5_taxi: 'Такси',
  car6: 'Ржавый седан', car7: 'Ретро-автомобиль', car8: 'Фургон',
  sedan: 'Седан', suv: 'Внедорожник', 'hatchback-sports': 'Хэтчбек', taxi: 'Такси', van: 'Фургон', police: 'Полицейская машина',
  truck: 'Грузовик', delivery: 'Развозной фургон', 'suv-luxury': 'Джип', ambulance: 'Скорая', 'sedan-sports': 'Спорткар',
  'garbage-truck': 'Мусоровоз', 'apoc:car_pickup': 'Пикап', 'apoc:car_normal1': 'Седан', 'apoc:car_normal2': 'Универсал',
  'apoc:car_sports': 'Спорткар', 'apoc:car_suv': 'Внедорожник', 'apoc:car_taxi': 'Такси', 'apoc:car_cop': 'Полицейская машина',
  'apoc:car_armored': 'Бронемашина',
};
// характеристики: макс. скорость м/с, разгон, прочность, расход
const SPEC = {
  car8: { max: 19, acc: 5.5, hp: 480, thirst: 1.5, turn: 1.5 }, car4: { max: 22, acc: 6.5, hp: 380, thirst: 1.2, turn: 1.6 },
  car7: { max: 18, acc: 5, hp: 260, thirst: 0.9, turn: 1.7 }, car3: { max: 27, acc: 9.5, hp: 260, thirst: 1, turn: 2.1 },
  default: { max: 25, acc: 8, hp: 300, thirst: 1, turn: 1.9 },
  truck: { max: 18, acc: 5, hp: 500, thirst: 1.6, turn: 1.4 }, 'garbage-truck': { max: 16, acc: 4.5, hp: 600, thirst: 1.8, turn: 1.3 },
  van: { max: 21, acc: 6.5, hp: 380, thirst: 1.2, turn: 1.6 }, delivery: { max: 21, acc: 6.5, hp: 380, thirst: 1.2, turn: 1.6 },
  ambulance: { max: 22, acc: 6.5, hp: 400, thirst: 1.3, turn: 1.6 },
  'sedan-sports': { max: 33, acc: 12, hp: 240, thirst: 1.3, turn: 2.1 }, 'hatchback-sports': { max: 29, acc: 10, hp: 250, thirst: 1.1, turn: 2.2 },
  'apoc:car_sports': { max: 34, acc: 12, hp: 240, thirst: 1.3, turn: 2.1 }, 'apoc:car_armored': { max: 27, acc: 9, hp: 900, thirst: 1.6, turn: 1.8 },
  'apoc:car_pickup': { max: 24, acc: 8, hp: 450, thirst: 1.3, turn: 1.8 },
};

const tmpV = new THREE.Vector3();

export class Vehicle {
  constructor(sys, kind, o) {
    this.sys = sys; this.g = sys.g;
    this.kind = kind;
    this.pos = new THREE.Vector3(o.x, 0, o.z);
    this.yaw = o.yaw;
    this.speed = 0;
    this.fuel = o.fuel ?? 0.3;
    this.model = o.model || kind;
    this.name = o.name || NAMES[this.model] || ({ boat: 'Катер', plane: 'Самолёт' })[kind] || 'Машина';
    this.driven = false;
    this.air = false; this.pitch = 0; this.roll = 0; this.vy = 0; this.throttle = 0;
    this.lights = false;
    this.ign = o.ign || 'ok';            // зажигание: ok / timing (поймать момент) / dead (сел аккумулятор)
    this.running = kind !== 'car' || !!o.running;
    this.boxes = [];
    this.smokeT = 0;
    this.build(o);
    this.hp = this.maxHp;
    this.updateBoxes();
  }

  build(o) {
    const g = this.g;
    this.root = new THREE.Group();
    let inner;
    if (this.kind === 'car') {
      // PSX Style Cars (GGBot): модели в своих единицах, приводим длину к 4.4 м (фургон 5.2 м)
      const key = 'env_cars:' + this.model;
      const t0 = Assets.tpl[key];
      const s = t0 ? (this.model === 'car8' ? 5.2 : 4.4) / Math.max(t0.size.x, t0.size.z) : 1;
      // колёса в моделях GGBot — отдельные куски сетки: вырезаем их, чтобы крутить и поворачивать
      const spl = t0 && splitWheels(key);
      if (spl) {
        inner = new THREE.Group();
        for (const b of spl.body) { const m = new THREE.Mesh(b.geometry, b.material); m.castShadow = true; inner.add(m); }
        this.wheels = spl.wheels.map(w => {
          const piv = new THREE.Group();
          piv.position.copy(w.c);
          const m = new THREE.Mesh(w.geometry, w.material); m.castShadow = true;
          const spin = new THREE.Group(); spin.add(m);
          piv.add(spin);
          inner.add(piv);
          return { piv, spin, front: w.front, r: w.r * s };
        });
      } else inner = makeMesh(key, { receive: false });
      inner.scale.setScalar(s);
      const t = Assets.tpl[key];
      this.len = t ? t.size.z * s : 4.4; this.wid = t ? t.size.x * s : 1.9; this.hgt = t ? t.size.y * s : 1.5;
      // центр модели по длине
      if (t) inner.position.z = -(t.box.min.z + t.box.max.z) / 2 * s, inner.position.x = -(t.box.min.x + t.box.max.x) / 2 * s;
      const sp = SPEC[this.model] || SPEC.default;
      this.spec = sp;
      this.maxHp = sp.hp;
      this.camDist = Math.max(6.5, this.len * 1.45); this.camHeight = 2.4; this.camPivot = this.hgt * 0.8;
      inner.rotation.y = Math.PI;
      inner.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    } else if (this.kind === 'boat') {
      const key = 'water:' + this.model;
      const s = KIT_SCALE.water;
      inner = makeMesh(key);
      inner.scale.setScalar(s);
      const t = Assets.tpl[key];
      this.len = t ? t.size.z * s : 6; this.wid = t ? t.size.x * s : 2.6; this.hgt = 1.6;
      inner.rotation.y = Math.PI;
      this.spec = { max: 17, acc: 6, hp: 260, thirst: 0.9, turn: 1.1 };
      this.maxHp = 260;
      this.camDist = 9; this.camHeight = 3; this.camPivot = 1.2;
      this.pos.y = -0.45;
    } else {
      inner = buildPlane();
      this.len = 8.2; this.wid = 11; this.hgt = 2.6;
      this.spec = { max: 58, acc: 7, hp: 220, thirst: 1.6, turn: 0.9 };
      this.maxHp = 220;
      this.camDist = 15; this.camHeight = 3.5; this.camPivot = 1.6;
    }
    this.inner = inner;
    this.root.add(inner);
    g.scene.add(this.root);
    this.sync();
  }

  get fwdX() { return -Math.sin(this.yaw); }
  get fwdZ() { return -Math.cos(this.yaw); }

  // коллайдер: несколько AABB вдоль корпуса
  updateBoxes() {
    const ph = this.g.phys;
    if (this.kind === 'plane' && this.air) { this.setSolid(false); return; }
    const n = this.kind === 'plane' ? 3 : 3;
    const short = this.kind === 'plane' ? 1.6 : this.wid;
    const len = this.len;
    if (!this.boxes.length) {
      for (let i = 0; i < n; i++) { const b = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, tag: 'car', ref: this, solid: true }; this.boxes.push(b); ph.dynamic.push({ box: b, ref: this }); }
      if (this.kind === 'plane') { // крыло
        const b = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, tag: 'car', ref: this, solid: true, wing: true };
        this.boxes.push(b); ph.dynamic.push({ box: b, ref: this });
      }
    }
    const fx = this.fwdX, fz = this.fwdZ;
    const y0 = this.kind === 'boat' ? this.pos.y - 0.3 : this.pos.y;
    for (let i = 0; i < n; i++) {
      const t = ((i + 0.5) / n - 0.5) * (len - short * 0.6);
      const cx = this.pos.x + fx * t, cz = this.pos.z + fz * t, hs = short * 0.48;
      const b = this.boxes[i];
      b.minX = cx - hs; b.maxX = cx + hs; b.minZ = cz - hs; b.maxZ = cz + hs; b.minY = y0; b.maxY = y0 + Math.min(this.hgt, 1.6);
    }
    if (this.kind === 'plane') {
      const b = this.boxes[n];
      const cx = this.pos.x + fx * -0.6, cz = this.pos.z + fz * -0.6;
      const ax = Math.abs(fz) * 5.4 + 0.6, az = Math.abs(fx) * 5.4 + 0.6;
      b.minX = cx - ax; b.maxX = cx + ax; b.minZ = cz - az; b.maxZ = cz + az; b.minY = this.pos.y + 1.2; b.maxY = this.pos.y + 1.6;
    }
    this.setSolid(!this.driven || this.kind !== 'plane' || !this.air);
  }
  setSolid(on) { for (const b of this.boxes) b.solid = on; }

  sync() {
    this.root.position.copy(this.pos);
    this.root.rotation.order = 'YXZ';
    this.root.rotation.set(this.pitch, this.yaw, this.roll);
  }

  // колёса: катятся по скорости, передние поворачиваются вслед за рулём
  spinWheels(dt) {
    if (!this.wheels) return;
    const steer = this.driven ? (this.steer || 0) : 0;
    for (const w of this.wheels) {
      // на ручнике задние колёса стоят
      if (w.front || !(this.driven && this.handbrake)) w.spin.rotation.x += this.speed * dt / Math.max(0.15, w.r);
      if (w.front) w.piv.rotation.y = -steer * 0.55;
    }
  }

  damage(n, src) {
    if (this.hp <= 0) return;
    this.hp -= n;
    if (this.hp <= 0) {
      this.hp = 0;
      this.speed *= 0.3;
      audio.play('explosion', this.pos, { vol: 0.7, range: 60 });
      this.g.fx.explode(this.pos.clone().setY(this.pos.y + 1), { radius: 5, dmg: 80, noise: 90 });
      this.inner.traverse(o => { if (o.isMesh) { o.material = this.sys.burnt; } });
      if (this.driven && this.g.player.vehicle === this) { this.g.ui.toast(this.name + ' разбит'); this.sys.exit(true); }
    }
  }

  // ---------- кадр (за рулём) ----------
  drive(dt) {
    if (this.kind === 'car') this.driveCar(dt);
    else if (this.kind === 'boat') this.driveBoat(dt);
    else this.flyPlane(dt);
  }

  engineOk() { return this.fuel > 0 && this.hp > 0 && this.running; }

  driveCar(dt) {
    const sp = this.spec, g = this.g;
    // руль поворачивается плавно и сам возвращается; на скорости его ход меньше
    this.steer = this.steer || 0;
    this.steer += (Input.move.x - this.steer) * Math.min(1, dt * (Math.abs(Input.move.x) > 0.1 ? 5 : 8));
    let thr = Input.move.y, steer = this.steer;
    if (!this.engineOk()) thr = Math.min(0, thr) * 0; // без топлива только катится
    const hand = Input.held.has('jump');
    if (thr > 0.05) {
      if (this.speed < -0.5) this.speed += 20 * thr * dt;
      else if (this.speed < sp.max) this.speed += sp.acc * thr * dt * (1 - this.speed / sp.max * 0.6);
    } else if (thr < -0.05) {
      if (this.speed > 0.5) this.speed -= 20 * -thr * dt;
      else if (this.speed > -7) this.speed -= sp.acc * 0.6 * -thr * dt;
    } else {
      // накат
      const roll = Math.min(Math.abs(this.speed), (1.4 + Math.abs(this.speed) * 0.04) * dt);
      this.speed -= Math.sign(this.speed) * roll;
    }
    if (Input.move.y < -0.05 && !this.engineOk()) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 12 * dt);
    // ручник блокирует задние колёса: машина тормозит мягче, но зад теряет сцепление — занос
    this.handbrake = hand;
    if (hand) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 5 * dt);
    const turnK = Math.max(-1, Math.min(1, this.speed / 5)) * (1 - Math.min(0.55, Math.abs(this.speed) / sp.max * 0.55));
    // скорость в мире до поворота: при заносе она не поворачивается вместе с кузовом
    const vx = this.fwdX * this.speed + -this.fwdZ * (this.slide || 0), vz = this.fwdZ * this.speed + this.fwdX * (this.slide || 0);
    const spin = hand && Math.abs(this.speed) > 4 ? 2.1 : 1; // на ручнике кузов разворачивает резче
    this.yaw -= steer * sp.turn * turnK * dt * spin;
    // разложить скорость по новым осям кузова: вперёд и вбок
    this.speed = vx * this.fwdX + vz * this.fwdZ;
    this.slide = vx * -this.fwdZ + vz * this.fwdX;
    // шины гасят боковое скольжение: обычно быстро, на ручнике — едва
    const grip = hand ? 0.9 : 7;
    this.slide *= Math.exp(-grip * dt);
    if (Math.abs(this.slide) < 0.02) this.slide = 0;
    // дым из-под задних колёс в заносе
    if (Math.abs(this.slide) > 2.2 && (this._skidT = (this._skidT || 0) - dt) <= 0) {
      this._skidT = 0.06;
      for (const s of [-1, 1]) g.fx.smoke(this.pos.x - this.fwdX * this.len * 0.35 - this.fwdZ * s * this.wid * 0.4, 0.2, this.pos.z - this.fwdZ * this.len * 0.35 + this.fwdX * s * this.wid * 0.4, 0.5, 1.4, 0.35, 0.6);
    }
    this.fuel = Math.max(0, this.fuel - Math.abs(thr) * dt / 420 * sp.thirst);
    this.moveWithCollision(dt, 0.45, 1.3);
    this.runOver(dt);
    // корпус: клюёт при торможении, приседает при разгоне, кренится в повороте
    const accel = (this.speed - (this._lastSpeed ?? this.speed)) / Math.max(dt, 1e-3);
    this._lastSpeed = this.speed;
    this.pitch += (Math.max(-0.05, Math.min(0.05, -accel * 0.006)) - this.pitch) * Math.min(1, dt * 6);
    this.roll += (-steer * Math.min(1, Math.abs(this.speed) / sp.max) * 0.06 + (this.slide || 0) * 0.008 - this.roll) * Math.min(1, dt * 6);
    this.engineSound('engineCar', this.model.includes('truck') ? 0.7 : 1);
    this.g.player.noise = Math.max(this.g.player.noise, this.engineOk() ? 22 + Math.abs(this.speed) * 1.5 : 0);
  }

  moveWithCollision(dt, y, h) {
    const g = this.g;
    // вперёд + вбок (занос)
    const sl = this.slide || 0;
    const dx = (this.fwdX * this.speed - this.fwdZ * sl) * dt, dz = (this.fwdZ * this.speed + this.fwdX * sl) * dt;
    this.setSolid(false);
    const r = this.wid * 0.52;
    const off = (this.len / 2 - r);
    let cx = 0, cz = 0, hit = false, hitN = 0;
    for (const s of [off, 0, -off]) {
      const p = { x: this.pos.x + this.fwdX * s + dx, y, z: this.pos.z + this.fwdZ * s + dz };
      const ox = p.x, oz = p.z;
      if (g.phys.resolve(p, r, h)) { hit = true; cx += p.x - ox; cz += p.z - oz; hitN++; }
    }
    this.pos.x += dx; this.pos.z += dz;
    if (hit) {
      cx /= hitN; cz /= hitN;
      this.pos.x += cx; this.pos.z += cz;
      const cl = Math.hypot(cx, cz) || 1;
      const head = (cx * this.fwdX + cz * this.fwdZ) / cl * Math.sign(this.speed || 1);
      const imp = Math.abs(this.speed) * Math.max(0, -head);
      if (imp > 6) {
        this.damage((imp - 6) * 9, 'crash');
        // удар металла: глухой стук двери на низкой ноте и тяжёлый удар
        audio.play('carDoorClose', this.pos, { vol: Math.min(1, imp / 14), rate: 0.55, range: 40 });
        audio.play('hitHeavy', this.pos, { vol: Math.min(1, imp / 16), rate: 0.6, range: 40 });
        if (imp > 12) audio.play('glass', this.pos, { vol: Math.min(0.6, imp / 30), rate: 0.8, range: 30 });
        g.camCtl.shake = Math.min(1.5, imp / 12);
        if (imp > 16 && this.driven) g.player.damage((imp - 16) * 3, 'crash');
      }
      if (head < -0.5) this.speed *= -0.2; else this.speed *= 0.92;
      this.slide = (this.slide || 0) * 0.3;
    }
    this.setSolid(true);
  }

  runOver(dt) {
    const g = this.g;
    const as = Math.abs(this.speed);
    for (const z of g.zombies.list) {
      if (z.dead) continue;
      const dx = z.pos.x - this.pos.x, dz = z.pos.z - this.pos.z;
      if (dx * dx + dz * dz > (this.len / 2 + 1.5) ** 2) continue;
      // в локальные оси машины
      const lf = dx * this.fwdX + dz * this.fwdZ, ls = dx * -this.fwdZ + dz * this.fwdX;
      if (Math.abs(lf) > this.len / 2 + z.r || Math.abs(ls) > this.wid / 2 + z.r) continue;
      if (as > 3.5) {
        const dir = tmpV.set(this.fwdX * Math.sign(this.speed), 0, this.fwdZ * Math.sign(this.speed));
        g.zombies.hit(z, as * 10 * (z.T.boss ? 0.4 : 1), dir, 3 + as * 0.2, false, 'vehicle');
        g.fx.blood(z.pos.clone().setY(1));
        audio.play('hitHeavy', z.pos, { vol: 0.8 });
        this.damage(z.T.shove ? 25 : 6, 'zombie');
        this.speed *= z.T.boss ? 0.4 : z.T.shove ? 0.75 : 0.93;
      } else {
        // медленно — просто расталкиваем
        const k = (this.wid / 2 + z.r - Math.abs(ls)) * Math.sign(ls || 1);
        z.pos.x += -this.fwdZ * k * 0.5; z.pos.z += this.fwdX * k * 0.5;
      }
    }
  }

  driveBoat(dt) {
    const sp = this.spec, g = this.g;
    let thr = this.engineOk() ? Input.move.y : 0;
    if (thr > 0) this.speed = Math.min(sp.max, this.speed + sp.acc * thr * dt);
    else if (thr < 0) this.speed = Math.max(-4, this.speed + sp.acc * thr * dt);
    this.speed -= this.speed * 0.35 * dt;
    this.yaw -= Input.move.x * sp.turn * Math.max(-1, Math.min(1, this.speed / 4)) * dt;
    this.fuel = Math.max(0, this.fuel - Math.abs(thr) * dt / 400 * sp.thirst);
    const ox = this.pos.x, oz = this.pos.z;
    this.moveWithCollision(dt, this.pos.y, 1.2);
    // только вода
    if (!g.world.isInWater(this.pos.x - this.fwdX * 0, this.pos.z) || this.pos.x < COAST_X + this.len * 0.4) {
      this.pos.x = ox; this.pos.z = oz;
      if (Math.abs(this.speed) > 5) { this.damage(Math.abs(this.speed) * 2, 'crash'); audio.play('wood', this.pos, { vol: 0.6 }); }
      this.speed *= -0.3;
    }
    if (Math.abs(this.pos.z) > 1150 || this.pos.x > COAST_X + 650) { this.pos.x = ox; this.pos.z = oz; this.speed *= -0.3; }
    this.bob(g.time);
    this.roll += -Input.move.x * Math.min(1, Math.abs(this.speed) / sp.max) * 0.12;
    this.pitch -= Math.min(1, Math.abs(this.speed) / sp.max) * 0.06;
    this.engineSound('engineBoat', 1);
    if (Math.abs(this.speed) > 3) g.fx.spawn(this.pos.x - this.fwdX * this.len * 0.5, -0.3, this.pos.z - this.fwdZ * this.len * 0.5, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, 0.7, 0.75, 0.8, 0.82, 0.18, 5);
  }

  bob(t) {
    const k = this.pos.x * 0.13 + this.pos.z * 0.07;
    this.pos.y = -0.45 + Math.sin(t * 1.3 + k) * 0.12;
    this.pitch = Math.sin(t * 1.1 + k) * 0.035;
    this.roll = Math.sin(t * 0.9 + k * 1.3) * 0.05;
  }

  flyPlane(dt) {
    const sp = this.spec, g = this.g, p = g.player;
    const can = this.engineOk();
    if (Input.move.y > 0.1 && can) this.throttle = Math.min(1, this.throttle + dt * 0.5 * Input.move.y);
    if (Input.move.y < -0.1) this.throttle = Math.max(0, this.throttle + dt * 0.6 * Input.move.y);
    if (!can) this.throttle = Math.max(0, this.throttle - dt);
    this.fuel = Math.max(0, this.fuel - this.throttle * dt / 300 * sp.thirst);
    const target = this.throttle * sp.max;
    if (!this.air) {
      // разбег по земле
      if (this.speed < target) this.speed += sp.acc * dt; else this.speed -= Math.min(this.speed - target, 4 * dt);
      if (Input.held.has('jump')) this.speed = Math.max(0, this.speed - 10 * dt);
      this.yaw -= Input.move.x * 0.8 * Math.min(1, this.speed / 6) * dt * (this.speed > 2 ? 1 : 0);
      this.pitch = 0; this.roll = 0;
      const wantUp = p.camPitch > 0.05;
      this.moveWithCollision(dt, 0.5, 1.6);
      if (this.speed >= 28 && wantUp) { this.air = true; this.vy = 2; this.pitch = 0.12; this.pos.y = 0.3; g.ui.toast('Взлёт'); }
      if (this.speed > 26 && !wantUp && !this._hinted) { this._hinted = true; g.ui.toast('Подними камеру вверх, чтобы взлететь'); }
    } else {
      // летим туда, куда смотрит камера
      const wantYaw = p.camYaw, wantPitch = Math.max(-0.6, Math.min(0.55, p.camPitch + 0.12));
      const dy = angDiff(wantYaw, this.yaw);
      const turn = Math.max(-1, Math.min(1, dy * 1.6 - Input.move.x * 0.6));
      this.yaw += turn * sp.turn * dt;
      this.roll += ((-turn * 0.9) - this.roll) * Math.min(1, dt * 3);
      this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 1.8);
      // скорость: тяга + сила тяжести вдоль траектории
      this.speed += ((target - this.speed) * 0.25 - 9.8 * Math.sin(this.pitch)) * dt;
      this.speed = Math.max(0, this.speed);
      let vy = Math.sin(this.pitch) * this.speed;
      // сваливание
      if (this.speed < 22) { const k = (22 - this.speed) / 22; vy -= 14 * k; this.pitch -= k * dt * 0.8; }
      this.vy = vy;
      const h = Math.cos(this.pitch) * this.speed;
      const nx = this.pos.x + this.fwdX * h * dt, nz = this.pos.z + this.fwdZ * h * dt, ny = this.pos.y + vy * dt;
      // удар о здание по пути
      const d = Math.hypot(nx - this.pos.x, ny - this.pos.y, nz - this.pos.z);
      if (d > 0.01) {
        const hit = g.phys.raycast(this.pos.x, this.pos.y + 1, this.pos.z, (nx - this.pos.x) / d, (ny - this.pos.y) / d, (nz - this.pos.z) / d, d + 2.5);
        if (hit && hit.box !== undefined && hit.box.tag !== 'ground' && hit.box.ref !== this && hit.box.tag !== 'bound') return this.crash('Самолёт врезался');
      }
      this.pos.set(nx, Math.max(gyMin(this), Math.min(320, ny)), nz);
      if (Math.abs(nx) > 890 || Math.abs(nz) > 890) { this.yaw += Math.PI * dt; }
      const gy = this.overWater() ? -0.6 : 0;
      if (this.pos.y <= gy + 0.05 && vy <= 0) {
        // касание: мягкая посадка или авария
        if (this.overWater()) return this.crash('Самолёт упал в воду');
        if (vy < -6 || Math.abs(this.roll) > 0.5 || g.phys.blocked(this.pos.x, 0.3, this.pos.z, 2.5, 2)) return this.crash('Жёсткая посадка');
        this.air = false; this.pos.y = 0; this.pitch = 0; this.roll = 0; this.vy = 0;
        g.ui.toast('Посадка');
        audio.play('hitHeavy', this.pos, { vol: 0.6 });
      }
    }
    this.engineSound('enginePlane', 0.6 + this.throttle * 0.7);
    p.noise = Math.max(p.noise, 40 + this.throttle * 60);
  }

  overWater() { return this.g.world.isInWater(this.pos.x, this.pos.z); }

  crash(msg) {
    const g = this.g;
    g.ui.toast(msg);
    this.air = false;
    this.speed = 0;
    if (!this.overWater()) this.pos.y = Math.max(0, g.phys.groundAt(this.pos.x, this.pos.z, this.pos.y + 1));
    else this.pos.y = -1.2;
    this.pitch = 0.15; this.roll = 0.4;
    this.damage(9999, 'crash');
    if (g.player.vehicle === this) this.sys.exit(true);
    g.player.damage(65, 'crash');
  }

  engineSound(key, rate) {
    const id = 'veh';
    audio.loop(id, key);
    const k = Math.abs(this.speed) / (this.spec.max || 20);
    audio.setLoop(id, this.engineOk() ? 0.25 + k * 0.3 : 0, rate * (0.7 + k * 0.9));
  }

  idle(dt) {
    // вне управления: лодка качается, машина катится до остановки, самолёт падает
    if (this.kind === 'boat') { this.bob(this.g.time); this.speed *= Math.max(0, 1 - dt); }
    else if (this.kind === 'plane' && this.air) { this.flyPlaneIdle(dt); }
    else if (Math.abs(this.speed) > 0.05) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 6 * dt);
      this.slide = (this.slide || 0) * Math.exp(-5 * dt);
      this.moveWithCollision(dt, 0.45, 1.3);
    }
    if (this.hp <= 0 || this.hp < this.maxHp * 0.3) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = this.hp <= 0 ? 0.15 : 0.35;
        this.g.fx.spawn(this.pos.x + this.fwdX * this.len * 0.3, this.pos.y + this.hgt, this.pos.z + this.fwdZ * this.len * 0.3, (Math.random() - 0.5) * 0.4, 1.2, (Math.random() - 0.5) * 0.4, 3, 0.18, 0.18, 0.19, 0.5, -0.2, 0.5);
      }
    }
  }
  flyPlaneIdle(dt) { this.pitch -= dt * 0.5; this.pos.y -= 20 * dt; if (this.pos.y <= 0) { this.crash('Самолёт разбился'); } }
}

function gyMin(v) { return v.overWater() ? -0.6 : 0; }

// Делит шаблон машины на корпус и колёса. Колесо — связный кусок сетки у земли, круглый в профиле
// (по высоте и длине почти одинаковый) и узкий по ширине. Результат кешируется на модель.
const wheelCache = {};
function splitWheels(key) {
  if (wheelCache[key] !== undefined) return wheelCache[key];
  const t = Assets.tpl[key];
  const minY = t.box.min.y, H = t.size.y, cz = (t.box.min.z + t.box.max.z) / 2;
  const body = [], wheels = [];
  for (const part of t.parts) {
    const g = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    const pos = g.attributes.position, n = pos.count;
    // сварка вершин по координатам → связность треугольников
    const id = new Int32Array(n), map = new Map();
    for (let i = 0; i < n; i++) {
      const k = Math.round(pos.getX(i) * 1e4) + ',' + Math.round(pos.getY(i) * 1e4) + ',' + Math.round(pos.getZ(i) * 1e4);
      if (!map.has(k)) map.set(k, map.size);
      id[i] = map.get(k);
    }
    const par = Array.from({ length: map.size }, (_, i) => i);
    const f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
    for (let t3 = 0; t3 < n; t3 += 3) { const a = f(id[t3]); par[f(id[t3 + 1])] = a; par[f(id[t3 + 2])] = a; }
    const comps = new Map();
    for (let t3 = 0; t3 < n; t3 += 3) {
      const r = f(id[t3]);
      if (!comps.has(r)) comps.set(r, { tris: [], box: new THREE.Box3(), verts: new Set() });
      const c = comps.get(r);
      c.tris.push(t3);
      for (let k = 0; k < 3; k++) { c.box.expandByPoint(_v.fromBufferAttribute(pos, t3 + k)); c.verts.add(id[t3 + k]); }
    }
    const bodyTris = [];
    for (const c of comps.values()) {
      const s = c.box.getSize(new THREE.Vector3());
      const isWheel = c.verts.size <= 40 && c.box.min.y < minY + H * 0.06 && s.y > H * 0.2 && Math.abs(s.y - s.z) < s.y * 0.25 && s.x < s.y * 0.8;
      if (isWheel) {
        const ctr = c.box.getCenter(new THREE.Vector3());
        wheels.push({ geometry: subGeo(g, c.tris, ctr), material: part.material, c: ctr, r: s.y / 2, front: ctr.z > cz });
      } else bodyTris.push(...c.tris);
    }
    body.push({ geometry: subGeo(g, bodyTris, null), material: part.material });
  }
  return (wheelCache[key] = wheels.length >= 4 ? { body, wheels } : null);
}
const _v = new THREE.Vector3();
function subGeo(g, tris, center) {
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const arr = new Float32Array(tris.length * 3 * a.itemSize);
    let o = 0;
    for (const t3 of tris) for (let k = 0; k < 3; k++) for (let j = 0; j < a.itemSize; j++) arr[o++] = a.array[(t3 + k) * a.itemSize + j];
    out.setAttribute(name, new THREE.BufferAttribute(arr, a.itemSize));
  }
  if (center) out.translate(-center.x, -center.y, -center.z);
  out.computeBoundingSphere();
  return out;
}
function angDiff(a, b) { return ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }

// процедурная «Сессна»: нос в -z
function buildPlane() {
  const g = new THREE.Group();
  const mat = c => styleMaterial(new THREE.MeshLambertMaterial({ color: c }));
  const body = mat(0xc9c4b8), stripe = mat(0x8a3a2e), dark = mat(0x2a2c30), glass = mat(0x3a4a58);
  const box = (m, w, h, d, x, y, z, rx = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.rotation.x = rx; b.castShadow = true; g.add(b); return b; };
  box(body, 1.3, 1.3, 4.6, 0, 1.45, -0.6);          // фюзеляж
  box(body, 0.9, 0.9, 3.2, 0, 1.6, 3.2, 0.08);       // хвостовая балка
  box(glass, 1.25, 0.6, 1.3, 0, 2.25, -1.1);         // кабина
  box(body, 11, 0.14, 1.6, 0, 2.55, -0.9);           // крыло
  box(stripe, 11.02, 0.15, 0.3, 0, 2.55, -0.25);
  box(body, 3.6, 0.1, 1.0, 0, 1.75, 4.4);            // стабилизатор
  box(stripe, 0.12, 1.4, 1.1, 0, 2.4, 4.5);          // киль
  box(dark, 0.5, 0.5, 0.4, 0, 1.4, -3.0);            // кок
  const prop = box(dark, 2.2, 0.16, 0.06, 0, 1.4, -3.25);
  g.userData.prop = prop;
  for (const s of [-1, 1]) { box(dark, 0.08, 0.9, 0.08, s * 0.9, 0.55, -0.6); box(dark, 0.22, 0.5, 0.5, s * 0.9, 0.25, -0.6); }
  box(dark, 0.08, 0.8, 0.08, 0, 0.6, -2.4); box(dark, 0.2, 0.4, 0.4, 0, 0.2, -2.4);
  return g;
}

// ---------- система ----------
export class Vehicles {
  constructor(game) {
    this.g = game;
    this.list = [];
    this.burnt = styleMaterial(new THREE.MeshLambertMaterial({ color: 0x241f1c }));
    this.head = new THREE.SpotLight(0xffe2a8, 0, 45, 0.5, 0.5, 1.2);
    this.head.target = new THREE.Object3D();
    game.scene.add(this.head, this.head.target);
  }

  build(plan) {
    for (const c of plan.cars) if (c.works) {
      if (!Assets.tpl['env_cars:' + c.model]) continue;
      const v = new Vehicle(this, 'car', { x: c.x, z: c.z, yaw: c.ry + Math.PI, fuel: c.fuel, model: c.model, ign: c.ign });
      // багажник ездит вместе с машиной, открывается только сзади
      this.g.world.addContainer('car', c.x, 0.9, c.z, null, { chance: 0.7, label: 'Багажник', radius: 1.3 });
      v.trunk = this.g.world.containers[this.g.world.containers.length - 1];
      this.list.push(v);
    }
    for (const b of plan.boats) if (Assets.tpl['water:' + b.model]) this.list.push(new Vehicle(this, 'boat', { x: b.x, z: b.z, yaw: b.ry + Math.PI, fuel: b.fuel, model: b.model }));
    for (const p of plan.planes) this.list.push(new Vehicle(this, 'plane', { x: p.x, z: p.z, yaw: p.ry, fuel: p.fuel, model: 'plane' }));
  }

  nearest(pos, maxD = 3) {
    let best = null, bd = maxD;
    for (const v of this.list) {
      if (v.driven) continue;
      const dx = pos.x - v.pos.x, dz = pos.z - v.pos.z;
      // расстояние до прямоугольника корпуса
      const lf = Math.abs(dx * v.fwdX + dz * v.fwdZ) - v.len / 2, ls = Math.abs(dx * -v.fwdZ + dz * v.fwdX) - (v.kind === 'plane' ? 1 : v.wid / 2);
      const d = Math.hypot(Math.max(0, lf), Math.max(0, ls));
      if (d < bd && Math.abs(pos.y - v.pos.y) < 2.5) { bd = d; best = v; }
    }
    return best;
  }

  enter(v) {
    const g = this.g, p = g.player;
    if (v.hp <= 0) { g.ui.toast(v.name + ' разбит'); return false; }
    v.driven = true;
    p.vehicle = v;
    p.model.root.visible = false;
    p.aiming = false; p.sprinting = false; p.crouch = false;
    p.camYaw = v.yaw;
    audio.play(v.kind === 'car' ? 'carDoor' : 'door', v.pos, { vol: 0.7 });
    v.steer = 0;
    if (v.kind === 'car' && !v.running) this.tryStart(v);
    else if (v.fuel <= 0) g.ui.toast('Бак пуст. Нужна канистра бензина');
    else g.ui.toast(v.name + ': бензин ' + Math.round(v.fuel * 100) + '%');
    v.setSolid(v.kind !== 'plane');
    return true;
  }

  // ---------- запуск мотора ----------
  // Часть машин заводится сразу, часть — только если поймать момент (стрелка в зелёной зоне), у части сел аккумулятор.
  tryStart(v) {
    const g = this.g, p = g.player;
    if (v.fuel <= 0) { g.ui.toast('Бак пуст. Нужна канистра бензина'); return; }
    if (v.ign === 'dead') {
      if (p.inv.count('battery') > 0) { p.inv.take('battery', 1); v.ign = 'timing'; g.ui.toast('Поставил аккумулятор'); }
      else { audio.play('click', v.pos, { vol: 0.6 }); g.ui.toast('Не заводится: сел аккумулятор. Нужен аккумулятор'); return; }
    }
    if (v.ign === 'ok') return this.started(v);
    this.crank = { v, t: Math.random() * 2, tries: 3, zone: 0.25 + Math.random() * 0.5, w: 0.1 + 0.08 * Math.max(0.2, v.hp / v.maxHp), speed: 1.1 + Math.random() * 0.5, cool: 0.3, pos: 0 };
    g.ui.crank(this.crank);
  }
  started(v) {
    v.running = true;
    this.crank = null; this.g.ui.crank(null);
    setTimeout(() => { if (v.driven) audio.play('carStart', null, { vol: 0.6, jitter: false }); }, 200);
    this.g.ui.toast(v.name + ' завелась. Бензин ' + Math.round(v.fuel * 100) + '%');
  }
  updateCrank(dt) {
    const c = this.crank, g = this.g;
    if (!c) return;
    if (!c.v.driven) { this.crank = null; g.ui.crank(null); return; }
    c.t += dt * c.speed; c.cool -= dt;
    c.pos = 1 - Math.abs((c.t % 2) - 1);
    if (c.cool <= 0 && (Input.pressed.has('jump') || Input.pressed.has('fire'))) {
      if (Math.abs(c.pos - c.zone) <= c.w / 2) return this.started(c.v);
      c.tries--; c.cool = 0.7;
      audio.play('carStop', c.v.pos, { vol: 0.45, rate: 1.6 });
      g.zombies.hearNoise(c.v.pos, 30);
      if (c.tries <= 0) { this.crank = null; g.ui.crank(null); g.ui.toast('Не завелась. Выйди и попробуй ещё раз'); return; }
    }
    g.ui.crank(c);
  }

  // выход: ищем свободное место у двери
  exit(force = false) {
    const g = this.g, p = g.player, v = p.vehicle;
    if (!v) return;
    if (!force && v.kind === 'plane' && (v.air || v.speed > 4)) { g.ui.toast('Сначала приземлись и остановись'); return; }
    if (!force && Math.abs(v.speed) > 6) { g.ui.toast('Слишком быстро, чтобы выпрыгнуть'); return; }
    const sx = -v.fwdZ, sz = v.fwdX; // вправо
    const side = (v.kind === 'plane' ? 1.4 : v.wid / 2) + 0.8;
    const cands = [[-sx * side, -sz * side], [sx * side, sz * side], [-v.fwdX * (v.len / 2 + 1), -v.fwdZ * (v.len / 2 + 1)], [v.fwdX * (v.len / 2 + 1), v.fwdZ * (v.len / 2 + 1)]];
    if (v.kind === 'boat') {
      // ищем пирс или берег вокруг
      cands.length = 0;
      for (let a = 0; a < 16; a++) for (const r of [2, 3.5, 5]) cands.push([Math.cos(a / 16 * 6.28) * r, Math.sin(a / 16 * 6.28) * r]);
    }
    v.setSolid(false);
    let spot = null;
    for (const [ox, oz] of cands) {
      const x = v.pos.x + ox, z = v.pos.z + oz;
      if (v.kind === 'boat') {
        const gy = g.phys.groundAt(x, z, 1);
        if (!(gy >= 0.25 || x < COAST_X - 0.5)) continue;
        if (!g.phys.blocked(x, gy, z, 0.35, 1.7)) { spot = { x, z, y: gy }; break; }
        continue;
      }
      if (!g.phys.blocked(x, 0, z, 0.35, 1.7)) { spot = { x, z, y: g.phys.groundAt(x, z, 1) }; break; }
    }
    v.setSolid(true);
    if (!spot) {
      if (!force) { g.ui.toast(v.kind === 'boat' ? 'Причаль к пирсу или к берегу' : 'Нет места, чтобы выйти'); return; }
      spot = { x: v.pos.x, z: v.pos.z, y: Math.max(0, v.pos.y) };
    }
    v.driven = false;
    p.vehicle = null;
    p.pos.set(spot.x, spot.y, spot.z);
    p.vy = 0;
    p.model.root.visible = true;
    p.yaw = p.camYaw;
    audio.stopLoop('veh');
    if (v.kind === 'car' && v.engineOk()) audio.play('carStop', v.pos, { vol: 0.5, jitter: false });
    audio.play(v.kind === 'car' ? 'carDoorClose' : 'doorClose', v.pos, { vol: 0.6 });
    this.head.intensity = 0;
    v.updateBoxes();
  }

  update(dt) {
    const g = this.g, p = g.player;
    this.updateCrank(dt);
    for (const v of this.list) {
      const dist = Math.hypot(v.pos.x - p.pos.x, v.pos.z - p.pos.z);
      if (v.driven) v.drive(dt);
      if (v.trunk) { const b = v.len / 2 + 0.3; v.trunk.x = v.pos.x - v.fwdX * b; v.trunk.z = v.pos.z - v.fwdZ * b; }
      else if (dist < 200 || v.air) v.idle(dt);
      v.root.visible = dist < g.viewDist * 1.3 || v.driven;
      if (v.root.visible && v.kind === 'car') v.spinWheels(dt);
      if (v.kind === 'plane' && v.inner.userData.prop) v.inner.userData.prop.rotation.z += (v.driven ? 10 + v.throttle * 40 : 0) * dt;
      v.sync();
      if (v.driven || Math.abs(v.speed) > 0.01 || v.kind === 'boat') v.updateBoxes();
    }
    // фары машины, в которой сидим
    const v = p.vehicle;
    if (v && v.kind !== 'boat' && v.engineOk() && (g.isNight() || g.dusk())) {
      this.head.intensity = 60;
      this.head.position.set(v.pos.x + v.fwdX * v.len * 0.5, v.pos.y + 1.0, v.pos.z + v.fwdZ * v.len * 0.5);
      this.head.target.position.set(v.pos.x + v.fwdX * 20, v.pos.y - 1, v.pos.z + v.fwdZ * 20);
    } else this.head.intensity = 0;
    if (v) {
      p.pos.copy(v.pos);
      // камера плавно заходит за спину, если её не крутят
      if (Math.abs(Input.look.x) < 0.5 && Math.abs(Input.stickLook.x) < 0.1 && v.kind !== 'plane') {
        p.camIdle = (p.camIdle || 0) + dt;
        if (p.camIdle > 1.2 && Math.abs(v.speed) > 2) p.camYaw += angDiff(v.yaw + (v.speed < 0 ? 0 : 0), p.camYaw) * Math.min(1, dt * 2);
      } else p.camIdle = 0;
    }
  }

  toJSON() { return this.list.map(v => ({ x: +v.pos.x.toFixed(2), z: +v.pos.z.toFixed(2), yaw: +v.yaw.toFixed(3), fuel: +v.fuel.toFixed(3), hp: Math.round(v.hp), run: v.running ? 1 : 0, ign: v.ign })); }
  load(arr) {
    if (!arr) return;
    arr.forEach((s, i) => {
      const v = this.list[i];
      if (!v || !s) return;
      v.pos.x = s.x; v.pos.z = s.z; v.yaw = s.yaw; v.fuel = s.fuel; v.hp = s.hp;
      if (s.ign) v.ign = s.ign; if (s.run) v.running = true;
      if (v.hp <= 0) v.inner.traverse(o => { if (o.isMesh) o.material = this.burnt; });
      v.sync(); v.updateBoxes();
    });
  }
}
