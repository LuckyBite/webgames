// «Таверна у края Хмари» — сборка игры: канвас, цикл, фазы дня (сцена → утро → смена →
// отчёт), события смены → эффекты и звук, сохранение, меню с паузой и звуком. Логика
// смены — shift.js, мета — meta.js, история — story.js, раскладка — layout.js, жесты — input.js.

import { Shift, shiftStars, dishOnPlate } from './shift.js';
import { computeLayout } from './layout.js';
import { drawHall, lookOf } from './hall.js';
import { drawKitchen } from './kitchen.js';
import { drawMorning, shopDesc } from './morning.js';
import { drawScene, typed } from './scene.js';
import { drawHud, drawMorningHud, drawFx, addFx, toast, showAsk, COLOR } from './ui.js';
import { showReport } from './report.js';
import { drawItem, drawMug, drawPlate, loadArt } from './food.js';
import { makeBot } from './bot.js';
import { attachInput, DRAG_LIFT } from './input.js';
import { tutorStep, drawTutor } from './tutor.js';
import { newGame, load, save, shiftSetup, applyShift, updateSeekers, collect, sendSeeker, buy, shopItems, routes, pantryIds, debugTeam, levelOf, canGo } from './meta.js';
import { nextScene, sceneLines, playScene, goalText, storyText, HINTS } from './story.js';
import { morningPolicy, BOTS } from './sim.js';
import { SEEKERS, INGREDIENTS, FINDS, META, STAFF, DISHES, CHAPTERS } from './data.js';
import * as yandex from './yandex.js';
import { tr, tf, setLang } from './i18n.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const seedBase = Number(params.get('seed')) || Math.floor(Math.random() * 1e6);
// Язык: ?lang=en для проверки, иначе — язык браузера; SDK Яндекса уточнит после init (startSdk).
setLang(params.get('lang') || (navigator.language || 'ru').slice(0, 2));

// Хранилище — localStorage на каждый persist(); облако Яндекса (yandex.cloudSave) — только по
// событиям: конец дня, поход, добыча, покупка. Ошибки хранилища не роняют игру.
const MUTE_KEY = 'tavern.muted';
// ?save=имя — отдельное сохранение для проверок: сохранение игрока при этом не трогается.
const SAVE_KEY = params.get('save') ? 'tavern.test.' + params.get('save') : META.saveKey;
const store = {
  read(key = SAVE_KEY) { try { return localStorage.getItem(key); } catch (e) { return null; } },
  write(text, key = SAVE_KEY) { try { localStorage.setItem(key, text); } catch (e) { /* приватный режим */ } },
  clear() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* приватный режим */ } },
};
let state = load(store.read()) || newGame();
let skew = 0;                                   // отладочный сдвиг часов: game.skip(минуты)
const clock = () => Date.now() + skew;
const persist = () => store.write(save(state));

let phase = 'morning';                          // 'scene' | 'morning' | 'shift' | 'report'
let scene = null;                               // идущая сцена: { id, lines, k, t0 }
let shift = new Shift({ seed: seedBase, setup: shiftSetup(state) });
let pantry = pantryIds(state);
let reportNext = null;
let now = 0, lastCheck = -1, lastMood = 0;
let menuOpen = false, hiddenPause = false;
// react/ghost/meal/leaving/flights — отклик подачи (разбор 2026-10-07, п. 1): лицо радуется,
// блюдо летит к нему, еда стоит перед гостем, уходящий подпрыгивает или уходит злым.
const freshUi = () => ({ speech: {}, fx: [], born: {}, toast: null, drag: null, selected: null, anim: { chop: -9, flip: {}, stir: {} }, stir: null,
  react: {}, ghost: {}, meal: {}, leaving: [], flights: [], flare: undefined, streakLost: undefined, lastDrop: null, pourCue: false, nextBubble: 0 });
const ui = { screen: 'hall', slide: 0, shopSel: null, ...freshUi() };

let W = 0, H = 0, dpr = 1, L = null;
function layoutCfg() {
  const hearth = shift.hearth.length;
  const staff = STAFF.filter(st => state.staff[st.id]?.joined).length;   // полоса команды утром
  return { seats: shift.cfg.seats, hearthSlots: hearth, cauldronSlots: shift.cookers.length - hearth, pantry, staff,   // гнёзд окна — из числа мест (layout)
    joined: SEEKERS.filter(s => state.seekers[s.id].joined).map(s => s.id),   // не пришедшие — одной карточкой
    shopN: shopItems(state).length };                                          // лавка раскладывается по числу товаров
}
function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  // Без явного размера стиля канвас берёт ширину буфера и при dpr 2 вдвое шире экрана
  // (урок «Удачного Квартала»).
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  L = computeLayout(W, H, layoutCfg());
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);   // п. 1.6.1.3: поворот — та же пересборка
resize();

const newBot = () => makeBot({ ...BOTS.good, split: L.mode === 'split' });
let bot = params.has('bot') ? newBot() : null;
const botMorning = { idle: {} };

// shared/sfx.js объявляет `const SFX` в обычном скрипте: имя глобальное, но свойством window
// не становится — поэтому проверка через typeof, а не window.SFX.
const audio = () => (typeof SFX !== 'undefined' ? SFX : null);
const sfx = (name, o) => { try { audio()?.play(name, o); } catch (e) { /* звук не обязателен */ } };
let muted = store.read(MUTE_KEY) === '1';
// hush — временная тишина на рекламу и скрытую вкладку (п. 4.7); настройку игрока не трогает.
let hush = false, ambWanted = false;
function applyMute() { try { audio()?.setMuted(muted || hush); } catch (e) { /* звук не обязателен */ } }
function startAmbience() {
  ambWanted = true;                                // звук включал жест игрока: после тишины можно снова
  if (muted || hush) return;
  try { audio()?.amb.start('hearth'); } catch (e) { /* звук не обязателен */ }
  startMusic();
}
function setHush(on) {
  if (hush === on) return;
  hush = on;
  applyMute();
  if (!on && ambWanted) startAmbience();
}
// Музыка таверны — только в смене; громче, когда в зале людно и кто-то злится.
function startMusic() {
  if (muted || hush || phase !== 'shift' || bot) return;
  try { audio()?.music.start('tavern', 0.3); } catch (e) { /* звук не обязателен */ }
}
function stopMusic() { try { audio()?.music.stop(); } catch (e) { /* звук не обязателен */ } }
function musicMood() {
  const g = shift.seats.filter(s => s.guest), busy = g.length / shift.seats.length;
  const angry = g.filter(s => !(s.guest.eating > 0) && s.guest.patience / s.guest.patienceMax < shift.rules.moodAngry).length;
  try { audio()?.music.set(Math.min(1, 0.25 + 0.5 * busy + 0.15 * angry + (shift.cfg.staff.slow ? 0.15 : 0))); } catch (e) { /* звук не обязателен */ }
}
applyMute();

// GameplayAPI: «идёт» только в смене без паузы, рекламы и скрытой вкладки (п. 1.19/4.7).
function syncGameplay() { yandex.gameplay(phase === 'shift' && !menuOpen && !hiddenPause && !yandex.isAdOpen() && !shift.over); }
yandex.setAdHooks({ open() { setHush(true); syncGameplay(); }, close() { setHush(document.hidden); syncGameplay(); } });

const seekerName = id => tr(SEEKERS.find(s => s.id === id)?.name || id);
const lootText = loot => Object.entries(loot).map(([id, n]) => `${tr(INGREDIENTS[id].name)} ×${n}`).join(', ') || tr('ничего');

function go(screen) {
  if (phase !== 'shift' || L.mode !== 'swipe') return;
  ui.screen = screen;
  if (screen === 'kitchen') hint('kitchen');
}
// who: 'zhar' — подсказка голосом Жара, со значком.
function say(text, sec, who) { toast(ui, tr(text), now, sec, who); }

// Подсказки — по разу каждая за запуск, голосом Жара (тексты — story.js).
const shownHints = new Set();
function hint(id) {
  if (bot || shownHints.has(id) || state.story.flags['hint_' + id]) return;
  if (phase === 'shift' && shift.tutorialOn()) return;   // в обучении говорит наставник
  state.story.flags['hint_' + id] = true;
  const text = id === 'ordered' ? HINTS[L.mode === 'split' ? 'orderedSplit' : 'orderedSwipe'] : HINTS[id];
  if (!text) return;
  shownHints.add(id);
  say(storyText(state, tr(text)), 4.5, 'zhar');
}

// Точка над гостем на том экране, который сейчас виден.
// На кухне — лицо гостя в окне раздачи (если его заказ там), иначе середина окна.
function seatPoint(i, slot) {
  if (L.mode === 'swipe' && ui.screen === 'kitchen') {
    const k = slot ?? shift.slotOf(i), f = L.kitchen.faces[k] || L.kitchen.hatch;
    return [f.x + f.w / 2, f.y + f.h];
  }
  return [L.hall.seats[i].cx, L.hall.seats[i].top];
}
function fxSeat(i, text, color, slot, dy = 0, size) { const [x, y] = seatPoint(i, slot); addFx(ui, text, x, y + dy, color, now, size); }

const REJECT = {
  raw: 'Это сырое, сначала приготовь', full: 'Тарелка уже полная', hearth: 'На очаге нет места',
  cauldron: 'Котёл занят', empty: 'Держи кран, пока наливается', stock: 'Этот продукт кончился',
  hatch: 'Окно раздачи полно. Сначала отдай заказы, потом принимай новые',
  uncut: 'Сначала нарежь на колоде', block: 'Колода занята, дорежь, что на ней', cutFull: 'Ящик полон, хватит резать',
  early: 'Рано, пусть дожарится', notcut: 'Это не режут',
};

// ---------- сцены ----------

// Сцена идёт поверх утра: пока она на экране, утро не видно и не нажимается.
function startScene() {
  const sc = nextScene(state);
  if (!sc) return false;
  scene = { id: sc.id, lines: sceneLines(state, sc), k: 0, t0: now };
  ui.toast = null;
  ui.selected = null;
  ui.shopSel = null;
  phase = 'scene';
  return true;
}

// Последствия сцены (пришёл искатель, открылся маршрут) — когда её досмотрели или
// пропустили; следующая положенная сцена идёт сразу.
function endScene() {
  playScene(state, scene.id);
  persist();
  L = computeLayout(W, H, layoutCfg());           // нанятый помощник — в полосе команды
  scene = null;
  phase = 'morning';
  if (startScene()) return;
  if (state.day === 1 && !state.story.flags.tutorial && !bot) { openTavern(); return; }
  morningHints();
}

// Тап: недопечатанную реплику — дописать, допечатанную — дальше; «Пропустить» — всю сцену.
function sceneTap(t) {
  if (t && t.kind === 'skip') { sfx('tap'); endScene(); return; }
  const line = scene.lines[scene.k];
  if (typed(scene, now) < line.text.length) scene.t0 = now - 1000;
  // полено: тап по сцене подкидывает его, огонь разгорается, и только потом — дальше
  else if (line.log && scene.lit === undefined) { scene.lit = now; sfx('fire'); sfx('whoosh', { v: 0.6 }); }
  else if (scene.k + 1 < scene.lines.length) { scene.k += 1; scene.t0 = now; sfx('tap'); }
  else endScene();
}

// ---------- утро ----------

function enterMorning() {
  phase = 'morning';
  syncGameplay();
  if (pendingCloud && applyCloud()) return;       // облако новее: утро уже собрано заново
  L = computeLayout(W, H, layoutCfg());
  ui.selected = null;
  ui.shopSel = null;
  checkReturns();
  if (!startScene()) morningHints();
}

// Облако читается после YSDK.init(); подменять состояние можно только утром (не в смене и не
// в сцене), иначе ждём ближайшего утра и сравниваем заново. Локальное новее — уходит в облако.
let pendingCloud = null;
function applyCloud() {
  if (phase !== 'morning') return false;
  const chosen = yandex.mergeSaves(state, pendingCloud);
  pendingCloud = null;
  if (chosen === state) { yandex.cloudSave(state); return false; }
  state = chosen;
  persist();
  shift = new Shift({ seed: seedBase, setup: shiftSetup(state) });
  pantry = pantryIds(state);
  enterMorning();
  say('Продолжаем с сохранения из облака', 3);
  return true;
}
async function startSdk() {
  await yandex.init();
  if (!params.get('lang')) setLang(yandex.lang);   // язык площадки Яндекса важнее языка браузера
  if (!yandex.hasCloud()) return;
  const cloud = load(JSON.stringify(await yandex.loadCloud()));   // meta.load: версия и недостающие поля
  if (cloud) { pendingCloud = cloud; applyCloud(); } else yandex.cloudSave(state);
}

function morningHints() {
  if (state.day === 1) hint('morning');
  const g = state.seekers.grum;
  if (g.joined && g.state === 'home' && !g.trips) hint('send');
}

function checkReturns() {
  const back = updateSeekers(state, clock());
  if (!back.length) return;
  persist();
  if (phase === 'morning') L = computeLayout(W, H, layoutCfg());
  say(`Вернулись с добычей: ${back.map(seekerName).join(', ')}`, 3);
  sfx('bell');
}

const LOCKED = { story: 'Откроется по ходу истории', chapter1: 'Откроется после главы 1' };

function morningTap(t) {
  if (t.kind !== 'shop' && t.kind !== 'buy') ui.shopSel = null;
  if (t.kind === 'open') { openTavern(); return; }
  if (t.kind === 'seeker') {
    const s = state.seekers[t.id], name = seekerName(t.id);
    if (!s.joined) { say('Искатели придут сами по ходу истории'); return; }
    if (s.state === 'back') {
      const find = FINDS.find(f => f.id === s.find);
      const before = levelOf(s).level;
      const loot = collect(state, t.id);
      const up = levelOf(s).level > before;
      persist();
      yandex.cloudSave(state);
      say(tf('Добыча: {loot}', { loot: lootText(loot) }) + (find ? tf('. А ещё {find}!', { find: tr(find.name) }) : '')
        + (up ? tf('. {name}: уровень {level}!', { name, level: levelOf(s).level }) : ''), 3.5);
      sfx('coins', { n: 4 });
      ui.selected = null;
    } else if (s.state === 'home') {
      ui.selected = ui.selected === t.id ? null : t.id;
      if (ui.selected) say(tf('Куда пойдёт {name}? Выбери маршрут на карте', { name }));
      sfx('select');
    } else {
      // В пути: за рекламу можно вернуть сразу. Награда — срок «уже», дальше обычный возврат.
      const left = Math.max(1, Math.ceil((s.returnAt - clock()) / 60000));
      sfx('select');
      showAsk(tf('{name} в пути', { name }), tf('Вернётся через {left} мин. Можно вернуть сразу, если посмотреть рекламу', { left }), tr('Вернуть сейчас'), tr('Пусть идёт'),
        () => yandex.showRewarded(() => { if (yandex.recallSeeker(state, t.id, clock())) { checkReturns(); yandex.cloudSave(state); } }));
    }
    return;
  }
  if (t.kind === 'route') {
    const r = routes(state).find(x => x.id === t.id);
    if (!r.open) { say(r.closed === 'fame' ? tf('Откроется при славе {fame}', { fame: r.fame }) : LOCKED[r.flag] || LOCKED.story); return; }
    if (!ui.selected) { say('Сначала выбери искателя'); return; }
    if (!canGo(state.seekers[ui.selected], r)) {
      say(tf('{route}: нужен уровень {level}. Уровень растёт с каждым походом', { route: tr(r.name), level: r.level }));
      return;
    }
    if (sendSeeker(state, ui.selected, t.id, clock())) {
      say(tf('{name} в пути: {route}, {min} мин', { name: seekerName(ui.selected), route: tr(r.name), min: r.minutes }));
      ui.selected = null;
      persist();
      yandex.cloudSave(state);
      sfx('open');
    }
    return;
  }
  // покупка в два тапа: первый выделяет карточку и показывает «Купить за N», второй — по кнопке
  if (t.kind === 'shop') {
    const it = shopItems(state)[t.i];
    if (!it) return;
    if (it.locked) { say(tf('Откроется при славе {fame}', { fame: it.fame })); return; }
    ui.shopSel = ui.shopSel === t.i ? null : t.i;
    if (ui.shopSel != null) say(shopDesc(it), 3);   // полное описание: в низкой карточке оно обрезано
    sfx('select');
    return;
  }
  if (t.kind === 'buy') {
    const it = shopItems(state)[t.i];
    if (!it) { ui.shopSel = null; return; }
    if (!it.can) { say(tf('Не хватает монет: нужно {price}', { price: it.price })); return; }
    buy(state, it.kind, it.id);
    ui.shopSel = null;
    persist();
    yandex.cloudSave(state);
    L = computeLayout(W, H, layoutCfg());           // товаров стало меньше, лавка раскладывается заново
    say(tf('Куплено: {name}', { name: tr(it.name) }));
    sfx('coins', { n: 5 });
  }
}

function openTavern() {
  shift = new Shift({ seed: seedBase * 31 + state.day, setup: shiftSetup(state) });
  pantry = pantryIds(state);
  L = computeLayout(W, H, layoutCfg());
  Object.assign(ui, { screen: 'hall', slide: 0, ...freshUi() });
  if (bot) bot = newBot();
  phase = 'shift';
  syncGameplay();
  sfx('open');
  startMusic();
  if (shift.cfg.feast) hint('feast');
}

// Итог записывается сразу, до кнопки «Дальше»: закрытая на отчёте вкладка смену не теряет,
// и в облако он уходит до рекламы (п. 4.2). Межстраничная — только здесь, между днями,
// синхронно внутри клика «Дальше»: любая задержка перед показом валит п. 4.4.
function finishShift() {
  const sum = shift.summary();
  stopMusic();
  const prev = state.last ? state.last.coins : null, best = state.best || 0;
  const out = applyShift(state, sum);
  state.best = Math.max(best, sum.coins);
  persist();
  yandex.cloudSave(state);
  phase = 'report';
  syncGameplay();
  const dbl = yandex.newDouble(sum);
  reportNext = () => {
    reportNext = null;
    document.getElementById('report').hidden = true;
    if (bot) { enterMorning(); return; }
    yandex.showInterstitial(enterMorning);
  };
  // «×2 выручки» — один раз на отчёт: после награды выручка смены прибавляется ещё раз.
  const double = yandex.canDouble(dbl) ? (done, fail) => yandex.showRewarded(
    () => { if (yandex.claimDouble(state, dbl)) { persist(); yandex.cloudSave(state); sfx('coins', { n: 6 }); done(dbl.coins * 2); } },
    ok => { if (!ok) fail(); },
  ) : null;
  const ch = CHAPTERS.find(c => c.id === state.story.chapter);
  showReport(sum, () => reportNext && reportNext(), out, double, {
    stars: shiftStars(sum), best, record: best > 0 && sum.coins > best, prev, bank: state.coins,
    fame: ch ? { now: state.fame, goal: ch.fame } : null,
    line: tr(reportLine(sum)), streakBest: sum.streakBest, sound: sfx,
  });
}

// Реплика Жара по итогу смены.
function reportLine(sum) {
  if (sum.feast) return null;
  if (sum.left === 0 && sum.streakBest >= 8) return 'Вот это руки! Гости будут рассказывать про эту ночь.';
  if (sum.left === 0) return 'Все ушли сытыми. Так и держи.';
  if (sum.left >= 3) return 'Много ушло голодными. Бери заказы прямо из окна раздачи, так быстрее.';
  return 'Неплохо. Завтра будет больше гостей.';
}

// ---------- меню ----------

// Пауза стоит всё: смену, сцену, огонь. Звук запоминается на устройстве, не в сохранении.
const menuEl = document.getElementById('menu');
const soundLabel = () => tr(muted ? 'Звук: выкл' : 'Звук: вкл');
// Кнопки меню — DOM: переводятся при открытии по их исходному русскому тексту.
function trMenu() {
  for (const el of menuEl.querySelectorAll('button, .dbg')) {
    el.dataset.ru ??= el.textContent;
    if (el.id !== 'sound') el.textContent = tr(el.dataset.ru);
  }
}
function openMenu() {
  trMenu();
  if (phase === 'report' || menuOpen) return;
  menuOpen = true;
  menuEl.querySelector('h2').textContent = tr(phase === 'shift' ? 'Пауза' : 'Меню');
  menuEl.querySelector('#sound').textContent = soundLabel();
  menuEl.hidden = false;
  syncGameplay();
}
function closeMenu() { menuOpen = false; menuEl.hidden = true; syncGameplay(); }
menuEl.querySelector('#resume').addEventListener('click', closeMenu);
menuEl.querySelector('#sound').addEventListener('click', () => {
  muted = !muted;
  store.write(muted ? '1' : '0', MUTE_KEY);
  applyMute();
  startAmbience();
  menuEl.querySelector('#sound').textContent = soundLabel();
});
window.addEventListener('keydown', e => { if (e.key === 'Escape') (menuOpen ? closeMenu : openMenu)(); });

// Отладка в меню — на локальном сервере или с ?debug=1: в сборку для Яндекса не попадает.
// Изменения ложатся в сохранение сразу; в смене вступают со следующего дня.
const DEBUG = params.has('debug') || /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
function debugApply(fn, text) {
  fn();
  persist();
  if (phase === 'morning') L = computeLayout(W, H, layoutCfg());
  closeMenu();
  say(phase === 'shift' ? tr(text) + tr('. В смене со следующего дня') : text, 3);
}
if (DEBUG) {
  menuEl.querySelector('#debug').hidden = false;
  menuEl.querySelector('#dbg-team').addEventListener('click', () => debugApply(() => debugTeam(state), 'Вся команда в сборе'));
  menuEl.querySelector('#dbg-coins').addEventListener('click', () => debugApply(() => { state.coins += 500; }, '+500 монет'));
  menuEl.querySelector('#dbg-fame').addEventListener('click', () => debugApply(() => { state.fame += 50; }, '+50 славы'));
}

// ---------- смена ----------

function handleEvents() {
  for (const e of shift.drain()) {
    switch (e.type) {
      case 'arrive':
        ui.born[shift.seats[e.seat].guest.id] = now;
        sfx('open');
        if (e.regular && state.seekers[e.regular]?.joined) say(tf('В таверне: {name}', { name: seekerName(e.regular) }));
        else hint('first');
        break;
      case 'order': sfx('tap'); if (shift.seats[e.seat].guest.items.some(it => it.riddle) && ui.screen === 'hall') hint('riddle'); break;
      case 'served': served(e); break;
      case 'streak':
        if (e.n >= 2) { fxSeat(e.seat, tf('серия ×{n}', { n: e.n }), COLOR.gold, undefined, -26, 15); sfx('combo', { n: Math.min(9, e.n) }); }
        if (e.n >= 3 && e.n % 3 === 0) ui.flare = now;      // очаг вспыхивает на каждой третьей
        if (e.n === 3) hint('streak');
        break;
      case 'streakLost': ui.streakLost = now; sfx('fire', { v: 0.5 }); break;
      case 'refuse':
        fxSeat(e.seat, tr('не то!'), COLOR.bad); sfx('error');
        ui.react[e.seat] = { id: shift.seats[e.seat].guest?.id, kind: 'no', t0: now };
        break;
      case 'complete': {
        const g = shift.seats[e.seat].guest;
        ui.meal[e.seat] = { id: g.id, items: g.items.map(it => it.dish).filter(Boolean).slice(0, 2), total: g.eating };
        sfx('reveal');
        break;
      }
      case 'fed': fxSeat(e.seat, tr('обед в дорогу!'), COLOR.gold); break;
      case 'leave': leave(e); break;
      case 'coins': fxSeat(e.seat, '+' + e.amount, COLOR.gold); sfx('coins', { n: Math.min(6, e.amount) }); break;
      case 'sizzle': sfx('fire'); break;
      case 'rush': say('Обоз на дороге! Сейчас будет людно', 3, 'zhar'); sfx('bell'); break;
      case 'dump': sfx(e.what === 'mug' ? 'water' : 'thud', { v: 0.6 }); break;
      case 'plate':
        ui.anim.plate = now;
        if (dishOnPlate(shift.plate)) { ui.anim.dish = now; sfx('combo', { n: 4 }); } else sfx('pickup', { n: shift.plate.length }); if (INGREDIENTS[e.id]?.garnish && e.quality !== 'nice') hint('garnish'); if (e.quality === 'nice') { sfx('spark'); const p = L.kitchen.plate; addFx(ui, tr('Красиво!'), p.x + p.w / 2, p.y + 6, COLOR.gold, now); } break;
      // живая кухня: время событий — для анимации ножа, переворота и половника (kitchen.js)
      case 'block': hint('chop'); sfx('select'); break;
      case 'chop': ui.anim.chop = now; sfx('chop'); break;
      case 'flip': ui.anim.flip[e.slot] = now; sfx('fire'); break;
      case 'stir': ui.anim.stir[e.slot] = now; sfx('bubble'); break;
      case 'ask': hint(e.what); sfx('bell'); break;   // мясо и котёл зовут — слышно и из зала
      case 'scorch': say('Похлёбка пригорела. Мешай, когда котёл просит'); sfx('error'); break;

      case 'ready': sfx('bell'); break;
      case 'burnt': sfx('error'); say(e.station === 'cauldron' ? 'Выкипело! Вылей котёл в помои' : 'Подгорело! Выкинь в помои'); break;
      case 'poured': {
        const r = L.kitchen.barrel;
        addFx(ui, tr(e.quality === 'full' ? 'идеально' : 'недолив'), r.x + r.w * 0.7, r.y + 10, e.quality === 'full' ? COLOR.good : COLOR.warn, now);
        sfx(e.quality === 'full' ? 'bubble' : 'drop');
        break;
      }
      case 'spill': sfx('water'); say('Перелилось! Вылей кружку в помои'); break;
      // мелкий промах — мягкий стук, грубый «бззз» — только для настоящих потерь
      case 'reject': if (e.why === 'uncut') hint('chop'); say(REJECT[e.why] || 'Так не выйдет'); sfx(SOFT.has(e.why) ? 'thud' : 'error', { v: 0.5 }); break;
      case 'closing': say(shift.cfg.feast ? 'Все гости пира в сборе' : 'Свеча догорела: новых гостей не будет'); break;
      case 'over': finishShift(); break;
    }
  }
}

const SOFT = new Set(['raw', 'early', 'uncut', 'notcut', 'full', 'block', 'cutFull', 'stock', 'hatch', 'empty']);

// Подача: подпись по звёздам, лицо радуется или хмурится, блюдо летит от пальца к лицу, в
// окне остаётся сияющее лицо, если гнездо освободилось.
function served(e) {
  const g = shift.seats[e.seat].guest;
  const label = e.grade === 'best' ? 'В точку!' : e.grade === 'miss' ? 'мимо…'
    : e.result !== 'exact' ? 'почти…' : e.quality === 'scorched' ? 'пригорело…'
    : e.stars === 3 ? (e.quality === 'nice' ? 'Красиво!' : 'Отлично!') : '';
  const color = e.stars === 3 ? COLOR.gold : e.stars === 2 ? COLOR.good : COLOR.warn;
  fxSeat(e.seat, (label ? tr(label) + ' ' : '') + '+' + e.pay + '  ' + '★'.repeat(e.stars), color, e.slot, 0, e.stars === 3 ? 22 : 18);
  sfx(e.stars === 3 ? 'star' : e.stars === 2 ? 'coin' : 'drop', { v: 0.8 });
  ui.react[e.seat] = { id: g.id, kind: e.stars >= 2 ? 'joy' : 'meh', t0: now };
  // полёт к лицу в окне раздачи (только с кухни: в зале лица гостя в окне нет)
  const d = ui.lastDrop, f = e.slot >= 0 && L.kitchen.faces[e.slot];
  if (d && f && (L.mode === 'split' || ui.screen === 'kitchen')) ui.flights.push({ ...d, x1: f.x + f.w / 2, y1: f.y + f.h / 2, t0: now });
  ui.lastDrop = null;
  if (e.slot >= 0 && g.items.every(it => it.served)) ui.ghost[e.slot] = { look: lookOf(g), t0: now + 0.2 };
}

// Уход: сытый подпрыгивает и уходит с монетами и чаевыми, злой мотает головой и уходит вбок.
function leave(e) {
  const g = e.guest;
  if (g) ui.leaving.push({ seat: e.seat, look: lookOf(g), angry: e.angry, t0: now });
  if (e.angry) { fxSeat(e.seat, tr('ушёл голодным'), COLOR.bad); sfx('fail', { v: 0.6 }); return; }
  sfx('coins', { n: 2 });
  if (e.tip > 0) fxSeat(e.seat, tf('чаевые +{n}', { n: e.tip }), COLOR.gold, undefined, -24, 15);
  if (e.perfect) fxSeat(e.seat, '+★', '#e8c05a', undefined, -48, 16);
}

// Летящее блюдо: 0,25 с от точки сброса к лицу, уменьшаясь.
function drawFlights() {
  ui.flights = ui.flights.filter(f => now - f.t0 < 0.25);
  for (const f of ui.flights) {
    const k = (now - f.t0) / 0.25, e = k * (2 - k), x = f.x + (f.x1 - f.x) * e, y = f.y + (f.y1 - f.y) * e - Math.sin(k * Math.PI) * 30;
    if (f.what === 'mug') drawMug(ctx, x, y, 60 * (1 - 0.5 * k), f.fill, f.fill < 1 ? 'short' : 'full');
    else drawPlate(ctx, f.parts, x, y, 110 * (1 - 0.6 * k), f.quals);
  }
}

// Налив: пузыри, пока льётся; отметка зелёной полосы — щелчком.
function pourSound() {
  const b = shift.barrel;
  if (!b.pouring || b.by) { ui.pourCue = false; return; }
  if (now >= ui.nextBubble) { sfx('bubble', { v: 0.25 + b.fill * 0.35 }); ui.nextBubble = now + 0.13; }
  if (!ui.pourCue && b.fill >= shift.cfg.pourPerfect) { ui.pourCue = true; sfx('select'); }
}

function drawDrag(d) {
  const x = d.x, y = d.y - DRAG_LIFT, s = d.source;     // над пальцем — чтобы палец не закрывал
  if (s.kind === 'pantry') drawItem(ctx, INGREDIENTS[s.id].cut && shift.cut[s.id] > 0 ? s.id + '_cut' : s.id, x, y, 60);
  else if (s.kind === 'cooker') {
    const c = shift.cookers[s.i];
    drawItem(ctx, c.item === 'burnt' && c.station === 'cauldron' ? 'broth_burnt' : c.item, x, y, 60);
  } else if (s.kind === 'mug') drawMug(ctx, x, y, 60, shift.barrel.mug === 'short' ? 0.55 : 1, shift.barrel.mug);
  else if (s.kind === 'plate') drawPlate(ctx, shift.plate, x, y, 110, shift.plateQ);
}

// Подсказка не должна закрывать окно раздачи и лица: на кухне она встаёт на доску,
// в зале — на задник под шапкой, при раскладке «рядом» — на половину зала, утром — на карту.
function toastAnchor() {
  if (phase === 'morning') {
    const m = L.morning.map;   // в широком кадре лавка справа — подсказка остаётся над картой
    return L.morning.wide ? { x: m.x + m.w / 2, y: m.y + 8, maxW: m.w - 16 } : { x: W / 2, y: L.hud.h + 10, maxW: W - 32 };
  }
  // в зале — внизу, на стойке: вверху теперь сидят гости за столами (шаг 3д)
  if (L.mode === 'split') { const S = L.hall.stage; return { x: S.x + S.w / 2, y: S.y + S.h - 8, maxW: S.w - 32, bottom: true }; }
  if (ui.screen === 'kitchen') { const b = L.kitchen.board; return { x: b.x + b.w / 2, y: b.y + 10, maxW: b.w - 16 }; }
  return { x: W / 2, y: H - 8, maxW: W - 32, bottom: true };
}

// Меньше этого окна раскладка вырождается в отрицательные размеры (так бывает на кадр, пока
// окно меняет размер), и канвас бросает ошибки — тогда кадр только заливается фоном.
const MIN_W = 240, MIN_H = 200;

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#120b07';
  ctx.fillRect(0, 0, W, H);
  if (W < MIN_W || H < MIN_H) return;
  if (phase === 'scene') {
    drawScene(ctx, L.scene, scene, state, now);
    drawMorningHud(ctx, L, state, goalText(state));
    return;
  }
  if (phase === 'morning') {
    drawMorning(ctx, L.morning, state, ui, now, clock());
    drawMorningHud(ctx, L, state, goalText(state));
  } else {
    if (L.mode === 'split') {
      drawHall(ctx, L.hall, shift, ui, now);
      drawKitchen(ctx, L.kitchen, shift, ui, now);
    } else {
      const off = ui.slide * W;
      if (ui.slide < 0.999) { ctx.save(); ctx.translate(-off, 0); drawHall(ctx, L.hall, shift, ui, now); ctx.restore(); }
      if (ui.slide > 0.001) { ctx.save(); ctx.translate(W - off, 0); drawKitchen(ctx, L.kitchen, shift, ui, now); ctx.restore(); }
    }
    drawHud(ctx, L, shift, ui, now);
    drawFlights();
    if (!bot && !ui.drag) drawTutor(ctx, tutorStep(shift, L, ui), W, H, now);
    if (ui.drag) drawDrag(ui.drag);
  }
  drawFx(ctx, ui, now, L, toastAnchor());
}

function tick(dt) {
  if (menuOpen) return;                         // пауза: стоит всё, и время подсказок тоже
  now += dt;
  if (phase === 'scene') {
    if (bot) endScene();
  } else if (phase === 'morning') {
    if (bot) { morningPolicy(state, clock(), botMorning); persist(); openTavern(); }
    else {
      if (now - lastCheck >= 1) { lastCheck = now; checkReturns(); }
      if (nextScene(state)) startScene();        // находка из похода — сцена сразу
    }
  } else if (phase === 'report') {
    if (bot && reportNext) reportNext();
  } else if (!hiddenPause && !shift.over) {
    shift.update(dt);
    if (bot) { bot(shift); go(bot.screen); }
    pourSound();
    if (now - lastMood >= 1) { lastMood = now; musicMood(); }
  }
  handleEvents();
  const target = ui.screen === 'kitchen' ? 1 : 0;
  ui.slide += (target - ui.slide) * Math.min(1, dt * 14);
  if (Math.abs(target - ui.slide) < 0.002) ui.slide = target;
}

let last = performance.now();
// Следующий кадр заказывается первым: исключение в отрисовке одного кадра не должно
// останавливать игру насовсем (так и было: на кадр с нулевой панелью огонь бросал ошибку).
// LoadingAPI.ready() — после первого нарисованного кадра (п. 1.19), не раньше.
function frame(ms) {
  requestAnimationFrame(frame);
  tick(Math.min(0.05, Math.max(0, (ms - last) / 1000)));
  last = ms;
  render();
  yandex.ready.drawn();
}
requestAnimationFrame(frame);
// Картинки продуктов (шаг 4) догружаются после первого кадра; пока их нет — рисунок кодом.
// Грузится только то, что перечислено в art/art.json: запрос несуществующего файла — это
// 404 в консоли на каждый продукт, а консоль с ошибками смотрит модерация.
requestAnimationFrame(() => fetch('art/art.json')
  .then(r => (r.ok ? r.json() : []))
  .then(ids => loadArt(ids.filter(id => id in INGREDIENTS || id === 'burnt' || id === 'broth_burnt')))
  .catch(() => {}));
// Скрытая вкладка: смена стоит, звук молчит, GameplayAPI остановлен (п. 4.7).
document.addEventListener('visibilitychange', () => {
  hiddenPause = document.hidden;
  setHush(document.hidden || yandex.isAdOpen());
  syncGameplay();
});

attachInput(canvas, {
  get shift() { return shift; },
  get L() { return L; },
  get now() { return now; },
  get phase() { return phase; },
  ui, go, say, hint, morningTap, sceneTap, openMenu,
  startAudio: startAmbience,
});

enterMorning();   // старт: положенная сцена, иначе утро
startSdk();       // SDK и облако — асинхронно, игра уже идёт с локального сохранения

// Отладка. step() гонит время без rAF — в скрытой панели браузера rAF не тикает.
window.game = {
  get state() { return state; },
  get phase() { return phase; },
  get shift() { return shift; },
  get scene() { return scene; },
  get L() { return L; },
  ui, go, openTavern, sceneTap, endScene, openMenu, closeMenu,
  tutor: () => tutorStep(shift, L, ui),
  team() { debugTeam(state); persist(); if (phase === 'morning') L = computeLayout(W, H, layoutCfg()); },
  skip(min) { skew += min * 60000; checkReturns(); },
  reset() {
    store.clear();
    state = newGame();
    pendingCloud = null;
    yandex.cloudSave(state);                      // иначе при перезапуске облако вернёт старый день
    document.getElementById('report').hidden = true;
    shift = new Shift({ seed: seedBase, setup: shiftSetup(state) });
    pantry = pantryIds(state);
    L = computeLayout(W, H, layoutCfg());
    shownHints.clear();
    enterMorning();
  },
  bot(on = true) { bot = on ? newBot() : null; },
  // Часы походов идут вместе с прокруткой — иначе за секунды отладки поход не кончается;
  // скрытая вкладка прокрутке не мешает.
  step(sec) {
    const h = hiddenPause;
    hiddenPause = false;
    for (let k = 0; k < Math.round(sec / 0.05); k++) { skew += 50; tick(0.05); }
    hiddenPause = h;
    render();
  },
};
