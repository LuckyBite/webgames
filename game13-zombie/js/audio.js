// Звук: файлы из assets/sfx, WebAudio, 3D-панорама вокруг слушателя.
// ?silent=1 — AudioContext не создаётся вообще, файлы не грузятся (правило проекта для проверок).
export const SILENT = /[?&](silent|mute)=1/.test(location.search);

const FILES = {
  pistol: ['pistol', 'pistol2'], revolver: ['revolver'], smg: ['smg'], rifle: ['rifle'], shotgun: ['shotgun'], sniper: ['sniper'],
  far: ['rifle_far'], reload_pistol: ['reload_pistol'], reload_rifle: ['reload_rifle'], pump: ['shotgun_pump'], empty: ['empty'],
  swing: ['swing'], swingHeavy: ['swing'], slash: ['slash'], chop: ['chop'], hit: ['hit'], hitHeavy: ['hit_heavy'], ric: ['ric1', 'ric2'],
  glass: ['glass'], crash: ['crash'], wood: ['wood'], explosion: ['explosion', 'explosion_low'], door: ['door_open'], doorClose: ['door_close'],
  pickup: ['pickup'], bag: ['bag'], latch: ['latch'], creak: ['creak'], click: ['ui_click'], ok: ['ui_ok'], err: ['ui_err'], quest: ['quest'],
  step: ['step0', 'step1', 'step2', 'step3', 'step4'], stepGrass: ['stepg0', 'stepg1', 'stepg2'],
  zIdle: ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8'], zAlert: ['z9', 'z10', 'z11', 'z12', 'z13', 'z14'], zAttack: ['z15', 'z16', 'z17', 'z18', 'z19'],
  zDie: ['z20', 'z21', 'z22', 'z23', 'z24'],
  engineCar: ['car_engine'], engineTruck: ['car_engine2'], engineBoat: ['engine_boat'], enginePlane: ['engine_plane'],
  carStart: ['car_start'], carStop: ['car_stop'], carDoor: ['car_door_open'], carDoorClose: ['car_door_close'], horn: ['car_horn'], trunk: ['car_trunk'],
};
const LOOP_EXT = { engine_car: 'wav', engine_car2: 'wav', engine_boat: 'wav', engine_plane: 'wav', car_engine: 'ogg', car_engine2: 'ogg', car_start: 'ogg', car_stop: 'ogg',
  car_door_open: 'ogg', car_door_close: 'ogg', car_horn: 'ogg', car_trunk: 'ogg' };

class Audio {
  constructor() {
    this.ctx = null;
    this.buf = {};
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.vol = 0.8;
    this.muted = false;
    this.loops = new Map();
    this.ready = false;
  }
  // вызывается по первому жесту пользователя
  unlock() {
    if (SILENT) return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.vol;
      // мягкий компрессор, чтобы залпы не клиповали
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.master.connect(this.comp).connect(this.ctx.destination);
      this.load();
      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) this.ctx.suspend(); else this.ctx.resume();
      });
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  async load() {
    const names = new Set(Object.values(FILES).flat());
    await Promise.all([...names].map(async n => {
      try {
        const r = await fetch('assets/sfx/' + n + '.' + (LOOP_EXT[n] || 'mp3'));
        const ab = await r.arrayBuffer();
        this.buf[n] = await this.ctx.decodeAudioData(ab);
      } catch (e) { /* без звука, но игра идёт */ }
    }));
    this.ready = true;
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.vol; }

  // случайный файл группы; pool — допустимые номера (голос конкретного зомби), один и тот же подряд не берём
  _pick(key, pool) {
    const l = FILES[key];
    if (!l) return null;
    const idx = pool && pool.length ? pool.filter(i => i < l.length) : l.map((_, i) => i);
    let i = idx[Math.floor(Math.random() * idx.length)];
    this._last = this._last || {};
    if (idx.length > 1 && i === this._last[key]) i = idx[(idx.indexOf(i) + 1) % idx.length];
    this._last[key] = i;
    return this.buf[l[i]];
  }
  count(key) { return (FILES[key] || []).length; }
  // pos: {x,y,z} или null (2D). opt: vol, rate, range (м)
  play(key, pos, opt = {}) {
    if (!this.ctx || !this.ready) return null;
    const b = this._pick(key, opt.pool);
    if (!b) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    if (opt.lowpass) { const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = opt.lowpass; src.connect(lp); src._out = lp; }
    src.playbackRate.value = (opt.rate || 1) * (opt.jitter === false ? 1 : 0.94 + Math.random() * 0.12);
    const g = this.ctx.createGain();
    let v = opt.vol ?? 1;
    let out = g;
    if (pos) {
      const range = opt.range || 40;
      const dx = pos.x - this.listener.x, dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      if (d > range * 2.5) return null;
      v *= 1 / (1 + (d / range) * (d / range) * 3);
      const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
      if (pan) {
        // угол относительно взгляда слушателя
        const a = Math.atan2(dx, -dz) - this.listener.yaw;
        pan.pan.value = Math.max(-1, Math.min(1, Math.sin(a) * Math.min(1, d / 4)));
        g.connect(pan); out = pan;
      }
      // дальние выстрелы глуше
      if (d > 30) {
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = Math.max(700, 9000 - d * 40);
        out.connect(lp); out = lp;
      }
    }
    g.gain.value = v;
    (src._out || src).connect(g);
    out.connect(this.master);
    src.start();
    // cut — оставить только начало файла (в записях автомата и ПП несколько выстрелов подряд)
    if (opt.cut) { const t = this.ctx.currentTime; g.gain.setValueAtTime(v, t + opt.cut); g.gain.linearRampToValueAtTime(0, t + opt.cut + 0.07); src.stop(t + opt.cut + 0.08); }
    src.dur = b.duration / src.playbackRate.value;
    return src;
  }
  // постоянный звук (мотор): id → {src, gain}; обновлять set(id, vol, rate)
  loop(id, key) {
    if (!this.ctx || !this.ready || this.loops.has(id)) return;
    const b = this._pick(key);
    if (!b) return;
    const src = this.ctx.createBufferSource();
    src.buffer = b; src.loop = true;
    const g = this.ctx.createGain(); g.gain.value = 0;
    src.connect(g).connect(this.master);
    src.start();
    this.loops.set(id, { src, g });
  }
  setLoop(id, vol, rate) {
    const l = this.loops.get(id);
    if (!l) return;
    l.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.05);
    l.src.playbackRate.setTargetAtTime(rate, this.ctx.currentTime, 0.08);
  }
  // простой гудок (клаксон) без файла
  beep(freq, dur) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.setValueAtTime(0.25, t + dur - 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const f of [freq, freq * 1.26]) { const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + dur); }
    g.connect(this.master);
  }
  stopLoop(id) {
    const l = this.loops.get(id);
    if (!l) return;
    l.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    setTimeout(() => { try { l.src.stop(); } catch (e) {} }, 300);
    this.loops.delete(id);
  }
}

class SilentAudio {
  constructor() { this.listener = { x: 0, y: 0, z: 0, yaw: 0 }; this.ready = false; }
  unlock() {} load() {} setVolume() {} setMuted() {} play() { return null; } loop() {} setLoop() {} stopLoop() {} beep() {}
  count(key) { return (FILES[key] || []).length; }
}

export const audio = SILENT ? new SilentAudio() : new Audio();
