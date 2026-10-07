// Сборка игры: состояние, жизненный цикл рейда, мета-прогресс, игровой цикл.
// Не рисует сам и не содержит боевых правил — склеивает sim, economy, render, ui, audio.
//
// v2 поверх прототипа: сохранения, гримуар с ритуалом лича, ежедневный бонус,
// туториал, массовый ритуал, звук. Чего по-прежнему нет: Yandex SDK, локализации,
// рекламы — это отдельный релизный круг.

import { UNDEAD, SCHOOLS, SCHOOL_IDS, partyFor, armySlots,
         starsForDupes, dupesForFullStars, grimoireMods, GRIMOIRE, grimoireStepCost,
         essenceFor } from './data.js';
import * as Sim from './sim.js';
import * as Cards from './cards.js';
import { emptyRemains, rollbackTo, awardRemains, rollRitual, pickSlots } from './economy.js';
import * as Render from './render.js';
import * as UI from './ui.js';
import * as Audio from './audio.js';
import * as YSDK from './ysdk.js';
import { T, setLang, onLangChange } from './i18n.js';
import * as Cos from './cosmetics.js';
import { PACK } from './art/pack.js';

const qs = new URLSearchParams(location.search);

/* ═══════════════ Состояние ═══════════════ */
const freshRun = () => ({
  tier: 1,
  partyIndex: 1,
  maxTier: 1,
  remains: emptyRemains(),
  raised: { skeleton: 0, dustling: 0 },
  army: [
    { defId: 'skeleton', stars: 1, hpFrac: 1 },
    { defId: 'dustling', stars: 1, hpFrac: 1 },
    null,
  ],
  ritual: [null, null, null],
  // Колода карточек живёт один забег: ритуал лича начинает её заново
  deck: Cards.freshDeck(),
});

const game = {
  ...freshRun(),
  // Переживает ритуал лича
  essence: 0,
  grimoire: {},              // id узла → куплено ступеней
  lichUnlocked: false,
  daily: { last: '', streak: 0 },
  tutorial: 0,               // 0 смотрит бой · 1 заложи останки · 2 подними · 3 расти · 4 пройден
  spellHintShown: false,
  muted: false,
  // Ручные ритуалы за всю игру: по ним открываются «Разложить» и ×10 (см. unlocks)
  manualRituals: 0,
  seenUnlocks: [],           // о каких открытиях игроку уже сказали баннером
  // «Склеп»: косметика и её двери-достижения. Всё это переживает ритуал лича
  cosmetics: Cos.freshCosmetics(),
  bestTier: 1,               // лучший ярус за всю игру — maxTier сбрасывается личем
  lichCount: 0,
  introSeen: false,          // вступление показывается один раз за всю игру
};

/* ═══════════════ Реклама ═══════════════
   Пять реворд-точек из спеки плюс interstitial между ярусами. Кулдаун и отсрочка
   первого показа — требования модерации и здравого смысла: реклама в первые
   полторы минуты сессии убивает удержание, а оно правит рейтингом (п. 2.13). */
const AD = { interCooldown: 180e3, interFirstDelay: 90e3 };
const sessionStart = Date.now();
let lastInterstitial = 0;
let adSlotBonus = 0;          // +слот круга, купленный рекламой на один ритуал
let pendingOffer = null;      // { kind: 'champion' | 'rescue' }

// Пауза боя и тишина на время рекламы — оба требования модерации в одном месте
const adPause = {
  onPause: () => { paused = true; Audio.setMuted(true); },
  onResume: () => { paused = UI.modalHold(); Audio.setMuted(game.muted); },
};

function maybeInterstitial() {
  const now = Date.now();
  if (now - sessionStart < AD.interFirstDelay) return;
  if (now - lastInterstitial < AD.interCooldown) return;
  lastInterstitial = now;
  YSDK.showInterstitial(adPause);
}

const mods = () => grimoireMods(game.grimoire);

/* ═══════════════ Сохранение ═══════════════
   Локальная копия пишется всегда и сразу, облачная — с задержкой: player.setData
   квотируется платформой, а сейв у нас летит на каждый тап по кучке останков.
   Пишем на каждом событии, меняющем прогресс, — сейв меньше килобайта. */
const SAVE_KEY = 'necro_save';
let wiping = false;      // стирание: beforeunload не должен пересохранить стёртое

let cloudTimer = 0;

function snapshotSave() {
  // ritual тоже в сейве: останки, заложенные в круг, уже списаны из remains,
  // и без него закрытая на полукруге вкладка съедала их безвозвратно
  const { tier, partyIndex, maxTier, remains, raised, army, ritual, essence,
          grimoire, lichUnlocked, daily, tutorial, spellHintShown, muted,
          manualRituals, seenUnlocks, cosmetics, bestTier, lichCount, introSeen, deck } = game;
  return { v: 2, tier, partyIndex, maxTier, remains, raised, army, ritual, essence,
           grimoire, lichUnlocked, daily, tutorial, spellHintShown, muted,
           manualRituals, seenUnlocks, cosmetics, bestTier, lichCount, introSeen, deck };
}

function save({ now = false } = {}) {
  if (wiping) return;
  const data = snapshotSave();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* приватный режим */ }
  if (now) { clearTimeout(cloudTimer); cloudTimer = 0; YSDK.saveRemote(data); return; }
  if (!cloudTimer) cloudTimer = setTimeout(() => { cloudTimer = 0; YSDK.saveRemote(snapshotSave()); }, 5000);
}

function load(remote) {
  let raw = remote || null;
  if (!raw) { try { raw = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return; } }
  if (!raw || raw.v !== 2) return;
  // Берём только известные поля: сейв — данные снаружи, а не код
  for (const k of ['tier', 'partyIndex', 'maxTier', 'essence', 'lichUnlocked',
                   'tutorial', 'spellHintShown', 'muted', 'manualRituals', 'bestTier', 'lichCount', 'introSeen']) {
    if (typeof raw[k] === typeof game[k]) game[k] = raw[k];
  }
  if (raw.remains) for (const s of SCHOOL_IDS) {
    if (Array.isArray(raw.remains[s]) && raw.remains[s].length === 4) game.remains[s] = raw.remains[s].map(n => Math.max(0, n | 0));
  }
  if (raw.raised && typeof raw.raised === 'object') {
    game.raised = {};
    for (const id in raw.raised) if (UNDEAD[id]) game.raised[id] = Math.max(0, raw.raised[id] | 0);
  }
  game.cosmetics = Cos.sanitize(raw.cosmetics);
  // Старые сейвы не знали bestTier: берём хотя бы текущий максимум забега
  game.bestTier = Math.max(game.bestTier, game.maxTier);
  if (Array.isArray(raw.seenUnlocks)) game.seenUnlocks = raw.seenUnlocks.filter(u => u === 'auto' || u === 'batch');
  if (Array.isArray(raw.army)) {
    game.army = raw.army.map(e => (e && UNDEAD[e.defId])
      ? { defId: e.defId, stars: starsForDupes(game.raised[e.defId] ?? 0), hpFrac: 1 }
      : null);
    if (!game.army.some(Boolean)) game.army = freshRun().army;
  }
  if (Array.isArray(raw.ritual)) {
    game.ritual = raw.ritual.map(s => (s && SCHOOLS[s.school] && s.density >= 1 && s.density <= 3)
      ? { school: s.school, density: s.density | 0 }
      : null);
  }
  if (raw.grimoire && typeof raw.grimoire === 'object') {
    for (const n of GRIMOIRE) {
      const v = raw.grimoire[n.id] | 0;
      if (v > 0) game.grimoire[n.id] = Math.min(n.steps, v);
    }
    /* «Ранняя наука» (пороги по ярусам) заменена «Первой карточкой» — ступень переносим.
       Читаем из raw: earlyLore больше нет в GRIMOIRE, и цикл выше его уже отбросил. */
    if ((raw.grimoire.earlyLore | 0) > 0 && !game.grimoire.firstCard) game.grimoire.firstCard = 1;
  }
  game.deck = Cards.sanitizeDeck(raw.deck);
  if (raw.daily && typeof raw.daily.last === 'string') game.daily = { last: raw.daily.last, streak: raw.daily.streak | 0 };
}

/* ═══════════════ Слоты армии и круга ═══════════════ */
// Слоты открываются с глубиной, гримуар двигает старт и потолок
function syncSlots() {
  const m = mods();
  const want = armySlots(game.tier, m.slotsStart, m.slotsMax);
  while (game.army.length < want) game.army.push(null);
  if (game.army.length > want) game.army.length = want;
  /* Круг: слоты из гримуара плюс купленный рекламой. Сжимать можно только пустой
     хвост — иначе истёкший рекламный слот унёс бы с собой заложенный останок. */
  const circle = m.ritualSlots + adSlotBonus;
  while (game.ritual.length < circle) game.ritual.push(null);
  while (game.ritual.length > circle && game.ritual[game.ritual.length - 1] === null) game.ritual.pop();
  return want;
}

let battle = null;
let currentParty = [];
let pending = [];
let ending = false;
let paused = false;      // реклама или скрытая вкладка: бой стоит, но кадры идут
/* Сиды от времени: у каждого игрока свой забег. ?seed= оставлен съёмке и отладке —
   с ним и бой, и гача повторяются в точности. */
let seed = qs.has('seed') ? (Number(qs.get('seed')) >>> 0) : (Date.now() >>> 0);
const ritualRng = Sim.makeRng((seed ^ 0x9e3779b9) >>> 0);
let nextTimer = 0;     // единственный отложенный старт: два подряд обнулили бы бой

function scheduleNext(ms) {
  clearTimeout(nextTimer);
  nextTimer = setTimeout(startParty, ms);
}

/* ═══════════════ Рейд ═══════════════ */
function startParty() {
  clearTimeout(nextTimer);
  ending = false;
  // Баннеры больше не гасятся принудительно: они стоят в очереди и досказывают
  // своё сами. Гашение здесь съедало и ежедневный бонус, и половину итогов рейда.
  currentParty = partyFor(game.tier, game.partyIndex);
  battle = Sim.newBattle(game.army, currentParty, seed++, mods(), Cards.deckMods(game.deck));
  // Перенос здоровья между партиями рейда
  for (const u of battle.undead) {
    const e = game.army[u.slot];
    if (e && e.hpFrac != null) u.hp = Math.max(1, Math.round(u.maxHp * e.hpFrac));
  }
  if (game.partyIndex === 10) Audio.championComes();
  Audio.heat(game.partyIndex === 10);
  Render.setDepth(game.tier);        // верхний свет гаснет, кости копятся — по тезису
  Render.syncUnits(battle);
  refreshAll();
}

function storeHp({ full }) {
  for (const e of game.army) if (e) e.hpFrac = full ? 1 : 0.25;
  if (full) return;
  for (const u of battle.undead) {
    // Посмертный спавн наследует слот хозяина и лежит в массиве позже него:
    // без фильтра его здоровье перетирало запись погибшего громилы
    if (u.spawned) continue;
    const e = game.army[u.slot];
    if (!e) continue;
    // Нежить всегда встаёт: павшие поднимаются к следующей партии на четверти здоровья
    e.hpFrac = u.alive ? Math.min(1, u.hp / u.maxHp + 0.25) : 0.25;
  }
}

/* Добыча идёт через economy.js — тот же код, что гоняет симулятор баланса. */
function awardLoot() {
  const got = awardRemains(game.remains, currentParty, game.partyIndex, game.tier, ritualRng, mods());
  const total = Object.values(got).reduce((a, b) => a + b, 0);
  return { got, total, text: Object.keys(got).map(s => `${T.remains[s]} ×${got[s]}`).join(', ') };
}

function onVictory() {
  // Номер партии запоминаем до сдвига: карточка положена за 5-ю и 10-ю победу
  const cardKey = (game.partyIndex === 5 || game.partyIndex === 10) ? `${game.tier}:${game.partyIndex}` : null;
  const loot = awardLoot();
  const wasChampion = game.partyIndex === 10;
  storeHp({ full: game.partyIndex === 9 });      // перед чемпионом армия встаёт целиком

  // Чемпион десятого яруса открывает ритуал лича — навсегда
  if (wasChampion && game.tier >= 10 && !game.lichUnlocked) {
    game.lichUnlocked = true;
    UI.banner(T.msg.lichReady, 'win', 3200);
  }

  game.partyIndex++;
  if (game.partyIndex > 10) {
    const slotsBefore = game.army.length;
    game.tier++;
    game.maxTier = Math.max(game.maxTier, game.tier);
    game.bestTier = Math.max(game.bestTier, game.tier);
    grantCosmetics();
    game.partyIndex = 1;
    storeHp({ full: true });
    Render.clearDecals();
    const slots = syncSlots();
    let extra = '';
    if (slots > slotsBefore) extra = T.msg.crypts(slots);
    Audio.tierUp();
    UI.faceReact('laugh', 2600);
    UI.banner(T.msg.raidDown(game.tier) + extra, 'win', 2600);
    maybeInterstitial();                          // реклама на переходе между ярусами
  } else {
    Audio.victory(loot.total);
    UI.banner(T.msg.partyDown(loot.text), 'win', 1500);
    UI.faceReact('laugh', 1200);
  }
  // Реворд №1: ×2 к добыче с чемпиона — предложение живёт, пока идёт следующая партия
  if (wasChampion) {
    pendingOffer = { kind: 'champion', got: loot.got };
    UI.showOffer('adDouble');
  }
  tutorialAfterVictory();
  save();
  refreshAll();          // останки показываем сразу, а не через паузу до следующей партии
  if (cardKey && !Cards.isTaken(game.deck, cardKey)) openCardChoice(cardKey, 900);
  else scheduleNext(900);
}

function onDefeat() {
  /* Реворд №4: поднять армию на месте вместо откатa рейда. Предложение показывается
     ДО списания добычи и отката — иначе платить было бы уже не за что. Ставка на
     первой партии не имеет смысла: там и откатывать некуда. */
  if (game.partyIndex > 1) {
    const snapshot = { partyIndex: game.partyIndex, remains: JSON.parse(JSON.stringify(game.remains)) };
    pendingOffer = { kind: 'rescue', snapshot };
    UI.showOffer('adRescue');
  }

  let lost = 0;
  for (const s of SCHOOL_IDS) for (let d = 1; d <= 3; d++) {
    const take = Math.floor(game.remains[s][d] / 3);
    game.remains[s][d] -= take;
    lost += take;
  }
  const back = rollbackTo(game.partyIndex);
  const kept = game.partyIndex > back;
  game.partyIndex = back;
  storeHp({ full: true });
  Render.clearDecals();
  Audio.defeat();
  UI.faceReact('weep', 2600);
  UI.banner(T.msg.defeat(lost) + (kept ? T.msg.holdFrom(back) : ''), 'loss', 2400);
  // Первое поражение — момент показать заклинания: идл выигрывается и без них,
  // но игрок должен знать, что у него есть рука
  if (!game.spellHintShown) {
    game.spellHintShown = true;
    UI.hint(T.msg.hintSpell, '#spells');
  }
  save();
  refreshAll();
  scheduleNext(1400);
}

/* Одна кнопка предложения на два случая: что именно она делает, помнит pendingOffer.
   Награда выдаётся только по onRewarded — то есть после честно просмотренного ролика. */
function onOffer() {
  const offer = pendingOffer;
  if (!offer) { UI.hideOffer(); return; }
  YSDK.showRewarded(() => {
    if (offer.kind === 'champion') {
      for (const s in offer.got) game.remains[s][3] += offer.got[s];
      UI.banner(T.msg.doubled, 'win', 2000);
    } else if (offer.kind === 'rescue') {
      game.partyIndex = offer.snapshot.partyIndex;
      game.remains = offer.snapshot.remains;
      for (const e of game.army) if (e) e.hpFrac = 1;
      UI.banner(T.msg.rescued, 'win', 2000);
      scheduleNext(600);
    }
    pendingOffer = null;
    UI.hideOffer();
    save({ now: true });
    refreshAll();
  }, adPause);
}

/* ═══════════════ Ритуал ═══════════════ */
function onAddRemains(school, density) {
  const free = game.ritual.indexOf(null);
  if (free < 0 || game.remains[school][density] <= 0) return;
  Audio.ui.tap();
  game.remains[school][density]--;
  game.ritual[free] = { school, density };
  if (game.tutorial === 1 && !game.ritual.some(s => !s)) {
    game.tutorial = 2;
    UI.hint(T.msg.hintRaise, '#raise');
  }
  // Останок уже списан из запаса и лежит только в круге — сохраняем сразу,
  // иначе павшая вкладка уносит его с собой
  save();
  refreshAll();
}

function onClearSlot(i) {
  const s = game.ritual[i];
  if (!s) return;
  Audio.ui.tap();
  game.remains[s.school][s.density]++;
  game.ritual[i] = null;
  save();
  refreshAll();
}

/* Итог одного ритуала → изменение состояния. Общий для кнопки «Поднять» и пачки ×10.
   Возвращает строку для сводки и тип исхода для звука. */
function applyRitualResult(res) {
  const { school, defId } = res;
  if (!defId) return { kind: 'fail', text: T.msg.ritualFail };
  const name = T.units[defId];

  if (game.raised[defId] != null) {
    if (game.raised[defId] >= dupesForFullStars()) {
      game.remains[school][3] += 2;
      return { kind: 'dupe', text: T.msg.fullPower(name) };
    }
    const was = starsForDupes(game.raised[defId]);
    game.raised[defId]++;
    const now = starsForDupes(game.raised[defId]);
    if (now > was) {
      // Звёзды юнита в строю подрастают сразу — hpFrac не трогаем, статы возьмёт новый бой
      for (const e of game.army) if (e && e.defId === defId) e.stars = now;
      return { kind: 'star', text: T.msg.starUp(name, now) };
    }
    return { kind: 'dupe', text: T.msg.dupe(name) };
  }

  game.raised[defId] = 0;
  const free = game.army.indexOf(null);
  if (free >= 0) {
    // В строй новичок войдёт со следующей партии: менять состав посреди боя нельзя
    game.army[free] = { defId, stars: 1, hpFrac: 1 };
    return { kind: 'new', text: T.msg.raisedNew(name) };
  }
  return { kind: 'new', text: T.msg.raisedFull(name) };
}

/* Любой состоявшийся ритуал двигает туториал к последнему шагу — в том числе пачка
   ×10, которая круг руками не заполняет: иначе подсказка «заложи три в круг» висела
   с пульсом на кучках, пока игрок уже поднимал нежить десятками. */
function afterRitual(kind) {
  if (game.tutorial >= 3 || kind === 'fail') return;
  game.tutorial = 3;
  UI.hint(T.msg.hintGrow, '#army');
  // Селектор обязателен: без него таймер снял бы и чужую подсказку — например,
  // про заклинания после первого поражения, которой положено ждать каста
  setTimeout(() => { if (game.tutorial === 3) { game.tutorial = 4; UI.clearHint('#army'); save(); } }, 6000);
}

function onRaise() {
  if (game.ritual.some(s => !s)) return;
  const res = rollRitual(ritualRng, game.ritual, game.tier, Cards.deckMods(game.deck).ritualBonus);
  game.ritual = game.ritual.map(() => null);
  // Слот, купленный рекламой, живёт ровно один ритуал
  if (adSlotBonus) { adSlotBonus = 0; syncSlots(); }
  const out = applyRitualResult(res);
  game.manualRituals++;
  Audio.raised(out.kind);
  UI.faceReact(out.kind === 'fail' ? 'weep' : 'laugh', 1400);
  UI.banner(out.text[0].toUpperCase() + out.text.slice(1), out.kind === 'fail' ? 'loss' : 'win');
  if (out.kind !== 'fail') UI.toggleSheet(false);   // дело сделано — возвращаем игрока в бой
  afterRitual(out.kind);
  save();
  refreshAll();
}

/* Реворд №2: мгновенная перезарядка заклинаний. Реворд №3: четвёртый слот круга
   на один ритуал, пока узел «Четвёртый слот» не куплен насовсем. */
function onAdRecharge() {
  if (!battle || battle.over || !Object.values(battle.spellCds).some(t => t > 0)) return;
  YSDK.showRewarded(() => {
    Sim.resetCooldowns(battle);
    Audio.ui.toggle(true);
    refreshAll();
  }, adPause);
}

function onAdSlot() {
  if (mods().ritualSlots > 3 || adSlotBonus) return;   // узел куплен или слот уже выдан
  YSDK.showRewarded(() => {
    adSlotBonus = 1;
    syncSlots();
    Audio.ui.toggle(true);
    refreshAll();
  }, adPause);
}

// Разложить: заполнить круг самыми густыми останками — один тап вместо трёх-четырёх
function onAutoFill() {
  if (!unlocks().auto) return;
  const empty = game.ritual.filter(s => !s).length;
  if (!empty) return;
  const picked = pickSlots(game.remains, empty);
  if (!picked) { Audio.ui.error(); UI.banner(T.msg.needMore, 'loss'); return; }
  Audio.ui.tap();
  for (const p of picked) game.ritual[game.ritual.indexOf(null)] = p;
  if (game.tutorial === 1) { game.tutorial = 2; UI.hint(T.msg.hintRaise, '#raise'); }
  save();
  refreshAll();
}

/* ×10: приёмочный симулятор насчитал 12.5 тысячи ритуалов на забег — руками столько
   не сделать физически. Пачка тратит останки той же жадной стратегией и отчитывается
   сводкой, по одному баннеру на ритуал она бы стрекотала. */
function onBatch() {
  if (!unlocks().batch) return;
  const m = mods();
  const bonus = Cards.deckMods(game.deck).ritualBonus;
  const counts = {};
  let done = 0, best = null;
  for (let i = 0; i < 10; i++) {
    const slots = pickSlots(game.remains, m.ritualSlots + adSlotBonus);
    if (!slots) break;
    const out = applyRitualResult(rollRitual(ritualRng, slots, game.tier, bonus));
    counts[out.kind] = (counts[out.kind] || 0) + 1;
    if (out.kind === 'new' || (out.kind === 'star' && !best)) best = out.text;
    done++;
  }
  if (!done) { Audio.ui.error(); UI.banner(T.msg.needMore, 'loss'); return; }
  Audio.raised(counts.new ? 'new' : counts.star ? 'star' : 'dupe');
  const parts = [];
  if (counts.new) parts.push(T.msg.batchNew(counts.new));
  if (counts.star) parts.push(T.msg.batchStar(counts.star));
  if (counts.dupe) parts.push(T.msg.batchDupe(counts.dupe));
  if (counts.fail) parts.push(T.msg.batchFail(counts.fail));
  UI.banner(T.msg.batchReport(done, parts, best), 'win', 2600);
  UI.toggleSheet(false);
  afterRitual('new');
  save();
  refreshAll();
}

/* ═══════════════ Армия ═══════════════ */
/* Казарма. Раньше состав менялся от слота: тап по слоту открывал окно со списком
   поднятых, то есть своих слуг игрок видел только после того, как ткнул в пустоту.
   Теперь наоборот: казарма с поднятыми видна в ритуальном листе всегда, тап по юниту
   ставит его в строй или убирает. Строй полон — юнит выделяется (swapPick), и тап по
   слоту армии или по юниту в строю выбирает, кого он заменит. Как и раньше, состав
   вступает в силу со следующей партии: менять армию посреди боя нельзя. */
let swapPick = null;

function placeInSlot(slotIndex, defId) {
  game.army[slotIndex] = { defId, stars: starsForDupes(game.raised[defId]), hpFrac: 1 };
}

function onBarracksTap(defId) {
  const at = game.army.findIndex(e => e && e.defId === defId);
  if (swapPick && at >= 0) {
    // Выбран кандидат из казармы, тап по стоящему в строю — замена
    placeInSlot(at, swapPick);
    swapPick = null;
  } else if (at >= 0) {
    if (game.army.filter(Boolean).length <= 1) { Audio.ui.error(); UI.banner(T.msg.barracksLast, 'loss'); return; }
    game.army[at] = null;
    swapPick = null;
  } else {
    const free = game.army.indexOf(null);
    if (free >= 0) { placeInSlot(free, defId); swapPick = null; }
    else { swapPick = swapPick === defId ? null : defId; if (swapPick) UI.banner(T.msg.barracksSwap, '', 1800, { soft: true }); }
  }
  Audio.ui.tap();
  save();
  refreshAll();
}

function onSlotTap(i) {
  Audio.ui.tap();
  if (swapPick) { placeInSlot(i, swapPick); swapPick = null; save(); refreshAll(); return; }
  UI.focusBarracks();
}

/* Открытия кнопок. «Разложить» и ×10 с первой минуты делали главное решение игры —
   какие останки сложить в круг — за игрока, и суть пропускалась. Теперь их надо
   заслужить: «Разложить» после пяти ритуалов руками (или с третьего яруса — для
   старых сейвов), ×10 с четвёртого яруса, когда останков становится больше, чем
   разумно раскладывать руками. Каждое открытие объявляется один раз. */
function unlocks() {
  return { auto: game.manualRituals >= 5 || game.maxTier >= 3, batch: game.maxTier >= 4 };
}
function announceUnlocks() {
  const u = unlocks();
  let news = false;
  for (const k of ['auto', 'batch']) {
    if (u[k] && !game.seenUnlocks.includes(k)) {
      game.seenUnlocks.push(k);
      UI.banner(k === 'auto' ? T.msg.unlockAuto : T.msg.unlockBatch, 'win', 3200);
      news = true;
    }
  }
  if (news) save();
}

function onSpell(id) {
  if (!battle || battle.over || !game.deck.spells.includes(id)) return;
  UI.clearHint('#spells');
  pending.push(...Sim.castSpell(battle, id));
}

/* ═══════════════ Карточки некроманта ═══════════════
   После 5-й и 10-й победной партии следующий бой не начинается, пока игрок не выбрал
   карточку (решение пользователя 2026-10-07). Ключ «ярус:партия» помнит, за что карточка
   уже взята: перезагрузка не выдаёт её второй раз и не теряет, если окно закрыли вкладкой. */
const cardRng = Sim.makeRng((seed ^ 0x51ed27) >>> 0);
let cardKeyOpen = null;
let cardTimer = null;   // отложенное открытие окна: ритуал лича обязан его отменить

function openCardChoice(key, delay = 0) {
  clearTimeout(nextTimer);
  /* Бой, который сейчас на сцене, на время выбора замирает: после ритуала лича это
     бой прошлого забега, и без стопа он успел бы закончиться победой уже в новом. */
  ending = true;
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => {
    cardTimer = null;
    const ids = Cards.offerCards(game.deck, cardRng, 3);
    if (!ids.length) { Cards.markTaken(game.deck, key); save(); scheduleNext(300); return; }
    cardKeyOpen = key;
    paused = true;
    UI.openCards(ids, game.deck);
  }, delay);
}

function onCardPick(cardId, replaceSpell) {
  if (!cardKeyOpen) return;
  if (!Cards.applyCard(game.deck, cardId, replaceSpell)) { Audio.ui.error(); return; }
  Cards.markTaken(game.deck, cardKeyOpen);
  cardKeyOpen = null;
  UI.closeCards();
  paused = UI.modalHold();
  Audio.grimoireBuy();
  UI.faceReact('laugh', 1400);
  UI.banner(T.msg.cardTaken(T.cards.items[cardId].name), 'win', 1800);
  save();
  refreshAll();
  scheduleNext(400);
}

// Карточка, которая положена, но ещё не взята: после перезагрузки или ритуала лича
function pendingCardKey() {
  const d = game.deck;
  if (game.partyIndex >= 6 && !Cards.isTaken(d, `${game.tier}:5`)) return `${game.tier}:5`;
  if (game.partyIndex === 1 && game.tier > 1 && !Cards.isTaken(d, `${game.tier - 1}:10`)) return `${game.tier - 1}:10`;
  if (mods().firstCard && game.tier === 1 && game.partyIndex === 1 && !Cards.isTaken(d, 'start')) return 'start';
  return null;
}

function startOrOffer() {
  const key = pendingCardKey();
  // За окном выбора должно быть видно новое состояние (сейв, новый забег), а не прежнее
  if (key) { refreshAll(); openCardChoice(key, 600); }
  else startParty();
}

/* ═══════════════ Склеп: облик подземелья и некроманта ═══════════════
   Картинки облика — data-URI из art/pack.js (то, что видно в новой игре) и
   art/pack-extra.js (остальное, грузится import()-ом по требованию: открытием Склепа
   или надетой вещью из него). Image декодируется асинхронно, поэтому облик кладётся
   в сцену после await, а до того стоят процедурные текстуры. */
let packExtra = null;
async function loadExtra() {
  if (!packExtra) packExtra = (await import('./art/pack-extra.js')).PACK_EXTRA;
  return packExtra;
}
/* onload, а не Image.decode(): decode() в Chrome ждёт возможности отрисовки и в
   скрытой или заглушённой вкладке не завершается вовсе — облик тогда молча не
   применялся (поймано на панели предпросмотра). onload от отрисовки не зависит. */
function loadImage(uri) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = uri; });
}
const imgCache = new Map();
function img(uri) {
  if (!imgCache.has(uri)) imgCache.set(uri, loadImage(uri));
  return imgCache.get(uri);
}
// Ищем картинку сначала в базовом пакете, потом в дополнительном
const asset = (group, key) => PACK[group]?.[key] ?? packExtra?.[group]?.[key];

function applyLook() {
  // Облик не должен падать молча: без перехвата ошибка терялась в промисе, а сцена
  // тихо оставалась на запасных текстурах
  return loadLook().catch(e => console.error("облик не применился:", e));
}
async function loadLook() {
  const e = game.cosmetics.equip;
  const needExtra = [['floor', e.floor], ['wall', e.wall], ['necro', e.necro], ...e.decor.map(k => ['decor', k])]
    .some(([g, k]) => !PACK[g]?.[k]);
  if (needExtra) await loadExtra();
  const all = arr => Promise.all(arr.map(img));
  Render.setLook({
    floor: await all(asset('floor', e.floor)),
    wall: await all(asset('wall', e.wall)),
    decor: await all(e.decor.map(k => asset('decor', k))),
    necro: await img(asset('necro', e.necro)),
  });
  await UI.setFace({
    skin: e.necro,
    faces: { curse: PACK.face.curse, laugh: PACK.face.laugh, weep: PACK.face.weep },
    skinUri: asset('necro', e.necro),
    rank: Cos.frameRank(game.bestTier),
  });
}

// Достижения открывают вещи сами; каждое открытие — один баннер
function grantCosmetics() {
  const fresh = Cos.grantByAchievements(game.cosmetics, { bestTier: game.bestTier, lichCount: game.lichCount });
  for (const it of fresh) UI.banner(T.msg.cryptUnlocked(T.crypt.items[it.key]), 'win', 2600);
  if (fresh.length) save();
}

async function onCrypt() {
  Audio.ui.tap();
  await loadExtra();
  UI.openCrypt(game, { ...PACK, extra: packExtra });
}

function onCryptEquip(id) {
  if (!Cos.toggleEquip(game.cosmetics, id)) { Audio.ui.error(); UI.banner(T.msg.cryptFull, 'loss'); return; }
  Audio.ui.tap();
  save();
  applyLook();
  UI.openCrypt(game, { ...PACK, extra: packExtra });
}

function onCryptAd(id) {
  YSDK.showRewarded(() => {
    const opened = Cos.addView(game.cosmetics, id);
    if (opened) { Cos.toggleEquip(game.cosmetics, id); applyLook(); Audio.grimoireBuy(); }
    else Audio.ui.toggle(true);
    save({ now: true });
    UI.openCrypt(game, { ...PACK, extra: packExtra });
  }, adPause);
}

/* ═══════════════ Гримуар и ритуал лича ═══════════════ */
function onGrimoire() { Audio.ui.tap(); UI.openGrimoire(game); }

function onGrimoireBuy(nodeId) {
  const node = GRIMOIRE.find(n => n.id === nodeId);
  if (!node) return;
  const bought = game.grimoire[nodeId] || 0;
  const cost = grimoireStepCost(node, bought);
  if (bought >= node.steps || game.essence < cost) { Audio.ui.error(); return; }
  game.essence -= cost;
  game.grimoire[nodeId] = bought + 1;
  Audio.grimoireBuy();
  syncSlots();
  save();
  refreshAll();
  UI.openGrimoire(game);   // перерисовать с новыми ценами
}

function onLich() {
  if (!game.lichUnlocked) return;
  Audio.ui.tap();
  UI.openLich(game, essenceFor(game.maxTier), true);
}

// Реворд №5: ×2 к тёмной эссенции в момент ритуала лича
function onLichConfirm(withAd) {
  if (withAd) {
    YSDK.showRewarded(() => doLich(2), adPause);
    return;
  }
  doLich(1);
}

function doLich(mul) {
  const gained = essenceFor(game.maxTier) * mul;
  game.essence += gained;
  game.lichCount++;
  grantCosmetics();

  // «Припрятанное»: до 2n кристаллов переживают сброс, забираем из самых богатых школ
  let allowance = mods().keepCrystals;
  const kept = emptyRemains();
  const bySchool = SCHOOL_IDS.slice().sort((a, b) => game.remains[b][3] - game.remains[a][3]);
  for (const s of bySchool) {
    const take = Math.min(game.remains[s][3], allowance);
    kept[s][3] = take;
    allowance -= take;
  }

  /* Выбор карточки прошлого забега сгорает вместе с ним: и уже открытое окно,
     и отложенное после победы. Иначе карточка попала бы в колоду нового забега. */
  clearTimeout(cardTimer);
  cardTimer = null;
  const hadCards = !!cardKeyOpen;
  if (cardKeyOpen) { cardKeyOpen = null; UI.closeCards(); }

  Object.assign(game, freshRun());
  game.remains = kept;
  adSlotBonus = 0;
  syncSlots();
  Render.clearDecals();
  Audio.lichRitual();
  UI.closeLich();
  UI.hideOffer();
  pendingOffer = null;
  UI.banner(T.msg.lichDone(gained), 'win', 3200);
  // Пауза снимается, только если её держало закрытое сейчас окно карточек (не реклама)
  if (hadCards) paused = UI.modalHold();
  save({ now: true });
  startOrOffer();         // с «Первой карточкой» новый забег начинается с выбора
}

/* ═══════════════ Звук ═══════════════ */
function onMute() {
  game.muted = !game.muted;
  Audio.setMuted(game.muted);
  Audio.ui.toggle(!game.muted);
  save();
  UI.renderHud(game);
}

/* ═══════════════ Ежедневный бонус ═══════════════ */
function checkDaily() {
  const day = d => d.toLocaleDateString('sv');   // YYYY-MM-DD локального времени
  const today = day(new Date());
  if (game.daily.last === today) return;
  const yesterday = day(new Date(Date.now() - 864e5));
  game.daily.streak = game.daily.last === yesterday ? game.daily.streak + 1 : 1;
  game.daily.last = today;
  const n = ((game.daily.streak - 1) % 7) + 1;   // серия из семи, потом заново

  const got = [];
  for (let i = 0; i < n; i++) {
    const s = SCHOOL_IDS[Math.floor(ritualRng() * SCHOOL_IDS.length)];
    game.remains[s][1]++;
    got.push(SCHOOLS[s].remains);
  }
  let extra = '';
  if (n >= 4) { const s = SCHOOL_IDS[Math.floor(ritualRng() * 4)]; game.remains[s][2]++; extra = T.msg.dailyDense; }
  if (n === 7) { const s = SCHOOL_IDS[Math.floor(ritualRng() * 4)]; game.remains[s][3]++; extra += T.msg.dailyCrystal; }
  Audio.daily();
  UI.banner(T.msg.daily(n, extra), 'win', 3000);
  save();
}

/* ═══════════════ Туториал ═══════════════ */
function tutorialAfterVictory() {
  if (game.tutorial !== 0) return;
  game.tutorial = 1;
  UI.hint(T.msg.hintStock, '#stock');
}

/* ═══════════════ Обновление интерфейса ═══════════════ */
function refreshAll() {
  UI.renderSpells(game.deck);
  UI.renderHud(game);
  UI.renderRemains(game);
  UI.renderCircle(game);
  UI.renderArmy(game, battle, swapPick);
  UI.renderBarracks(game, swapPick);
  UI.renderUnlocks(unlocks());
  announceUnlocks();
  UI.tickSpells(battle);   // иначе до первого кадра цикла перезарядки не проставлены
  UI.renderAds({ slotOffer: mods().ritualSlots === 3 && !adSlotBonus });
}

/* ═══════════════ Цикл ═══════════════ */
let last = performance.now();
let hpRefresh = 0;
/* Замедление на падении чемпиона. Полсекунды на 45% скорости — самый дешёвый
   кинематографичный приём, какой есть: чемпион был стеной яруса, и его смерть обязана
   ощущаться иначе, чем смерть ополченца. Симуляция принимает dt снаружи, поэтому
   замедление честное и ничего не ломает. */
let slowmo = 0;

function loop(now) {
  let dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (slowmo > 0) { slowmo = Math.max(0, slowmo - dt); dt *= 0.45; }

  let events = [];
  if (battle && !ending && !paused) events = Sim.tick(battle, dt);
  if (pending.length) { events = pending.concat(events); pending.length = 0; }
  // Посмертный спавн добавляет юнита прямо посреди боя — сцене нужен новый объект
  if (battle && events.some(e => e.type === 'spawn')) Render.syncUnits(battle);
  // Падение чемпиона — единственное событие, ради которого стоит трогать время
  if (battle && events.some(e => e.type === 'death' &&
      battle.heroes.some(h => h.uid === e.uid && h.champion))) slowmo = 0.55;
  if (battle) Render.frame(battle, events, dt);
  Audio.battle(events);
  UI.tickSpells(battle);
  UI.setCasting(Render.castPulse() > 0);

  if (battle && battle.over && !ending) {
    ending = true;
    UI.renderArmy(game, battle);
    if (battle.over === 'undead') onVictory(); else onDefeat();
  }
  // Полоски здоровья в панели армии обновляем не каждый кадр — трижды в секунду хватает
  hpRefresh += dt;
  if (battle && !ending && hpRefresh > 0.33) { hpRefresh = 0; UI.renderArmy(game, battle); }

  requestAnimationFrame(loop);
}

/* ═══════════════ Запуск ═══════════════ */
function resize() {
  // Габариты интерфейса меряются по факту: раскладка адаптивная, и угадывать их нельзя
  Render.resize(window.innerWidth, window.innerHeight, UI.insets());
}

/* Порядок обязателен по п. 1.19 и на нём уже был отказ у соседней игры:
   init SDK → язык → загрузка сейва → LoadingAPI.ready() → показ интерфейса →
   GameplayAPI.start(). Экран загрузки снимается ровно на ready(). */
async function boot() {
  // Панели из JS перерисовываются на смену языка сами — пока их некому рисовать,
  // подписка ждёт: refreshAll до UI.init() упал бы на пустой разметке
  Render.init(document.getElementById('scene'));
  UI.init({ onAddRemains, onClearSlot, onRaise, onAutoFill, onBatch, onSlotTap, onBarracksTap,
            onSpell, onGrimoire, onGrimoireBuy, onLich, onLichConfirm, onMute,
            onAdRecharge, onAdSlot, onOffer, onSheet: () => resize(),
            onCrypt, onCryptEquip, onCryptAd, onCardPick,
            // Справочник читают, а не смотрят бой: на это время бой стоит
            onHelp: open => { paused = open; } });
  onLangChange(refreshAll);
  setLang(navigator.language || 'ru');     // предварительный — чтобы русский не мелькал в EN
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 120));

  await YSDK.init();
  setLang(YSDK.lang());                    // окончательный — из окружения платформы
  const remote = await YSDK.loadRemote();
  load(remote);
  Audio.init(game.muted);
  syncSlots();
  grantCosmetics();
  // Не ждём: облик ляжет поверх запасных текстур через кадр-другой. Ждёт только вступление
  const lookReady = applyLook();

  /* Пауза геймплея на скрытой вкладке — требование модерации. Звук глушит сам
     генератор, бой останавливаем здесь: иначе вернувшийся игрок находит проигранный
     в его отсутствие рейд. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { paused = true; YSDK.gameplayStop(); save({ now: true }); }
    else { paused = UI.modalHold(); YSDK.gameplayStart(); }
  });
  window.addEventListener('beforeunload', () => save({ now: true }));

  // Тап по сцене — проверка того, что raycast работает и уцелеет при переходе в 3D
  document.getElementById('scene').addEventListener('pointerdown', e => {
    const uid = Render.pick(e.clientX, e.clientY);
    if (!uid || !battle) return;
    const u = Sim.findById(battle, uid);
    // hp дробный от яда — тапу по юниту нужны целые числа
    const name = u && (u.side === 'undead' ? T.units[u.defId] : T.heroes[u.defId]);
    if (u) UI.banner(`${name} · ${Math.round(u.hp)}/${u.maxHp}`, '', 1100, { soft: true });
  });

  YSDK.gameReady();
  UI.hideLoading();

  checkDaily();
  startOrOffer();
  YSDK.gameplayStart();
  /* Вступление — до первого боя: игрок, который не знает, что это за игра, первые
     секунды боя всё равно не поймёт. Бой стоит, пока он читает. Старым сейвам с
     пройденным туториалом вступление не показываем: они игру уже знают. */
  if (!game.introSeen && game.tutorial === 0) {
    paused = true;
    // После облика: на первом экране лицо некроманта, и это должно быть уже новое лицо
    lookReady.then(() => UI.openIntro(() => { game.introSeen = true; paused = false; save(); }));
  } else if (game.tutorial === 0) UI.banner(T.msg.intro, '', 2600);
  if (!game.introSeen && game.tutorial > 0) game.introSeen = true;
  requestAnimationFrame(loop);
}

/* Отладочные крючки открываются только по ?debug или ?shim: скрытая панель браузера
   душит таймеры, поэтому кадры для съёмки крутятся синхронно. В обычной игре крючков нет. */
if (qs.has('debug') || qs.has('shim')) {
  window.__necro = {
    game,
    next() { startParty(); },
    resizeTo(w, h) { Render.resize(w, h); },
    step(seconds = 1, dt = 1 / 30) {
      const n = Math.max(1, Math.round(seconds / dt));
      for (let i = 0; i < n; i++) {
        let ev = battle && !ending ? Sim.tick(battle, dt) : [];
        if (pending.length) { ev = pending.concat(ev); pending.length = 0; }
        if (battle && ev.some(e => e.type === 'spawn')) Render.syncUnits(battle);
        if (battle) Render.frame(battle, ev, dt);
      }
      UI.renderArmy(game, battle);
      UI.tickSpells(battle);
    },
    cast(id) { onSpell(id); },
    probe() {
      return battle.undead.map(u => ({ имя: u.name, жив: u.alive, ...Render.debugUnit(u.uid) }));
    },
    scene() { return Render.debugScene(); },
    layout() { return Render.debugLayout(); },
    // Разрешение боя без ожидания таймеров: в скрытой панели setTimeout душится
    finish(who = 'undead') {
      for (const u of (who === 'undead' ? battle.heroes : battle.undead)) { u.alive = false; u.hp = 0; }
      battle.over = who;
      ending = true;
      if (who === 'undead') onVictory(); else onDefeat();
    },
    give(school, density, n = 1) { game.remains[school][density] += n; refreshAll(); },
    essence(n = 100) { game.essence += n; refreshAll(); },
    wipe() { wiping = true; localStorage.removeItem(SAVE_KEY); location.reload(); },
    snapshot() {
      return {
        tier: game.tier, party: game.partyIndex, over: battle && battle.over,
        essence: game.essence, grimoire: game.grimoire, tutorial: game.tutorial,
        undead: battle.undead.map(u => `${u.name} ${Math.round(u.hp)}/${u.maxHp}${u.alive ? '' : ' †'}`),
        heroes: battle.heroes.map(u => `${u.name} ${Math.round(u.hp)}/${u.maxHp}${u.alive ? '' : ' †'}`),
        remains: game.remains, raised: game.raised,
      };
    },
  };
}

boot();
