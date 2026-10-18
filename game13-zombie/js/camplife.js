// Жизнь лагеря: у жителей (Михалыч, Вера, Гоша) и нескольких выживших свой распорядок.
// Они ходят между местами (костёр, верстак, ящики, ворота, лавка), садятся на стулья, роются в ящиках,
// болтают, караулят ворота. Ночью почти все у костра. Если игрок подходит к жителю, тот останавливается
// и поворачивается к нему (с ним можно поговорить, см. диалоги в ui.js).
import * as THREE from 'three';
import { cloneCharacter, Selection, Assets, relaxArms, handBone } from './assets.js';
import { weaponModel, poseHeld, WHOLD } from './weapons3d.js';
import { audio } from './audio.js';
import { heroScale } from './player.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const lerpA = (a, b, t) => a + ((((b - a + Math.PI) % 6.2832) + 6.2832) % 6.2832 - Math.PI) * t;

export class CampLife {
  constructor(game) {
    this.g = game;
    this.agents = [];
    this.spots = [];
  }

  // места в лагере (относительно центра): куда идти, что делать, куда смотреть
  build(plan, npcs) {
    const g = this.g, c = plan.camp, h = c.r;
    const P = (x, z) => ({ x: c.x + x, z: c.z + z });
    const fire = P(0, 2);
    const S = (kind, at, anim, face, o = {}) => this.spots.push(Object.assign({ kind, ...at, anim, face, busy: null }, o));
    // стулья у костра (из плана лагеря) — сидеть; вокруг огня — греться
    // занятия (клипы из общей библиотеки): сидят и болтают у огня, чинят на коленях, берут вещи, держат факел
    for (const [x, z] of [[-2.5, 3.5], [2.6, 3.8], [0, -0.8]]) S('fire', P(x, z), ['Sit_Talk', 'Sit_Idle', 'Sit_Idle'], fire, { sit: true });
    for (const [x, z] of [[-2.2, 0.4], [2.4, 0.9], [-1.4, 4.6], [1.2, 5]]) S('fire', P(x, z), ['Idle', 'Talk_Idle'], fire);
    S('work', P(4, -7), ['PickUp', 'Interact'], P(4, -8));
    S('work', P(5.2, -7.2), ['Fix'], P(5.2, -8.2));
    S('crates', P(8.6, -5), ['PickUp', 'Fix'], P(8.8, -6));
    S('crates', P(-6, -6), ['PickUp', 'Fix'], P(-6, -7.2));
    S('guard', P(-2, h - 2.5), ['Idle_Gun'], P(-2, h + 5), { night: 'Torch' });
    S('guard', P(2, h - 2.5), ['Idle'], P(2, h + 5), { night: 'Torch' });
    S('talk', P(6, 1.5), ['Talk_Idle'], P(7, 2.6));
    S('talk', P(7, 2.6), ['Talk_Idle', 'Idle'], P(6, 1.5));
    S('talk', P(-6, 2), ['Talk_Idle'], P(-7, 3));
    S('talk', P(-7, 3), ['Talk_Idle', 'Idle'], P(-6, 2));
    S('gen', P(-h + 4.2, -h + 3.2), ['Fix'], P(-h + 3, -h + 3));
    for (const [x, z] of [[-10, -7.5], [0, -9.5], [10, -7.5], [-9.5, 4], [9.5, 4]]) S('tent', P(x, z), ['Idle', 'Interact'], P(x * 1.2, z * 1.2));
    // у жителей с заданиями — своё место, где их легко найти, и своё дело
    const home = { chief: S2(P(-3, -3), ['Idle', 'Talk_Idle'], fire), medic: S2(P(8, 5), ['Interact', 'PickUp', 'Idle'], P(8.6, 4.4)), trader: S2(P(-8, 9), ['PickUp', 'Idle'], P(-6.2, 8)) };
    function S2(at, anim, face) { return { kind: 'home', ...at, anim, face, busy: null }; }

    for (const n of npcs) this.agents.push(this.agent(n.c, n, home[n.id]));
    // чем отбиваются, если мертвец пролез в лагерь: Михалыч — пистолет, выжившие — дробовик и холодное; Вера и Гоша прячутся
    const arms = ['shotgun', 'bat', 'axe', 'knife'];
    let ai = 0;
    for (const a of this.agents) a.weapon = a.n.id === 'chief' ? 'pistol' : a.n.id ? null : arms[ai++ % arms.length];
    // выжившие из витрины, без заданий: просто живут в лагере
    const pool = (Selection.survivors || []).filter(k => Assets.gltf[k]).slice(0, 4);
    pool.forEach((key, i) => {
      const ch = cloneCharacter(key, { hideRigid: true });
      ch.root.scale.setScalar(heroScale(key));
      const sp = this.spots[i * 3 % this.spots.length];
      ch.root.position.set(sp.x, 0, sp.z);
      g.scene.add(ch.root);
      this.agents.push(this.agent(ch, { x: sp.x, z: sp.z, ry: 0, extra: true }, null));
    });
  }

  agent(c, n, home) {
    return { c, n, home, spot: null, t: Math.random() * 4, yaw: n.ry || 0, anim: null, x: n.x, z: n.z, talkT: 0, fireT: 0, wmesh: null };
  }

  // ---------- оборона лагеря ----------
  // мертвецы и культисты в черте лагеря (с запасом за стеной)
  threats() {
    const cp = this.g.plan.camp, R = cp.r + 2;
    return this.g.zombies.list.filter(z => !z.dead && Math.abs(z.pos.x - cp.x) < R && Math.abs(z.pos.z - cp.z) < R);
  }
  arm(a, on) {
    if (on && !a.wmesh && a.weapon) {
      const m = weaponModel(a.weapon), hand = handBone(a.c.bones);
      if (!m || !hand) return;
      this.g.scene.add(m); a.wmesh = m; a.hand = hand;
    } else if (!on && a.wmesh) { a.wmesh.parent && a.wmesh.parent.remove(a.wmesh); a.wmesh = null; }
  }
  // один шаг боя жителя: стрелок держит 5–14 м и стреляет, с холодным — подбегает и бьёт; без оружия — к палаткам
  fight(a, threats, dt) {
    const g = this.g;
    if (!a.weapon) {
      const tent = this.spots.filter(s => s.kind === 'tent')[a.n.id === 'medic' ? 0 : 2];
      return this.moveTo(a, tent, dt, 2.6, 'Cower');
    }
    let t = null, bd = 1e9;
    for (const z of threats) { const d = Math.hypot(z.pos.x - a.x, z.pos.z - a.z); if (d < bd) { bd = d; t = z; } }
    if (!t) return;
    this.arm(a, true);
    const gun = a.weapon === 'pistol' || a.weapon === 'shotgun';
    const want = gun ? 9 : 1.2;
    a.fireT -= dt;
    // стреляет только если видит цель: стена между ними — идёт ближе (без стрельбы сквозь стены)
    let clear = true;
    if (gun) { const dx = t.pos.x - a.x, dz = t.pos.z - a.z, L = Math.hypot(dx, dz) || 1; const hit = g.phys.raycast(a.x, 1.4, a.z, dx / L, -0.15 / L, dz / L, L); clear = !hit || hit.t > L - 0.6; }
    if (bd > want + (gun ? 5 : 0.2) || !clear) return this.moveTo(a, t.pos, dt, gun ? 2.6 : 3.8, null, 'Run');
    a.yaw = lerpA(a.yaw, Math.atan2(t.pos.x - a.x, t.pos.z - a.z), Math.min(1, dt * 8));
    if (gun) {
      this.play(a, a.c.actions.Aim ? 'Aim' : 'Idle_Gun', 0.15);
      if (a.fireT <= 0) {
        a.fireT = (a.weapon === 'shotgun' ? 1.3 : 0.8) + Math.random() * 0.5;
        const from = { x: a.x + Math.sin(a.yaw) * 0.6, y: 1.4, z: a.z + Math.cos(a.yaw) * 0.6 };
        const to = { x: t.pos.x, y: t.pos.y + 1.2, z: t.pos.z };
        audio.play(a.weapon, from, { vol: 0.8, range: 50 });
        g.fx.flash(_v.set(from.x, from.y, from.z).clone());
        g.fx.tracer(_v.set(from.x, from.y, from.z).clone(), _v2.set(to.x, to.y, to.z).clone());
        if (Math.random() < (a.weapon === 'shotgun' ? 0.8 : 0.6)) {
          const dir = _v.set(to.x - from.x, 0, to.z - from.z).normalize().clone();
          g.zombies.hit(t, a.weapon === 'shotgun' ? 70 : 38, dir, a.weapon === 'shotgun' ? 2.5 : 0.8, Math.random() < 0.2, 'camp');
          g.fx.blood(_v2.set(to.x, to.y, to.z).clone(), dir);
        }
      }
    } else if (a.fireT <= 0) {
      a.fireT = 0.9 + Math.random() * 0.4;
      a.anim = null; this.play(a, 'Slash', 0.08);
      audio.play('swing', t.pos, { vol: 0.5 });
      setTimeout(() => {
        if (t.dead || Math.hypot(t.pos.x - a.x, t.pos.z - a.z) > 2) return;
        const dir = _v.set(t.pos.x - a.x, 0, t.pos.z - a.z).normalize().clone();
        g.zombies.hit(t, { bat: 45, axe: 70, knife: 35 }[a.weapon] || 30, dir, 2, false, 'camp');
        g.fx.blood(_v2.set(t.pos.x, 1.3, t.pos.z).clone(), dir);
        audio.play('hitHeavy', t.pos, { vol: 0.6 });
      }, 300);
    }
  }
  // идти к точке (или к позиции), на месте — анимация stay
  moveTo(a, to, dt, speed, stay, runAnim) {
    if (!to) return;
    const dx = to.x - a.x, dz = to.z - a.z, d = Math.hypot(dx, dz);
    if (d > 0.5) {
      a.yaw = lerpA(a.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
      const step = Math.min(d, speed * dt);
      const pos = { x: a.x + dx / d * step, y: 0, z: a.z + dz / d * step };
      this.g.phys.resolve(pos, 0.3, 1.7);
      a.x = pos.x; a.z = pos.z;
      this.play(a, runAnim || 'Run', 0.2);
    } else if (stay) this.play(a, a.c.actions[stay] ? stay : 'Idle', 0.2);
  }

  play(a, name, fade = 0.3) {
    const act = a.c.actions[name] || a.c.actions.Idle;
    if (!act || a.anim === act) return;
    if (a.anim) a.anim.fadeOut(fade);
    act.reset().setEffectiveWeight(1).fadeIn(fade).play();
    a.anim = act;
  }

  // следующее занятие: ночью — к костру, днём — что попадётся; у жителей с заданиями чаще своё место
  pick(a) {
    if (a.spot) a.spot.busy = null;
    const night = this.g.isNight();
    let cand;
    if (a.home && Math.random() < (night ? 0.3 : 0.55)) cand = [a.home];
    else {
      const w = night ? { fire: 6, tent: 1, guard: 1 } : { fire: 2, work: 2, crates: 2, guard: 1.2, talk: 2, gen: 0.6, tent: 1 };
      const free = this.spots.filter(s => !s.busy && w[s.kind]);
      let tot = free.reduce((s, x) => s + w[x.kind], 0), r = Math.random() * tot;
      cand = [free.find(s => (r -= w[s.kind]) <= 0) || free[0]];
    }
    a.spot = cand[0] || null;
    if (a.spot) a.spot.busy = a;
    a.t = 40 + Math.random() * 50; // подолгу на месте: так спокойнее, без суеты
    a.act = null;
  }

  update(dt) {
    const g = this.g, p = g.player.pos;
    // тревога: в лагере мертвец или культист — жители отбиваются, распорядок ждёт
    const th = this.threats();
    if (th.length && !this.alarm) { this.alarm = true; g.ui.toast('Тревога! В лагере мертвец'); }
    if (!th.length && this.alarm) { this.alarm = false; for (const a of this.agents) { this.arm(a, false); if (a.spot) a.spot.busy = null; a.spot = null; } }
    for (const a of this.agents) {
      const dP = Math.hypot(p.x - a.x, p.z - a.z);
      if (this.alarm) this.fight(a, th, dt);
      // игрок рядом — житель отвлекается на него
      // сидящий на стуле не встаёт: продолжает сидеть, а пока говорит, болтает сидя
      else if (!a.n.extra && dP < 3.2 && !g.player.vehicle && a.act && a.act.startsWith('Sit') && a.spot && a.spot.sit && Math.hypot(a.spot.x - a.x, a.spot.z - a.z) < 0.5) {
        this.play(a, a.talkT > 0 && a.c.actions.Sit_Talk ? 'Sit_Talk' : a.act);
        a.talkT -= dt;
      }
      else if (!a.n.extra && dP < 3.2 && !g.player.vehicle) {
        a.yaw = lerpA(a.yaw, Math.atan2(p.x - a.x, p.z - a.z), Math.min(1, dt * 5));
        this.play(a, a.talkT > 0 ? (a.c.actions.Talk_Idle ? 'Talk_Idle' : 'Talk') : 'Idle');
        a.talkT -= dt;
      } else {
        if (!a.spot || a.t <= 0) this.pick(a);
        const s = a.spot;
        if (s) {
          const dx = s.x - a.x, dz = s.z - a.z, d = Math.hypot(dx, dz);
          if (d > 0.35) {
            a.yaw = lerpA(a.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
            const step = Math.min(d, 1.0 * dt);
            const pos = { x: a.x + dx / d * step, y: 0, z: a.z + dz / d * step };
            g.phys.resolve(pos, 0.3, 1.7);
            a.x = pos.x; a.z = pos.z;
            this.play(a, a.c.actions.Walk_Calm ? 'Walk_Calm' : 'Walk');
          } else {
            a.yaw = lerpA(a.yaw, Math.atan2(s.face.x - a.x, s.face.z - a.z), Math.min(1, dt * 4));
            // занятие на месте: выбираем один раз по прибытии (ночью у ворот — факел)
            if (!a.act) { const l = g.isNight() && s.night ? [s.night] : Array.isArray(s.anim) ? s.anim : [s.anim]; a.act = l[Math.floor(Math.random() * l.length)]; if (!a.c.actions[a.act]) a.act = 'Idle'; }
            this.play(a, a.act);
            a.t -= dt;
          }
        }
      }
      // не толкаться с игроком
      if (dP < 0.7 && dP > 1e-3) { a.x -= (p.x - a.x) / dP * (0.7 - dP); a.z -= (p.z - a.z) / dP * (0.7 - dP); }
      a.n.x = a.x; a.n.z = a.z;
      a.c.root.position.set(a.x, 0, a.z);
      a.c.root.rotation.y = a.yaw;
      // анимация: ближние каждый кадр, дальние — через кадр, совсем дальние не считаем
      a.acc = (a.acc || 0) + dt;
      if (dP < 45 && (dP < 20 || (this.g.frame & 1))) { a.c.mixer.update(a.acc); a.acc = 0; if (dP < 25) relaxArms(a.c, 0.3); }
      // сидя: поднять или опустить так, чтобы таз был на высоте сиденья (клип сделан под другой стул)
      const sitting = a.act && a.act.startsWith('Sit') && a.spot && a.spot.sit && Math.hypot(a.spot.x - a.x, a.spot.z - a.z) < 0.5;
      if (sitting && dP < 70) {
        if (!a.hips) a.hips = Object.values(a.c.bones).find(b => /Hips$/.test(b.name));
        a.c.root.updateMatrixWorld(true);
        const rel = a.hips.getWorldPosition(_v).y - a.c.root.position.y;
        a.c.root.position.y = 0.58 - rel;
      } else a.c.root.position.y = 0;
      if (a.wmesh) { a.c.root.updateMatrixWorld(true); poseHeld(a.wmesh, a.hand, Math.sin(a.yaw), Math.cos(a.yaw), (WHOLD[a.weapon] || {}).fingK ?? 0.1); }
    }
  }

  // житель начинает говорить (для диалогов)
  talk(npc, sec = 3) { const a = this.agents.find(a => a.n === npc); if (a) a.talkT = sec; }
}
