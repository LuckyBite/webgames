// Обёртка Yandex Games SDK. Паттерн взят из game1-blocks — тот дважды проходил
// модерацию: гварженный ready(), таймауты через Promise.race, мок-режим локально.
// Правил игры не знает; пауза боя и глушение звука — забота main.js через колбэки.

let ysdk = null, player = null, readySent = false;

export async function init() {
  if (typeof YaGames === 'undefined') return;      // локальная разработка — мок
  try {
    ysdk = await Promise.race([YaGames.init(), new Promise((_, rej) => setTimeout(() => rej(0), 8000))]);
  } catch (e) { ysdk = null; }
  if (ysdk) {
    try { player = await Promise.race([ysdk.getPlayer(), new Promise(r => setTimeout(() => r(null), 3000))]); }
    catch (e) { player = null; }
  }
}

export function lang() {
  try { return ysdk ? ysdk.environment.i18n.lang : (navigator.language || 'ru').slice(0, 2); }
  catch (e) { return 'ru'; }
}

// п. 1.19: ровно один раз, после загрузки сейва и ДО начала геймплея
export function gameReady() {
  if (readySent) return;
  readySent = true;
  try { ysdk?.features?.LoadingAPI?.ready(); } catch (e) {}
}

export function gameplayStart() { try { ysdk?.features?.GameplayAPI?.start(); } catch (e) {} }
export function gameplayStop() { try { ysdk?.features?.GameplayAPI?.stop(); } catch (e) {} }

/* Реклама. onPause/onResume — глушение звука и пауза боя на стороне игры;
   локально interstitial просто пропускается, rewarded даёт награду сразу. */
export function showInterstitial({ onPause, onResume } = {}) {
  if (!ysdk) return;
  gameplayStop();
  onPause?.();
  ysdk.adv.showFullscreenAdv({ callbacks: {
    onClose: () => { onResume?.(); gameplayStart(); },
    onError: () => { onResume?.(); gameplayStart(); },
  } });
}

export function showRewarded(onReward, { onPause, onResume } = {}) {
  if (!ysdk) { onReward?.(); return; }
  gameplayStop();
  onPause?.();
  let ok = false;
  ysdk.adv.showRewardedVideo({ callbacks: {
    onRewarded: () => { ok = true; },
    onClose: () => { onResume?.(); gameplayStart(); if (ok) onReward?.(); },
    onError: () => { onResume?.(); gameplayStart(); },
  } });
}

/* Сейв: платформа впереди, localStorage позади — и как фолбэк, и как локальная копия.
   Ключ хранилища задаёт игра. */
export async function saveRemote(obj) {
  if (!player) return;
  try { await player.setData(obj); } catch (e) {}
}

export async function loadRemote() {
  if (!player) return null;
  try {
    const d = await Promise.race([player.getData(), new Promise(r => setTimeout(() => r(null), 3000))]);
    return d && Object.keys(d).length ? d : null;
  } catch (e) { return null; }
}
