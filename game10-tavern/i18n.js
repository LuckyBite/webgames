// «Таверна у края Хмари» — языки. Русский — исходный: строки в коде и таблицах русские и
// служат ключами словаря; английский берётся из i18n-en.js (его собирает i18n-extract.mjs,
// переводит человек или модель, проверяет тест i18n.test.mjs). Чего нет в словаре, остаётся
// по-русски — игра не падает, а тест ловит пропуск.
//
// tr(s) — перевести строку целиком; tf(s, vars) — строку с подстановками {имя}: в коде шаблон
// пишется по-русски с {имя}, переводится шаблон, потом подставляются значения.

import { EN } from './i18n-en.js';

let lang = 'ru';
export function setLang(l) { lang = l === 'en' ? 'en' : 'ru'; }
export const getLang = () => lang;

export function tr(s) {
  if (lang === 'ru' || typeof s !== 'string') return s;
  return EN[s] ?? s;
}

export function tf(s, vars = {}) {
  return tr(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

// Перечень через запятую с «и» перед последним: «эль, хлеб и сыр» / «ale, bread and cheese».
export function list(items) {
  if (items.length < 2) return items[0] || '';
  return items.slice(0, -1).join(', ') + tr(' и ') + items[items.length - 1];
}
