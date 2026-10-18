// Эффекты: частицы (кровь, пыль, искры, огонь, дым), трассеры, вспышка выстрела,
// брошенные гранаты и бутылки с зажигательной смесью, зоны огня, дальние столбы дыма.
// Тёплый цвет (огонь, трассер, вспышка) — акцент по арт-дирекции: его дают только живые.
import * as THREE from 'three';
import { makeMesh, fitScale, styleMaterial } from './assets.js';
import { audio } from './audio.js';

const MAXP = 1400;
// ячейки атласа assets/fx/particles.png (Kenney Particle Pack, CC0; собирает tools/fx_atlas.html)
export const CELL = { smoke: [0, 1, 2, 3], muzzle: [4, 5, 6], crack: [7, 8], splat: [9, 10, 11], star: 12, soft: 13, flame: 14, ring: 15 };
const pick = a => Array.isArray(a) ? a[Math.floor(Math.random() * a.length)] : a;

// система точечных спрайтов: атлас 4×4, поворот, прозрачность, цвет; обычное или светящееся смешивание
function makeSys(scene, tex, additive) {
  const geo = new THREE.BufferGeometry();
  const S = { pp: new Float32Array(MAXP * 3), pc: new Float32Array(MAXP * 4), ps: new Float32Array(MAXP), pr: new Float32Array(MAXP * 2) };
  geo.setAttribute('position', new THREE.BufferAttribute(S.pp, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('pcol', new THREE.BufferAttribute(S.pc, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(S.ps, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('cr', new THREE.BufferAttribute(S.pr, 2).setUsage(THREE.DynamicDrawUsage));
  S.mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 }, map: { value: tex }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
    vertexShader: `uniform float uScale;attribute float size;attribute vec4 pcol;attribute vec2 cr;varying vec4 vC;varying vec2 vCR;varying float vFog;uniform float fogDensity;
      void main(){vC=pcol;vCR=cr;vec4 mv=modelViewMatrix*vec4(position,1.);float d=-mv.z;gl_PointSize=min(size*uScale/max(.3,d),320.);
        vFog=1.-exp(-fogDensity*fogDensity*d*d);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `uniform sampler2D map;uniform vec3 fogColor;varying vec4 vC;varying vec2 vCR;varying float vFog;
      void main(){vec2 p=gl_PointCoord-.5;float c=cos(vCR.y),s=sin(vCR.y);p=vec2(c*p.x-s*p.y,s*p.x+c*p.y)+.5;
        if(p.x<0.||p.y<0.||p.x>1.||p.y>1.)discard;
        vec2 uv=(vec2(mod(vCR.x,4.),floor(vCR.x/4.))+p)/4.;vec4 t=texture2D(map,uv);
        float a=t.a*vC.a;if(a<.01)discard;
        vec3 col=t.rgb*vC.rgb;` + (additive ? 'col*=1.-vFog;gl_FragColor=vec4(col*a,a);' : 'col=mix(col,fogColor,vFog);gl_FragColor=vec4(col,a);') + `}`,
    transparent: true, depthWrite: false, fog: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  if (additive) S.mat.blending = THREE.CustomBlending, S.mat.blendSrc = THREE.OneFactor, S.mat.blendDst = THREE.OneFactor;
  S.points = new THREE.Points(geo, S.mat);
  S.points.frustumCulled = false;
  S.points.renderOrder = additive ? 3 : 2;
  scene.add(S.points);
  return S;
}

export class FX {
  constructor(game) {
    this.g = game;
    const tex = new THREE.TextureLoader().load('assets/fx/particles.png');
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true;
    this.sysN = makeSys(game.scene, tex, false);
    this.sysA = makeSys(game.scene, tex, true);
    this.parts = []; // {x,y,z,vx,vy,vz,life,max,r,g,b,a,size,grav,grow,cell,rot,vr,add,drag}
    this.n = 0;

    // трассеры: пул отрезков
    const tg = new THREE.BufferGeometry();
    this.tp = new Float32Array(64 * 6);
    tg.setAttribute('position', new THREE.BufferAttribute(this.tp, 3).setUsage(THREE.DynamicDrawUsage));
    this.tracers = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.75 }));
    this.tracers.frustumCulled = false;
    game.scene.add(this.tracers);
    this.tlist = [];

    // свет: число источников постоянно (иначе пересборка шейдеров)
    this.muzzle = new THREE.PointLight(0xffb060, 0, 9, 2);
    game.scene.add(this.muzzle);
    this.fireLight = new THREE.PointLight(0xff8a3a, 0, 22, 1.6);
    game.scene.add(this.fireLight);
    this.boomLight = new THREE.PointLight(0xffa050, 0, 40, 1.5);
    game.scene.add(this.boomLight);
    this.muzzleT = 0; this.boomT = 0;

    // туман клочьями у земли и вспышка у дула — спрайты с мягкой текстурой
    const soft = (inner, outer, a) => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, inner); gr.addColorStop(a, outer); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
    this.mistMat = new THREE.SpriteMaterial({ map: soft('rgba(255,255,255,0.9)', 'rgba(255,255,255,0.35)', 0.45), transparent: true, depthWrite: false, opacity: 0.14, fog: true });
    this.mist = [];
    for (let i = 0; i < 34; i++) { const s = new THREE.Sprite(this.mistMat); s.scale.set(9, 3.2, 1); s.visible = false; game.scene.add(s); this.mist.push(s); }
    this.flashSpr = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft('rgba(255,240,200,1)', 'rgba(255,150,50,0.6)', 0.35), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.flashSpr.visible = false; game.scene.add(this.flashSpr);
    this.ashT = 0;

    this.proj = [];     // брошенные предметы
    this.fires = [];    // зоны огня {x,z,r,t,dmg}
    this.decals = [];
    this.smokeCols = [];
    this.emitT = 0;
  }

  // простая частица (мягкое пятно): старый интерфейс
  spawn(x, y, z, vx, vy, vz, life, r, g, b, size, grav = 9, grow = 0) {
    return this.emit({ x, y, z, vx, vy, vz, life, r, g, b, size: size * 1.6, grav, grow, cell: CELL.soft });
  }
  // частица атласа: cell (номер или список), a — прозрачность, add — светится, rot/vr — поворот, drag — торможение
  emit(o) {
    if (this.parts.length >= MAXP * 2 - 2) this.parts.shift();
    const p = { vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, a: 1, grav: 0, grow: 0, rot: Math.random() * 6.28, vr: 0, drag: 0, add: false, fadeIn: 0, ...o };
    p.cell = pick(o.cell ?? CELL.soft);
    p.max = p.life;
    this.parts.push(p);
    return p;
  }
  // дым: серый клуб, растёт и тает
  smoke(x, y, z, size, life, a = 0.5, col = 0.42) {
    this.emit({ x, y, z, vx: (Math.random() - 0.5) * 0.4, vy: 0.5 + Math.random() * 0.4, vz: (Math.random() - 0.5) * 0.4, life, size, grow: size * 1.2, cell: CELL.smoke, a, r: col, g: col, b: col * 1.03, vr: (Math.random() - 0.5) * 0.8, drag: 0.8, fadeIn: 0.15 });
  }

  // кровь: брызги-кляксы из атласа, капли и красная взвесь
  blood(p, dir) {
    const R = () => Math.random() - 0.5;
    const dx = dir ? dir.x : 0, dz = dir ? dir.z : 0;
    for (let i = 0; i < 2; i++) this.emit({ x: p.x, y: p.y, z: p.z, vx: dx * 1.2 + R(), vy: 0.6, vz: dz * 1.2 + R(), life: 0.28 + Math.random() * 0.1, size: 0.55 + Math.random() * 0.35, grow: 1.6, cell: CELL.splat, r: 0.42, g: 0.03, b: 0.02, a: 0.95, grav: 3 });
    for (let i = 0; i < 10; i++) this.emit({ x: p.x, y: p.y, z: p.z, vx: dx * 2.5 + R() * 3.4, vy: Math.random() * 2.6, vz: dz * 2.5 + R() * 3.4, life: 0.5 + Math.random() * 0.4, size: 0.05 + Math.random() * 0.06, cell: CELL.splat, r: 0.3, g: 0.02, b: 0.02, grav: 9 });
    this.emit({ x: p.x, y: p.y, z: p.z, vx: dx * 0.6, vy: 0.2, vz: dz * 0.6, life: 0.6, size: 0.4, grow: 0.9, cell: CELL.smoke, r: 0.38, g: 0.05, b: 0.05, a: 0.45, drag: 1.5 });
    if (Math.random() < 0.4) this.decal(p.x, p.z);
  }

  // лужа крови на земле: клякса из атласа, тёмно-красная, лежит плашмя
  decal(x, z, scorch = false) {
    if (!this.decalGeo) {
      this.decalGeo = [9, 10, 11, 12].map(c => { const g = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, ((c % 4) + uv.getX(i)) / 4, (Math.floor(c / 4) + 1 - uv.getY(i)) / 4); return g; });
      const mk = col => styleMaterial(new THREE.MeshLambertMaterial({ map: this.sysN.mat.uniforms.map.value, color: col, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      this.decalMat = mk(0x6a0c08); this.scorchMat = mk(0x1a1816);
    }
    const m = new THREE.Mesh(this.decalGeo[scorch ? 3 : Math.floor(Math.random() * 3)], scorch ? this.scorchMat : this.decalMat);
    m.scale.setScalar(scorch ? 4 : 0.9 + Math.random() * 1.1);
    m.position.set(x, 0.03 + this.decals.length * 0.0004, z);
    m.rotation.y = Math.random() * 6.28;
    m.receiveShadow = true;
    this.g.scene.add(m);
    this.decals.push(m);
    if (this.decals.length > 40) this.g.scene.remove(this.decals.shift());
  }

  // попадание в стену: облачко пыли, щепки или крошка, искры по металлу
  impact(p, box) {
    const wood = box && box.tag === 'furn', metal = box && box.tag === 'car';
    const c = wood ? [0.45, 0.36, 0.26] : [0.55, 0.53, 0.5];
    for (let i = 0; i < 6; i++) this.emit({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2.5, vz: (Math.random() - 0.5) * 3, life: 0.45, size: 0.04 + Math.random() * 0.04, cell: CELL.splat, r: c[0] * 0.8, g: c[1] * 0.8, b: c[2] * 0.8, grav: 9 });
    this.emit({ x: p.x, y: p.y, z: p.z, vy: 0.3, life: 0.7, size: 0.3, grow: 0.9, cell: CELL.smoke, r: c[0], g: c[1], b: c[2], a: 0.55, drag: 1.2 });
    if (metal || Math.random() < 0.5) for (let i = 0; i < (metal ? 6 : 2); i++) this.emit({ x: p.x, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 5, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 5, life: 0.25, size: 0.05, cell: CELL.soft, r: 1, g: 0.75, b: 0.35, add: true, grav: 9 });
    if (Math.random() < 0.3) audio.play('ric', p, { vol: 0.35, range: 25 });
  }

  tracer(a, b) {
    this.tlist.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, t: 0.05 });
    if (this.tlist.length > 64) this.tlist.shift();
  }

  flash(p) {
    this.muzzle.position.copy(p);
    this.muzzle.intensity = 18;
    this.muzzleT = 0.05;
    // вспышка: звезда и язык пламени из атласа (светятся), потом дымок из ствола
    this.emit({ x: p.x, y: p.y, z: p.z, life: 0.05, size: 0.42 + Math.random() * 0.2, cell: CELL.star, r: 1, g: 0.85, b: 0.55, add: true });
    this.emit({ x: p.x, y: p.y, z: p.z, life: 0.05, size: 0.3, cell: CELL.soft, r: 1, g: 0.7, b: 0.35, add: true, a: 0.8 });
    for (let i = 0; i < 2; i++) this.smoke(p.x, p.y, p.z, 0.12 + Math.random() * 0.08, 0.9 + Math.random() * 0.5, 0.28);
  }

  // гильза вылетает вправо-вверх, у дробовика — красная
  shell(p, yaw, w) {
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const sg = w && w.ammo === '12ga';
    this.spawn(p.x, p.y, p.z, rx * (1.6 + Math.random()) , 2 + Math.random(), rz * (1.6 + Math.random()), 0.9, sg ? 0.6 : 0.78, sg ? 0.12 : 0.6, sg ? 0.1 : 0.26, 0.035, 12);
    // дымок из ствола
  }

  // ---------- брошенные предметы ----------
  throwable(w, p, v) {
    const mesh = makeMesh('w_' + (w.model || 'grenade'));
    mesh.scale.setScalar(fitScale('w_' + (w.model || 'grenade'), w.fire ? 0.28 : 0.14));
    mesh.position.copy(p);
    this.g.scene.add(mesh);
    this.proj.push({ w, mesh, p: p.clone(), v: v.clone(), t: w.fuse || 99, spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, 0) });
  }

  explode(p, w) {
    const g = this.g;
    audio.play('explosion', p, { vol: 1, range: 80 });
    g.zombies.explode(p, w.radius, w.dmg, 'explosion');
    g.zombies.hearNoise(p, w.noise);
    const pl = g.player;
    const pd = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
    if (pd < w.radius && !pl.vehicle) pl.damage(w.dmg * 0.5 * (1 - pd / w.radius), 'explosion', p);
    if (pd < 30) g.camCtl.shake = Math.max(g.camCtl.shake, 1.2 * (1 - pd / 30));
    for (const v of g.vehicles.list) { const d = v.pos.distanceTo(p); if (d < w.radius) v.damage(140 * (1 - d / w.radius), 'explosion'); }
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * 6.28, s = 2 + Math.random() * 8;
      this.emit({ x: p.x, y: p.y + 0.3, z: p.z, vx: Math.cos(a) * s, vy: 2 + Math.random() * 6, vz: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, size: 0.5 + Math.random() * 0.6, grow: 1.5, cell: i % 3 ? CELL.flame : CELL.smoke, r: 1, g: 0.55 + Math.random() * 0.3, b: 0.2, add: true, grav: 3, drag: 2, vr: (Math.random() - 0.5) * 3 });
    }
    for (let i = 0; i < 14; i++) this.smoke(p.x + (Math.random() - 0.5) * 3, p.y + 0.5 + Math.random(), p.z + (Math.random() - 0.5) * 3, 1.4 + Math.random(), 2.5 + Math.random() * 2, 0.7, 0.18);
    this.emit({ x: p.x, y: p.y + 0.6, z: p.z, life: 0.12, size: 6, cell: CELL.star, r: 1, g: 0.8, b: 0.5, add: true });
    this.boomLight.position.set(p.x, p.y + 2, p.z);
    this.boomLight.intensity = 120; this.boomT = 0.35;
    this.decal(p.x, p.z, true);
  }

  ignite(p, w) {
    const g = this.g;
    audio.play('glass', p, { vol: 0.9, range: 30 });
    g.zombies.hearNoise(p, w.noise);
    this.fires.push({ x: p.x, z: p.z, y: Math.max(0, p.y - 0.3), r: w.radius, t: w.fire, dmg: w.dmg, big: false });
  }

  // ---------- кадр ----------
  update(dt) {
    const g = this.g;
    // снаряды
    for (const pr of this.proj.slice()) {
      pr.v.y -= 16 * dt;
      const np = pr.p.clone().addScaledVector(pr.v, dt);
      const d = pr.v.length() * dt;
      const dir = pr.v.clone().normalize();
      const hit = d > 1e-4 ? g.phys.raycast(pr.p.x, pr.p.y, pr.p.z, dir.x, dir.y, dir.z, d + 0.1) : null;
      if (hit) {
        if (pr.w.fire) { this.ignite(pr.p, pr.w); this.dropProj(pr); continue; }
        // отскок
        const hp = pr.p.clone().addScaledVector(dir, Math.max(0, hit.t - 0.05));
        if (hit.box.tag === 'ground' || pr.p.y >= hit.box.maxY - 0.05) pr.v.y = -pr.v.y * 0.35;
        else { pr.v.x = -pr.v.x * 0.4; pr.v.z = -pr.v.z * 0.4; }
        pr.v.multiplyScalar(0.6);
        pr.p.copy(hp);
        if (pr.v.length() > 2) audio.play('hit', pr.p, { vol: 0.3, range: 15 });
      } else pr.p.copy(np);
      if (pr.p.y < 0.07) { pr.p.y = 0.07; if (pr.w.fire) { this.ignite(pr.p, pr.w); this.dropProj(pr); continue; } pr.v.y = Math.abs(pr.v.y) * 0.3; pr.v.x *= 0.7; pr.v.z *= 0.7; }
      pr.mesh.position.copy(pr.p);
      pr.mesh.rotation.x += pr.spin.x * dt; pr.mesh.rotation.y += pr.spin.y * dt;
      pr.t -= dt;
      if (pr.t <= 0) { this.explode(pr.p, pr.w); this.dropProj(pr); }
    }
    // огонь: зоны и костры
    this.emitT += dt;
    const emit = this.emitT > 0.05; if (emit) this.emitT = 0;
    let nearFire = null, nd = 1e9;
    const pp = g.player.pos;
    const allFires = this.fires.concat(g.world.fires);
    for (const f of allFires) {
      const d = Math.hypot(f.x - pp.x, f.z - pp.z);
      if (d < nd) { nd = d; nearFire = f; }
      if (d > g.viewDist) continue;
      if (emit) {
        const n = f.big ? 2 : Math.ceil(f.r);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.28, rr = Math.random() * (f.big ? 0.4 : f.r * 0.8);
          this.emit({ x: f.x + Math.cos(a) * rr, y: f.y + 0.15, z: f.z + Math.sin(a) * rr, vx: (Math.random() - 0.5) * 0.3, vy: 0.9 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 0.3, life: 0.5 + Math.random() * 0.4, size: (f.big ? 0.7 : 0.9) + Math.random() * 0.4, grow: -0.6, cell: CELL.flame, r: 1, g: 0.5 + Math.random() * 0.3, b: 0.15, add: true, rot: (Math.random() - 0.5) * 0.4, fadeIn: 0.08 });
        }
        if (Math.random() < 0.25) this.smoke(f.x, f.y + 1.3, f.z, 0.8, 3, 0.35, 0.2);
      }
    }
    for (const f of this.fires.slice()) {
      f.t -= dt;
      if (f.t <= 0) { this.fires.splice(this.fires.indexOf(f), 1); continue; }
      f.tick = (f.tick || 0) - dt;
      if (f.tick <= 0) {
        f.tick = 0.5;
        g.zombies.explode({ x: f.x, z: f.z }, f.r, f.dmg * 0.5, 'explosion', true);
        const d = Math.hypot(pp.x - f.x, pp.z - f.z);
        if (d < f.r * 0.8 && !g.player.vehicle) g.player.damage(6, 'fire');
      }
    }
    // свет ближайшего огня мерцает
    if (nearFire && nd < 40) {
      this.fireLight.position.set(nearFire.x, (nearFire.y || 0) + 1.2, nearFire.z);
      this.fireLight.intensity = (nearFire.big ? 14 : 10) * (0.85 + Math.random() * 0.3) * (g.isNight() ? 1.6 : 0.7);
    } else this.fireLight.intensity = 0;
    if (this.muzzleT > 0) { this.muzzleT -= dt; if (this.muzzleT <= 0) this.muzzle.intensity = 0; }
    this.ambientFx(dt);
    if (this.boomT > 0) { this.boomT -= dt; this.boomLight.intensity = Math.max(0, this.boomT / 0.35) * 120; }

    // дальние столбы дыма — «движение покоя»
    for (const s of this.smokeCols) {
      s.t -= dt;
      if (s.t <= 0) {
        s.t = 0.12;
        this.emit({ x: s.x + (Math.random() - 0.5) * 3, y: 2 + Math.random() * 3, z: s.z + (Math.random() - 0.5) * 3, vx: 0.6 + Math.random() * 0.4, vy: 2.2 + Math.random(), vz: (Math.random() - 0.5) * 0.4, life: 14, size: 4 + Math.random() * 3, grow: 1.2, cell: CELL.smoke, r: 0.17, g: 0.17, b: 0.18, a: 0.75, vr: (Math.random() - 0.5) * 0.2, fadeIn: 1 });
      }
    }

    // частицы
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.vy -= p.grav * dt;
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vz *= k; if (p.grav <= 0) p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02 && p.grav > 0) { p.y = 0.02; p.vx *= 0.5; p.vz *= 0.5; p.vy = 0; }
      p.size += p.grow * dt;
      p.rot += p.vr * dt;
    }
    const sc = g.renderer.rh / (2 * Math.tan(THREE.MathUtils.degToRad(g.camera.fov / 2)));
    const fogD = g.scene.fog ? g.scene.fog.density : 0;
    for (const S of [this.sysN, this.sysA]) {
      const add = S === this.sysA;
      let n = 0;
      for (const p of P) {
        if (p.add !== add) continue;
        if (n >= MAXP) break;
        const age = p.max - p.life;
        const fade = Math.min(1, p.life / p.max * 2.5) * (p.fadeIn ? Math.min(1, age / p.fadeIn) : 1);
        S.pp[n * 3] = p.x; S.pp[n * 3 + 1] = p.y; S.pp[n * 3 + 2] = p.z;
        S.pc[n * 4] = p.r; S.pc[n * 4 + 1] = p.g; S.pc[n * 4 + 2] = p.b; S.pc[n * 4 + 3] = p.a * fade;
        S.ps[n] = p.size * (p.grow ? 1 : Math.min(1, p.life / p.max * 2.5 + 0.3));
        S.pr[n * 2] = p.cell; S.pr[n * 2 + 1] = p.rot;
        n++;
      }
      const geo = S.points.geometry;
      geo.setDrawRange(0, n);
      for (const k of ['position', 'pcol', 'size', 'cr']) geo.attributes[k].needsUpdate = true;
      S.mat.uniforms.uScale.value = sc;
      S.mat.uniforms.fogDensity.value = fogD;
      if (g.scene.fog) S.mat.uniforms.fogColor.value.copy(g.scene.fog.color);
    }

    // трассеры
    let m = 0;
    for (let i = this.tlist.length - 1; i >= 0; i--) {
      const t = this.tlist[i];
      t.t -= dt;
      if (t.t <= 0) { this.tlist.splice(i, 1); continue; }
    }
    for (const t of this.tlist) {
      this.tp.set([t.ax, t.ay, t.az, t.bx, t.by, t.bz], m * 6); m++;
    }
    const tg = this.tracers.geometry;
    tg.setDrawRange(0, m * 2);
    tg.attributes.position.needsUpdate = true;
  }

  // туман у земли (гуще в сумерках и ночью) и пепел, который медленно падает вокруг камеры
  ambientFx(dt) {
    const g = this.g, c = g.camera.position;
    const dense = 1 - (g.dayK ?? 1) * 0.55;
    this.mistMat.opacity = 0.1 * dense + 0.04;
    if (g.scene.fog) this.mistMat.color.copy(g.scene.fog.color).lerp(new THREE.Color(1, 1, 1), 0.35);
    for (const s of this.mist) {
      const dx = s.position.x - c.x, dz = s.position.z - c.z;
      if (!s.visible || dx * dx + dz * dz > 42 * 42) {
        const a = Math.random() * 6.28, r = (s.visible ? 30 : 6) + Math.random() * 10;
        s.position.set(c.x + Math.cos(a) * r, 0.5 + Math.random() * 1.2, c.z + Math.sin(a) * r);
        s.material.rotation = 0; s.visible = true;
        s.userData.v = 0.3 + Math.random() * 0.4;
      }
      s.position.x += s.userData.v * dt; s.position.z += s.userData.v * 0.4 * dt;
    }
    this.ashT -= dt;
    if (this.ashT <= 0) {
      this.ashT = 0.06;
      const x = c.x + (Math.random() - 0.5) * 30, z = c.z + (Math.random() - 0.5) * 30;
      const l = 0.5 + Math.random() * 0.2;
      this.spawn(x, c.y + 4 + Math.random() * 4, z, 0.3 + Math.random() * 0.3, -0.5 - Math.random() * 0.3, 0.1, 9, l, l, l * 1.02, 0.025 + Math.random() * 0.02, 0.01);
    }
  }

  dropProj(pr) {
    this.g.scene.remove(pr.mesh);
    this.proj.splice(this.proj.indexOf(pr), 1);
  }
}
