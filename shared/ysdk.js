/**
 * Обёртка Yandex Games SDK v2 с мок-режимом.
 * Вставляется инлайном в index.html каждой игры (или копируется рядом).
 * Локально (без платформы) все методы — безопасные no-op, игра работает как обычно.
 *
 * Использование:
 *   await YSDK.init();
 *   YSDK.gameReady();                 // обязательный сигнал LoadingAPI (модерация проверяет!)
 *   YSDK.gameplayStart() / gameplayStop();  // обязательный GameplayAPI (пауза/меню/реклама)
 *   YSDK.showInterstitial(onClose);
 *   YSDK.showRewarded(onReward, onClose);
 *   await YSDK.saveData(obj); const d = await YSDK.loadData();
 *   YSDK.setScore('leaderboardName', score);
 *   YSDK.lang  // 'ru' | 'en' | ...
 */
const YSDK = (() => {
  let ysdk = null;
  let player = null;
  const mock = { data: {} };

  async function init() {
    if (typeof YaGames === 'undefined') {
      console.log('[YSDK] мок-режим (локальная разработка)');
      return;
    }
    try {
      ysdk = await YaGames.init();
      try { player = await ysdk.getPlayer(); } catch (e) { player = null; }
    } catch (e) {
      console.warn('[YSDK] init failed', e);
    }
  }

  return {
    init,
    get lang() { return ysdk ? ysdk.environment.i18n.lang : (navigator.language || 'ru').slice(0, 2); },
    // Облако есть только с игроком платформы; без него saveData/loadData ходят в localStorage,
    // и игре с собственным ключом сохранения это знать важно, чтобы не читать чужой 'save'.
    get hasCloud() { return !!player; },
    get isMobile() {
      if (ysdk) return ysdk.deviceInfo.isMobile() || ysdk.deviceInfo.isTablet();
      return /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    },

    gameReady() { ysdk?.features?.LoadingAPI?.ready(); },
    gameplayStart() { ysdk?.features?.GameplayAPI?.start(); },
    gameplayStop() { ysdk?.features?.GameplayAPI?.stop(); },

    showInterstitial(onClose) {
      if (!ysdk) { onClose?.(); return; }
      this.gameplayStop();
      ysdk.adv.showFullscreenAdv({
        callbacks: {
          onClose: () => { this.gameplayStart(); onClose?.(); },
          onError: () => { this.gameplayStart(); onClose?.(); },
        },
      });
    },

    showRewarded(onReward, onClose) {
      if (!ysdk) { onReward?.(); onClose?.(); return; }   // локально награда даётся сразу
      this.gameplayStop();
      let rewarded = false;
      ysdk.adv.showRewardedVideo({
        callbacks: {
          onRewarded: () => { rewarded = true; onReward?.(); },
          onClose: () => { this.gameplayStart(); onClose?.(rewarded); },
          onError: () => { this.gameplayStart(); onClose?.(false); },
        },
      });
    },

    async saveData(obj) {
      if (player) { try { await player.setData(obj); return; } catch (e) {} }
      try { localStorage.setItem('save', JSON.stringify(obj)); } catch (e) { mock.data = obj; }
    },

    async loadData() {
      if (player) { try { return await player.getData(); } catch (e) {} }
      try { return JSON.parse(localStorage.getItem('save')) || {}; } catch (e) { return mock.data; }
    },

    // ВАЖНО (модерация): при показе рекламы и при document.hidden игра обязана глушить звук —
    // вешайте Sound.setMuted(true/false) в onOpen/onClose рекламы и на visibilitychange.
    setScore(board, score) {
      if (!ysdk) return;
      // актуальный API (старый getLeaderboards() устарел)
      try { ysdk.leaderboards?.setScore?.(board, score)?.catch?.(() => {}); } catch (e) {}
    },
  };
})();
