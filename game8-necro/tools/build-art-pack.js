// Сборка пакета окружения и облика: node game8-necro/tools/build-art-pack.js
//
// Читает art/pack-manifest.json, докачивает недостающие тайлы DCSS (public domain) в
// art/pack-src/ и пишет art/pack.js с data-URI. Встроено в модуль по той же причине,
// что иконки и спрайты: игра не делает сетевых запросов, до gameReady грузить нечего.
//
// floor/wall в манифесте — семейства: берутся ВСЕ варианты (crypt → crypt0..crypt11),
// по индексу art/dcss-dngn-index.json. Остальные группы — отдельные тайлы по путям.

const fs = require('fs');
const path = require('path');
const { stripPng } = require('./png-strip.js');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://raw.githubusercontent.com/crawl/crawl/master/crawl-ref/source/rltiles/';
const SRC = path.join(ROOT, 'art', 'pack-src');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'art', 'pack-manifest.json'), 'utf8'));
const dngn = JSON.parse(fs.readFileSync(path.join(ROOT, 'art', 'dcss-dngn-index.json'), 'utf8'));

/* Шесть вариантов на семейство: глазу на полу и стенах хватает, а все варианты
   раздували пакет до 460 КБ (у brick_dark_5 их двадцать). */
const MAX_VARIANTS = 6;
const family = (kind, fam) => dngn
  .filter(p => new RegExp(`^dngn/${kind}/${fam}_?\\d*\\.png$`).test(p))
  .map(p => p.replace(/\.png$/, ''))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  .slice(0, MAX_VARIANTS);

async function tile(rel) {
  const local = path.join(SRC, rel + '.png');
  if (!fs.existsSync(local)) {
    const r = await fetch(BASE + rel + '.png');
    if (!r.ok) throw new Error(`не скачался ${rel}: ${r.status}`);
    fs.mkdirSync(path.dirname(local), { recursive: true });
    fs.writeFileSync(local, Buffer.from(await r.arrayBuffer()));
  }
  return 'data:image/png;base64,' + stripPng(fs.readFileSync(local)).toString('base64');
}

(async () => {
  const out = { floor: {}, wall: {}, decor: {}, necro: {}, face: {} };
  for (const kind of ['floor', 'wall']) {
    for (const fam of manifest[kind]) {
      const vs = family(kind, fam);
      if (!vs.length) throw new Error(`семейство ${kind}/${fam} пустое`);
      out[kind][fam] = await Promise.all(vs.map(tile));
    }
  }
  for (const group of ['decor', 'necro', 'face']) {
    for (const [key, rel] of Object.entries(manifest[group])) out[group][key] = await tile(rel);
  }
  /* Два файла: базовый грузится со стартом (то, что видно в новой игре), дополнительный
     — динамическим import(), когда игрок открывает «Склеп» или надевает вещь. Иначе
     вся косметика ехала бы в стартовую загрузку, хотя большинство её не увидит. */
  const BASE_KEYS = manifest.base;
  const pick = (want) => {
    const o = {};
    for (const g of Object.keys(out)) {
      o[g] = {};
      for (const [k, v] of Object.entries(out[g])) if (BASE_KEYS[g]?.includes(k) === want) o[g][k] = v;
    }
    return o;
  };
  const head = '// СГЕНЕРИРОВАНО tools/build-art-pack.js из art/pack-manifest.json — руками не править.\n' +
               '// Источник: Dungeon Crawl Stone Soup, rltiles (public domain / CC0).\n\n';
  const baseBody = head + 'export const PACK = ' + JSON.stringify(pick(true), null, 1) + ';\n';
  const extraBody = head + 'export const PACK_EXTRA = ' + JSON.stringify(pick(false), null, 1) + ';\n';
  fs.writeFileSync(path.join(ROOT, 'art', 'pack.js'), baseBody);
  fs.writeFileSync(path.join(ROOT, 'art', 'pack-extra.js'), extraBody);
  const count = (o, g) => Object.values(o[g]).flat().length;
  const sum = o => Object.keys(o).map(g => g + ' ' + count(o, g)).join(' · ');
  console.log('art/pack.js: ' + (baseBody.length / 1024).toFixed(0) + ' КБ (' + sum(pick(true)) + ')');
  console.log('art/pack-extra.js: ' + (extraBody.length / 1024).toFixed(0) + ' КБ (' + sum(pick(false)) + ')');
})().catch(e => { console.error(e.message); process.exit(1); });
