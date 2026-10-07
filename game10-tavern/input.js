// «Таверна у края Хмари» — ввод: тап, перетаскивание, удержание крана, свайп между залом
// и кухней; утром — только тапы по карте, искателям и лавке; в сцене — тап «дальше» и
// «Пропустить»; кнопка меню в шапке — на любом экране. Один обработчик на мышь и
// палец (Pointer Events). Здесь решается, что значит жест; действия — методы Shift и main.js.

import { hitTest, screenAt, contains } from './layout.js';
import { INGREDIENTS, COOKERS, STAFF, RIDDLES } from './data.js';
import { hasRiddle, orderLine } from './hall.js';
import { tr, tf } from './i18n.js';

const riddleText = g => tr(RIDDLES.find(r => r.id === g.items.find(it => it.riddle).riddle).text);

const DRAG_START = 10;   // px — дальше это перетаскивание, а не тап
// Перетаскиваемое рисуется над пальцем, чтобы палец его не закрывал (main.js drawDrag). Цель
// сброса считается там же, где нарисован предмет: иначе тарелка «над лицом» промахивается
// (разбор 2026-10-07, на альбомном телефоне лицо — 52 px).
export const DRAG_LIFT = 34;
const SWIPE_MIN = 50;    // px по горизонтали для смены экрана
const stationFor = id => Object.keys(COOKERS).find(k => COOKERS[k].from === id);
const STIR_TURN = Math.PI * 1.5;   // помешать — провести пальцем по кругу хотя бы на три четверти

// Длина полосы штриха: насколько путь пальца над тарелкой растянулся поперёк неё (доля стороны).
function strokeOver(path, r) {
  const inside = (path || []).filter(([x, y]) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  if (inside.length < 2) return 0;
  const xs = inside.map(p => p[0]), ys = inside.map(p => p[1]);
  return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / r.w;
}

// Нарезаемое из ящика: есть нарезанное — на тарелку, нет — целым на колоду.
function fromCrate(api, s, id) {
  if (s.cut[id] > 0) return s.addToPlate(id);
  if (s.block.item && s.block.item !== id) { api.say('Колода занята. Дорежь, что на ней'); return false; }
  if (s.block.item) { s.chop(); return true; }
  return s.putOnBlock(id);
}

function sourceOf(t, s) {
  if (t.kind === 'pantry') return { kind: 'pantry', id: t.id };
  if (t.kind === 'cooker') {
    const c = s.cookers[t.i];
    if (c && (c.item === COOKERS[c.station].to || c.item === 'burnt')) return { kind: 'cooker', i: t.i };
  }
  if (t.kind === 'barrel' && s.barrel.mug) return { kind: 'mug' };
  if (t.kind === 'board' && s.plate.length) return { kind: 'plate' };
  return null;
}

function tap(api, t) {
  const s = api.shift;
  switch (t.kind) {
    case 'tab': api.go(t.id); break;
    case 'seat': {
      const seat = s.seats[t.i], g = seat.guest;
      // загадку и сюжетную реплику гость договаривает дольше; загадку можно переспросить тапом
      if (g && !g.taken) {
        if (!s.takeOrder(t.i)) break;          // окно раздачи полно — скажет main.js по событию
        api.ui.speech[t.i] = { id: g.id, until: api.now + (g.line || hasRiddle(g) ? 4.5 : 2.6) };
        api.hint('ordered');
      }
      else if (seat.dirty) s.clearSeat(t.i);
      else if (g && hasRiddle(g)) api.ui.speech[t.i] = { id: g.id, until: api.now + 4.5 };
      else if (g) api.say('Заказ уже на кухне, висит на планке под окном раздачи');
      break;
    }
    case 'face': {
      const g = s.slots[t.i] >= 0 ? s.seats[s.slots[t.i]].guest : null;
      const w = s.waitingFor(t.i);
      if (g && hasRiddle(g)) api.say(riddleText(g), 4);
      else if (g) api.say('Перетащи блюдо на лицо гостя');
      else if (w >= 0) {
        // заказ с кухни: гость в пустом гнезде — тот, кто в зале ждёт дольше всех
        const wg = s.seats[w].guest;
        if (s.takeOrder(w, t.i)) {
          api.ui.speech[w] = { id: wg.id, until: api.now + (wg.line || hasRiddle(wg) ? 4.5 : 2.6) };
          api.say(tr(wg.line) || orderLine(wg), wg.line || hasRiddle(wg) ? 4.5 : 3);
          api.hint('ordered');
        }
      }
      break;
    }
    case 'pantry': {
      const st = stationFor(t.id);
      if (st) s.putOn(st);
      else if (INGREDIENTS[t.id].cut) fromCrate(api, s, t.id);
      else s.addToPlate(t.id);
      break;
    }
    case 'block':
      if (s.block.item) s.chop();
      else api.say('Тапни ящик лука, сыра или хлеба, он ляжет на колоду');
      break;
    case 'cooker':
      if (s.phaseOf(t.i).phase === 'stir') api.say('Помешай: веди пальцем по кругу прямо по котлу');
      else s.takeFrom(t.i);
      break;
    case 'barrel':
      if (s.barrel.mug === 'spilled') s.dumpMug();
      else if (s.barrel.mug) api.say('Тяни кружку к гостю в окне раздачи');
      break;
    case 'board': if (s.plate.length) api.say('Тяни тарелку к гостю в окне раздачи'); break;
    default: break;
  }
}

function drop(api, src, t) {
  const s = api.shift;
  if (!t) return;
  // лицо в окне раздачи — гнездо заказа: по нему находится место гостя
  const seatIdx = t.kind === 'face' ? s.slots[t.i] ?? -1 : t.kind === 'seat' ? t.i : -1;
  const serve = source => {
    const g = s.seats[seatIdx].guest;
    // откуда полетит блюдо к лицу (main.js, событие 'served'): точка, где его отпустили
    const d = api.ui.drag;
    api.ui.lastDrop = { what: source, x: d ? d.x : 0, y: d ? d.y - DRAG_LIFT : 0, parts: [...s.plate], quals: [...s.plateQ], fill: s.barrel.mug === 'short' ? 0.55 : 1 };
    if (s.serve(seatIdx, source) === false && g && !g.taken) api.say('Сначала прими заказ в зале');
  };
  if (src.kind === 'pantry') {
    const ing = INGREDIENTS[src.id];
    if (t.kind === 'block') { if (ing.cut) s.putOnBlock(src.id); else api.say('На колоде режут лук, сыр и хлеб'); }
    else if (t.kind === 'board' && ing.cut) fromCrate(api, s, src.id);
    else if (t.kind === 'board') s.addToPlate(src.id, { stroke: strokeOver(api.ui.drag?.path, api.L.kitchen.plate) });
    else if (t.kind === 'cooker') {
      const def = COOKERS[t.station];
      if (def.from === src.id) s.putOn(t.station, t.i);
      else api.say(tf('Сюда кладут только {what}', { what: tr(INGREDIENTS[def.from].name) }));
    }
  } else if (src.kind === 'cooker') {
    if (t.kind === 'board') s.takeFrom(src.i);
    else if (t.kind === 'bucket') s.discard(src.i);
  } else if (src.kind === 'mug') {
    if (seatIdx >= 0 && s.barrel.mug !== 'spilled') serve('mug');
    else if (t.kind === 'bucket') s.dumpMug();
  } else if (src.kind === 'plate') {
    if (seatIdx >= 0) serve('plate');
    else if (t.kind === 'bucket') s.dumpPlate();
  }
}

export function attachInput(canvas, api) {
  const P = { id: null, x0: 0, y0: 0, mode: null, target: null, source: null };
  let audio = false;
  const hitAt = (x, y) => hitTest(api.L, screenAt(api.L, api.ui.screen, x, y), x, y);

  canvas.addEventListener('pointerdown', e => {
    if (P.id !== null) return;
    if (!audio) { audio = true; api.startAudio(); }
    const x = e.clientX, y = e.clientY;
    if (contains(api.L.menu, x, y)) { api.openMenu(); return; }
    if (api.phase === 'scene') { api.sceneTap(hitTest(api.L, 'scene', x, y)); return; }
    if (api.phase === 'morning') {
      const t = hitTest(api.L, 'morning', x, y, api.ui);
      if (t) api.morningTap(t);
      return;
    }
    const s = api.shift;
    if (api.phase !== 'shift' || s.over) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* указатель уже отпущен — жест всё равно доведём */ }
    Object.assign(P, { id: e.pointerId, x0: x, y0: y, mode: 'press', target: hitAt(x, y), source: null });
    if (!P.target) { P.mode = 'swipe'; return; }
    // Котёл просит помешать — ведём круг пальцем вокруг центра слота.
    if (P.target.kind === 'cooker' && s.phaseOf(P.target.i).phase === 'stir') {
      const r = P.target.r;
      Object.assign(P, { mode: 'stir', cx: r.x + r.w / 2, cy: r.y + r.h / 2, angle: 0 });
      P.last = Math.atan2(y - P.cy, x - P.cx);
      api.ui.stir = { slot: P.target.i, angle: 0 };
      return;
    }
    if (P.target.kind === 'barrel' && !s.barrel.mug) {
      if (s.startPour()) P.mode = 'pour';
      else if (s.barrel.by) api.say(tf('{name} уже наливает', { name: tr(STAFF.find(x => x.apply.pour).name) }));
      return;
    }
    P.source = sourceOf(P.target, s);
  });

  canvas.addEventListener('pointermove', e => {
    if (e.pointerId !== P.id) return;
    const x = e.clientX, y = e.clientY;
    if (P.mode === 'stir') {
      const a = Math.atan2(y - P.cy, x - P.cx);
      let d = a - P.last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      P.last = a;
      P.angle += d;
      api.ui.stir = { slot: P.target.i, angle: Math.abs(P.angle) };
      if (Math.abs(P.angle) >= STIR_TURN && api.shift.stir(P.target.i)) { P.mode = 'done'; api.ui.stir = null; }
      return;
    }
    if (P.mode === 'press' && Math.hypot(x - P.x0, y - P.y0) > DRAG_START) P.mode = P.source ? 'drag' : 'swipe';
    if (P.mode === 'drag') {
      const path = api.ui.drag?.path || [[P.x0, P.y0 - DRAG_LIFT]];
      path.push([x, y - DRAG_LIFT]);
      if (path.length > 120) path.shift();
      api.ui.drag = { source: P.source, x, y, path };
    }
  });

  const finish = (e, cancelled) => {
    if (e.pointerId !== P.id) return;
    const x = e.clientX, y = e.clientY;
    if (P.mode === 'stir') { if (!cancelled) api.say('Веди пальцем по кругу, хотя бы почти целый оборот'); api.ui.stir = null; }
    else if (P.mode === 'pour') api.shift.stopPour();
    else if (!cancelled && P.mode === 'drag') {
      // сначала — где нарисован предмет; там пусто — где палец
      drop(api, P.source, hitAt(x, y - DRAG_LIFT) || hitAt(x, y));
    }
    else if (!cancelled && P.mode === 'swipe') {
      const dx = x - P.x0, dy = y - P.y0;
      if (api.L.mode === 'swipe' && Math.abs(dx) > SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) api.go(dx < 0 ? 'kitchen' : 'hall');
    } else if (!cancelled && P.mode === 'press' && P.target) tap(api, P.target);
    Object.assign(P, { id: null, mode: null, source: null, target: null });
    api.ui.drag = null;
  };
  canvas.addEventListener('pointerup', e => finish(e, false));
  canvas.addEventListener('pointercancel', e => finish(e, true));

  window.addEventListener('keydown', e => {
    if (api.phase !== 'shift') return;
    if (e.key === 'ArrowLeft') api.go('hall');
    if (e.key === 'ArrowRight') api.go('kitchen');
  });
}
