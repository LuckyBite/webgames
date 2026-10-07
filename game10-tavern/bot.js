// «Таверна у края Хмари» — бот-игрок. Делает то же, что человек, но у каждого действия
// есть цена во времени (actionTime), а переход между залом и кухней стоит switchTime.
// Нужен, чтобы проверять баланс без рук; им же играет симулятор меты (sim.js).

import { DISHES, INGREDIENTS, COOKERS, KITCHEN } from './data.js';
import { dishOnPlate, similarity } from './shift.js';

// Готовые части со станций: жаркое — с очага, отвар — из котла.
const COOKED = Object.fromEntries(Object.entries(COOKERS).map(([station, c]) => [c.to, { station, from: c.from }]));
const have = (s, id) => !INGREDIENTS[id]?.rare || s.stock[id] > 0;

// precook — ставить на станции заранее под все открытые заказы: это стратегия, а не скорость,
// поэтому по умолчанию выключено — так тесты шага 1 меряют того же бота, что и тогда.
// Нарезаемое — в порядке частоты в заказах: лук и хлеб нужнее сыра.
const CUT = ['onion', 'bread', 'cheese'].filter(id => INGREDIENTS[id]?.cut);
const CHOP = 0.35, STIR = 1.4;

export function makeBot({ actionTime = 0.7, switchTime = 0.5, pourTarget = 0.9, split = false, precook = false, precookMax = 2, prep = 2 } = {}) {
  let busyUntil = 0;

  const tick = s => {
    if (s.over || s.t < busyUntil) return;
    // k — цена жеста в долях обычного действия (шаг 3г): удар ножом — быстрый тап, помешивание
    // — круг пальцем по котлу.
    // idle — заготовка в затишье: в счёт действий не идёт, это свободное время, а не нагрузка.
    const act = (where, fn, k = 1, idle = false) => {
      if (!split && where !== tick.screen) { tick.screen = where; busyUntil = s.t + switchTime; return; }
      fn();
      if (!idle) tick.actions++;
      busyUntil = s.t + actionTime * k;
    };
    const chop = () => act('kitchen', () => s.chop(), CHOP);
    // Нарезать часть p: на колоде она — бить; колода свободна — положить; занята другим — дорезать.
    const cutPart = p => (s.block.item && s.block.item !== p ? chop() : s.block.item ? chop() : act('kitchen', () => s.putOnBlock(p)));

    // Кран держат рукой: пока льётся, ничего другого не сделать. Наливает бармен — руки свободны.
    if (s.barrel.pouring && !s.barrel.by) {
      if (s.barrel.fill >= pourTarget) { s.stopPour(); busyUntil = s.t + actionTime / 2; }
      return;
    }

    // Переворот и помешивание ждать не могут: пропустил окно — сгорело или пригорело. На
    // кухне они важнее нового гостя в зале — он подождёт пару секунд, мясо нет.
    const flip = s.cookers.findIndex((c, i) => s.phaseOf(i).phase === 'flip');
    const stir = s.cookers.findIndex((c, i) => s.phaseOf(i).phase === 'stir');
    if (split || tick.screen === 'kitchen') {
      if (flip >= 0) return act('kitchen', () => s.flip(flip));
      if (stir >= 0) return act('kitchen', () => s.stir(stir), STIR);
    }

    const seated = s.seats.map((seat, i) => ({ i, g: seat.guest })).filter(x => x.g);
    // принять заказ можно, только когда в окне раздачи есть гнездо; с кухни — тапом по
    // пустому лицу в окне раздачи (самый нетерпеливый первым), из зала — по гостю
    const untaken = s.canTake() && s.waitingSeats()[0];
    if (untaken !== undefined && untaken !== false) return act(tick.screen, () => s.takeOrder(untaken));
    const dirty = s.cfg.staff.clear ? -1 : s.seats.findIndex(seat => seat.dirty);
    if (dirty >= 0 && (split || tick.screen === 'hall')) return act('hall', () => s.clearSeat(dirty));

    const burnt = s.cookers.findIndex(c => c.item === 'burnt');
    if (burnt >= 0) return act('kitchen', () => s.discard(burnt));
    if (flip >= 0) return act('kitchen', () => s.flip(flip));
    if (stir >= 0) return act('kitchen', () => s.stir(stir), STIR);
    if (s.barrel.mug === 'spilled') return act('kitchen', () => s.dumpMug());

    // Открытые позиции, самые нетерпеливые гости первыми. Загадку бот разгадывает сразу
    // и в точку (человек подумает дольше и может промахнуться); без ответа на складе — пропускает.
    const open = seated
      .filter(x => x.g.taken && !(x.g.eating > 0))
      .sort((a, b) => a.g.patience - b.g.patience)
      .flatMap(x => x.g.items.filter(it => !it.served).map(it => ({ i: x.i, dish: it.dish || s.riddleAnswer(it.riddle), riddle: !!it.riddle })))
      .filter(o => o.dish);

    if (s.barrel.mug) {
      const who = open.find(o => DISHES[o.dish].drink);
      return act('kitchen', () => (who ? s.serve(who.i, 'mug') : s.dumpMug()));
    }

    const ready = dishOnPlate(s.plate);
    const taker = ready && open.find(o => o.dish === ready);
    if (taker) return act('kitchen', () => s.serve(taker.i, 'plate'));

    // Бармен наливает только заказанный эль; эль в ответ на загадку наливают сами.
    const pourSelf = s.cfg.staff.pour ? open.some(o => o.riddle && DISHES[o.dish].drink) && !s.barrel.pouring : open.some(o => DISHES[o.dish].drink);
    if (pourSelf) return act('kitchen', () => s.startPour());

    const foods = open.filter(o => !DISHES[o.dish].drink);
    // Жарить заранее: на станции столько, сколько этой части ждут все открытые заказы.
    // Без этого бот не занимает третий слот жаровни, и замер окупаемости врёт.
    // Но не больше, чем успеть собрать: готовое держится на огне секунды, тарелка одна, и
    // лишнее сгорает — без предела бот при пяти местах сжигал по 50 кусков за смену.
    // С начатой тарелкой — только то, что нужно ей: сборка с нарезкой дольше окна «готово», и
    // жаркое под чужое блюдо сгорает, пока собирается это (замер шага 3г: 6 кусков за смену).
    const plateFor = s.plate.length && foods.length
      ? foods.reduce((best, o) => similarity(DISHES[o.dish].parts, s.plate) > similarity(DISHES[best.dish].parts, s.plate) ? o : best)
      : null;
    if (precook) for (const [part, cook] of Object.entries(COOKED)) {
      if (plateFor && !DISHES[plateFor.dish].parts.includes(part)) continue;
      const need = foods.filter(o => DISHES[o.dish].parts.includes(part)).length - (s.plate.includes(part) ? 1 : 0);
      const inWork = s.cookers.filter(c => c.station === cook.station && (c.item === cook.from || c.item === part)).length;
      const free = s.cookers.some(c => c.station === cook.station && !c.item);
      if (need > inWork && inWork < precookMax && free && have(s, cook.from)) return act('kitchen', () => s.putOn(cook.station));
    }
    if (foods.length) {
      // С непустой тарелкой продолжаем то блюдо, на которое она больше похожа. С пустой —
      // сначала то, чья часть уже готова на огне: иначе она сгорит, пока собирается другое.
      const readyFirst = () => {
        if (!precook) return null;
        const ready = Object.keys(COOKED).filter(p => s.cookers.some(c => c.station === COOKED[p].station && c.item === p));
        return foods.find(o => DISHES[o.dish].parts.some(p => ready.includes(p))) || null;
      };
      const target = s.plate.length
        ? foods.reduce((best, o) =>
            similarity(DISHES[o.dish].parts, s.plate) > similarity(DISHES[best.dish].parts, s.plate) ? o : best)
        : readyFirst() || foods[0];
      const parts = DISHES[target.dish].parts;
      if (s.plate.some(p => !parts.includes(p))) return act('kitchen', () => s.dumpPlate());
      // Готовое на огне — первым: пока режется хлеб, жаркое сгорит.
      const onFire = p => COOKED[p] && s.cookers.some(c => c.station === COOKED[p].station && c.item === p);
      const todo = parts.filter(q => !s.plate.includes(q)).sort((x, y) => onFire(y) - onFire(x));
      for (const p of todo) {
        const cook = COOKED[p];
        if (!cook) {
          if (INGREDIENTS[p].cut && !(s.cut[p] > 0)) return cutPart(p);
          // штрих бот кладёт полосой через всю тарелку — «красиво»
          if (have(s, p)) return act('kitchen', () => s.addToPlate(p, { stroke: 1 }));
          continue;
        }
        const done = s.cookers.findIndex(c => c.station === cook.station && c.item === p);
        if (done >= 0) return act('kitchen', () => s.takeFrom(done));
        const cooking = s.cookers.some(c => c.station === cook.station && c.item === cook.from);
        const free = s.cookers.some(c => c.station === cook.station && !c.item);
        if (!cooking && free && have(s, cook.from)) return act('kitchen', () => s.putOn(cook.station));
        // готовится — кладём остальное
      }
    }

    if (dirty >= 0) return act('hall', () => s.clearSeat(dirty));
    // Затишье — заготовка впрок: дорезать начатое, держать по prep порций каждого нарезаемого.
    if (s.block.item) return act('kitchen', () => s.chop(), CHOP, true);
    const low = CUT.find(p => s.cut[p] < prep);
    if (low) return act('kitchen', () => s.putOnBlock(low), 1, true);
  };

  tick.screen = 'kitchen';
  tick.actions = 0;
  return tick;
}
