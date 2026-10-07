// Локализация RU/EN. Русский — язык исходников: имена нежити, героев, школ и узлов
// гримуара берутся прямо из data.js, словарь их не дублирует. Английский — полный
// перевод здесь. Требование модерации (п. 8.2.3): ноль захардкоженных строк в DOM,
// всё через applyI18nDom(); канвас-тексты и баннеры читают T на каждом использовании.

import { UNDEAD, HEROES, SCHOOLS, GRIMOIRE, DENSITY_NAMES } from './data.js';

const ruFrom = (obj, field) =>
  Object.fromEntries(Object.keys(obj).map(k => [k, field ? obj[k][field] : obj[k].name]));

const RU = {
  title: 'Подземелье Некроманта',
  tier: 'Ярус', party: 'Партия',
  army: 'Армия', circle: 'Ритуальный круг', necromancer: 'Некромант',
  autoFill: 'Разложить', autoFillTip: 'Заполнить круг самыми густыми останками',
  batch: 'Ритуал ×10', batchTip: 'До десяти ритуалов разом',
  raise: 'Поднять', close: 'Закрыть', empty: 'пусто', ritualBtn: 'Ритуал',
  grimoire: 'Гримуар', lich: 'Ритуал лича', lichTip: 'Сброс забега ради тёмной эссенции',
  grimEssence: 'Гримуар · эссенция:', maxed: 'предел', ess: 'эсс.',
  lichConfirm: 'Свершить', lichX2: 'Свершить ×2 (реклама)', lichCancel: 'Не сейчас',
  soundOn: 'звук ♪', soundOff: 'звук ×',
  barracks: 'Казарма', barracksHint: 'тап ставит в строй или убирает',
  cryptBtn: 'Склеп', cryptTitle: 'Склеп',
  crypt: {
    tabs: { necro: 'Некромант', wall: 'Стены', floor: 'Пол', decor: 'Декор' },
    items: {
      occultist: 'Оккультист', acolyte: 'Погребальный жрец', arcanist: 'Арканистка',
      deathKnight: 'Рыцарь смерти', vampireMage: 'Вампир-маг', lichKing: 'Король-лич',
      crypt: 'Склеп', catacombs: 'Катакомбы', brick_dark_1: 'Тёмный кирпич',
      rock_wall_crypt: 'Скальный склеп', brick_dark_3: 'Старая кладка', brick_dark_5: 'Чёрная кладка',
      necro_squares: 'Некрополь',
      column: 'Колонна', columnBroken: 'Обломок колонны', wraith: 'Статуя призрака',
      bloodFountain: 'Кровавый фонтан', dryFountain: 'Сухой фонтан', demonBust: 'Бюст демона',
      evil: 'Древнее зло', lichStatue: 'Статуя лича',
    },
    equipped: 'надето', equip: 'надеть', unequip: 'снять',
    ad: (n, of) => `▶ реклама ${n}/${of}`,
    needTier: t => `или дойти до яруса ${t}`,
    needLich: n => `или свершить ритуал лича ${n} раз`,
    decorHint: n => `Декора можно поставить до ${n} штук`,
  },
  essenceTip: 'Тёмная эссенция',
  helpBtn: '?', helpTitle: 'Как играть',
  intro: {
    next: 'Дальше', go: 'В бой', skip: 'Пропустить',
    slides: [
      { title: 'Ты некромант', text: 'Твой саркофаг стоит на дне подземелья. Сверху спускаются герои, они хотят до тебя добраться.', art: ['n', 'h:militia', 'h:paladin', 'h:priest'] },
      { title: 'Армия дерётся сама', text: 'Твоя нежить бьётся с героями без твоей помощи. Ты помогаешь заклинаниями, когда они готовы.', art: ['u:skeleton', 'u:corpse', 'i:bolt'] },
      { title: 'Поднимай новых слуг', text: 'С павших героев падают останки. Положи три останка в ритуальный круг и нажми «Поднять». Чем гуще останки, тем сильнее слуга.', art: ['i:bone', 'i:rot', 'i:soul', 'u:banshee'] },
    ],
  },
  help: [
    { title: 'Цель', text: 'Не дай героям дойти до саркофага. Ярус это 10 партий героев. На 5-й партии они сильнее, на 10-й приходит чемпион. Отбил ярус, спускаешься глубже.' },
    { title: 'Поражение', text: 'Если герои дошли до саркофага, пропадает треть останков. После 5-й партии бой начнётся снова с 6-й, до неё с 1-й.' },
    { title: 'Останки', icons: ['bone', 'rot', 'soul', 'dust'], text: 'Падают той школы, к которой принадлежал убитый герой. ● обычные с любой партии, ◆ густые с 5-й, ✦ кристаллы с чемпиона.' },
    { title: 'Ритуал', icons: ['circle'], text: 'Положи 3 останка в круг и нажми «Поднять». Слуга чаще той школы, которой в круге больше. Чем гуще останки, тем выше его тир. Глубина ставит потолок: 2-й тир с 3-го яруса, 3-й с 6-го, 4-й с 9-го. Повторный слуга получает звёзды.' },
    { title: 'Круг школ', icons: ['bone', 'dust', 'rot', 'soul'], text: 'Кость бьёт Прах, Прах бьёт Плоть, Плоть бьёт Душу, Душа бьёт Кость. По тому, кого бьёшь, урон ×1.3. В обратную сторону ×0.77.' },
    { title: 'Карточки', icons: ['bone', 'rot', 'soul', 'dust'], text: 'После 5-й и 10-й партии каждого яруса выбираешь одну карточку из трёх: новое заклинание, пассивку для нежити своей школы или усиление. Ритуал лича сбрасывает карточки. 3 карточки одной школы дают её нежити +15% здоровья и атаки, и в ритуале она выпадает чаще. 6 карточек дают +30%.' },
    { title: 'Кнопки', list: [
      ['bolt', 'Заклинания', 'на старте только Костяной шквал, остальные приходят карточками; слотов 4, у каждого своя перезарядка'],
      ['circle', 'Ритуал', 'открывает ритуальный круг'],
      ['auto', 'Разложить', 'сам кладёт в круг самые густые останки, открывается после 5 ритуалов'],
      ['', 'Ритуал ×10', 'десять ритуалов разом, с 4-го яруса'],
      ['', 'Казарма', 'тап по слуге ставит его в строй или убирает, мест в строю больше с глубиной'],
      ['book', 'Гримуар', 'постоянные усиления за тёмную эссенцию'],
      ['lich', 'Ритуал лича', 'начинает забег заново и даёт эссенцию, открывается после чемпиона 10-го яруса'],
      ['crypt', 'Склеп', 'облик некроманта и подземелья'],
    ] },
  ],
  adRecharge: 'Перезарядить (реклама)', adSlot: '+слот на ритуал (реклама)',
  adDouble: 'Удвоить добычу чемпиона (реклама)', adRescue: 'Поднять армию на месте (реклама)',
  loading: 'Загрузка подземелья…',

  units: ruFrom(UNDEAD), heroes: ruFrom(HEROES),
  schoolName: ruFrom(SCHOOLS), remains: ruFrom(SCHOOLS, 'remains'),
  density: DENSITY_NAMES,
  spells: {
    bolt: { name: 'Костяной шквал', hint: 'урон всем героям' },
    wall: { name: 'Костяная стена', hint: 'щит всей армии' },
    rise: { name: 'Восстать!', hint: 'поднять павшего' },
    plague: { name: 'Чумное облако', hint: 'яд всем героям' },
    frenzy: { name: 'Неистовство', hint: '+50% скорости' },
    howl: { name: 'Вой', hint: 'оглушить героев' },
    curse: { name: 'Проклятие', hint: '+30% урона по героям' },
    drain: { name: 'Иссушение', hint: 'удар по сильнейшему' },
  },
  // Карточки некроманта (cards.js): цифры рангов те же, что в RANKS, правятся парой
  cards: {
    title: 'Выбери карточку',
    replaceTitle: 'Все 4 слота заклинаний заняты. Что заменить?',
    back: 'Назад',
    kind: { spell: 'заклинание', passive: 'пассивка', upgrade: 'усиление' },
    rank: (r, max) => `ранг ${r} из ${max}`,
    yours: 'Твои карточки',
    none: 'Пока карточек нет. Первая будет после 5-й партии.',
    pathRule: 'Путь школы: 3 карточки одной школы дают её нежити +15% здоровья и атаки, и в ритуале она выпадает чаще. 6 карточек дают +30%.',
    path: (n, pct) => (pct ? `карточек: ${n}, бонус +${pct}%` : `карточек: ${n}`),
    items: {
      wall: { name: 'Костяная стена', text: () => 'Заклинание: щит всей армии на 30% здоровья на 6 с. Перезарядка 20 с.' },
      boneHp: { name: 'Крепкие кости', text: r => `Костяные получают +${[20, 40, 60][r - 1]}% здоровья.` },
      boneThorns: { name: 'Осколки', text: r => `Костяные возвращают ${[15, 25, 35][r - 1]}% полученного урона.` },
      boltUp: { name: 'Шквал костей', text: r => (r === 1 ? 'Костяной шквал бьёт на 40% сильнее.' : 'Костяной шквал бьёт на 80% сильнее и перезаряжается за 7 с.') },
      rise: { name: 'Восстать!', text: () => 'Заклинание: поднимает сильнейшего павшего с 50% здоровья. Если павших нет, лечит всех на 30%. Перезарядка 15 с.' },
      plague: { name: 'Чумное облако', text: () => 'Заклинание: яд всем героям, за 5 с урон вдвое больше атаки сильнейшего слуги. Перезарядка 16 с.' },
      rotPoison: { name: 'Заразные удары', text: r => `Удары гнилых отравляют на 3 с: ${[15, 25, 35][r - 1]}% их атаки в секунду.` },
      rotFeast: { name: 'Пир', text: r => `Смерть героя лечит гнилых на ${[10, 15, 20][r - 1]}% здоровья.` },
      frenzy: { name: 'Неистовство', text: () => 'Заклинание: армия 5 с бьёт в полтора раза быстрее. Перезарядка 18 с.' },
      howl: { name: 'Вой', text: () => 'Заклинание: герои оглушены на 2 с и не бьют. Перезарядка 20 с.' },
      soulPierce: { name: 'Сквозь доспех', text: r => (r === 1 ? 'Призрачные игнорируют половину брони.' : 'Призрачные игнорируют всю броню.') },
      soulSpeed: { name: 'Лёгкая поступь', text: r => `Призрачные бьют на ${[15, 25, 35][r - 1]}% быстрее.` },
      curse: { name: 'Проклятие', text: () => 'Заклинание: герои получают на 30% больше урона 8 с. Перезарядка 20 с.' },
      drain: { name: 'Иссушение', text: () => 'Заклинание: бьёт самого живучего героя вчетверо сильнее атаки сильнейшего слуги. Перезарядка 12 с.' },
      dustCd: { name: 'Тёмная мудрость', text: r => `Перезарядка всех заклинаний короче на ${[10, 18, 25][r - 1]}%.` },
      dustBlast: { name: 'Прах к праху', text: r => `Павший проклятый слуга взрывается: урон всем героям ${[50, 100][r - 1]}% его атаки.` },
    },
  },
  grim: Object.fromEntries(GRIMOIRE.map(n => [n.id, { name: n.name, fmt: n.fmt }])),
  spellLocked: need => `изучается на ярусе ${need}`,

  msg: {
    intro: 'Герои спускаются. Армия дерётся сама.',
    partyDown: loot => `Партия перебита · ${loot}`,
    raidDown: tier => `Ярус отбит, спускаемся на ярус ${tier}`,
    crypts: slots => ` · мест в армии: ${slots}`,
    learned: ' · изучено заклинание',
    cardTaken: name => `Взята карточка: ${name}`,
    defeat: lost => `Герои дошли до саркофага. Потеряно останков: ${lost}`,
    holdFrom: back => ` · снова с ${back}-й партии`,
    lichReady: 'Теперь доступен ритуал лича',
    lichDone: gained => `Ритуал лича свершён: +${gained} тёмной эссенции. Забег начинается заново.`,
    ritualFail: 'ритуал сорвался',
    fullPower: name => `${name}: все звёзды уже есть, останки вернулись кристаллами`,
    starUp: (name, stars) => `${name}: ${'★'.repeat(stars)}`,
    dupe: name => `${name} уже есть, новая звезда ближе`,
    raisedNew: name => `поднят ${name}, он встанет в строй`,
    raisedFull: name => `поднят ${name}, он ждёт в казарме`,
    needMore: 'Останков меньше, чем нужно кругу',
    batchReport: (done, parts, best) => `Ритуалов: ${done} · ${parts.join(' · ')}${best ? ' · ' + best : ''}`,
    batchNew: n => `новых: ${n}`, batchStar: n => `звёзд: ${n}`,
    batchDupe: n => `впрок: ${n}`, batchFail: n => `сорвалось: ${n}`,
    daily: (day, extra) => `Подарок за вход, день ${day}: останков ×${day}${extra}`,
    dailyDense: ' + густой', dailyCrystal: ' + кристалл',
    doubled: 'Добыча чемпиона удвоена',
    rescued: 'Армия снова на ногах, бой продолжается',
    hintStock: 'Останки павших копятся в кучках. Тапни по кучке три раза, чтобы заложить их в круг.',
    barracksSwap: 'Строй полон. Тапни, кого заменить.',
    cryptUnlocked: name => `Открыто в Склепе: ${name}`,
    cryptFull: 'Декора уже четыре, сними что-нибудь',
    barracksLast: 'Армия не может остаться пустой',
    unlockAuto: 'Открыто «Разложить»: круг заполнится самыми густыми останками',
    unlockBatch: 'Открыт «Ритуал ×10»: десять ритуалов разом',
    hintRaise: 'Круг полон. Подними нового слугу.',
    hintGrow: 'Новый слуга встанет в строй со следующей партии. Кого ставить в строй, решаешь в казарме.',
    hintSpell: 'Помогай армии заклинаниями. «Костяной шквал» бьёт всех героев разом.',
    lichText: (maxTier, gain) =>
      `Забег начнётся заново: пропадут ярусы, армия, звёзды и останки.<br>` +
      `Гримуар, эссенция и Склеп останутся.<br><br>` +
      `Лучшая глубина забега ${maxTier} даст <b>+${gain}</b> тёмной эссенции.`,
  },
};

const EN = {
  title: "Necromancer's Dungeon",
  tier: 'Depth', party: 'Party',
  army: 'Army', circle: 'Ritual circle', necromancer: 'Necromancer',
  autoFill: 'Auto-fill', autoFillTip: 'Fill the circle with the densest remains',
  batch: 'Ritual ×10', batchTip: 'Up to ten rituals at once',
  raise: 'Raise', close: 'Close', empty: 'empty', ritualBtn: 'Ritual',
  grimoire: 'Grimoire', lich: 'Lich ritual', lichTip: 'Reset the run for dark essence',
  grimEssence: 'Grimoire · essence:', maxed: 'maxed', ess: 'ess.',
  lichConfirm: 'Perform', lichX2: 'Perform ×2 (ad)', lichCancel: 'Not now',
  soundOn: 'sound ♪', soundOff: 'sound ×',
  barracks: 'Barracks', barracksHint: 'tap to join or leave the line',
  cryptBtn: 'Crypt', cryptTitle: 'Crypt',
  crypt: {
    tabs: { necro: 'Necromancer', wall: 'Walls', floor: 'Floor', decor: 'Decor' },
    items: {
      occultist: 'Occultist', acolyte: 'Burial Priest', arcanist: 'Arcanist',
      deathKnight: 'Death Knight', vampireMage: 'Vampire Mage', lichKing: 'Lich King',
      crypt: 'Crypt', catacombs: 'Catacombs', brick_dark_1: 'Dark Brick',
      rock_wall_crypt: 'Rock Crypt', brick_dark_3: 'Old Masonry', brick_dark_5: 'Black Masonry',
      necro_squares: 'Necropolis',
      column: 'Column', columnBroken: 'Broken Column', wraith: 'Wraith Statue',
      bloodFountain: 'Blood Fountain', dryFountain: 'Dry Fountain', demonBust: 'Demon Bust',
      evil: 'Ancient Evil', lichStatue: 'Lich Statue',
    },
    equipped: 'equipped', equip: 'equip', unequip: 'remove',
    ad: (n, of) => `▶ ad ${n}/${of}`,
    needTier: t => `or reach depth ${t}`,
    needLich: n => `or perform the lich ritual ${n} times`,
    decorHint: n => `Up to ${n} decor pieces`,
  },
  essenceTip: 'Dark essence',
  helpBtn: '?', helpTitle: 'How to play',
  intro: {
    next: 'Next', go: 'Fight', skip: 'Skip',
    slides: [
      { title: 'You are the necromancer', text: 'Your sarcophagus lies at the bottom of the dungeon. Heroes are coming down to get you.', art: ['n', 'h:militia', 'h:paladin', 'h:priest'] },
      { title: 'The army fights on its own', text: 'Your undead fight the heroes without your help. You help with spells when they are ready.', art: ['u:skeleton', 'u:corpse', 'i:bolt'] },
      { title: 'Raise new servants', text: 'Fallen heroes leave remains. Put three remains in the ritual circle and press "Raise". Denser remains give a stronger servant.', art: ['i:bone', 'i:rot', 'i:soul', 'u:banshee'] },
    ],
  },
  help: [
    { title: 'Goal', text: 'Keep the heroes away from the sarcophagus. A depth is 10 hero parties. Party 5 is stronger, party 10 brings a champion. Clear a depth to go deeper.' },
    { title: 'Defeat', text: 'If heroes reach the sarcophagus, you lose a third of your remains. After party 5 the fight restarts from party 6, before that from party 1.' },
    { title: 'Remains', icons: ['bone', 'rot', 'soul', 'dust'], text: 'They match the school of the slain hero. ● plain from any party, ◆ dense from party 5, ✦ crystals from the champion.' },
    { title: 'Ritual', icons: ['circle'], text: 'Put 3 remains in the circle and press "Raise". The servant is more likely of the school you put in most. Denser remains give a higher tier. Depth sets a cap: tier 2 from depth 3, tier 3 from 6, tier 4 from 9. A repeat servant gets stars.' },
    { title: 'Circle of schools', icons: ['bone', 'dust', 'rot', 'soul'], text: 'Bone beats Ash, Ash beats Flesh, Flesh beats Soul, Soul beats Bone. Against the school you beat, damage ×1.3. The other way, ×0.77.' },
    { title: 'Cards', icons: ['bone', 'rot', 'soul', 'dust'], text: 'After party 5 and party 10 of every depth you pick one card out of three: a new spell, a passive for the undead of its school, or an upgrade. The lich ritual resets your cards. 3 cards of one school give its undead +15% health and attack, and the ritual gives that school more often. 6 cards give +30%.' },
    { title: 'Buttons', list: [
      ['bolt', 'Spells', 'you start with Bone Volley only, the rest come as cards; 4 slots, each spell has its own cooldown'],
      ['circle', 'Ritual', 'opens the ritual circle'],
      ['auto', 'Auto-fill', 'puts the densest remains in the circle, unlocks after 5 rituals'],
      ['', 'Ritual ×10', 'ten rituals at once, from depth 4'],
      ['', 'Barracks', 'tap a servant to put it in the line or take it out, more slots with depth'],
      ['book', 'Grimoire', 'permanent upgrades for dark essence'],
      ['lich', 'Lich ritual', 'restarts the run and gives essence, unlocks after the champion of depth 10'],
      ['crypt', 'Crypt', 'looks of the necromancer and the dungeon'],
    ] },
  ],
  adRecharge: 'Recharge (ad)', adSlot: '+slot for a ritual (ad)',
  adDouble: "Double the champion's loot (ad)", adRescue: 'Raise the army in place (ad)',
  loading: 'Loading the dungeon…',

  units: {
    skeleton: 'Skeleton', boneArcher: 'Shield Skeleton', boneGuard: 'Aura Skeleton', boneGolem: 'Hell Skeleton',
    corpse: 'Walking Corpse', plague: 'Plague Bearer', brute: 'Rotting Brute', meatHill: 'Hill of Flesh',
    shade: 'Shade', banshee: 'Banshee', phantom: 'Phantom', reaper: 'Reaper',
    dustling: 'Dustling', sorcerer: 'Bone Sorcerer', ghoul: 'Ghoul', lichling: 'Lichling',
  },
  heroes: {
    militia: 'Militiaman', mercenary: 'Mercenary', archer: 'Archer',
    priest: 'Priest', mage: 'Mage', paladin: 'Paladin',
  },
  schoolName: { bone: 'Bone', rot: 'Rot', soul: 'Ghostly', dust: 'Cursed' },
  remains: { bone: 'Bone', rot: 'Flesh', soul: 'Soul', dust: 'Ash' },
  density: ['', 'plain', 'dense', 'cryst.'],
  spells: {
    bolt: { name: 'Bone Volley', hint: 'damage to all heroes' },
    wall: { name: 'Bone Wall', hint: 'shield the army' },
    rise: { name: 'Arise!', hint: 'raise the fallen' },
    plague: { name: 'Plague Cloud', hint: 'poison all heroes' },
    frenzy: { name: 'Frenzy', hint: '+50% attack speed' },
    howl: { name: 'Howl', hint: 'stun the heroes' },
    curse: { name: 'Curse', hint: '+30% damage to heroes' },
    drain: { name: 'Drain', hint: 'hit the toughest' },
  },
  cards: {
    title: 'Pick a card',
    replaceTitle: 'All 4 spell slots are taken. Which one to replace?',
    back: 'Back',
    kind: { spell: 'spell', passive: 'passive', upgrade: 'upgrade' },
    rank: (r, max) => `rank ${r} of ${max}`,
    yours: 'Your cards',
    none: 'No cards yet. The first one comes after party 5.',
    pathRule: 'School path: 3 cards of one school give its undead +15% health and attack, and the ritual gives that school more often. 6 cards give +30%.',
    path: (n, pct) => (pct ? `cards: ${n}, bonus +${pct}%` : `cards: ${n}`),
    items: {
      wall: { name: 'Bone Wall', text: () => 'Spell: shields the whole army for 30% of health for 6 s. Cooldown 20 s.' },
      boneHp: { name: 'Strong Bones', text: r => `Bone undead get +${[20, 40, 60][r - 1]}% health.` },
      boneThorns: { name: 'Shards', text: r => `Bone undead return ${[15, 25, 35][r - 1]}% of the damage they take.` },
      boltUp: { name: 'Bone Storm', text: r => (r === 1 ? 'Bone Volley hits 40% harder.' : 'Bone Volley hits 80% harder and recharges in 7 s.') },
      rise: { name: 'Arise!', text: () => 'Spell: raises the strongest fallen servant with 50% health. If nobody has fallen, heals everyone for 30%. Cooldown 15 s.' },
      plague: { name: 'Plague Cloud', text: () => 'Spell: poisons all heroes, over 5 s it deals twice the attack of your strongest servant. Cooldown 16 s.' },
      rotPoison: { name: 'Infected Blows', text: r => `Rot undead poison for 3 s: ${[15, 25, 35][r - 1]}% of their attack per second.` },
      rotFeast: { name: 'Feast', text: r => `A hero's death heals rot undead for ${[10, 15, 20][r - 1]}% of health.` },
      frenzy: { name: 'Frenzy', text: () => 'Spell: the army attacks 1.5 times faster for 5 s. Cooldown 18 s.' },
      howl: { name: 'Howl', text: () => 'Spell: heroes are stunned for 2 s and do not attack. Cooldown 20 s.' },
      soulPierce: { name: 'Through Armor', text: r => (r === 1 ? 'Ghostly undead ignore half of the armor.' : 'Ghostly undead ignore all armor.') },
      soulSpeed: { name: 'Light Step', text: r => `Ghostly undead attack ${[15, 25, 35][r - 1]}% faster.` },
      curse: { name: 'Curse', text: () => 'Spell: heroes take 30% more damage for 8 s. Cooldown 20 s.' },
      drain: { name: 'Drain', text: () => 'Spell: hits the toughest hero for four times the attack of your strongest servant. Cooldown 12 s.' },
      dustCd: { name: 'Dark Wisdom', text: r => `All spell cooldowns are ${[10, 18, 25][r - 1]}% shorter.` },
      dustBlast: { name: 'Ashes to Ashes', text: r => `A fallen cursed servant explodes: damage to all heroes equal to ${[50, 100][r - 1]}% of its attack.` },
    },
  },
  grim: {
    boneFort: { name: 'Bone Fortress', fmt: n => `+${8 * n}% army health` },
    fleshHunger: { name: 'Hunger of Flesh', fmt: n => `+${8 * n}% army attack` },
    richHarvest: { name: 'Rich Harvest', fmt: n => `+${10 * n}% remains from parties` },
    quickWord: { name: 'Quick Word', fmt: n => `spell cooldowns −${7 * n}%` },
    darkLore: { name: 'Dark Lore', fmt: n => `+${20 * n}% spell power` },
    stash: { name: 'Hidden Away', fmt: n => `${2 * n} crystals survive the reset` },
    decay: { name: 'Decay', fmt: n => `+${5 * n}% dense remains chance` },
    crypts: { name: 'Spacious Crypts', fmt: n => `+${n} starting army slot` },
    firstCard: { name: 'First Card', fmt: () => 'pick a card at the start of a run' },
    fourthSlot: { name: 'Fourth Circle Slot', fmt: () => 'fourth slot forever' },
    catacombs: { name: 'Deep Catacombs', fmt: n => `army cap +${2 * n}` },
  },
  spellLocked: need => `unlocks at depth ${need}`,

  msg: {
    intro: 'Heroes are descending. The army fights on its own.',
    partyDown: loot => `Party slain · ${loot}`,
    raidDown: tier => `Depth cleared, going down to depth ${tier}`,
    crypts: slots => ` · army slots: ${slots}`,
    learned: ' · new spell learned',
    cardTaken: name => `Card taken: ${name}`,
    defeat: lost => `Heroes reached the sarcophagus. Remains lost: ${lost}`,
    holdFrom: back => ` · again from party ${back}`,
    lichReady: 'The lich ritual is now available',
    lichDone: gained => `Lich ritual done: +${gained} dark essence. The run starts over.`,
    ritualFail: 'the ritual failed',
    fullPower: name => `${name} already has all stars, the remains came back as crystals`,
    starUp: (name, stars) => `${name}: ${'★'.repeat(stars)}`,
    dupe: name => `${name} again, closer to a new star`,
    raisedNew: name => `${name} raised, joins the next fight`,
    raisedFull: name => `${name} raised, waiting in the barracks`,
    needMore: 'Not enough remains for the circle',
    batchReport: (done, parts, best) => `Rituals: ${done} · ${parts.join(' · ')}${best ? ' · ' + best : ''}`,
    batchNew: n => `new: ${n}`, batchStar: n => `stars: ${n}`,
    batchDupe: n => `stored: ${n}`, batchFail: n => `failed: ${n}`,
    daily: (day, extra) => `Daily gift, day ${day}: remains ×${day}${extra}`,
    dailyDense: ' + dense', dailyCrystal: ' + crystal',
    doubled: "Champion's loot doubled",
    rescued: 'The army is back up, the fight goes on',
    hintStock: 'Remains of the fallen pile up. Tap a pile three times to put them in the circle.',
    barracksSwap: 'The line is full. Tap who to replace.',
    cryptUnlocked: name => `Unlocked in the Crypt: ${name}`,
    cryptFull: 'Four decor pieces already, remove one first',
    barracksLast: 'The army cannot be left empty',
    unlockAuto: 'Unlocked "Auto-fill": fills the circle with the densest remains',
    unlockBatch: 'Unlocked "Ritual ×10": ten rituals at once',
    hintRaise: 'The circle is full. Raise a new servant.',
    hintGrow: 'The new servant joins the next fight. Choose who fights in the barracks.',
    hintSpell: 'Help your army with spells. "Bone Volley" hits every hero at once.',
    lichText: (maxTier, gain) =>
      `The run starts over: depths, army, stars and remains are gone.<br>` +
      `The grimoire, essence and the Crypt stay.<br><br>` +
      `Best depth of this run ${maxTier} gives <b>+${gain}</b> dark essence.`,
  },
};

// Наружу — только для tools/check-texts.mjs: проверка обходит оба словаря целиком
export const DICTS = { ru: RU, en: EN };
export let T = RU;
let curLang = null;
let onChange = null;

/* Панели останков, круга и армии рисуются из JS и статической разметки не имеют:
   applyI18nDom до них не достаёт. Кто их рисует, тот и подписывается — иначе смена
   языка оставляет половину интерфейса на прежнем (ловится сменой языка на ходу). */
export function onLangChange(fn) { onChange = fn; }

// Единая точка смены языка: тексты DOM, <title> и <html lang> разом (п. 8.2.3)
export function setLang(l) {
  const raw = String(l || 'ru').slice(0, 2).toLowerCase();
  const code = DICTS[raw] ? raw : 'en';
  if (code === curLang) return;
  curLang = code;
  T = DICTS[code];
  applyI18nDom();
  onChange?.();
}

export function applyI18nDom() {
  for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = T[el.dataset.i18n];
  for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = T[el.dataset.i18nTitle];
  document.title = T.title;
  document.documentElement.lang = curLang;
}
