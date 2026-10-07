// Вырезание служебных блоков PNG: оставляем только то, что нужно для пикселей.
//
// Часть тайлов DCSS при размере 32×32 весит 17–23 КБ: внутри метаданные (цветовой
// профиль, текстовые блоки редакторов), а сам рисунок занимает около килобайта.
// В data-URI это раздувало art/ui-icons.js до 184 КБ. Пиксели не трогаются: блоки
// IHDR/PLTE/tRNS/IDAT/IEND копируются байт в байт, остальное отбрасывается.

const KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);
const SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function stripPng(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) return buf;          // не PNG — отдаём как есть
  const parts = [SIG];
  let at = 8;
  while (at + 8 <= buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    const end = at + 12 + len;                              // длина + тип + данные + CRC
    if (end > buf.length) break;
    if (KEEP.has(type)) parts.push(buf.subarray(at, end));
    at = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(parts);
}

module.exports = { stripPng };
