// «Склеп» — кастомизация подземелья и некроманта. Чистые данные и правила, без DOM.
//
// Решение пользователя 2026-10-07: каждую вещь открывают две двери — просмотры
// рекламы (честный обмен) ИЛИ достижение (статус: «у него стены оссуария — значит
// дошёл до двадцатого яруса»). Лесенка цен: декор — 1 просмотр, пол и стены — 2,
// некроманты — 3. Просмотры копятся (1/3, 2/3). Вещи косметические и игровой силы
// не дают — поэтому реклама за них чиста и для модерации, и для баланса.
// Открытое и надетое переживает ритуал лича.

/* need: { tier } — лучший ярус за всю игру, { lich } — ритуалов лича.
   free — есть с самого начала. */
export const CATALOG = [
  { id: 'necro:occultist',   kind: 'necro', key: 'occultist',   free: true },
  { id: 'necro:acolyte',     kind: 'necro', key: 'acolyte',     ads: 3, need: { tier: 25 } },
  { id: 'necro:arcanist',    kind: 'necro', key: 'arcanist',    ads: 3, need: { tier: 30 } },
  { id: 'necro:deathKnight', kind: 'necro', key: 'deathKnight', ads: 3, need: { tier: 35 } },
  { id: 'necro:vampireMage', kind: 'necro', key: 'vampireMage', ads: 3, need: { lich: 3 } },
  { id: 'necro:lichKing',    kind: 'necro', key: 'lichKing',    ads: 3, need: { lich: 5 } },

  { id: 'wall:crypt',           kind: 'wall', key: 'crypt',           free: true },
  { id: 'wall:catacombs',       kind: 'wall', key: 'catacombs',       ads: 2, need: { tier: 10 } },
  { id: 'wall:brick_dark_1',    kind: 'wall', key: 'brick_dark_1',    ads: 2, need: { tier: 12 } },
  { id: 'wall:rock_wall_crypt', kind: 'wall', key: 'rock_wall_crypt', ads: 2, need: { tier: 15 } },
  { id: 'wall:brick_dark_3',    kind: 'wall', key: 'brick_dark_3',    ads: 2, need: { tier: 18 } },
  { id: 'wall:brick_dark_5',    kind: 'wall', key: 'brick_dark_5',    ads: 2, need: { tier: 20 } },

  { id: 'floor:crypt',         kind: 'floor', key: 'crypt',         free: true },
  { id: 'floor:necro_squares', kind: 'floor', key: 'necro_squares', ads: 2, need: { tier: 10 } },

  { id: 'decor:column',        kind: 'decor', key: 'column',        free: true },
  { id: 'decor:columnBroken',  kind: 'decor', key: 'columnBroken',  free: true },
  { id: 'decor:wraith',        kind: 'decor', key: 'wraith',        ads: 1, need: { tier: 5 } },
  { id: 'decor:bloodFountain', kind: 'decor', key: 'bloodFountain', ads: 1, need: { tier: 6 } },
  { id: 'decor:dryFountain',   kind: 'decor', key: 'dryFountain',   ads: 1, need: { tier: 7 } },
  { id: 'decor:demonBust',     kind: 'decor', key: 'demonBust',     ads: 1, need: { tier: 8 } },
  { id: 'decor:evil',          kind: 'decor', key: 'evil',          ads: 1, need: { tier: 10 } },
  { id: 'decor:lichStatue',    kind: 'decor', key: 'lichStatue',    ads: 1, need: { lich: 1 } },
];
export const KINDS = ['necro', 'wall', 'floor', 'decor'];
// Декор встаёт между колоннами вдоль стен — мест восемь, по четыре на сторону
export const DECOR_SLOTS = 4;

const byId = Object.fromEntries(CATALOG.map(c => [c.id, c]));
export const item = id => byId[id];

export function freshCosmetics() {
  return {
    owned: CATALOG.filter(c => c.free).map(c => c.id),
    views: {},                                   // id → сколько просмотров уже накоплено
    equip: { necro: 'occultist', wall: 'crypt', floor: 'crypt', decor: ['column', 'columnBroken'] },
  };
}

// Сейв — данные снаружи: берём только то, что есть в каталоге
export function sanitize(raw) {
  const c = freshCosmetics();
  if (!raw || typeof raw !== 'object') return c;
  if (Array.isArray(raw.owned)) for (const id of raw.owned) if (byId[id] && !c.owned.includes(id)) c.owned.push(id);
  if (raw.views && typeof raw.views === 'object') {
    for (const [id, n] of Object.entries(raw.views)) if (byId[id]) c.views[id] = Math.max(0, n | 0);
  }
  const e = raw.equip || {};
  for (const k of ['necro', 'wall', 'floor']) if (c.owned.includes(`${k}:${e[k]}`)) c.equip[k] = e[k];
  if (Array.isArray(e.decor)) c.equip.decor = e.decor.filter(k => c.owned.includes(`decor:${k}`)).slice(0, DECOR_SLOTS);
  return c;
}

export const needMet = (it, stats) => !!it.need &&
  (it.need.tier == null || stats.bestTier >= it.need.tier) &&
  (it.need.lich == null || stats.lichCount >= it.need.lich);

/* Достижения открывают вещи сами. Возвращает только что открытые — для баннера. */
export function grantByAchievements(cos, stats) {
  const fresh = [];
  for (const it of CATALOG) {
    if (!cos.owned.includes(it.id) && needMet(it, stats)) { cos.owned.push(it.id); fresh.push(it); }
  }
  return fresh;
}

/* Один досмотренный ролик. Возвращает true, если вещь этим открылась. */
export function addView(cos, id) {
  const it = byId[id];
  if (!it || cos.owned.includes(id)) return false;
  cos.views[id] = (cos.views[id] || 0) + 1;
  if (cos.views[id] >= it.ads) { cos.owned.push(id); delete cos.views[id]; return true; }
  return false;
}

/* Надеть. Для декора — переключатель: надет — снимается, нет — встаёт, пока есть место. */
export function toggleEquip(cos, id) {
  const it = byId[id];
  if (!it || !cos.owned.includes(id)) return false;
  if (it.kind !== 'decor') { cos.equip[it.kind] = it.key; return true; }
  const list = cos.equip.decor;
  const at = list.indexOf(it.key);
  if (at >= 0) list.splice(at, 1);
  else if (list.length < DECOR_SLOTS) list.push(it.key);
  else return false;
  return true;
}

export const isEquipped = (cos, it) => it.kind === 'decor' ? cos.equip.decor.includes(it.key) : cos.equip[it.kind] === it.key;

/* Рамка лица растёт с лучшим ярусом за всю игру: камень → бронза → серебро → пламя.
   Пороги стоят там, где игрок впервые чувствует, что «прошёл дальше»: первый
   рейд-чемпион, середина, предпоследний открытый скин. */
export function frameRank(bestTier) {
  return bestTier >= 30 ? 3 : bestTier >= 15 ? 2 : bestTier >= 5 ? 1 : 0;
}
