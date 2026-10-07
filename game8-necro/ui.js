// DOM-интерфейс: панели, ввод, привязка к состоянию.
// Не знает, как рисуется кадр, и не содержит правил боя.

import { SCHOOLS, SCHOOL_IDS, UNDEAD,
         GRIMOIRE, grimoireStepCost, starsForDupes } from './data.js';
import { cardById, rankOf, schoolCount, pathBonus, needsReplace } from './cards.js';
import { spellCooldown } from './sim.js';
import { CHECKPOINT } from './economy.js';
import { spriteCanvas } from './sprites.js';
import { T } from './i18n.js';
import { UI_ICON } from './art/ui-icons.js';
import { CATALOG, KINDS, DECOR_SLOTS, isEquipped } from './cosmetics.js';

const $ = id => document.getElementById(id);
let H = {};                       // обработчики от main.js

// Канвас нельзя вставить в DOM дважды — каждому месту нужна своя копия
function copyOf(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.drawImage(src, 0, 0);
  return c;
}
const thumb = name => copyOf(spriteCanvas(name));
/* Иконки интерфейса — тайлы DCSS из art/ui-icons.js, того же набора, что персонажи.
   Своих пиксельных иконок (iconCanvas) больше не берём: рядом с тайлами 32×32 они
   читались заглушками, ровно как прежние матрицы персонажей. */
function ico(name, cls = '') {
  const i = document.createElement('img');
  i.src = UI_ICON[name];
  i.className = 'ico ' + cls;
  i.alt = '';
  i.draggable = false;
  return i;
}
// Плотность останков знаком: три слова «обычн./густ./крист.» не влезали в кучку
const DMARK = ['', '●', '◆', '✦'];

const hex = n => '#' + n.toString(16).padStart(6, '0');

export function init(handlers) {
  H = handlers;

  $('raise').addEventListener('click', () => H.onRaise());
  $('auto-fill').addEventListener('click', () => H.onAutoFill());
  $('batch10').addEventListener('click', () => H.onBatch());

  $('btn-grimoire').addEventListener('click', () => H.onGrimoire());
  $('btn-lich').addEventListener('click', () => H.onLich());
  $('btn-mute').addEventListener('click', () => H.onMute());
  $('grimoire-close').addEventListener('click', () => closeGrimoire());
  $('grimoire').addEventListener('click', e => { if (e.target.id === 'grimoire') closeGrimoire(); });
  $('lich-confirm').addEventListener('click', () => H.onLichConfirm());
  $('lich-cancel').addEventListener('click', () => closeLich());
  $('lich').addEventListener('click', e => { if (e.target.id === 'lich') closeLich(); });

  $('btn-help').addEventListener('click', () => openHelp());
  $('help-close').addEventListener('click', () => closeHelp());
  $('help').addEventListener('click', e => { if (e.target.id === 'help') closeHelp(); });

  $('btn-crypt').addEventListener('click', () => H.onCrypt());
  $('crypt-close').addEventListener('click', () => closeCrypt());
  $('crypt').addEventListener('click', e => { if (e.target.id === 'crypt') closeCrypt(); });

  $('btn-sheet').addEventListener('click', () => toggleSheet());
  $('sheet-close').addEventListener('click', () => toggleSheet(false));
  $('ad-recharge').addEventListener('click', () => H.onAdRecharge());
  $('ad-slot').addEventListener('click', () => H.onAdSlot());
  $('offer').addEventListener('click', () => H.onOffer());
  $('lich-x2').addEventListener('click', () => H.onLichConfirm(true));

  // Иконки кнопок разметки: data-icon, текст в дочернем span (его меняет i18n)
  for (const el of document.querySelectorAll('[data-icon]')) el.prepend(ico(el.dataset.icon));

  // Портрет некроманта: он живёт в интерфейсе, а не на сцене
  const face = $('necro-face');
  const bust = spriteCanvas('necroBust');
  face.width = bust.width; face.height = bust.height;
  const fx = face.getContext('2d');
  fx.imageSmoothingEnabled = false;
  fx.drawImage(bust, 0, 0);

  // Правая кнопка не должна открывать меню браузера — требование модерации
  window.addEventListener('contextmenu', e => e.preventDefault());
}

/* Выдвижной лист ритуала (портрет). Открыт — перекрывает бой, поэтому закрывается
   сам после успешного ритуала: держать его открытым незачем, а бой идёт всё время. */
export function toggleSheet(want) {
  const el = $('ritual-sheet');
  const open = want != null ? want : !el.classList.contains('open');
  el.classList.toggle('open', open);
  H.onSheet?.(open);
  return open;
}
export const sheetOpen = () => $('ritual-sheet').classList.contains('open');

/* Габариты интерфейса в пикселях — рендер кадрирует бой в свободный прямоугольник.
   Раньше сдвиг пирамиды камеры стоял константами (0.72/1.28), и раскладка с панелью
   любой другой высоты немедленно наезжала на бой. */
export function insets() {
  const hud = $('hud').getBoundingClientRect();
  const panel = $('panel').getBoundingClientRect();
  const sheet = $('ritual-sheet').getBoundingClientRect();
  const land = window.innerWidth > window.innerHeight * 1.15;
  if (land) {
    return { top: hud.height, bottom: 0, left: 0, right: Math.max(0, window.innerWidth - panel.left) };
  }
  // В портрете лист не учитываем: он временный, и бой не должен прыгать при его открытии
  const bottom = Math.max(0, window.innerHeight - panel.top -
    (sheet.height && $('ritual-sheet').classList.contains('open') ? sheet.height : 0));
  return { top: hud.height, bottom, left: 0, right: 0 };
}

/* Реакция на каст живёт здесь же: некромант — часть рамы, через которую смотрят
   на подземелье, поэтому и вспыхивает он в раме, а не в кадре. */
export function setCasting(active) {
  $('necro-face').parentElement.classList.toggle('casting', active);
}

/* ═══════════════ Лицо некроманта ═══════════════
   Окошко в шапке, как портрет в StarCraft: живёт и отвечает на то, что делает игрок.
   Базовый облик — череп из трёх тайлов-эмоций (решение пользователя 2026-10-07):
   проклинающий в покое, хохочущий на победе и удачном ритуале, плачущий на
   поражении. С надетым скином в окошке его бюст, и эмоцию несут свечение и встряска.
   Рамка растёт с лучшим ярусом за всю игру: камень, бронза, серебро, пламя. */
let face = null;                 // { skin, faces, skinUri, rank }
let faceTimer = 0;
const faceImgs = new Map();
function faceImg(uri) {
  // onload, а не decode(): тот в скрытой вкладке может не завершиться (см. main.js)
  if (!faceImgs.has(uri)) faceImgs.set(uri, new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = uri; }));
  return faceImgs.get(uri);
}

async function drawFace(mood) {
  if (!face) return;
  const skull = face.skin === 'occultist';
  const uri = skull ? (face.faces[mood] || face.faces.curse) : face.skinUri;
  const im = await faceImg(uri);
  const c = $('necro-face');
  // Скин показываем бюстом — верхние 20 строк тайла крупно; череп целиком
  const sh = skull ? 32 : 20;
  c.width = 32; c.height = sh;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  x.clearRect(0, 0, 32, sh);
  x.drawImage(im, 0, 0, 32, sh, 0, 0, 32, sh);
}

export function setFace(f) {
  face = f;
  const p = $('necro-face').parentElement;
  p.classList.remove('rank-0', 'rank-1', 'rank-2', 'rank-3');
  p.classList.add('rank-' + f.rank);
  return drawFace('curse');      // промис: вступление копирует лицо только после отрисовки
}

export function faceReact(mood, ms = 1400) {
  if (!face) return;
  const p = $('necro-face').parentElement;
  p.classList.remove('react-laugh', 'react-weep');
  void p.offsetWidth;                         // перезапуск анимации при повторной реакции
  p.classList.add('react-' + mood);
  drawFace(mood);
  clearTimeout(faceTimer);
  faceTimer = setTimeout(() => { p.classList.remove('react-' + mood); drawFace('curse'); }, ms);
}

/* ═══════════════ Вступление ═══════════════
   Три коротких экрана при первом запуске: кто ты, что происходит, что делать. Раньше
   игра начиналась с одного баннера «Герои спускаются. Армия дерётся сама», и что это
   за игра, игрок узнавал, только если сам разбирался в кнопках. Картинки на экранах:
   'n' — лицо некроманта из шапки, 'u:id'/'h:id' — спрайт нежити или героя, 'i:key' —
   иконка интерфейса. Тексты в i18n, здесь только показ. */
function introArt(token) {
  if (token === 'n') { const c = copyOf($('necro-face')); c.className = 'intro-face'; return c; }
  const [kind, id] = token.split(':');
  if (kind === 'i') return ico(id, 'intro-ico');
  return thumb(id);
}

export function openIntro(onDone) {
  let i = 0;
  const finish = () => { $('intro').classList.add('hidden'); onDone(); };
  const show = () => {
    const sl = T.intro.slides[i];
    const art = $('intro-art');
    art.textContent = '';
    for (const t of sl.art) art.appendChild(introArt(t));
    $('intro-title').textContent = sl.title;
    $('intro-text').textContent = sl.text;
    $('intro-dots').innerHTML = T.intro.slides.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    const last = i === T.intro.slides.length - 1;
    $('intro-next').textContent = last ? T.intro.go : T.intro.next;
    $('intro-skip').textContent = T.intro.skip;
    $('intro-skip').classList.toggle('hidden', last);
    // На последнем экране череп смеётся: дальше начинается его игра
    if (last) faceReact('laugh', 1800);
  };
  $('intro-next').onclick = () => { if (++i >= T.intro.slides.length) finish(); else show(); };
  $('intro-skip').onclick = finish;
  show();
  $('intro').classList.remove('hidden');
}

/* ═══════════════ Справочник ═══════════════
   Что это за игра и что делает каждая кнопка. Цифры в текстах взяты из кода
   (data.js, economy.js, sim.js): справочник, который врёт, хуже, чем никакой. */
export function openHelp() {
  const body = $('help-body');
  body.textContent = '';
  for (const sec of T.help) {
    const box = document.createElement('section');
    box.className = 'help-sec';
    const h = document.createElement('h3');
    h.textContent = sec.title;
    box.appendChild(h);
    if (sec.icons) {
      const row = document.createElement('div');
      row.className = 'help-icons';
      for (const k of sec.icons) row.appendChild(ico(k));
      box.appendChild(row);
    }
    if (sec.text) {
      const p = document.createElement('p');
      p.textContent = sec.text;
      box.appendChild(p);
    }
    if (sec.list) {
      for (const [icon, name, what] of sec.list) {
        const row = document.createElement('div');
        row.className = 'help-row';
        row.appendChild(icon ? ico(icon) : Object.assign(document.createElement('span'), { className: 'ico-blank' }));
        const t = document.createElement('div');
        t.innerHTML = '<b></b><small></small>';
        t.querySelector('b').textContent = name;
        t.querySelector('small').textContent = what;
        row.appendChild(t);
        box.appendChild(row);
      }
    }
    body.appendChild(box);
  }
  // Твои карточки: что уже взято в этом забеге и сколько даёт путь каждой школы
  if (lastDeck) {
    const box = document.createElement('section');
    box.className = 'help-sec';
    const h = document.createElement('h3');
    h.textContent = T.cards.yours;
    box.appendChild(h);
    const ids = Object.keys(lastDeck.picks);
    if (!ids.length) {
      const p = document.createElement('p');
      p.textContent = T.cards.none;
      box.appendChild(p);
    }
    for (const id of ids) {
      const c = cardById(id);
      if (!c) continue;
      const r = rankOf(lastDeck, id);
      const row = document.createElement('div');
      row.className = 'help-row';
      row.appendChild(ico(id));
      const t = document.createElement('div');
      t.innerHTML = '<b></b><small></small>';
      t.querySelector('b').textContent = T.cards.items[id].name + (c.max > 1 ? ' · ' + T.cards.rank(r, c.max) : '');
      t.querySelector('small').textContent = T.cards.items[id].text(r);
      row.appendChild(t);
      box.appendChild(row);
    }
    // Путь школы: сколько взято у каждой и какой бонус уже действует
    for (const s of SCHOOL_IDS) {
      const n = schoolCount(lastDeck, s);
      if (!n) continue;
      const row = document.createElement('div');
      row.className = 'help-row';
      row.appendChild(ico(s));
      const t = document.createElement('div');
      t.innerHTML = '<b></b><small></small>';
      t.querySelector('b').textContent = T.schoolName[s];
      t.querySelector('small').textContent = T.cards.path(n, Math.round(pathBonus(lastDeck, s) * 100));
      row.appendChild(t);
      box.appendChild(row);
    }
    body.appendChild(box);
  }
  H.onHelp?.(true);
  $('help').classList.remove('hidden');
}
export function closeHelp() { $('help').classList.add('hidden'); H.onHelp?.(false); }

/* ═══════════════ Выбор карточки ═══════════════
   Три карточки «каменной плитой»: иконка, школа, название, ранг, эффект. Заклинание
   при полных слотах открывает второй шаг: какое заменить, с кнопкой «Назад» — выбор
   не сгорает, можно взять другую карточку. */
export function openCards(ids, deck) {
  const showList = () => {
    $('cards-title').textContent = T.cards.title;
    $('cards-back').classList.add('hidden');
    const list = $('cards-list');
    list.textContent = '';
    for (const id of ids) {
      const c = cardById(id);
      if (!c) continue;
      const next = rankOf(deck, id) + 1;
      const el = document.createElement('button');
      el.className = 'card';
      el.style.setProperty('--school', hex(SCHOOLS[c.school].glow));
      const head = document.createElement('div');
      head.className = 'card-head';
      head.append(ico(c.school, 'card-school'));
      const kind = document.createElement('small');
      kind.textContent = T.cards.kind[c.kind];
      head.append(kind);
      el.append(head, ico(id, 'card-ico'));
      const name = document.createElement('b');
      name.textContent = T.cards.items[id].name;
      el.append(name);
      if (c.max > 1) {
        const r = document.createElement('i');
        r.className = 'card-rank';
        r.textContent = T.cards.rank(next, c.max);
        el.append(r);
      }
      const p = document.createElement('p');
      p.textContent = T.cards.items[id].text(next);
      el.append(p);
      el.addEventListener('click', () => (needsReplace(deck, id) ? showReplace(id) : H.onCardPick(id, null)));
      list.appendChild(el);
    }
  };
  const showReplace = id => {
    $('cards-title').textContent = T.cards.replaceTitle;
    const list = $('cards-list');
    list.textContent = '';
    for (const sp of deck.spells) {
      const el = document.createElement('button');
      el.className = 'card card-replace';
      el.append(ico(sp, 'card-ico'));
      const name = document.createElement('b');
      name.textContent = T.spells[sp].name;
      el.append(name);
      el.addEventListener('click', () => H.onCardPick(id, sp));
      list.appendChild(el);
    }
    const back = $('cards-back');
    back.textContent = T.cards.back;
    back.classList.remove('hidden');
    back.onclick = showList;
  };
  showList();
  $('cards').classList.remove('hidden');
}
export function closeCards() { $('cards').classList.add('hidden'); }

/* ═══════════════ Склеп ═══════════════ */
let cryptTab = 'necro';

function cryptPreview(it, packs) {
  const uri = (g, k) => packs[g]?.[k] ?? packs.extra?.[g]?.[k];
  const c = document.createElement('canvas');
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  if (it.kind === 'floor' || it.kind === 'wall') {
    // Кусок 3×2 из вариантов семейства — по одному тайлу семейство не узнать
    const list = uri(it.kind, it.key) || [];
    c.width = 96; c.height = 64;
    Promise.all(list.map(faceImg)).then(imgs => {
      for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) if (imgs.length) x.drawImage(imgs[(i * 7 + j * 3) % imgs.length], i * 32, j * 32);
    });
  } else {
    c.width = 32; c.height = 32;
    const u = uri(it.kind, it.key);
    if (u) faceImg(u).then(im => x.drawImage(im, 0, 0));
  }
  return c;
}

export function openCrypt(game, packs, tab) {
  if (tab) cryptTab = tab;
  const C = game.cosmetics;
  const tabs = $('crypt-tabs');
  tabs.textContent = '';
  for (const k of KINDS) {
    const b = document.createElement('button');
    b.className = 'mini-btn' + (k === cryptTab ? ' on' : '');
    b.textContent = T.crypt.tabs[k];
    b.addEventListener('click', () => openCrypt(game, packs, k));
    tabs.appendChild(b);
  }
  const list = $('crypt-list');
  list.textContent = '';
  if (cryptTab === 'decor') {
    const n = document.createElement('div');
    n.className = 'crypt-note';
    n.textContent = T.crypt.decorHint(DECOR_SLOTS);
    list.appendChild(n);
  }
  for (const it of CATALOG.filter(c => c.kind === cryptTab)) {
    const owned = C.owned.includes(it.id);
    const on = isEquipped(C, it);
    const card = document.createElement('div');
    card.className = 'crypt-item' + (on ? ' on' : '') + (owned ? '' : ' locked');
    card.appendChild(cryptPreview(it, packs));
    const name = document.createElement('b');
    name.textContent = T.crypt.items[it.key];
    card.appendChild(name);
    const btn = document.createElement('button');
    if (owned) {
      btn.className = 'mini-btn';
      btn.textContent = on ? (it.kind === 'decor' ? T.crypt.unequip : T.crypt.equipped) : T.crypt.equip;
      btn.disabled = on && it.kind !== 'decor';
      btn.addEventListener('click', () => H.onCryptEquip(it.id));
      card.appendChild(btn);
    } else {
      btn.className = 'mini-btn ad';
      btn.textContent = T.crypt.ad(C.views[it.id] || 0, it.ads);
      btn.addEventListener('click', () => H.onCryptAd(it.id));
      card.appendChild(btn);
      const need = document.createElement('small');
      need.textContent = it.need.tier != null ? T.crypt.needTier(it.need.tier) : T.crypt.needLich(it.need.lich);
      card.appendChild(need);
    }
    list.appendChild(card);
  }
  $('crypt').classList.remove('hidden');
}
export function closeCrypt() { $('crypt').classList.add('hidden'); }

/* ═══════════════ Останки ═══════════════ */
export function renderRemains(game) {
  const hud = $('remains-hud');
  hud.textContent = '';
  for (const s of SCHOOL_IDS) {
    const total = game.remains[s].reduce((a, b) => a + b, 0);
    const chip = document.createElement('div');
    chip.className = 'rem-chip';
    chip.append(ico(s));
    const n = document.createElement('b'); n.textContent = total; chip.append(n);
    chip.title = T.remains[s];
    hud.appendChild(chip);
  }

  const stock = $('stock');
  stock.textContent = '';
  for (const s of SCHOOL_IDS) {
    const col = document.createElement('div');
    col.className = 'stock-col';
    col.title = T.remains[s];
    col.appendChild(ico(s, 'pile'));
    const label = document.createElement('span');
    label.textContent = T.remains[s];
    col.appendChild(label);
    for (let d = 1; d <= 3; d++) {
      const n = game.remains[s][d];
      const chip = document.createElement('div');
      chip.className = 'dchip' + (n ? '' : ' zero');
      chip.textContent = `${DMARK[d]} ${n}`;
      chip.title = `${T.remains[s]} · ${T.density[d]}`;
      if (n) chip.addEventListener('click', () => H.onAddRemains(s, d));
      col.appendChild(chip);
    }
    stock.appendChild(col);
  }
}

/* ═══════════════ Ритуальный круг ═══════════════ */
export function renderCircle(game) {
  const c = $('circle');
  c.textContent = '';
  game.ritual.forEach((slot, i) => {
    const el = document.createElement('div');
    el.className = 'cslot' + (slot ? ' filled' : '');
    if (slot) {
      el.append(ico(slot.school));
      const m = document.createElement('i'); m.className = 'dmark'; m.textContent = DMARK[slot.density]; el.append(m);
      el.title = `${T.remains[slot.school]} · ${T.density[slot.density]}`;
      el.style.setProperty('--glow', hex(SCHOOLS[slot.school].glow));
      el.addEventListener('click', () => H.onClearSlot(i));
    } else {
      el.title = T.empty;
    }
    c.appendChild(el);
  });
  $('raise').disabled = game.ritual.some(s => !s);
}

/* ═══════════════ Армия ═══════════════ */
let lastSwap = null;     // выделенный в казарме кандидат на замену; помним между кадрами
export function renderArmy(game, battle, swap = lastSwap) {
  lastSwap = swap;
  const box = $('army');
  box.textContent = '';
  game.army.forEach((entry, i) => {
    const el = document.createElement('div');
    el.className = 'slot' + (entry ? '' : ' empty') + (swap ? ' swap-target' : '');
    if (entry) {
      const def = UNDEAD[entry.defId];
      /* Полоска школы поверх слота. Круг преимуществ — центральная механика, но состав
         армии по школам не читался нигде: спрайты в темноте похожи, а имена только в
         title. Четыре цвета сверху дают состав одним взглядом. */
      const school = document.createElement('div');
      school.className = 'slot-school';
      school.style.background = hex(SCHOOLS[def.school].glow);
      el.appendChild(school);
      // Тир точками — видно, что T4 в строю, без открытия списка
      const tier = document.createElement('div');
      tier.className = 'slot-tier';
      tier.textContent = '•'.repeat(def.tier);
      el.appendChild(tier);
      el.appendChild(thumb(def.sprite));
      const st = document.createElement('div');
      st.className = 'stars';
      st.textContent = '★'.repeat(entry.stars);
      el.appendChild(st);
      // Посмертный спавн громилы делит слот с погибшим хозяином — панель его не показывает
      const unit = battle && battle.undead.find(u => u.slot === i && !u.spawned);
      const frac = unit ? Math.max(0, unit.hp / unit.maxHp) : (entry.hpFrac ?? 1);
      const hp = document.createElement('div');
      hp.className = 'hpline';
      hp.style.width = (frac * 100) + '%';
      hp.style.background = unit && !unit.alive ? '#5a2030' : '#74d05a';
      el.appendChild(hp);
      el.title = `${T.units[def.id]} · ${T.schoolName[def.school]}`;
    }
    el.addEventListener('click', () => H.onSlotTap(i));
    box.appendChild(el);
  });
}

/* ═══════════════ Казарма ═══════════════
   Все поднятые виды разом: кто в строю — в зелёной рамке, кто ждёт — без. Тап ставит
   или убирает (решает main.js). Пустой казарма не бывает: стартовые двое уже подняты. */
export function renderBarracks(game, swap) {
  const box = $('barracks');
  box.textContent = '';
  const ids = Object.keys(game.raised).sort((a, b) =>
    SCHOOL_IDS.indexOf(UNDEAD[a].school) - SCHOOL_IDS.indexOf(UNDEAD[b].school) || UNDEAD[a].tier - UNDEAD[b].tier);
  for (const id of ids) {
    const def = UNDEAD[id];
    const inLine = game.army.some(e => e && e.defId === id);
    const el = document.createElement('div');
    el.className = 'bunit' + (inLine ? ' in' : '') + (swap === id ? ' pick' : '') + (swap && inLine ? ' swap-target' : '');
    el.style.setProperty('--school', hex(SCHOOLS[def.school].glow));
    el.appendChild(thumb(def.sprite));
    const st = document.createElement('i');
    st.textContent = '★'.repeat(starsForDupes(game.raised[id] ?? 0));
    el.appendChild(st);
    el.title = `${T.units[id]} · ${T.schoolName[def.school]}`;
    el.addEventListener('click', () => H.onBarracksTap(id));
    box.appendChild(el);
  }
}

/* Тап по слоту армии ведёт в казарму: в портрете открывает лист, в альбоме казарма и
   так на виду — её просто подсвечиваем, чтобы глаз нашёл, куда смотреть. */
export function focusBarracks() {
  const sheet = $('ritual-sheet');
  if (getComputedStyle(sheet).position === 'fixed' && !sheet.classList.contains('open')) toggleSheet(true);
  const box = $('barracks-block');
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  box.classList.remove('flash'); void box.offsetWidth; box.classList.add('flash');
}

// «Разложить» и ×10 видны только когда заслужены (unlocks в main.js)
export function renderUnlocks(u) {
  $('auto-fill').classList.toggle('hidden', !u.auto);
  $('batch10').classList.toggle('hidden', !u.batch);
}

/* ═══════════════ Гримуар ═══════════════ */
export function openGrimoire(game) {
  $('grim-essence').textContent = game.essence;
  const list = $('grimoire-list');
  list.textContent = '';
  for (const node of GRIMOIRE) {
    const bought = game.grimoire[node.id] || 0;
    const maxed = bought >= node.steps;
    const cost = maxed ? 0 : grimoireStepCost(node, bought);

    const row = document.createElement('div');
    row.className = 'grim-item' + (maxed ? ' maxed' : '');

    const left = document.createElement('div');
    left.className = 'grim-text';
    const loc = T.grim[node.id];
    const name = document.createElement('b');
    name.textContent = `${loc.name} · ${bought}/${node.steps}`;
    const eff = document.createElement('small');
    eff.textContent = loc.fmt(Math.max(1, bought));
    left.appendChild(name);
    left.appendChild(eff);
    row.appendChild(left);

    const btn = document.createElement('button');
    btn.className = 'grim-buy';
    btn.textContent = maxed ? T.maxed : `${cost} ${T.ess}`;
    btn.disabled = maxed || game.essence < cost;
    if (!maxed) btn.addEventListener('click', () => H.onGrimoireBuy(node.id));
    row.appendChild(btn);

    list.appendChild(row);
  }
  $('grimoire').classList.remove('hidden');
}
export function closeGrimoire() { $('grimoire').classList.add('hidden'); }

/* ═══════════════ Ритуал лича ═══════════════ */
export function openLich(game, gain, adReady) {
  $('lich-text').innerHTML = T.msg.lichText(game.maxTier, gain);
  $('lich-x2').classList.toggle('hidden', !adReady);
  $('lich').classList.remove('hidden');
}
export function closeLich() { $('lich').classList.add('hidden'); }

/* ═══════════════ Подсказки туториала ═══════════════ */
let hintTarget = null;
export function hint(text, sel) {
  clearHint();
  const el = $('hint');
  el.textContent = text;
  el.classList.remove('hidden');
  if (sel) {
    hintTarget = document.querySelector(sel);
    if (hintTarget) hintTarget.classList.add('tut-pulse');
  }
}
export function clearHint(sel) {
  if (sel && hintTarget !== document.querySelector(sel)) return;
  $('hint').classList.add('hidden');
  if (hintTarget) { hintTarget.classList.remove('tut-pulse'); hintTarget = null; }
}

/* ═══════════════ Полоса и баннер ═══════════════ */
export function renderHud(game) {
  $('tier').textContent = game.tier;
  $('party').textContent = game.partyIndex;
  renderRaidTrack(game);
  const ess = $('essence-chip');
  if (game.essence > 0 || game.lichUnlocked || Object.keys(game.grimoire).length) {
    ess.classList.remove('hidden');
    ess.querySelector('b').textContent = game.essence;
  } else ess.classList.add('hidden');
  $('btn-lich').classList.toggle('hidden', !game.lichUnlocked);
  $('btn-mute').textContent = game.muted ? T.soundOff : T.soundOn;
  $('btn-mute').classList.toggle('off', game.muted);
}

/* Рекламная кнопка показывается только когда предложение уместно: слот круга — пока
   узел не куплен. Модерация не любит мёртвых кнопок, а игрок — предложений, которые
   ничего не дают. Перезарядка живёт в tickSpells: она зависит от кулдауна, то есть
   меняется каждый кадр, а не на событиях прогресса. */
export function renderAds({ slotOffer }) {
  $('ad-slot').classList.toggle('hidden', !slotOffer);
}

// Крупное предложение поверх сцены: удвоить добычу чемпиона, спасти рейд
let offerTimer = 0;
export function showOffer(textKey, ms = 7000) {
  const b = $('offer');
  b.textContent = T[textKey];
  b.classList.remove('hidden');
  clearTimeout(offerTimer);
  offerTimer = setTimeout(hideOffer, ms);
}
export function hideOffer() { clearTimeout(offerTimer); offerTimer = 0; $('offer').classList.add('hidden'); }
export const offerVisible = () => !$('offer').classList.contains('hidden');

export function hideLoading() { $('loading').classList.add('hidden'); }

/* Баннеры выстраиваются в ОЧЕРЕДЬ, а не перетирают друг друга. Раньше сообщение
   с равным правом затирало предыдущее в тот же кадр, и события, приходящие парами,
   игрок не видел вовсе: ежедневный бонус съедал старт партии, «ритуал лича доступен» —
   баннер отбитого рейда, то есть два самых крупных мета-события в игре.
   soft-баннеры (тап по юниту) очередь не занимают: они справочные и частые. */
/* Полоса рейда: десять засечек вместо «Партия 3/10». Числом не читается ни структура
   рейда, ни то, что впереди: пятая партия усиленная, десятая — чемпион, а проигрыш
   откатывает к точке после пятой. Засечки показывают всё это без единого слова. */
function renderRaidTrack(game) {
  const box = $('raid-track');
  if (!box.children.length) {
    for (let i = 1; i <= 10; i++) {
      const t = document.createElement('i');
      if (i === CHECKPOINT) t.className = 'mid';
      if (i === 10) t.className = 'champ';
      box.appendChild(t);
    }
  }
  [...box.children].forEach((t, idx) => {
    const i = idx + 1;
    t.classList.toggle('done', i < game.partyIndex);
    t.classList.toggle('now', i === game.partyIndex);
  });
}

let bannerTimer = 0;
const bannerQueue = [];

export function banner(text, kind, ms = 1600, opts = {}) {
  if (opts.soft && bannerTimer) return;
  bannerQueue.push({ text, kind, ms });
  if (!bannerTimer) pumpBanner();
}

function pumpBanner() {
  const item = bannerQueue.shift();
  const b = $('banner');
  if (!item) { bannerTimer = 0; b.classList.add('hidden'); return; }
  b.textContent = item.text;
  b.className = 'banner ' + (item.kind || '');
  bannerTimer = setTimeout(pumpBanner, item.ms || 1600);
}

/* ═══════════════ Заклинания ═══════════════
   Кнопки строятся по колоде: от одной (старт, только шквал) до четырёх. Перестройка
   только когда сменился набор или язык: refreshAll зовётся на каждый тап, и
   пересоздание кнопок сбивало бы нажатие и пульс подсказки туториала. */
let spellSig = '';
let lastDeck = null;
export function renderSpells(deck) {
  lastDeck = deck;
  const sig = deck.spells.join(',') + '|' + T.title;
  if (sig === spellSig) return;
  spellSig = sig;
  const box = $('spells');
  box.textContent = '';
  for (const id of deck.spells) {
    const b = document.createElement('button');
    b.className = 'spell';
    b.dataset.spell = id;
    b.innerHTML = `<b class="cdn"></b><span></span><small></small><i class="cd"></i>`;
    b.insertBefore(ico(id), b.firstChild);
    b.querySelector('span').textContent = T.spells[id].name;
    b.querySelector('small').textContent = T.spells[id].hint;
    b.addEventListener('click', () => H.onSpell(id));
    box.appendChild(b);
  }
}

/* Каждый кадр: своя перезарядка у каждой кнопки (решение пользователя 2026-10-07). */
export function tickSpells(battle) {
  const live = battle && !battle.over;
  let anyCd = false;
  for (const b of document.querySelectorAll('.spell')) {
    const id = b.dataset.spell;
    const cd = live ? (battle.spellCds[id] || 0) : 0;
    if (cd > 0) anyCd = true;
    const ready = live && cd <= 0;
    b.disabled = !ready;
    b.querySelector('.cdn').textContent = live && cd > 0 ? Math.ceil(cd) : '';
    const total = live ? spellCooldown(battle, id) : 1;
    b.querySelector('.cd').style.width = ready ? '100%' : live ? ((1 - cd / total) * 100) + '%' : '0%';
  }
  // Предложение перезарядки — ровно пока есть что перезаряжать
  $('ad-recharge').classList.toggle('hidden', !anyCd);
}

/* Открыто вступление, справочник или выбор карточки — бой стоит. Возврат на вкладку и
   конец рекламы снимают паузу через эту проверку, иначе бой шёл бы под открытым окном. */
export const modalHold = () => ['intro', 'help', 'cards'].some(id => !$(id).classList.contains('hidden'));
