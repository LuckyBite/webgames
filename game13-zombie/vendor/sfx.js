/* ═══════════════════════════════════════════════════════════════════════════
   sfx.js — процедурный звук для webgames. Ноль файлов, ноль лицензий.
   36 КБ исходника / 11 КБ gzip (комментарии — половина; минификация даст ~6 КБ).
   Заменяет одноосцилляторный beep() слоёным синтезом.

   Что даёт «интересность», в порядке вклада:
     1. Слои       — атака (шум) + тело (тон) + хвост (шум/реверб). Один
                     осциллятор всегда звучит как пищалка, три слоя — как звук.
     2. Огибающие  — не только по громкости, но и по высоте и по фильтру.
     3. Реверб     — импульс генерируется из затухающего шума, ConvolverNode.
                     Даёт «пространство»; самый дешёвый скачок качества.
     4. Разброс    — ±3–7% высоты и громкости на каждое срабатывание.
                     Убивает усталость от повторов (100 морковок за минуту).
     5. Музыкальность — все тоны квантуются в одну гамму, комбо идут вверх
                     по ступеням. Это то, за что игру называют «приятной».
     6. Лоу-фай    — waveshaper-квантование под пиксельную картинку.

   API:
     SFX.unlock()                 — вызвать в первом же обработчике тапа
     SFX.play('coin', {v:.8})     — универсальный вызов
     SFX.coin(), SFX.chop(), ...  — то же напрямую
     SFX.combo(i)                 — i-я ступень восходящей лесенки
     SFX.setMuted(true) / SFX.setVolume(0.7) / SFX.setKey(57,'pent')
     SFX.music.start('farm') / .set(intensity) / .stop()
     SFX.amb.start('cave') / .stop()
   ═══════════════════════════════════════════════════════════════════════════ */
const SFX = (() => {
  'use strict';

  let ctx = null, bus = null, revIn = null, delIn = null, out = null, musBus = null, musRev = null;
  let muted = false, volume = .8, sched = [];
  const MAX_VOICES = 28;          // защита от каши при массовом сборе урожая
  const bufs = {}, curves = {}, lastAt = {};

  /* ── шина: всё сходится в компрессор, чтобы 20 звуков не рвали колонки ── */
  function ac() {
    if (ctx) return ctx;
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    out = ctx.createGain(); out.gain.value = volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 14; comp.ratio.value = 5;
    comp.attack.value = .004;    comp.release.value = .14;
    bus = ctx.createGain();
    bus.connect(comp); comp.connect(out); out.connect(ctx.destination);

    // реверб: ИК = затухающий шум, потолок по верхам чтобы не шипел
    const conv = ctx.createConvolver(); conv.buffer = makeIR(1.9, 2.6);
    const revLP = ctx.createBiquadFilter(); revLP.type = 'lowpass'; revLP.frequency.value = 3600;
    revIn = ctx.createGain(); revIn.gain.value = .9;
    revIn.connect(conv); conv.connect(revLP); revLP.connect(bus);

    // дилей с обраткой — для магии и «пещерности»
    const dl = ctx.createDelay(1); dl.delayTime.value = .185;
    const fb = ctx.createGain(); fb.gain.value = .34;
    const dlLP = ctx.createBiquadFilter(); dlLP.type = 'lowpass'; dlLP.frequency.value = 2400;
    delIn = ctx.createGain(); delIn.gain.value = .9;
    delIn.connect(dl); dl.connect(dlLP); dlLP.connect(fb); fb.connect(dl); dlLP.connect(bus);

    return ctx;
  }

  function makeIR(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const pre = i < ctx.sampleRate * .012 ? 0 : 1;          // предзадержка
        d[i] = pre * (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      }
    }
    return b;
  }

  /* ── шумы: белый (щелчки), розовый (вода/ветер), коричневый (земля/взрыв) ── */
  function noiseBuf(kind) {
    if (bufs[kind]) return bufs[kind];
    const c = ac(), n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    if (kind === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        b0 = .997 * b0 + w * .0555; b1 = .963 * b1 + w * .0750; b2 = .574 * b2 + w * .1538;
        d[i] = (b0 + b1 + b2 + w * .1848) * .6;
      }
    } else if (kind === 'brown') {
      let l = 0;
      for (let i = 0; i < n; i++) { l = (l + (Math.random() * 2 - 1) * .02) / 1.02; d[i] = l * 3.2; }
    } else {
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return bufs[kind] = b;
  }

  function crushCurve(bits) {
    const k = 'c' + bits; if (curves[k]) return curves[k];
    const n = 1024, c = new Float32Array(n), lv = Math.pow(2, bits) - 1;
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.round((x * .5 + .5) * lv) / lv * 2 - 1; }
    return curves[k] = c;
  }
  function driveCurve(k) {
    const key = 'd' + k; if (curves[key]) return curves[key];
    const n = 1024, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    return curves[key] = c;
  }

  /* ── гамма: всё тональное живёт в одном ладу, поэтому не режет ухо ── */
  const SCALES = { pent: [0, 3, 5, 7, 10], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], lyd: [0, 2, 4, 6, 7, 9, 11] };
  let key = 57, scale = 'pent';                                  // A3, минорная пентатоника
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function deg(i, oct = 0) {
    const s = SCALES[scale], n = s.length, k = ((i % n) + n) % n;
    return mtof(key + s[k] + 12 * (Math.floor(i / n) + oct));
  }

  const rnd = (a, b) => a + Math.random() * (b - a);
  const cents = x => Math.pow(2, x / 1200);
  // Троттл одинаковых звуков. Сравниваем по времени ЗАПЛАНИРОВАННОГО старта:
  // иначе цикл вида for(i) play('coin',{t:i*.05}) улетает в один и тот же
  // миллисекунд системных часов и глушится весь, кроме первого.
  function gate(k, ms, off) {
    const t = performance.now() + (off || 0) * 1000;
    if (lastAt[k] && t - lastAt[k] < ms) return false;
    lastAt[k] = t; return true;
  }
  const live = () => !muted && !document.hidden;

  /* ── routing: сухо + посылы на реверб/дилей ── */
  function route(node, p) {
    const c = ctx, dry = c.createGain(); dry.gain.value = p.dry != null ? p.dry : 1;
    node.connect(dry); dry.connect(p.bus || bus);
    if (p.rev) { const g = c.createGain(); g.gain.value = p.rev; node.connect(g); g.connect(revIn); }
    if (p.del) { const g = c.createGain(); g.gain.value = p.del; node.connect(g); g.connect(delIn); }
  }

  function shape(src, p) {
    let tail = src;
    if (p.filter) {
      const f = ctx.createBiquadFilter();
      f.type = p.filter; f.Q.value = p.q || 1;
      const t0 = p._t0, fEnd = p.ff2 || p.ff;
      f.frequency.setValueAtTime(Math.max(20, p.ff), t0);
      if (p.ff2) f.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd), t0 + (p.fd || p.d));
      tail.connect(f); tail = f;
    }
    if (p.crush) { const w = ctx.createWaveShaper(); w.curve = crushCurve(p.crush); tail.connect(w); tail = w; }
    if (p.drive) { const w = ctx.createWaveShaper(); w.curve = driveCurve(p.drive); w.oversample = '2x'; tail.connect(w); tail = w; }
    return tail;
  }

  const vol = p => Math.max(.0005, p.v != null ? p.v : .2);

  // Лимитер голосов. Считаем не «сколько заказали», а сколько реально звучит
  // одновременно: каскад из 20 монет расписан на секунду вперёд и concurrent
  // там всего 3–4. Счётчик заказов обрубал бы такой каскад на середине.
  // Время берём по аудиочасам, а не по системным: если вкладку свернули,
  // AudioContext приостановлен и onended/таймеры не приходят — залипший
  // счётчик означал бы, что звук у игрока пропал навсегда.
  function slot(t0, end) {
    const now = ctx.currentTime;
    if (sched.length > 64) sched = sched.filter(s => s.e > now);
    let n = 0;
    for (let i = 0; i < sched.length; i++) if (sched[i].s <= t0 && sched[i].e > t0) n++;
    if (n >= MAX_VOICES) return false;
    sched.push({ s: t0, e: end });
    return true;
  }

  function hold(src, g, p) {
    setTimeout(() => { try { src.disconnect(); g.disconnect(); } catch (e) {} }, ((p.t || 0) + p.d) * 1000 + 120);
  }

  function envGain(p) {
    const g = ctx.createGain(), t0 = p._t0, v = p._v;
    const a = p.a != null ? p.a : .004, hold = p.hold || 0;
    g.gain.setValueAtTime(.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + a);
    if (hold) g.gain.setValueAtTime(v, t0 + a + hold);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + p.d);
    return g;
  }

  /* тональный голос: тип, высота + глайд, опц. FM, фильтр, лоу-фай */
  function tone(p) {
    if (!live()) return;
    const c = ac(); p._t0 = c.currentTime + (p.t || 0); p._v = vol(p);
    if (!slot(p._t0, p._t0 + p.d)) return;
    const o = c.createOscillator();
    o.type = p.type || 'sine';
    const jit = p.jit != null ? p.jit : .012;                     // микрорасстройка
    const f0 = Math.max(1, p.f * cents(rnd(-jit, jit) * 1200));
    o.frequency.setValueAtTime(f0, p._t0);
    if (p.f2) {
      const tEnd = p._t0 + (p.pd || p.d * .9);
      if (p.slide === 'lin') o.frequency.linearRampToValueAtTime(Math.max(1, p.f2), tEnd);
      else o.frequency.exponentialRampToValueAtTime(Math.max(1, p.f2), tEnd);
    }
    if (p.detune) o.detune.value = p.detune;
    if (p.fm) {                                                   // FM: металл, магия, колокола
      const m = c.createOscillator(), mg = c.createGain();
      m.frequency.value = f0 * p.fm.r; m.type = p.fm.type || 'sine';
      mg.gain.setValueAtTime(p.fm.i, p._t0);
      mg.gain.exponentialRampToValueAtTime(Math.max(.01, p.fm.i2 != null ? p.fm.i2 : p.fm.i * .02), p._t0 + p.d);
      m.connect(mg); mg.connect(o.frequency); m.start(p._t0); m.stop(p._t0 + p.d + .02);
    }
    if (p.trem) {                                                 // тремоло — «живой» дрожащий тон
      const l = c.createOscillator(), lg = c.createGain();
      // depth — доля от громкости голоса (0..1). LFO складывается с gain.value,
      // поэтому абсолютное число здесь умножало бы громкость в разы.
      l.frequency.value = p.trem.f; lg.gain.value = p._v * Math.min(1, p.trem.d);
      l.connect(lg); l.start(p._t0); l.stop(p._t0 + p.d + .02);
      p._trem = lg;
    }
    const g = envGain(p);
    if (p._trem) p._trem.connect(g.gain);
    const end = shape(o, p); end.connect(g); route(g, p);
    hold(o, g, p);
    o.start(p._t0); o.stop(p._t0 + p.d + .02);
  }

  /* шумовой голос: кирка, шаги, вода, взрыв */
  function noise(p) {
    if (!live()) return;
    const c = ac(); p._t0 = c.currentTime + (p.t || 0); p._v = vol(p);
    if (!slot(p._t0, p._t0 + p.d)) return;
    const s = c.createBufferSource();
    s.buffer = noiseBuf(p.n || 'white'); s.loop = true;
    s.playbackRate.value = 1 + rnd(-.15, .15);
    const g = envGain(p);
    const end = shape(s, p); end.connect(g); route(g, p);
    hold(s, g, p);
    s.start(p._t0, rnd(0, 1.5)); s.stop(p._t0 + p.d + .02);
  }

  /* ═══════════════ Рецепты ═══════════════
     Каждый — 2–4 слоя. Ниже в комментариях: из чего собран, чтобы можно было
     крутить, не разбираясь заново.                                          */
  const R = {

    /* ---------- интерфейс ---------- */
    // щелчок = короткий полосовой шум + микро-удар синусом
    tap(o = {}) { const m = o.v || 1;
      noise({ n: 'white', filter: 'bandpass', ff: 2600, q: 1.4, d: .03, v: .10 * m, a: .001, t: o.t });
      tone({ type: 'sine', f: 620, f2: 380, d: .05, v: .07 * m, t: o.t });
    },
    select(o = {}) { const m = o.v || 1;
      tone({ type: 'triangle', f: deg(2), d: .07, v: .13 * m, crush: 6, rev: .08, t: o.t });
      noise({ n: 'white', filter: 'highpass', ff: 4000, d: .02, v: .05 * m, t: o.t });
    },
    open(o = {}) { const m = o.v || 1;
      tone({ type: 'triangle', f: deg(0), f2: deg(4), pd: .09, d: .18, v: .13 * m, rev: .16, t: o.t });
      noise({ n: 'pink', filter: 'bandpass', ff: 700, ff2: 2600, q: .9, d: .16, v: .06 * m, a: .02, t: o.t });
    },
    close(o = {}) { const m = o.v || 1;
      tone({ type: 'triangle', f: deg(4), f2: deg(0), pd: .08, d: .14, v: .12 * m, rev: .1, t: o.t });
      noise({ n: 'pink', filter: 'lowpass', ff: 1800, ff2: 500, d: .12, v: .06 * m, t: o.t });
    },
    // ошибка = квадрат через перегруз, две расстроенные копии
    error(o = {}) { const m = o.v || 1;
      [0, -14].forEach(dt => tone({ type: 'square', f: 196, f2: 150, d: .22, v: .09 * m, detune: dt, crush: 4, drive: 6, filter: 'lowpass', ff: 1400, ff2: 500, t: o.t }));
    },
    toggle(o = {}) { const m = o.v || 1;
      tone({ type: 'square', f: o.on === false ? deg(1) : deg(3), d: .06, v: .11 * m, crush: 5, rev: .1, t: o.t });
    },

    /* ---------- награда ---------- */
    // монета = два квадратных блипа по ступеням гаммы; n сдвигает лесенку
    coin(o = {}) { const m = o.v || 1, n = o.n || 0;
      tone({ type: 'square', f: deg(4 + n), d: .055, v: .15 * m, crush: 6, rev: .08, t: o.t });
      tone({ type: 'square', f: deg(6 + n), d: .15, v: .14 * m, crush: 6, rev: .2, del: .08, t: (o.t || 0) + .05 });
    },
    // каскад монет: ступени вверх + разброс по времени, звучит как «сыплется»
    coins(o = {}) { const k = Math.min(o.n || 4, 8), m = o.v || 1;
      for (let i = 0; i < k; i++) R.coin({ n: i, v: (1 - i * .06) * m, t: (o.t || 0) + i * .055 + rnd(0, .012) });
    },
    pickup(o = {}) { const m = o.v || 1, n = o.n || 0;
      tone({ type: 'triangle', f: deg(n), f2: deg(n + 3), pd: .07, d: .16, v: .17 * m, rev: .14, t: o.t });
      noise({ n: 'white', filter: 'bandpass', ff: 5200, q: 2.5, d: .04, v: .05 * m, t: o.t });
    },
    // лесенка комбо — главный трюк «приятности»: i-е подряд действие выше предыдущего.
    // Принимает и combo(3), и play('combo',{n:3}) — иначе ломается универсальный вызов.
    combo(i, o = {}) {
      if (i && typeof i === 'object') { o = i; i = o.n || 0; }
      i = i | 0; const m = o.v || 1;
      tone({ type: 'triangle', f: deg(i), d: .14, v: .16 * m, rev: .18, del: .06, t: o.t });
      tone({ type: 'sine', f: deg(i, 1), d: .1, v: .06 * m, rev: .2, t: (o.t || 0) + .012 });
    },
    star(o = {}) { const m = o.v || 1;
      [0, 2, 4].forEach((s, i) => tone({ type: 'sine', f: deg(s, 1), d: .5, v: .07 * m, rev: .45, del: .12, t: (o.t || 0) + i * .04 }));
      noise({ n: 'white', filter: 'highpass', ff: 6000, d: .5, v: .03 * m, a: .1, rev: .4, t: o.t });
    },
    levelup(o = {}) { const m = o.v || 1;
      [0, 2, 4, 7].forEach((s, i) => {
        [0, -9].forEach(dt => tone({ type: 'triangle', f: deg(s), d: .3, v: .12 * m, detune: dt, crush: 7, rev: .3, del: .1, t: (o.t || 0) + i * .085 }));
      });
      R.star({ v: .6 * m, t: (o.t || 0) + .34 });
    },
    fanfare(o = {}) { const m = o.v || 1;
      [0, 2, 4, 7, 9, 11].forEach((s, i) => {
        [0, 7].forEach(dt => tone({ type: 'square', f: deg(s), d: i === 5 ? .7 : .22, v: .1 * m, detune: dt, crush: 6, rev: .35, t: (o.t || 0) + i * .11 }));
      });
      tone({ type: 'triangle', f: deg(0, -1), d: 1.1, v: .12 * m, hold: .4, rev: .3, t: (o.t || 0) + .55 });
    },
    // «открылось новое» — щелчок замка + удар + искры. Имя не unlock, чтобы
    // не путать со служебным SFX.unlock() (возобновление AudioContext).
    reveal(o = {}) { const m = o.v || 1;
      noise({ n: 'white', filter: 'bandpass', ff: 3200, q: 6, d: .05, v: .12 * m, t: o.t });                       // щелчок замка
      tone({ type: 'sine', f: 180, f2: 90, d: .12, v: .15 * m, t: (o.t || 0) + .02 });
      R.star({ v: .8 * m, t: (o.t || 0) + .1 });
    },

    /* ---------- действия ---------- */
    // топор: щелчок-транзиент + деревянное тело + шорох щепок
    chop(o = {}) { const m = o.v || 1;
      noise({ n: 'white', filter: 'bandpass', ff: 2400, ff2: 700, q: 1.2, d: .06, v: .22 * m, t: o.t });
      tone({ type: 'triangle', f: rnd(170, 200), f2: 62, pd: .07, d: .13, v: .17 * m, crush: 5, t: o.t });
      noise({ n: 'brown', filter: 'lowpass', ff: 900, d: .2, v: .07 * m, a: .01, rev: .12, t: (o.t || 0) + .03 });
    },
    // лопата в землю: только коричневый шум с падающим фильтром
    dig(o = {}) { const m = o.v || 1;
      noise({ n: 'brown', filter: 'lowpass', ff: rnd(1300, 1700), ff2: 380, q: .8, d: .24, v: .36 * m, a: .012, rev: .1, t: o.t });
      tone({ type: 'sine', f: 110, f2: 55, d: .1, v: .16 * m, t: o.t });
    },
    // кирка по камню: яркий транзиент + резонансный «звон» камня + осыпь
    pick(o = {}) { const m = o.v || 1;
      noise({ n: 'white', filter: 'bandpass', ff: rnd(3800, 4600), q: 8, d: .035, v: .26 * m, t: o.t });
      tone({ type: 'sine', f: rnd(1700, 1900), d: .16, v: .07 * m, rev: .3, t: o.t });
      tone({ type: 'sine', f: rnd(2300, 2500), d: .1, v: .05 * m, rev: .3, t: o.t });
      noise({ n: 'brown', filter: 'lowpass', ff: 800, d: .28, v: .06 * m, a: .02, rev: .2, t: (o.t || 0) + .04 });
    },
    // наковальня: негармонические обертоны 1 : 2.76 : 5.4 : 8.9 — так звенит металл
    clang(o = {}) { const m = o.v || 1, f = o.f || rnd(210, 240);
      noise({ n: 'white', filter: 'bandpass', ff: 5000, q: 3, d: .03, v: .14 * m, t: o.t });
      [[1, .09, .9], [2.76, .07, .7], [5.4, .05, .45], [8.93, .03, .3]].forEach(([r, v, d]) =>
        tone({ type: 'sine', f: f * r, d: d * (o.ring || 1), v: v * m, rev: .4, t: o.t }));
    },
    thud(o = {}) { const m = o.v || 1;
      tone({ type: 'sine', f: 150, f2: 45, pd: .06, d: .18, v: .22 * m, drive: 3, t: o.t });
      noise({ n: 'brown', filter: 'lowpass', ff: 500, d: .12, v: .085 * m, t: o.t });
    },
    // шаг: поверхность меняет тип шума и фильтр — 4 разных материала одной формулой
    step(o = {}) { const m = o.v || 1, s = o.surface || 'grass';
      const P = { grass: ['pink', 'bandpass', 1800, 4, .07], stone: ['white', 'bandpass', 900, 2, .05],
                  wood:  ['brown', 'lowpass', 1200, 1, .06], snow:  ['white', 'highpass', 3000, 1, .10] }[s];
      // v высокое не по ошибке: узкий полосовой срезает почти всю энергию шума
      noise({ n: P[0], filter: P[1], ff: P[2] * rnd(.85, 1.15), q: P[3], d: P[4], v: .45 * m, rev: .1, t: o.t });
      if (s === 'wood') tone({ type: 'sine', f: rnd(95, 115), f2: 60, d: .08, v: .12 * m, t: o.t });
    },
    // взмах: полосовой шум, у которого фильтр проезжает вверх и обратно
    whoosh(o = {}) { const m = o.v || 1, d = o.d || .3;
      noise({ n: 'pink', filter: 'bandpass', ff: 400, ff2: 2600, fd: d * .55, q: 1.6, d, v: .45 * m, a: d * .3, rev: .16, t: o.t });
    },
    explode(o = {}) { const m = o.v || 1;
      noise({ n: 'brown', filter: 'lowpass', ff: 2200, ff2: 90, fd: .5, d: .85, v: .22 * m, a: .006, drive: 8, rev: .5, t: o.t });
      tone({ type: 'sine', f: 95, f2: 28, pd: .3, d: .5, v: .18 * m, drive: 4, t: o.t });
      noise({ n: 'white', filter: 'highpass', ff: 3000, d: .1, v: .09 * m, t: o.t });
    },
    // разбилось: 6 случайных осколков — рандом делает каждый раз новым
    brk(o = {}) { const m = o.v || 1;
      R.thud({ v: .7 * m, t: o.t });
      for (let i = 0; i < 6; i++)
        noise({ n: 'white', filter: 'bandpass', ff: rnd(1800, 6500), q: rnd(6, 14), d: rnd(.04, .12), v: rnd(.05, .12) * m, rev: .3, t: (o.t || 0) + rnd(0, .14) });
    },

    /* ---------- природа ---------- */
    // пузырь: синус с быстрым подъёмом высоты — канонический рецепт
    bubble(o = {}) { const m = o.v || 1;
      tone({ type: 'sine', f: rnd(260, 420), f2: rnd(750, 1100), pd: .055, d: .08, v: .13 * m, a: .006, rev: .15, t: o.t });
    },
    water(o = {}) { const m = o.v || 1, d = o.d || .55;
      noise({ n: 'pink', filter: 'bandpass', ff: 900, ff2: 1500, q: 1.4, d, v: .13 * m, a: .07, rev: .18, t: o.t });
      for (let i = 0; i < 5; i++) R.bubble({ v: rnd(.3, .7) * m, t: (o.t || 0) + rnd(.02, d * .8) });
    },
    fire(o = {}) { const m = o.v || 1;
      noise({ n: 'pink', filter: 'bandpass', ff: 500, ff2: 2400, fd: .12, q: 1.1, d: .45, v: .24 * m, a: .02, drive: 3, rev: .2, t: o.t });
      for (let i = 0; i < 4; i++) noise({ n: 'white', filter: 'bandpass', ff: rnd(2000, 5000), q: 9, d: .03, v: rnd(.03, .08) * m, t: (o.t || 0) + rnd(.02, .3) });
    },
    leaves(o = {}) { const m = o.v || 1;
      noise({ n: 'pink', filter: 'highpass', ff: 2400, d: .35, v: .27 * m, a: .08, rev: .18, t: o.t });
    },
    // курица: два форманта поверх пилы с болтающейся высотой. Предел «синтеза
    // живого» — узнаваемо, но не реалистично. Такое честнее брать семплом.
    cluck(o = {}) { const m = o.v || 1;
      for (let i = 0; i < 2; i++) {
        const t = (o.t || 0) + i * .1, f = rnd(700, 900);
        tone({ type: 'sawtooth', f, f2: f * 1.5, pd: .03, d: .07, v: .30 * m, filter: 'bandpass', ff: 1100, q: 6, crush: 5, t });
        tone({ type: 'sawtooth', f, f2: f * 1.5, pd: .03, d: .06, v: .15 * m, filter: 'bandpass', ff: 2700, q: 9, t });
      }
    },

    /* ---------- магия / нежить ---------- */
    spark(o = {}) { const m = o.v || 1;
      tone({ type: 'sine', f: deg(6, 1), f2: deg(9, 2), pd: .1, d: .22, v: .1 * m, rev: .35, del: .16, t: o.t });
      noise({ n: 'white', filter: 'highpass', ff: 5000, d: .12, v: .05 * m, rev: .3, t: o.t });
    },
    // заклинание: FM с падающим индексом = «переливающийся» тембр + дилей
    spell(o = {}) { const m = o.v || 1;
      tone({ type: 'sine', f: deg(0), f2: deg(7), pd: .35, d: .6, v: .14 * m, fm: { r: 3.5, i: 700, i2: 30 }, rev: .4, del: .25, t: o.t });
      tone({ type: 'triangle', f: deg(4, 1), d: .5, v: .06 * m, rev: .45, del: .3, t: (o.t || 0) + .1 });
    },
    bell(o = {}) { const m = o.v || 1, f = o.f || deg(0, 1);
      tone({ type: 'sine', f, d: 1.6, v: .12 * m, fm: { r: 2.76, i: f * 1.4, i2: 5 }, rev: .55, t: o.t });
      tone({ type: 'sine', f: f * 2.01, d: .9, v: .05 * m, rev: .5, t: o.t });
    },
    portal(o = {}) { const m = o.v || 1;
      noise({ n: 'white', filter: 'bandpass', ff: 200, ff2: 4200, fd: .8, q: 14, d: 1, v: .40 * m, a: .3, rev: .5, del: .2, t: o.t });
      tone({ type: 'sawtooth', f: 60, f2: 320, pd: .8, d: 1, v: .13 * m, filter: 'lowpass', ff: 400, ff2: 2500, rev: .4, t: o.t });
    },
    // проклятие: три расстроенных низких пилы + тремоло + длинный реверб
    curse(o = {}) { const m = o.v || 1;
      [-12, 0, 11].forEach(dt => tone({ type: 'sawtooth', f: 68, d: 1.3, v: .063 * m, detune: dt, a: .06, hold: .3,
        filter: 'lowpass', ff: 700, ff2: 220, fd: 1.2, trem: { f: 5.5, d: .35 }, rev: .55, t: o.t }));
      noise({ n: 'brown', filter: 'lowpass', ff: 400, d: 1.2, v: .05 * m, a: .3, rev: .5, t: o.t });
    },
    heal(o = {}) { const m = o.v || 1;
      [0, 2, 4].forEach((s, i) => tone({ type: 'sine', f: deg(s, 1), d: .8, v: .09 * m, a: .06, rev: .5, del: .15, t: (o.t || 0) + i * .06 }));
    },

    /* ---------- провал ---------- */
    fail(o = {}) { const m = o.v || 1;
      [0, -16].forEach(dt => tone({ type: 'square', f: 300, f2: 105, pd: .35, d: .45, v: .1 * m, detune: dt, crush: 4,
        filter: 'lowpass', ff: 1800, ff2: 400, rev: .2, t: o.t }));
      R.thud({ v: .5 * m, t: (o.t || 0) + .3 });
    },
    drop(o = {}) { const m = o.v || 1;
      tone({ type: 'triangle', f: deg(4), f2: deg(-3), pd: .25, d: .3, v: .12 * m, rev: .15, t: o.t });
    },
  };

  /* ═══════════════ Генеративная музыка ═══════════════
     16 шагов, планировщик с упреждением 0.3 c. Настроение задаёт лад, темп,
     тембр и набор слоёв; intensity (0..1) включает слои по мере накала.
     g — поправка громкости: квадрат с лоу-фаем даёт вдвое больший пик, чем
     синус при той же слышимой громкости, поэтому moods выровнены вручную.    */
  const MOODS = {
    farm:    { bpm: 92,  key: 60, scale: 'major', bass: 'triangle', lead: 'triangle', crush: 7, rev: .22, hats: false, g: 1,   pat: [0, 4, 2, 7, 4, 2, 0, 4] },
    mine:    { bpm: 104, key: 50, scale: 'minor', bass: 'square',   lead: 'square',   crush: 5, rev: .28, hats: true,  g: .85, pat: [0, 3, 5, 3, 7, 5, 3, 0] },
    necro:   { bpm: 66,  key: 45, scale: 'minor', bass: 'sawtooth', lead: 'sine',     crush: 0, rev: .5,  hats: false, g: 1,   pat: [0, 5, 3, 7, 10, 7, 3, 5] },
    alchemy: { bpm: 78,  key: 57, scale: 'lyd',   bass: 'triangle', lead: 'sine',     crush: 0, rev: .45, hats: false, g: 1,   pat: [0, 4, 6, 9, 6, 4, 2, 0] },
    dawn:    { bpm: 84,  key: 62, scale: 'pent',  bass: 'sine',     lead: 'triangle', crush: 0, rev: .4,  hats: false, g: 1,   pat: [0, 2, 4, 2, 7, 4, 2, 0] },
    // таверна: весёлый трактирный шаг, без лоу-фая; громче — когда в зале людно
    tavern:  { bpm: 100, key: 55, scale: 'major', bass: 'triangle', lead: 'triangle', crush: 0, rev: .3,  hats: false, g: .8,  pat: [0, 4, 7, 4, 5, 9, 7, 4] },
  };
  let mOn = false, mTimer = null, mStep = 0, mNext = 0, mMood = MOODS.farm, mInt = .5, mSaveKey = null;

  // Каждый запуск музыки получает СВОЮ шину. Пэд живёт до 10 секунд, и при
  // смене настроения он вернулся бы вместе с новым треком, если бы шина была
  // общей: гасим старую и выбрасываем, ноты на ней уже никуда не подключены.
  function newMusBus(rev) {
    const g = ctx.createGain(); g.connect(bus);
    const rv = ctx.createGain(); rv.gain.value = rev; g.connect(rv); rv.connect(revIn);
    const dl = ctx.createGain(); dl.gain.value = .1; g.connect(dl); dl.connect(delIn);
    musBus = g; musRev = rv;
  }
  function fadeOutMusBus() {
    if (!musBus) return;
    const g = musBus, n = ctx.currentTime;
    musBus = musRev = null;
    g.gain.cancelScheduledValues(n);
    g.gain.setValueAtTime(g.gain.value, n);
    g.gain.linearRampToValueAtTime(.0001, n + .25);
    setTimeout(() => { try { g.disconnect(); } catch (e) {} }, 400);
  }

  function mSchedule() {
    if (!mOn) return;
    // Упреждение 0.3 с, а не 0.05: браузер троттлит setTimeout в неактивной
    // вкладке до секунды, и на коротком горизонте музыка рвётся на куски.
    const c = ac(), spb = 60 / mMood.bpm / 4;                     // шестнадцатая
    while (mNext < c.currentTime + .3) {
      const t = mNext - c.currentTime, s = mStep % 16, M = mMood, B = musBus, gm = M.g;
      if (s % 8 === 0)                                            // бас
        tone({ type: M.bass, f: deg(M.pat[(mStep / 8 | 0) % M.pat.length], -1), d: spb * 7, v: .1 * gm, a: .01,
               hold: spb * 3, filter: 'lowpass', ff: 700, crush: M.crush, bus: B, t });
      if (mInt > .3 && (s === 2 || s === 6 || s === 10 || s === 13))   // арпеджио
        tone({ type: M.lead, f: deg(M.pat[(mStep / 2 | 0) % M.pat.length], s > 8 ? 1 : 0), d: spb * 2.5, v: .055 * mInt * gm,
               crush: M.crush, bus: B, t: t + rnd(0, .008) });
      if (mInt > .65 && M.hats && s % 2 === 1)                     // хэт
        noise({ n: 'white', filter: 'highpass', ff: 7000, d: .03, v: .03 * mInt * gm, bus: B, t });
      if (mInt > .5 && s === 0 && (mStep / 16 | 0) % 4 === 0)       // пэд раз в 4 такта
        [-7, 0, 5].forEach(iv => tone({ type: 'sawtooth', f: deg(0, -1) * Math.pow(2, iv / 12), d: spb * 60, v: .028 * mInt * gm,
               a: spb * 8, hold: spb * 30, filter: 'lowpass', ff: 600, bus: B, t }));
      mNext += spb; mStep++;
    }
    mTimer = setTimeout(mSchedule, 40);
  }

  const music = {
    start(mood, intensity) {
      const M = MOODS[mood] || MOODS.farm;
      if (mOn && mMood === M) { if (intensity != null) mInt = intensity; return; }
      music.stop();
      mMood = M; mInt = intensity != null ? intensity : .5;
      mSaveKey = [key, scale]; key = M.key; scale = M.scale;
      const c = ac(); newMusBus(M.rev);
      mOn = true; mStep = 0; mNext = c.currentTime + .05; mSchedule();
    },
    set(i) { mInt = Math.max(0, Math.min(1, i)); },
    // Пэд тянется до 10 секунд, поэтому «стоп» — это фейд шины, а не просто
    // остановка планировщика: иначе музыка ещё долго доигрывает после выключения.
    stop() {
      mOn = false; clearTimeout(mTimer); fadeOutMusBus();
      if (mSaveKey) { key = mSaveKey[0]; scale = mSaveKey[1]; mSaveKey = null; }
    },
    playing: () => mOn,
  };

  /* ═══════════════ Эмбиент ═══════════════
     Непрерывный слой (шум с медленно гуляющим фильтром) + редкие случайные
     события. Такое невозможно «найти» — любой готовый луп слышно по петле.   */
  let aNodes = [], aTimer = null, aGain = null;
  const AMB = {
    wind:  { n: 'pink',  filter: 'bandpass', ff: 500,  q: 1.2, v: .08, lfo: [.09, 380], ev: null },
    cave:  { n: 'brown', filter: 'lowpass',  ff: 260,  q: .7,  v: .06, lfo: [.05, 90],  ev: [1400, 3800, () => R.bubble({ v: .25 })] },
    rain:  { n: 'pink',  filter: 'highpass', ff: 1600, q: .8,  v: .07, lfo: [.13, 500], ev: null },
    night: { n: 'brown', filter: 'lowpass',  ff: 380,  q: .8,  v: .05, lfo: [.04, 120], ev: [900, 2600, () => R.leaves({ v: .2 })] },
    hearth:{ n: 'pink',  filter: 'bandpass', ff: 700,  q: 1,   v: .09, lfo: [.5, 400],  ev: [180, 700, () => noise({ n: 'white', filter: 'bandpass', ff: rnd(2200, 5200), q: 10, d: .03, v: rnd(.02, .06), rev: .2 }) ] },
  };
  const amb = {
    start(name) {
      amb.stop();
      const A = AMB[name]; if (!A) return;
      const c = ac(), s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(),
            lfo = c.createOscillator(), lg = c.createGain(), rv = c.createGain();
      s.buffer = noiseBuf(A.n); s.loop = true;
      f.type = A.filter; f.frequency.value = A.ff; f.Q.value = A.q;
      lfo.frequency.value = A.lfo[0]; lg.gain.value = A.lfo[1];
      lfo.connect(lg); lg.connect(f.frequency);
      g.gain.setValueAtTime(.0001, c.currentTime);
      g.gain.linearRampToValueAtTime(A.v, c.currentTime + 1.5);
      s.connect(f); f.connect(g); g.connect(bus);
      rv.gain.value = .3; g.connect(rv); rv.connect(revIn);
      s.start(); lfo.start();
      aNodes = [s, lfo]; aGain = g;
      if (A.ev) (function tick() { aTimer = setTimeout(() => { A.ev[2](); tick(); }, rnd(A.ev[0], A.ev[1])); })();
    },
    // Обрывать петлю шума на полуслове — слышный щелчок. Гасим за 0.5 с, узлы
    // останавливаем после фейда.
    stop() {
      clearTimeout(aTimer); aTimer = null;
      const g = aGain, ns = aNodes;
      aNodes = []; aGain = null;
      if (!g) return;
      const n = ctx.currentTime;
      g.gain.cancelScheduledValues(n);
      g.gain.setValueAtTime(g.gain.value, n);
      g.gain.linearRampToValueAtTime(.0001, n + .5);
      setTimeout(() => ns.forEach(x => { try { x.stop(); x.disconnect(); } catch (e) {} }), 600);
    },
    playing: () => aNodes.length > 0,
  };

  /* ═══════════════ Публичный API ═══════════════ */
  const api = {
    play(name, o) { const f = R[name]; if (f) { if (!gate(name, 22, o && o.t)) return; f(o || {}); } },
    tone, noise, deg,
    unlock() { try { const c = ac(); if (c.state === 'suspended') { sched = []; c.resume(); } } catch (e) {} },
    stats() {
      const now = ctx ? ctx.currentTime : 0;
      return { active: sched.filter(s => s.s <= now && s.e > now).length, queued: sched.length,
               state: ctx ? ctx.state : 'none', music: mOn, amb: aNodes.length > 0 };
    },
    setMuted(m) { muted = !!m; if (m) { music.stop(); amb.stop(); } },
    isMuted: () => muted,
    setVolume(v) { volume = v; if (out) out.gain.value = v; },
    setKey(k, s) { key = k; if (s) scale = s; },
    music, amb,
    list: () => Object.keys(R),
  };
  Object.keys(R).forEach(k => { if (!api[k]) api[k] = o => api.play(k, o); });

  // мобильные браузеры отдают звук только после жеста
  ['pointerdown', 'keydown', 'touchstart'].forEach(e =>
    addEventListener(e, api.unlock, { once: true, passive: true }));

  // Ушли из вкладки — глушим планировщик (иначе он копит ноты и вываливает их
  // пачкой при возврате), вернулись — подхватываем с текущего момента.
  addEventListener('visibilitychange', () => {
    if (document.hidden) clearTimeout(mTimer);
    else if (mOn) { sched = []; mNext = ac().currentTime + .05; mSchedule(); }
  });

  return api;
})();

if (typeof module !== 'undefined') module.exports = SFX;
