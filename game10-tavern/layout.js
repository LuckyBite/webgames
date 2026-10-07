// «Таверна у края Хмари» — раскладка экранов. Чистая функция размеров окна и состава
// таверны: ни канваса, ни состояния игры.
//
// Позиции выводятся друг из друга, а не задаются числами (урок «Лавки зелий»: иначе
// элементы наезжают на каждом втором экране). Инварианты — цели ≥ 44 CSS px, геймплей
// ≥ 70% кадра (правило Яндекса 5.1.1.2), цели одного экрана не пересекаются — проверяют
// tests/layout.test.mjs и layout-lab.html одной функцией checkLayout.

import { RULES, PANTRY, ROUTES, SEEKERS, HALL } from './data.js';
import { seatPlan } from './shift.js';

export const HUD_H = 44;
export const TAB_W = 76;
export const MIN_TARGET = 44;
// Зал и кухня рядом — только от 600 px по короткой стороне; порог уточняет стенд.
export const SPLIT_MIN_SIDE = 600;
export const SPLIT_MIN_ASPECT = 1.2;
export const SHOP_SLOTS = 8;   // лавка утра — 2 × 4 карточки
export const STAFF_STRIP = 30; // полоса команды утром под искателями
// Фигура гостя в единицах chars.js: ширина плеч с запасом и высота над стойкой.
// С каждым местом сверх трёх гости теснее — плечами внахлёст, как в людной таверне.
const GUEST_UNITS_W = 110;
const GUEST_UNITS_H = 140;

const R = (x, y, w, h) => ({ x, y, w, h });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const contains = (r, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function columns(r, n, gap) {
  const w = (r.w - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => R(r.x + i * (w + gap), r.y, w, r.h));
}
function rows(r, n, gap) {
  const h = (r.h - gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => R(r.x, r.y + i * (h + gap), r.w, h));
}
function split(r, fractions, gap) {
  const total = r.w - gap * (fractions.length - 1);
  let x = r.x;
  return fractions.map(f => { const c = R(x, r.y, total * f, r.h); x += total * f + gap; return c; });
}
// n ячеек сеткой: столбцов — сколько влезает по ширине, не мельче цели для пальца.
function grid(r, n, gap) {
  if (!n) return [];
  const cols = Math.max(1, Math.min(n, Math.floor((r.w + gap) / (MIN_TARGET + 4 + gap))));
  return rows(r, Math.ceil(n / cols), gap).flatMap(row => columns(row, cols, gap)).slice(0, n);
}

export function computeLayout(W, H, cfg = {}) {
  const c = { seats: RULES.seats, hearthSlots: RULES.hearthSlots, cauldronSlots: 0, pantry: PANTRY, staff: 0, ...cfg };
  c.hatch = Math.min(HALL.hatch, c.seats);   // гнёзд в окне раздачи — открытых заказов (шаг 3д)
  const mode = Math.min(W, H) >= SPLIT_MIN_SIDE && W / H >= SPLIT_MIN_ASPECT ? 'split' : 'swipe';
  const hud = R(0, 0, W, HUD_H);
  const tabs = mode === 'swipe'
    ? { hall: R(W - 2 * TAB_W, 0, TAB_W, HUD_H), kitchen: R(W - TAB_W, 0, TAB_W, HUD_H) }
    : null;
  const stage = R(0, HUD_H, W, H - HUD_H);
  let hallStage = stage, kitchenStage = stage;
  if (mode === 'split') {
    const hw = Math.round(W * 0.44);
    hallStage = R(0, HUD_H, hw, stage.h);
    kitchenStage = R(hw, HUD_H, W - hw, stage.h);
  }
  const menu = R(0, 0, HUD_H, HUD_H);   // кнопка меню — слева в шапке на всех экранах
  return {
    W, H, mode, hud, menu, tabs, stage, cfg: c,
    hall: hallLayout(hallStage, c.seats),
    kitchen: kitchenLayout(kitchenStage, c),
    morning: morningLayout(stage, c),
    scene: sceneLayout(stage),
  };
}

// Зал (шаг 3д): стойка внизу во всю ширину, гости у стойки крупно по краям — середина открыта в
// зал; столы на двоих рядом в глубине, над головами гостей стойки. Размеры гостей — от ширины
// колонки, задник занимает всё, что выше. base — линия, по которую гостя закрывает стойка или
// стол; scale — масштаб фигуры (за столом мельче — дальше).
function hallLayout(S, seats) {
  const plan = seatPlan(seats);
  const pad = Math.max(6, S.w * 0.02);
  const counterH = clamp(S.h * 0.16, 48, 120);
  const counter = R(S.x, S.y + S.h - counterH, S.w, counterH);
  const cols = columns(R(S.x + pad, S.y, S.w - 2 * pad, S.h), 3, pad);
  // Высокий кадр (портрет): у стойки не больше двух гостей — им отдаём по половине ширины, и
  // лица крупнее; стена уходит в узкую полосу (разбор 2026-10-07, п. 11: было 14% высоты на людей).
  const tall = S.h > S.w * 1.25;
  const halves = columns(R(S.x + pad, S.y, S.w - 2 * pad, S.h), 2, pad);
  const scale = tall
    ? Math.min(halves[0].w / GUEST_UNITS_W, ((S.h - counterH) * 0.42) / GUEST_UNITS_H)
    : Math.min(cols[0].w / GUEST_UNITS_W, ((S.h - counterH) * 0.5) / GUEST_UNITS_H);
  const guestTop = counter.y - GUEST_UNITS_H * scale;
  const nCounter = plan.filter(p => p.kind === 'counter').length;
  const counterCells = tall ? halves : nCounter === 1 ? [cols[0]] : [cols[0], cols[2]];
  // Столы: в ряд по ширине, над гостями стойки; стол закрывает гостей по пояс.
  const nTables = Math.max(0, ...plan.map(p => p.table + 1));
  const tableH = Math.max(10, 16 * Math.min(scale, 1.2) * 0.6);
  const rowW = S.w - 4 * pad, slotW = rowW / Math.max(nTables, 2);
  const ts = Math.min(scale * (tall ? 0.5 : 0.62), (slotW / HALL.table) / GUEST_UNITS_W * 1.1);
  const base = guestTop - 4;
  const tables = Array.from({ length: nTables }, (_, k) => {
    const w = slotW * 0.96, cx = S.x + 2 * pad + (nTables === 1 ? rowW / 2 : slotW * (k + 0.5) + (rowW - slotW * nTables) / 2);
    return R(cx - w / 2, base, w, tableH);
  });
  let counterK = 0;
  const list = plan.map((p, i) => {
    if (p.kind === 'counter') {
      const cell = counterCells[counterK++];
      return {
        kind: 'counter', table: -1, cx: cell.x + cell.w / 2, base: counter.y, scale, top: guestTop,
        guest: R(cell.x, guestTop, cell.w, counter.y - guestTop),
        spot: R(cell.x, counter.y, cell.w, counterH),
        hit: R(cell.x, guestTop, cell.w, counter.y + counterH - guestTop),
      };
    }
    const t = tables[p.table], side = plan.filter((q, j) => j < i && q.table === p.table).length;
    const cellW = t.w / HALL.table, x = t.x + cellW * side, top = base - GUEST_UNITS_H * ts;
    return {
      kind: 'table', table: p.table, cx: x + cellW / 2, base, scale: ts, top,
      guest: R(x, top, cellW, base - top),
      spot: R(x, base, cellW, tableH),
      // цель кончается над гостями стойки: цели одного экрана не пересекаются
      hit: R(x, top, cellW, Math.min(base + tableH, guestTop) - top),
    };
  });
  return {
    stage: S, counter, guestTop, scale, tables,
    back: R(S.x, S.y, S.w, counter.y - S.y),
    tableTop: list.filter(s => s.kind === 'table').reduce((m, s) => Math.min(m, s.top), guestTop),
    seats: list,
  };
}

// Сверху вниз: окно раздачи → планка тикетов → станции → доска → кладовая.
// В широкой кухне доска и кладовая уходят колонкой вправо, станции берут всю высоту.
function kitchenLayout(S, c) {
  const wide = S.w / S.h >= 1.3;
  const pad = Math.max(6, Math.min(S.w, S.h) * 0.02);
  const main = wide ? R(S.x, S.y, S.w * 0.6, S.h) : S;
  const side = wide ? R(S.x + S.w * 0.6, S.y, S.w * 0.4, S.h) : null;

  const hatch = R(main.x + pad, main.y + pad, main.w - 2 * pad, clamp(S.h * 0.15, 60, 110));
  const faces = columns(hatch, c.hatch, pad).map(cell => {
    const d = Math.min(cell.w, cell.h) - 8;
    return R(cell.x + (cell.w - d) / 2, cell.y + (cell.h - d) / 2, d, d);
  });
  const rail = R(hatch.x, hatch.y + hatch.h + pad / 2, hatch.w, clamp(S.h * 0.11, 44, 80));
  const tickets = columns(rail, c.hatch, pad);
  const below = rail.y + rail.h + pad;
  const n = c.pantry.length;

  let stations, board, pantryBox;
  if (wide) {
    stations = R(main.x + pad, below, main.w - 2 * pad, main.y + main.h - below - pad);
    const pantryH = clamp(side.h * 0.34, 2 * MIN_TARGET + pad, 200);
    pantryBox = R(side.x + pad, side.y + side.h - pantryH - pad, side.w - 2 * pad, pantryH);
    board = R(side.x + pad, side.y + pad, side.w - 2 * pad, pantryBox.y - side.y - 2 * pad);
  } else {
    stations = R(S.x + pad, below, S.w - 2 * pad, clamp(S.h * 0.2, 90, 170));
    const pantryH = n > 4 ? clamp(S.h * 0.2, 2 * MIN_TARGET + pad, 180) : clamp(S.h * 0.12, 56, 96);
    pantryBox = R(S.x + pad, S.y + S.h - pantryH - pad, S.w - 2 * pad, pantryH);
    const top = stations.y + stations.h + pad;
    board = R(S.x + pad, top, S.w - 2 * pad, pantryBox.y - top - pad);
  }
  const withCauldron = c.cauldronSlots > 0;
  const parts = split(stations, withCauldron ? [0.27, 0.37, 0.2, 0.16] : [0.34, 0.46, 0.2], pad);
  const barrel = parts[0], hearthBox = parts[1], bucket = parts[parts.length - 1];
  const cauldronBox = withCauldron ? parts[2] : null;
  const cookers = [
    ...grid(hearthBox, c.hearthSlots, pad).map(r => ({ station: 'hearth', r })),
    ...(cauldronBox ? grid(cauldronBox, c.cauldronSlots, pad) : []).map(r => ({ station: 'cauldron', r })),
  ];
  const cells = wide
    ? rows(pantryBox, 2, pad).flatMap(r => columns(r, Math.ceil(n / 2), pad))
    : rows(pantryBox, Math.ceil(n / 4), pad).flatMap(r => columns(r, Math.min(n, 4), pad));
  // Доска делится на колоду для нарезки и место под тарелку (шаг 3г): в широкой доске колода
  // слева, в высокой — сверху. Цель «доска» — только место тарелки, колода — своя цель.
  const across = board.w >= board.h;
  const block = across ? R(board.x, board.y, board.w * 0.36, board.h) : R(board.x, board.y, board.w, board.h * 0.36);
  const plateArea = across ? R(block.x + block.w + pad, board.y, board.w - block.w - pad, board.h) : R(board.x, block.y + block.h + pad, board.w, board.h - block.h - pad);
  const d = Math.min(plateArea.w, plateArea.h) * 0.86;
  return {
    stage: S, wide, pad, hatch, faces, rail, tickets, stations, barrel, hearthBox, cauldronBox, cookers, bucket, board, block, plateArea,
    plate: R(plateArea.x + (plateArea.w - d) / 2, plateArea.y + (plateArea.h - d) / 2, d, d),
    pantry: c.pantry.map((id, k) => ({ id, r: cells[k] })),
  };
}

// Утро: карта маршрутов, карточки искателей, полоса команды (когда есть помощники), лавка,
// кнопка «Открыть таверну». В широком кадре карта с искателями — слева, лавка — справа, полоса
// команды — под лавкой. Карточка искателя — столбиком: портрет 48, имя, статус в две строки;
// не пришедшие искатели — одной карточкой «скоро придут» (c.joined — кто уже в таверне; без
// него каждому своя карточка). Лавка — по числу товаров c.shopN: строками во всю ширину, пока
// строка не ниже SHOP_ROW, иначе в два столбца.
export const AVATAR = 48;
export const CREW_CARD_H = 6 + AVATAR + 4 + 16 + 2 * 14 + 6;   // портрет, имя, две строки статуса
export const SHOP_ROW = 56;    // строка лавки во всю ширину: рисунок, имя с описанием, цена
const SHOP_ROW_MAX = 76;

function crewCards(crew, joined, pad) {
  const ids = SEEKERS.map(s => s.id);
  const inn = joined ? ids.filter(id => joined.includes(id)) : ids;
  const soon = joined ? ids.filter(id => !joined.includes(id)) : [];
  const cells = columns(crew, inn.length + (soon.length ? 1 : 0), pad);
  const list = inn.map((id, k) => ({ id, r: cells[k] }));
  if (soon.length) list.push({ id: soon[0], soon, r: cells[inn.length] });
  return list;
}

// Ячейки лавки и кнопка «Купить» на каждой: кнопка видна и нажимается только у выделенной.
// В строке во всю ширину кнопка справа на месте цены; в узкой карточке — правее рисунка.
function shopGrid(shop, n, pad) {
  const one = n > 0 && (shop.h - pad * (n - 1)) / n >= SHOP_ROW;
  const cols = one ? 1 : 2, nr = Math.ceil(n / cols);
  const h = nr ? Math.min(SHOP_ROW_MAX, (shop.h - pad * (nr - 1)) / nr) : 0;
  const cells = Array.from({ length: n }, (_, k) => {
    const w = (shop.w - pad * (cols - 1)) / cols;
    return R(shop.x + (k % cols) * (w + pad), shop.y + Math.floor(k / cols) * (h + pad), w, h);
  });
  const buy = cells.map(r => {
    const bh = Math.min(r.h, Math.max(MIN_TARGET, Math.min(52, r.h - 10)));
    const by = r.y + (r.h - bh) / 2;
    if (one) { const bw = Math.min(160, r.w * 0.42); return R(r.x + r.w - bw - (r.h - bh) / 2, by, bw, bh); }
    const icon = shopIcon(r, false), bx = icon.x + icon.w + 6;
    return R(bx, by, r.x + r.w - 5 - bx, bh);
  });
  return { cells, buy, wideRows: one, rowH: h };
}

// Квадрат под рисунок товара слева в карточке: в строке — по середине высоты, в узкой карточке —
// сверху, под ним цена. Низкая узкая карточка (shopCompact, 8 товаров на маленьком телефоне) —
// рисунок по середине, цена уходит в текст.
const SHOP_FULL = 60;
export const shopCompact = (r, wideRow) => !wideRow && r.h < SHOP_FULL;
export function shopIcon(r, wideRow) {
  const mid = wideRow || shopCompact(r, wideRow);
  const s = Math.max(16, Math.min(56, r.h - 12 - (mid ? 0 : 15)));
  return R(r.x + 6, mid ? r.y + (r.h - s) / 2 : r.y + 6, s, s);
}

function morningLayout(S, c) {
  const staffN = c.staff || 0, n = c.shopN ?? SHOP_SLOTS;
  const wide = S.w / S.h >= 1.2;
  const pad = Math.max(8, Math.min(S.w, S.h) * 0.025);
  const button = R(S.x + pad, S.y + S.h - 56 - pad, S.w - 2 * pad, 56);
  const top = S.y + pad, bodyH = button.y - pad - top;
  // Сначала с полосой команды; если с ней строки лавки мельче цели для пальца, полоса уходит:
  // она только показывает жалованье, а товары должны нажиматься.
  const build = (withStaff, cut = 0) => {
    const stripH = withStaff ? STAFF_STRIP + pad : 0;
    let map, crew, shop, staff = null;
    if (wide) {
      const colW = (S.w - 3 * pad) / 2;
      const mapH = clamp(bodyH - pad - CREW_CARD_H, Math.min(120, bodyH * 0.5), bodyH * 0.62);
      map = R(S.x + pad, top, colW, mapH);
      crew = R(S.x + pad, map.y + map.h + pad, colW, bodyH - map.h - pad);
      shop = R(S.x + 2 * pad + colW, top, colW, bodyH - stripH);
      if (withStaff) staff = R(shop.x, shop.y + shop.h + pad, colW, STAFF_STRIP);
    } else {
      map = R(S.x + pad, top, S.w - 2 * pad, clamp(S.h * 0.24, 120, 240) - cut);
      crew = R(S.x + pad, map.y + map.h + pad, S.w - 2 * pad, CREW_CARD_H + stripH);
      if (withStaff) staff = R(crew.x, crew.y + crew.h - STAFF_STRIP, crew.w, STAFF_STRIP);
      const shopTop = crew.y + crew.h + pad;
      shop = R(S.x + pad, shopTop, S.w - 2 * pad, button.y - pad - shopTop);
    }
    return { map, crew, shop, staff, grid: shopGrid(shop, n, pad) };
  };
  let B = build(staffN > 0);
  if (B.staff && n && B.grid.rowH < MIN_TARGET) B = build(false);
  // карточки лавки сжались бы до низких (описание в одну обрезанную строку) — описание товара
  // важнее полосы жалованья: полоса уходит, если без неё карточки становятся полными
  // (в высоком кадре карта при этом уступает до 16 px)
  else if (B.staff && n && !B.grid.wideRows && B.grid.rowH < SHOP_FULL) {
    let no = build(false);
    if (!wide && !no.grid.wideRows && no.grid.rowH < SHOP_FULL) no = build(false, Math.min(16, Math.ceil((SHOP_FULL - no.grid.rowH) * Math.ceil(n / 2))));
    if (no.grid.wideRows || no.grid.rowH >= SHOP_FULL) B = no;
  }
  // и всё ещё мелко (8 товаров на 320 × 568) — карта в высоком кадре уступает недостающее
  if (!wide && n && B.grid.rowH < MIN_TARGET) {
    const nr = B.grid.wideRows ? n : Math.ceil(n / 2);
    B = build(!!B.staff, Math.min(16, Math.ceil((MIN_TARGET - B.grid.rowH) * nr)));
  }
  const { map, crew, shop, staff, grid: G } = B;
  const d = clamp(Math.min(map.w, map.h) * 0.25, MIN_TARGET, 88);
  // Точки маршрутов в порядке ROUTES: лес, топи, руины, горы, край Хмари — зигзагом, чтобы
  // подписи под соседними кругами не ложились друг на друга.
  const SPOTS = [[0.12, 0.6], [0.33, 0.26], [0.53, 0.6], [0.74, 0.26], [0.9, 0.6]];
  const routes = ROUTES.map((route, k) => {
    const [fx, fy] = SPOTS[k];
    const x = clamp(map.x + map.w * fx - d / 2, map.x, map.x + map.w - d);
    const y = clamp(map.y + map.h * fy - d / 2, map.y, map.y + map.h - d);
    return { id: route.id, r: R(x, y, d, d) };
  });
  // Полоса команды только показывает, не нажимается.
  const cardsBox = staff && !wide ? R(crew.x, crew.y, crew.w, crew.h - STAFF_STRIP - pad) : crew;
  return {
    stage: S, wide, pad, map, routes, crew, shop, button, staff,
    seekers: crewCards(cardsBox, c.joined, pad),
    shopCells: G.cells, shopBuy: G.buy, shopWideRows: G.wideRows,
  };
}

// Сцена: говорящий крупно, плашка с текстом, «Пропустить». В высоком кадре говорящий над
// плашкой, в широком — слева от неё во всю высоту. back — зал на весь кадр для фона.
function sceneLayout(S) {
  const wide = S.w / S.h >= 1.2;
  const pad = Math.max(10, Math.min(S.w, S.h) * 0.03);
  const skip = R(S.x + S.w - pad - 140, S.y + pad, 140, MIN_TARGET);
  let portrait, box;
  if (wide) {
    const colW = Math.min(S.w * 0.36, 380), bx = S.x + pad + colW + pad, bh = clamp(S.h * 0.32, 120, 200);
    portrait = R(S.x + pad, S.y + pad, colW, S.h - 2 * pad);
    box = R(bx, S.y + S.h - bh - pad, S.x + S.w - pad - bx, bh);
  } else {
    const bh = clamp(S.h * 0.28, 120, 240), top = skip.y + skip.h + pad;
    box = R(S.x + pad, S.y + S.h - bh - pad, S.w - 2 * pad, bh);
    portrait = R(S.x + pad, top, S.w - 2 * pad, box.y - top);
  }
  return { stage: S, wide, pad, skip, portrait, box, back: hallLayout(S, RULES.seats) };
}

// Все цели для пальца; порядок важен — hitTest берёт первую подходящую.
export function targets(L) {
  const list = [];
  list.push({ screen: 'any', kind: 'menu', r: L.menu });
  if (L.tabs) {
    list.push({ screen: 'hud', kind: 'tab', id: 'hall', r: L.tabs.hall });
    list.push({ screen: 'hud', kind: 'tab', id: 'kitchen', r: L.tabs.kitchen });
  }
  L.hall.seats.forEach((s, i) => list.push({ screen: 'hall', kind: 'seat', i, r: s.hit }));
  const K = L.kitchen;
  K.faces.forEach((r, i) => list.push({ screen: 'kitchen', kind: 'face', i, r }));
  K.pantry.forEach(p => list.push({ screen: 'kitchen', kind: 'pantry', id: p.id, r: p.r }));
  K.cookers.forEach((c, i) => list.push({ screen: 'kitchen', kind: 'cooker', i, station: c.station, r: c.r }));
  list.push({ screen: 'kitchen', kind: 'barrel', r: K.barrel });
  list.push({ screen: 'kitchen', kind: 'bucket', r: K.bucket });
  list.push({ screen: 'kitchen', kind: 'block', r: K.block });
  list.push({ screen: 'kitchen', kind: 'board', r: K.plateArea });
  const M = L.morning;
  M.routes.forEach(p => list.push({ screen: 'morning', kind: 'route', id: p.id, r: p.r }));
  M.seekers.forEach(p => list.push({ screen: 'morning', kind: 'seeker', id: p.id, r: p.r }));
  M.shopCells.forEach((r, i) => list.push({ screen: 'morning', kind: 'shop', i, r }));
  list.push({ screen: 'morning', kind: 'open', r: M.button });
  list.push({ screen: 'scene', kind: 'skip', r: L.scene.skip });
  return list;
}

// На каком экране видна цель: меню — везде, вкладки шапки — только в смене.
export function onScreen(t, screen) {
  return t.screen === screen || t.screen === 'any' || (t.screen === 'hud' && (screen === 'hall' || screen === 'kitchen'));
}

// ui — состояние интерфейса (main.js): у выделенной карточки лавки (ui.shopSel) кнопка
// «Купить» лежит поверх карточки и попадается раньше неё.
export function hitTest(L, screen, x, y, ui = null) {
  const sel = ui?.shopSel, buy = screen === 'morning' && sel != null ? L.morning.shopBuy[sel] : null;
  if (buy && contains(buy, x, y)) return { screen: 'morning', kind: 'buy', i: sel, r: buy };
  return targets(L).find(t => onScreen(t, screen) && contains(t.r, x, y)) || null;
}

// В режиме свайпа экран один на весь stage — тот, что показан; рядом — по координате.
export function screenAt(L, current, x, y) {
  if (L.mode === 'swipe') return current;
  return contains(L.kitchen.stage, x, y) ? 'kitchen' : 'hall';
}

const label = t => t.kind + (t.i ?? t.id ?? '');

export function checkLayout(L) {
  const list = targets(L);
  const side = t => Math.min(t.r.w, t.r.h);
  const overlaps = [];
  for (const screen of ['hall', 'kitchen', 'morning', 'scene']) {
    const own = list.filter(t => onScreen(t, screen));
    for (let a = 0; a < own.length; a++) {
      for (let b = a + 1; b < own.length; b++) {
        if (overlap(own[a].r, own[b].r)) overlaps.push(`${label(own[a])}/${label(own[b])}`);
      }
    }
  }
  return {
    mode: L.mode,
    minTarget: Math.min(...list.map(side)),
    small: list.filter(t => side(t) < MIN_TARGET).map(label),
    overlaps,
    outside: list
      .filter(t => t.r.x < -0.5 || t.r.y < -0.5 || t.r.x + t.r.w > L.W + 0.5 || t.r.y + t.r.h > L.H + 0.5)
      .map(label),
    gameplay: (L.stage.w * L.stage.h) / (L.W * L.H),
  };
}
