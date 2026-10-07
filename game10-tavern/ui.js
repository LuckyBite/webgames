// «Таверна у края Хмари» — интерфейс поверх экранов: шапка со свечой, вкладки, всплывающие
// надписи, подсказки и отчёт смены. Тексты только русские до шага 5 (i18n).

import { INGREDIENTS, SEEKERS } from './data.js';
import { FEAST_RETRY } from './story.js';
import { drawZharBadge } from './fire.js';
import { tr, tf } from './i18n.js';

export const FONT = '"Segoe UI", Roboto, system-ui, sans-serif';
export const COLOR = { good: '#8fd07a', warn: '#f2b84b', bad: '#ff7a6a', gold: '#ffd166', ink: '#3a2414', paper: '#efe2c4' };

export function font(px, weight = 500) { return `${weight} ${Math.round(px)}px ${FONT}`; }

// Перенос по словам под ширину — по measureText, а не по числу символов.
export function wrap(ctx, text, maxW) {
  const lines = [];
  let cur = '';
  for (const w of text.split(' ')) {
    const next = cur ? cur + ' ' + w : w;
    if (!cur || ctx.measureText(next).width <= maxW) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Уменьшать кегль, пока строка не влезет; возвращает итоговый кегль.
export function fitFont(ctx, text, maxW, px, minPx = 10) {
  let size = px;
  ctx.font = font(size);
  while (size > minPx && ctx.measureText(text).width > maxW) { size -= 1; ctx.font = font(size); }
  return size;
}

export function badge(ctx, x, y, text) {
  ctx.fillStyle = '#e0523f';
  ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.font = font(12, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + 0.5);
  ctx.textAlign = 'left';
}

function star(ctx, x, y, r, color) {
  ctx.fillStyle = color; ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.fill();
}

// Кнопка меню слева в шапке: в смене — пауза (две черты), утром и в сцене — меню (три).
export function drawMenuButton(ctx, r, pause) {
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.fillStyle = '#2a1c14'; ctx.beginPath(); ctx.roundRect(r.x + 5, r.y + 5, r.w - 10, r.h - 10, 8); ctx.fill();
  ctx.fillStyle = '#d8c6a4';
  if (pause) { ctx.fillRect(cx - 7, cy - 8, 5, 16); ctx.fillRect(cx + 2, cy - 8, 5, 16); }
  else for (const dy of [-6, 0, 6]) ctx.fillRect(cx - 8, cy + dy - 1.5, 16, 3);
}

// На пиру вместо свечи — сколько гостей пришло и сколько накормлено; цель взята — зелёным.
function drawFeastBar(ctx, x, cy, shift, limit) {
  const f = shift.cfg.feast, fed = shift.stats.served;
  const text = tf('Гости {arrived}/{guests} · сыты {fed}/{goal}', { arrived: shift.arrived, guests: f.guests, fed, goal: f.goal });
  ctx.fillStyle = fed >= f.goal ? COLOR.good : COLOR.paper;
  fitFont(ctx, text, limit - x, 16, 11);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, cy + 1);
}

// Свеча — время смены: длина = остаток, пламя на горящем конце.
export function drawHud(ctx, L, shift, ui, t) {
  const h = L.hud, cy = h.h / 2, x0 = L.menu.x + L.menu.w + 6;
  const limit = L.tabs ? L.tabs.hall.x - 8 : h.w - 8;
  ctx.fillStyle = '#1c120c'; ctx.fillRect(h.x, h.y, h.w, h.h);
  drawMenuButton(ctx, L.menu, true);
  if (shift.cfg.feast) drawFeastBar(ctx, x0, cy, shift, limit);
  else {
    const left = Math.max(0, 1 - shift.candle() / shift.rules.shiftSeconds);
    const cw = Math.min(110, h.w * 0.14), cx = x0;
    ctx.fillStyle = '#3a2a1e'; ctx.fillRect(cx, cy - 5, cw, 10);
    ctx.fillStyle = COLOR.paper; ctx.fillRect(cx, cy - 5, cw * left, 10);
    if (left > 0) {
      const fx = cx + cw * left + 5, flick = Math.sin(t * 17) * 1.5;
      ctx.fillStyle = '#ffb347'; ctx.beginPath(); ctx.ellipse(fx, cy - 1, 5, 8 + flick, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff1c1'; ctx.beginPath(); ctx.ellipse(fx, cy + 1, 2.2, 4, 0, 0, Math.PI * 2); ctx.fill();
    }
    const end = drawPurse(ctx, cx + cw + 22, cy, shift.stats.coins, shift.stats.fame, limit);
    drawStreak(ctx, end + 14, cy, shift.streak, limit, t, ui);
  }
  if (L.tabs) drawTabs(ctx, L.tabs, shift, ui, t);
}

// Серия точных подач — огонёк с числом после кошелька; гаснет, когда серия прервалась.
function drawStreak(ctx, x, cy, n, limit, t, ui) {
  const lost = ui.streakLost !== undefined && t - ui.streakLost < 0.6;
  if ((n < 2 && !lost) || x + 40 > limit) return;
  const k = lost ? 1 - (t - ui.streakLost) / 0.6 : 1, grow = Math.min(1.6, 1 + n * 0.06), flick = Math.sin(t * 15) * 1.2;
  ctx.globalAlpha = k;
  ctx.fillStyle = lost ? '#8a8a8a' : '#ff8a3a'; ctx.beginPath(); ctx.ellipse(x, cy - 1, 6 * grow, 9 * grow + flick, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = lost ? '#cfcfcf' : '#fff1c1'; ctx.beginPath(); ctx.ellipse(x, cy + 1, 2.6 * grow, 4.5 * grow, 0, 0, Math.PI * 2); ctx.fill();
  if (!lost) { ctx.fillStyle = COLOR.gold; ctx.font = font(15, 700); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('×' + n, x + 9 * grow, cy + 1); }
  ctx.globalAlpha = 1;
}

// Монеты и слава в строку; слава не рисуется, если упирается в границу limit.
// Возвращает правый край нарисованного.
function drawPurse(ctx, x, cy, coinsValue, fameValue, limit) {
  ctx.fillStyle = COLOR.gold; ctx.beginPath(); ctx.arc(x, cy, 8, 0, Math.PI * 2); ctx.fill();
  ctx.font = font(16); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.fillStyle = COLOR.paper;
  const coins = String(coinsValue);
  ctx.fillText(coins, x + 13, cy + 1);
  const coinsEnd = x + 13 + ctx.measureText(coins).width;
  x = coinsEnd + 18;
  const fame = String(fameValue), fameW = ctx.measureText(fame).width;
  if (x + 14 + fameW >= limit) return coinsEnd;
  star(ctx, x, cy, 8, '#e8c05a');
  ctx.fillStyle = COLOR.paper; ctx.fillText(fame, x + 13, cy + 1);
  return x + 13 + fameW;
}

// Строка длиннее места — с многоточием.
function ellipsis(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}

// Утром в шапке — меню, номер дня, кошелёк таверны и справа цель главы; вкладок нет.
export function drawMorningHud(ctx, L, state, goal) {
  const h = L.hud, cy = h.h / 2, x0 = L.menu.x + L.menu.w + 6;
  ctx.fillStyle = '#1c120c'; ctx.fillRect(h.x, h.y, h.w, h.h);
  drawMenuButton(ctx, L.menu, false);
  ctx.font = font(16, 700); ctx.fillStyle = COLOR.paper; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const day = tf('День {day}', { day: state.day });
  ctx.fillText(day, x0, cy + 1);
  const end = drawPurse(ctx, x0 + ctx.measureText(day).width + 26, cy, state.coins, state.fame, h.w - 8);
  const maxW = h.w - 12 - (end + 16);
  if (!goal || maxW < 60) return;
  ctx.fillStyle = COLOR.gold;
  fitFont(ctx, goal, maxW, 14, 10);
  ctx.textAlign = 'right';
  ctx.fillText(ellipsis(ctx, goal, maxW), h.w - 12, cy + 1);   // цель приходит переведённой (story.goalText)
  ctx.textAlign = 'left';
}

// Станция ждёт игрока: мясо просит переворота, котёл — помешивания, готовое скоро сгорит.
function kitchenCalls(shift) {
  return shift.cookers.some((c, i) => { const p = shift.phaseOf(i); return p.phase === 'flip' || p.phase === 'stir' || (p.phase === 'ready' && p.frac < 0.5); });
}

function drawTabs(ctx, tabs, shift, ui, t) {
  const waiting = shift.seats.filter(s => (s.guest && !s.guest.taken) || s.dirty).length;
  for (const [id, r, label] of [['hall', tabs.hall, 'Зал'], ['kitchen', tabs.kitchen, 'Кухня']]) {
    const active = ui.screen === id;
    ctx.fillStyle = active ? '#5a3a24' : '#2a1c14';
    ctx.beginPath(); ctx.roundRect(r.x + 2, r.y + 5, r.w - 4, r.h - 10, 8); ctx.fill();
    ctx.fillStyle = active ? '#fff1c1' : '#b8a488';
    fitFont(ctx, tr(label), r.w - 14, 15);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(tr(label), r.x + r.w / 2, r.y + r.h / 2 + 1);
    if (id === 'hall' && waiting && !active) badge(ctx, r.x + r.w - 10, r.y + 11, String(waiting));
    if (id === 'kitchen' && !active && kitchenCalls(shift) && Math.sin(t * 10) > -0.2) {
      ctx.strokeStyle = '#ff8a6a'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(r.x + 3, r.y + 6, r.w - 6, r.h - 12, 8); ctx.stroke();
      badge(ctx, r.x + r.w - 10, r.y + 11, '!');
    }
  }
  ctx.textAlign = 'left';
}

export function addFx(ui, text, x, y, color, now, size = 18) { ui.fx.push({ text, x, y, color, t0: now, size }); }
export function toast(ui, text, now, sec = 2.2, who = null) { ui.toast = { text, until: now + sec, who }; }

// Надписи поднимаются и гаснут за 1,1 с. Подсказка — плашкой в точке anchor { x, y, maxW }:
// её выбирает main.js так, чтобы не закрыть окно раздачи и гостей.
export function drawFx(ctx, ui, now, L, anchor) {
  ui.fx = ui.fx.filter(f => now - f.t0 < 1.1);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of ui.fx) {
    const k = (now - f.t0) / 1.1, y = f.y - k * 36, pop = k < 0.11 ? 1.4 - (k / 0.11) * 0.4 : 1;
    ctx.font = font((f.size || 18) * pop, 700);
    ctx.globalAlpha = 1 - k * k;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,12,8,0.8)'; ctx.strokeText(f.text, f.x, y);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, y);
  }
  ctx.globalAlpha = 1;
  if (ui.toast && now < ui.toast.until) {
    ctx.font = font(15, 400);
    const badge = ui.toast.who === 'zhar' ? 34 : 0, inset = badge ? badge + 10 : 0;
    const maxW = Math.min(anchor.maxW, 420);
    const lines = wrap(ctx, ui.toast.text, maxW - 28 - inset);
    const w = Math.min(maxW, Math.max(...lines.map(l => ctx.measureText(l).width)) + 28 + inset);
    // bottom — плашка встаёт над точкой, а не под ней (в зале — на стойку, над гостями столов не висит)
    const h = Math.max(lines.length * 20 + 16, badge + 12), x = anchor.x - w / 2, y = anchor.bottom ? anchor.y - h : anchor.y;
    ctx.fillStyle = 'rgba(28,18,12,0.92)'; ctx.beginPath(); ctx.roundRect(x, y, w, h, 12); ctx.fill();
    if (badge) drawZharBadge(ctx, x + 8 + badge / 2, y + h / 2, badge, now);
    ctx.fillStyle = COLOR.paper;
    const tx = x + inset + (w - inset) / 2, ty = y + (h - lines.length * 20) / 2 + 10;
    lines.forEach((l, k) => ctx.fillText(l, tx, ty + k * 20));
  }
  ctx.textAlign = 'left';
}

// Отчёт — DOM поверх канваса: крупный текст и настоящая кнопка лучше читаются и нажимаются.
// out — итог дня из meta.applyShift: пир (story.js applyFeast) или null и жалованье.
// double — реклама «×2 выручки» (main.js): вызывается с колбэком, которому отдают новую
// сумму; после него кнопка исчезает. null — кнопки нет (нечего удваивать или уже взято).
export function showReport(sum, onNext, out = {}, double = null) {
  const feast = out.feast || null;
  const el = document.getElementById('report');
  const used = Object.entries(sum.used || {}).filter(([, n]) => n > 0).map(([id, n]) => `${tr(INGREDIENTS[id].name)} ${n}`).join(', ');
  const fed = (sum.fed || []).map(id => SEEKERS.find(s => s.id === id)?.name).filter(Boolean).map(tr).join(', ');
  const rows = [
    feast ? ['Накормлено', tf('{served} из {guests} (нужно {goal})', { served: sum.served, guests: feast.guests, goal: feast.goal })] : ['Накормлено гостей', sum.served],
    ['Ушли голодными', sum.left],
    ['Выручка', sum.coins, 'coins'],
    ['из неё чаевые', sum.tips],
    ...(sum.autoCollected ? [['собрано со стойки само', sum.autoCollected]] : []),
    ['Слава', (sum.fame > 0 ? '+' : '') + sum.fame],
    ...(out.wages ? [['Жалованье', '−' + out.wages]] : []),
    ...(used ? [['Редкое в дело', used]] : []),
    ...(fed ? [['Сыты перед походом', fed]] : []),
    ...(feast?.ok ? [['Награда', tf('+{coins} монет, +{fame} славы', feast.reward)]] : []),
  ];
  const title = tr(feast ? (feast.ok ? 'Пир удался!' : 'Пир не удался') : 'Смена окончена');
  const note = feast && !feast.ok ? `<p class="note"><b>${tr('Жар')}:</b> «${tr(feast.hint)}» ${tr(FEAST_RETRY)}</p>` : '';
  const extra = double ? `<button id="double" class="alt">${tr('Удвоить выручку за рекламу')}</button>` : '';
  el.innerHTML = `<div class="card"><h2>${title}</h2>${rows
    .map(([k, v, id]) => `<div class="row"><span>${tr(k)}</span><b${id ? ` id="r-${id}"` : ''}>${v}</b></div>`).join('')}${note}${extra}<button id="again">${tr('Дальше')}</button></div>`;
  el.hidden = false;
  // «Дальше» не прячет отчёт сам: межстраничная идёт синхронно из onNext, и прятать должен он.
  el.querySelector('#again').addEventListener('click', () => onNext(), { once: true });
  if (double) {
    const btn = el.querySelector('#double');
    btn.addEventListener('click', () => {
      btn.disabled = true;                            // пока идёт реклама, второй тап не нужен
      double(total => { el.querySelector('#r-coins').textContent = total; btn.remove(); }, () => { btn.disabled = false; });
    });
  }
}

// Вопрос с двумя кнопками поверх канваса (в том же #report): «вернуть искателя сейчас».
export function showAsk(title, text, yes, no, onYes) {
  const el = document.getElementById('report');
  el.innerHTML = `<div class="card"><h2>${title}</h2><p class="note">${text}</p><button id="yes">${yes}</button><button id="no" class="alt">${no}</button></div>`;
  el.hidden = false;
  el.querySelector('#yes').addEventListener('click', () => { el.hidden = true; onYes(); }, { once: true });
  el.querySelector('#no').addEventListener('click', () => { el.hidden = true; }, { once: true });
}
