// Данные прототипа «Подземелье Некроманта».
// Здесь только числа и определения — ни рендера, ни DOM. Правила живут в sim.js.
// Тезис игры и вся палитра — в palette.js, читать оттуда.

import { SCHOOL_RAMP, num } from './palette.js';

/* ═══════════════ Рубильник грязи ═══════════════
   Спека требует: вся кровь, куски и лужи проходят через ЭТОТ флаг и только через него.
   GORE = false переводит игру на 6+ без единой другой правки:
   кровь → пыль, лужи → нет, разлёт кусков → рассыпание в прах.
   Любой новый эффект крови обязан спрашивать GORE, иначе страховка перестаёт работать. */
export const GORE = true;

export const TICK_HZ = 10;               // фиксированный шаг симуляции

/* ═══════════════ Прокачка некроманта ═══════════════
   Армия растёт по двум осям. Внутри забега — от глубины: чем глубже прокопано
   подземелье, тем больше места в криптах. Между забегами — гримуар поднимает
   стартовое число и потолок. Пять фиксированных слотов ощущались потолком с первой
   минуты, а рост армии — самое наглядное, что вообще может расти в этой игре. */
export const ARMY_SLOTS_BASE = 3;
export const ARMY_SLOTS_MAX = 8;
export function armySlots(tier, bonusStart = 0, bonusMax = 0) {
  return Math.min(ARMY_SLOTS_MAX + bonusMax,
    ARMY_SLOTS_BASE + bonusStart + Math.floor(tier / TUNING.slotsPer));
}

/* ═══════════════ Четыре школы ═══════════════
   Круг: Кость → Прах → Плоть → Душа → Кость.
   Щиты ломают магов, магия выжигает гниль, масса поглощает бесплотных,
   бесплотное проходит сквозь броню. */
// Цвета школы — три ступени её рампы из palette.js, ни одного своего значения.
const school = (id, name, remains, beats, hp, atk, spd) => ({
  id, name, remains, beats, hp, atk, spd,
  dim: num(SCHOOL_RAMP[id][0]),      // павшие
  tint: num(SCHOOL_RAMP[id][1]),     // тело
  glow: num(SCHOOL_RAMP[id][2]),     // огонёк и метки
});

export const SCHOOLS = {
  bone: school('bone', 'Костяные',   'Кость', 'dust', 1.4, 0.8, 1.0),
  rot:  school('rot',  'Гнилые',     'Плоть', 'soul', 1.6, 0.7, 0.9),
  soul: school('soul', 'Призрачные', 'Душа',  'bone', 0.8, 1.1, 1.5),
  dust: school('dust', 'Проклятые',  'Прах',  'rot',  0.7, 1.3, 1.0),
};
export const SCHOOL_IDS = ['bone', 'rot', 'soul', 'dust'];

// Модификатор круга: 1.3 по тому, кого превосходишь; 0.77 в обратную сторону; иначе 1.
export function circleMod(attackerSchool, defenderSchool) {
  if (!attackerSchool || !defenderSchool) return 1;
  if (SCHOOLS[attackerSchool].beats === defenderSchool) return 1.3;
  if (SCHOOLS[defenderSchool].beats === attackerSchool) return 0.77;
  return 1;
}

// Базовые статы по тиру — до уклона школы и звёзд. Считаются от TUNING.tierStep,
// а не задаются таблицей: симулятор перебирает шаг, и таблица разъехалась бы с ним.
const TIER_HP = 100, TIER_ATK = 12;
const tierStats = t => ({
  hp: Math.round(TIER_HP * Math.pow(TUNING.tierStep, t - 1)),
  atk: Math.round(TIER_ATK * Math.pow(TUNING.tierStep, t - 1)),
});
const BASE_PERIOD = 1.2;  // секунд между ударами при скорости ×1

/* ═══════════════ Нежить ═══════════════
   В прототипе по два тира на школу (T1 и T2) из шестнадцати видов спеки. */
// hp и atk — геттеры: TUNING.tierStep меняется симулятором в памяти, и статы,
// посчитанные один раз при загрузке модуля, за ним бы не поспели
function undead(id, school, tier, name, row, sprite, extra = {}) {
  const s = SCHOOLS[school];
  return {
    id, school, tier, name, row, sprite,
    get hp() { return Math.round(tierStats(tier).hp * s.hp); },
    get atk() { return Math.round(tierStats(tier).atk * s.atk); },
    period: BASE_PERIOD / s.spd,
    armor: 0,
    ...extra,
  };
}

/* Все шестнадцать, и с v2 у каждого свой спрайт: пока T3/T4 донашивали матрицы
   T1/T2, главный приз гачи не читался на поле — поднятый голем выглядел скелетом. */
export const UNDEAD = {
  skeleton:   undead('skeleton',   'bone', 1, 'Скелет',            'front', 'skeleton',   { armor: 3 }),
  boneArcher: undead('boneArcher', 'bone', 2, 'Скелет-броненосец', 'back',  'boneArcher', { armor: 2 }),
  boneGuard:  undead('boneGuard',  'bone', 3, 'Скелет-жрец',       'front', 'boneGuard',  { armor: 14 }),
  boneGolem:  undead('boneGolem',  'bone', 4, 'Адский скелет',     'front', 'boneGolem',  { armor: 22 }),

  corpse:     undead('corpse',     'rot',  1, 'Ходячий труп',      'front', 'corpse'),
  plague:     undead('plague',     'rot',  2, 'Чумной носитель',   'front', 'plague',     { poison: 4 }),
  brute:      undead('brute',      'rot',  3, 'Гнилой громила',    'front', 'brute',      { deathSpawn: 'corpse' }),
  meatHill:   undead('meatHill',   'rot',  4, 'Мясная гора',       'back',  'meatHill',   { heal: 34 }),

  shade:      undead('shade',      'soul', 1, 'Тень',              'front', 'shade'),
  banshee:    undead('banshee',    'soul', 2, 'Баньши',            'back',  'banshee'),
  phantom:    undead('phantom',    'soul', 3, 'Фантом',            'front', 'phantom',    { ignoreArmor: true }),
  reaper:     undead('reaper',     'soul', 4, 'Жнец',              'back',  'reaper',     { hitsBackRow: true }),

  dustling:   undead('dustling',   'dust', 1, 'Прахолов',          'back',  'dustling'),
  sorcerer:   undead('sorcerer',   'dust', 2, 'Костяной колдун',   'back',  'sorcerer',   { splash: 2 }),
  ghoul:      undead('ghoul',      'dust', 3, 'Некрофаг',          'back',  'ghoul',      { splash: 3 }),
  lichling:   undead('lichling',   'dust', 4, 'Лич-прислужник',    'front', 'lichling',   { thorns: 0.25 }),
};
export const UNDEAD_IDS = Object.keys(UNDEAD);

/* ═══════════════ Герои ═══════════════
   Собственная таблица статов — от статов нежити не производна. */
// У героев тоже есть школа — иначе круг преимуществ не работает вовсе и все четыре
// школы нежити становятся неразличимы. Принадлежность выведена из того, чем герой является:
// латник — это «кость» (строй и броня), жрец — «прах» (магия), лучник — «душа» (скорость),
// ополченец — «плоть» (обычное мясо). Отсюда состав армии начинает значить.
/* ═══════════════ Настраиваемые числа баланса ═══════════════
   Собраны в один объект, чтобы симулятор мог перебирать значения, не правя игру.
   Менять руками нельзя: каждое подобрано прогоном под целевую таблицу приёмки
   (см. «Баланс» в спеке). Правишь — гоняешь `necro-economy.mjs` заново. */
export const TUNING = {
  /* Темп роста героев по ярусам. Самый чувствительный рычаг: армия растёт ступенями
     (слоты, звёзды, новые тиры), а герои — гладкой экспонентой. Кромка острая:
     1.26 убивал забег на сиде 2 из 3 ещё ДО чемпиона десятого яруса — то есть до
     самого открытия престижа; 1.24 доводит до яруса 11 на всех трёх сидах. */
  heroGrowth: 1.24,
  // Множитель чемпиона растёт с ярусом, а не стоит плоской двойкой
  champBase: 1.3,
  champPerTier: 0.045,
  champCap: 2.2,
  // Лечение жреца и порог, ниже которого он вообще начинает лечить
  priestHeal: 12,
  healBelow: 0.65,

  /* Форма роста армии. Сила юнита — это `hp × atk / период`, поэтому множитель статов
     входит в неё В КВАДРАТЕ: тир ×1.78 по обоим статам даёт ×3.2 к силе, а от T1 к T4
     набегает ×33. Отсюда и ступенька в кривой сложности — одна удачная варка меняет
     всё. Сглаживание идёт двумя ручками: сжать разрыв между тирами и усилить звёзды,
     потому что звёзды копятся понемногу и дают именно склон. */
  tierStep: 1.78,     // множитель hp и atk на каждый тир вверх
  starStep: 0.33,     // прибавка за звезду: множитель = 1 + starStep × (звёзды − 1)

  /* Сколько ДУБЛЕЙ стоит каждая следующая звезда. Раньше было по одному на звезду,
     то есть вся коллекция — 16 видов и все звёзды — выкупалась за 80 ритуалов, тогда
     как первые десять ярусов приносят останков на 133. Содержимое кончалось раньше,
     чем игрок доходил до первого престижа, армия упиралась в потолок, а кривая
     сложности превращалась в ступеньку: пока армия сильнее — 100%, потом сразу 0%
     и без выхода, потому что тратить останки уже не на что. */
  /* Дороже, чем [0,1,4,9,16] из v1: дешёвые звёзды разгоняли армию так, что первый
     престиж наступал в 23 минуты при цели 50–70, а сама звезда стала сильнее (0.33). */
  starDupeCost: [0, 2, 6, 14, 26],

  /* Чем сила армии привязана к глубине подземелья. Сейчас — ничем: плотность останков
     зависит от номера партии, а не от яруса, поэтому чемпион ПЕРВОГО яруса роняет
     кристаллы, а три кристалла дают половинный шанс на T3/T4. Сильнейшую нежить в
     игре можно поднять на первом же ярусе, и армия всегда обгоняет ярус с запасом.
       'none'        — как сейчас
       'density'     — густые с яруса 4, кристаллы с яруса 8; номер партии по-прежнему
                       двигает ступень вверх, но потолок ставит глубина
       'tierCap'     — ритуал не может выдать тир выше, чем позволяет глубина
       'rareCrystal' — чемпион роняет кристаллы редко, а не всегда */
  depthGate: 'density',
  /* [4,8] из v1 запирали T3/T4 ровно за той стеной, где они были нужны: кристаллы
     открывались на ярусе 8, а забег стоял на восьмом-девятом — армия не могла
     дорасти до собственного лекарства. */
  gateDensityTiers: [3, 6],     // с какого яруса доступны густые и кристаллизованные
  gateTierPerDepth: 3,          // тир +1 за каждые N ярусов
  gateCrystalChance: 0.25,

  /* Темп роста крипт: +1 слот армии за каждые N ярусов. При трёх армия навсегда
     отставала от партий: к восьмому ярусу у героев шесть мест против пяти, и вместе
     с экспонентой роста это давало стену, которую не брал ни один конфиг свипа. */
  slotsPer: 2,

  /* Поблажка первых ярусов. Живая проверка v1: стартовая армия проигрывала партии
     1, 2 и 4 ПЕРВОГО же яруса без каста — «армия дерётся сама» переставало быть
     правдой на первой минуте, а бой без случайности повторял поражение байт-в-байт.
     Герои первых ярусов входят ослабленными и добирают силу к easeTiers-му ярусу:
     множитель = easeBase + (1 − easeBase) × (ярус − 1) / easeTiers, потолок 1. */
  easeBase: 0.72,
  easeTiers: 4,

  /* Разброс урона ±jitter. Не украшение: без него бой детерминирован составами,
     повтор после поражения проигрывается одинаково всегда, а приёмочная полоса
     «2–4 попытки на ярус вровень» недостижима в принципе — попытки не различаются. */
  jitter: 0.1,

  /* После этой секунды урон обеих сторон начинает расти. Страховка от пата:
     лечение (жрец, Мясная гора) способно перекрыть входящий урон, и без эскалации
     такой бой не сходится никогда — рейд повисает навсегда. */
  enrageAt: 75,
  enragePer: 20,               // +100% урона за каждые N секунд после порога
};

// Ослабление героев на входе в игру; к easeTiers-му ярусу сходит на нет
export function earlyEase(tier) {
  return Math.min(1, TUNING.easeBase + (1 - TUNING.easeBase) * (tier - 1) / TUNING.easeTiers);
}

// Потолок плотности останков по глубине
export function densityCap(tier) {
  const [dense, crystal] = TUNING.gateDensityTiers;
  if (tier >= crystal) return 3;
  if (tier >= dense) return 2;
  return 1;
}
// Потолок тира нежити по глубине
export const tierCap = tier => Math.max(1, Math.min(4, 1 + Math.floor(tier / TUNING.gateTierPerDepth)));

// Звёзды из накопленных дублей. Пороги — нарастающая сумма стоимостей.
export function starsForDupes(dupes) {
  let need = 0;
  for (let s = 1; s < TUNING.starDupeCost.length; s++) {
    need += TUNING.starDupeCost[s];
    if (dupes < need) return s;
  }
  return TUNING.starDupeCost.length;
}
export const MAX_STARS = () => TUNING.starDupeCost.length;
export const dupesForFullStars = () => TUNING.starDupeCost.reduce((a, b) => a + b, 0);

export const HEROES = {
  militia:   { id: 'militia',   name: 'Ополченец', school: 'rot',  row: 'front', sprite: 'militia',   hp: 90,  atk: 11, period: 1.3, armor: 1 },
  mercenary: { id: 'mercenary', name: 'Наёмник',   school: 'bone', row: 'front', sprite: 'mercenary', hp: 130, atk: 15, period: 1.2, armor: 4 },
  archer:    { id: 'archer',    name: 'Лучник',    school: 'soul', row: 'back',  sprite: 'archer',    hp: 70,  atk: 16, period: 1.1, armor: 0 },
  // Лечение снижено с 18: в партии из двух-трёх героев жрец перекрывал весь урон
  // армии первого тира, и низкие ярусы становились непроходимыми в принципе
  priest:    { id: 'priest',    name: 'Жрец',      school: 'dust', row: 'back',  sprite: 'priest',    hp: 80,  atk: 7,  period: 1.6, armor: 0, get heal() { return TUNING.priestHeal; } },
  mage:      { id: 'mage',      name: 'Маг',       school: 'dust', row: 'back',  sprite: 'mage',      hp: 75,  atk: 19, period: 1.5, armor: 0, splash: 2 },
  paladin:   { id: 'paladin',   name: 'Паладин',   school: 'bone', row: 'front', sprite: 'paladin',   hp: 210, atk: 24, period: 1.4, armor: 6, aura: 3 },
};

/* Состав партий: чем глубже ярус, тем шире и злее. Десятая партия — чемпион.

   Пул перебирается СО СМЕЩЕНИЕМ по номеру партии. Без смещения из пула всегда берутся
   первые size элементов, и на первом ярусе, где в партии всего двое, игрок за весь ярус
   видит ровно два архетипа — то есть две школы останков из четырёх. Половина гачи и
   половина круга преимуществ при этом просто недоступны. */
export function partyFor(tier, index) {
  const size = Math.min(6, 2 + Math.floor(tier / 3) + (index >= 5 ? 1 : 0));
  const champion = index === 10;
  /* Множитель чемпиона РАСТЁТ вместе с ярусом, а не стоит на двойке.
     Плоская двойка делала первого же чемпиона непроходимым: симулятор дал 0 побед
     из 5 на первом ярусе, то есть первый ярус честно не закрывал никто. */
  const champMul = champion
    ? Math.min(TUNING.champCap, TUNING.champBase + TUNING.champPerTier * tier)
    : 1;
  const scale = Math.pow(TUNING.heroGrowth, tier - 1) * (index >= 5 ? 1.15 : 1)
    * champMul * earlyEase(tier);

  // Порядок пула чередует школы: плоть → кость → душа → прах
  const pool = ['militia', 'mercenary', 'archer', 'priest'];
  if (tier >= 2) pool.push('mage');
  if (tier >= 3) pool.push('mercenary', 'archer');

  const out = [];
  if (champion) out.push({ def: HEROES.paladin, scale, champion: true });
  for (let i = out.length; i < size; i++) {
    out.push({ def: HEROES[pool[(i + index) % pool.length]], scale });
  }
  return out;
}

/* ═══════════════ Ритуальный круг ═══════════════ */
// Вес школы = n^1.5 от числа её останков в круге, затем нормализация.
export function schoolWeights(slots) {
  const count = {};
  for (const s of slots) if (s) count[s.school] = (count[s.school] || 0) + 1;
  const w = {};
  let sum = 0;
  for (const k in count) { w[k] = Math.pow(count[k], 1.5); sum += w[k]; }
  for (const k in w) w[k] /= sum;
  return w;
}

// Тир — по сумме плотностей (3..9)
const TIER_TABLE = {
  3: [80, 20, 0, 0],
  4: [60, 33, 7, 0],
  5: [40, 42, 16, 2],
  6: [20, 45, 29, 6],
  7: [8, 38, 42, 12],
  8: [0, 25, 50, 25],
  9: [0, 10, 50, 40],
};
export function tierWeights(sumDensity) {
  return TIER_TABLE[Math.max(3, Math.min(9, sumDensity))].slice();
}

export const DENSITY_NAMES = ['', 'обычн.', 'густ.', 'крист.'];

/* ═══════════════ Гримуар — прокачка между забегами ═══════════════
   Валюта — тёмная эссенция, приходит только из ритуала лича. Узлы и цены из спеки;
   цена ступени растёт по 1.6 за каждую купленную. Эффекты применяются вживую, а не
   со следующего забега: щедрее, и не нужен второй набор правил «до/после сброса». */
export const GRIMOIRE = [
  { id: 'boneFort',   name: 'Крепость костей',    steps: 5, base: 20,  fmt: n => `+${8 * n}% здоровья армии` },
  { id: 'fleshHunger',name: 'Жажда плоти',        steps: 5, base: 20,  fmt: n => `+${8 * n}% атаки армии` },
  { id: 'richHarvest',name: 'Богатая жатва',      steps: 5, base: 25,  fmt: n => `+${10 * n}% останков с партий` },
  { id: 'quickWord',  name: 'Быстрое слово',      steps: 3, base: 30,  fmt: n => `перезарядка заклинаний −${7 * n}%` },
  { id: 'darkLore',   name: 'Тёмное знание',      steps: 5, base: 45,  fmt: n => `+${20 * n}% к силе заклинаний` },
  { id: 'stash',      name: 'Припрятанное',       steps: 5, base: 35,  fmt: n => `${2 * n} крист. переживают сброс` },
  { id: 'decay',      name: 'Тлен',               steps: 3, base: 40,  fmt: n => `+${5 * n}% шанса густого останка` },
  { id: 'crypts',     name: 'Просторные крипты',  steps: 3, base: 150, fmt: n => `+${n} стартовый слот армии` },
  { id: 'firstCard',  name: 'Первая карточка',    steps: 1, base: 200, fmt: () => 'выбор карточки на старте забега' },
  { id: 'fourthSlot', name: 'Четвёртый слот круга', steps: 1, base: 300, fmt: () => 'четвёртый слот навсегда' },
  { id: 'catacombs',  name: 'Глубокие катакомбы', steps: 1, base: 800, fmt: n => `потолок армии +${2 * n}` },
];

export const grimoireStepCost = (node, bought) => Math.ceil(node.base * Math.pow(1.6, bought));

// Эссенция за ритуал лича — от максимального яруса забега
export const essenceFor = tier => Math.floor(Math.pow(tier, 1.5));

/* Все следствия купленных ступеней одним объектом. Он же уходит в newBattle
   и в awardRemains — правила боя и добычи сами о гримуаре не знают. */
export function grimoireMods(g = {}) {
  const n = id => g[id] || 0;
  return {
    hpMul: 1 + 0.08 * n('boneFort'),
    atkMul: 1 + 0.08 * n('fleshHunger'),
    lootMul: 1 + 0.10 * n('richHarvest'),
    cdMul: 1 - 0.07 * n('quickWord'),
    spellMul: 1 + 0.20 * n('darkLore'),
    keepCrystals: 2 * n('stash'),
    denseChance: 0.05 * n('decay'),
    slotsStart: n('crypts'),
    slotsMax: 2 * n('catacombs'),
    firstCard: n('firstCard'),
    ritualSlots: 3 + (n('fourthSlot') ? 1 : 0),
  };
}
