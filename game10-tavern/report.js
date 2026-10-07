// «Таверна у края Хмари» — отчёт конца смены как награда (AUDIT.md п. 9).
// DOM поверх канваса, как прежний ui.js showReport: крупный текст и настоящие кнопки,
// кнопка рекламы «Удвоить» обязана быть DOM-кнопкой.
//
// showReport(sum, onNext, out, double, extra)
//   sum    — shift.summary();  out — { feast, wages } из meta.applyShift;
//   double — null или (done(total), fail()) для «Удвоить выручку за рекламу»;
//   extra  — необязательно: { stars, best, record, prev, bank, fame: {now, goal}, teaser, line,
//            streakBest, sound(name, opts) }. Без extra отчёт ведёт себя как прежний.
// «Дальше» вызывает onNext() и отчёт сам не прячет: межстраничная идёт синхронно из onNext.
//
// Порядок показа: строки выезжают по очереди (CSS, 70 мс × i), выручка считается от нуля
// за 0,8 с с тиканьем монет, в конце звук итога, и только потом появляется «Удвоить».
// Чистые функции (reportModel, countAt, netGain, finalSound) проверяются тестом без DOM.

import { INGREDIENTS, SEEKERS } from './data.js';
import { FEAST_RETRY } from './story.js';
import { tr, tf } from './i18n.js';

export const COUNT_MS = 800;      // подсчёт выручки
export const STEP_MS = 70;        // задержка между строками
const TICK_MS = 70;               // как часто звенит монета при подсчёте

// Значение счётчика в момент t (мс) при подсчёте from → to: быстро в начале, мягко в конце.
export function countAt(from, to, t, dur = COUNT_MS) {
  if (t >= dur || dur <= 0) return to;
  if (t <= 0) return from;
  const k = 1 - Math.pow(1 - t / dur, 3);
  return Math.round(from + (to - from) * k);
}

// Сколько смена принесла в кассу: выручка плюс награда пира минус жалованье.
export function netGain(sum, out = {}, total = sum.coins) {
  const reward = out.feast?.ok ? (out.feast.reward?.coins || 0) : 0;
  return total + reward - (out.wages || 0);
}

// Звук в конце подсчёта: обычный день, пир удался, пир не удался.
export function finalSound(out = {}) {
  if (!out.feast) return 'levelup';
  return out.feast.ok ? 'fanfare' : 'fail';
}

// Всё, что показывает отчёт, без DOM: строки уже переведены.
export function reportModel(sum, out = {}, extra = null) {
  const x = extra || {};
  const feast = out.feast || null;
  const used = Object.entries(sum.used || {}).filter(([, n]) => n > 0)
    .map(([id, n]) => `${tr(INGREDIENTS[id]?.name ?? id)} ${n}`).join(', ');
  const fed = (sum.fed || []).map(id => SEEKERS.find(s => s.id === id)?.name).filter(Boolean).map(tr).join(', ');
  const fullHouse = !!extra && sum.left === 0 && sum.served > 0;
  const rows = [
    feast ? ['Накормлено', tf('{served} из {guests} (нужно {goal})', { served: sum.served, guests: feast.guests, goal: feast.goal })]
      : ['Накормлено гостей', sum.served],
    ...(fullHouse ? [] : [['Ушли голодными', sum.left]]),
    ['Выручка', sum.coins, 'coins'],
    ['из неё чаевые', sum.tips],
    ...(sum.autoCollected ? [['собрано со стойки само', sum.autoCollected]] : []),
    ['Слава', (sum.fame > 0 ? '+' : '') + sum.fame],
    ...(out.wages ? [['Жалованье', '−' + out.wages]] : []),
    ...(x.streakBest > 1 ? [['Лучшая серия точных подач', x.streakBest]] : []),
    ...(used ? [['Редкое в дело', used]] : []),
    ...(fed ? [['Сыты перед походом', fed]] : []),
    ...(feast?.ok ? [['Награда', tf('+{coins} монет, +{fame} славы', feast.reward)]] : []),
  ].map(([k, v, id]) => ({ label: tr(k), value: v, id: id || null }));
  const stars = extra && x.stars ? Math.max(1, Math.min(3, x.stars | 0)) : 0;
  const fame = x.fame && x.fame.goal > 0 ? {
    now: x.fame.now, goal: x.fame.goal, pct: Math.max(0, Math.min(100, Math.round(x.fame.now / x.fame.goal * 100))),
    text: x.fame.now >= x.fame.goal ? tr('Славы хватает на пир') : tf('До пира: слава {now} из {goal}', x.fame),
  } : null;
  return {
    title: tr(feast ? (feast.ok ? 'Пир удался!' : 'Пир не удался') : 'Смена окончена'),
    stars,
    rows,
    fullHouse,
    record: !!x.record,
    prev: extra && x.prev != null ? x.prev : null,
    net: extra ? netGain(sum, out) : null,
    bank: extra && x.bank != null ? x.bank : null,
    fame,
    teaser: x.teaser || null,
    line: x.line || null,
    note: feast && !feast.ok ? `«${tr(feast.hint)}» ${tr(FEAST_RETRY)}` : null,
    sound: finalSound(out),
  };
}

// Разметка собирается без вложенных шаблонных строк и с tr() вне шаблонов: так i18n-extract.mjs
// (простой разбор кавычек) видит каждую русскую строку целиком и не путается.
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '\x22': '&quot;' };
const esc = s => String(s).replace(/[&<>\x22]/g, c => ESC[c]);
const signed = n => (n >= 0 ? '+' : '−') + Math.abs(n);
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
const attr = (k, v) => ' ' + k + '="' + esc(v) + '"';

function compareHtml(prev, now) {
  const dir = now > prev ? 'up' : now < prev ? 'down' : 'same';
  const mark = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '';
  const text = esc(tf('Вчера {prev}, сегодня {now}', { prev, now }));
  return `${text} <i class="rep-dir rep-${dir}">${mark}</i>`;
}

function starsHtml(n) {
  if (!n) return '';
  const label = tf('Звёзд: {n} из 3', { n });
  const stars = [1, 2, 3].map(k => '<i class="' + (k <= n ? 'on' : 'off') + '" style="--s:' + k + '">★</i>').join('');
  return `<span class="rep-stars" role="img"${attr('aria-label', label)}>${stars}</span>`;
}

export function showReport(sum, onNext, out = {}, double = null, extra = null) {
  const el = document.getElementById('report');
  const m = reportModel(sum, out, extra);
  const play = (name, o) => { try { extra?.sound?.(name, o); } catch (e) { /* звук не обязателен */ } };
  const still = reduced();
  let i = 0;
  const pop = () => ' style="--i:' + (i++) + '"';
  const T = {
    hungry: esc(tr('Никто не ушёл голодным!')), record: esc(tr('Рекорд!')), cash: esc(tr('В кассу')),
    tomorrow: esc(tr('Завтра')), zhar: esc(tr('Жар')), double: esc(tr('Удвоить выручку за рекламу')), next: esc(tr('Дальше')),
  };

  const head = `<h2 class="rep-pop"${pop()}><span>${esc(m.title)}</span>${starsHtml(m.stars)}</h2>`;
  let coinsIdx = 0;
  const rows = m.rows.map(r => {
    if (r.id === 'coins') coinsIdx = i;
    const v = r.id === 'coins' && !still ? 0 : r.value;
    const id = r.id ? attr('id', 'r-' + r.id) : '';
    return `<div class="row rep-pop"${pop()}><span>${esc(r.label)}</span><b${id}>${esc(v)}</b></div>`;
  }).join('');
  let side = '';
  if (m.fullHouse) side += `<p class="rep-plate rep-pop"${pop()}>${T.hungry}</p>`;
  if (m.prev != null) side += `<p class="rep-cmp rep-pop"${pop()} id="r-cmp">${compareHtml(m.prev, sum.coins)}</p>`;
  const recHidden = m.record ? '' : ' hidden';
  side += `<p class="rep-plate rep-gold rep-pop"${pop()} id="r-record"${recHidden}>${T.record}</p>`;
  if (m.net != null) {
    const net = esc(signed(still ? m.net : m.net - sum.coins));
    const bank = m.bank != null ? '<small id="r-bank">' + esc(tf('В кассе {bank}', { bank: m.bank })) + '</small>' : '';
    side += `<div class="rep-net rep-pop"${pop()}><span>${T.cash}</span> <b id="r-net">${net}</b>${bank}</div>`;
  }
  if (m.fame) side += `<div class="rep-fame rep-pop"${pop()}><span>${esc(m.fame.text)}</span><div class="rep-bar"><i style="width:${m.fame.pct}%"></i></div></div>`;
  if (m.teaser) side += `<p class="rep-teaser rep-pop"${pop()}><b>${T.tomorrow}:</b> ${esc(m.teaser)}</p>`;
  if (m.note) side += `<p class="note rep-pop"${pop()}><b>${T.zhar}:</b> ${esc(m.note)}</p>`;
  if (m.line) side += `<p class="note rep-line rep-pop"${pop()}><b>${T.zhar}:</b> «${esc(m.line)}»</p>`;
  const dbl = double ? `<button id="double" class="alt" hidden>${T.double}</button>` : '';
  const cls = still ? 'card rep rep-still' : 'card rep';

  el.innerHTML = `<div class="${cls}">${head}<div class="rep-body"><div class="rep-main">${rows}</div><div class="rep-side">${side}</div></div>`
    + `<div class="rep-btns">${dbl}<button id="again">${T.next}</button></div></div>`;
  el.hidden = false;
  const card = el.firstElementChild;
  card.scrollTop = 0;
  el.querySelector('#again').addEventListener('click', () => onNext(), { once: true });

  const coinsEl = el.querySelector('#r-coins'), netEl = el.querySelector('#r-net');
  const alive = () => card.isConnected && !el.hidden;
  const put = total => {
    coinsEl.textContent = total;
    if (netEl) netEl.textContent = signed(netGain(sum, out, total));
  };
  // Подсчёт from → to со звоном монет; done — когда сумма встала на место. Таймер, а не
  // requestAnimationFrame: в скрытой вкладке rAF стоит, и сумма с кнопкой «Удвоить» не появились бы.
  const count = (from, to, done) => {
    if (still || from === to) { put(to); done(); return; }
    const t0 = performance.now();
    let lastTick = -TICK_MS, n = 0;
    const step = () => {
      if (!alive()) return;
      const t = performance.now() - t0;
      put(countAt(from, to, t));
      if (t - lastTick >= TICK_MS && t < COUNT_MS) { lastTick = t; play('coin', { n: Math.min(7, n++ >> 1) }); }
      if (t < COUNT_MS) setTimeout(step, 16); else done();
    };
    step();
  };

  const btn = el.querySelector('#double');
  const showDouble = () => {
    if (!btn || !alive()) return;
    btn.hidden = false;
    btn.addEventListener('click', () => {
      btn.disabled = true;                            // пока идёт реклама, второй тап не нужен
      double(total => {
        btn.remove();
        const from = Number(coinsEl.textContent) || sum.coins;
        count(from, total, () => {});
        const bankEl = el.querySelector('#r-bank');
        if (bankEl && m.bank != null) bankEl.textContent = tf('В кассе {bank}', { bank: m.bank + total - sum.coins });
        const cmp = el.querySelector('#r-cmp');
        if (cmp) cmp.innerHTML = compareHtml(m.prev, total);
        if (extra?.best > 0 && total > extra.best) { const rec = el.querySelector('#r-record'); rec.hidden = false; }
      }, () => { btn.disabled = false; });
    });
  };

  // Выручка начинает считаться, когда её строка уже выехала.
  const start = still ? 0 : coinsIdx * STEP_MS + 250;
  setTimeout(() => {
    if (!alive()) return;
    count(0, sum.coins, () => {
      if (extra) play(m.sound);
      showDouble();
    });
  }, start);
}
