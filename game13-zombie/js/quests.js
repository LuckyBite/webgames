// Квесты и жители лагеря. Сюжетная цепочка идёт по порядку, у каждого шага свой квестодатель.
// Цель квеста: have (иметь при себе), fetch (найти предмет в точке), clear (убить N у точки),
// generator (залить бензин), car (пригнать машину), boss (убить Мясника на базе).
// Сдаётся всегда разговором с тем, кто дал задание.
import * as THREE from 'three';
import { cloneCharacter, Selection, relaxArms } from './assets.js';
import { heroScale } from './player.js';
import { ITEMS } from './items.js';
import { shellAt } from './world.js';
import { audio } from './audio.js';
import { INNER } from './city.js';

// запасные модели жителей, если в выборе указана незагруженная
export const NPC_MODEL = { chief: 'psx_m_sheriff_n', medic: 'psx_f_23_female_doctor', trader: 'psx_m_male_43' };

export const STORY = [
  { id: 'look', giver: 'chief', title: 'Осмотреться',
    offer: 'Еды на два дня, боец. Я считал. Пройдись по ближним домам, загляни в холодильники и кухонные шкафы. Принеси две банки чего угодно, хоть кошачьих консервов. Остальное потом.',
    brief: 'Найди 2 единицы еды и принеси Михалычу', goal: { type: 'have', kind: 'food', n: 2 }, take: true,
    done: 'Тушёнка. Царская еда. Держи рюкзак, в карманах много не унесёшь. И нож, без ножа сейчас никак.',
    reward: [{ id: 'bag_s', n: 1 }, { id: 'ammo_9mm', n: 12 }, { id: 'knife', n: 1 }] },
  { id: 'meds', giver: 'medic', title: 'Лекарства',
    offer: 'У Сашки температура под сорок, у Лиды кашель. Мне нечем их лечить. В аптеке в центре, за прилавком, должна стоять коробка антибиотиков, я сама её туда заказывала в последнюю неделю. Внутри ходят мёртвые. Иди тихо.',
    brief: 'Забери коробку лекарств из аптеки', goal: { type: 'fetch', item: 'meds_box', poi: 'pharmacy' }, take: true,
    done: 'Цефтриаксон. Живём. Спасибо тебе. Теперь могу подлатать тебя раз в день, приходи, не геройствуй.',
    reward: [{ id: 'medkit', n: 1 }, { id: 'antidote', n: 1 }, { id: 'bandage', n: 3 }] },
  { id: 'gas', giver: 'chief', title: 'Чистая заправка',
    offer: 'На заправке у южного выезда собралась толпа. Штук десять, может больше. Через неё наша единственная дорога из города. Проредишь, и у нас будет путь. Патроны береги, бей в голову.',
    brief: 'Убей 10 зомби у заправки', goal: { type: 'clear', poi: 'gas', n: 10, r: 45 },
    done: 'Видел в бинокль. Чисто сработано, боец. Держи патроны и канистру, заработал.',
    reward: [{ id: 'ammo_9mm', n: 24 }, { id: 'fuel', n: 1 }, { id: 'scrap', n: 4 }] },
  { id: 'scout', giver: 'chief', title: 'Пропавший разведчик',
    offer: 'Костя ушёл три дня назад на восток, в жилые кварталы. Хороший парень, бывший курсант. На связь вышел один раз, сказал, что видел людей в чёрном. Больше ни слова. Найди хотя бы его рацию.',
    brief: 'Найди рацию разведчика', goal: { type: 'fetch', item: 'radio', spot: 'scout' }, take: true,
    done: 'Значит, не дошёл. Жаль парня. Рация цела, будем слушать эфир. Его револьвер теперь твой, он бы не возражал.',
    reward: [{ id: 'revolver', n: 1 }, { id: 'ammo_357', n: 12 }] },
  { id: 'power', giver: 'chief', title: 'Свет в лагере',
    offer: 'Генератор стоит, бензин кончился неделю назад. Залей две канистры, и ночью будет свет. Со светом люди спокойнее, а Гоша перестанет ныть, что в темноте торговать не может.',
    brief: 'Залей 2 канистры в генератор лагеря', goal: { type: 'generator', n: 2 },
    done: 'Да будет свет! Слышишь, как загудел? Гоша уже раскладывает товар. Иди, поторгуйся с ним.',
    reward: [{ id: 'scrap', n: 6 }, { id: 'parts', n: 2 }], unlock: 'trader' },
  { id: 'car', giver: 'trader', title: 'Колёса',
    offer: 'Слушай, дорогой. Мне нужна машина на ходу. Любая, хоть ржавая, лишь бы ехала. Буду возить товар, а не таскать на горбу. Пригони к воротам, я в долгу не останусь.',
    brief: 'Пригони машину на ходу в лагерь', goal: { type: 'car' },
    done: 'Едет! Ласточка! Держи рюкзак побольше, и тайник в лагере я расширил, как обещал. Гоша слово держит.',
    reward: [{ id: 'bag_m', n: 1 }, { id: 'scrap', n: 8 }], unlock: 'stash' },
  { id: 'docs', giver: 'chief', title: 'Документы',
    offer: 'В участке, в моём бывшем кабинете, лежат карты эвакуации. Без них мы не знаем, куда уходить. Там полно мертвецов в форме, мои бывшие сослуживцы. Возьми ствол посерьёзнее.',
    brief: 'Принеси папку с документами из полиции', goal: { type: 'fetch', item: 'docs', poi: 'police' }, take: true,
    done: 'Маршрут на военную базу. Значит, вертолёты были. Может, и автобус туда шёл. Вот бронежилет, мой старый, ещё с учений. И дробовик.',
    reward: [{ id: 'vest', n: 1 }, { id: 'ammo_12ga', n: 12 }, { id: 'shotgun', n: 1 }] },
  { id: 'sample', giver: 'medic', title: 'Образец',
    offer: 'Я веду записи с самого начала. Заражение идёт не только через укусы, я почти уверена. На блокпосту военных бродит огромный, мы зовём его Мясником. Если взять его кровь, я, может быть, пойму, как это работает. Будь очень осторожен.',
    brief: 'Убей Мясника на военной базе и забери образец', goal: { type: 'boss', item: 'sample' }, take: true,
    done: 'Это оно. Ещё тёплая. Я начну работать сегодня же. Ты сделал для лагеря больше, чем кто-либо. Держи, это лучшее, что у нас есть.',
    reward: [{ id: 'rifle', n: 1 }, { id: 'ammo_762', n: 60 }, { id: 'medkit', n: 2 }] },
];

// повторяемые: даются, когда сюжетного задания у NPC нет
const REPEAT = {
  chief: { id: 'rep_clear', title: 'Зачистка', brief: 'Убей 8 зомби у отмеченной точки', goal: { type: 'clear', poi: 'any', n: 8, r: 40 },
    offer: 'Опять собралась толпа у одной из точек. Проредишь? Отмечу на карте.', done: 'Чисто сработано, боец.', reward: [{ id: 'scrap', n: 4 }, { id: 'ammo_9mm', n: 15 }] },
  medic: { id: 'rep_cloth', title: 'Перевязки', brief: 'Принеси Вере 4 ткани', goal: { type: 'have', item: 'cloth', n: 4 }, take: true,
    offer: 'Бинты опять кончаются. Принеси ткани, любой, хоть занавески. Я нарежу и прокипячу.', done: 'Вот, две пары готовых. Бери, тебе нужнее.', reward: [{ id: 'bandage', n: 3 }, { id: 'scrap', n: 2 }] },
};

export const SHOP = [
  { id: 'ammo_9mm', n: 15, price: 3 }, { id: 'ammo_12ga', n: 8, price: 4 }, { id: 'ammo_357', n: 6, price: 4 }, { id: 'ammo_762', n: 20, price: 6 },
  { id: 'ammo_308', n: 5, price: 6 }, { id: 'bandage', n: 2, price: 2 }, { id: 'water', n: 1, price: 1 }, { id: 'canned', n: 1, price: 2 },
  { id: 'fuel', n: 1, price: 5 }, { id: 'molotov', n: 1, price: 4 }, { id: 'grenade', n: 1, price: 8 }, { id: 'bag_m', n: 1, price: 12 },
  { id: 'vest', n: 1, price: 16 }, { id: 'smg', n: 1, price: 22 },
];
export const SELL = { parts: 2, battery: 3, pistol: 5, revolver: 7, smg: 10, shotgun: 9, rifle: 14, sniper: 16, knife: 1, bat: 2, axe: 3, vest: 6, helmet: 3, chainsaw: 12, bag_s: 2, bag_m: 4, bag_l: 7 };

export const RECIPES = [
  { out: { id: 'bandage', n: 2 }, need: [['cloth', 2]] },
  { out: { id: 'molotov', n: 2 }, need: [['fuel', 1], ['cloth', 2]] },
  { out: { id: 'ammo_9mm', n: 15 }, need: [['scrap', 3], ['parts', 1]] },
  { out: { id: 'ammo_12ga', n: 6 }, need: [['scrap', 3], ['parts', 1]] },
  { out: { id: 'medkit', n: 1 }, need: [['bandage', 3], ['pills', 1]] },
  { out: { id: 'bat', n: 1 }, need: [['scrap', 2], ['parts', 1]] },
];

export class Quests {
  constructor(game) {
    this.g = game;
    this.story = 0;            // индекс следующего сюжетного
    this.active = [];          // {id, giver, state:'active'|'ready', prog, target:{x,z,label}, rep?}
    this.unlocked = {};
    this.npcs = [];
    this.medDay = -1;
    this.genFuel = 0;
    this.repN = 0;
  }

  def(a) { return a.rep ? REPEAT[a.giver] : STORY.find(s => s.id === a.id); }

  // ---------- NPC ----------
  spawnNpcs(plan) {
    const g = this.g;
    for (const n of plan.npcs || []) {
      let key = (Selection.npc && Selection.npc[n.id]) || NPC_MODEL[n.id];
      if (!g.assetsOk(key)) key = NPC_MODEL[n.id];
      if (!g.assetsOk(key)) continue;
      const c = cloneCharacter(key, { hideRigid: true });
      c.root.scale.setScalar(heroScale(key));
      c.root.position.set(n.x, 0, n.z);
      c.root.rotation.y = n.ry;
      g.scene.add(c.root);
      const a = c.actions.Idle; if (a) { a.play(); a.time = Math.random() * 2; }
      this.npcs.push(Object.assign({}, n, { c, waved: false }));
    }
  }

  updateNpcs(dt) {
    // распорядок жителей ведёт camplife.js
    if (this.g.camp) return this.g.camp.update(dt);
    const p = this.g.player.pos;
    for (const n of this.npcs) {
      const dx = p.x - n.x, dz = p.z - n.z, d = Math.hypot(dx, dz);
      if (d < 7) {
        const want = Math.atan2(dx, dz);
        let r = n.c.root.rotation.y;
        r += (((want - r + Math.PI) % 6.283 + 6.283) % 6.283 - Math.PI) * Math.min(1, dt * 4);
        n.c.root.rotation.y = r;
        if (!n.waved && n.c.actions.Wave) {
          n.waved = true;
          const w = n.c.actions.Wave, i = n.c.actions.Idle;
          w.reset().setLoop(THREE.LoopOnce).play(); w.clampWhenFinished = false;
          if (i) i.crossFadeTo(w, 0.2, false);
          setTimeout(() => { if (i) { i.reset().play(); w.crossFadeTo(i, 0.3, false); } }, 1600);
        }
      } else if (d > 14) n.waved = false;
      if (d < 60) { n.c.mixer.update(dt); relaxArms(n.c, 0.3); }
    }
  }

  // ---------- выдача ----------
  // что NPC может предложить сейчас
  offerFor(giver) {
    const s = STORY[this.story];
    if (s && s.giver === giver && !this.active.some(a => a.id === s.id)) return { def: s, rep: false };
    const r = REPEAT[giver];
    if (r && this.story >= 2 && !this.active.some(a => a.rep && a.giver === giver)) return { def: r, rep: true };
    return null;
  }

  accept(o) {
    const g = this.g;
    const a = { id: o.def.id, giver: o.def.giver || Object.keys(REPEAT).find(k => REPEAT[k] === o.def), state: 'active', prog: 0, rep: o.rep };
    this.setupTarget(a, o.def);
    this.active.push(a);
    audio.play('quest', null, { vol: 0.6 });
    g.ui.toast('Новое задание: ' + o.def.title);
    g.save();
  }

  setupTarget(a, d) {
    const g = this.g, gl = d.goal;
    const camp = g.plan.camp;
    if (gl.type === 'fetch' && gl.poi) {
      // ближайший к лагерю POI нужного типа; предмет кладём в один из его контейнеров
      const pois = g.plan.pois.filter(p => p.type === gl.poi && p.shell).sort((p, q) => dist(p, camp) - dist(q, camp));
      const poi = pois[0];
      if (poi) {
        const sh = g.world.shellIndex[poi.shell];
        a.target = { x: sh.door.x, z: sh.door.z, label: poi.name, shell: poi.shell };
        const conts = g.world.containers.filter(c => c.shellId === poi.shell);
        const c = conts[Math.floor(Math.random() * conts.length)];
        if (c) { c.force = (c.force || []).concat([{ id: gl.item, n: 1 }]); if (c.items) { c.items.push({ id: gl.item, n: 1 }); c.force = null; } }
        g.zombies.shellSpawned[poi.shell] = undefined; // заново заселить
      }
    } else if (gl.type === 'fetch' && gl.spot === 'scout') {
      // тело разведчика в жилом районе на востоке, вокруг толпа
      // жилой квартал на востоке (в прототипе — любой жилой, кроме соседнего с лагерем)
      const res = g.plan.blocks.filter(b => b.d === 'residential');
      const east = res.filter(b => b.cx > g.plan.camp.x + 60);
      const pool = east.length ? east : res;
      const b = pool[Math.floor(Math.random() * pool.length)] || g.plan.blocks[0];
      const x = b.cx + (Math.random() < 0.5 ? -1 : 1) * 12, z = b.cz + INNER + 1.5;
      g.loot.drop(x, z, [{ id: 'radio', n: 1 }, { id: 'ammo_9mm', n: 10 }, { id: 'water', n: 1 }, { id: 'photo', n: 1 }], 'Рюкзак разведчика', 'bag', 'scout');
      a.target = { x, z, label: 'Последний сигнал' };
      a.spawnAt = { x, z, n: 6 };
    } else if (gl.type === 'clear') {
      let poi;
      if (gl.poi === 'any') { const c = g.plan.pois.filter(p => ['gas', 'supermarket', 'pharmacy', 'police'].includes(p.type)); poi = c[Math.floor(Math.random() * c.length)]; }
      else poi = g.plan.pois.filter(p => p.type === gl.poi).sort((p, q) => dist(p, camp) - dist(q, camp))[0];
      a.target = { x: poi.x, z: poi.z, label: poi.name, r: gl.r };
      a.spawnAt = { x: poi.x, z: poi.z, n: gl.n + 2, ring: true };
    } else if (gl.type === 'generator') {
      const gen = g.world.interact.find(i => i.kind === 'generator');
      a.target = { x: gen.x, z: gen.z, label: 'Генератор' };
    } else if (gl.type === 'car') {
      a.target = { x: camp.x, z: camp.z + camp.r + 4, label: 'Ворота лагеря' };
    } else if (gl.type === 'boss') {
      const m = g.plan.military;
      a.target = { x: m.x, z: m.z, label: 'Военная база' };
      a.spawnAt = { x: m.x, z: m.z + 10, boss: true };
    }
  }

  // ---------- проверки ----------
  update(dt) {
    const g = this.g, p = g.player;
    this.updateNpcs(dt);
    for (const a of this.active) {
      const d = this.def(a);
      if (!d) continue;
      // отложенный спавн квестовых групп, когда игрок подошёл
      if (a.spawnAt && !a.spawned && Math.hypot(p.pos.x - a.spawnAt.x, p.pos.z - a.spawnAt.z) < 85) {
        a.spawned = true;
        const s = a.spawnAt;
        if (s.boss) g.zombies.spawnAt('boss', s.x, s.z, { quest: a.id, loot: [{ id: 'sample', n: 1 }, { id: 'ammo_762', n: 30 }, { id: 'medkit', n: 1 }] });
        else for (let i = 0; i < s.n; i++) {
          const an = Math.random() * 6.28, r = s.ring ? 6 + Math.random() * 18 : 3 + Math.random() * 8;
          const x = s.x + Math.cos(an) * r, z = s.z + Math.sin(an) * r;
          if (g.phys.blocked(x, 0.1, z, 0.4, 1.7)) continue;
          g.zombies.spawnAt(g.zombies.pickType('downtown'), x, z, { quest: a.id });
        }
      }
      const gl = d.goal;
      if (a.state === 'active') {
        if (gl.type === 'have' && this.haveCount(gl) >= gl.n) this.ready(a, d);
        if (gl.type === 'fetch' && p.inv.count(gl.item) >= 1) this.ready(a, d);
        if (gl.type === 'boss' && p.inv.count(gl.item) >= 1) this.ready(a, d);
        if (gl.type === 'clear' && a.prog >= gl.n) this.ready(a, d);
        if (gl.type === 'car' && p.vehicle && p.vehicle.kind === 'car' && g.inCamp(p.pos.x, p.pos.z, g.plan.camp.r + 8)) this.ready(a, d);
        if (gl.type === 'generator' && this.genFuel >= gl.n) this.ready(a, d);
      } else if (a.state === 'ready') {
        // предмет потеряли — снова в работу
        if ((gl.type === 'fetch' || gl.type === 'boss') && p.inv.count(gl.item) < 1) a.state = 'active';
        if (gl.type === 'have' && this.haveCount(gl) < gl.n) a.state = 'active';
      }
    }
  }

  haveCount(gl) {
    const inv = this.g.player.inv;
    if (gl.item) return inv.count(gl.item);
    return inv.slots.reduce((s, it) => s + (it && ITEMS[it.id].kind === gl.kind ? it.n : 0), 0);
  }

  ready(a, d) {
    a.state = 'ready';
    const npc = this.npcs.find(n => n.id === a.giver);
    a.target = { x: npc ? npc.x : this.g.plan.camp.x, z: npc ? npc.z : this.g.plan.camp.z, label: npc ? npc.name : 'Лагерь' };
    audio.play('ok', null, { vol: 0.5 });
    this.g.ui.toast('Задание выполнено. Вернись: ' + (npc ? npc.name : 'в лагерь'));
  }

  onKill(z) {
    for (const a of this.active) {
      const d = this.def(a);
      if (!d || a.state !== 'active' || d.goal.type !== 'clear' || !a.target) continue;
      if (Math.hypot(z.pos.x - a.target.x, z.pos.z - a.target.z) < d.goal.r) {
        a.prog++;
        if (a.prog < d.goal.n) this.g.ui.toast(d.title + ': ' + a.prog + ' / ' + d.goal.n);
      }
    }
  }

  // сдать задание этому NPC, если готово
  turnIn(giver) {
    const g = this.g, p = g.player;
    const a = this.active.find(a => a.giver === giver && a.state === 'ready');
    if (!a) return null;
    const d = this.def(a);
    const gl = d.goal;
    if (d.take) {
      if (gl.item) p.inv.take(gl.item, gl.n || 1);
      else if (gl.kind) {
        let left = gl.n;
        for (let i = p.inv.slots.length - 1; i >= 0 && left > 0; i--) {
          const s = p.inv.slots[i];
          if (s && ITEMS[s.id].kind === gl.kind) left -= p.inv.take(s.id, Math.min(left, s.n));
        }
      }
    }
    for (const it of d.reward) g.giveOrDrop(Object.assign({}, it));
    if (d.unlock) this.unlocked[d.unlock] = true;
    if (d.unlock === 'stash') g.stash.resize(36);
    this.active.splice(this.active.indexOf(a), 1);
    if (!a.rep) this.story++;
    audio.play('quest', null, { vol: 0.7 });
    g.ui.toast('Награда получена');
    g.save();
    return d;
  }

  addGeneratorFuel() {
    const g = this.g, p = g.player;
    const a = this.active.find(a => a.id === 'power');
    if (!a) return this.unlocked.power ? 'Генератор работает' : 'Генератор пуст. Михалыч хотел его запустить';
    if (p.inv.count('fuel') < 1) return 'Нужна канистра бензина';
    const n = Math.min(p.inv.count('fuel'), 2 - this.genFuel);
    p.inv.take('fuel', n);
    this.genFuel += n;
    audio.play('pump', null, { vol: 0.5 });
    if (this.genFuel >= 2) { this.unlocked.power = true; g.onPower(); return 'Генератор запущен'; }
    return 'Залито канистр: ' + this.genFuel + ' / 2';
  }

  // маркеры для компаса и карты
  markers() {
    return this.active.filter(a => a.target).map(a => ({ x: a.target.x, z: a.target.z, label: a.target.label, ready: a.state === 'ready', title: this.def(a).title }));
  }

  trackerLines() {
    return this.active.map(a => {
      const d = this.def(a);
      let s = d.brief;
      if (d.goal.type === 'clear' && a.state === 'active') s += ` (${a.prog}/${d.goal.n})`;
      if (d.goal.type === 'have' && a.state === 'active') s += ` (${Math.min(d.goal.n, this.haveCount(d.goal))}/${d.goal.n})`;
      if (a.state === 'ready') s = 'Вернись к ' + (this.npcs.find(n => n.id === a.giver) || { name: 'лагерю' }).name;
      return { title: d.title, text: s, ready: a.state === 'ready' };
    });
  }

  toJSON() { return { about: this.about, met: this.met, story: this.story, active: this.active, unlocked: this.unlocked, medDay: this.medDay, genFuel: this.genFuel }; }
  load(s) {
    if (!s) return;
    this.about = s.about || {}; this.met = s.met || {}; this.story = s.story || 0; this.unlocked = s.unlocked || {}; this.medDay = s.medDay ?? -1; this.genFuel = s.genFuel || 0;
    this.active = (s.active || []).map(a => Object.assign({}, a, { spawned: false }));
    // квестовые предметы снова кладём в мир, если их ещё не нашли
    for (const a of this.active) {
      const d = this.def(a);
      if (!d || a.state !== 'active') continue;
      const gl = d.goal, g = this.g;
      if (gl.type === 'fetch' && gl.spot && g.loot.drops.some(x => x.tag === gl.spot)) continue;
      if (gl.type === 'fetch' && gl.poi && g.world.containers.some(c => c.items && c.items.some(i => i.id === gl.item))) continue;
      if (gl.type === 'fetch' || gl.type === 'boss') this.setupTarget(a, d);
    }
  }
}

function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
