// Сборка иконок интерфейса: node game8-necro/tools/build-ui-icons.js
//
// Берёт art/ui-src/*.png (тайлы DCSS, public domain) и пишет art/ui-icons.js с
// data-URI. Иконки встроены в модуль, а не лежат файлами: тогда интерфейс не делает
// ни одного сетевого запроса, и до gameReady грузить нечего — та же причина, по
// которой спрайты живут матрицами, а не атласом.
//
// Новая иконка: положить PNG в art/ui-src/<имя>.png и запустить скрипт. Имя файла
// становится ключом UI_ICON.

const fs = require('fs');
const path = require('path');
const { stripPng } = require('./png-strip.js');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'art', 'ui-src');
const OUT = path.join(ROOT, 'art', 'ui-icons.js');

const keys = fs.readdirSync(SRC).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)).sort();
const lines = keys.map(k => {
  const b64 = stripPng(fs.readFileSync(path.join(SRC, k + '.png'))).toString('base64');
  return `  ${k}: 'data:image/png;base64,${b64}',`;
});

const body =
`// СГЕНЕРИРОВАНО tools/build-ui-icons.js из art/ui-src/*.png — руками не править.
// Источник: Dungeon Crawl Stone Soup, rltiles (public domain / CC0).

export const UI_ICON = {
${lines.join('\n')}
};
`;
fs.writeFileSync(OUT, body);
console.log(`art/ui-icons.js: ${keys.length} иконок, ${(body.length / 1024).toFixed(1)} КБ — ${keys.join(' ')}`);
