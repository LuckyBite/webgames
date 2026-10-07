// Звук игры. Слой между событиями симуляции и генератором vendor/sfx.js
// (классический скрипт, глобальный SFX — копия shared/sfx.js, там весь синтез).
// Здесь только выбор рецептов и дисциплина громкости: модерация уже поднимала
// возраст соседней игре за резкие звуки, поэтому мастер прижат, а не рецепты.

// SFX объявлен в классическом скрипте через const — это глобальная лексическая
// привязка, у window такого свойства НЕТ. Модуль видит её по голому имени.
const S = () => SFX;

let on = false;          // включён ли звук по сохранению; unlock браузера отдельно
let ambOn = false;
// Накал помним сами: music.start с тем же mood перезаписывает интенсивность, и
// возврат на вкладку посреди боя с чемпионом ронял музыку обратно на спокойную.
let intensity = 0.45;

export function init(muted) {
  S().setVolume(0.55);
  // Гамма подземелья: ля-минор — рецепты coin/combo тоже лягут в неё
  S().setKey(45, 'minor');
  setMuted(muted);

  /* Эмбиент и музыку нельзя завести до первого жеста — браузер не даст звука.
     Стартуем с первого pointerdown; SFX.unlock уже подписан у самого генератора. */
  window.addEventListener('pointerdown', () => { if (!on) return; startBeds(); }, { once: false });

  // Модерация: на скрытой вкладке игра обязана замолчать. Музыку глушит сам sfx,
  // эмбиент — нет: его петля жила бы и в фоне.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { S().amb.stop(); ambOn = false; }
    else if (on) startBeds();
  });
}

function startBeds() {
  if (ambOn || document.hidden) return;
  S().amb.start('cave');
  S().music.start('necro', intensity);
  ambOn = true;
}

export function setMuted(muted) {
  on = !muted;
  S().setMuted(muted);
  if (muted) ambOn = false;
  else startBeds();
}
export const isOn = () => on;

// Накал музыки: чемпион слышен раньше, чем виден
export function heat(champion) {
  intensity = champion ? 0.85 : 0.45;
  S().music.set(intensity);
}

/* ═══════════════ События боя ═══════════════
   Из пачки событий кадра озвучивается по одному на тип: каша из десяти ударов
   звучит хуже одного, а троттлинг одинаковых рецептов есть и в самом sfx. */
export function battle(events) {
  if (!on) return;
  let hit = null, death = null, blast = false;
  for (const e of events) {
    if (e.type === 'hit' || e.type === 'splash') hit = hit || e;
    else if (e.type === 'blast') { hit = hit || e; blast = true; }
    else if (e.type === 'death') death = death || e;
    else if (e.type === 'spell') spell(e.id);
    else if (e.type === 'rise') S().portal({ v: 0.5 });
    else if (e.type === 'thorns') S().spark({ v: 0.35 });
  }
  // Взрыв «Праха к праху» приходит в одной пачке со смертью проклятого, поэтому
  // звучит независимо от ветки смерти, иначе его не слышно никогда
  if (blast) S().explode({ v: 0.4 });
  if (death) {
    // Стороны различимы вслепую: герой падает живым — стон, лязг доспеха, осыпь;
    // нежить гибнет по-своему для каждой школы. Прежние одиночные треск и «провал»
    // тонули под ударами, и смерть в бою не слышалась вовсе.
    if (death.side === 'heroes') heroDeath();
    else undeadDeath(death.school);
  } else if (hit) {
    if (blast) { /* взрыв уже прозвучал выше */ }
    else if (hit.school === 'bone' || hit.school === null) S().clang({ v: 0.3, ring: 0.5 });
    else S().thud({ v: 0.35 });
  }
}

function heroDeath() {
  S().fail({ v: 0.42 });                          // нисходящий стон
  S().clang({ v: 0.32, f: 170, ring: 0.6, t: 0.03 }); // доспех об камень
  S().brk({ v: 0.45, t: 0.12 });                  // осыпь
}

function undeadDeath(school) {
  if (school === 'bone') {
    // Кости рассыпаются: треск и мелкий высокий перестук
    S().brk({ v: 0.5 });
    for (let i = 0; i < 4; i++) S().clang({ v: 0.12, f: 700 + i * 140, ring: 0.15, t: 0.05 + i * 0.06 });
  } else if (school === 'rot') {
    // Плоть оседает: глухой удар и хлюпанье
    S().thud({ v: 0.55 });
    for (let i = 0; i < 3; i++) S().bubble({ v: 0.7, t: 0.06 + i * 0.07 });
  } else if (school === 'soul') {
    // Дух развеивается воем
    S().whoosh({ v: 0.5, d: 0.6 });
    S().curse({ v: 0.28 });
  } else {
    // Прах осыпается с шипением
    S().fire({ v: 0.45 });
    S().whoosh({ v: 0.3, d: 0.25, t: 0.05 });
  }
}

function spell(id) {
  if (id === 'bolt') S().spell({ v: 0.8 });
  else if (id === 'frenzy') { S().whoosh({ v: 0.7 }); S().spark({ v: 0.5, t: 0.08 }); }
  else if (id === 'wall') { S().clang({ v: 0.5, f: 140, ring: 1.2 }); S().thud({ v: 0.5 }); }
  else if (id === 'plague') {
    for (let i = 0; i < 3; i++) S().bubble({ v: 0.8, t: i * 0.06 });
    S().curse({ v: 0.3 });
  }
  else if (id === 'howl') { S().whoosh({ v: 0.7, d: 0.9 }); S().curse({ v: 0.45 }); }
  else if (id === 'curse') S().curse({ v: 0.7 });
  else if (id === 'drain') { S().spell({ v: 0.6 }); S().portal({ v: 0.4, t: 0.1 }); }
}

/* ═══════════════ Разовые ═══════════════ */
export const ui = {
  tap() { if (on) S().tap(); },
  error() { if (on) S().error({ v: 0.7 }); },
  toggle(state) { if (on) S().toggle({ on: state }); },
};

export function victory(remainsCount) { if (on) S().coins({ n: Math.min(6, remainsCount), v: 0.6 }); }
export function tierUp() { if (on) S().fanfare({ v: 0.55 }); }
export function defeat() { if (on) { S().fail({ v: 0.7 }); S().curse({ v: 0.4, t: 0.2 }); } }
export function championComes() { if (on) S().bell({ v: 0.6 }); }

export function raised(kind) {
  if (!on) return;
  if (kind === 'new') S().reveal({ v: 0.8 });
  else if (kind === 'star') S().levelup({ v: 0.6 });
  else if (kind === 'dupe') S().pickup({ v: 0.5 });
  else S().error({ v: 0.5 });
}
export function grimoireBuy() { if (on) S().levelup({ v: 0.7 }); }
export function lichRitual() { if (on) { S().portal({ v: 0.9 }); S().curse({ v: 0.6, t: 0.4 }); S().bell({ v: 0.5, t: 1.0 }); } }
export function daily() { if (on) S().coins({ n: 5, v: 0.55 }); }
