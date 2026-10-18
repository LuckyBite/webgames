// Интерфейс поверх канваса: HUD, экраны (меню, пауза, настройки, инвентарь, обыск, диалог,
// торговля, верстак, карта, смерть), сенсорные кнопки, миникарта и компас.
// Пока открыт любой экран, мир стоит на паузе (game.paused()).
import { Input, bindTouchButton, initTouch, requestLock, exitLock, clearAll } from './input.js';
import { ITEMS, WEAPONS } from './items.js';
import { STYLES } from './render.js';
import { SHOP, SELL, RECIPES } from './quests.js';
import { DISTRICT_NAMES, districtAt, PITCH, ROAD, HALF, N, COAST_X, WORLD, streetLine, ASPHALT } from './city.js';
import { audio } from './audio.js';
import { SLOTS } from './player.js';
import { ICON, WICON } from './icons.js';
import { GREET, TALK, BYE, HERO, NPC_ANS, ABOUT, ABOUT_END, PEOPLE, pick } from './dialogue.js';
import { HEROES } from './heroes.js';

const $ = s => document.querySelector(s);
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
// имя героя по модели: Characters PSX называются по профессии и номеру, heyheythere — по роли
const JOBS = { police: ['Полицейский', 'Полицейская'], firefighter: ['Пожарный', 'Пожарная'], doctor: ['Врач', 'Врач'], hm: ['Химзащита', 'Химзащита'], sheriff: ['Шериф', 'Шериф'], killer: ['Незнакомец', 'Незнакомка'] };
const heroName = k => {
  if (k === 'hh_survivor_woman') return 'Выжившая';
  if (k === 'hh_office_worker') return 'Офисная работница';
  if (!k.startsWith('psx_')) return k;
  const t = k.split('_').slice(1), fem = t[0] === 'f' || t[0] === 'ef';
  const job = t.find(x => JOBS[x]), num = t.find(x => /^\d+$/.test(x));
  return (job ? JOBS[job][fem ? 1 : 0] : fem ? 'Женщина' : 'Мужчина') + (num ? ' ' + (+num) : '');
};
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

const KIND_COL = { weapon: '#6d5a44', ammo: '#6b6440', food: '#4f6340', med: '#6a3a3a', gear: '#40506a', fuel: '#6a4a2a', mat: '#4c4c4c', quest: '#7a5a20' };
const EQ_NAMES = { melee: 'Ближний бой', pistol: 'Пистолет', long1: 'Основное', long2: 'Второе', throw: 'Метательное', body: 'Броня', head: 'Голова', bag: 'Рюкзак' };

export class UI {
  constructor(game) {
    this.g = game;
    this.open = null;
    this.sel = null;
    this.toasts = [];
    this.hurtV = 0;
    this.hitT = 0;
    this.mapZoom = 1; this.mapPan = { x: 0, z: 0 };
    this.root = $('#ui');
    this.buildHud();
    if (Input.isTouch) this.buildTouch();
    document.body.classList.toggle('touch', Input.isTouch);
    // Esc закрывает открытое окно (из настроек, управления и авторов — шаг назад); Tab, M, J — закрывают своё окно
    addEventListener('keydown', e => {
      if (e.code === 'F10' && this.g.state === 'play') { e.preventDefault(); if (this.open === 'admin') this.close(); else this.show('admin'); return; }
      if (!this.open || e.repeat) return;
      if (this.open === 'npc' && /^Digit[1-9]$/.test(e.code)) { const b = (this.dlgOpts || [])[+e.code.slice(5) - 1]; if (b) b.click(); return; }
      const back = { settings: 1, help: 1, credits: 1 };
      if (e.code === 'Escape') {
        e.preventDefault();
        if (back[this.open]) this.show(this.back || (this.g.state === 'play' ? 'pause' : 'menu'));
        else if (this.open === 'hero') this.show('menu');
        else if (!['menu', 'death'].includes(this.open)) this.close();
      } else if ((e.code === 'Tab' && this.open === 'inv') || (e.code === 'KeyM' && this.open === 'map') || (e.code === 'KeyJ' && this.open === 'quests')) { e.preventDefault(); this.close(); }
    });
    Input.onLockChange = locked => {
      if (!locked && this.g.state === 'play' && !this.open && !Input.isTouch) this.show('pause');
      this.updateLockHint();
    };
  }

  // ---------- HUD ----------
  buildHud() {
    const r = this.root;
    r.insertAdjacentHTML('beforeend', `
      <div id="hurt"></div>
      <div id="dmg"></div>
      <div id="tracker"></div>
      <div id="vitals" class="panel">
        <div class="vrow"><span class="ico">${ICON.heart}</span><div class="bar hp"><u></u><i></i></div><em id="hpn">100</em></div>
        <div class="vrow"><span class="ico st">${ICON.bolt}</span><div class="bar st"><i></i></div></div>
        <div class="vrow hide" id="armrow"><span class="ico ar">${ICON.shield}</span><div class="bar ar"><i></i></div><em id="arn"></em></div>
        <div class="gauges">
          <div class="gauge fd" title="Сытость">${ICON.food}</div>
          <div class="gauge wt" title="Вода">${ICON.water}</div>
          <div id="status"></div>
        </div>
      </div>
      <div id="compass"><div id="cstrip"></div><div id="cmark"></div><b id="clock"></b></div>
      <div id="mm"><canvas id="mmc" width="132" height="132"></canvas><div id="mmd"></div></div>
      <div id="weap" class="panel">
        <div class="wcard"><div id="wico"></div><div class="wtxt"><b id="wn"></b><span id="wa"></span><div id="pips"></div></div></div>
        <div id="slots"></div>
      </div>
      <div id="veh" class="hide"><b id="vn"></b><span id="vs"></span><div class="bar fl"><i></i><span>Бензин</span></div><div class="bar vh"><i></i><span>Корпус</span></div></div>
      <div id="cross"><i></i><i></i><i></i><i></i><b id="hitm"></b></div>
      <div id="prompt" class="hide"></div>
      <div id="usebar" class="hide"><i></i><span></span></div>
      <div id="toasts"></div>
      <div id="lockhint" class="hide">Клик по экрану: захватить мышь</div>
      <div id="scr" class="hide"><div class="card" id="card"></div></div>
      <div id="loading"><h1>Завтра не наступит</h1><div class="lbar"><i></i></div><p id="lmsg">Загрузка</p></div>
    `);
    this.el = {
      hp: $('.bar.hp i'), hpLag: $('.bar.hp u'), hpn: $('#hpn'), st: $('.bar.st i'), fd: $('.gauge.fd'), wt: $('.gauge.wt'), status: $('#status'), tracker: $('#tracker'),
      wico: $('#wico'), pips: $('#pips'), slots: $('#slots'), dmg: $('#dmg'),
      cstrip: $('#cstrip'), cmark: $('#cmark'), clock: $('#clock'), mmc: $('#mmc'), mmd: $('#mmd'), wn: $('#wn'), wa: $('#wa'),
      veh: $('#veh'), vn: $('#vn'), vs: $('#vs'), fl: $('.bar.fl i'), vh: $('.bar.vh i'), cross: $('#cross'), hitm: $('#hitm'),
      prompt: $('#prompt'), usebar: $('#usebar'), toasts: $('#toasts'), scr: $('#scr'), card: $('#card'), hurt: $('#hurt'),
      loading: $('#loading'), lbar: $('#loading .lbar i'), lmsg: $('#lmsg'), lockhint: $('#lockhint'),
    };
    // компас: стороны света и деления
    const marks = [];
    for (let a = 0; a < 360; a += 15) {
      const name = { 0: 'С', 45: 'СВ', 90: 'В', 135: 'ЮВ', 180: 'Ю', 225: 'ЮЗ', 270: 'З', 315: 'СЗ' }[a];
      marks.push(`<i style="left:${a / 360 * 100}%" class="${name ? 'big' : ''}">${name || '·'}</i>`);
    }
    // три копии круга (−360…720°), чтобы у краёв не было дыр; ширина полосы = один круг
    const one = marks.join('');
    this.el.cstrip.innerHTML = [-100, 0, 100].map(o => one.replace(/left:([\d.]+)%/g, (m, v) => `left:${+v + o}%`)).join('');
    this.el.mmc.addEventListener('click', () => this.show('map'));
    this.el.lockhint.addEventListener('click', () => requestLock());
    this.el.prompt.addEventListener('click', () => { if (Input.isTouch) Input.pressed.add('use'); });
  }

  loading(k, msg) {
    this.el.lbar.style.width = Math.round(k * 100) + '%';
    if (msg) this.el.lmsg.textContent = msg;
  }
  hideLoading() { this.el.loading.classList.add('hide'); }

  buildTouch() {
    const t = h('div', '', '');
    t.id = 'touch';
    this.root.appendChild(t);
    initTouch(t);
    const btn = (id, label, action, opts = {}) => {
      const b = h('div', 'tb ' + (opts.cls || ''), label);
      b.id = id;
      t.appendChild(b);
      if (opts.click) b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); opts.click(); });
      else bindTouchButton(b, action, opts);
      return b;
    };
    // иконка + короткая подпись: кнопку узнают по значку, подпись — подсказка
    const L = (ic, t) => ICON[ic] + (t ? '<span>' + t + '</span>' : '');
    btn('tFire', L('fire', 'Огонь'), 'fire', { look: true, cls: 'big' });
    btn('tAim', L('aim', 'Прицел'), 'aim', { toggle: true });
    btn('tReload', L('reload', 'Патроны'), 'reload');
    btn('tJump', L('jump', 'Прыжок'), 'jump');
    btn('tCrouch', L('crouch', 'Присесть'), 'crouch');
    btn('tSwap', L('swap', 'Оружие'), 'slotNext');
    btn('tUse', L('hand', 'Взять'), 'use', { cls: 'hide warm' });
    btn('tLight', L('light'), 'light', { cls: 'small' });
    btn('tInv', ICON.bag, null, { cls: 'top', click: () => this.toggle('inv') });
    btn('tMap', ICON.map, null, { cls: 'top', click: () => this.toggle('map') });
    btn('tPause', ICON.pause, null, { cls: 'top', click: () => this.toggle('pause') });
    btn('tExit', L('exit', 'Выйти'), 'use', { cls: 'hide warm' });
    btn('tHorn', L('horn', 'Гудок'), 'horn', { cls: 'hide' });
    btn('tBrake', L('brake', 'Тормоз'), 'jump', { cls: 'hide' });
    btn('tHeal', L('med'), 'heal', { cls: 'small' });
    btn('tAlt', L('swap', 'Заправить'), 'light', { cls: 'hide warm' });
  }

  updateTouch() {
    if (!Input.isTouch) return;
    const p = this.g.player, inVeh = !!p.vehicle;
    const set = (id, on) => { const e = document.getElementById(id); if (e) e.classList.toggle('hide', !on); };
    for (const id of ['tFire', 'tAim', 'tReload', 'tJump', 'tCrouch', 'tSwap', 'tLight', 'tHeal']) set(id, !inVeh);
    set('tExit', inVeh); set('tHorn', inVeh && p.vehicle.kind === 'car'); set('tBrake', inVeh && p.vehicle.kind !== 'boat');
    set('tUse', !inVeh && !!this.promptText);
    set('tAlt', !!this.promptAlt);
    const ta = document.getElementById('tAlt');
    if (ta && this.promptAlt && ta._t !== this.promptAlt.short) { ta._t = this.promptAlt.short; ta.innerHTML = ICON.swap + '<span>' + esc(this.promptAlt.short) + '</span>'; }
    const u = document.getElementById('tUse');
    if (u && this.promptShort && u._t !== this.promptShort) { u._t = this.promptShort; u.innerHTML = ICON.hand + '<span>' + esc(this.promptShort) + '</span>'; }
  }

  updateLockHint() {
    const show = !Input.isTouch && this.g.state === 'play' && !this.open && !Input.locked;
    this.el.lockhint.classList.toggle('hide', !show);
  }

  toast(msg) {
    const e = h('div', 'toast', esc(msg));
    this.el.toasts.appendChild(e);
    setTimeout(() => e.classList.add('out'), 2600);
    setTimeout(() => e.remove(), 3100);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
  }

  hurt(from) {
    this.hurtV = Math.min(1, this.hurtV + 0.6);
    this.bloodV = Math.min(0.8, (this.bloodV || 0) + 0.3);
    // дуга у прицела показывает, откуда ударили
    if (!from || from.x === undefined) return;
    const p = this.g.player;
    const a = Math.atan2(from.x - p.pos.x, from.z - p.pos.z); // мировой угол на источник
    const rel = -(a - (p.camYaw + Math.PI)); // относительно взгляда камеры (вперёд = 0)
    const e = h('i');
    e.style.transform = `rotate(${rel}rad)`;
    this.el.dmg.appendChild(e);
    requestAnimationFrame(() => { e.style.opacity = 1; setTimeout(() => { e.style.opacity = 0; }, 350); });
    setTimeout(() => e.remove(), 1200);
    while (this.el.dmg.children.length > 4) this.el.dmg.firstChild.remove();
  }
  // мини-игра запуска мотора: стрелка бегает по шкале, жать в зелёной зоне
  crank(c) {
    let e = this.el.crank;
    if (!e) {
      e = this.el.crank = h('div', 'panel hide', '<b>Заводим</b><div class="cbar"><i class="z"></i><i class="n"></i></div><span></span>');
      e.id = 'crank';
      this.root.appendChild(e);
    }
    e.classList.toggle('hide', !c);
    if (!c) return;
    const z = e.querySelector('.z'), n = e.querySelector('.n');
    z.style.left = (c.zone - c.w / 2) * 100 + '%'; z.style.width = c.w * 100 + '%';
    n.style.left = c.pos * 100 + '%';
    const key = Input.isTouch ? 'Тормоз' : 'Пробел';
    const t = `Жми «${key}», когда стрелка в зелёном. Попыток: ${c.tries}`;
    if (e.lastChild.textContent !== t) e.lastChild.textContent = t;
  }

  hitmark(head) { this.hitT = 0.15; this.el.hitm.className = head ? 'head' : ''; }
  killmark(head) { this.hitT = 0.3; this.el.hitm.className = 'kill'; }

  // подсказка: основное действие на E и, если есть, дополнительное на F (заправить, починить)
  setPrompt(text, short, alt) {
    const key = text + '|' + (alt ? alt.label : '');
    if (key === this._promptKey) return;
    this._promptKey = key;
    this.promptText = text; this.promptShort = short; this.promptAlt = alt;
    this.el.prompt.classList.toggle('hide', !text && !alt);
    let html = '';
    if (text) html += (Input.isTouch ? `<kbd>${ICON.hand.replace('<svg', '<svg style="width:16px;height:16px"')}</kbd>` : '<kbd>E</kbd>') + '<span>' + esc(text) + '</span>';
    if (alt) html += (Input.isTouch ? '' : '<kbd>F</kbd>') + '<span class="alt">' + esc(alt.label) + '</span>';
    this.el.prompt.innerHTML = html;
  }

  // кадр HUD
  update(dt) {
    const g = this.g, p = g.player;
    Input.freeLook = g.state === 'play' && !this.open;
    const pct = (el, v) => { el.style.width = Math.max(0, Math.min(100, v)) + '%'; };
    pct(this.el.hp, p.hp); pct(this.el.hpLag, p.hp); pct(this.el.st, p.stam);
    // броня: прочность жилета и каски одной полосой (жилет весит больше), видна только если что-то надето
    if (!this.el.arm) { this.el.arm = $('#armrow'); this.el.arI = $('.bar.ar i'); this.el.arn = $('#arn'); }
    const ab = p.eq.body, ah = p.eq.head;
    this.el.arm.classList.toggle('hide', !ab && !ah);
    if (ab || ah) {
      const max = (ab ? ITEMS[ab.id].dur : 0) + (ah ? ITEMS[ah.id].dur * 0.5 : 0), cur = (ab ? ab.dur : 0) + (ah ? ah.dur * 0.5 : 0);
      pct(this.el.arI, cur / max * 100);
      const t = String(Math.round(cur / max * 100));
      if (this.el.arn.textContent !== t) this.el.arn.textContent = t;
      if (p.armorHitT > 0) { p.armorHitT -= dt; this.el.arm.classList.add('flash'); } else this.el.arm.classList.remove('flash');
    }
    const hpn = String(Math.max(0, Math.ceil(p.hp)));
    if (hpn !== this._hpn) { this.el.hpn.textContent = hpn; this._hpn = hpn; }
    this.el.hp.parentNode.classList.toggle('low', p.hp < 30);
    this.el.st.parentNode.classList.toggle('winded', !!p.winded);
    this.el.fd.style.setProperty('--v', Math.round(p.food)); this.el.wt.style.setProperty('--v', Math.round(p.water));
    this.el.fd.classList.toggle('low', p.food < 15);
    this.el.wt.classList.toggle('low', p.water < 15);
    let st = '';
    if (p.bleed > 0) st += `<span class="bad"><i>${ICON.blood}</i>Кровь</span>`;
    if (p.infect > 0) st += `<span class="bad"><i>${ICON.bio}</i>${Math.round(p.infect * 100)}%</span>`;
    if (p.eq.body) st += `<span><i>${ICON.shield}</i>${Math.round(p.eq.body.dur)}</span>`;
    if (st !== this._st) { this.el.status.innerHTML = st; this._st = st; }
    // задания
    const tl = g.quests.trackerLines().map(l => `<div class="${l.ready ? 'ready' : ''}"><b>${esc(l.title)}</b>${esc(l.text)}</div>`).join('');
    if (tl !== this._tl) { this.el.tracker.innerHTML = tl; this._tl = tl; }
    // часы
    const hh = Math.floor(g.hour), mm = Math.floor((g.hour % 1) * 60);
    const clock = `День ${g.day + 1} · ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (clock !== this._clock) { this.el.clock.textContent = clock; this._clock = clock; }
    // компас: yaw камеры, 0 = север (-z)
    const head = ((-p.camYaw * 180 / Math.PI) % 360 + 360) % 360;
    this.el.cstrip.style.transform = `translateX(${-head / 360 * 100}%)`;
    const mk = g.quests.markers()[0];
    if (mk) {
      const a = Math.atan2(mk.x - p.pos.x, -(mk.z - p.pos.z)) * 180 / Math.PI;
      let d = ((a - head + 540) % 360) - 180;
      const vis = Math.abs(d) < 75;
      this.el.cmark.style.display = 'block';
      this.el.cmark.style.left = (50 + Math.max(-48, Math.min(48, d / 75 * 50))) + '%';
      this.el.cmark.classList.toggle('edge', !vis);
      this.el.cmark.textContent = Math.round(Math.hypot(mk.x - p.pos.x, mk.z - p.pos.z)) + ' м';
    } else this.el.cmark.style.display = 'none';
    // оружие
    const w = p.weapon, it = p.weaponItem;
    let wn = w ? w.name : 'Кулаки', wa = '', cls = '';
    if (w && w.mag && it) { wa = `${it.mag}<small> / ${p.ammoCount(w.ammo)}</small>`; if (!it.mag) cls = 'empty'; }
    else if (w && w.throw && it) wa = '× ' + it.n;
    else if (w && w.melee) wa = '<small>ближний бой</small>';
    if (p.reloading > 0) { wa = 'перезарядка'; cls = 'rel'; }
    const wid = (it && it.id) || 'fists';
    const key = wn + wa + wid + cls;
    if (key !== this._w) {
      this.el.wn.textContent = wn; this.el.wa.innerHTML = wa; this.el.wa.className = cls;
      if (wid !== this._wid) { this.el.wico.innerHTML = WICON[wid] || WICON.fists; this._wid = wid; }
      // патроны в магазине точками (до 30)
      const mag = w && w.mag && it ? w.mag : 0;
      this.el.pips.innerHTML = mag ? Array.from({ length: Math.min(30, mag) }, (_, i) => `<i class="${i < it.mag ? '' : 'off'}"></i>`).join('') : '';
      this._w = key;
    }
    // полоска слотов 1–5
    const sk = SLOTS.map(s => (p.eq[s] ? p.eq[s].id : '') + (p.cur === s ? '*' : '')).join(',');
    if (sk !== this._slots) {
      this._slots = sk;
      this.el.slots.innerHTML = SLOTS.map((s, i) => { const id = p.eq[s] ? p.eq[s].id : (s === 'melee' ? 'fists' : null); return `<div class="${p.cur === s ? 'on' : ''} ${id ? '' : 'none'}"><b>${i + 1}</b>${id ? WICON[id] || '' : ''}</div>`; }).join('');
    }
    // транспорт
    const v = p.vehicle;
    this.el.veh.classList.toggle('hide', !v);
    document.body.classList.toggle('inveh', !!v);
    if (v) {
      this.el.vn.textContent = v.name;
      let s = Math.round(Math.abs(v.speed) * 3.6) + ' км/ч';
      if (v.kind === 'plane') s += ` · высота ${Math.max(0, Math.round(v.pos.y))} м · тяга ${Math.round(v.throttle * 100)}%`;
      this.el.vs.textContent = s;
      pct(this.el.fl, v.fuel * 100); pct(this.el.vh, v.hp / v.maxHp * 100);
    }
    // прицел: разброс
    const spread = w && !w.melee ? (w.spread || 0) + p.spread : 0;
    const gap = 4 + spread * 300 * (p.aiming ? 0.45 : 1) + (p.sprinting ? 6 : 0);
    if (gap !== this._gap) { this.el.cross.style.setProperty('--gap', gap + 'px'); this._gap = gap; }
    this.el.cross.classList.toggle('hide', !!v || (w && w.melee && !p.aiming));
    this.el.cross.classList.toggle('scope', !!(p.aiming && w && w.scope));
    this.hitT = Math.max(0, this.hitT - dt);
    this.el.hitm.style.opacity = this.hitT > 0 ? 1 : 0;
    // ранение
    this.hurtV = Math.max(p.hp < 25 ? 0.35 + Math.sin(g.time * 4) * 0.1 : 0, this.hurtV - dt * 1.2);
    // ранение рисует пост-проход: красные края, капли крови, серость при малом здоровье
    this.bloodV = Math.max(0, (this.bloodV || 0) - dt * 0.22);
    const U = g.renderer.postMat.uniforms;
    U.hurt.value = this.hurtV; U.blood.value = Math.min(1, this.bloodV); U.low.value = Math.max(0, Math.min(1, (35 - p.hp) / 35));
    this.el.hurt.style.opacity = 0;
    // использование предмета
    if (p.using) {
      this.el.usebar.classList.remove('hide');
      this.el.usebar.firstChild.style.width = (100 - p.using.t / p.using.total * 100) + '%';
      this.el.usebar.lastChild.textContent = ITEMS[p.using.item.id].name;
    } else if (p.searching) {
      this.el.usebar.classList.remove('hide');
      this.el.usebar.firstChild.style.width = Math.min(100, p.searching.t / p.searching.total * 100) + '%';
      this.el.usebar.lastChild.textContent = 'Обыскиваю: ' + p.searching.label.toLowerCase();
    } else this.el.usebar.classList.add('hide');
    // миникарта (раз в 3 кадра) и район
    if (g.frame % 3 === 0) this.drawMini();
    this.updateTouch();
  }

  // ---------- карта ----------
  bakeMap() {
    const P = this.g.plan;
    const S = 2048, span = WORLD * 2 + 200, k = S / span;
    const c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    const X = v => (v + span / 2) * k;
    x.fillStyle = '#3c4536'; x.fillRect(0, 0, S, S);
    x.fillStyle = '#26323a'; x.fillRect(X(COAST_X), 0, S, S);
    const BC = { downtown: '#55574f', residential: '#3f4a38', industrial: '#504d47', port: '#4d4d49', park: '#36502e', camp: '#5b5240' };
    for (const b of P.blocks) { x.fillStyle = BC[b.d] || '#444'; const hh = (PITCH - ROAD) / 2; x.fillRect(X(b.cx - hh), X(b.cz - hh), hh * 2 * k, hh * 2 * k); }
    // заражённые кварталы: красная штриховка, гуще там, где кишит (выжившие знают, куда лучше не соваться)
    for (const b of P.blocks) {
      if (!(b.inf >= 2)) continue;
      const hh = (PITCH - ROAD) / 2, x0 = X(b.cx - hh), y0 = X(b.cz - hh), w = hh * 2 * k;
      x.save(); x.beginPath(); x.rect(x0, y0, w, w); x.clip();
      x.strokeStyle = b.inf === 3 ? 'rgba(170,40,30,0.55)' : 'rgba(170,60,40,0.3)'; x.lineWidth = b.inf === 3 ? 3 : 2;
      for (let t = -w; t < w; t += b.inf === 3 ? 7 : 11) { x.beginPath(); x.moveTo(x0 + t, y0); x.lineTo(x0 + t + w, y0 + w); x.stroke(); }
      x.restore();
    }
    x.fillStyle = '#2b2d30';
    for (let i = 0; i <= N; i++) { const l = streetLine(i); x.fillRect(X(l - ASPHALT / 2), X(-HALF), ASPHALT * k, HALF * 2 * k); x.fillRect(X(-HALF), X(l - ASPHALT / 2), HALF * 2 * k, ASPHALT * k); }
    x.strokeStyle = '#2b2d30'; x.lineWidth = ASPHALT * k;
    for (const pr of P.props) if (pr.special === 'road') { x.beginPath(); x.moveTo(X(pr.x0), X(pr.z0)); x.lineTo(X(pr.x1), X(pr.z1)); x.stroke(); }
    const af = P.airfield; x.fillStyle = '#2f3134'; if (af) x.fillRect(X(af.x - af.w / 2), X(af.z - af.len / 2), af.w * k, af.len * k);
    const ml = P.military; x.strokeStyle = '#6a6a50'; x.lineWidth = 2; x.strokeRect(X(ml.x - ml.w / 2), X(ml.z - ml.d / 2), ml.w * k, ml.d * k);
    x.fillStyle = '#707068';
    for (const b of P.buildings) { const w = b.w || 10, d = b.d || 10; x.save(); x.translate(X(b.x), X(b.z)); x.rotate(-b.ry); x.fillRect(-w / 2 * k, -d / 2 * k, w * k, d * k); x.restore(); }
    x.fillStyle = '#9a8a6a';
    for (const s of P.shells) { x.save(); x.translate(X(s.x), X(s.z)); x.rotate(-s.ry); x.fillRect(-s.w / 2 * k, -s.d / 2 * k, s.w * k, s.d * k); x.restore(); }
    x.fillStyle = '#6a5a40';
    for (const pr of P.props) if (pr.special === 'pier') x.fillRect(X(pr.x - pr.w / 2), X(pr.z - pr.d / 2), pr.w * k, pr.d * k);
    this.mapImg = c; this.mapK = k; this.mapSpan = span;
  }

  w2m(x, z) { return [(x + this.mapSpan / 2) * this.mapK, (z + this.mapSpan / 2) * this.mapK]; }

  drawMini() {
    const g = this.g, p = g.player;
    if (!this.mapImg) return;
    const c = this.el.mmc, x = c.getContext('2d');
    const W = c.width, R = 70; // метров на радиус
    const sc = W / 2 / R / this.mapK;
    x.save();
    x.fillStyle = '#1b1f22'; x.fillRect(0, 0, W, W);
    x.translate(W / 2, W / 2);
    x.rotate(p.camYaw);
    x.scale(sc, sc);
    const [mx, mz] = this.w2m(p.pos.x, p.pos.z);
    x.translate(-mx, -mz);
    x.imageSmoothingEnabled = false;
    x.drawImage(this.mapImg, 0, 0);
    // метки
    const dot = (wx, wz, col, r) => { const [a, b] = this.w2m(wx, wz); x.fillStyle = col; x.beginPath(); x.arc(a, b, r / sc, 0, 7); x.fill(); };
    for (const v of g.vehicles.list) if (v.hp > 0 && !v.driven && Math.abs(v.pos.x - p.pos.x) < 90 && Math.abs(v.pos.z - p.pos.z) < 90) dot(v.pos.x, v.pos.z, '#8fb0c8', 2.5);
    for (const z of g.zombies.list) if (!z.dead && z.state === 'chase') dot(z.pos.x, z.pos.z, '#c05050', 2);
    for (const m of g.quests.markers()) dot(m.x, m.z, '#ffb050', 4);
    for (const n of g.quests.npcs) dot(n.x, n.z, '#e0d0a0', 2);
    x.restore();
    // игрок
    x.fillStyle = '#ffd890';
    x.beginPath(); x.moveTo(W / 2, W / 2 - 7); x.lineTo(W / 2 - 5, W / 2 + 5); x.lineTo(W / 2 + 5, W / 2 + 5); x.fill();
    const d = DISTRICT_NAMES[districtAt(g.plan, p.pos.x, p.pos.z)] || '';
    if (d !== this._d) { this.el.mmd.textContent = d; this._d = d; }
  }

  drawMap(cv) {
    const g = this.g, p = g.player;
    const x = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const base = Math.min(W, H) / this.mapImg.width;
    const sc = base * this.mapZoom;
    const [cx, cz] = this.w2m(this.mapPan.x, this.mapPan.z);
    x.fillStyle = '#15191c'; x.fillRect(0, 0, W, H);
    x.save();
    x.translate(W / 2, H / 2); x.scale(sc, sc); x.translate(-cx, -cz);
    x.imageSmoothingEnabled = this.mapZoom < 2;
    x.drawImage(this.mapImg, 0, 0);
    const lbl = (wx, wz, text, col, r = 4) => {
      const [a, b] = this.w2m(wx, wz);
      x.fillStyle = col; x.beginPath(); x.arc(a, b, r / sc, 0, 7); x.fill();
      if (text) { x.font = `${14 / sc}px PX, monospace`; x.fillStyle = '#e8e2d0'; x.fillText(text, a + 6 / sc, b + 4 / sc); }
    };
    for (const poi of g.plan.pois) lbl(poi.x, poi.z, this.mapZoom > 1.5 || ['camp', 'airfield', 'military', 'port'].includes(poi.type) ? poi.name : '', poi.type === 'camp' ? '#ffb050' : '#b8b0a0', 3);
    for (const v of g.vehicles.list) if (v.hp > 0) lbl(v.pos.x, v.pos.z, this.mapZoom > 2.5 ? v.name : '', '#8fb0c8', 2.5);
    for (const d of g.loot.drops) if (d.kind === 'death') lbl(d.x, d.z, 'Твой рюкзак', '#e07050', 4);
    for (const m of g.quests.markers()) lbl(m.x, m.z, m.title, '#ffb050', 5);
    x.restore();
    const [px, pz] = this.w2m(p.pos.x, p.pos.z);
    const sx = (px - cx) * sc + W / 2, sz = (pz - cz) * sc + H / 2;
    x.save(); x.translate(sx, sz); x.rotate(-p.camYaw);
    x.fillStyle = '#ffd890'; x.beginPath(); x.moveTo(0, -9); x.lineTo(-6, 6); x.lineTo(6, 6); x.fill(); x.restore();
  }

  // ---------- экраны ----------
  toggle(name) { if (this.open === name) this.close(); else this.show(name); }

  show(name, arg) {
    const g = this.g;
    if (g.state !== 'play' && !['menu', 'settings', 'help', 'death', 'hero', 'credits'].includes(name)) return;
    this.open = name;
    this.arg = arg;
    this.sel = null;
    clearAll();
    exitLock();
    this.el.scr.classList.remove('hide');
    this.el.scr.className = 'scr-' + name;
    document.body.classList.add('scr-open');
    this.render();
    audio.play('click', null, { vol: 0.4 });
    this.updateLockHint();
  }

  close() {
    const g = this.g;
    if (this.open === 'loot') g.loot.cleanup();
    if (this.open === 'menu' || this.open === 'death') return;
    this.open = null;
    this.el.scr.classList.add('hide');
    document.body.classList.remove('scr-open');
    clearAll();
    if (!Input.isTouch && g.state === 'play') requestLock();
    this.updateLockHint();
  }

  render() {
    const f = this['scr_' + this.open];
    if (f) f.call(this, this.el.card);
  }

  // кнопка с обработчиком
  b(label, fn, cls = '') {
    const e = h('button', cls, label);
    e.addEventListener('click', ev => { ev.stopPropagation(); audio.play('click', null, { vol: 0.4 }); fn(); });
    return e;
  }

  scr_menu(c) {
    const g = this.g;
    c.innerHTML = `<h1>Завтра не наступит</h1><p class="sub">В городе что-то случилось. Живых осталось немного, и ты один из них.</p>`;
    const row = h('div', 'col');
    if (g.hasSave()) row.appendChild(this.b('Продолжить', () => g.start(false), 'warm'));
    row.appendChild(this.b(g.hasSave() ? 'Новая игра' : 'Начать', () => {
      if (g.hasSave() && !confirm('Начать заново? Прогресс будет потерян.')) return;
      this.show('hero');
    }, g.hasSave() ? '' : 'warm'));
    row.appendChild(this.b('Настройки', () => { this.back = 'menu'; this.show('settings'); }));
    row.appendChild(this.b('Управление', () => { this.back = 'menu'; this.show('help'); }));
    row.appendChild(this.b('Авторы', () => { this.back = 'menu'; this.show('credits'); }));
    c.appendChild(row);
  }

  // титры: строки CC BY обязательны по лицензии
  scr_credits(c) {
    c.innerHTML = `<h2>Авторы</h2><div class="help"><div>
      <p>PSX Creatures Free by heyheythere, heyheythere.itch.io/psx-creatures-free, CC BY 4.0</p>
      <p>PSX People Free by heyheythere, heyheythere.itch.io/psx-people-free, CC BY 4.0</p>
      <p>PSX Post-Apocalypse Kit Free by heyheythere, heyheythere.itch.io/psx-post-apocalypse-kit-free, CC BY 4.0</p>
      <p>Окружение: ALEX, valsekamerplant, GGBotNet, Elegant Crow, EgorZuyev, Kkryy, Elbolilloduro (CC0)</p>
      <p>PSX Horror UI Free by heyheythere, heyheythere.itch.io/psx-horror-ui-free, CC BY 4.0</p>
      <p>Дома и мусор: najjar320 (PS1 House Pack), McSteeg (Trash and Debris), Daniel Jurys (PSX Waste, PSX Derelict Furniture)</p>
      <p>Лагерь и вещи: 3Dexter (Demolished Campground), Retro Assets Library (PSX Med Pack, PSX Chainsaw), DDV23 (Jerry Can), Amos Makes (PSX Tools), Drops (Rocks PSX)</p>
      <p>Characters PSX: Elbolilloduro (elbolilloduro.itch.io)</p>
      <p>Модели и анимации: Quaternius (CC0), Kenney (CC0)</p>
      <p>Звуки: Kenney, artisticdude, domasx2, Tabasco, SpringySpringo и авторы The Free Firearm Sound Library (CC0)</p>
      <p>Движок: three.js (MIT)</p></div></div>`;
    c.appendChild(this.b('Назад', () => this.show(this.back || 'menu'), 'warm'));
  }

  // выбор героя перед новой игрой: модель стоит у костра, листаем стрелками
  scr_hero(c) {
    const g = this.g, list = g.heroList();
    let i = Math.max(0, list.indexOf(g.player.charKey));
    if (list[i] !== g.player.charKey) g.setHero(list[i]);
    c.innerHTML = '<h2>Кем будешь?</h2>';
    const row = h('div', 'row hero');
    const name = h('b', 'hname', '');
    const who = h('p', 'role', ''), bio = h('p', 'say herobio', ''), kit = h('p', 'sub herokit', '');
    // имя, возраст и история героя (js/heroes.js)
    const fill = () => {
      const H = HEROES[list[i]];
      name.textContent = H ? H.name : heroName(list[i]);
      who.textContent = H ? (H.age ? H.age + ' лет, ' : 'возраст неизвестен, ') + H.who : '';
      bio.textContent = H ? H.bio : 'О себе не рассказывает.';
      kit.textContent = H && H.kit ? 'С собой: ' + H.kit.map(([id, n]) => ITEMS[id].name.toLowerCase() + (n > 1 && !/^ammo_/.test(id) ? ' ×' + n : '')).join(', ') : '';
    };
    const go = d => { i = (i + d + list.length) % list.length; g.setHero(list[i]); fill(); audio.play('click', null, { vol: 0.4 }); };
    row.appendChild(this.b('‹', () => go(-1)));
    row.appendChild(name);
    row.appendChild(this.b('›', () => go(1)));
    c.appendChild(row);
    c.appendChild(who); c.appendChild(bio); c.appendChild(kit);
    fill();
    c.appendChild(h('p', 'sub', (i + 1) + ' из ' + list.length + '. Список героев: tools/pick_chars.html'));
    const r2 = h('div', 'col');
    r2.appendChild(this.b('Начать', () => g.start(true), 'warm'));
    r2.appendChild(this.b('Назад', () => this.show('menu')));
    c.appendChild(r2);
  }

  scr_pause(c) {
    const g = this.g;
    c.innerHTML = `<h2>Пауза</h2><p class="sub">Убито зомби: ${g.player.kills} · День ${g.day + 1}</p>`;
    const row = h('div', 'col');
    row.appendChild(this.b('Продолжить', () => this.close(), 'warm'));
    row.appendChild(this.b('Задания', () => this.show('quests')));
    row.appendChild(this.b('Карта', () => this.show('map')));
    row.appendChild(this.b('Настройки', () => { this.back = 'pause'; this.show('settings'); }));
    row.appendChild(this.b('Управление', () => { this.back = 'pause'; this.show('help'); }));
    row.appendChild(this.b('Тестовый стенд (F10)', () => this.show('admin')));
    row.appendChild(this.b('Сохранить и выйти в меню', () => { g.save(); g.toMenu(); }));
    c.appendChild(row);
  }

  // тестовый стенд (F10 или пауза): всё оружие и предметы, спавн врагов перед героем, время, бессмертие, машина рядом
  scr_admin(c) {
    const g = this.g, p = g.player;
    c.innerHTML = '<h2>Тестовый стенд</h2><p class="sub">Для проверки. Сохранение не портится только тем, что ты сам возьмёшь.</p>';
    const sec = (title) => { const d = h('div', 'set'); d.appendChild(h('b', '', title)); const r = h('div', 'row'); d.appendChild(r); c.appendChild(d); return r; };
    const give = (id, n = 1) => {
      if (!p.eq.bag || ITEMS[p.eq.bag.id].slots < 28) { p.eq.bag = { id: 'bag_l', n: 1, dur: 1 }; p.resizeInv(); }
      const w = WEAPONS[id];
      g.giveOrDrop(Object.assign({ id, n }, w && w.mag ? { mag: w.mag } : {}));
      if (w && w.ammo) g.giveOrDrop({ id: 'ammo_' + w.ammo, n: 60 });
      audio.play('pickup', null, { vol: 0.4 });
      this.toast('Выдано: ' + ITEMS[id].name + (n > 1 ? ' ×' + n : ''));
    };
    const wr = sec('Оружие (с патронами)');
    for (const id of Object.keys(WEAPONS)) if (id !== 'fists') wr.appendChild(this.b(WEAPONS[id].name, () => give(id, WEAPONS[id].throw ? 5 : 1)));
    const ir = sec('Предметы');
    for (const [id, n] of [['medkit', 2], ['bandage', 5], ['pills', 3], ['antidote', 2], ['canned', 3], ['water', 3], ['energy', 2], ['vest', 1], ['fuel', 2], ['battery', 2], ['parts', 5], ['scrap', 20], ['cloth', 6]])
      ir.appendChild(this.b(ITEMS[id].name + (n > 1 ? ' ×' + n : ''), () => give(id, n)));
    const sr = sec('Враг в 8 м перед тобой');
    const spawn = (type, o = {}) => {
      const x = p.pos.x - Math.sin(p.yaw) * 8, z = p.pos.z - Math.cos(p.yaw) * 8;
      const zb = g.zombies.spawnAt(type, x, z, Object.assign({ guard: true }, o));
      zb.state = 'chase'; zb.alertT = 10; zb.target = p.pos;
      this.close();
    };
    for (const [t, n] of [['walker', 'Ходок'], ['runner', 'Бегун'], ['fat', 'Толстяк'], ['boss', 'Мясник']]) sr.appendChild(this.b(n, () => spawn(t)));
    for (const [wpn, n] of [['knife', 'Культист с ножом'], ['axe', 'Культист с топором'], ['chainsaw', 'Культист с бензопилой'], ['pistol', 'Культист с пистолетом']]) sr.appendChild(this.b(n, () => spawn('cultist', { weapon: wpn })));
    sr.appendChild(this.b('Толпа из 8', () => { for (let i = 0; i < 8; i++) { const a = Math.random() * 6.28; const zb = g.zombies.spawnAt('walker', p.pos.x + Math.cos(a) * 12, p.pos.z + Math.sin(a) * 12, { guard: true }); zb.state = 'chase'; zb.alertT = 10; zb.target = p.pos; } this.close(); }));
    sr.appendChild(this.b('Убрать всех', () => { g.zombies.clear(); this.toast('Чисто'); }));
    const tr = sec('Время и герой');
    for (const [hh, n] of [[7, 'Утро'], [13, 'День'], [19.5, 'Вечер'], [1, 'Ночь']]) tr.appendChild(this.b(n, () => { g.hour = hh; this.toast(n); }));
    tr.appendChild(this.b(p.god ? 'Бессмертие: вкл' : 'Бессмертие: выкл', () => { p.god = !p.god; this.render(); }, p.god ? 'on' : ''));
    tr.appendChild(this.b('Полное здоровье', () => { p.hp = 100; p.stam = 100; p.food = 100; p.water = 100; p.bleed = 0; p.infect = 0; this.toast('Как новенький'); }));
    tr.appendChild(this.b('Машина рядом', () => {
      const v = g.vehicles.list.filter(v => v.kind === 'car' && v.hp > 0 && !v.driven).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
      if (!v) return;
      v.pos.set(p.pos.x - Math.sin(p.yaw) * 5, 0, p.pos.z - Math.cos(p.yaw) * 5); v.yaw = p.yaw; v.fuel = 1; v.hp = v.maxHp; v.speed = 0; v.updateBoxes();
      this.toast(v.name + ' рядом, бак полный'); this.close();
    }));
    c.appendChild(this.b('Закрыть', () => this.close(), 'warm'));
  }

  scr_help(c) {
    c.innerHTML = `<h2>Управление</h2>
      <div class="help"><div><b>Клавиатура и мышь</b>
      <p>WASD ходить, Shift бег, C присесть, Пробел прыжок</p>
      <p>ЛКМ стрелять, ПКМ целиться, R перезарядка, V сменить плечо</p>
      <p>1–5 или колесо: оружие, Q метательное, F фонарь</p>
      <p>E взять, обыскать, сесть в машину, поговорить</p>
      <p>H лечиться, G есть, B пить</p>
      <p>Tab вещи, M карта, J задания, Esc пауза</p>
      <p>В машине: W газ, S тормоз и назад, Пробел ручник, X сигнал</p>
      <p>В самолёте: W и S тяга, мышь задаёт курс. Разгонись до 100 км/ч и подними камеру</p></div>
      <div><b>Телефон</b>
      <p>Левая половина экрана: ходьба. Дотяни джойстик до края, чтобы бежать</p>
      <p>Правая половина: поворот камеры. Кнопка «Огонь» тоже крутит камеру</p></div>
      <div><b>Как выжить</b>
      <p>Выстрелы слышно далеко. Нож и бита тише. Присев, ты заметен хуже</p>
      <p>Ночью зомби больше и они быстрее. Спальник в лагере пропускает ночь</p>
      <p>Если погибнешь, рюкзак останется на месте. Его можно забрать</p></div></div>`;
    c.appendChild(this.b('Назад', () => this.show(this.back || 'pause'), 'warm'));
  }

  scr_settings(c) {
    const g = this.g, s = g.settings;
    c.innerHTML = '<h2>Настройки</h2>';
    const sec = (title) => { const d = h('div', 'set'); d.appendChild(h('b', '', title)); c.appendChild(d); return d; };
    const st = sec('Графика');
    const row = h('div', 'row');
    for (const k of ['hyb', 'ps1']) row.appendChild(this.b(STYLES[k].name, () => { s.style = k; g.applySettings(); this.render(); }, s.style === k ? 'on' : ''));
    st.appendChild(row);
    const q = sec('Качество');
    const qr = h('div', 'row');
    for (const [v, n] of [[0.6, 'Низкое'], [0.8, 'Среднее'], [1, 'Высокое']]) qr.appendChild(this.b(n, () => { s.quality = v; g.applySettings(); this.render(); }, s.quality === v ? 'on' : ''));
    q.appendChild(qr);
    const rng = (title, key, min, max, step) => {
      const d = sec(title);
      const i = h('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = s[key];
      i.addEventListener('input', () => { s[key] = +i.value; g.applySettings(); });
      d.appendChild(i);
    };
    rng('Чувствительность', 'sens', 0.3, 2.5, 0.05);
    rng('Громкость', 'volume', 0, 1, 0.05);
    const inv = sec('Инверсия по вертикали');
    inv.appendChild(this.b(s.invertY ? 'Включена' : 'Выключена', () => { s.invertY = !s.invertY; g.applySettings(); this.render(); }, s.invertY ? 'on' : ''));
    c.appendChild(this.b('Назад', () => this.show(this.back || 'pause'), 'warm'));
  }

  scr_quests(c) {
    const g = this.g;
    c.innerHTML = '<h2>Задания</h2>';
    const lines = g.quests.trackerLines();
    if (!lines.length) c.appendChild(h('p', 'sub', 'Активных заданий нет. Поговори с жителями лагеря.'));
    for (const l of lines) c.appendChild(h('div', 'qline' + (l.ready ? ' ready' : ''), `<b>${esc(l.title)}</b><span>${esc(l.text)}</span>`));
    c.appendChild(this.b('Закрыть', () => this.close(), 'warm'));
  }

  scr_map(c) {
    const g = this.g;
    c.innerHTML = '';
    const cv = h('canvas', 'map');
    c.appendChild(cv);
    this.mapPan = { x: g.player.pos.x, z: g.player.pos.z };
    const fit = () => { const r = cv.getBoundingClientRect(); cv.width = Math.max(200, r.width | 0); cv.height = Math.max(200, r.height | 0); this.drawMap(cv); };
    requestAnimationFrame(fit);
    let drag = null;
    cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => {
      if (!drag) return;
      const k = this.mapSpan / (Math.min(cv.width, cv.height) * this.mapZoom) * (cv.width / cv.getBoundingClientRect().width);
      this.mapPan.x -= (e.clientX - drag.x) * k; this.mapPan.z -= (e.clientY - drag.y) * k;
      drag = { x: e.clientX, y: e.clientY }; this.drawMap(cv);
    });
    cv.addEventListener('pointerup', () => drag = null);
    cv.addEventListener('wheel', e => { this.mapZoom = Math.max(1, Math.min(8, this.mapZoom * (e.deltaY < 0 ? 1.25 : 0.8))); this.drawMap(cv); }, { passive: true });
    const row = h('div', 'row');
    row.appendChild(this.b('+', () => { this.mapZoom = Math.min(8, this.mapZoom * 1.5); this.drawMap(cv); }));
    row.appendChild(this.b('−', () => { this.mapZoom = Math.max(1, this.mapZoom / 1.5); this.drawMap(cv); }));
    row.appendChild(this.b('Я', () => { this.mapPan = { x: g.player.pos.x, z: g.player.pos.z }; this.drawMap(cv); }));
    row.appendChild(this.b('Закрыть', () => this.close(), 'warm'));
    c.appendChild(row);
  }

  scr_death(c) {
    const g = this.g;
    c.innerHTML = `<h2 class="bad">Ты погиб</h2><p class="sub">Рюкзак со всеми вещами остался на месте гибели, он отмечен на карте. Ты очнёшься в лагере.</p>`;
    c.appendChild(this.b('Очнуться в лагере', () => { this.open = null; this.el.scr.classList.add('hide'); document.body.classList.remove('scr-open'); g.respawn(); }, 'warm'));
  }

  // ----- предметы -----
  cell(it, opts = {}) {
    const e = h('div', 'cell' + (opts.sel ? ' sel' : '') + (it ? '' : ' empty'));
    if (it) {
      const d = ITEMS[it.id];
      e.style.setProperty('--k', KIND_COL[d.kind] || '#444');
      let sub = '';
      if (it.n > 1) sub = '×' + it.n;
      else if (WEAPONS[it.id] && WEAPONS[it.id].mag) sub = it.mag + '/' + WEAPONS[it.id].mag;
      else if (it.dur !== undefined) sub = Math.round(it.dur);
      e.innerHTML = `<span>${esc(d.name)}</span><small>${sub}</small>`;
    } else if (opts.label) e.innerHTML = `<span class="lbl">${esc(opts.label)}</span>`;
    if (opts.click) e.addEventListener('click', ev => { ev.stopPropagation(); opts.click(); });
    return e;
  }

  scr_inv(c) {
    const g = this.g, p = g.player;
    c.innerHTML = `<h2>Вещи</h2>`;
    const eq = h('div', 'eq');
    for (const s of [...SLOTS, 'body', ...(p.eq.head ? ['head'] : []), 'bag']) { // голову показываем, только если каска осталась из старого сохранения
      const it = p.eq[s];
      const cell = this.cell(it, { label: EQ_NAMES[s], sel: this.sel && this.sel.eq === s, click: () => { this.sel = it ? { eq: s } : null; this.render(); } });
      const t = h('div', 'eqs'); t.appendChild(h('i', '', EQ_NAMES[s])); t.appendChild(cell);
      eq.appendChild(t);
    }
    c.appendChild(eq);
    c.appendChild(h('p', 'sub', `Карманы и рюкзак: ${p.inv.cap - p.inv.freeSlots()} / ${p.inv.cap}`));
    const grid = h('div', 'grid');
    p.inv.slots.forEach((it, i) => grid.appendChild(this.cell(it, { sel: this.sel && this.sel.i === i, click: () => { this.sel = it ? { i } : null; this.render(); } })));
    c.appendChild(grid);
    // действия с выбранным
    const act = h('div', 'row act');
    const sel = this.sel;
    if (sel) {
      const it = sel.eq ? p.eq[sel.eq] : p.inv.slots[sel.i];
      if (it) {
        const d = ITEMS[it.id];
        act.appendChild(h('div', 'iname', esc(d.name) + this.itemInfo(it)));
        if (sel.i !== undefined) {
          if (d.kind === 'med' || d.kind === 'food') act.appendChild(this.b('Использовать', () => { g.useItem(it.id); this.close(); }, 'warm'));
          if (d.kind === 'weapon' || d.kind === 'gear') act.appendChild(this.b('Взять в руки', () => { g.equipFromInv(sel.i); this.sel = null; this.render(); }, 'warm'));
          act.appendChild(this.b('Выбросить', () => { g.dropFromInv(sel.i); this.sel = null; this.render(); }));
        } else {
          act.appendChild(this.b('Снять', () => { g.unequip(sel.eq); this.sel = null; this.render(); }));
          act.appendChild(this.b('Выбросить', () => { g.dropEq(sel.eq); this.sel = null; this.render(); }));
        }
      }
    }
    c.appendChild(act);
    c.appendChild(this.b('Закрыть', () => this.close(), 'warm'));
  }

  itemInfo(it) {
    const d = ITEMS[it.id], w = WEAPONS[it.id];
    let s = '';
    if (w && !w.melee && !w.throw) s = `урон ${w.dmg}${w.pellets ? '×' + w.pellets : ''}, магазин ${w.mag}, ${ITEMS['ammo_' + w.ammo].name.toLowerCase()}`;
    else if (w && w.melee) s = `урон ${w.dmg}, бесшумно`;
    else if (w && w.throw) s = w.fire ? 'поджигает всё вокруг' : `урон ${w.dmg} по площади`;
    else if (d.heal) s = `+${d.heal} здоровья${d.stopBleed ? ', останавливает кровь' : ''}`;
    else if (d.cure) s = 'лечит заражение';
    else if (d.regen) s = `+${d.regen} здоровья постепенно`;
    else if (d.food || d.water) s = [d.food > 0 ? `сытость +${d.food}` : '', d.water > 0 ? `вода +${d.water}` : ''].filter(Boolean).join(', ');
    else if (d.slots) s = `${d.slots} ячеек`;
    else if (d.armor) s = `защита ${Math.round(d.armor * 100)}%`;
    else if (d.kind === 'fuel') s = 'заправить машину или генератор';
    else if (d.kind === 'mat') s = 'для верстака и торговли';
    else if (d.kind === 'quest') s = 'нужно для задания';
    return s ? `<small>${esc(s)}</small>` : '';
  }

  // окно обыска: arg = {title, items (массив, меняется на месте), put:bool, cap?}
  scr_loot(c) {
    const g = this.g, p = g.player, a = this.arg;
    c.innerHTML = `<h2>${esc(a.title)}</h2>`;
    const cols = h('div', 'cols');
    const left = h('div', 'pane');
    left.appendChild(h('b', '', a.items.length ? 'Здесь лежит' : 'Пусто'));
    a.items.forEach((it, i) => {
      left.appendChild(this.cell(it, { click: () => {
        const rest = p.give(it);
        if (rest && rest.n === it.n) { this.toast('Нет места'); audio.play('err', null, { vol: 0.4 }); return; }
        audio.play('pickup', null, { vol: 0.5 });
        if (rest) a.items[i] = rest; else a.items.splice(i, 1);
        g.onPickup(it);
        this.render();
      } }));
    });
    cols.appendChild(left);
    if (a.put) {
      const right = h('div', 'pane');
      right.appendChild(h('b', '', `Твои вещи (${p.inv.cap - p.inv.freeSlots()}/${p.inv.cap})`));
      p.inv.slots.forEach((it, i) => {
        if (!it) return;
        right.appendChild(this.cell(it, { click: () => {
          if (a.cap && a.items.length >= a.cap && !a.items.some(x => x.id === it.id && ITEMS[x.id].stack > x.n)) { this.toast('Тайник полон'); return; }
          const ex = a.items.find(x => x.id === it.id && ITEMS[x.id].stack > 1);
          if (ex) ex.n += it.n; else a.items.push(Object.assign({}, it));
          p.inv.removeAt(i);
          this.render();
        } }));
      });
      cols.appendChild(right);
    }
    c.appendChild(cols);
    const row = h('div', 'row');
    if (a.items.length) row.appendChild(this.b('Взять всё', () => {
      for (let i = a.items.length - 1; i >= 0; i--) {
        const it = a.items[i];
        const rest = p.give(it);
        if (!rest) { a.items.splice(i, 1); g.onPickup(it); } else a.items[i] = rest;
      }
      if (a.items.length) this.toast('Не всё влезло');
      audio.play('bag', null, { vol: 0.5 });
      this.render();
    }));
    row.appendChild(this.b('Закрыть', () => this.close(), 'warm'));
    c.appendChild(row);
  }

  // диалог с жителем: он говорит, герой отвечает одним из вариантов (кнопки или 1–9), он отвечает в ответ.
  // Через разговор берутся и сдаются задания, лечение у Веры, торговля у Гоши, плюс обычные разговоры.
  scr_npc(c) {
    const g = this.g, n = this.arg, Q = g.quests;
    const npcSay = t => { this.dlg.log.push({ who: 'npc', t }); if (g.camp) g.camp.talk(n, 2 + t.length / 25); };
    const heroSay = t => this.dlg.log.push({ who: 'hero', t });
    if (!this.dlg || this.dlg.npc !== n) {
      Q.met = Q.met || {};
      const G = GREET[n.id] || GREET.chief;
      const t = !Q.met[n.id] ? G.first : g.player.hp < 45 ? G.hurt : pick(g.isNight() ? G.night : G.day);
      Q.met[n.id] = true;
      this.dlg = { npc: n, log: [], talk: [] };
      npcSay(t);
    }
    const D = this.dlg;
    c.innerHTML = `<h2>${esc(n.name)}</h2><p class="role">${esc((PEOPLE[n.id] ? PEOPLE[n.id].full + ', ' : '') + n.role.toLowerCase())}</p>`;
    const log = h('div', 'dlog');
    for (const e of D.log.slice(-3)) log.appendChild(h('p', e.who === 'npc' ? 'say' : 'hero', e.who === 'npc' ? esc(e.t) : 'Ты: ' + esc(e.t)));
    c.appendChild(log);
    const row = h('div', 'col dopts');
    const opts = [];
    const opt = (pool, fn, cls = '') => { const L = pick(pool); opts.push(this.b((opts.length + 1) + '. ' + L, () => { heroSay(L); fn(); this.render(); }, cls)); };
    const ready = Q.active.find(a => a.giver === n.id && a.state === 'ready');
    const act = Q.active.find(a => a.giver === n.id && a.state === 'active');
    const off = Q.offerFor(n.id);
    if (D.offer) {
      const o = D.offer;
      opt(HERO.accept, () => { Q.accept(o); npcSay(pick(NPC_ANS.accepted[n.id] || ['Договорились.'])); D.offer = null; }, 'warm');
      opt(HERO.decline, () => { npcSay(pick(NPC_ANS.declined[n.id] || ['Как знаешь.'])); D.offer = null; });
    } else {
      if (ready) opt(HERO.turnIn, () => { const d = Q.turnIn(n.id); if (d) npcSay(d.done); }, 'warm');
      else if (off) opt(HERO.job, () => { npcSay(off.def.offer); D.offer = off; }, 'warm');
      // напомнить — житель заново объясняет задание своими словами
      if (act) opt(HERO.remind, () => { const d = Q.def(act); npcSay(d.offer || d.brief + '.'); });
      if (n.id === 'medic') opt(HERO.heal, () => {
        if (!(Q.unlocked.medic !== false && Q.story > 1)) return npcSay(NPC_ANS.healLocked);
        if (Q.medDay === g.day) return npcSay(NPC_ANS.healedNot);
        const p = g.player; p.hp = 100; p.bleed = 0; p.infect = 0; Q.medDay = g.day;
        audio.play('ok', null, { vol: 0.5 }); npcSay(NPC_ANS.healed);
      });
      if (n.id === 'trader') opt(HERO.trade, () => { if (Q.unlocked.trader) { this.dlg = null; this.show('shop'); return; } npcSay(NPC_ANS.shopLocked); });
      const pool = TALK[n.id] || [];
      // рассказ о себе: по кусочку за раз, потом «хватит про меня»
      if (ABOUT[n.id]) opt(HERO.about, () => {
        Q.about = Q.about || {};
        const i = Q.about[n.id] || 0, parts = ABOUT[n.id];
        npcSay(i < parts.length ? parts[i] : ABOUT_END[n.id]);
        Q.about[n.id] = Math.min(parts.length, i + 1);
      });
      if (pool.length) opt(HERO.talk, () => {
        if (D.talk.length >= pool.length) D.talk = [];
        const left = pool.filter(t => !D.talk.includes(t)); const t = pick(left); D.talk.push(t); npcSay(t);
      });
      opt(pick(HERO.bye), () => { this.toast(n.name + ': ' + pick(BYE[n.id] || ['Давай.'])); this.dlg = null; this.close(); });
    }
    for (const b of opts) row.appendChild(b);
    this.dlgOpts = opts;
    c.appendChild(row);
  }

  scr_shop(c) {
    const g = this.g, p = g.player;
    const scrap = p.inv.count('scrap');
    c.innerHTML = `<h2>Лавка Гоши</h2><p class="sub">Платят металлоломом. У тебя: <b class="warmt">${scrap}</b></p>`;
    const cols = h('div', 'cols');
    const buy = h('div', 'pane'); buy.appendChild(h('b', '', 'Купить'));
    for (const s of SHOP) {
      const r = h('div', 'trow', `<span>${esc(ITEMS[s.id].name)}${s.n > 1 ? ' ×' + s.n : ''}</span>`);
      r.appendChild(this.b(s.price + ' лома', () => {
        if (p.inv.count('scrap') < s.price) { this.toast('Не хватает лома'); audio.play('err', null, { vol: 0.4 }); return; }
        p.inv.take('scrap', s.price);
        g.giveOrDrop({ id: s.id, n: s.n, mag: WEAPONS[s.id] && WEAPONS[s.id].mag ? WEAPONS[s.id].mag : undefined });
        audio.play('pickup', null, { vol: 0.5 }); this.render();
      }, p.inv.count('scrap') >= s.price ? '' : 'off'));
      buy.appendChild(r);
    }
    const sell = h('div', 'pane'); sell.appendChild(h('b', '', 'Продать'));
    p.inv.slots.forEach((it, i) => {
      if (!it || !SELL[it.id]) return;
      const r = h('div', 'trow', `<span>${esc(ITEMS[it.id].name)}${it.n > 1 ? ' ×' + it.n : ''}</span>`);
      r.appendChild(this.b('+' + SELL[it.id] * it.n, () => { const k = SELL[it.id] * it.n; p.inv.removeAt(i); g.giveOrDrop({ id: 'scrap', n: k }); audio.play('pickup', null, { vol: 0.5 }); this.render(); }));
      sell.appendChild(r);
    });
    cols.appendChild(buy); cols.appendChild(sell);
    c.appendChild(cols);
    c.appendChild(this.b('Закрыть', () => this.close(), 'warm'));
  }

  scr_bench(c) {
    const g = this.g, p = g.player;
    c.innerHTML = `<h2>Верстак</h2>`;
    const pane = h('div', 'pane wide');
    for (const r of RECIPES) {
      const ok = r.need.every(([id, n]) => p.inv.count(id) >= n);
      const need = r.need.map(([id, n]) => `${ITEMS[id].name} ${p.inv.count(id)}/${n}`).join(', ');
      const row = h('div', 'trow', `<span><b>${esc(ITEMS[r.out.id].name)}${r.out.n > 1 ? ' ×' + r.out.n : ''}</b><small>${esc(need)}</small></span>`);
      row.appendChild(this.b('Сделать', () => {
        if (!r.need.every(([id, n]) => p.inv.count(id) >= n)) return;
        for (const [id, n] of r.need) p.inv.take(id, n);
        g.giveOrDrop(Object.assign({}, r.out, WEAPONS[r.out.id] && WEAPONS[r.out.id].mag ? { mag: 0 } : {}));
        audio.play('wood', null, { vol: 0.5 }); this.render();
      }, ok ? 'warm' : 'off'));
      pane.appendChild(row);
    }
    c.appendChild(pane);
    c.appendChild(this.b('Закрыть', () => this.close(), 'warm'));
  }

  scr_sleep(c) {
    const g = this.g;
    c.innerHTML = `<h2>Спальник</h2><p class="sub">Поспать до утра? Голод и жажда за ночь вырастут.</p>`;
    const row = h('div', 'row');
    row.appendChild(this.b('Спать', () => { g.sleep(); this.close(); }, 'warm'));
    row.appendChild(this.b('Не сейчас', () => this.close()));
    c.appendChild(row);
  }
}
