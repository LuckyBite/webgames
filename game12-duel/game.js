/* ═══════════════════════════════════════════════════════════════════════════
   «Лунные Дуэли» — пиксельная дуэль 2–4 бойцов в пещерных руинах.
   Арт и звук — готовые CC0/бесплатные паки (см. CREDITS.md), здесь только логика.

   Тезис арт-дирекции: «драка в темноте, где светятся только кровь и огонь».
     Свет: подземный холод пещеры, тёплые пятна у фонарей и люстры.
     Палитра: холодный сине-чёрный камень Szadi, тёплое дерево; право на акцент
              у крови и у вспышек взрыва.
     Заполнение: руины замка, вросшие в пещеру: окна, колонны, мостки, ящики.
     Движение покоя: фонари и люстра покачиваются, бойцы дышат в стойке.

   Устройство: каждый раунд у бойца случайная раса (свой ближний бой из анимаций
   пака). Дальнобойное оружие подбирается: лук, меч скелета, бомба, око, споры.
   Разрушаются ящики, деревянные мостки и люстра.
   ═══════════════════════════════════════════════════════════════════════════ */
(() => {
'use strict';

if (typeof SFX === 'undefined') window.SFX = { play() {}, unlock() {}, setMuted() {}, explode() {}, whoosh() {},
  music: { start() {}, set() {}, stop() {} }, amb: { start() {}, stop() {} } };
const MAN = window.MANIFEST;
const A = 'assets/game/';

// ─────────────────────────────────────────────────────────────── константы
const T = 16, COLS = 40, ROWS = 23, WW = COLS * T, WH = ROWS * T;
const GRAV = 1150, JUMP = 470, RUN = 125, MAXFALL = 620, DT = 1 / 60;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sgn = v => v > 0 ? 1 : v < 0 ? -1 : 0;
// честное перемешивание: sort со случайным сравнением даёт перекос (воин выпадал вдвое чаще ведьмы)
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ─────────────────────────────────────────────────────────────── тексты
const STR = {
  ru: {
    title: 'Fairy Fighters', sub: 'Кровавые дуэли фэнтези-бойцов',
    play: 'В бой', mode: 'Режим', solo: 'Дуэль', duo: 'Вдвоём', surv: 'Выживание',
    wave: 'Волна', left: 'врагов', waveDone: 'Волна пройдена!', survDead: 'Вы пали на волне', kills: 'Убито', best: 'Рекорд', enemy: 'Враг',
    bots: 'Ботов', diff: 'Боты', easy: 'Слабые', normal: 'Обычные', hard: 'Злые',
    wins: 'До побед', blood: 'Кровь', sound: 'Звук', on: 'Вкл', off: 'Выкл',
    pause: 'Пауза', resume: 'Продолжить', menu: 'В меню', again: 'Ещё матч',
    you: 'Вы', p1: 'Игрок 1', p2: 'Игрок 2', bot: 'Бот',
    round: 'Раунд', fight: 'В бой!', takes: 'берёт раунд', draw: 'Ничья',
    matchWin: 'побеждает в матче!', points: 'очков', quake: 'Пещера рушится!',
    tShoot: 'Выстрел', tJump: 'Прыжок', tAtk: 'Удар', tDown: 'Вниз',
    ctrlSolo: 'Ходить: стрелки или WASD. Прыжок: пробел или вверх. Удар: J. Выстрел: K. Вниз: спрыгнуть с уступа или сменить оружие. Вверх или вниз при выстреле меняют прицел.',
    ctrlDuo: 'Игрок 1: WASD, удар F, выстрел G. Игрок 2: стрелки, удар 1, выстрел 2 на цифровой клавиатуре (или , и .).',
    races: {
      warrior: ['Воин', 'Три удара подряд, третий самый сильный'],
      king: ['Король', 'Длинный меч и крепкая броня'],
      huntress: ['Охотница', 'Выходит с луком, прыгает выше всех'],
      wizard: ['Колдун', 'Огромный и медленный, бьёт далеко'],
      samurai: ['Самурай', 'Быстрый, длинный удар катаной'],
      goblin: ['Гоблин', 'Мелкий и шустрый, с бомбами'],
      skeleton: ['Скелет', 'Один раз встаёт после смерти'],
      mushroom: ['Гриб', 'Кидается ядовитыми спорами'],
      knight: ['Рыцарь', 'Тяжёлые латы, широкий удар'],
      elf: ['Эльфийка', 'Стреляет из лука с любого расстояния'],
      ninja: ['Ниндзя', 'Самый быстрый, режет с разбега'],
      witch: ['Ведьма', 'Огнём из ладони поджигает врага'],
      vampire: ['Вампирша', 'Кровавые сгустки лечат её саму'],
      mimic: ['Мимик', 'Сундук с зубами, кусает больно'],
      worm: ['Червь', 'Плюётся огненными шарами'],
      assassin: ['Убийца', 'Режет серией из трёх ударов'],
      bones: ['Костолом', 'Скелет с огромным костяным мечом'],
      zombie: ['Зомби', 'Медленный, но очень живучий'],
      darkknight: ['Тёмный рыцарь', 'Копьём достаёт издалека'],
      archer: ['Лучник', 'Стреляет быстрее эльфийки'],
      wanderer: ['Странник', 'Широкие взмахи меча'],
    },
    arena: 'Арена', random: 'Любая', arenas: { hall: 'Зал', chasm: 'Пропасть', tower: 'Башня', forest: 'Лес', castle: 'Замок', temple: 'Храм' },
    weap: { bow: 'Лук', sword: 'Мечи', bomb: 'Бомбы', eye: 'Око', spore: 'Споры', scroll: 'Свиток огня', flask: 'Огненная склянка', storm: 'Свиток молний', frost: 'Ледяной свиток', earth: 'Свиток земли', heal: 'Зелье лечения', none: 'без оружия' },
  },
  en: {
    title: 'Fairy Fighters', sub: 'Bloody duels of fantasy fighters',
    play: 'Fight', mode: 'Mode', solo: 'Duel', duo: 'Two players', surv: 'Survival',
    wave: 'Wave', left: 'foes left', waveDone: 'Wave cleared!', survDead: 'You fell on wave', kills: 'Kills', best: 'Best', enemy: 'Foe',
    bots: 'Bots', diff: 'Bots are', easy: 'Weak', normal: 'Normal', hard: 'Mean',
    wins: 'Wins to take', blood: 'Blood', sound: 'Sound', on: 'On', off: 'Off',
    pause: 'Paused', resume: 'Resume', menu: 'Menu', again: 'Rematch',
    you: 'You', p1: 'Player 1', p2: 'Player 2', bot: 'Bot',
    round: 'Round', fight: 'Fight!', takes: 'takes the round', draw: 'Draw',
    matchWin: 'wins the match!', points: 'pts', quake: 'The cave is collapsing!',
    tShoot: 'Shoot', tJump: 'Jump', tAtk: 'Hit', tDown: 'Down',
    ctrlSolo: 'Move: arrows or WASD. Jump: space or up. Hit: J. Shoot: K. Down: drop from a ledge or swap weapon. Hold up or down while shooting to aim.',
    ctrlDuo: 'Player 1: WASD, hit F, shoot G. Player 2: arrows, hit Numpad 1, shoot Numpad 2 (or , and .).',
    races: {
      warrior: ['Warrior', 'Three-hit combo, the last one hurts most'],
      king: ['King', 'Long sword and tough armor'],
      huntress: ['Huntress', 'Starts with a bow, jumps highest'],
      wizard: ['Warlock', 'Huge and slow, long reach'],
      samurai: ['Samurai', 'Fast with a long katana slash'],
      goblin: ['Goblin', 'Small, quick, carries bombs'],
      skeleton: ['Skeleton', 'Gets back up once after death'],
      mushroom: ['Mushroom', 'Throws poison spores'],
      knight: ['Knight', 'Heavy armor, wide swing'],
      elf: ['Elf', 'Shoots her bow from any range'],
      ninja: ['Ninja', 'Fastest of all, slashes on the run'],
      witch: ['Witch', 'Sets foes on fire from her palm'],
      vampire: ['Vampire', 'Blood bolts heal her'],
      mimic: ['Mimic', 'A chest with teeth, bites hard'],
      worm: ['Worm', 'Spits fireballs'],
      assassin: ['Assassin', 'Cuts with a three-hit combo'],
      bones: ['Bonebreaker', 'Skeleton with a huge bone sword'],
      zombie: ['Zombie', 'Slow but very tough'],
      darkknight: ['Dark Knight', 'Reaches far with his lance'],
      archer: ['Archer', 'Shoots faster than the elf'],
      wanderer: ['Wanderer', 'Wide sword swings'],
    },
    arena: 'Arena', random: 'Any', arenas: { hall: 'Hall', chasm: 'Chasm', tower: 'Tower', forest: 'Forest', castle: 'Castle', temple: 'Temple' },
    weap: { bow: 'Bow', sword: 'Swords', bomb: 'Bombs', eye: 'Eye', spore: 'Spores', scroll: 'Fire scroll', flask: 'Fire flask', storm: 'Lightning scroll', frost: 'Frost scroll', earth: 'Earth scroll', heal: 'Healing potion', none: 'unarmed' },
  },
};
let L = STR.ru;

// ─────────────────────────────────────────────────────────────── расы и оружие
// dmg — урон каждой атаки по порядку (atk1, atk2, atk3); box — ширина и рост тела.
const RACE = {
  // reach — потолок дальности удара: у колдуна и самурая оружие в анимации уходит за 90 px,
  // без потолка они выигрывали 87% и 70% раундов (прогон 1 на 1, 500 раундов)
  warrior:  { hp: 100, spd: 1.0,  jump: 1.0,  dmg: [14, 16, 24], kb: 1.0,  mass: 1.0, box: [18, 44], atkSpd: 1.05, reach: 56 },
  king:     { hp: 100, spd: 0.95, jump: 1.0,  dmg: [14, 16, 25], kb: 1.0,  mass: 1.1, box: [18, 50], atkSpd: 0.9, reach: 58 },
  huntress: { hp: 85,  spd: 1.15, jump: 1.12, dmg: [13, 13, 10], kb: 0.8,  mass: 0.9, box: [16, 40], atkSpd: 1.15, reach: 50, start: 'bow' },
  wizard:   { hp: 90, spd: 0.8,  jump: 0.95, dmg: [18, 22],     kb: 1.3,  mass: 1.2, box: [24, 70], atkSpd: 0.8, reach: 64 },
  samurai:  { hp: 90,  spd: 1.1,  jump: 1.05, dmg: [18, 20],     kb: 1.0,  mass: 1.0, box: [18, 48], atkSpd: 1.05, reach: 60 },
  goblin:   { hp: 100,  spd: 1.3,  jump: 1.05, dmg: [16, 20],     kb: 0.8,  mass: 0.8, box: [16, 34], atkSpd: 1.35, reach: 48, start: 'bomb' },
  skeleton: { hp: 80,  spd: 0.9,  jump: 0.97, dmg: [18, 18],     kb: 1.0,  mass: 0.9, box: [18, 48], atkSpd: 1.0, reach: 56, revive: true },
  knight:   { hp: 110, spd: 0.95, jump: 1.0,  dmg: [12, 22],     kb: 1.1,  mass: 1.2, box: [20, 48], atkSpd: 1.0,  reach: 60 },
  elf:      { hp: 85,  spd: 1.15, jump: 1.15, dmg: [14],         kb: 0.6,  mass: 0.8, box: [16, 34], atkSpd: 1.3,  reach: 30, shot: { k: 'arrow2', dmg: 17, spd: 430, grav: 180 } },
  ninja:    { hp: 80,  spd: 1.25, jump: 1.15, dmg: [15, 17],     kb: 1.0,  mass: 0.9, box: [16, 50], atkSpd: 1.2,  reach: 58 },
  witch:    { hp: 95,  spd: 0.95, jump: 1.0,  dmg: [11],          kb: 0.7,  mass: 1.0, box: [16, 50], atkSpd: 1.0,  reach: 62, burn: 3.5, hitAt: 0.6 },
  vampire:  { hp: 85,  spd: 1.0,  jump: 1.0,  dmg: [15],         kb: 0.8,  mass: 1.0, box: [16, 48], atkSpd: 1.0,  reach: 40, shot: { k: 'vampbolt', dmg: 15, spd: 300, grav: 0, leech: 0.6 } },
  mimic:    { hp: 125, spd: 0.9,  jump: 0.95, dmg: [18, 22],     kb: 1.0,  mass: 1.3, box: [30, 28], atkSpd: 0.95, reach: 52 },
  // третья волна (09.10), Szadi art: «Hero and Opponents» и «2D SL Knight»
  assassin: { hp: 90,  spd: 1.15, jump: 1.1,  dmg: [14, 16, 24], kb: 1.0,  mass: 0.9, box: [16, 52], atkSpd: 1.15, reach: 56 },
  bones:    { hp: 85,  spd: 0.95, jump: 1.0,  dmg: [20, 22],     kb: 1.2,  mass: 1.0, box: [18, 52], atkSpd: 0.9,  reach: 62 },
  zombie:   { hp: 100, spd: 0.8,  jump: 0.95, dmg: [14, 17],     kb: 0.9,  mass: 1.2, box: [18, 52], atkSpd: 0.9,  reach: 50 },
  darkknight:{ hp: 95, spd: 0.9, jump: 0.97, dmg: [15, 18],     kb: 1.2,  mass: 1.3, box: [20, 54], atkSpd: 0.85, reach: 56 },
  archer:   { hp: 80,  spd: 1.05, jump: 1.05, dmg: [16],         kb: 0.7,  mass: 0.9, box: [16, 50], atkSpd: 1.1,  reach: 36, shot: { k: 'arrow2', dmg: 16, spd: 450, grav: 160 } },
  wanderer: { hp: 100, spd: 1.05, jump: 1.05, dmg: [14, 22],     kb: 1.0,  mass: 1.0, box: [16, 42], atkSpd: 1.1,  reach: 60 },
  worm:     { hp: 105,  spd: 0.8,  jump: 0.95, dmg: [14],         kb: 0.8,  mass: 1.2, box: [30, 36], atkSpd: 0.8,  reach: 40, shot: { k: 'fireball', dmg: 15, spd: 260, grav: 160, r: 22, burn: 2 } },
  mushroom: { hp: 105,  spd: 1.0,  jump: 1.0,  dmg: [16, 19],     kb: 0.9,  mass: 0.9, box: [14, 34], atkSpd: 1.25, reach: 50, start: 'spore' },
};
const RACES = Object.keys(RACE);
const BONY = new Set(['skeleton', 'bones']);
const WEAP = {
  bow:   { ammo: 6, cd: 0.45, spd: 400, grav: 330, dmg: 22, w: 5 },
  sword: { ammo: 3, cd: 0.5,  spd: 330, grav: 260, dmg: 30, w: 4 },
  bomb:  { ammo: 2, cd: 0.6,  spd: 230, grav: 700, dmg: 65, r: 46, fuse: 1.5, w: 4 },
  eye:   { ammo: 6, cd: 0.32, spd: 310, grav: 0,   dmg: 15, w: 3 },
  spore: { ammo: 3, cd: 0.55, spd: 250, grav: 520, dmg: 7,  r: 34, w: 3 },
  storm: { ammo: 5, cd: 0.55, dmg: 22, range: 280 },                         // мгновенная молния до первой цели
  frost: { ammo: 3, cd: 0.6,  spd: 300, grav: 0, dmg: 8, r: 34, freeze: 1.6 },// ледяной шар: замораживает всех рядом
  earth: { ammo: 3, cd: 0.7,  dmg: 26, range: 260 },                         // шипы из-под ног врага через 0,28 с
  scroll: { ammo: 4, cd: 0.55, spd: 290, grav: 0,   dmg: 20, r: 26, w: 3 },     // кастует огненный шар червя
  flask:  { ammo: 2, cd: 0.6,  spd: 240, grav: 650, dmg: 6,  w: 3 },            // разбивается, оставляет лужу огня
};
const WKEYS = Object.keys(WEAP);
const DIFF = {
  easy:   { react: 0.42, agg: 0.45, shoot: 0.35, dodge: 0.05, aimErr: 0.25 },
  normal: { react: 0.26, agg: 0.7,  shoot: 0.6,  dodge: 0.25, aimErr: 0.1 },
  hard:   { react: 0.14, agg: 0.9,  shoot: 0.85, dodge: 0.5,  aimErr: 0.03 },
};
const COLORS = ['#f0c040', '#4aa0f0', '#c070f0', '#50d090'];

// ─────────────────────────────────────────────────────────────── настройки и сейв
const S = { mode: 'solo', bots: 1, diff: 'normal', wins: 5, arena: 'random', blood: true, sound: true, best: 0 };
const SAVE_KEY = 'moonduels_v1';

// ─────────────────────────────────────────────────────────────── SDK Яндекса
const YS = (() => {
  let sdk = null, player = null, readyDone = false, gp = false;
  const tmo = (p, ms) => Promise.race([p, new Promise((_, r) => setTimeout(() => r('timeout'), ms))]);
  return {
    async init() {
      if (typeof YaGames === 'undefined') return;
      try { sdk = await tmo(YaGames.init(), 4000); } catch (e) { sdk = null; return; }
      try { player = await tmo(sdk.getPlayer({ scopes: false }), 3000); } catch (e) { player = null; }
    },
    get lang() { try { return sdk ? sdk.environment.i18n.lang : (navigator.language || 'ru').slice(0, 2); } catch (e) { return 'ru'; } },
    ready() { if (readyDone) return; readyDone = true; try { sdk?.features?.LoadingAPI?.ready(); } catch (e) {} },
    start() { if (gp) return; gp = true; try { sdk?.features?.GameplayAPI?.start(); } catch (e) {} },
    stop() { if (!gp) return; gp = false; try { sdk?.features?.GameplayAPI?.stop(); } catch (e) {} },
    // показ строго синхронно в момент паузы (п. 4.4), звук глушим в onOpen (п. 4.7)
    interstitial(done) {
      if (!sdk) { done(); return; }
      this.stop();
      try {
        sdk.adv.showFullscreenAdv({ callbacks: {
          onOpen: () => { Snd.mute(true); },
          onClose: () => { Snd.mute(!S.sound); done(); },
          onError: () => { Snd.mute(!S.sound); done(); },
        } });
      } catch (e) { done(); }
    },
    async save(o) {
      if (player) { try { await player.setData(o); return; } catch (e) {} }
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(o)); } catch (e) {}
    },
    async load() {
      if (player) { try { return await player.getData(); } catch (e) {} }
      try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; }
    },
  };
})();

// ─────────────────────────────────────────────────────────────── звук
// Файлы Kenney через Web Audio; взрыв и свист — процедурные из shared/sfx.js.
// ?mute=1 — звук не создаётся вовсе (ни аудиоконтекст, ни sfx.js): для проверок в браузере разработчика
const NOSOUND = /[?&]mute=1/.test(location.search);
const Snd = (() => {
  let ac = null, out = null, muted = false; const bufs = {}, last = {};
  function ctx() {
    if (NOSOUND) return null;
    if (ac) return ac;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); out = ac.createGain(); out.gain.value = muted ? 0 : 0.7; out.connect(ac.destination); } catch (e) { ac = null; }
    return ac;
  }
  async function load() {
    const c = ctx(); if (!c) return;
    const jobs = [];
    for (const [k, list] of Object.entries(MAN.sfx)) {
      bufs[k] = [];
      list.forEach((rel, i) => jobs.push(fetch(A + rel).then(r => r.arrayBuffer()).then(b => new Promise((res) => c.decodeAudioData(b, d => { bufs[k][i] = d; res(); }, () => res()))).catch(() => {})));
    }
    await Promise.all(jobs);
  }
  return {
    load,
    unlock() { if (NOSOUND) return; const c = ctx(); if (c && c.state === 'suspended') c.resume(); try { SFX.unlock(); } catch (e) {} },
    play(k, v = 1, rate = 1) {
      if (muted || demo || !ac) return;
      const now = ac.currentTime; if (last[k] && now - last[k] < 0.035) return; last[k] = now;
      const list = (bufs[k] || []).filter(Boolean); if (!list.length) return;
      const s = ac.createBufferSource(), g = ac.createGain();
      s.buffer = pick(list); s.playbackRate.value = rate * rnd(0.93, 1.07); g.gain.value = v;
      s.connect(g); g.connect(out); s.start();
    },
    fx(name, o) { if (!NOSOUND && !muted && !demo) try { SFX.play(name, o); } catch (e) {} },
    mute(m) { muted = NOSOUND || m; if (out) out.gain.value = muted ? 0 : 0.7; try { SFX.setMuted(muted); } catch (e) {} },
    get muted() { return muted; },
  };
})();

// ─────────────────────────────────────────────────────────────── картинки
const IMG = {};
let GIBS = [];        // куски мяса Reactorcore
function loadImg(rel) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = A + rel; }); }
// Зеркальная копия листа: кадр i переезжает на место n-1-i, якорь отражается.
function mirror(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const g = c.getContext('2d'); g.translate(img.width, 0); g.scale(-1, 1); g.drawImage(img, 0, 0); return c;
}
async function loadAll() {
  const jobs = [];
  for (const [race, R] of Object.entries(MAN.races)) {
    for (const [an, a] of Object.entries(R.anims)) jobs.push(loadImg(a.src).then(i => { a.img = i; a.imgL = i && mirror(i); }));
  }
  for (const f of Object.values(MAN.fx)) jobs.push(loadImg(f.src).then(i => { f.img = i; f.imgL = i && mirror(i); }));
  for (const [k, rel] of Object.entries(MAN.map)) jobs.push(loadImg(rel).then(i => { IMG[k] = i; }));
  await Promise.all(jobs);
  // палитра тела для ошмётков: самые частые цвета кадра стойки
  for (const [race, R] of Object.entries(MAN.races)) R.pal = bodyPalette(R);
  GIBS = (await Promise.all((MAN.gibs || []).map(loadImg))).filter(Boolean).map(img => {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, img.width, img.height).data, pix = [];
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) pix.push([(i / 4) % img.width, Math.floor(i / 4 / img.width), ((255 << 24) | (d[i + 2] << 16) | (d[i + 1] << 8) | d[i]) >>> 0]);
    return { img, w: img.width, h: img.height, pix };
  });
}
function bodyPalette(R) {
  const a = R.anims.idle; if (!a.img) return ['#888'];
  const c = document.createElement('canvas'); c.width = R.fw; c.height = R.fh;
  const g = c.getContext('2d'); g.drawImage(a.img, 0, 0, R.fw, R.fh, 0, 0, R.fw, R.fh);
  const d = g.getImageData(0, 0, R.fw, R.fh).data, cnt = {};
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { const k = '#' + ((1 << 24) | (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]).toString(16).slice(1); cnt[k] = (cnt[k] || 0) + 1; }
  return Object.entries(cnt).sort((x, y) => y[1] - x[1]).slice(0, 5).map(e => e[0]);
}

// ─────────────────────────────────────────────────────────────── арены
// '#' камень, '-' каменный уступ (сквозь него можно прыгнуть снизу), '=' деревянный мост
// (ломается), '^' шипы, '_' темнота ямы (пусто). Все арены симметричны, высота любого
// подъёма не больше 80 px (прыжок 96), чтобы до каждой площадки мог допрыгнуть и колдун.
// crates — [x, ряд пола], chands — x люстр, decor — куски дальнего листа замка [sx, sy, sw, sh, dx, dy].
const ARENAS = [
  { id: 'hall', bgs: [['bg1', 0.15, 'c'], ['bg2', 0.3, 'c'], ['bg3', 0.45, 'c'], ['bg4', 0.6, 'c']], fill: '#1f2f36', ts: 'cave',
    build(F) {
      F(0, COLS - 1, 20, ROWS - 1, '#'); F(0, 0, 0, 19, '#'); F(COLS - 1, COLS - 1, 0, 19, '#');
      F(18, 21, 20, 20, '_'); F(18, 21, 21, 21, '^');           // яма с шипами под мостом
      F(4, 10, 15, 15, '-'); F(29, 35, 15, 15, '-');
      F(1, 5, 10, 10, '-'); F(34, 38, 10, 10, '-');
      F(14, 25, 10, 10, '=');
      F(8, 13, 5, 5, '-'); F(26, 31, 5, 5, '-');
    },
    spawns: [[3.5, 20], [36.5, 20], [7, 15], [32, 15]],
    crates: [[160, 20], [WW - 208, 20]], chands: [WW / 2], lanterns: [88, 552],
    drops: [120, 180, 250, 320, 390, 460, 520],
    decor: [[160, 0, 96, 128, 40, 192], [256, 0, 96, 128, 504, 192], [112, 144, 96, 96, 272, 224], [0, 0, 80, 160, 140, 40], [0, 0, 80, 160, 420, 40], [100, 0, 40, 48, 300, 90]] },
  { id: 'chasm', bgs: [['bg1', 0.15, 'c'], ['bg2', 0.3, 'c'], ['bg3', 0.45, 'c'], ['bg4b', 0.6, 'c']], fill: '#1f2f36', ts: 'cave',
    build(F) {
      F(0, COLS - 1, 20, ROWS - 1, '#'); F(0, 0, 0, 19, '#'); F(COLS - 1, COLS - 1, 0, 19, '#');
      F(12, 27, 20, 20, '='); F(12, 27, 21, 21, '_'); F(12, 27, 22, 22, '^');   // нижний мост над пропастью
      F(2, 8, 15, 15, '-'); F(31, 37, 15, 15, '-');
      F(6, 11, 10, 10, '-'); F(28, 33, 10, 10, '-');
      F(14, 25, 12, 12, '=');                                                     // верхний мост
      F(16, 23, 5, 5, '-');
    },
    spawns: [[3.5, 20], [36.5, 20], [5, 15], [34, 15]],
    crates: [[120, 20], [WW - 168, 20]], chands: [WW / 2], lanterns: [200, 440],
    drops: [60, 140, 260, 320, 380, 500, 580],
    decor: [[0, 0, 80, 160, 20, 60], [0, 0, 80, 160, 540, 60], [112, 144, 96, 96, 272, 30], [160, 0, 96, 128, 150, 192], [256, 0, 96, 128, 394, 192]] },
  { id: 'tower', bgs: [['bg1', 0.15, 'c'], ['bg2', 0.3, 'c'], ['bg3', 0.45, 'c'], ['bg4', 0.6, 'c']], fill: '#1f2f36', ts: 'cave',
    build(F) {
      F(0, COLS - 1, 20, ROWS - 1, '#'); F(0, 0, 0, 19, '#'); F(COLS - 1, COLS - 1, 0, 19, '#');
      F(8, 10, 20, 20, '_'); F(8, 10, 21, 21, '^'); F(29, 31, 20, 20, '_'); F(29, 31, 21, 21, '^');
      F(18, 21, 16, 19, '#');                                                     // каменная башня посередине
      F(3, 7, 16, 16, '-'); F(32, 36, 16, 16, '-');
      F(12, 27, 11, 11, '=');                                                     // мост над башней
      F(1, 5, 11, 11, '-'); F(34, 38, 11, 11, '-');
      F(7, 12, 6, 6, '-'); F(27, 32, 6, 6, '-');
      F(17, 22, 3, 3, '-');
    },
    spawns: [[3.5, 20], [36.5, 20], [5, 16], [34, 16]],
    crates: [[WW / 2 - 24, 16], [200, 20], [WW - 248, 20]], chands: [176, WW - 176], lanterns: [56, 584],
    drops: [80, 170, 240, 320, 400, 470, 560],
    decor: [[160, 0, 96, 128, 24, 80], [256, 0, 96, 128, 520, 80], [0, 0, 80, 160, 280, 40], [100, 0, 40, 48, 120, 150], [100, 0, 40, 48, 480, 150]] },
  // ── третья волна (09.10): Szadi art «Dark Forest», «Pixel Platformer» 1 и 2, «Ruined Temple» ──
  { id: 'forest', bgs: [['forest_sky', 0.1, 'c'], ['forest_t5', 0.25, 'b'], ['forest_t3', 0.4, 'b'], ['forest_t1', 0.6, 'b']], fill: '#3a3028', ts: 'forest',
    build(F) {
      F(0, COLS - 1, 20, ROWS - 1, '#'); F(0, 0, 0, 19, '#'); F(COLS - 1, COLS - 1, 0, 19, '#');
      F(6, 8, 20, 20, '_'); F(6, 8, 21, 21, '^'); F(31, 33, 20, 20, '_'); F(31, 33, 21, 21, '^');   // две ямы с шипами
      F(16, 23, 17, 19, '#');                                                     // холм посередине
      F(2, 7, 15, 15, '-'); F(32, 37, 15, 15, '-');
      F(10, 14, 11, 11, '-'); F(25, 29, 11, 11, '-');
      F(15, 24, 12, 12, '=');                                                     // мост над холмом
      F(4, 9, 6, 6, '-'); F(30, 35, 6, 6, '-'); F(17, 22, 5, 5, '-');
    },
    spawns: [[3.5, 20], [36.5, 20], [4, 15], [35, 15]],
    crates: [[180, 20], [WW - 228, 20]], chands: [], lanterns: [120, 520],
    drops: [100, 180, 260, 320, 380, 460, 540] },
  { id: 'castle', bgs: [['castle2_b1', 0.1, 'b'], ['castle2_b2', 0.2, 'b'], ['castle2_b3', 0.35, 'b'], ['castle2_b4', 0.5, 'b'], ['castle2_b5', 0.65, 'b']], fill: '#5a3a3a', ts: 'castle',
    build(F) {
      F(0, COLS - 1, 20, ROWS - 1, '#'); F(0, 0, 0, 19, '#'); F(COLS - 1, COLS - 1, 0, 19, '#');
      F(15, 24, 20, 20, '='); F(15, 24, 21, 21, '_'); F(15, 24, 22, 22, '^');   // пропасть с мостом
      F(3, 10, 16, 16, '-'); F(29, 36, 16, 16, '-'); F(18, 21, 16, 16, '-');
      F(1, 6, 11, 11, '-'); F(33, 38, 11, 11, '-'); F(17, 22, 12, 12, '-');
      F(11, 16, 7, 7, '-'); F(23, 28, 7, 7, '-');
    },
    spawns: [[3.5, 20], [36.5, 20], [6, 16], [33, 16]],
    crates: [[150, 20], [WW - 198, 20]], chands: [WW / 2], lanterns: [72, 568],
    drops: [80, 160, 260, 320, 380, 480, 560] },
  { id: 'temple', bgs: [['rtb1', 0.1, 'c'], ['rtb2', 0.3, 'c'], ['rtb4', 0.55, 'c']], fill: '#d8c08a', ts: 'world',
    build(F) {
      F(0, COLS - 1, 20, ROWS - 1, '#'); F(0, 0, 0, 19, '#'); F(COLS - 1, COLS - 1, 0, 19, '#');
      F(0, 9, 18, 19, '#'); F(30, 39, 18, 19, '#');                               // приподнятые края
      F(17, 22, 20, 20, '='); F(17, 22, 21, 21, '^');                             // мост над шипами
      F(11, 16, 15, 15, '-'); F(23, 28, 15, 15, '-');
      F(4, 9, 13, 13, '-'); F(30, 35, 13, 13, '-');
      F(15, 24, 10, 10, '-');
      F(7, 12, 8, 8, '-'); F(27, 32, 8, 8, '-');
    },
    spawns: [[4, 18], [35, 18], [13, 15], [26, 15]],
    crates: [[200, 20], [WW - 248, 20]], chands: [], lanterns: [],
    drops: [80, 160, 240, 320, 400, 480, 560] },
];
let AR = ARENAS[0], SPAWNS = AR.spawns, lastArena = -1;
const grid = [], base = [];
function buildMap(a) {
  for (let r = 0; r < ROWS; r++) base[r] = Array(COLS).fill('.');
  a.build((c0, c1, r0, r1, ch) => { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) base[r][c] = ch; });
}
function loadArena(a) {
  AR = a; SPAWNS = a.spawns;
  buildMap(a);
  if (!a.tiles) bakeTiles(a);
}
const plankHp = new Float32Array(COLS * ROWS);
let SEGS = [];
const tile = (c, r) => (c < 0 || c >= COLS || r >= ROWS) ? '#' : r < 0 ? '.' : grid[r][c];
const tileAt = (x, y) => tile(Math.floor(x / T), Math.floor(y / T));
const solid = ch => ch === '#';
const oneway = ch => ch === '-' || ch === '=';

function resetMap() {
  for (let r = 0; r < ROWS; r++) grid[r] = base[r].slice();
  plankHp.fill(0);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === '=') plankHp[r * COLS + c] = 40;
  buildSegs();
}
// площадки для навигации ботов: верхние кромки, на которых можно стоять
function buildSegs() {
  SEGS = [];
  for (let r = 1; r < ROWS; r++) {
    let c = 0;
    while (c < COLS) {
      const ok = cc => { const ch = tile(cc, r); return (solid(ch) || oneway(ch)) && !solid(tile(cc, r - 1)); };
      if (ok(c)) { const c0 = c; while (c < COLS && ok(c)) c++; SEGS.push({ x0: c0 * T, x1: c * T, y: r * T }); } else c++;
    }
  }
  for (const o of objs) if (!o.dead && o.solid) SEGS.push({ x0: o.x, x1: o.x + o.w, y: o.y, obj: o });
}

// ── нарезка тайлов (листы Szadi, сетка 16) ──
const CAVE_TOP = [192, 224, 240, 272, 304, 336, 352, 384, 400, 432, 448, 480];   // y=368 кромка, y=384 под ней
const CAVE_DEEP = [[32, 192], [48, 192]];
const LEDGE_L = [224, 368], LEDGE_R = [240, 368];
const BEAM = { x: 755, y: 16, w: 170 };
const CRATE = [[752, 96], [816, 96]];
const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// Тайлсет — откуда брать тайлы на листе: top — верхняя кромка, second — ряд под ней, deep — глубина,
// over — травинки над кромкой (рисуются в пустой клетке сверху), ledge — уступ слева/середина/справа,
// ledgeH — толщина уступа в тайлах, spike — шипы, edge — цвет внутренней грани боковых стен.
const span = (x0, x1, y) => { const a = []; for (let x = x0; x <= x1; x += 16) a.push([x, y]); return a; };
const TILESETS = {
  cave: { sheet: 'cave', top: CAVE_TOP.map(x => [x, 368]), second: CAVE_TOP.map(x => [x, 384]), deep: CAVE_DEEP,
    ledgeL: LEDGE_L, ledgeM: [LEDGE_L, LEDGE_R], ledgeR: LEDGE_R, ledgeH: 2, spike: ['cave', 749, 288, true], edge: '#5c6a86' },
  forest: { sheet: 'forest', top: span(128, 240, 96), over: span(128, 240, 80), second: [[16, 400], [32, 400]], deep: [[16, 400], [32, 400], [16, 416], [32, 416]],
    ledgeL: [128, 96], ledgeM: span(144, 224, 96), ledgeR: [240, 96], ledgeH: 1, spike: ['cave', 749, 288, true], edge: '#5a4428' },
  castle: { sheet: 'castle2', top: span(224, 432, 320), second: span(224, 432, 336), deep: [[32, 48], [48, 48]],
    ledgeL: [192, 272], ledgeM: span(208, 352, 272), ledgeR: [368, 272], ledgeH: 2, spike: ['cave', 749, 288, true], edge: '#6a7a6a' },
  world: { sheet: 'world', top: span(224, 416, 272), second: span(224, 416, 288), deep: [[16, 96], [32, 96]],
    ledgeL: [192, 272], ledgeM: span(224, 416, 272), ledgeR: [448, 272], ledgeH: 2, spike: ['world', 640, 16, false], edge: '#4a5a3a' },
};
// запекаем неподвижное один раз на арену: камень, уступы, шипы, темнота ям и фон из руин замка
function bakeTiles(a) {
  const c = document.createElement('canvas'); c.width = WW; c.height = WH; const g = c.getContext('2d');
  const ts = TILESETS[a.ts || 'cave'], sh = IMG[ts.sheet] || IMG.cave;
  const put = (list, salt, x, y) => { const [sx, sy] = list[(hash(x, y + salt) * list.length) | 0]; g.drawImage(sh, sx, sy, T, T, x, y, T, T); };
  for (let r = 0; r < ROWS; r++) for (let cc = 0; cc < COLS; cc++) {
    const ch = base[r][cc], x = cc * T, y = r * T;
    if (ch === '#') {
      const above = r > 0 ? base[r - 1][cc] : '#';
      const above2 = r > 1 ? base[r - 2][cc] : '#';
      if (above !== '#') { put(ts.top, 0, x, y); if (ts.over && r > 0) put(ts.over, 0, x, y - T); }
      else if (above2 !== '#') put(ts.second, 7, x, y);
      else put(ts.deep, 3, x, y);
    } else if (ch === '-') {
      const lft = base[r][cc - 1] !== '-', rgt = base[r][cc + 1] !== '-';
      const src = lft ? ts.ledgeL : rgt ? ts.ledgeR : ts.ledgeM[(hash(cc, r) * ts.ledgeM.length) | 0];
      g.drawImage(sh, src[0], src[1], T, T, x, y, T, T);
      if (ts.ledgeH > 1) g.drawImage(sh, src[0], src[1] + 16, T, T, x, y + T, T, T);           // нижняя часть уступа
    } else if (ch === '^') {
      g.fillStyle = '#07060b'; g.fillRect(x, y, T, T);
      const [k, sx, sy, jit] = ts.spike; g.drawImage(IMG[k] || IMG.cave, sx + (jit ? (cc & 1) * 4 : (cc & 1) * 16), sy, T, T, x, y, T, T);
    } else if (ch === '_') {
      g.fillStyle = '#07060b'; g.fillRect(x, y, T, T);
    }
  }
  // внутренние грани боковых стен
  g.fillStyle = ts.edge; g.fillRect(T - 1, 0, 1, 20 * T); g.fillRect(WW - T, 0, 1, 20 * T);
  a.tiles = c;

  const d = document.createElement('canvas'); d.width = WW; d.height = WH; const h = d.getContext('2d');
  const far = IMG.castlefar || IMG.castle;
  for (const [sx, sy, sw, sh2, dx, dy] of a.decor || []) h.drawImage(far, sx, sy, sw, sh2, dx, dy, sw, sh2);
  a.decorC = d;
}

// ─────────────────────────────────────────────────────────────── объекты
let objs = [];       // ящики
let chands = [];     // люстры
function resetObjs() {
  objs = AR.crates.map(([x, row], i) => ({ kind: 'crate', x, y: row * T - 48, w: 48, h: 48, vy: 0, hp: 55, src: CRATE[i % 2], solid: true }));
  chands = AR.chands.map(x => ({ x: x - 32, y: 10, w: 64, h: 64, vy: 0, state: 'hang', t: rnd(0, 5) }));
  lamps = AR.lanterns.map(x => ({ x, y: 40, vy: 0, state: 'hang' }));
  pools = [];
}

// ─────────────────────────────────────────────────────────────── состояние мира
let fighters = [], items = [], projs = [], parts = [], clouds = [], booms = [], texts = [];
let state = 'boot', prevState = null, round = 0, stateT = 0, roundT = 0, itemT = 0;
let hitStop = 0, slowT = 0, shake = 0, simAcc = 0, quakeOn = false, quakeT = 0;
let demo = false;                 // меню: боты дерутся на фоне без звука и интерфейса
let surv = null;                  // выживание: { wave, kills, toSpawn, spawnT, next }
let pools = [], lamps = [], splats = [], bolts = [], delayed = [];   // bolts — молнии на экране, delayed — удары с задержкой   // splats — анимации крови Reactorcore       // лужи огня; висячие фонари, которые можно сбить
const isSurv = () => !!surv && !demo;
let camX = 0, camY = 0;

// слой пятен крови: рисуем пиксели прямо в ImageData размером с мир
let stainC, stainG, stainImg, stainU32, stainDirty = false;
function initStains() {
  stainC = document.createElement('canvas'); stainC.width = WW; stainC.height = WH; stainG = stainC.getContext('2d');
  stainImg = stainG.createImageData(WW, WH); stainU32 = new Uint32Array(stainImg.data.buffer);
}
const u32 = hex => { const n = parseInt(hex.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16)) >>> 0; };
const BLOOD = ['#5e0a12', '#8e0f1a', '#b81d22', '#d23a2a'].map(h => [h, u32(h)]);
function stamp(x, y, col) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= WW || y >= WH) return; stainU32[y * WW + x] = col; stainDirty = true; }
function clearStainRect(x, y, w, h) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (i >= 0 && j >= 0 && i < WW && j < WH) stainU32[j * WW + i] = 0; stainDirty = true; }

// ─────────────────────────────────────────────────────────────── физика тел
// тело: x — центр, y — ноги (низ), w/h — размер; drop — время спрыгивания с уступа
function bodyTouchSpikes(b) {
  const c0 = Math.floor((b.x - b.w / 2) / T), c1 = Math.floor((b.x + b.w / 2 - 1) / T), r = Math.floor((b.y - 2) / T);
  for (let c = c0; c <= c1; c++) if (tile(c, r) === '^') return true;
  return false;
}
function moveX(b, dx) {
  if (!dx) return false;
  let nx = b.x + dx, hit = false;
  const top = b.y - b.h + 1, bot = b.y - 1, r0 = Math.floor(top / T), r1 = Math.floor(bot / T);
  const edge = dx > 0 ? nx + b.w / 2 : nx - b.w / 2, c = Math.floor((dx > 0 ? edge - 0.001 : edge) / T);
  for (let r = r0; r <= r1; r++) if (solid(tile(c, r))) { nx = dx > 0 ? c * T - b.w / 2 : (c + 1) * T + b.w / 2; hit = true; break; }
  for (const o of objs) {
    if (o.dead || !o.solid || o === b) continue;
    if (bot > o.y + 1 && top < o.y + o.h - 1 && nx + b.w / 2 > o.x && nx - b.w / 2 < o.x + o.w) {
      if (dx > 0 && b.x + b.w / 2 <= o.x + 1) { nx = o.x - b.w / 2; hit = true; }
      else if (dx < 0 && b.x - b.w / 2 >= o.x + o.w - 1) { nx = o.x + o.w + b.w / 2; hit = true; }
    }
  }
  b.x = nx; return hit;
}
// возвращает 1 — приземлился, -1 — ударился головой, 0 — летит
function moveY(b, dy) {
  if (!dy) return 0;
  let ny = b.y + dy, res = 0;
  const c0 = Math.floor((b.x - b.w / 2 + 1) / T), c1 = Math.floor((b.x + b.w / 2 - 1) / T);
  if (dy > 0) {
    const rs = Math.ceil((b.y - 0.01) / T), re = Math.floor(ny / T);
    outer: for (let r = rs; r <= re; r++) {
      const top = r * T; if (top < b.y - 0.01 || top > ny) continue;
      for (let c = c0; c <= c1; c++) { const ch = tile(c, r); if (solid(ch) || (oneway(ch) && !(b.drop > 0)) || (ch === '^' && b.spikeFloor)) { ny = top; res = 1; break outer; } }
    }
    for (const o of objs) {
      if (o.dead || !o.solid || o === b) continue;
      if (b.x + b.w / 2 > o.x + 1 && b.x - b.w / 2 < o.x + o.w - 1 && b.y <= o.y + 0.01 && ny >= o.y) { ny = o.y; res = 1; }
    }
  } else {
    const rOld = Math.floor((b.y - b.h) / T), rNew = Math.floor((ny - b.h) / T);
    if (rNew < rOld) for (let c = c0; c <= c1; c++) if (solid(tile(c, rNew))) { ny = (rNew + 1) * T + b.h; res = -1; break; }
  }
  b.y = ny; return res;
}
function onOneway(b) {
  const r = Math.floor((b.y + 1) / T); let any = false;
  for (let c = Math.floor((b.x - b.w / 2 + 1) / T); c <= Math.floor((b.x + b.w / 2 - 1) / T); c++) { const ch = tile(c, r); if (solid(ch)) return false; if (oneway(ch)) any = true; }
  return any;
}

// ─────────────────────────────────────────────────────────────── бойцы
function makeFighter(i, ctrl, team) {
  return { i, ctrl, team: team === undefined ? i : team, color: COLORS[i % COLORS.length], score: 0, alive: true, ai: { t: 0, move: 0, lastX: 0, stuckT: 0 } };
}
function spawnFighter(f, sp) {
  const R = RACE[f.race];
  Object.assign(f, {
    R, M: MAN.races[f.race], x: sp[0] * T, y: sp[1] * T, w: R.box[0], h: R.box[1], vx: 0, vy: 0, face: sp[0] < COLS / 2 ? 1 : -1,
    hp: R.hp, alive: true, onGround: false, coyote: 0, drop: 0, anim: 'idle', animT: 0, atk: null, combo: 0, comboT: 0,
    hurtT: 0, stun: 0, poison: 0, wpn: R.start ? { k: R.start, ammo: WEAP[R.start].ammo } : null, rcd: 0, aim: 0,
    move: 0, press: {}, held: {}, prevHeld: {}, revived: false, reviveT: 0, deadT: 0, corpse: false, gone: false, killer: null, flash: 0,
  });
}
const cx = f => f.x, top = f => f.y - f.h, midY = f => f.y - f.h / 2;
function animOf(f, n) { return f.M.anims[n] || f.M.anims.idle; }

function setAnim(f, n) { if (f.anim !== n) { f.anim = n; f.animT = 0; } }

function updFighter(f, dt) {
  if (!f.alive) { updCorpse(f, dt); return; }
  const R = f.R;
  f.drop -= dt; f.rcd -= dt; f.hurtT -= dt; f.stun -= dt; f.comboT -= dt; f.flash -= dt;
  // лёд: стоит как статуя, анимация замирает
  if (f.frozen > 0) { f.frozen -= dt; f.press = {}; f.atk = null; if (Math.random() < 0.3) spawnPart({ x: f.x + rnd(-f.w / 2, f.w / 2), y: f.y - rnd(0, f.h), vx: rnd(-10, 10), vy: rnd(-30, 0), life: .4, col: pick(['#bfe8ff', '#ffffff', '#7ab8e0']), kind: 'spark', g: 0 }); }
  // огонь: урон чаще яда, языки пламени на теле
  if (f.burn > 0) { f.burn -= dt; f.burnTick = (f.burnTick || 0) - dt; if (f.burnTick <= 0) { f.burnTick = 0.4; damage(f, 3, { kind: 'poison', src: f.burnSrc, dir: 0 }); if (!f.alive) return; }
    if (Math.random() < 0.5) spawnPart({ x: f.x + rnd(-f.w / 2, f.w / 2), y: f.y - rnd(0, f.h), vx: rnd(-10, 10), vy: rnd(-60, -20), life: rnd(.2, .45), col: pick(['#ffd36b', '#ff8a2a', '#d8401a']), kind: 'spark', g: -80 }); }
  // яд: урон каждую секунду, пока висит
  if (f.poison > 0) { f.poison -= dt; f.poisonTick = (f.poisonTick || 0) - dt; if (f.poisonTick <= 0) { f.poisonTick = 0.5; damage(f, 4, { kind: 'poison', src: f.poisonSrc, dir: 0 }); if (!f.alive) return; spawnPart({ x: f.x + rnd(-6, 6), y: top(f) + rnd(0, f.h), vx: 0, vy: -30, life: .6, col: '#7fd04a', kind: 'mist' }); } }

  const busy = f.atk || f.stun > 0 || f.frozen > 0;
  let move = f.stun > 0 || f.frozen > 0 ? 0 : f.move;
  if (f.atk && f.onGround) move = 0;
  const target = move * RUN * R.spd;
  const acc = (f.onGround ? 1500 : 800) * dt;
  f.vx = f.vx < target ? Math.min(target, f.vx + acc) : Math.max(target, f.vx - acc);
  if (move && !f.atk) f.face = move;

  // прыжок
  if (f.press.jump && !busy && (f.onGround || f.coyote > 0)) {
    f.vy = -JUMP * R.jump; f.onGround = false; f.coyote = 0; Snd.play('cloth', 0.35);
  }
  // вниз: подобрать или спрыгнуть
  if (f.press.down) {
    const it = items.find(it => overlapItem(f, it));
    if (it) pickup(f, it, true);
    else if (f.onGround && onOneway(f)) { f.drop = 0.22; f.y += 1; }
  }
  // атаки
  if (f.press.atk) startAttack(f);
  if (f.press.sht) shoot(f);

  f.vy = Math.min(f.vy + GRAV * dt, MAXFALL);
  if (moveX(f, f.vx * dt)) f.vx = 0;
  const wasGround = f.onGround, vyBefore = f.vy;
  const res = moveY(f, f.vy * dt);
  if (res === 1) { if (!wasGround && vyBefore > 300) Snd.play('step', 0.4); if (!wasGround && vyBefore > 480) addFx('dust', f.x, f.y); f.vy = 0; f.onGround = true; f.coyote = 0.09; }
  else { if (res === -1) f.vy = 0; f.onGround = false; f.coyote -= dt; }
  f.x = clamp(f.x, T + f.w / 2, WW - T - f.w / 2);
  if (bodyTouchSpikes(f) || f.y > WH + 40) { kill(f, { kind: 'spikes', dir: 0 }); return; }

  // ближняя атака: удар на расчётном кадре
  if (f.atk) {
    const a = animOf(f, f.atk.n), fps = a.n / f.atk.dur;
    f.atk.t += dt;
    const fr = Math.floor(f.atk.t * fps);
    const hitFr = f.R.hitAt ? Math.floor(a.n * f.R.hitAt) : a.hitFrame;
    if (!f.atk.done && fr >= hitFr) { f.atk.done = true; if (f.R.shot) fireShot(f); else resolveMelee(f, a); }
    if (f.atk.t >= f.atk.dur) { f.atk = null; f.comboT = 0.35; }
  }
  for (const it of items) if (overlapItem(f, it)) pickup(f, it, false);

  // анимация
  if (f.atk) setAnim(f, f.atk.n);
  else if (f.hurtT > 0 && f.M.anims.hit) setAnim(f, 'hit');
  else if (!f.onGround) setAnim(f, f.vy < 0 ? (f.M.anims.jump ? 'jump' : 'run') : (f.M.anims.fall ? 'fall' : 'run'));
  else if (Math.abs(f.vx) > 12) setAnim(f, 'run');
  else setAnim(f, 'idle');
  if (!(f.frozen > 0)) f.animT += dt;
  // шаги
  if (f.anim === 'run' && f.onGround) { f.stepT = (f.stepT || 0) - dt; if (f.stepT <= 0) { f.stepT = 0.3; Snd.play('step', 0.12); } }
}

function startAttack(f) {
  if (f.atk || f.stun > 0) return;
  const R = f.R, n = R.dmg.length;
  const idx = f.comboT > 0 ? (f.combo + 1) % n : 0;
  f.combo = idx;
  const name = 'atk' + (idx + 1), a = animOf(f, name);
  const dur = 0.5 / R.atkSpd;            // одна база для всех: иначе раса с коротким листом атаки бьёт вдвое чаще
  f.atk = { n: name, idx, t: 0, dur, done: false };
  Snd.fx('whoosh', { v: 0.35, d: 0.18 });
}
function resolveMelee(f, a) {
  const reach = Math.min(a.reach * 0.92, f.R.reach), h = Math.max(a.top, f.h);
  const x0 = f.face > 0 ? f.x : f.x - reach, x1 = f.face > 0 ? f.x + reach : f.x;
  const y0 = f.y - h, y1 = f.y;
  const dmg = f.R.dmg[f.atk.idx] || f.R.dmg[0];
  let hitAny = false;
  for (const o of fighters) {
    if (o === f || !o.alive || o.team === f.team) continue;
    if (o.x + o.w / 2 > x0 && o.x - o.w / 2 < x1 && o.y > y0 && top(o) < y1) {
      const finisher = f.atk.idx === f.R.dmg.length - 1 && f.R.dmg.length > 2;
      damage(o, dmg, { kind: 'melee', src: f, dir: f.face, kb: (finisher ? 260 : 150) * f.R.kb, hy: midY(o) - 4, finisher });
      if (f.R.burn) ignite(o, f.R.burn, f);
      hitAny = true;
    }
  }
  for (const o of objs) if (!o.dead && o.x + o.w > x0 && o.x < x1 && o.y + o.h > y0 && o.y < y1) { hitObj(o, dmg, f); hitAny = true; }
  for (const ch of chands) if (ch.state === 'hang' && ch.x + 54 > x0 && ch.x + 10 < x1 && ch.y + 60 > y0 && ch.y < y1) dropChandelier(ch, f);
  for (const l of lamps) if (l.state === 'hang' && l.x > x0 && l.x < x1 && l.y + 30 > y0 && l.y < y1) dropLamp(l, f);
  // по трупам — тоже брызги (бьём лежачих, это же кровавая дуэль)
  for (const o of fighters) if (!o.alive && o.corpse && !o.gone && o.x > x0 - 10 && o.x < x1 + 10 && Math.abs(o.y - f.y) < 30) { bleed(o.x, o.y - 6, f.face, 6, 140, o); o.vx += f.face * 60; }
  if (hitAny) { hitStop = Math.max(hitStop, 0.045); }
}

// стрелковые расы: удар — это выстрел своим снарядом
function fireShot(f) {
  const sh = f.R.shot, a = f.aim * -0.32;
  projs.push({ k: sh.k, x: f.x + f.face * (f.w / 2 + 4), y: midY(f) - 6, vx: Math.cos(a) * sh.spd * f.face, vy: -Math.sin(a) * sh.spd - (sh.grav ? 60 : 0),
    grav: sh.grav, owner: f, t: 0, dmg: sh.dmg, r: sh.r, burn: sh.burn, leech: sh.leech, frame: 0 });
  if (sh.k === 'arrow2') Snd.play('draw', 0.35); else Snd.fx('spell', { v: 0.35 });
}
function ignite(o, sec, src) {
  if (!o.alive) return;
  if (!(o.burn > 0)) Snd.fx('fire', { v: 0.4 });
  o.burn = Math.max(o.burn || 0, sec); o.burnSrc = src;
}
function damage(f, amt, info) {
  if (!f.alive) return;
  if (info.src && info.src.dmgMul) amt *= info.src.dmgMul;
  let head = false;
  if (info.hy !== undefined && info.kind === 'proj' && info.hy < top(f) + f.h * 0.28) { amt *= 1.5; head = true; }
  if ((f.race === 'skeleton' || f.race === 'zombie') && f.atk === null && f.M.anims.block && info.kind === 'melee' && Math.random() < 0.2 && info.dir === -f.face) {
    // скелет иногда принимает удар на щит
    amt *= 0.3; Snd.play('metal', 0.6); spark(f.x + f.face * 8, midY(f), 6);
  }
  f.hp -= amt; f.hurtT = 0.22; f.flash = 0.08;
  if (info.src && info.src !== f) f.killer = info.src;
  const kb = (info.kb || 90) / f.R.mass;
  if (info.dir) { f.vx = info.dir * kb; f.vy = Math.min(f.vy, -kb * 0.45); }
  if (info.finisher || amt >= 25) f.stun = 0.25;
  if (info.kind !== 'poison') {
    bleed(f.x, info.hy !== undefined ? info.hy : midY(f), info.dir || rnd(-1, 1), Math.round(8 + amt * 1.3), 130 + amt * 4, f);
    if (!BONY.has(f.race) && f.race !== 'mushroom') splash(amt >= 15 ? 'bburst' : 'bsplat', f.x + (info.dir || 0) * 4, info.hy !== undefined ? info.hy : midY(f), info.dir || 1);
    Snd.play(info.kind === 'melee' ? (amt >= 22 ? 'slice' : 'punch') : 'flesh', 0.7);
    if (amt >= 20) Snd.play('punchH', 0.5);
    shake = Math.max(shake, Math.min(6, amt / 6));
  }
  if (f.atk && amt >= 12) f.atk = null;   // сбивает замах
  if (f.hp <= 0) kill(f, { ...info, head, overkill: -f.hp });
}

function kill(f, info) {
  if (!f.alive) return;
  f.deathBy = (info.kind || '?') + (info.src ? ':' + (info.src === f ? 'self' : info.src.race) : '') + '@' + AR.id + (f.hurtT > -0.6 ? '/knock' : '') + (f.onGround ? '/ground' : '/air') + '/x' + Math.round(f.x);
  f.alive = false; f.hp = 0; f.atk = null; f.deadT = 0; f.corpse = true; f.anim = 'death'; f.animT = 0;
  f.vx = (info.dir || 0) * 120; f.vy = -120;
  const gib = info.kind === 'explosion' || info.kind === 'crush' || (info.overkill || 0) > 30;
  if (gib) gibs(f, info.dir || 0);
  else if (info.kind === 'spikes') { bleed(f.x, f.y - 4, 0, 40, 160, f); f.vx = 0; f.vy = 0; f.spikeFloor = true; }
  else bleed(f.x, midY(f), info.dir || 0, 18, 200, f);
  if (f.R.revive && !f.revived && !gib && info.kind !== 'spikes') f.reviveT = 2.6;
  Snd.play('flesh', 0.9); Snd.play('punchH', 0.7);
  shake = Math.max(shake, 5);
  if (isSurv() && f.team === 1) {
    surv.kills++;
    if (Math.random() < 0.3) { const k = pick(WKEYS); items.push({ k, ammo: WEAP[k].ammo, x: f.x, y: f.y - 4, vy: -180, vx: 0, t: 0 }); }
    return;
  }
  const alive = fighters.filter(o => o.alive || o.reviveT > 0).length;
  if (alive <= 1) slowT = 0.35;
}
function updCorpse(f, dt) {
  if (f.gone) { f.reviveT = 0; return; }
  f.deadT += dt; f.animT += dt;
  f.vy = Math.min(f.vy + GRAV * dt, MAXFALL);
  f.vx *= Math.pow(0.02, dt);
  moveX(f, f.vx * dt);
  if (moveY(f, f.vy * dt) === 1) { f.vy = 0; f.onGround = true; } else f.onGround = false;
  if (f.y > WH + 60) f.gone = true;
  // лужа растёт под телом
  if (S.blood && f.onGround && f.deadT < 4 && !BONY.has(f.race)) {
    f.poolT = (f.poolT || 0) - dt;
    if (f.poolT <= 0) { f.poolT = 0.07; const sp = Math.min(14, 2 + f.deadT * 4); const x = f.x + rnd(-sp, sp); if (supportAt(x, f.y)) stamp(x, f.y, pick(BLOOD)[1]); }
  }
  if (f.reviveT > 0) {
    f.reviveT -= dt;
    if (f.reviveT <= 0) {
      f.alive = true; f.revived = true; f.corpse = false; f.hp = 25; f.anim = 'idle'; f.hurtT = 0.4; addFx('smoke', f.x, midY(f));
      for (let i = 0; i < 16; i++) spawnPart({ x: f.x + rnd(-8, 8), y: f.y - rnd(0, f.h), vx: rnd(-30, 30), vy: rnd(-90, -20), life: rnd(.4, .9), col: '#cfeee0', kind: 'mist' });
      Snd.play('metal', 0.6); Snd.fx('curse', { v: 0.5 });
    }
  }
}
const supportAt = (x, y) => { const ch = tileAt(x, y + 1); return solid(ch) || oneway(ch); };

// ─────────────────────────────────────────────────────────────── оружие
function overlapItem(f, it) { return Math.abs(it.x - f.x) < f.w / 2 + 7 && it.y > f.y - f.h && it.y - 12 < f.y; }
function pickup(f, it, swap) {
  if (it.k === 'heal') {
    const max = f.hpMax || f.R.hp; if (f.hp >= max) return;            // полному здоровью зелье не нужно — лежит дальше
    const got = Math.min(40, max - f.hp); f.hp += got; f.burn = 0; f.poison = 0;
    items.splice(items.indexOf(it), 1); addFx('heal', f.x, f.y); Snd.fx('heal', { v: 0.5 }); floatText(f.x, top(f) - 8, '+' + Math.round(got), '#7ae07a');
    return;
  }
  if (f.wpn && f.wpn.k === it.k) { f.wpn.ammo += it.ammo; }
  else if (!f.wpn) f.wpn = { k: it.k, ammo: it.ammo };
  else if (swap) { const old = f.wpn; f.wpn = { k: it.k, ammo: it.ammo }; items.push({ k: old.k, ammo: old.ammo, x: f.x - f.face * 10, y: f.y - 2, vy: -120, vx: -f.face * 60 }); }
  else return;
  items.splice(items.indexOf(it), 1);
  Snd.play('pickup', 0.6);
  floatText(f.x, top(f) - 8, L.weap[it.k], '#f0d890');
}
function shoot(f) {
  if (!f.wpn || f.rcd > 0 || f.stun > 0) return;
  const W = WEAP[f.wpn.k];
  f.rcd = W.cd; f.wpn.ammo--;
  const a = f.aim * -0.42 + (f.ctrl === 'bot' ? rnd(-1, 1) * DIFF[S.diff].aimErr : 0);
  const k = f.wpn.k, sp = W.spd;
  const vx = Math.cos(a) * sp * f.face, vy = -Math.sin(a) * sp - (k === 'bomb' || k === 'spore' || k === 'sword' || k === 'flask' ? 150 : 0);
  if (k === 'storm') castStorm(f, a, W);
  else if (k === 'earth') castEarth(f, W);
  else if (k === 'scroll') projs.push({ k: 'fireball', x: f.x + f.face * (f.w / 2 + 4), y: midY(f) - 6, vx, vy: -Math.sin(a) * sp, grav: 0, owner: f, t: 0, dmg: W.dmg, r: W.r, burn: 2.5, frame: 0 });
  else projs.push({ k, x: f.x + f.face * (f.w / 2 + 2), y: midY(f) - 4, vx: vx + (k === 'bomb' || k === 'flask' ? f.vx * 0.4 : 0), vy, grav: W.grav, owner: f, t: 0, fuse: W.fuse || 9, frame: 0 });
  if (f.wpn.ammo <= 0) f.wpn = null;
  Snd.fx('whoosh', { v: 0.4, d: 0.14 });
  if (k === 'bow') Snd.play('draw', 0.35);
  if (k === 'eye') Snd.fx('spell', { v: 0.3 });
}

// молния: луч до первой стены или цели, ломаная на экране, вспышка PVFX в точке удара
function castStorm(f, a, W) {
  const x0 = f.x + f.face * (f.w / 2 + 4), y0 = midY(f) - 6, dx = Math.cos(a) * f.face, dy = -Math.sin(a);
  let x = x0, y = y0, hit = null;
  for (let d = 0; d < W.range && !hit; d += 3) {
    x = x0 + dx * d; y = y0 + dy * d;
    if (solid(tileAt(x, y))) { hit = 'wall'; break; }
    for (const o of fighters) if (o.alive && o !== f && o.team !== f.team && x > o.x - o.w / 2 && x < o.x + o.w / 2 && y > top(o) && y < o.y) { damage(o, W.dmg, { kind: 'proj', src: f, dir: f.face, kb: 140, hy: y }); hit = o; break; }
    for (const o of objs) if (!o.dead && x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h) { hitObj(o, W.dmg, f); hit = 'wall'; }
    for (const ch of chands) if (ch.state === 'hang' && x > ch.x + 8 && x < ch.x + 56 && y > ch.y && y < ch.y + 60) { dropChandelier(ch, f); hit = 'wall'; }
    for (const l of lamps) if (l.state === 'hang' && Math.abs(x - l.x) < 9 && y > l.y && y < l.y + 30) { dropLamp(l, f); hit = 'wall'; }
  }
  const pts = [[x0, y0]], n = Math.max(2, Math.round(Math.hypot(x - x0, y - y0) / 14));
  for (let i = 1; i < n; i++) pts.push([x0 + (x - x0) * i / n + rnd(-3, 3), y0 + (y - y0) * i / n + rnd(-5, 5)]);
  pts.push([x, y]); bolts.push({ pts, t: 0.14 });
  addFx('elec', x, y);
  Snd.fx('spark', { v: 0.6 }); shake = Math.max(shake, 2);
}
// земля: шипы вырываются под ближайшим врагом впереди (или в 120 px перед собой) через 0,28 с
function castEarth(f, W) {
  let tgt = null, bd = 1e9;
  for (const o of fighters) { if (!o.alive || o === f || o.team === f.team) continue; const dx = o.x - f.x; if (sgn(dx) !== f.face || Math.abs(dx) > W.range || Math.abs(o.y - f.y) > 70) continue; if (Math.abs(dx) < bd) { bd = Math.abs(dx); tgt = o; } }
  const tx = tgt ? tgt.x : f.x + f.face * 120;
  let gy = null; for (let yy = (tgt ? tgt.y : f.y) - 8; yy < (tgt ? tgt.y : f.y) + 80; yy += 2) { const ch = tileAt(tx, yy); if (solid(ch) || oneway(ch)) { gy = Math.floor(yy / T) * T; break; } }
  if (gy === null) { floatText(f.x, top(f) - 8, '…', '#a99fc0'); return; }
  for (let i = 0; i < 6; i++) spawnPart({ x: tx + rnd(-10, 10), y: gy - 1, vx: rnd(-20, 20), vy: rnd(-60, -20), life: .3, col: pick(['#8a6a44', '#5e4a32']), kind: 'debris', g: GRAV });
  delayed.push({ t: 0.28, fn: () => {
    addFx('earth', tx, gy); shake = Math.max(shake, 4); Snd.play('wood', 0.6, 0.5); Snd.fx('explode', { v: 0.25 });
    for (const o of fighters) if (o.alive && o !== f && o.team !== f.team && Math.abs(o.x - tx) < 26 + o.w / 2 && Math.abs(o.y - gy) < 22) { damage(o, W.dmg, { kind: 'proj', src: f, dir: sgn(o.x - tx) || f.face, kb: 60, hy: o.y - 10 }); o.vy = -430; o.onGround = false; }
    const r = Math.floor((gy + 1) / T); for (let c = Math.floor((tx - 20) / T); c <= Math.floor((tx + 20) / T); c++) if (tile(c, r) === '=') hitPlank(c, r, 30);
  } });
}
// лёд: вспышка PVFX, урон и заморозка всех рядом, кроме своих
function frostBurst(x, y, src, W) {
  addFx('frost', x, y); Snd.play('glass', 0.6, 1.4); Snd.fx('spell', { v: 0.3 });
  for (const o of fighters) if (o.alive && !(src && (o === src || o.team === src.team)) && Math.hypot(o.x - x, midY(o) - y) < W.r + o.w / 2) { damage(o, W.dmg, { kind: 'proj', src, dir: sgn(o.x - x) || 1, kb: 30, hy: midY(o) }); if (o.alive) o.frozen = Math.max(o.frozen || 0, W.freeze); }
}
function spawnItem(k, x) {
  // с потолка падает оружие, изредка — зелье лечения
  k = k || (Math.random() < 0.15 ? 'heal' : pick(WKEYS)); x = x === undefined ? pick(AR.drops) + rnd(-10, 10) : x;
  items.push({ k, ammo: k === 'heal' ? 0 : WEAP[k].ammo, x, y: -10, vy: 0, vx: 0, t: 0 });
}
function updItems(dt) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i]; it.t += dt;
    const b = { x: it.x, y: it.y, w: 10, h: 10, spikeFloor: true };
    it.vy = Math.min((it.vy || 0) + GRAV * dt, MAXFALL);
    if (it.vx) { moveX(b, it.vx * dt); it.vx *= Math.pow(0.05, dt); }
    const r = moveY(b, it.vy * dt);
    it.x = b.x; it.y = b.y; if (r === 1) { it.vy = 0; it.vx = 0; }
    if (it.y > WH + 20 || tileAt(it.x, it.y - 2) === '^') items.splice(i, 1);
  }
}

// ─────────────────────────────────────────────────────────────── снаряды
function updProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.t += dt;
    if (p.dead) { p.dieT -= dt; if (p.dieT <= 0) projs.splice(i, 1); continue; }
    if (p.k === 'bomb') { updBomb(p, dt); if (p.boom) { explode(p.x, p.y, WEAP.bomb.r, WEAP.bomb.dmg, p.owner); projs.splice(i, 1); } continue; }
    const steps = Math.ceil(Math.hypot(p.vx, p.vy) * dt / 3) || 1, sdt = dt / steps;
    let hit = null;
    for (let s = 0; s < steps && !hit; s++) {
      p.vy += p.grav * sdt; p.x += p.vx * sdt; p.y += p.vy * sdt;
      if (p.x < 0 || p.x > WW || p.y > WH + 20 || p.y < -200) { hit = 'gone'; break; }
      const ch = tileAt(p.x, p.y);
      if (solid(ch)) { hit = 'wall'; break; }
      if (ch === '=' && p.vy > 0 && (p.y % T) < 4) { const c = Math.floor(p.x / T), r = Math.floor(p.y / T); hitPlank(c, r, p.k === 'eye' ? 10 : 18); hit = 'wall'; break; }
      for (const o of objs) if (!o.dead && p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h) { hitObj(o, p.dmg || WEAP[p.k].dmg, p.owner); hit = 'wall'; break; }
      if (hit) break;
      for (const ch of chands) if (ch.state === 'hang' && p.x > ch.x + 8 && p.x < ch.x + 56 && p.y > ch.y && p.y < ch.y + 60) { dropChandelier(ch, p.owner); hit = 'wall'; }
      for (const l of lamps) if (l.state === 'hang' && Math.abs(p.x - l.x) < 9 && p.y > l.y && p.y < l.y + 30) { dropLamp(l, p.owner); hit = 'wall'; }
      if (hit) break;
      for (const o of fighters) {
        if (!o.alive || (o === p.owner && p.t < 0.25) || (p.owner && o !== p.owner && o.team === p.owner.team)) continue;
        if (p.x > o.x - o.w / 2 - 1 && p.x < o.x + o.w / 2 + 1 && p.y > top(o) && p.y < o.y) {
          const mul = p.owner && p.owner.race === 'huntress' && p.k === 'bow' ? 1.2 : 1;
          const dmg = (p.dmg || WEAP[p.k].dmg) * mul, hp0 = o.hp;
          damage(o, dmg, { kind: 'proj', src: p.owner, dir: sgn(p.vx), kb: 120, hy: p.y });
          if (p.leech && p.owner && p.owner.alive) { const got = Math.max(0, hp0 - Math.max(0, o.hp)) * p.leech; p.owner.hp = Math.min(p.owner.R.hp, p.owner.hp + got); floatText(p.owner.x, top(p.owner) - 6, '+' + Math.round(got), '#e04a5a'); }
          if (p.burn) ignite(o, p.burn, p.owner);
          if (p.k === 'spore') o.poison = Math.max(o.poison, 3), o.poisonSrc = p.owner;
          hit = 'body'; break;
        }
      }
    }
    if (!hit) {
      if (p.k === 'bow' && Math.random() < 0.3) {} // стрела без следа
      if (p.k === 'eye' && Math.random() < 0.5) spawnPart({ x: p.x, y: p.y, vx: rnd(-20, 20), vy: rnd(-20, 20), life: .25, col: '#ff7a3a', kind: 'spark' });
      continue;
    }
    // попадание
    if (p.k === 'spore') { clouds.push({ x: p.x, y: p.y, r: WEAP.spore.r, t: 3.2, owner: p.owner }); Snd.play('glass', 0.4, 0.7); }
    if (p.k === 'fireball' && hit !== 'gone') fireBurst(p.x, p.y, p.r || 22, p.owner, p.burn || 2);
    if (p.k === 'frost') { if (hit !== 'gone') frostBurst(p.x, p.y, p.owner, WEAP.frost); projs.splice(i, 1); continue; }
    if (p.k === 'flask' && hit !== 'gone') { firePool(p.x, p.y, 34, 4.5, p.owner); Snd.play('glass', 0.8); projs.splice(i, 1); continue; }
    if (hit === 'wall') {
      if (p.k === 'bow' || p.k === 'arrow2') { stickArrow(p); Snd.play('metal', 0.3); }
      else if (p.k === 'sword') { Snd.play('metal', 0.6); spark(p.x, p.y, 8); }
      else spark(p.x, p.y, 4);
    }
    if (hit === 'gone' || p.k === 'bow' || p.k === 'arrow2') { projs.splice(i, 1); continue; }
    if (!PFX[p.k]) { projs.splice(i, 1); continue; }
    // анимация разлёта у спрайтовых снарядов
    p.dead = true; p.dieT = PFX[p.k].dieT || 0.3;
  }
}
function updBomb(p, dt) {
  p.fuse -= dt; if (p.fuse <= 0) { p.boom = true; return; }
  p.vy = Math.min(p.vy + p.grav * dt, MAXFALL);
  const b = { x: p.x, y: p.y + 4, w: 8, h: 8, spikeFloor: true };
  if (moveX(b, p.vx * dt)) p.vx *= -0.5;
  const r = moveY(b, p.vy * dt);
  if (r === 1) { if (p.vy > 120) Snd.play('metal', 0.25, 0.7); p.vy = -p.vy * 0.35; p.vx *= 0.7; if (Math.abs(p.vy) < 40) p.vy = 0; }
  else if (r === -1) p.vy = 0;
  p.x = b.x; p.y = b.y - 4;
  // бомба цепляет бойцов: замедляется о тело
  for (const o of fighters) if (o.alive && o !== p.owner && Math.abs(o.x - p.x) < o.w / 2 && p.y > top(o) && p.y < o.y) { p.vx *= 0.6; }
}
// малый огненный взрыв: поджигает всех рядом, ломает доски
function fireBurst(x, y, r, src, burn) {
  booms.push({ x, y, t: 0, k: 'blast32', dur: 0.4 });
  Snd.fx('explode', { v: 0.35 });
  for (let i = 0; i < 12; i++) spawnPart({ x, y, vx: rnd(-120, 120), vy: rnd(-140, 20), life: rnd(.2, .5), col: pick(['#ffd36b', '#ff8a2a', '#d8401a']), kind: 'spark', g: 300 });
  for (const o of fighters) if (o.alive && o !== src && !(src && o.team === src.team) && Math.hypot(o.x - x, midY(o) - y) < r + o.w / 2) { damage(o, 6, { kind: 'proj', src, dir: sgn(o.x - x) || 1, kb: 80, hy: midY(o) }); ignite(o, burn, src); }
  const c = Math.floor(x / T), rr = Math.floor((y + 4) / T);
  for (let dc = -1; dc <= 1; dc++) if (tile(c + dc, rr) === '=') hitPlank(c + dc, rr, 14);
}
// Лужа огня: растекается по поверхности, на которую упала, ±w/2 до края опоры.
function firePool(x, y, w, t, src) {
  let gy = null;
  for (let d = -6; d <= 48; d += 2) { const ch = tileAt(x, y + d); if (solid(ch) || oneway(ch)) { gy = Math.floor((y + d) / T) * T; break; } }
  for (const o of objs) if (!o.dead && x > o.x && x < o.x + o.w && o.y >= y - 6 && (gy === null || o.y < gy)) gy = o.y;
  if (gy === null) return;
  const ok = xx => { const ch = tileAt(xx, gy + 1); return solid(ch) || oneway(ch) || objs.some(o => !o.dead && xx > o.x && xx < o.x + o.w && Math.abs(o.y - gy) < 2); };
  let x0 = x, x1 = x; while (x0 > x - w / 2 && ok(x0 - 2)) x0 -= 2; while (x1 < x + w / 2 && ok(x1 + 2)) x1 += 2;
  pools.push({ x0, x1, y: gy, t, max: t, src, tick: 0 });
  Snd.fx('fire', { v: 0.5 });
  for (let i = 0; i < 10; i++) spawnPart({ x: rnd(x0, x1), y: gy - 2, vx: rnd(-40, 40), vy: rnd(-120, -40), life: rnd(.3, .6), col: pick(['#ffd36b', '#ff8a2a', '#d8401a']), kind: 'spark', g: 200 });
}
function updPools(dt) {
  for (let i = pools.length - 1; i >= 0; i--) {
    const pl = pools[i]; pl.t -= dt; if (pl.t <= 0) { pools.splice(i, 1); continue; }
    if (Math.random() < 0.9) spawnPart({ x: rnd(pl.x0, pl.x1), y: pl.y - 1, vx: rnd(-6, 6), vy: rnd(-50, -20), life: rnd(.2, .5), col: pick(['#ffd36b', '#ff8a2a', '#ff8a2a', '#d8401a']), kind: 'spark', g: -40 });
    pl.tick -= dt; if (pl.tick > 0) continue; pl.tick = 0.3;
    for (const o of fighters) if (o.alive && o.x + o.w / 2 > pl.x0 && o.x - o.w / 2 < pl.x1 && Math.abs(o.y - pl.y) < 6) ignite(o, 2, pl.src);
    const r = Math.floor((pl.y + 1) / T);
    for (let c = Math.floor(pl.x0 / T); c <= Math.floor(pl.x1 / T); c++) if (tile(c, r) === '=') hitPlank(c, r, 4);
    for (const o of objs) if (!o.dead && Math.abs(o.y + o.h - pl.y) < 3 && o.x < pl.x1 && o.x + o.w > pl.x0) hitObj(o, 3, pl.src);
  }
}
function dropLamp(l, src) { if (l.state !== 'hang') return; l.state = 'fall'; l.vy = 0; l.src = src; Snd.play('metal', 0.6); }
function updLamps(dt) {
  for (const l of lamps) {
    if (l.state !== 'fall') continue;
    l.vy = Math.min(l.vy + GRAV * dt, MAXFALL);
    const b = { x: l.x, y: l.y + 26, w: 10, h: 20 };
    const r = moveY(b, l.vy * dt); l.y = b.y - 26;
    for (const o of fighters) if (o.alive && l.vy > 200 && Math.abs(o.x - l.x) < o.w / 2 + 5 && b.y > top(o) && b.y < o.y) { damage(o, 14, { kind: 'proj', src: l.src, dir: 0, kb: 40, hy: top(o) + 3 }); l.vy = 0; r || (l.state = 'land'); }
    if (r === 1 || l.state === 'land') { booms.push({ x: l.x, y: b.y - 8, t: 0, k: 'blast32', dur: 0.4 }); l.state = 'gone'; Snd.play('glass', 0.9); firePool(l.x, b.y - 2, 40, 5, l.src); spark(l.x, b.y - 2, 10); }
    if (l.y > WH) l.state = 'gone';
  }
}
function stickArrow(p) {
  // стрела остаётся торчать в стене: штрих в слой пятен
  const n = Math.hypot(p.vx, p.vy) || 1, dx = p.vx / n, dy = p.vy / n;
  for (let k = 1; k <= 6; k++) stamp(p.x - dx * k, p.y - dy * k, k > 4 ? u32('#e8e2d0') : u32('#7a5634'));
}
function spark(x, y, n) { for (let i = 0; i < n; i++) spawnPart({ x, y, vx: rnd(-140, 140), vy: rnd(-160, 40), life: rnd(.15, .35), col: pick(['#ffe08a', '#ffb040', '#fff']), kind: 'spark', g: 600 }); }

function explode(x, y, r, dmg, src) {
  booms.push({ x, y, t: 0, k: 'blast64', dur: 0.6 });
  Snd.fx('explode', { v: 0.9 }); Snd.play('wood', 0.5, 0.6);
  shake = 9; hitStop = Math.max(hitStop, 0.06);
  for (let i = 0; i < 26; i++) { const a = rnd(0, Math.PI * 2), s = rnd(60, 260); spawnPart({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: rnd(.25, .6), col: pick(['#ffd36b', '#ff8a2a', '#d8401a', '#fff2c0']), kind: 'spark', g: 300 }); }
  for (let i = 0; i < 10; i++) spawnPart({ x: x + rnd(-10, 10), y: y + rnd(-10, 10), vx: rnd(-30, 30), vy: rnd(-60, -20), life: rnd(.6, 1.2), col: pick(['#3a3640', '#4a4650', '#2a2830']), kind: 'smoke', g: -40 });
  for (const o of fighters) {
    if (!o.alive) { if (o.corpse && !o.gone && Math.hypot(o.x - x, o.y - 8 - y) < r) gibs(o, sgn(o.x - x)); continue; }
    const d = Math.hypot(o.x - x, midY(o) - y);
    if (d < r + o.w / 2) { const k = 1 - d / (r + o.w); damage(o, dmg * Math.max(0.25, k), { kind: 'explosion', src, dir: sgn(o.x - x) || 1, kb: 300 * k + 80, hy: midY(o) }); }
  }
  for (const o of objs) if (!o.dead && Math.hypot(o.x + o.w / 2 - x, o.y + o.h / 2 - y) < r + 24) hitObj(o, dmg, src);
  const c0 = Math.floor((x - r) / T), c1 = Math.floor((x + r) / T), r0 = Math.floor((y - r) / T), r1 = Math.floor((y + r) / T);
  for (let rr = r0; rr <= r1; rr++) for (let c = c0; c <= c1; c++) if (tile(c, rr) === '=' && Math.hypot(c * T + 8 - x, rr * T + 4 - y) < r + 6) hitPlank(c, rr, 60);
  for (const p of projs) if (p.k === 'bomb' && !p.boom && Math.hypot(p.x - x, p.y - y) < r) p.fuse = Math.min(p.fuse, 0.12);
  for (const ch of chands) if (ch.state === 'hang' && Math.hypot(ch.x + 32 - x, ch.y + 40 - y) < r + 20) dropChandelier(ch, src);
  for (const l of lamps) if (l.state === 'hang' && Math.hypot(l.x - x, l.y + 16 - y) < r + 10) dropLamp(l, src);
  for (const it of items) if (Math.hypot(it.x - x, it.y - y) < r) { it.vy = -220; it.vx = sgn(it.x - x) * 140; }
}

// ─────────────────────────────────────────────────────────────── разрушаемое
function hitPlank(c, r, dmg) {
  const k = r * COLS + c; if (grid[r][c] !== '=') return;
  plankHp[k] -= dmg;
  for (let i = 0; i < 3; i++) spawnPart({ x: c * T + rnd(0, T), y: r * T + 3, vx: rnd(-60, 60), vy: rnd(-90, 0), life: rnd(.4, .8), col: pick(['#5e3a22', '#8a5a32', '#3b2416']), kind: 'debris', g: GRAV });
  Snd.play('plank', 0.5);
  if (plankHp[k] <= 0) {
    grid[r][c] = '.';
    clearStainRect(c * T, r * T, T, T);
    for (let i = 0; i < 8; i++) spawnPart({ x: c * T + rnd(0, T), y: r * T + rnd(0, 6), vx: rnd(-90, 90), vy: rnd(-120, 20), life: rnd(.6, 1.2), col: pick(['#5e3a22', '#8a5a32', '#3b2416', '#2a170d']), kind: 'debris', g: GRAV });
    Snd.play('wood', 0.7);
    buildSegs();
  }
}
function hitObj(o, dmg, src) {
  o.hp -= dmg; o.shakeT = 0.15;
  Snd.play('wood', 0.5);
  for (let i = 0; i < 4; i++) spawnPart({ x: o.x + rnd(0, o.w), y: o.y + rnd(0, o.h), vx: rnd(-80, 80), vy: rnd(-120, 0), life: rnd(.4, .8), col: pick(['#5e3a22', '#8a5a32', '#3b2416']), kind: 'debris', g: GRAV });
  if (o.hp <= 0 && !o.dead) {
    o.dead = true;
    for (let i = 0; i < 22; i++) spawnPart({ x: o.x + rnd(0, o.w), y: o.y + rnd(0, o.h), vx: rnd(-160, 160), vy: rnd(-220, -20), life: rnd(.6, 1.4), col: pick(['#5e3a22', '#8a5a32', '#3b2416', '#2a170d', '#a87444']), kind: 'debris', g: GRAV, big: true });
    Snd.play('wood', 1); Snd.play('plank', 0.8);
    shake = Math.max(shake, 4);
    if (Math.random() < 0.7) { const it = { k: pick(WKEYS), x: o.x + o.w / 2, y: o.y + o.h - 2, vy: -160, vx: 0 }; it.ammo = WEAP[it.k].ammo; items.push(it); }
    buildSegs();
  }
}
function dropChandelier(chand, src) {
  if (chand.state !== 'hang') return;
  chand.state = 'fall'; chand.vy = 0; chand.src = src;
  Snd.play('metalH', 0.8);
}
function updChandelier(chand, dt) {
  chand.t += dt;
  if (chand.state !== 'fall') return;
  chand.vy = Math.min(chand.vy + GRAV * dt, MAXFALL);
  const b = { x: chand.x + 32, y: chand.y + 60, w: 40, h: 50 };
  const r = moveY(b, chand.vy * dt);
  chand.y = b.y - 60;
  // ломает доски под собой
  if (r === 1) {
    const rr = Math.floor((b.y + 1) / T); let broke = false;
    for (let c = Math.floor((b.x - 20) / T); c <= Math.floor((b.x + 19) / T); c++) if (tile(c, rr) === '=') { hitPlank(c, rr, 999); broke = true; }
    if (broke) { chand.vy *= 0.5; return; }
    chand.state = 'down'; chand.vy = 0;
    Snd.play('metalH', 1); Snd.play('glass', 0.9); shake = 8;
    spark(b.x, b.y - 6, 20);
    for (let i = 0; i < 6; i++) spawnPart({ x: b.x + rnd(-24, 24), y: b.y - 4, vx: 0, vy: -10, life: rnd(1.5, 3), col: '#ffb040', kind: 'flame', g: 0 });
  }
  for (const o of fighters) if (o.alive && chand.vy > 150 && Math.abs(o.x - b.x) < 26 + o.w / 2 && o.y > b.y - 40 && top(o) < b.y) damage(o, 70, { kind: 'crush', src: chand.src, dir: sgn(o.x - b.x) || 1, kb: 120, hy: top(o) + 4 });
  if (chand.y > WH) chand.state = 'gone';
}

// ─────────────────────────────────────────────────────────────── частицы и кровь
function spawnPart(p) { if (parts.length > 1600) return; p.max = p.life; parts.push(p); }
function bleed(x, y, dir, n, spd, f) {
  const bones = f && BONY.has(f.race), shroom = f && f.race === 'mushroom';
  for (let i = 0; i < n; i++) {
    const vx = (dir ? dir * rnd(0.3, 1) : rnd(-1, 1)) * spd + rnd(-50, 50), vy = rnd(-1.1, 0.25) * spd * 0.8;
    if (!S.blood || bones) spawnPart({ x, y, vx, vy, life: rnd(.3, .7), col: bones ? pick(['#d8d2b8', '#a49c84']) : pick(['#8a8494', '#5a5664']), kind: 'dust', g: GRAV * 0.7 });
    else { const b = shroom ? pick([['#6a8a2a', u32('#6a8a2a')], ['#4a6a1a', u32('#4a6a1a')]]) : pick(BLOOD); spawnPart({ x, y, vx, vy, life: 2.5, col: b[0], u: b[1], kind: 'blood', g: GRAV * 0.85, sz: Math.random() < 0.3 ? 2 : 1 }); }
  }
}
function gibs(f, dir) {
  f.gone = true; f.reviveT = 0;              // разорванный скелет уже не встанет
  bleed(f.x, midY(f), 0, S.blood ? 60 : 20, 260, f);
  if (S.blood && GIBS.length && !BONY.has(f.race) && f.race !== 'mushroom') {
    splash('bblast', f.x, midY(f), dir || 1);
    for (let i = 0; i < 9; i++) { const k = (Math.random() * GIBS.length) | 0; spawnPart({ x: f.x + rnd(-6, 6), y: midY(f) + rnd(-12, 8), vx: rnd(-1, 1) * 210 + dir * 90, vy: rnd(-320, -80), life: 8, kind: 'meat', gib: k, g: GRAV, trail: true }); }
  }
  const pal = f.M.pal && f.M.pal.length ? f.M.pal : ['#8a8494', '#5a5664'];   // пустая палитра (картинка не загрузилась) не должна ронять игру
  for (let i = 0; i < 14; i++) {
    const sz = (Math.random() < 0.4 ? 3 : 2);
    spawnPart({ x: f.x + rnd(-6, 6), y: midY(f) + rnd(-10, 10), vx: rnd(-1, 1) * 200 + dir * 80, vy: rnd(-300, -60), life: 6, col: i % 3 === 0 && S.blood && f.race !== 'skeleton' ? '#8e0f1a' : pick(pal), kind: 'chunk', g: GRAV, sz, trail: S.blood && f.race !== 'skeleton' });
  }
}
function addFx(k, x, y, dir, fps) { if (splats.length > 60 || !MAN.fx[k]) return; splats.push({ k, x: Math.round(x), y: Math.round(y), t: 0, flip: dir < 0, fps: fps || 20 }); }
function splash(k, x, y, dir) { if (!S.blood || splats.length > 40) return; splats.push({ k, x: Math.round(x), y: Math.round(y), t: 0, flip: dir < 0 }); }
function floatText(x, y, s, col) { texts.push({ x, y, s, col, t: 0 }); }

function updParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy += (p.g || 0) * dt;
    const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
    if (p.kind === 'blood') {
      const ch = tileAt(nx, ny);
      if (solid(ch) || (oneway(ch) && p.vy > 0 && (ny % T) < 3) || ch === '^') { stamp(nx, ny, p.u); if (p.sz === 2 || Math.random() < 0.35) stamp(nx + (Math.random() < .5 ? -1 : 1), ny, p.u); if (p.sz === 2) { stamp(nx, ny + 1, p.u); stamp(nx + 1, ny + 1, BLOOD[0][1]); } parts.splice(i, 1); continue; }
      for (const o of objs) if (!o.dead && nx > o.x && nx < o.x + o.w && ny > o.y && ny < o.y + 3) { stamp(nx, o.y, p.u); p.life = 0; }
      if (p.max - p.life > 0.08 && Math.random() < 0.012) { stamp(nx, ny, BLOOD[0][1]); p.life = 0; }
      if (p.life <= 0) { parts.splice(i, 1); continue; }
    } else if (p.kind === 'meat') {
      // кусок мяса: прыгает, оставляет кровавый след, улёгшись — впечатывается в слой пятен
      const G = GIBS[p.gib], ch = tileAt(nx + G.w / 2, ny + G.h);
      if (solid(ch) || (oneway(ch) && p.vy > 0) || ch === '^') {
        const gy = Math.floor((ny + G.h) / T) * T;
        if (p.vy > 70) { p.vy = -p.vy * 0.28; p.vx *= 0.55; stamp(p.x + G.w / 2, gy, pick(BLOOD)[1]); }
        else { p.vy = 0; p.vx *= 0.75; p.rest = (p.rest || 0) + dt; }
        if (p.rest > 0.35) { const ox = Math.round(p.x), oy = gy - G.h; for (const [a, b, c] of G.pix) stamp(ox + a, oy + b, c); parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y = gy - G.h; continue;
      }
      if (solid(tileAt(nx + (p.vx > 0 ? G.w : 0), p.y + G.h / 2))) p.vx = -p.vx * 0.4;
      if (Math.random() < 0.35) spawnPart({ x: p.x + G.w / 2, y: p.y + G.h / 2, vx: 0, vy: 0, life: 2, col: BLOOD[1][0], u: BLOOD[1][1], kind: 'blood', g: GRAV });
    } else if (p.kind === 'chunk') {
      const ch = tileAt(nx, ny + p.sz);
      if (solid(ch) || (oneway(ch) && p.vy > 0) || ch === '^') {
        if (p.vy > 60) { p.vy = -p.vy * 0.3; p.vx *= 0.6; if (p.trail) stamp(p.x, Math.floor(ny / T) * T, pick(BLOOD)[1]); }
        else { p.vy = 0; p.vx *= 0.8; p.rest = (p.rest || 0) + dt; }
        if (p.rest > 0.4) { for (let a = 0; a < p.sz; a++) for (let b = 0; b < p.sz; b++) stamp(p.x + a, Math.floor(ny / T) * T - p.sz + b, u32(p.col)); parts.splice(i, 1); continue; }
        p.x += p.vx * dt; continue;
      }
      if (solid(tileAt(nx, p.y))) p.vx = -p.vx * 0.4;
      if (p.trail && Math.random() < 0.3) spawnPart({ x: p.x, y: p.y, vx: 0, vy: 0, life: 2, col: BLOOD[1][0], u: BLOOD[1][1], kind: 'blood', g: GRAV });
    } else if (p.kind === 'debris' || p.kind === 'spark' || p.kind === 'dust') {
      const ch = tileAt(nx, ny);
      if ((solid(ch) || (oneway(ch) && p.vy > 0 && (ny % T) < 3)) && p.vy > 0) { p.vy = -p.vy * 0.3; p.vx *= 0.5; if (Math.abs(p.vy) < 30) { p.vy = 0; p.g = 0; } p.x = nx; continue; }
    }
    p.x = nx; p.y = ny;
  }
  // облака спор: яд всем внутри
  for (let i = clouds.length - 1; i >= 0; i--) {
    const c = clouds[i]; c.t -= dt; if (c.t <= 0) { clouds.splice(i, 1); continue; }
    if (Math.random() < 0.6) spawnPart({ x: c.x + rnd(-c.r, c.r) * 0.8, y: c.y + rnd(-c.r * .6, c.r * .3), vx: rnd(-8, 8), vy: rnd(-14, -4), life: rnd(.6, 1.1), col: pick(['#7fd04a', '#5ea83a', '#a8e070']), kind: 'mist' });
    for (const o of fighters) if (o.alive && Math.hypot(o.x - c.x, midY(o) - c.y) < c.r) { o.poison = Math.max(o.poison, 1.2); o.poisonSrc = c.owner; }
  }
  for (let i = splats.length - 1; i >= 0; i--) { const sp = splats[i]; sp.t += dt; if (sp.t * (sp.fps || 22) >= MAN.fx[sp.k].n) splats.splice(i, 1); }
  for (let i = bolts.length - 1; i >= 0; i--) { bolts[i].t -= dt; if (bolts[i].t <= 0) bolts.splice(i, 1); }
  for (let i = delayed.length - 1; i >= 0; i--) { const d = delayed[i]; d.t -= dt; if (d.t <= 0) { delayed.splice(i, 1); d.fn(); } }
  for (let i = booms.length - 1; i >= 0; i--) { booms[i].t += dt; if (booms[i].t > booms[i].dur) booms.splice(i, 1); }
  for (let i = texts.length - 1; i >= 0; i--) { texts[i].t += dt; if (texts[i].t > 1.1) texts.splice(i, 1); }
}

// ─────────────────────────────────────────────────────────────── боты
function nearestFoe(f) {
  let best = null, bd = 1e9;
  for (const o of fighters) { if (o === f || !o.alive || o.team === f.team) continue; const d = Math.hypot(o.x - f.x, (o.y - f.y) * 1.6); if (d < bd) { bd = d; best = o; } }
  return best;
}
function los(a, b) {
  const x0 = a.x, y0 = midY(a) - 4, x1 = b.x, y1 = midY(b) - 4, n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 6);
  for (let i = 1; i < n; i++) if (solid(tileAt(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n))) return false;
  return true;
}
function groundAhead(x, y) {
  for (let d = 0; d <= 64; d += 4) { const ch = tileAt(x, y + d + 1); if (ch === '^') return 'spike'; if (solid(ch) || oneway(ch)) return 'ok'; }
  for (const o of objs) if (!o.dead && x > o.x && x < o.x + o.w && o.y >= y && o.y < y + 64) return 'ok';
  return 'fall';
}
// что первым встретится под точкой до самого низа: опора или шипы (в полёте 64 px мало — поздно сворачивать)
function firstBelow(x, y) { for (let yy = y + 1; yy < WH; yy += 4) { const ch = tileAt(x, yy); if (ch === '^') return 'spike'; if (solid(ch) || oneway(ch)) return 'ok'; } return 'fall'; }
// ширина провала от x в сторону dir до ближайшей опоры (Infinity — опоры в пределах 140 px нет)
function pitWidth(x, y, dir) { for (let d = 4; d <= 140; d += 4) if (groundAhead(x + dir * d, y) === 'ok') return d; return Infinity; }
function botThink(f, dt) {
  const ai = f.ai, D = DIFF[f.diffKey || S.diff];
  f.press = {};
  // рефлексы каждый кадр
  f.move = ai.move;
  if (f.onGround && f.move) {
    const ax = f.x + f.move * (f.w / 2 + 3);
    if (solid(tileAt(ax, f.y - 6)) || objs.some(o => !o.dead && ax > o.x && ax < o.x + o.w && f.y - 6 > o.y && f.y - 6 < o.y + o.h)) f.press.jump = true;
    const g = groundAhead(f.x + f.move * (f.w / 2 + 6), f.y);
    if (g === 'spike') {
      // прыгаем через яму, только если хватает дальности прыжка; сломанный мост над пропастью не перепрыгнуть
      const reach = RUN * f.R.spd * (2 * JUMP * f.R.jump / GRAV) * 0.8, pw = pitWidth(f.x, f.y, f.move);
      if (ai.cross && pw < reach - f.w) f.press.jump = true; else { f.move = 0; ai.move = 0; }
    }
  }
  // в полёте над шипами тянемся к ближайшему краю
  if (!f.onGround && f.vy > 0 && firstBelow(f.x, f.y) === 'spike') { const l = pitWidth(f.x, f.y, -1), rr = pitWidth(f.x, f.y, 1); f.move = l < rr ? -1 : 1; }
  // застрял — прыгаем
  if (ai.move && Math.abs(f.x - ai.lastX) < 0.3) { ai.stuckT += dt; if (ai.stuckT > 0.6) { f.press.jump = true; ai.stuckT = 0; if (Math.random() < 0.4) ai.move = -ai.move; } } else ai.stuckT = 0;
  ai.lastX = f.x;
  // уклон от снарядов
  for (const p of projs) {
    if (p.owner === f || p.dead) continue;
    if (Math.abs(p.y - midY(f)) < 18 && sgn(p.vx) === sgn(f.x - p.x) && Math.abs(f.x - p.x) < 80 && f.onGround && Math.random() < D.dodge * 0.15) f.press.jump = true;
  }
  ai.t -= dt; if (ai.t > 0) return;
  ai.t = D.react * rnd(0.6, 1.4);

  const foe = nearestFoe(f); if (!foe) { ai.move = 0; return; }
  const dx = foe.x - f.x, dy = foe.y - f.y, ad = Math.abs(dx);
  const a1 = animOf(f, 'atk1'), reach = Math.min(a1.reach * 0.92, f.R.reach) * 0.9 + foe.w / 2;
  let gx = foe.x, gy = foe.y;
  // без оружия — к ближайшему, если оно не дальше врага
  if (!f.wpn && items.length) {
    let it = null, bd = 1e9; for (const o of items) { const d = Math.hypot(o.x - f.x, (o.y - f.y) * 1.5); if (d < bd) { bd = d; it = o; } }
    if (it && bd < Math.hypot(dx, dy) * 1.1 + 60) { gx = it.x; gy = it.y; }
  } else if ((f.R.shot || (f.wpn && f.wpn.k !== 'bomb')) && ad < 70 && Math.abs(dy) < 20) gx = f.x - sgn(dx) * 100;
  navigate(f, gx, gy);
  // бой
  if (f.R.shot && !f.atk && Math.abs(dy) < 26 && ad > 40 && ad < 320 && los(f, foe) && Math.random() < D.shoot) {
    f.face = sgn(dx) || f.face; f.aim = f.R.shot.grav && ad > 200 ? 1 : 0; f.press.atk = true;
  } else if (ad < reach && Math.abs(dy) < Math.max(28, f.h * 0.6)) {
    if (Math.random() < D.agg) { f.face = sgn(dx) || f.face; ai.move = 0; f.press.atk = true; }
  } else if (f.wpn && f.rcd <= 0 && Math.abs(dy) < 26 && ad < 340 && los(f, foe) && Math.random() < D.shoot) {
    f.face = sgn(dx) || f.face;
    f.aim = (f.wpn.k === 'bow' && ad > 170) ? 1 : ((f.wpn.k === 'bomb' || f.wpn.k === 'flask') && ad > 160) ? 1 : 0;
    f.press.sht = true;
  } else if (f.wpn && dy < -40 && ad < 120 && f.wpn.k !== 'bomb' && Math.random() < D.shoot * 0.5) {
    f.face = sgn(dx) || f.face; f.aim = 1; f.press.sht = true;
  }
}
function navigate(f, gx, gy) {
  const ai = f.ai, dyg = gy - f.y, jumpH = JUMP * f.R.jump * JUMP * f.R.jump / (2 * GRAV) - 6;
  ai.cross = false;
  // далеко по горизонтали — сначала идём к цели, лезть вверх будем рядом с ней
  if (dyg < -24 && Math.abs(gx - f.x) < 150) {
    // ищем площадку выше, до которой допрыгнем, и которая ближе к цели
    let best = null, bs = 1e9;
    for (const s of SEGS) {
      if (s.y >= f.y - 8 || s.y < f.y - jumpH) continue;
      const nx = clamp(f.x, s.x0 + 6, s.x1 - 6), score = Math.abs(clamp(gx, s.x0, s.x1) - gx) + Math.abs(nx - f.x) * 0.35 + Math.abs(s.y - gy) * 0.5;
      if (score < bs) { bs = score; best = s; }
    }
    if (best) {
      const inX = f.x > best.x0 - 14 && f.x < best.x1 + 14;
      if (inX) { if (f.onGround) f.press.jump = true; const mid = clamp(gx, best.x0 + 8, best.x1 - 8); ai.move = Math.abs(mid - f.x) > 6 ? sgn(mid - f.x) : 0; }
      else ai.move = sgn((f.x < best.x0 ? best.x0 + 4 : best.x1 - 4) - f.x);
      return;
    }
  } else if (dyg > 24 && f.onGround && onOneway(f)) { f.press.down = true; }
  ai.move = Math.abs(gx - f.x) > 10 ? sgn(gx - f.x) : 0;
  ai.cross = true;
}

// ─────────────────────────────────────────────────────────────── ввод
const keys = new Set();
const MAPS = {
  solo: { l: ['ArrowLeft', 'KeyA'], r: ['ArrowRight', 'KeyD'], u: ['ArrowUp', 'KeyW', 'Space'], d: ['ArrowDown', 'KeyS'], atk: ['KeyJ', 'KeyZ'], sht: ['KeyK', 'KeyX'] },
  p1: { l: ['KeyA'], r: ['KeyD'], u: ['KeyW'], d: ['KeyS'], atk: ['KeyF'], sht: ['KeyG'] },
  p2: { l: ['ArrowLeft'], r: ['ArrowRight'], u: ['ArrowUp'], d: ['ArrowDown'], atk: ['Numpad1', 'Comma'], sht: ['Numpad2', 'Period'] },
};
const touch = { l: false, r: false, u: false, d: false, atk: false, sht: false, jump: false, down: false };
let isTouch = false;
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code); Snd.unlock();
  if (!demo && (e.code === 'Escape' || e.code === 'KeyP') && (state === 'fight' || state === 'roulette' || state === 'roundEnd')) pauseGame();
  else if (e.code === 'Escape' && state === 'paused') resumeGame();

});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
document.addEventListener('contextmenu', e => e.preventDefault());

function humanInput(f) {
  const map = S.mode === 'solo' ? MAPS.solo : f.ctrl === 'p1' ? MAPS.p1 : MAPS.p2;
  const h = {}; for (const k in map) h[k] = map[k].some(c => keys.has(c));
  if (f.ctrl === 'p1' && isTouch) { h.l ||= touch.l; h.r ||= touch.r; h.atk ||= touch.atk; h.sht ||= touch.sht; h.jb = touch.jump; h.db = touch.down; }
  const p = f.prevHeld;
  f.move = (h.r ? 1 : 0) - (h.l ? 1 : 0);
  f.aim = (h.u || (isTouch && touch.u)) ? 1 : (h.d || (isTouch && touch.d)) ? -1 : 0;
  f.press = {
    jump: (h.u && !p.u && !h.sht) || (h.jb && !p.jb),
    down: (h.d && !p.d && !h.sht) || (h.db && !p.db),
    atk: h.atk && !p.atk,
    sht: h.sht && !p.sht,
  };
  f.prevHeld = h;
}

// сенсорное управление: стик слева, кнопки справа
function setupTouch() {
  const stick = document.getElementById('stick'), knob = document.getElementById('knob');
  let sid = null;
  const upd = (e) => {
    const r = stick.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    touch.l = dx < -16; touch.r = dx > 16; touch.u = dy < -34; touch.d = dy > 34;
    const m = r.width / 2 - 26, k = Math.min(1, m / (Math.hypot(dx, dy) || 1));
    knob.style.transform = `translate(${dx * k}px,${dy * k}px)`;
  };
  stick.addEventListener('pointerdown', e => { sid = e.pointerId; stick.setPointerCapture(sid); upd(e); Snd.unlock(); });
  stick.addEventListener('pointermove', e => { if (e.pointerId === sid) upd(e); });
  const end = e => { if (e.pointerId !== sid) return; sid = null; touch.l = touch.r = touch.u = touch.d = false; knob.style.transform = ''; };
  stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
  for (const b of document.querySelectorAll('#tbtns .btn')) {
    const k = b.dataset.k;
    b.addEventListener('pointerdown', e => { touch[k] = true; b.setPointerCapture(e.pointerId); Snd.unlock(); });
    const off = () => { touch[k] = false; };
    b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
  }
}

// ─────────────────────────────────────────────────────────────── ход игры
function startDemo() {
  demo = true; surv = null;
  fighters = [0, 1, 2, 3].map(i => makeFighter(i, 'bot'));
  round = 0; show('hud', false); show('roul', false);
  nextRound();
}
function startMatch() {
  demo = false; surv = null;
  if (S.mode === 'surv') { startSurvival(); return; }
  fighters = [];
  if (S.mode === 'solo') { fighters.push(makeFighter(0, 'p1')); for (let i = 0; i < S.bots; i++) fighters.push(makeFighter(i + 1, 'bot')); }
  else { fighters.push(makeFighter(0, 'p1'), makeFighter(1, 'p2')); for (let i = 0; i < Math.min(S.bots, 2); i++) fighters.push(makeFighter(i + 2, 'bot')); }
  round = 0;
  show('menu', false); show('over', false);
  nextRound();
}
function nextRound() {
  round++;
  let ai = S.arena === 'random' ? (Math.random() * ARENAS.length) | 0 : +S.arena;
  if (S.arena === 'random' && ai === lastArena) ai = (ai + 1 + ((Math.random() * (ARENAS.length - 1)) | 0)) % ARENAS.length;
  lastArena = ai; loadArena(ARENAS[ai]);
  resetObjs(); resetMap(); stainU32.fill(0); stainDirty = true;
  items = []; projs = []; parts = []; clouds = []; booms = []; texts = []; splats = []; bolts = []; delayed = [];
  // расы: стараемся не повторять в одном раунде
  const pool = shuffle(RACES.slice());
  const sp = fighters.length === 2 ? [SPAWNS[0], SPAWNS[1]] : shuffle(SPAWNS.slice());
  fighters.forEach((f, i) => { f.race = pool[i % pool.length]; spawnFighter(f, sp[i]); addFx('smoke', f.x, midY(f)); });
  for (let i = 0; i < 2; i++) spawnItem();
  itemT = 6; roundT = 0; quakeOn = false; quakeT = 0;
  if (demo) { state = 'fight'; return; }
  state = 'roulette'; stateT = 1.3;
  banner(`${L.round} ${round} · ${L.arenas[AR.id]}`, 1.3);
  for (const f of fighters) if (f.ctrl !== 'bot') floatText(f.x, top(f) - 10, L.races[f.race][0], f.color);
  buildHud();
  Snd.play('bell', 0.5);
}

// ── выживание: игрок один, враги волнами падают сверху ──
function startSurvival() {
  const pl = makeFighter(0, 'p1', 0);
  pl.race = pick(RACES);
  fighters = [pl];
  surv = { wave: 0, kills: 0, toSpawn: 0, spawnT: 0, next: 1 };
  show('menu', false); show('over', false);
  nextWave(true);
}
function nextWave(first) {
  surv.wave++;
  const pl = fighters[0];
  let ai = S.arena === 'random' ? (surv.wave === 1 ? (Math.random() * ARENAS.length) | 0 : lastArena) : +S.arena;
  lastArena = ai; loadArena(ARENAS[ai]);
  resetObjs(); resetMap(); stainU32.fill(0); stainDirty = true;
  items = []; projs = []; parts = []; clouds = []; booms = []; texts = []; splats = []; bolts = []; delayed = [];
  fighters = [pl];
  if (first) spawnFighter(pl, SPAWNS[0]);
  else { pl.x = SPAWNS[0][0] * T; pl.y = SPAWNS[0][1] * T; pl.vx = pl.vy = 0; pl.burn = pl.poison = 0; pl.atk = null; pl.hp = Math.min(pl.R.hp, pl.hp + pl.R.hp * 0.5); }
  surv.toSpawn = Math.min(2 + surv.wave, 16); surv.spawnT = 1;
  for (let i = 0; i < 2; i++) spawnItem();
  itemT = 6; roundT = 0;
  state = 'roulette'; stateT = 1.5;
  banner(`${L.wave} ${surv.wave}`, 1.5);
  if (first) floatText(pl.x, top(pl) - 10, L.races[pl.race][0], pl.color);
  buildHud();
  Snd.play('bell', 0.5);
}
function survTick(dt) {
  const pl = fighters[0];
  const foes = fighters.filter(f => f.team === 1 && (f.alive || f.reviveT > 0));
  const maxConc = Math.min(4, 1 + Math.floor((surv.wave - 1) / 2));   // 1,1,2,2,3,3,4: толпа нарастает постепенно
  surv.spawnT -= dt;
  if (surv.toSpawn > 0 && foes.length < maxConc && surv.spawnT <= 0) {
    surv.spawnT = rnd(0.8, 1.6); surv.toSpawn--;
    const f = makeFighter(surv.next++, 'bot', 1);
    f.race = pick(RACES); f.color = '#e05050';
    const xs = shuffle(AR.drops.slice()).slice(0, 3).sort((a, b) => Math.abs(b - pl.x) - Math.abs(a - pl.x));
    const far = SEGS.filter(sg => !sg.obj && sg.x1 - sg.x0 >= 32 && Math.abs((sg.x0 + sg.x1) / 2 - pl.x) > 140);
    const sg = far.length ? pick(far) : null;
    if (sg) { const x = rnd(sg.x0 + 12, sg.x1 - 12); spawnFighter(f, [x / T, sg.y / T]); addFx('portal', x, sg.y - 24, 1, 18); f.stun = 0.6; Snd.fx('portal', { v: 0.5 }); }
    else spawnFighter(f, [xs[0] / T, 0]);
    const w = surv.wave - 1;
    f.hp = Math.round(f.R.hp * Math.min(1.3, 0.45 + 0.07 * w)); f.hpMax = f.hp;
    f.dmgMul = Math.min(1.25, 0.45 + 0.06 * w);
    f.diffKey = surv.wave <= 2 ? 'easy' : surv.wave >= 8 && S.diff !== 'easy' ? 'hard' : S.diff;   // первые волны разминочные
    fighters.push(f);
  }
  if (!pl.alive && slowT <= 0 && !(pl.reviveT > 0)) { survOver(); return; }
  if (pl.alive && surv.toSpawn === 0 && foes.length === 0 && slowT <= 0) {
    state = 'roundEnd'; stateT = 2.2; banner(L.waveDone, 2); YS.stop();
  }
}
function survOver() {
  state = 'over';
  // рекорд пишем только за живого игрока: прогоны с автопилотом (__duel.auto) не должны его портить
  const human = fighters[0].ctrl !== 'bot';
  const best = human ? Math.max(S.best || 0, surv.wave) : (S.best || 0);
  const rec = human && best > (S.best || 0); if (human) { S.best = best; saveSettings(); }
  $('overTitle').textContent = `${L.survDead} ${surv.wave}`;
  $('overList').innerHTML = [[L.wave, surv.wave], [L.kills, surv.kills], [L.best, best + (rec ? ' ★' : '')]].map(([a, b]) => `<div class="row"><span>${a}</span><span>${b}</span></div>`).join('');
  show('over', true); show('pbtn', false); show('hud', false);
  YS.stop(); SFX.music.stop();
}
function endRound() {
  if (demo) { state = 'roundEnd'; stateT = 1.6; return; }
  const alive = fighters.filter(f => f.alive);
  const w = alive.length === 1 ? alive[0] : null;
  if (w) w.score++;
  state = 'roundEnd'; stateT = 2.4;
  banner(w ? `${nameOf(w)} ${L.takes}` : L.draw, 2.2);
  buildHud();
  YS.stop();
}
function nameOf(f) {
  const who = f.ctrl === 'bot' ? `${L.bot} ${f.i + (S.mode === 'solo' ? 0 : -1)}` : S.mode === 'solo' ? L.you : f.ctrl === 'p1' ? L.p1 : L.p2;
  return `${who} (${L.races[f.race][0]})`;
}
function checkMatchEnd() {
  if (demo) { nextRound(); return; }
  if (isSurv()) { nextWave(false); return; }
  const champ = fighters.find(f => f.score >= S.wins);
  if (!champ) { nextRound(); return; }
  state = 'over';
  document.getElementById('overTitle').textContent = `${nameOf(champ).replace(/ \(.*\)/, '')} ${L.matchWin}`;
  document.getElementById('overList').innerHTML = fighters.slice().sort((a, b) => b.score - a.score).map(f =>
    `<div class="row"><span style="color:${f.color}">${nameOf(f).replace(/ \(.*\)/, '')}</span><span>${f.score} ${L.points}</span></div>`).join('');
  show('over', true); show('pbtn', false); show('hud', false);
  Snd.fx('fanfare', { v: 0.5 });
  SFX.music.stop();
}

function step(dt) {
  if (state === 'paused' || state === 'menu' || state === 'over' || state === 'boot') return;
  if (hitStop > 0) { hitStop -= dt; return; }
  if (slowT > 0) dt *= 0.35;                // замедление последнего убийства, отсчёт в sim()
  simAcc += dt;
  while (simAcc >= DT * 0.999) { simAcc -= DT; sim(DT); }
}
function sim(dt) {
  stateT -= dt; roundT += dt; if (slowT > 0) slowT -= dt;
  if (state === 'roulette' && stateT <= 0) { state = 'fight'; banner(L.fight, 0.9); YS.start(); Snd.play('bell', 0.7); }
  for (const f of fighters) {
    if (state === 'fight' || state === 'roundEnd') { if (f.alive) { if (f.ctrl === 'bot') botThink(f, dt); else humanInput(f); } }
    else { f.move = 0; f.press = {}; }
    updFighter(f, dt);
  }
  updProjs(dt); updItems(dt); updParts(dt); updPools(dt); updLamps(dt); for (const ch of chands) updChandelier(ch, dt);
  for (const o of objs) {                                  // ящики падают, если опора сломана
    if (o.dead) continue;
    const b = { x: o.x + o.w / 2, y: o.y + o.h, w: o.w - 2, h: o.h };
    o.vy = Math.min(o.vy + GRAV * dt, MAXFALL);
    const saved = o.solid; o.solid = false;
    const r = moveY(b, o.vy * dt); o.solid = saved;
    o.y = b.y - o.h; if (r === 1) o.vy = 0;
    o.shakeT = (o.shakeT || 0) - dt;
    if (o.y > WH) o.dead = true;
  }
  if (state === 'fight') {
    itemT -= dt;
    if (itemT <= 0) { itemT = rnd(5, 8); if (items.length < 2 + fighters.length) spawnItem(); }
    if (isSurv()) survTick(dt);
    // внезапная смерть: через минуту с потолка сыплются бомбы, затяжной раунд закончится (не в выживании)
    if (!isSurv() && roundT > 60) {
      if (!quakeOn) { quakeOn = true; banner(L.quake, 1.6); Snd.play('metalH', 0.6, 0.6); }
      quakeT -= dt; shake = Math.max(shake, 1.5);
      if (quakeT <= 0) { quakeT = Math.max(0.5, 1.6 - (roundT - 60) * 0.03); projs.push({ k: 'bomb', x: rnd(40, WW - 40), y: -10, vx: rnd(-30, 30), vy: 60, grav: WEAP.bomb.grav, owner: null, t: 0, fuse: rnd(1.4, 2.2), frame: 0 }); }
    }
    const alive = fighters.filter(f => f.alive || f.reviveT > 0).length;
    if (!isSurv() && alive <= 1 && slowT <= 0) { if (!fighters.some(f => f.reviveT > 0)) endRound(); }
  }
  if (state === 'roundEnd' && stateT <= 0) checkMatchEnd();
  shake = Math.max(0, shake - dt * 30);
  updHud();
}

// ─────────────────────────────────────────────────────────────── рендер
const cvs = document.getElementById('c'), ctx = cvs.getContext('2d', { alpha: false });
const buf = document.createElement('canvas'), g = buf.getContext('2d');
let devW = 0, devH = 0, dpr = 1, SC = 1, viewW = WW, viewH = WH, offX = 0, offY = 0, portraitPanel = false;

function layout() {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cw = innerWidth, ch = innerHeight;
  if (!cw || !ch) return;                       // скрытая вкладка или панель: размеров нет, ждём resize
  devW = Math.round(cw * dpr); devH = Math.round(ch * dpr);
  cvs.width = devW; cvs.height = devH;
  const portrait = ch > cw * 1.05;
  portraitPanel = isTouch && portrait;
  const areaH = portraitPanel ? Math.round(devH * 0.64) : devH;
  if (portrait) SC = Math.max(1, Math.round(devW / 290));          // в портрете крупнее (видно ~250–290 px мира), камера ведёт игрока
  else {
    SC = Math.max(1, Math.floor(Math.min(devW / WW, areaH / WH)));
    if ((WW * SC * WH * SC) / (devW * areaH) < 0.7) SC++;                 // правило 70%: лучше обрезать, чем мельчить
  }
  viewW = Math.min(Math.ceil(devW / SC), portrait ? WW : 2000);
  viewH = Math.min(Math.ceil(areaH / SC), WH + (portrait ? 0 : 400));
  if (portraitPanel) viewH = Math.min(viewH, WH);
  buf.width = viewW; buf.height = viewH;
  offX = Math.floor((devW - viewW * SC) / 2); offY = portraitPanel ? 0 : Math.floor((areaH - viewH * SC) / 2);
  g.imageSmoothingEnabled = false; ctx.imageSmoothingEnabled = false;
  const tp = document.getElementById('touch');
  tp.classList.toggle('panelmode', portraitPanel);
  tp.style.top = portraitPanel ? ((offY + viewH * SC) / dpr) + 'px' : '';
  tp.style.height = portraitPanel ? '' : '0';
  document.getElementById('hud').style.top = Math.max(0, offY / dpr) + 'px';
}
addEventListener('resize', layout);
addEventListener('orientationchange', () => setTimeout(layout, 120));

function camTarget() {
  const al = fighters.filter(f => f.alive && !f.gone);
  const humans = al.filter(f => f.ctrl !== 'bot');
  const set = (viewW < WW * 0.75 && humans.length === 1) ? [humans[0], humans[0], ...al] : al;
  if (!set.length) return [WW / 2, WH / 2];
  let sx = 0, sy = 0; for (const f of set) { sx += f.x; sy += midY(f); } return [sx / set.length, sy / set.length];
}
function render() {
  if (!buf.width || !buf.height) return;
  // камера
  const [tx, ty] = camTarget();
  const wantX = viewW >= WW ? (WW - viewW) / 2 : clamp(tx - viewW / 2, 0, WW - viewW);
  const wantY = viewH >= WH ? (WH - viewH) / 2 : clamp(ty - viewH / 2, 0, WH - viewH);
  camX += (wantX - camX) * 0.12; camY += (wantY - camY) * 0.12;
  if (Math.abs(wantX - camX) < 0.5) camX = wantX; if (Math.abs(wantY - camY) < 0.5) camY = wantY;
  const sx = shake > 0 ? Math.round(rnd(-shake, shake) * 0.5) : 0, sy = shake > 0 ? Math.round(rnd(-shake, shake) * 0.5) : 0;
  const cx0 = Math.round(camX) - sx, cy0 = Math.round(camY) - sy;

  // фон арены: слои с параллаксом
  g.fillStyle = AR.fill || '#1f2f36'; g.fillRect(0, 0, viewW, viewH);
  for (const [key, k, mode] of AR.bgs) {
    const im = IMG[key]; if (!im) continue;
    if (mode === 'b') {
      const by = Math.round(WH - cy0 - im.height + (cy0 - (WH - viewH) / 2) * k);
      let bx = Math.round(-(cx0 * k)) % im.width; if (bx > 0) bx -= im.width;
      for (let x = bx; x < viewW; x += im.width) g.drawImage(im, x, by);
    } else {
      const bx = Math.round(-(cx0 + viewW / 2 - WW / 2) * k + viewW / 2 - im.width / 2), by = Math.round(-(cy0 + viewH / 2 - WH / 2) * k + viewH / 2 - im.height / 2);
      g.drawImage(im, bx, by);
    }
  }
  g.save(); g.translate(-cx0, -cy0);
  g.drawImage(AR.decorC, 0, 0);
  // фонари (покачиваются — кадры пака)
  for (const l of lamps) if (l.state !== 'gone') { const fr = l.state === 'hang' ? Math.floor(performance.now() / 140) % 6 : 0; g.drawImage(IMG.lantern, fr * 48, 0, 48, 32, l.x - 24, Math.round(l.y), 48, 32); if (l.state === 'hang') { g.fillStyle = '#2a1e1a'; g.fillRect(l.x, 0, 1, 42); } }
  g.drawImage(AR.tiles, 0, 0);
  // мосты
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (grid[r][c] === '=') {
    const lft = base[r][c - 1] !== '=', rgt = base[r][c + 1] !== '=';
    let c0 = c; while (base[r][c0 - 1] === '=') c0--;
    const k = c - c0;
    const sxp = lft ? BEAM.x : rgt ? BEAM.x + BEAM.w - T : BEAM.x + 16 + ((k - 1) % 8) * 16;
    g.drawImage(IMG.cave, sxp, BEAM.y, T, T, c * T, r * T, T, T);
    if (plankHp[r * COLS + c] < 20) { g.fillStyle = '#1a0e08'; g.fillRect(c * T + 5, r * T + 4, 2, 3); g.fillRect(c * T + 11, r * T + 9, 3, 2); }
  }
  // пятна крови поверх камня
  if (stainDirty) { stainG.putImageData(stainImg, 0, 0); stainDirty = false; }
  g.drawImage(stainC, 0, 0);
  // ящики
  for (const o of objs) if (!o.dead) { const jx = o.shakeT > 0 ? Math.round(rnd(-1, 1)) : 0; g.drawImage(IMG.cave, o.src[0], o.src[1], 48, 48, Math.round(o.x) + jx, Math.round(o.y), 48, 48); }
  // люстра
  for (const chand of chands) if (chand.state !== 'gone') {
    const fr = chand.state === 'down' ? 0 : Math.floor(chand.t * 7) % 5;
    if (chand.state === 'hang') { g.fillStyle = '#2a1e1a'; g.fillRect(chand.x + 31, 0, 2, chand.y + 4); }
    g.drawImage(IMG.chandelier, fr * 64, 0, 64, 64, Math.round(chand.x), Math.round(chand.y), 64, 64);
  }
  // оружие на земле
  for (const it of items) drawItem(it.k, Math.round(it.x), Math.round(it.y), it.t);
  // бойцы: сначала трупы
  for (const f of fighters) if (!f.alive && !f.gone) drawFighter(f);
  for (const f of fighters) if (f.alive) drawFighter(f);
  // лужи огня: тлеющая кромка под языками пламени
  for (const pl of pools) { const k = pl.t / pl.max; for (let x = Math.round(pl.x0); x < pl.x1; x++) { if (((x * 7) ^ Math.floor(pl.t * 12)) % 3 === 0) continue; g.fillStyle = k > 0.3 ? (x & 1 ? '#ff8a2a' : '#d8401a') : '#6a2a14'; g.fillRect(x, pl.y - 1, 1, 1); } }
  // снаряды
  for (const p of projs) drawProj(p);
  // взрывы Aim Studios: большой у бомб, малый у огненных шаров, склянок и фонарей
  for (const b of booms) { const fx = MAN.fx[b.k]; if (!fx || !fx.img) continue; const fr = Math.min(fx.n - 1, Math.floor(b.t / b.dur * fx.n)); g.drawImage(fx.img, fr * fx.fw, 0, fx.fw, fx.fh, Math.round(b.x - fx.fw / 2), Math.round(b.y - fx.fh / 2), fx.fw, fx.fh); }
  // частицы
  // анимации крови поверх бойцов
  for (const sp of splats) {
    const fx = MAN.fx[sp.k]; if (!fx || !fx.img) continue;
    const fr = Math.min(fx.n - 1, Math.floor(sp.t * (sp.fps || 22))), img = sp.flip ? fx.imgL : fx.img, sx = sp.flip ? (fx.n - 1 - fr) * fx.fw : fr * fx.fw;
    const px = fx.pivot ? (sp.flip ? fx.fw - 1 - fx.pivot[0] : fx.pivot[0]) : fx.fw >> 1, py = fx.pivot ? fx.pivot[1] : fx.fh >> 1;
    g.drawImage(img, sx, 0, fx.fw, fx.fh, sp.x - px, sp.y - py, fx.fw, fx.fh);
  }
  // молнии: ломаная из пикселей, два цвета
  for (const b of bolts) for (let i = 1; i < b.pts.length; i++) { const [x0, y0] = b.pts[i - 1], [x1, y1] = b.pts[i], n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
    for (let k = 0; k <= n; k++) { const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n); g.fillStyle = '#6ad0ff'; g.fillRect(x, y - 1, 1, 3); g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); } }
  // замороженные: искры льда по контуру тела
  for (const f of fighters) if (f.alive && f.frozen > 0) { g.fillStyle = '#bfe8ff'; for (let k = 0; k < 10; k++) { const a = (k * 37 + Math.floor(f.frozen * 9)) % 20; g.fillRect(Math.round(f.x - f.w / 2 + (a % 10) * f.w / 9), Math.round(f.y - f.h + ((k * 13) % 10) * f.h / 9), 1, 1); } }
  for (const p of parts) {
    if (p.kind === 'meat') { g.drawImage(GIBS[p.gib].img, Math.round(p.x), Math.round(p.y)); continue; }
    if (p.kind === 'smoke' || p.kind === 'mist') { if (((p.x | 0) + (p.y | 0)) & 1) continue; }
    if (p.kind === 'flame') { g.fillStyle = Math.random() < 0.5 ? '#ffd36b' : '#ff8a2a'; g.fillRect(Math.round(p.x), Math.round(p.y - rnd(0, 3)), 1, 2); continue; }
    g.fillStyle = p.col; const sz = p.sz || (p.big ? 2 : 1);
    g.fillRect(Math.round(p.x), Math.round(p.y), sz, sz);
  }
  // метки над головами
  for (const f of fighters) if (f.alive) {
    const x = Math.round(f.x), y = Math.round(top(f)) - 7;
    g.fillStyle = '#000'; g.fillRect(x - 3, y - 1, 7, 4);
    g.fillStyle = f.color; g.fillRect(x - 2, y, 5, 1); g.fillRect(x - 1, y + 1, 3, 1); g.fillRect(x, y + 2, 1, 1);
    if (f.poison > 0) { g.fillStyle = '#7fd04a'; g.fillRect(x - 2, y - 3, 5, 1); }
  }
  for (const t of texts) { g.font = '8px monospace'; g.fillStyle = '#000'; g.fillText(t.s, Math.round(t.x - g.measureText(t.s).width / 2) + 1, Math.round(t.y - t.t * 16) + 1); g.fillStyle = t.col; g.fillText(t.s, Math.round(t.x - g.measureText(t.s).width / 2), Math.round(t.y - t.t * 16)); }
  g.restore();
  // стрелки на бойцов за краем экрана
  for (const f of fighters) if (f.alive) {
    const x = f.x - cx0, y = midY(f) - cy0;
    if (x < 0 || x > viewW || y < 0 || y > viewH) { const ex = clamp(x, 4, viewW - 5), ey = clamp(y, 4, viewH - 5); g.fillStyle = '#000'; g.fillRect(ex - 3, ey - 3, 7, 7); g.fillStyle = f.color; g.fillRect(ex - 2, ey - 2, 5, 5); }
  }
  ctx.fillStyle = '#07070c'; ctx.fillRect(0, 0, devW, devH);
  ctx.drawImage(buf, 0, 0, viewW, viewH, offX, offY, viewW * SC, viewH * SC);
}

function drawFighter(f) {
  const Mr = f.M; let a = animOf(f, f.anim);
  let fr;
  if (!f.alive) { a = Mr.anims.death; fr = f.reviveT > 0 && f.reviveT < 0.6 ? Math.floor((f.reviveT / 0.6) * a.n) : Math.min(a.n - 1, Math.floor(f.deadT * 10)); }
  else if (f.atk) fr = Math.min(a.n - 1, Math.floor(f.atk.t / f.atk.dur * a.n));
  else if (f.anim === 'jump' || f.anim === 'fall') fr = Math.min(a.n - 1, Math.floor(f.animT * 8));
  else if (f.anim === 'hit') fr = Math.min(a.n - 1, Math.floor(f.animT * 14));
  else fr = Math.floor(f.animT * (f.anim === 'run' ? 12 * f.R.spd : 9)) % a.n;
  const flip = f.face < 0;
  const img = flip ? a.imgL : a.img; if (!img) return;
  const sxp = flip ? (a.n - 1 - fr) * Mr.fw : fr * Mr.fw;
  const ax = flip ? Mr.fw - 1 - Mr.anchor.cx : Mr.anchor.cx;
  const dx = Math.round(f.x) - ax, dy = Math.round(f.y) - Mr.anchor.feet;
  if (f.flash > 0 && f.alive) { g.globalCompositeOperation = 'source-over'; }
  g.drawImage(img, sxp, 0, Mr.fw, Mr.fh, dx, dy, Mr.fw, Mr.fh);
  if (f.flash > 0 && f.alive && Mr.anims.hit) { /* вспышка урона даёт сама анимация «hit» */ }
}

// снаряды: лист, сколько кадров полёта, чем разлетается (свой лист или хвост того же)
const PFX = {
  sword: { fx: 'sword', fly: 4 }, eye: { fx: 'eyebolt', fly: 3 }, spore: { fx: 'spore', fly: 5 },
  arrow2: { fx: 'arrow2', fly: 2 },
  fireball: { fx: 'fireball', fly: 6, die: 'fireboom', dieT: 0.35 },
  vampbolt: { fx: 'vampbolt', fly: 4, die: 'vampboom', dieT: 0.35 },
};
// иконки оружия: первые кадры спрайтов пака, лук — пара линий
function drawItem(k, x, y, t) {
  const bob = Math.floor(t * 3) % 2;
  if (k === 'bow') {
    g.fillStyle = '#8a5a32';
    for (let i = -5; i <= 5; i++) g.fillRect(x + Math.round(2 - (i * i) / 10), y - 8 - bob + i, 1, 1);
    g.fillStyle = '#d8d2c0'; g.fillRect(x - 2, y - 13 - bob, 1, 11);
    g.fillStyle = '#c8ccd8'; g.fillRect(x - 4, y - 8 - bob, 8, 1);
  } else if (k === 'flask') {
    drawFlask(x, y - 4 - bob, t);
  } else if (k === 'storm' || k === 'frost' || k === 'earth') {
    // свиток: пергамент с палочками и камень своего цвета
    const gem = { storm: ['#6ad0ff', '#ffffff'], frost: ['#bfe8ff', '#7ab8e0'], earth: ['#b07a3a', '#e0b070'] }[k];
    g.fillStyle = '#d8c8a0'; g.fillRect(x - 4, y - 3 - bob, 9, 3); g.fillStyle = '#8a6a44'; g.fillRect(x - 5, y - 3 - bob, 1, 3); g.fillRect(x + 5, y - 3 - bob, 1, 3);
    g.fillStyle = gem[0]; g.fillRect(x - 1, y - 7 - bob, 3, 3); g.fillStyle = gem[1]; g.fillRect(x, y - 6 - bob, 1, 1);
  } else if (k === 'heal') {
    // зелье: красная бутылочка с пробкой
    g.fillStyle = '#7a1a22'; g.fillRect(x - 2, y - 6 - bob, 5, 6); g.fillStyle = '#d43a4a'; g.fillRect(x - 1, y - 5 - bob, 3, 4); g.fillStyle = '#ffb0b8'; g.fillRect(x - 1, y - 5 - bob, 1, 1);
    g.fillStyle = '#c8b090'; g.fillRect(x, y - 8 - bob, 1, 2);
  } else {
    const fx = MAN.fx[k === 'eye' ? 'eyebolt' : k === 'scroll' ? 'fireball' : k], fr = k === 'bomb' ? 3 : k === 'spore' ? 1 : 0;
    const off = { bomb: [50, 56], sword: [52, 56], eye: [24, 30], spore: [26, 32], scroll: [23, 30] }[k];
    if (k === 'scroll') { g.fillStyle = '#d8c8a0'; g.fillRect(x - 4, y - 3 - bob, 9, 3); g.fillStyle = '#8a6a44'; g.fillRect(x - 5, y - 3 - bob, 1, 3); g.fillRect(x + 5, y - 3 - bob, 1, 3); }
    g.drawImage(fx.img, fr * fx.fw, 0, fx.fw, fx.fh, x - off[0], y - off[1] - bob, fx.fw, fx.fh);
  }
  if (Math.floor(t * 4) % 6 === 0) { g.fillStyle = '#fff'; g.fillRect(x + 3, y - 12, 1, 1); }
}
// огненная склянка: бутылочка 3×6 и горящий фитиль
function drawFlask(x, y, t) {
  g.fillStyle = '#2a5a3a'; g.fillRect(x - 1, y - 3, 3, 5); g.fillStyle = '#4a9a5a'; g.fillRect(x - 1, y - 2, 1, 3);
  g.fillStyle = '#c8b090'; g.fillRect(x, y - 5, 1, 2);
  g.fillStyle = Math.floor(t * 10) % 2 ? '#ffd36b' : '#ff8a2a'; g.fillRect(x, y - 6, 1, 1);
}
function drawProj(p) {
  const x = Math.round(p.x), y = Math.round(p.y);
  if (p.k === 'frost') { g.fillStyle = '#7ab8e0'; g.fillRect(x - 2, y - 1, 5, 3); g.fillRect(x - 1, y - 2, 3, 5); g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); g.fillStyle = '#bfe8ff'; g.fillRect(x - sgn(p.vx) * 3, y, 1, 1); g.fillRect(x - sgn(p.vx) * 5, y + (Math.floor(p.t * 20) & 1), 1, 1); return; }
  if (p.k === 'flask') { drawFlask(x, y, p.t); return; }
  if (p.k === 'bow') {
    const n = Math.hypot(p.vx, p.vy) || 1, dx = p.vx / n, dy = p.vy / n;
    g.fillStyle = '#8a6a44'; for (let k = 1; k < 7; k++) g.fillRect(Math.round(x - dx * k), Math.round(y - dy * k), 1, 1);
    g.fillStyle = '#e8ecf4'; g.fillRect(x, y, 1, 1); g.fillRect(Math.round(x - dx), Math.round(y - dy), 1, 1);
    return;
  }
  let fx, fr;
  if (p.k === 'bomb') { fx = MAN.fx.bomb; fr = Math.floor(p.t * 12) % 9; }
  else {
    const P = PFX[p.k], dur = P.dieT || 0.3;
    if (p.dead && P.die) { fx = MAN.fx[P.die]; fr = Math.min(fx.n - 1, Math.floor((dur - p.dieT) / dur * fx.n)); }
    else if (p.dead) { fx = MAN.fx[P.fx]; const n = fx.n - P.fly; if (n <= 0) return; fr = P.fly + Math.min(n - 1, Math.floor((dur - p.dieT) / dur * n)); }
    else { fx = MAN.fx[P.fx]; fr = Math.floor(p.t * 14) % P.fly; }
  }
  const flip = p.vx < 0 && p.k !== 'bomb';
  const img = flip ? fx.imgL : fx.img, sxp = flip ? (fx.n - 1 - fr) * fx.fw : fr * fx.fw;
  g.drawImage(img, sxp, 0, fx.fw, fx.fh, x - (fx.fw >> 1), y - (fx.fh >> 1) - (p.k === 'bomb' ? 4 : 0), fx.fw, fx.fh);
}

// ─────────────────────────────────────────────────────────────── интерфейс
const $ = id => document.getElementById(id);
function show(id, on) { $(id).classList.toggle('hide', !on); }
let bannerT = 0;
function banner(s, t) { $('banner').textContent = s; bannerT = t; }
function applyI18n() {
  document.title = L.title;
  for (const el of document.querySelectorAll('[data-i]')) el.textContent = L[el.dataset.i];
  $('pbtn').setAttribute('aria-label', L.pause);
}
function buildMenu() {
  const opts = $('opts'); opts.innerHTML = '';
  const row = (label, key, vals, fmt) => {
    const r = document.createElement('div'); r.className = 'row';
    r.innerHTML = `<span>${label}</span><div class="seg"></div>`;
    const seg = r.querySelector('.seg');
    for (const v of vals) {
      const b = document.createElement('button'); b.className = 'btn' + (S[key] === v ? ' on' : ''); b.textContent = fmt(v);
      b.onclick = () => { S[key] = v; Snd.unlock(); Snd.play('pickup', 0.4); if (key === 'sound') Snd.mute(!S.sound); if (key === 'mode') { if (S.mode === 'duo' && S.bots > 2) S.bots = 2; if (S.mode === 'solo' && S.bots < 1) S.bots = 1; } saveSettings(); buildMenu(); };
      seg.appendChild(b);
    }
    opts.appendChild(r);
  };
  row(L.mode, 'mode', isTouch ? ['solo', 'surv'] : ['solo', 'duo', 'surv'], v => L[v]);
  if (S.mode !== 'surv') row(L.bots, 'bots', S.mode === 'solo' ? [1, 2, 3] : [0, 1, 2], v => String(v));
  row(L.diff, 'diff', ['easy', 'normal', 'hard'], v => L[v]);
  if (S.mode !== 'surv') row(L.wins, 'wins', [3, 5, 7], v => String(v));
  else { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<span>${L.best}</span><span>${L.wave} ${S.best || 0}</span>`; opts.appendChild(r); }
  row(L.arena, 'arena', ['random', ...ARENAS.map((_, i) => i)], v => v === 'random' ? L.random : L.arenas[ARENAS[v].id]);
  row(L.blood, 'blood', [true, false], v => v ? L.on : L.off);
  row(L.sound, 'sound', [true, false], v => v ? L.on : L.off);
  $('ctrlText').textContent = isTouch ? '' : (S.mode === 'solo' ? L.ctrlSolo : L.ctrlDuo);
  const ps = $('psound'); ps.innerHTML = '';
  for (const v of [true, false]) { const b = document.createElement('button'); b.className = 'btn' + (S.sound === v ? ' on' : ''); b.textContent = v ? L.on : L.off; b.onclick = () => { S.sound = v; Snd.mute(!v); saveSettings(); buildMenu(); }; ps.appendChild(b); }
}
function saveSettings() { if (S._test) return; YS.save({ s: S }); }       // отладочные прогоны настройки не сохраняют

let hudCache = '';
function buildHud() {
  if (isSurv()) {
    const f = fighters[0];
    $('hud').innerHTML = `<div class="card" id="hc${f.i}"><div class="nm"><i style="background:${f.color}"></i><span>${L.you} (${L.races[f.race][0]})</span></div><div class="hp"><div id="hh${f.i}"></div></div><div class="ln"><span id="hw${f.i}"></span><span></span></div></div>`
      + `<div class="card"><div class="nm"><span>${L.wave} ${surv.wave}</span></div><div class="ln" style="margin-top:4px"><span id="svl"></span><span id="svk"></span></div></div>`;
    hudCache = ''; return;
  }
  $('hud').innerHTML = fighters.map(f => `<div class="card" id="hc${f.i}"><div class="nm"><i style="background:${f.color}"></i><span>${nameOf(f)}</span></div><div class="hp"><div id="hh${f.i}"></div></div><div class="ln"><span id="hw${f.i}"></span><span>${'●'.repeat(f.score)}${'○'.repeat(Math.max(0, S.wins - f.score))}</span></div></div>`).join('');
  hudCache = '';
}
function updHud() {
  bannerT -= DT; if (bannerT <= 0 && $('banner').textContent) $('banner').textContent = '';
  let sig = '';
  const shown = isSurv() ? [fighters[0]] : fighters;
  for (const f of shown) sig += `${Math.ceil(f.hp)}|${f.wpn ? f.wpn.k + f.wpn.ammo : '-'}|${f.alive}|`;
  if (isSurv()) { const left = surv.toSpawn + fighters.filter(f => f.team === 1 && f.alive).length; sig += left + '|' + surv.kills; }
  if (sig === hudCache) return; hudCache = sig;
  if (isSurv() && $('svl')) { $('svl').textContent = `${surv.toSpawn + fighters.filter(f => f.team === 1 && f.alive).length} ${L.left}`; $('svk').textContent = `${L.kills}: ${surv.kills}`; }
  for (const f of shown) {
    const hh = $('hh' + f.i), hw = $('hw' + f.i); if (!hh) continue;
    hh.style.width = Math.max(0, Math.round(100 * f.hp / f.R.hp)) + '%';
    hw.textContent = f.wpn ? `${L.weap[f.wpn.k]} ${f.wpn.ammo}` : L.weap.none;
    $('hc' + f.i).style.opacity = f.alive || f.reviveT > 0 ? 1 : 0.45;
  }
}
let roulT = 0;
function showRoulette() {
  const el = $('roul'); el.innerHTML = fighters.map(f => `<div class="rc" style="border-color:${f.color}"><div class="who" style="color:${f.color}">${nameOf(f).replace(/ \(.*\)/, '')}</div><div class="race" id="rr${f.i}"></div><div class="perk" id="rp${f.i}"></div></div>`).join('')
    + `<div style="width:100%;text-align:center;color:#a99fc0" class="shadow">${L.round} ${round} · ${L.arenas[AR.id]}</div>`;
  show('roul', true); roulT = 0;
}
function tickRoulette() {
  roulT += DT;
  const spin = stateT > 0.9;
  for (const f of fighters) {
    const rr = $('rr' + f.i), rp = $('rp' + f.i); if (!rr) continue;
    if (spin) { if (Math.floor(roulT * 14) !== f._rs) { f._rs = Math.floor(roulT * 14); rr.textContent = L.races[pick(RACES)][0]; rp.textContent = ''; if (f.i === 0) Snd.play('step', 0.2, 1.6); } }
    else if (rr.textContent !== L.races[f.race][0] || !rp.textContent) { rr.textContent = L.races[f.race][0]; rp.textContent = L.races[f.race][1]; }
  }
}

function pauseGame() { if (state === 'paused') return; prevState = state; state = 'paused'; show('pause', true); YS.stop(); SFX.music.stop(); }
function resumeGame() { if (state !== 'paused') return; state = prevState; show('pause', false); if (state === 'fight') YS.start(); }
function toMenu() {
  show('pause', false); show('over', false); show('roul', false); show('hud', false); show('pbtn', false); show('touch', false);
  YS.stop(); buildMenu(); show('menu', true); show('logo', true);
  startDemo();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { Snd.mute(true); if (!demo && (state === 'fight' || state === 'roulette' || state === 'roundEnd')) pauseGame(); }
  else Snd.mute(!S.sound);
});

function wire() {
  $('play').onclick = () => { Snd.unlock(); show('logo', false); show('hud', true); show('pbtn', true); show('touch', isTouch); layout(); startMatch(); };
  $('pbtn').onclick = () => (state === 'paused' ? resumeGame() : pauseGame());
  $('resume').onclick = resumeGame;
  $('toMenu').onclick = toMenu;
  $('again').onclick = () => YS.interstitial(() => { show('over', false); show('hud', true); show('pbtn', true); show('touch', isTouch); if (S.mode === 'surv') { startSurvival(); return; } fighters.forEach(f => (f.score = 0)); round = 0; nextRound(); });
  $('overMenu').onclick = () => YS.interstitial(toMenu);
}

// ─────────────────────────────────────────────────────────────── логотип
// Пиксельные буквы 5×7, клетка 2×2: FAIRY в сказочной сирени, FIGHTERS в огне. Обводка и тень.
const GLYPH = {
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'], A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'], R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'], G: ['01111', '10000', '10000', '10011', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'], T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'], S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
};
function drawLogo() {
  const c = document.getElementById('logo'), x2 = c.getContext('2d'), W = c.width, H = c.height;
  const lines = [['FAIRY', ['#fff0ff', '#f2b0ff', '#c869ea', '#8a3cc0']], ['FIGHTERS', ['#fff1b8', '#ffd36b', '#ff9a3a', '#e0521e']]];
  const mask = new Uint8Array(W * H), col = new Array(W * H);
  lines.forEach(([word, ramp], li) => {
    const w = word.length * 12 - 2, ox = Math.floor((W - w) / 2), oy = 3 + li * 18;
    [...word].forEach((ch, k) => GLYPH[ch].forEach((row, y) => [...row].forEach((b, x) => {
      if (b !== '1') return;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const px = ox + k * 12 + x * 2 + dx, py = oy + y * 2 + dy; mask[py * W + px] = 1; col[py * W + px] = ramp[Math.min(3, Math.floor((y * 2 + dy) / 3.5))]; }
    })));
  });
  x2.clearRect(0, 0, W, H);
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (at(x, y)) continue;
    if (at(x, y - 2) || at(x, y - 3)) { x2.fillStyle = '#4a0c0a'; x2.fillRect(x, y, 1, 1); }                      // тень вниз
    if (at(x - 1, y) || at(x + 1, y) || at(x, y - 1) || at(x, y + 1) || at(x - 1, y - 1) || at(x + 1, y + 1) || at(x - 1, y + 1) || at(x + 1, y - 1)) { x2.fillStyle = '#140608'; x2.fillRect(x, y, 1, 1); }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (mask[y * W + x]) { x2.fillStyle = col[y * W + x]; x2.fillRect(x, y, 1, 1); }
  // блик: светлая точка в углу некоторых букв
  x2.fillStyle = '#ffffff'; x2.fillRect(Math.floor((W - 58) / 2) + 1, 4, 1, 1);
}

// ─────────────────────────────────────────────────────────────── запуск
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now; if (dt > 0.1) dt = 0.1;
  step(dt);
  if (state !== 'boot') render();
}
async function boot() {
  isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
  await YS.init();
  L = STR[YS.lang] || (YS.lang === 'ru' || YS.lang === 'be' || YS.lang === 'kk' || YS.lang === 'uk' || YS.lang === 'uz' ? STR.ru : STR.en);
  const saved = await YS.load(); if (saved && saved.s) Object.assign(S, saved.s);
  if (isTouch) S.mode = 'solo';
  await loadAll();
  Snd.load();
  Snd.mute(!S.sound);
  initStains(); loadArena(ARENAS[0]); resetObjs(); resetMap();
  applyI18n(); wire(); setupTouch(); layout(); drawLogo();
  buildMenu(); show('menu', true); show('logo', true);
  startDemo();                       // за меню четыре бота дерутся без звука
  YS.ready();
  requestAnimationFrame(frame);
}

// отладка: __duel.sim(сек) гоняет мир без рендера, __duel.auto() отдаёт игрока боту
window.__duel = {
  get state() { return { state, round, fighters: fighters.map(f => ({ race: f.race, hp: Math.round(f.hp), x: Math.round(f.x), y: Math.round(f.y), alive: f.alive, score: f.score, wpn: f.wpn && f.wpn.k })) }; },
  sim(sec) { for (let t = 0; t < sec; t += DT) { if (state === 'fight' || state === 'roulette' || state === 'roundEnd') sim(DT); } return this.state; },
  auto(dk) { fighters.forEach(f => { if (f.ctrl !== 'bot') { f.ctrl = 'bot'; if (dk) f.diffKey = dk; } }); },
  start(o) { Object.assign(S, o || {}); S._test = true; show('hud', true); show('logo', false); show('menu', false); startMatch(); },
  get surv() { return surv && { ...surv }; },
  get deathBy() { return fighters[0] && fighters[0].deathBy; },
  race(i, r) { const f = fighters[i]; f.race = r; spawnFighter(f, [f.x / T, f.y / T]); },
  give(i, k) { fighters[i].wpn = { k, ammo: WEAP[k].ammo }; },
  draw() { render(); },
  get world() { return { fx: splats.map(s => s.k), frozen: fighters.filter(f => f.frozen > 0).length, bolts: bolts.length, meat: parts.filter(p => p.kind === 'meat').length, splats: splats.map(s => s.k), pools: pools.map(p => Math.round(p.x1 - p.x0) + 'px/' + p.t.toFixed(1) + 's'), lamps: lamps.map(l => l.state), projs: projs.map(p => p.k), burning: fighters.filter(f => f.burn > 0).length }; },
  dropLamp(i) { dropLamp(lamps[i], null); },
  boom(i) { const f = fighters[i]; explode(f.x, midY(f), 46, 200, null); },
  arena(i) { const a = ARENAS[i]; buildMap(a); return { id: a.id, ts: a.ts, tileset: TILESETS[a.ts], bgs: a.bgs, fill: a.fill, crates: a.crates, chands: a.chands, lanterns: a.lanterns, spawns: a.spawns, rows: base.map(r => r.join('')) }; },
  get arenaCount() { return ARENAS.length; },
  hurt(i, n) { fighters[i].hp -= n; },
  dropItem(k, i) { const f = fighters[i]; items.push({ k, ammo: k === 'heal' ? 0 : WEAP[k].ammo, x: f.x, y: f.y - 2, vy: 0, vx: 0, t: 0 }); },
};
boot();
})();
