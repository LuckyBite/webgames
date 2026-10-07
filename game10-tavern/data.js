// «Таверна у края Хмари» — таблицы игры.
//
// Единственный источник чисел: их читают игра, тесты, бот (bot.js) и симулятор (sim.js).
// Вторую копию чисел в рендере не заводить. Цены меты подобраны симулятором
// (`node game10-tavern/sim.mjs`), а не на глаз.

export const RULES = {
  shiftSeconds: 180,      // свеча смены
  seats: 3,
  firstArrival: 2,        // секунда, когда садится первый гость
  arrivalGap: [6, 11],    // пауза до следующего гостя, если есть свободное место
  patienceBase: 55,       // секунд терпения на заказ из одной позиции
  patiencePerItem: 20,    // прибавка за каждую следующую позицию
  moodCalm: 0.6,          // доля терпения выше — «спокоен»
  moodAngry: 0.3,         // ниже — «злится»
  eatSeconds: 2.5,
  tipShare: 0.3,          // чаевые = цена заказа × доля × остаток терпения
  wrongShare: 0.5,        // «почти то» блюдо и недолив оплачиваются этой долей
  nearMiss: 0.5,          // порог похожести блюда (Жаккар); ниже — гость отказывается
  refusePenalty: 0.1,     // отказ отнимает эту долю полного терпения
  fameHappy: 1,
  fameLeft: -2,
  orderItems: [1, 2],     // сколько позиций в заказе, включительно
  hearthSlots: 2,
  cookSeconds: 6,         // очаг: жарится...
  readySeconds: 4,        // ...потом окно «готово», потом горит
  pourSeconds: 2,         // бочка: от пустой до полной кружки
  pourMin: 0.3,           // отпустил раньше — кружки нет вовсе
  pourPerfect: 0.8,       // отпустил с этой доли — идеально; дошло до 1 — перелив
  plateMax: 4,
};

// Базовые продукты бесконечны (спека, «Продукты»); редкие приходят из походов и тратятся
// поштучно. raw — сырьё только для станции: мясо — на очаг, грибы — в котёл.
// cut — режется на колоде, на тарелку идёт только нарезанное (шаг 3г); garnish — кладётся
// штрихом поперёк тарелки: длинная полоса — «красиво».
export const INGREDIENTS = {
  bread:    { name: 'хлеб', cut: true },
  cheese:   { name: 'сыр', cut: true },
  onion:    { name: 'лук', cut: true },
  meat:     { name: 'мясо', raw: true },
  roast:    { name: 'жаркое' },
  mushroom: { name: 'грибы', raw: true, rare: true },
  honey:    { name: 'мёд', rare: true, garnish: true },
  berries:  { name: 'ягоды', rare: true },
  pepper:   { name: 'драконий перец', rare: true, garnish: true },
  broth:    { name: 'грибной отвар' },
};
// Порядок ящиков в кладовой: базовые всегда, редкие — после первого появления.
export const PANTRY = ['bread', 'cheese', 'onion', 'meat'];
export const RARE = ['mushroom', 'honey', 'berries', 'pepper'];

// Станции «поставь и забудь»: что кладут → что выходит, сколько готовится и сколько
// держится готовым, пока не сгорит (выкипит).
export const COOKERS = {
  hearth:   { name: 'очаг',  from: 'meat',     to: 'roast', cookSeconds: RULES.cookSeconds, readySeconds: RULES.readySeconds },
  cauldron: { name: 'котёл', from: 'mushroom', to: 'broth', cookSeconds: 8, readySeconds: 6 },
};

// acc — название в винительном падеже, если оно не совпадает с именительным: гость просит
// «неси грибную похлёбку». recipe — цена рецепта; блюдо без неё в меню с первого дня. needs — сколько редких
// продуктов уходит на порцию; station — без какой станции его не приготовить.
export const DISHES = {
  ale:           { name: 'эль',                    price: 4,  drink: true, parts: [] },
  bread_cheese:  { name: 'хлеб с сыром',           price: 6,  parts: ['bread', 'cheese'] },
  ribs:          { name: 'жаркое с луком',         price: 9,  parts: ['roast', 'onion'] },
  sandwich:      { name: 'ломоть трактирщика',     price: 12, parts: ['bread', 'roast', 'cheese'] },
  honey_roast:   { name: 'жаркое в меду',          price: 16, parts: ['roast', 'honey'], needs: { honey: 1 }, recipe: 120 },
  honey_bread:   { name: 'хлеб с мёдом и ягодами', price: 18, parts: ['bread', 'honey', 'berries'], needs: { honey: 1, berries: 1 }, recipe: 180 },
  mushroom_soup: { name: 'грибная похлёбка',       price: 26, acc: 'грибную похлёбку', parts: ['broth', 'onion'], needs: { mushroom: 1 }, recipe: 200, station: 'cauldron' },
  fire_roast:    { name: 'огненное жаркое',        price: 30, parts: ['roast', 'pepper', 'onion'], needs: { pepper: 1 }, recipe: 300 },
  cheese_honey:  { name: 'сыр с мёдом',            price: 14, parts: ['cheese', 'honey'], needs: { honey: 1 }, recipe: 100 },
  hunter_stew:   { name: 'охотничья похлёбка',     price: 44, acc: 'охотничью похлёбку', parts: ['broth', 'roast', 'onion', 'bread'], needs: { mushroom: 1 }, recipe: 400, station: 'cauldron' },
};
export const BASE_MENU = Object.keys(DISHES).filter(id => !DISHES[id].recipe);
// Порядок ключей важен: первые четыре — как в шаге 1, иначе сдвинутся случайные заказы.
export const DISH_WEIGHTS = { ale: 4, bread_cheese: 3, ribs: 2, sandwich: 2, honey_roast: 2, honey_bread: 2, mushroom_soup: 2, fire_roast: 2, cheese_honey: 2, hunter_stew: 2 };

// Живая кухня (шаг 3г, спека): нарезка, переворот, помешивание, штрих. Отдельно от RULES —
// числа среза шага 1 не тронуты. Подобрано симулятором (sim.js, модель игрока платит за жест).
export const KITCHEN = {
  chops: 3,             // ударов ножом на продукт; каждый удар — порция в ящик
  cutMax: 6,            // нарезанного в ящике не больше
  flipWindow: 3,        // секунд, пока мясо ждёт переворота; дальше горит
  stirAt: 0.45,         // на какой доле варки котёл просит помешать
  stirWindow: 3.5,      // секунд, пока ждёт
  scorchedMul: 0.5,     // пригоревшая похлёбка — за полцены
  garnishStroke: 0.6,   // полоса не короче этой доли ширины тарелки — «красиво»
  garnishBonus: 0.15,   // «красиво» — блюдо дороже
  patienceMul: 1.2,     // гости ждут дольше: блюдо теперь готовится руками, а не собирается
  // Качество позиции (разбор 2026-10-07, п. 7): три звезды — всё свежее и гость ещё не злится.
  // Жаркое и отвар свежие, если сняты, пока от окна «готово» осталось не меньше fresh; эль — налит в
  // полосу aleTop; штрих — полосой («красиво»). Цена по звёздам — starMul: две звезды дешевле, у одной
  // своя скидка (почти то, пригорело, недолив — wrongShare и scorchedMul).
  fresh: 0.6,           // доля окна «готово», которая ещё осталась, — свежее
  aleTop: [0.06, 0.97], // эль на три звезды: выше зелёной отметки на столько и без перелива
  starMul: { 1: 1, 2: 0.85, 3: 1 },
  // Серия точных подач (три звезды подряд): чаевые +streakTip за ступень, не больше streakTipMax.
  streakTip: 0.05,
  streakTipMax: 0.25,
  streakFame: 5,        // каждая пятая подряд точная подача — +1 слава (мастерство ускоряет историю,
                        // но не ломает пороги глав: +1 за гостя удваивало славу у бота)
};

// Давление по главам (разбор 2026-10-07, п. 4): гости приходят чаще и просят больше. Пауза —
// до множителя потока (FLOW.gap). В обычной смене — разогрев в начале, наплыв посередине
// (rush: с какой доли свечи и до какой, множитель паузы), а когда никто не ждёт pullAfter
// секунд, следующий гость заходит через pullGap.
export const PRESSURE = {
  chapters: [
    { gap: [6, 11],    items: [1, 2] },
    { gap: [5, 9],     items: [1, 2] },
    { gap: [4.5, 8],   items: [1, 3] },
    { gap: [4.3, 7.5], items: [1, 3] },
    { gap: [4, 7],     items: [1, 3] },
  ],
  warm: [0, 0.12, 1.3],
  rush: [0.38, 0.72, 0.65],
  pullAfter: 3,
  pullGap: [1, 2],
};

export const RACES = ['dwarf', 'orc', 'elf', 'goblin', 'human'];

// Первая половина реплики заказа — по расе; вторая собирается из названий блюд.
export const OPENERS = {
  dwarf:  ['Эй, трактир! Мне', 'Эй, за стойкой! Давай', 'С дороги устал. Неси'],
  orc:    ['Грр. Хочу', 'Орк голоден. Давай', 'Быстро:'],
  elf:    ['Будьте любезны:', 'Если не затруднит, принесите', 'Мне бы'],
  goblin: ['Эй-эй! Мне', 'Быстро дай', 'Хочу-хочу'],
  human:  ['Добрый вечер. Мне', 'Можно мне', 'С дороги бы поесть. Дайте'],
};

// ---------- мета (шаг 2) ----------

// Улучшения — лестницы по модулям (track): в лавке видна следующая ступень каждой. Платятся
// монетами, открываются славой (fame; до порога ступень видна с замком) — решение
// пользователя 2026-09-29, третьей валюты нет. Узкое место — руки игрока, поэтому ступени
// покупают время и щедрость гостей; скорость окупается ценой (жаркое, эль дороже), пока мест
// три: таверна упирается в поток гостей (замер шага 2). requires — предыдущая ступень;
// known — какой продукт уже приходил; recipes — какие рецепты даёт покупка; apply — что
// меняют в смене: слоты — максимумом, остальное — суммой; decor — рисуется в зале. Мест в
// лавке нет: они приходят с помощниками (FLOW).
// Цены и пороги подобраны симулятором (sim.js marginal — в таверне того этапа, где покупают).
export const UPGRADES = [
  { id: 'grill',     track: 'hearth',   name: 'Большая жаровня',          price: 450, apply: { hearthSlots: 3, hearthFaster: 0.33, roastBonus: 0.25 } },
  { id: 'forge',     track: 'hearth',   name: 'Кованая решётка',          price: 500, fame: 150, requires: 'grill', apply: { hearthFaster: 0.15, roastBonus: 0.15 } },
  { id: 'cauldron',  track: 'cauldron', name: 'Котёл и рецепт похлёбки',  price: 450, known: 'mushroom', recipes: ['mushroom_soup'], apply: { cauldronSlots: 1 } },
  { id: 'copper',    track: 'cauldron', name: 'Медный котёл и рецепт',             price: 400, fame: 100, requires: 'cauldron', recipes: ['hunter_stew'], apply: { cauldronFaster: 0.3, brothBonus: 0.25 } },
  { id: 'cauldron2', track: 'cauldron', name: 'Большой котёл',            price: 400, fame: 200, requires: 'copper', apply: { cauldronSlots: 2, brothBonus: 0.4 } },
  { id: 'tap',       track: 'barrel',   name: 'Широкий кран',             price: 180, fame: 40, apply: { pourFaster: 0.3, pourEasier: 0.08, tipBonus: 0.1 } },
  { id: 'darkale',   track: 'barrel',   name: 'Тёмный эль',               price: 280, fame: 120, requires: 'tap', apply: { aleBonus: 1 } },
  { id: 'rug',       track: 'decor',    name: 'Ковёр у камина',           price: 180, decor: true, apply: { patienceBonus: 0.05, tipBonus: 0.1 } },
  { id: 'banner',    track: 'decor',    name: 'Знамя на стене',           price: 350, decor: true, requires: 'rug', apply: { patienceBonus: 0.05, tipBonus: 0.15 } },
  { id: 'antlers',   track: 'decor',    name: 'Рога над камином',         price: 600, decor: true, requires: 'banner', apply: { patienceBonus: 0.1, tipBonus: 0.2 } },
  // меняет руки, а не числа (разбор 2026-10-07, п. 15): на продукт на удар меньше
  { id: 'knife',     track: 'knife',    name: 'Острый нож',               price: 260, fame: 60, apply: { chopsLess: 1 } },
];

// Бродячий торговец (п. 15): повторяемая трата на вторую половину игры. Каждое утро продаёт
// два из уже знакомых редких продуктов — по дню по кругу; редкое становится ставкой игрока
// («купить мёд или копить на котёл»). Цена — дороже, чем приносит поход, но окупается
// блюдом: мёд в жарком — +7 к цене, перец — +21.
export const GOODS = {
  honey:    { name: 'Горшок мёда',    n: 3, price: 60 },
  berries:  { name: 'Корзина ягод',   n: 3, price: 50 },
  mushroom: { name: 'Связка грибов',  n: 2, price: 70 },
  pepper:   { name: 'Стручки перца',  n: 2, price: 90 },
};
export const GOODS_PER_DAY = 2;

// Искатели приходят по сюжету (story.js): Грум — на второй день, Сорель — на четвёртый,
// Брида — в главе 2, Пип — в главе 3. look — черты, которые генератор внешности не должен
// перебросить; small — полурослик, в кадре ниже остальных. acc — имя в винительном падеже
// («Отправь Бриду»).
export const SEEKERS = [
  { id: 'sorel', name: 'Сорель', acc: 'Сорель', race: 'elf',   seed: 7001, favorite: 'bread_cheese', role: 'травница',    look: { hair: '#dcdce4', hat: 'circlet', cloth: '#4a6a4a' } },
  { id: 'grum',  name: 'Грум',   acc: 'Грума',  race: 'orc',   seed: 7002, favorite: 'ribs',         role: 'охотник',     look: { hat: 'topknot', cloth: '#7a5236' } },
  { id: 'brida', name: 'Брида',  acc: 'Бриду',  race: 'dwarf', seed: 7003, favorite: 'sandwich',     role: 'воительница', look: { hat: 'helmet', beard: null, hair: '#c4622d', cloth: '#6a4a3a', metal: '#8f989e' } },
  { id: 'pip',   name: 'Пип',    acc: 'Пипа',   race: 'human', seed: 7004, favorite: 'honey_bread',  role: 'болтун',      look: { small: true, hair: '#6b4424', hair2: 'long', hat: 'none', beard: null, cloth: '#8a3f3a' } },
];

// Маршруты открывает сюжет (flag — флаг истории, story.js) и слава: лес — Грум, топи —
// Сорель, руины заставы и горы — Брида (горам нужна ещё и слава), край Хмари — глава 3.
// Маршруты сюжетных находок не длиннее 30 минут (спека, «Походы»); горы — только ради
// добычи. Порядок — порядок точек на карте утра. loot: [продукт, от, до].
// to — куда («Отправь Грума в лес»).
export const ROUTES = [
  { id: 'forest', name: 'Старый лес',    to: 'в лес',          minutes: 10,  flag: 'forest', fame: 0,   loot: [['mushroom', 2, 4], ['honey', 0, 2]] },
  { id: 'marsh',  name: 'Топи',          to: 'на Топи',        minutes: 30,  flag: 'marsh',  fame: 0,   loot: [['berries', 2, 4], ['mushroom', 1, 3]] },
  { id: 'ruins',  name: 'Руины заставы', to: 'к заставе',      minutes: 20,  flag: 'ruins',  fame: 0,   loot: [['honey', 1, 3], ['mushroom', 0, 2]] },
  { id: 'peaks',  name: 'Горы',          to: 'в горы',         minutes: 120, flag: 'peaks',  fame: 200, level: 2, loot: [['pepper', 2, 3], ['honey', 1, 3]] },
  { id: 'edge',   name: 'Край Хмари',    to: 'на край Хмари',  minutes: 30,  flag: 'edge',   fame: 0,   loot: [['pepper', 1, 2], ['berries', 1, 3]] },
];

export const META = {
  saveKey: 'tavern.save.v2',   // v2 — история: старое сохранение начинается с главы 1
  fedLootMul: 1.5,       // сытый искатель приносит в полтора раза больше
  regularChance: 0.35,   // доля прибытий, когда вместо случайного гостя заходит искатель, если он дома
  riddleChance: 0.2,     // доля случайных гостей с загадкой вместо одной позиции (с главы 2)
  // Уровень искателя (спека, «Походы»): растёт с числом походов — levels[k] походов для уровня
  // k + 1; каждый уровень сверх первого — добыча больше на levelLoot; дальние маршруты (level в
  // ROUTES) ходят только опытные. Сюжетные маршруты уровнем не закрыты — история не встанет.
  levels: [0, 3, 7, 12],
  levelLoot: 0.2,
  riddleMul: { best: 1.5, ok: 1, miss: 0.5 },   // оплата по попаданию (спека, «Оплата»)
};

// ---------- история (шаги 3а и 3в) ----------

// Глава: какая сюжетная находка и сколько славы нужны для пира, какой пир её закрывает.
// Пороги славы расставлены по прогону среднего игрока (sim.mjs): глава занимает 5–7 дней,
// вся история — около 30 дней.
export const CHAPTERS = [
  { id: 1, name: 'Угли',             find: 'sign',    fame: 50,  feast: 'opening' },
  { id: 2, name: 'Дорога оживает',   find: 'marker',  fame: 100, feast: 'caravan' },
  { id: 3, name: 'Хмарь подступает', find: 'lantern', fame: 180, feast: 'fog' },
  { id: 4, name: 'Старые долги',     find: 'ember',   fame: 240, feast: 'debts' },
  { id: 5, name: 'Последний пир',    find: 'bloom',   fame: 320, feast: 'last' },
];

// Пир — смена-вызов: ровно guests гостей по items позиций с паузой gap, свечи нет; накормить
// goal. Трудность — в терпении (patience — множитель): плотность гостей трудности не даёт,
// мест всего три, и даже медленный бот кормит 10 из 10. Неудачная попытка прибавляет
// следующей easier терпения, но не больше easierMax.
// Замер (sim.mjs, feastRate, 40 зёрен) при ×0,5: с первой попытки умелый — 100%, средний —
// 90%, новичок — 50%; новичок за две попытки — ~91%. При ×0,45 средний — 70%, новичок — 38%.
// Пиры глав 2–5 меряются в таверне своего порога славы (помощники и ступени, открытые к
// нему) — числа в CHANGELOG.
export const FEASTS = {
  opening: { name: 'Пир открытия',  guests: 10, goal: 8,  gap: [2, 4],   items: [2, 2], patience: 0.45,  reward: { coins: 200,  fame: 15 },  easier: 0.15, easierMax: 0.45 },
  caravan: { name: 'Ночь обоза',    guests: 12, goal: 10, gap: [2, 4],   items: [1, 2], patience: 0.75, reward: { coins: 350,  fame: 25 },  easier: 0.15, easierMax: 0.45 },
  fog:     { name: 'Ночь тумана',   guests: 14, goal: 11, gap: [2, 3],   items: [2, 2], patience: 1.1,  reward: { coins: 500,  fame: 30 },  easier: 0.15, easierMax: 0.45 },
  debts:   { name: 'Ночь долгов',   guests: 14, goal: 12, gap: [2, 3],   items: [2, 2], patience: 1.5,  reward: { coins: 700,  fame: 40 },  easier: 0.15, easierMax: 0.45 },
  last:    { name: 'Последний пир', guests: 16, goal: 13, gap: [2, 3],   items: [2, 2], patience: 1.25, reward: { coins: 1500, fame: 100 }, easier: 0.15, easierMax: 0.45 },
};

// Сюжетные находки: выпадают, когда seeker впервые возвращается с route в главе chapter или
// позже, пока находки нет (спека: детерминированы — на заранее заданном походе, а не
// случайно). Маршруты находок не длиннее 30 минут.
export const FINDS = [
  { id: 'sign',    name: 'старая вывеска',        seeker: 'grum',  route: 'forest', chapter: 1 },
  { id: 'marker',  name: 'камень с меткой клана', seeker: 'brida', route: 'ruins',  chapter: 2 },
  { id: 'lantern', name: 'старый фонарь',         seeker: 'pip',   route: 'edge',   chapter: 3 },
  { id: 'ember',   name: 'тёплый уголёк',         seeker: 'brida', route: 'edge',   chapter: 4 },
  { id: 'bloom',   name: 'огнецвет',              seeker: 'sorel', route: 'marsh',  chapter: 5 },
];

// Гости с загадками (спека, «Оплата»): вместо позиции заказа фраза, верных ответов несколько.
// best — в точку (цена блюда × riddleMul.best), ok — подходит (× ok), остальное мимо (× miss).
// Загадка задаётся только когда хоть один её ответ можно подать. Слово «чего-нибудь» гость
// говорит сам, ответ подбирает игрок по смыслу.
export const RIDDLES = [
  { id: 'crypt',  text: 'Дай что-нибудь такое, чтобы не страшно было ночевать в склепе.', best: ['fire_roast'],    ok: ['ale', 'ribs'] },
  { id: 'sweet',  text: 'Хочу чего-нибудь сладкого, как в детстве у бабушки.',            best: ['honey_bread'],   ok: ['honey_roast'] },
  { id: 'warm',   text: 'Ночь холодная. Дай такое, чтобы грело изнутри.',                 best: ['mushroom_soup'], ok: ['fire_roast', 'ale'] },
  { id: 'hungry', text: 'Три дня не ел. Неси самое сытное, что есть.',                    best: ['sandwich'],      ok: ['ribs', 'honey_roast', 'fire_roast'] },
  { id: 'road',   text: 'Мне бы с собой в дорогу, чтобы в сумке не раскисло.',            best: ['bread_cheese'],  ok: ['sandwich'] },
  { id: 'forest', text: 'Хочу чего-нибудь лесного, чтобы пахло хвоей и дождём.',          best: ['mushroom_soup'], ok: ['honey_roast', 'honey_bread'] },
  { id: 'home',   text: 'Сделай, как дома на кухне пахло: мясо и лук.',                   best: ['ribs'],          ok: ['sandwich', 'fire_roast'] },
  { id: 'dust',   text: 'Дай чем запить дорожную пыль.',                                  best: ['ale'],           ok: ['mushroom_soup'] },
  { id: 'forge',  text: 'Чтобы во рту пекло, как в кузнице.',                             best: ['fire_roast'],    ok: ['ribs'] },
  { id: 'peace',  text: 'Что-нибудь на двоих, помирить брата с сестрой.',                 best: ['honey_bread'],   ok: ['bread_cheese', 'honey_roast'] },
];

// ---------- персонал (шаг 3б) ----------

// Помощники забирают рутину, но не людей и не сборку (спека, «Персонал»). Одни работают
// руками (Шмыг убирает места, Ирма наливает эль), другие меняют числа (Тимка раздувает Жар,
// Фиорин замедляет терпение) — решение пользователя 2026-09-29. До глав 2–4 (шаг 3в) приходят
// после главы 1 по порогам славы fame, по одному; нанимаются сценой (story.js). wage —
// жалованье за смену; у барда первые debtDays смен бесплатно (отрабатывает долг). apply — что
// меняет в смене (shift.js cfg.staff); bonus — прибавка к ценам, как у ступеней улучшений:
// скорость и терпение сами по себе денег не дают, пока игрок упирается в руки (урок жаровни
// шага 2, замер шага 3б). kid — ребёнок: в кадре меньше. Числа — от симулятора.
export const STAFF = [
  { id: 'shmyg',  name: 'Шмыг',   role: 'служка',    race: 'goblin', seed: 7101, kid: true, fame: 80, wage: 40, apply: { clear: 2 }, look: { cloth: '#6b5a44', hat: 'none' } },
  { id: 'irma',   name: 'Ирма',   role: 'бармен',    race: 'human',  seed: 7102, fame: 140, wage: 45, apply: { pour: 0.9 }, bonus: { aleBonus: 0.5 }, look: { hair: '#8a2e22', hair2: 'short', hat: 'none', beard: null, scar: true, cloth: '#4a3a30' } },
  { id: 'timka',  name: 'Тимка',  role: 'поварёнок', race: 'human',  seed: 7103, kid: true, fame: 200, wage: 35, apply: { fire: 0.2 }, bonus: { roastBonus: 0.1 }, look: { hair: '#c49a5a', hair2: 'short', hat: 'toque', beard: null, cloth: '#e8e2d4' } },
  { id: 'fiorin', name: 'Фиорин', role: 'бард',      race: 'elf',    seed: 7104, fame: 260, wage: 40, debtDays: 5, favorite: 'ale', apply: { slow: 0.2 }, bonus: { tipBonus: 0.1 }, look: { hat: 'beret', cloth: '#5a3a6a', hair: '#e8d38a' } },
];

// Ступени потока гостей по числу нанятых помощников (решение пользователя 2026-09-29: места не
// покупаются, по ходу игры гостей приходит больше). Каждый помощник приходит, когда таверна
// перерастает руки игрока, и освободившееся внимание сразу забирает новая нагрузка (спека,
// «Персонал»). seats — мест в зале всего: стойка и столы (шаг 3д), gap — множитель паузы
// между гостями. Без помощников — три места, как в срезе шага 1. Подобрано симулятором.
export const FLOW = [
  { seats: 3, gap: 1 },
  { seats: 5, gap: 1.1 },
  { seats: 6, gap: 1.15 },
  { seats: 8, gap: 1.3 },
  { seats: 8, gap: 1.25 },
];

// Зал со столами (шаг 3д, идея пользователя): обычные гости — за столами на двоих, к стойке —
// искатели и сюжетные гости (обычные — только когда столы заняты). Окно раздачи держит не
// больше hatch открытых заказов: больше пяти лиц в ряд на телефоне мельче пальца.
// linger — сколько секунд гость за столом ещё сидит за едой и элем, когда мест пять и больше:
// руки и окно раздачи он не занимает, а зал не пустеет (без этого при восьми местах зал пуст).
export const HALL = { hatch: 5, table: 2, tablesMax: 3, linger: 8 };
