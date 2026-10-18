// Ввод: клавиатура+мышь (pointer lock), сенсор (джойстик слева, обзор справа, кнопки), геймпад.
// Игра читает только действия: move{x,y}, look{x,y} (накопленные за кадр), held/pressed.
// Сенсорные кнопки строит ui.js через Input.bindTouchButton.

const KEYMAP = {
  KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyC: 'crouch', ControlLeft: 'crouch',
  KeyR: 'reload', KeyE: 'use', KeyF: 'light', KeyQ: 'throw', KeyV: 'shoulder',
  Tab: 'inv', KeyI: 'inv', KeyM: 'map', KeyJ: 'quests', Escape: 'pause', KeyP: 'pause',
  Digit1: 'slot1', Digit2: 'slot2', Digit3: 'slot3', Digit4: 'slot4', Digit5: 'slot5',
  KeyH: 'heal', KeyG: 'eat', KeyB: 'drink', KeyX: 'horn',
};

export const Input = {
  move: { x: 0, y: 0 },        // -1..1, y>0 вперёд
  look: { x: 0, y: 0 },        // пиксели за кадр (мышь/палец), сбрасывается в endFrame
  stickLook: { x: 0, y: 0 },   // правый стик геймпада, -1..1, не накапливается
  held: new Set(),
  pressed: new Set(),
  released: new Set(),
  wheel: 0,
  locked: false,               // pointer lock активен
  isTouch: false,
  usingPad: false,
  sens: 1,
  invertY: false,
  _keys: new Set(),
  _touchMove: { x: 0, y: 0, active: false },
  _pad: { buttons: [], axes: [] },
  enabled: true,
};

function press(a) {
  if (!Input.held.has(a)) Input.pressed.add(a);
  Input.held.add(a);
}
function release(a) {
  if (Input.held.has(a)) Input.released.add(a);
  Input.held.delete(a);
}

let canvasEl = null;

export function initInput(canvas) {
  canvasEl = canvas;
  Input.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window && navigator.maxTouchPoints > 0;

  addEventListener('keydown', e => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    const a = KEYMAP[e.code];
    if (!a) return;
    if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    Input._keys.add(a);
    press(a);
    Input.usingPad = false;
  });
  addEventListener('keyup', e => {
    const a = KEYMAP[e.code];
    if (!a) return;
    Input._keys.delete(a);
    // кнопка может быть зажата ещё и на сенсоре/геймпаде, отпускаем только клавиатурную
    release(a);
  });
  addEventListener('blur', () => {
    for (const a of [...Input.held]) release(a);
    Input._keys.clear();
  });

  canvas.addEventListener('mousedown', e => {
    if (Input.isTouch && e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;
    if (!Input.enabled) return;
    if (!Input.locked) { requestLock(); return; }
    if (e.button === 0) press('fire');
    if (e.button === 2) press('aim');
    if (e.button === 1) press('shoulder');
  });
  addEventListener('mouseup', e => {
    if (e.button === 0) release('fire');
    if (e.button === 2) release('aim');
    if (e.button === 1) release('shoulder');
  });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('mousemove', e => {
    // без захвата (после Esc браузер не даёт захватить мышь заново без клика) камера всё равно крутится за мышью над экраном
    if (!Input.locked && !(Input.freeLook && e.target === canvasEl)) return;
    Input.look.x += e.movementX;
    Input.look.y += e.movementY;
  });
  addEventListener('wheel', e => {
    if (!Input.locked) return;
    Input.wheel += Math.sign(e.deltaY);
  }, { passive: true });

  document.addEventListener('pointerlockchange', () => {
    Input.locked = document.pointerLockElement === canvasEl;
    if (!Input.locked) { release('fire'); release('aim'); }
    if (Input.onLockChange) Input.onLockChange(Input.locked);
  });
}

export function requestLock() {
  if (Input.isTouch || !canvasEl) return;
  try {
    const p = canvasEl.requestPointerLock({ unadjustedMovement: true });
    // без жеста пользователя браузер отказывает: повтор без опций, отказ глушим
    if (p && p.catch) p.catch(() => { try { const q = canvasEl.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch (e) {} });
  } catch (e) { try { canvasEl.requestPointerLock(); } catch (e2) {} }
}
export function exitLock() {
  if (document.pointerLockElement) document.exitPointerLock();
}

// ---------- сенсор ----------
// Левый джойстик: появляется там, где коснулись в левой половине.
// Правая половина экрана: перетаскивание вращает камеру.
// Кнопки: ui.js вешает Input.bindTouchButton(el, action, {look:true}) — кнопка
// «огонь» тоже крутит камеру, пока палец на ней, как в мобильных шутерах.

const touches = new Map(); // id -> {kind, x0,y0,x,y, action}
let stickEl = null, knobEl = null;

export function initTouch(root) {
  stickEl = document.createElement('div');
  stickEl.className = 'stick';
  knobEl = document.createElement('div');
  knobEl.className = 'knob';
  stickEl.appendChild(knobEl);
  root.appendChild(stickEl);

  const zone = document.createElement('div');
  zone.className = 'touch-zone';
  root.prepend(zone);

  zone.addEventListener('pointerdown', e => {
    if (!Input.enabled) return;
    e.preventDefault();
    zone.setPointerCapture(e.pointerId);
    const left = e.clientX < innerWidth * 0.45;
    const busyStick = [...touches.values()].some(t => t.kind === 'stick');
    if (left && !busyStick) {
      touches.set(e.pointerId, { kind: 'stick', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY });
      stickEl.style.display = 'block';
      stickEl.style.left = e.clientX + 'px';
      stickEl.style.top = e.clientY + 'px';
      knobEl.style.transform = 'translate(-50%,-50%)';
    } else {
      touches.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY });
    }
  });
  zone.addEventListener('pointermove', e => onTouchMove(e));
  const end = e => onTouchEnd(e);
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
}

function stickRadius() { return Math.max(44, Math.min(innerWidth, innerHeight) * 0.11); }

function onTouchMove(e) {
  const t = touches.get(e.pointerId);
  if (!t) return;
  e.preventDefault();
  if (t.kind === 'stick') {
    const R = stickRadius();
    let dx = e.clientX - t.x0, dy = e.clientY - t.y0;
    const d = Math.hypot(dx, dy);
    // джойстик «едет» за пальцем, если вытянуть дальше края
    if (d > R * 1.6) { const k = (d - R * 1.6) / d; t.x0 += dx * k; t.y0 += dy * k; dx = e.clientX - t.x0; dy = e.clientY - t.y0;
      stickEl.style.left = t.x0 + 'px'; stickEl.style.top = t.y0 + 'px'; }
    const dd = Math.min(R, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    const nx = Math.cos(a) * dd / R, ny = Math.sin(a) * dd / R;
    Input._touchMove.x = nx; Input._touchMove.y = -ny; Input._touchMove.active = true;
    knobEl.style.transform = `translate(calc(-50% + ${nx * R}px), calc(-50% + ${ny * R}px))`;
    // бег — джойстик дотянут до края
    const run = Math.hypot(dx, dy) > R * 1.05;
    if (run) press('sprint'); else if (!Input._keys.has('sprint')) release('sprint');
  } else {
    Input.look.x += (e.clientX - t.x) * 1.6;
    Input.look.y += (e.clientY - t.y) * 1.6;
    t.x = e.clientX; t.y = e.clientY;
  }
}
function onTouchEnd(e) {
  const t = touches.get(e.pointerId);
  if (!t) return;
  touches.delete(e.pointerId);
  if (t.kind === 'stick') {
    Input._touchMove.x = 0; Input._touchMove.y = 0; Input._touchMove.active = false;
    stickEl.style.display = 'none';
    if (!Input._keys.has('sprint')) release('sprint');
  }
  if (t.kind === 'btn') release(t.action);
}

export function bindTouchButton(el, action, opts = {}) {
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    if (!Input.enabled && !opts.always) return;
    el.setPointerCapture(e.pointerId);
    if (opts.toggle) { if (Input.held.has(action)) release(action); else press(action); }
    else press(action);
    el.classList.add('down');
    touches.set(e.pointerId, { kind: opts.look ? 'btnlook' : 'btn', action: opts.toggle ? null : action, x: e.clientX, y: e.clientY });
  });
  el.addEventListener('pointermove', e => {
    const t = touches.get(e.pointerId);
    if (!t || t.kind !== 'btnlook') return;
    e.preventDefault();
    Input.look.x += (e.clientX - t.x) * 1.6;
    Input.look.y += (e.clientY - t.y) * 1.6;
    t.x = e.clientX; t.y = e.clientY;
  });
  const up = e => {
    const t = touches.get(e.pointerId);
    el.classList.remove('down');
    if (!t) return;
    touches.delete(e.pointerId);
    if (t.action) release(t.action);
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

// ---------- геймпад ----------
const PADMAP = { 0: 'jump', 1: 'crouch', 2: 'reload', 3: 'use', 4: 'throw', 5: 'light', 6: 'aim', 7: 'fire',
  8: 'map', 9: 'pause', 10: 'sprint', 11: 'shoulder', 12: 'slotPrev', 13: 'slotNext', 14: 'inv', 15: 'quests' };

function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  let pad = null;
  for (const p of pads) if (p && p.connected) { pad = p; break; }
  if (!pad) { Input.stickLook.x = Input.stickLook.y = 0; return { x: 0, y: 0 }; }
  const dz = v => Math.abs(v) < 0.18 ? 0 : (v - Math.sign(v) * 0.18) / 0.82;
  const mx = dz(pad.axes[0] || 0), my = dz(pad.axes[1] || 0);
  Input.stickLook.x = dz(pad.axes[2] || 0);
  Input.stickLook.y = dz(pad.axes[3] || 0);
  pad.buttons.forEach((b, i) => {
    const a = PADMAP[i];
    if (!a) return;
    const on = b.pressed || b.value > 0.5;
    const was = Input._pad.buttons[i];
    if (on && !was) { press(a); Input.usingPad = true; }
    if (!on && was) release(a);
    Input._pad.buttons[i] = on;
  });
  if (mx || my || Input.stickLook.x || Input.stickLook.y) Input.usingPad = true;
  return { x: mx, y: -my };
}

// вызывать в начале кадра
export function beginFrame() {
  const pm = pollPad();
  let x = 0, y = 0;
  if (Input._keys.has('left')) x -= 1;
  if (Input._keys.has('right')) x += 1;
  if (Input._keys.has('up')) y += 1;
  if (Input._keys.has('down')) y -= 1;
  if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
  if (Input._touchMove.active) { x = Input._touchMove.x; y = Input._touchMove.y; }
  if (pm.x || pm.y) { x = pm.x; y = pm.y; }
  Input.move.x = x; Input.move.y = y;
  if (Input.held.has('slotPrev')) { /* обрабатывается как pressed */ }
}

// вызывать в конце кадра
export function endFrame() {
  Input.look.x = 0; Input.look.y = 0;
  Input.wheel = 0;
  Input.pressed.clear();
  Input.released.clear();
}

export function clearAll() {
  for (const a of [...Input.held]) release(a);
  Input._keys.clear();
  Input._touchMove.x = Input._touchMove.y = 0;
  Input._touchMove.active = false;
  if (stickEl) stickEl.style.display = 'none';
  touches.clear();
  Input.pressed.clear();
}

// для тестов: нажать/отпустить действие программно
export function simPress(a) { press(a); }
export function simRelease(a) { release(a); }
