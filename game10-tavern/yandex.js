// «Таверна у края Хмари» — SDK Яндекс Игр поверх общей обёртки shared/ysdk.js (обычный
// скрипт, объявляет `const YSDK`: имя глобальное, но не свойство window — отсюда typeof).
// Без платформы всё работает как раньше: награда даётся сразу, реклама не показывается,
// облака нет. Чистые куски (слияние сохранений, троттлинг, «×2 уже взят», сигнал готовности)
// не трогают window, чтобы их гонял node (tests/yandex.test.mjs).

const sdk = () => (typeof YSDK !== 'undefined' ? YSDK : null);

// Язык платформы для будущей локализации; до init() — 'ru'. Живая привязка: импортёры
// видят новое значение после init().
export let lang = 'ru';

// ---------- чистая логика ----------

// Облако Яндекса: player.setData принимает до 200 КБ и не любит частых записей.
export const CLOUD_LIMIT = 200 * 1024;
export const CLOUD_MIN_MS = 5000;

// Какое сохранение брать при старте: с большим днём; при равных — локальное (оно точно
// то, что игрок видел последним на этом устройстве). Чужой мусор без дня — не сохранение.
export function mergeSaves(local, cloud) {
  const ok = s => s && typeof s.day === 'number';
  if (!ok(cloud)) return local;
  if (!ok(local)) return cloud;
  return cloud.day > local.day ? cloud : local;
}

export function cloudBytes(obj) { return new TextEncoder().encode(JSON.stringify(obj)).length; }
export function fitsCloud(obj) { return cloudBytes(obj) <= CLOUD_LIMIT; }

// Писать сейчас или подождать: не чаще раза в minMs. wait — сколько ждать до окна.
export function throttlePlan(lastAt, now, minMs = CLOUD_MIN_MS) {
  const wait = Math.max(0, lastAt + minMs - now);
  return { now: wait === 0, wait };
}

// Запись с троттлингом: первая идёт сразу, остальные в окне — одной отложенной, и уходит
// всегда последнее состояние, а не то, что было при первом вызове.
export function makeCloudSaver({ write, clock = Date.now, timer = setTimeout, minMs = CLOUD_MIN_MS }) {
  let lastAt = -Infinity, pending = false, latest = null;
  function flush() {
    pending = false;
    lastAt = clock();
    const s = latest;
    latest = null;
    write(s);
  }
  return function cloudSave(state) {
    latest = state;
    const plan = throttlePlan(lastAt, clock(), minMs);
    if (plan.now) flush();
    else if (!pending) { pending = true; timer(flush, plan.wait); }
  };
}

// «×2 выручки» в отчёте: один раз на отчёт и только если было что удваивать.
export function newDouble(sum) { return { coins: Math.max(0, sum.coins | 0), used: false }; }
export function canDouble(d) { return !!d && !d.used && d.coins > 0; }
export function claimDouble(state, d) {
  if (!canDouble(d)) return false;
  d.used = true;
  state.coins += d.coins;
  return true;
}

// Вернуть искателя из похода сразу: срок возврата — «уже», дальше обычный updateSeekers.
export function recallSeeker(state, id, now) {
  const s = state.seekers?.[id];
  if (!s || s.state !== 'away') return false;
  s.returnAt = now;
  return true;
}

// LoadingAPI.ready() нужен ровно один раз и только когда и SDK ответил, и первый кадр
// нарисован (п. 1.19): кто придёт вторым, тот и стреляет.
export function makeReadyGate(fire) {
  let inited = false, drawn = false, fired = false;
  const check = () => { if (!fired && inited && drawn) { fired = true; fire(); } };
  return {
    init() { inited = true; check(); },
    drawn() { drawn = true; check(); },
    get fired() { return fired; },
  };
}

// ---------- платформа ----------

let hooks = { open() {}, close() {} };    // main.js: глушить звук и GameplayAPI на время рекламы
let adOpen = false;
let gameplayOn = false;

export function setAdHooks(h) { hooks = { ...hooks, ...h }; }
export const isAdOpen = () => adOpen;
export const hasCloud = () => !!sdk()?.hasCloud;

export const ready = makeReadyGate(() => { try { sdk()?.gameReady(); } catch (e) { /* платформа не обязательна */ } });

export async function init() {
  const y = sdk();
  if (y) {
    try { await y.init(); } catch (e) { /* без платформы */ }
    try { lang = y.lang; } catch (e) { /* без платформы */ }
  }
  ready.init();
}

// Повторные start/stop подряд платформе не нужны: шлём только смену состояния.
export function gameplay(on) {
  const y = sdk();
  if (!y || on === gameplayOn) return;
  gameplayOn = on;
  try { on ? y.gameplayStart() : y.gameplayStop(); } catch (e) { /* платформа не обязательна */ }
}

// Обёртка shared/ysdk.js сама останавливает GameplayAPI перед рекламой и запускает после;
// отмечаем это в gameplayOn, чтобы hooks.close() мог снова остановить, если игра не в смене.
export function showInterstitial(onClose) {
  const y = sdk();
  if (!y || adOpen) { onClose?.(); return; }
  adOpen = true;
  hooks.open();
  y.showInterstitial(() => { adOpen = false; gameplayOn = true; hooks.close(); onClose?.(); });
}

// Локально (мок-режим) награда приходит сразу и синхронно.
export function showRewarded(onReward, onClose) {
  const y = sdk();
  if (!y) { onReward?.(); onClose?.(true); return; }
  if (adOpen) { onClose?.(false); return; }
  adOpen = true;
  hooks.open();
  let ok = false;
  y.showRewarded(() => { ok = true; onReward?.(); }, () => { adOpen = false; gameplayOn = true; hooks.close(); onClose?.(ok); });
}

// Облако читается один раз после init(); проверять версию и чинить поля — meta.load.
export async function loadCloud() {
  const y = sdk();
  if (!y?.hasCloud) return null;
  try {
    const d = await y.loadData();
    return d && typeof d.day === 'number' ? d : null;
  } catch (e) { return null; }
}

// В облако — не на каждый persist(), а по событиям (конец дня, поход, добыча, покупка),
// и то с троттлингом. Копия через JSON: платформа получает снимок, а не живой объект.
export const cloudSave = makeCloudSaver({
  write(state) {
    const y = sdk();
    if (!y?.hasCloud || !state || !fitsCloud(state)) return;
    try { y.saveData(JSON.parse(JSON.stringify(state)))?.catch?.(() => {}); } catch (e) { /* облако не обязательно */ }
  },
});
