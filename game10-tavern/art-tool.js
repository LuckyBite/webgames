// «Таверна у края Хмари» — обработка картинок из генератора: чистые функции над ImageData.
// Их гоняет art-tool.html в браузере и tests/art-tool.test.mjs в Node, поэтому здесь нет
// ни канваса, ни DOM: на входе и выходе { width, height, data: Uint8ClampedArray }.
//
// Единый стиль держит код, а не генератор (спека, «Графика»): партия от любого генератора
// проходит одну и ту же обрезку, подгонку по размеру и тёплую цветокоррекцию таверны, и на
// выходе выглядит одной игрой.

// Имя файла → id картинки: «Honey (2).PNG» → «honey», «broth burnt.webp» → «broth_burnt».
// Генераторы добавляют к имени счётчики в скобках и пишут как попало, игре же нужен ключ
// INGREDIENTS. Если имя не похоже на id, оно всё равно вернётся в нижнем регистре, и
// пользователь увидит в карточке, что его надо переименовать.
export function idFromName(name) {
  return String(name)
    .replace(/\.[^.]+$/, '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

// Прямоугольник непрозрачной части { x, y, w, h } или null, если картинка пустая.
// threshold — альфа, ниже которой пиксель считается фоном: генераторы оставляют вокруг
// объекта еле заметную дымку, и без порога поле не срезается.
export function trimAlpha(img, threshold = 8) {
  const { width, height, data } = img;
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] <= threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Куда вписать объект bw × bh в квадрат size с полем pad (доля стороны с каждого края):
// пропорции сохраняются, объект по центру. Поле 0.1 даёт те же ~80% стороны, что занимают
// рисунки кодом в food.js, поэтому картинка и заглушка в игре одного размера.
export function fitRect(bw, bh, size, pad = 0.1) {
  const inner = size * (1 - 2 * pad);
  const k = Math.min(inner / bw, inner / bh);
  const w = bw * k, h = bh * k;
  return { x: (size - w) / 2, y: (size - h) / 2, w, h };
}

// Тёплая цветокоррекция таверны, strength 0..1 (0 — картинка не меняется). Три шага на
// пиксель: сдвиг к тёплому (красный вверх, синий вниз), приглушение холодных тонов (где
// синего больше красного, насыщенность тянется к серому: Хмарь остаётся за окном) и лёгкий
// контраст. Прозрачные пиксели и альфа не трогаются. Меняет объект на месте и возвращает его.
export function warmGrade(img, strength = 0.6) {
  const s = Math.max(0, Math.min(1, strength));
  if (!s) return img;
  const d = img.data, contrast = 1 + 0.15 * s, mute = 0.35 * s;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let r = d[i] * (1 + 0.10 * s), g = d[i + 1] * (1 + 0.02 * s), b = d[i + 2] * (1 - 0.14 * s);
    if (b > r) {
      const l = 0.299 * r + 0.587 * g + 0.114 * b;
      r += (l - r) * mute; g += (l - g) * mute; b += (l - b) * mute;
    }
    // Uint8ClampedArray сам округляет и обрезает к 0..255
    d[i] = (r - 128) * contrast + 128;
    d[i + 1] = (g - 128) * contrast + 128;
    d[i + 2] = (b - 128) * contrast + 128;
  }
  return img;
}
