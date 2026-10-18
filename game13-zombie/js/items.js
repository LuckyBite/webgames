// База предметов и таблицы лута. Только данные и чистые функции, без three.js —
// симулятор и тесты в Node подключают этот файл напрямую.

// Оружие. slot: melee | pistol | long | throw. Урон по зомби (у обычного 100 HP).
// rate — секунд между выстрелами, spread — разброс в радианах, recoil — подброс камеры.
// sound — ключ звука в audio.js; model — ключ модели в assets.js.
export const WEAPONS = {
  fists:   { name: 'Кулаки', slot: 'melee', melee: true, dmg: 14, rate: 0.5, range: 1.5, knock: 1.5, sound: 'swing', noise: 4 },
  knife:   { name: 'Нож', slot: 'melee', melee: true, dmg: 38, rate: 0.42, range: 1.7, knock: 1, sound: 'swing', noise: 4, model: 'knife' },
  bat:     { name: 'Бита', slot: 'melee', melee: true, dmg: 55, rate: 0.75, range: 2.1, knock: 4, sound: 'swingHeavy', noise: 5, model: 'bat' },
  machete: { name: 'Мачете', slot: 'melee', melee: true, dmg: 50, rate: 0.55, range: 1.9, knock: 1.5, sound: 'swing', noise: 4, model: 'machete' },
  crowbar: { name: 'Монтировка', slot: 'melee', melee: true, dmg: 46, rate: 0.68, range: 1.9, knock: 3, sound: 'swingHeavy', noise: 5, model: 'crowbar' },
  axe:     { name: 'Пожарный топор', slot: 'melee', melee: true, dmg: 90, rate: 0.95, range: 2.2, knock: 3, sound: 'swingHeavy', noise: 5, model: 'axe' },
  // только с трупа культиста, и то редко: рубит быстро и сильно, но шумит на весь квартал
  chainsaw:{ name: 'Бензопила', slot: 'melee', melee: true, dmg: 130, rate: 0.5, range: 2.1, knock: 2, sound: 'swingHeavy', noise: 12, model: 'chainsaw' },
  pistol:  { name: 'Пистолет', slot: 'pistol', ammo: '9mm', mag: 12, dmg: 34, rate: 0.2, spread: 0.012, recoil: 0.035, range: 70, reload: 1.3, sound: 'pistol', noise: 45, model: 'pistol' },
  revolver:{ name: 'Револьвер', slot: 'pistol', ammo: '357', mag: 6, dmg: 75, rate: 0.45, spread: 0.008, recoil: 0.08, range: 80, reload: 2.2, sound: 'revolver', noise: 55, model: 'revolver' },
  smg:     { name: 'Пистолет-пулемёт', slot: 'long', ammo: '9mm', mag: 30, dmg: 24, rate: 0.075, auto: true, spread: 0.03, recoil: 0.022, range: 55, reload: 1.8, sound: 'smg', noise: 50, model: 'smg' },
  shotgun: { name: 'Дробовик', slot: 'long', ammo: '12ga', mag: 6, dmg: 16, pellets: 9, rate: 0.85, spread: 0.075, recoil: 0.11, range: 30, reload: 0.55, perShell: true, sound: 'shotgun', noise: 70, model: 'shotgun', knock: 3 },
  rifle:   { name: 'Автомат', slot: 'long', ammo: '762', mag: 30, dmg: 42, rate: 0.105, auto: true, spread: 0.02, recoil: 0.03, range: 120, reload: 2.2, sound: 'rifle', noise: 75, model: 'rifle' },
  sniper:  { name: 'Снайперская винтовка', slot: 'long', ammo: '308', mag: 5, dmg: 180, rate: 1.25, spread: 0.002, recoil: 0.14, range: 300, reload: 2.8, scope: true, pierce: 2, sound: 'sniper', noise: 90, model: 'sniper' },
  grenade: { name: 'Граната', slot: 'throw', throw: true, dmg: 220, radius: 7, fuse: 2.4, rate: 0.9, sound: 'explosion', noise: 100, model: 'grenade' },
  molotov: { name: 'Коктейль Молотова', slot: 'throw', throw: true, dmg: 30, fire: 8, radius: 4.5, rate: 0.9, sound: 'glass', noise: 40, model: 'molotov' },
};

export const AMMO = {
  '9mm': { name: 'Патроны 9 мм', stack: 90 },
  '357': { name: 'Патроны .357', stack: 36 },
  '12ga': { name: 'Патроны 12 калибра', stack: 32 },
  '762': { name: 'Патроны 7.62', stack: 90 },
  '308': { name: 'Патроны .308', stack: 30 },
};

// Все предметы. kind: weapon | ammo | food | med | gear | fuel | mat | quest
export const ITEMS = {};
for (const [id, w] of Object.entries(WEAPONS)) if (id !== 'fists')
  ITEMS[id] = { id, name: w.name, kind: 'weapon', stack: w.throw ? 5 : 1, icon: id };
for (const [id, a] of Object.entries(AMMO))
  ITEMS['ammo_' + id] = { id: 'ammo_' + id, name: a.name, kind: 'ammo', ammo: id, stack: a.stack, icon: 'ammo' };

Object.assign(ITEMS, {
  bandage:  { id: 'bandage', name: 'Бинт', kind: 'med', stack: 8, heal: 20, stopBleed: true, use: 2.0, icon: 'bandage' },
  medkit:   { id: 'medkit', name: 'Аптечка', kind: 'med', stack: 3, heal: 70, stopBleed: true, use: 4.0, icon: 'medkit' },
  pills:    { id: 'pills', name: 'Обезболивающее', kind: 'med', stack: 6, regen: 25, use: 1.0, icon: 'pills' },
  antidote: { id: 'antidote', name: 'Антибиотик', kind: 'med', stack: 4, cure: true, use: 1.5, icon: 'pills' },
  canned:   { id: 'canned', name: 'Тушёнка', kind: 'food', stack: 6, food: 40, use: 2.5, icon: 'can' },
  beans:    { id: 'beans', name: 'Банка фасоли', kind: 'food', stack: 6, food: 30, use: 2.0, icon: 'can' },
  chips:    { id: 'chips', name: 'Чипсы', kind: 'food', stack: 8, food: 15, water: -5, use: 1.2, icon: 'chips' },
  choco:    { id: 'choco', name: 'Шоколадка', kind: 'food', stack: 10, food: 12, stam: 30, use: 0.8, icon: 'choco' },
  water:    { id: 'water', name: 'Бутылка воды', kind: 'food', stack: 6, water: 45, use: 1.5, icon: 'water' },
  soda:     { id: 'soda', name: 'Газировка', kind: 'food', stack: 6, water: 25, food: 5, use: 1.0, icon: 'soda' },
  energy:   { id: 'energy', name: 'Энергетик', kind: 'food', stack: 6, water: 15, stam: 100, use: 1.0, icon: 'soda' },
  fuel:     { id: 'fuel', name: 'Канистра бензина', kind: 'fuel', stack: 2, liters: 20, icon: 'fuel' },
  scrap:    { id: 'scrap', name: 'Металлолом', kind: 'mat', stack: 20, icon: 'scrap' },
  parts:    { id: 'parts', name: 'Запчасти', kind: 'mat', stack: 10, icon: 'parts' },
  cloth:    { id: 'cloth', name: 'Ткань', kind: 'mat', stack: 20, icon: 'cloth' },
  battery:  { id: 'battery', name: 'Аккумулятор', kind: 'mat', stack: 2, icon: 'battery' },
  vest:     { id: 'vest', name: 'Бронежилет', kind: 'gear', gear: 'body', armor: 0.35, dur: 300, stack: 1, icon: 'vest' },
  helmet:   { id: 'helmet', name: 'Каска', kind: 'gear', gear: 'head', armor: 0.15, dur: 150, stack: 1, icon: 'helmet' },
  bag_s:    { id: 'bag_s', name: 'Школьный рюкзак', kind: 'gear', gear: 'bag', slots: 14, stack: 1, icon: 'bag' },
  bag_m:    { id: 'bag_m', name: 'Туристический рюкзак', kind: 'gear', gear: 'bag', slots: 20, stack: 1, icon: 'bag' },
  bag_l:    { id: 'bag_l', name: 'Армейский рюкзак', kind: 'gear', gear: 'bag', slots: 28, stack: 1, icon: 'bag' },
  // квестовые
  meds_box: { id: 'meds_box', name: 'Коробка лекарств', kind: 'quest', stack: 5, icon: 'medkit' },
  radio:    { id: 'radio', name: 'Рация', kind: 'quest', stack: 1, icon: 'battery' },
  photo:    { id: 'photo', name: 'Семейное фото', kind: 'quest', stack: 1, icon: 'cloth' },
  docs:     { id: 'docs', name: 'Папка с документами', kind: 'quest', stack: 1, icon: 'cloth' },
  sample:   { id: 'sample', name: 'Образец крови', kind: 'quest', stack: 3, icon: 'pills' },
});

export const POCKET_SLOTS = 8;

// Таблицы лута по типу контейнера: [id, вес, min, max]
export const LOOT = {
  car:      { rolls: [1, 3], t: [['water', 3, 1, 1], ['soda', 3, 1, 2], ['chips', 3, 1, 2], ['ammo_9mm', 3, 4, 12], ['bandage', 2, 1, 2], ['fuel', 2, 1, 1], ['scrap', 2, 1, 3], ['choco', 2, 1, 2], ['parts', 1, 1, 1], ['pistol', 0.4, 1, 1], ['bat', 0.5, 1, 1]] },
  fridge:   { rolls: [1, 3], t: [['water', 4, 1, 2], ['soda', 4, 1, 2], ['canned', 2, 1, 1], ['beans', 2, 1, 1], ['energy', 1, 1, 1]] },
  shelf:    { rolls: [2, 4], t: [['canned', 3, 1, 2], ['beans', 3, 1, 2], ['chips', 4, 1, 3], ['choco', 3, 1, 3], ['water', 4, 1, 2], ['soda', 3, 1, 2], ['energy', 2, 1, 1], ['bandage', 1, 1, 2], ['cloth', 1, 1, 2]] },
  pharmacy: { rolls: [2, 4], t: [['bandage', 5, 1, 3], ['pills', 4, 1, 2], ['medkit', 1.5, 1, 1], ['antidote', 2, 1, 1], ['water', 2, 1, 1], ['meds_box', 0, 1, 1]] },
  house:    { rolls: [1, 3], t: [['canned', 2, 1, 1], ['water', 2, 1, 1], ['bandage', 2, 1, 2], ['pills', 1, 1, 1], ['knife', 0.8, 1, 1], ['bat', 0.8, 1, 1], ['ammo_9mm', 1.5, 6, 14], ['ammo_12ga', 0.8, 3, 6], ['revolver', 0.25, 1, 1], ['ammo_357', 0.5, 4, 8], ['bag_s', 0.6, 1, 1], ['cloth', 2, 1, 3], ['battery', 0.5, 1, 1], ['shotgun', 0.15, 1, 1]] },
  police:   { rolls: [2, 4], t: [['pistol', 2, 1, 1], ['ammo_9mm', 4, 10, 24], ['shotgun', 1.2, 1, 1], ['ammo_12ga', 3, 4, 10], ['vest', 1, 1, 1], ['smg', 0.8, 1, 1], ['rifle', 0.3, 1, 1], ['ammo_762', 1, 10, 20], ['bandage', 2, 1, 2], ['radio', 0, 1, 1]] },
  military: { rolls: [2, 5], t: [['rifle', 1.5, 1, 1], ['ammo_762', 5, 20, 45], ['sniper', 0.6, 1, 1], ['ammo_308', 2, 5, 12], ['grenade', 2, 1, 3], ['vest', 1.5, 1, 1], ['medkit', 1.5, 1, 1], ['bag_l', 0.6, 1, 1], ['canned', 1, 1, 2]] },
  warehouse:{ rolls: [1, 3], t: [['scrap', 5, 2, 6], ['parts', 3, 1, 3], ['fuel', 2, 1, 1], ['axe', 0.6, 1, 1], ['crowbar', 0.8, 1, 1], ['machete', 0.4, 1, 1], ['battery', 1, 1, 1], ['cloth', 2, 2, 4], ['bag_m', 0.4, 1, 1], ['molotov', 0.8, 1, 2], ['water', 1, 1, 1]] },
  canister: { rolls: [1, 1], t: [['fuel', 1, 1, 1]] }, // канистра у дома: топливо или пусто
  gas:      { rolls: [1, 3], t: [['fuel', 4, 1, 1], ['chips', 3, 1, 2], ['soda', 3, 1, 2], ['choco', 3, 1, 2], ['energy', 2, 1, 1], ['parts', 1, 1, 2], ['molotov', 0.6, 1, 1]] },
  // v2.1: в карманах у зомби только мелочь; еда, оружие и снаряжение — в шкафах, холодильниках, багажниках
  zombie:   { rolls: [0, 1], t: [['ammo_9mm', 2, 1, 4], ['cloth', 2.5, 1, 1], ['scrap', 1.5, 1, 1], ['bandage', 0.5, 1, 1], ['pills', 0.3, 1, 1], ['ammo_12ga', 0.4, 1, 2], ['battery', 0.2, 1, 1]] },
  cultist:  { rolls: [0, 2], t: [['ammo_9mm', 1.5, 2, 6], ['bandage', 1.5, 1, 1], ['cloth', 2, 1, 2], ['pills', 0.8, 1, 1], ['choco', 1, 1, 1], ['water', 1, 1, 1], ['scrap', 1, 1, 2]] },
  trash:    { rolls: [0, 2], t: [['cloth', 3, 1, 2], ['scrap', 3, 1, 2], ['chips', 1.5, 1, 1], ['soda', 1.2, 1, 1], ['battery', 0.6, 1, 1], ['parts', 0.4, 1, 1], ['water', 0.5, 1, 1]] },
  desk:     { rolls: [1, 2], t: [['pills', 1.5, 1, 1], ['battery', 1.5, 1, 1], ['choco', 2, 1, 2], ['ammo_9mm', 1, 4, 10], ['cloth', 1, 1, 1], ['bandage', 1, 1, 1], ['knife', 0.3, 1, 1]] },
  wardrobe: { rolls: [1, 3], t: [['cloth', 4, 1, 3], ['bag_s', 0.8, 1, 1], ['bag_m', 0.3, 1, 1], ['bat', 0.5, 1, 1], ['ammo_9mm', 0.8, 6, 12], ['revolver', 0.12, 1, 1], ['ammo_357', 0.4, 4, 8]] },
  kitchen:  { rolls: [1, 3], t: [['canned', 3, 1, 2], ['beans', 3, 1, 2], ['knife', 1, 1, 1], ['water', 2, 1, 1], ['choco', 1, 1, 1], ['chips', 1.5, 1, 1]] },
  boss:     { rolls: [3, 5], t: [['ammo_762', 3, 20, 40], ['ammo_308', 2, 5, 10], ['medkit', 2, 1, 1], ['grenade', 2, 1, 2], ['rifle', 0.7, 1, 1], ['sniper', 0.4, 1, 1], ['bag_l', 0.5, 1, 1]] },
};

// детерминированный ГПСЧ (mulberry32)
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function rollLoot(type, rand, luck = 1) {
  const tab = LOOT[type];
  if (!tab) return [];
  const n = tab.rolls[0] + Math.floor(rand() * (tab.rolls[1] - tab.rolls[0] + 1));
  const total = tab.t.reduce((s, r) => s + r[1], 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    let x = rand() * total;
    for (const [id, w, mn, mx] of tab.t) {
      x -= w;
      if (x <= 0) {
        if (w === 0) break;
        const q = mn + Math.floor(rand() * (mx - mn + 1) * luck);
        const ex = out.find(o => o.id === id && ITEMS[id].stack > 1);
        if (ex) ex.n = Math.min(ITEMS[id].stack, ex.n + q);
        else out.push(weaponState({ id, n: Math.max(1, Math.min(ITEMS[id].stack, q)) }, rand));
        break;
      }
    }
  }
  return out;
}

// найденное огнестрельное оружие лежит с неполным магазином
export function weaponState(it, rand = Math.random) {
  const w = WEAPONS[it.id];
  if (w && w.mag) it.mag = Math.floor(rand() * (w.mag + 1));
  return it;
}

// ---------- инвентарь ----------
// slots — массив длины cap, элемент {id, n, mag?} или null.
export class Inventory {
  constructor(cap = POCKET_SLOTS) { this.slots = new Array(cap).fill(null); }
  get cap() { return this.slots.length; }
  resize(cap) {
    // лишнее не теряем: возвращаем выпавшие предметы
    const extra = [];
    if (cap < this.slots.length) {
      for (let i = cap; i < this.slots.length; i++) if (this.slots[i]) extra.push(this.slots[i]);
      this.slots.length = cap;
    } else while (this.slots.length < cap) this.slots.push(null);
    const left = [];
    for (const it of extra) { const r = this.add(it); if (r) left.push(r); }
    return left;
  }
  count(id) { return this.slots.reduce((s, it) => s + (it && it.id === id ? it.n : 0), 0); }
  // добавляет, возвращает остаток (или null, если влезло всё)
  add(item) {
    const def = ITEMS[item.id];
    if (!def) return null;
    let n = item.n;
    if (def.stack > 1) for (const s of this.slots) {
      if (s && s.id === item.id && s.n < def.stack) { const k = Math.min(n, def.stack - s.n); s.n += k; n -= k; if (!n) return null; }
    }
    for (let i = 0; i < this.slots.length; i++) {
      if (!this.slots[i]) {
        const k = Math.min(n, def.stack);
        this.slots[i] = Object.assign({}, item, { n: k });
        n -= k;
        if (!n) return null;
      }
    }
    return Object.assign({}, item, { n });
  }
  // забирает n штук, возвращает сколько забрал
  take(id, n) {
    let got = 0;
    for (let i = this.slots.length - 1; i >= 0 && got < n; i--) {
      const s = this.slots[i];
      if (s && s.id === id) { const k = Math.min(n - got, s.n); s.n -= k; got += k; if (!s.n) this.slots[i] = null; }
    }
    return got;
  }
  removeAt(i) { const it = this.slots[i]; this.slots[i] = null; return it; }
  freeSlots() { return this.slots.filter(s => !s).length; }
  toJSON() { return this.slots; }
  static from(arr) { const inv = new Inventory(arr.length); inv.slots = arr.map(s => s ? Object.assign({}, s) : null); return inv; }
}
