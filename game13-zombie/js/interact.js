// Взаимодействия героя с миром: что можно сделать рядом (подсказка E/F), обыск без окна (присел и роется),
// машины (сесть; заправить и починить на F). Методы подмешиваются в Game (main.js), this — игра.
import { audio } from './audio.js';
import { Input } from './input.js';
import { ITEMS } from './items.js';

export class Interactions {
  // ---------- взаимодействия ----------
  findInteract() {
    const p = this.player;
    if (p.vehicle || p.dead) return null;
    const pos = p.pos;
    let best = null, bd = 1e9;
    const consider = (d, o) => { if (d < bd) { bd = d; best = o; } };
    for (const n of this.quests.npcs) { const d = Math.hypot(n.x - pos.x, n.z - pos.z); if (d < 2.6) consider(d - 0.5, { kind: 'npc', npc: n, label: 'Поговорить: ' + n.name, short: 'Говорить' }); }
    const v = this.vehicles.nearest(pos, 2.6);
    if (v) {
      // E — всегда сесть; заправка и ремонт — по желанию, на F
      let label = 'Сесть: ' + v.name + (v.kind === 'car' ? ' · бензин ' + Math.round(v.fuel * 100) + '%' + (v.running ? ' · заведена' : '') : ''), short = 'Сесть';
      if (v.hp <= 0) { label = v.name + ' разбит' + (p.inv.count('parts') > 0 ? '' : ', нужны запчасти'); short = 'Разбит'; }
      consider(1.2, { kind: 'vehicle', v, label, short, alt: this.vehAlt(v) });
    }
    for (const d of this.loot.drops) { const dd = Math.hypot(d.x - pos.x, d.z - pos.z); if (dd < d.r && Math.abs(d.y - pos.y) < 2) consider(dd, { kind: 'drop', d, label: d.label, short: 'Взять' }); }
    const cs = this.world.containers;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      const dx = c.x - pos.x, dz = c.z - pos.z;
      if (Math.abs(dx) > c.r || Math.abs(dz) > c.r) continue;
      const d = Math.hypot(dx, dz);
      if (d > c.r || Math.abs(c.y - pos.y - 1) > 2.2) continue;
      // сквозь стену не обыскиваем
      const oy = pos.y + 1.2, ty = c.y;
      const len = Math.hypot(dx, ty - oy, dz);
      const hit = this.phys.raycast(pos.x, oy, pos.z, dx / len, (ty - oy) / len, dz / len, len);
      if (hit && hit.t < len - 0.9 && hit.box.tag !== 'furn' && hit.box.tag !== 'car' && hit.box.tag !== 'static') continue;
      const empty = c.items && !c.items.length && this.day - c.openedDay < 2;
      consider(d, { kind: 'cont', c, label: c.label + (empty ? ' (пусто)' : ''), short: 'Обыскать' });
    }
    for (const it of this.world.interact) {
      const d = Math.hypot(it.x - pos.x, it.z - pos.z);
      if (d < 2.3) consider(d, { kind: it.kind, it, label: it.label, short: { stash: 'Тайник', bed: 'Спать', bench: 'Верстак', generator: 'Генератор' }[it.kind] });
    }
    return best;
  }

  interact(t) {
    const p = this.player, ui = this.ui;
    switch (t.kind) {
      case 'npc': ui.dlg = null; ui.show('npc', t.npc); break;
      // обыск без окна: присел, пару секунд роется, найденное само ложится в сумку
      case 'cont': this.startSearch(t.c.label, () => { this.loot.fill(t.c); return t.c.items; }, t.c, 1.8); break;
      case 'drop': this.startSearch(t.d.label, () => t.d.items, t.d, t.d.kind === 'body' ? 1.4 : t.d.kind === 'small' ? 0.35 : 1.0, () => this.loot.cleanup(), t.d.kind === 'body' ? 'cloth' : 'bag'); break;
      case 'stash': ui.show('loot', { title: 'Тайник лагеря (' + this.stash.cap + ' ячеек)', items: this.stash.items, put: true, cap: this.stash.cap }); break;
      case 'bed': if (this.hour >= 18 || this.hour < 6) ui.show('sleep'); else ui.toast('Спать рано. Спальник работает с 18:00'); break;
      case 'bench': ui.show('bench'); break;
      case 'generator': ui.toast(this.quests.addGeneratorFuel()); break;
      case 'vehicle': {
        const v = t.v;
        if (v.hp <= 0) { ui.toast(v.name + ' разбит. Почини запчастями (F)'); break; }
        this.vehicles.enter(v);
        break;
      }
    }
  }

  // дополнительное действие с машиной на F: заправить канистрой или починить запчастями
  vehAlt(v) {
    const p = this.player;
    if (!v || v.kind === 'plane' && v.air) return null;
    if (v.fuel < 0.95 && p.inv.count('fuel') > 0 && v.hp > 0) return { v, act: 'refuel', label: 'Заправить (канистр: ' + p.inv.count('fuel') + ')', short: 'Заправить' };
    if (v.hp < v.maxHp * 0.5 && p.inv.count('parts') > 0) return { v, act: 'repair', label: 'Починить (запчастей: ' + p.inv.count('parts') + ')', short: 'Починить' };
    return null;
  }
  doAlt(a) {
    const p = this.player, v = a.v;
    if (a.act === 'refuel') {
      if (Math.abs(v.speed) > 1) { this.ui.toast('Сначала остановись'); return; }
      p.inv.take('fuel', 1); v.fuel = Math.min(1, v.fuel + 0.4);
      audio.play('pump', v.pos, { vol: 0.5 }); this.ui.toast(v.name + ': бензин ' + Math.round(v.fuel * 100) + '%');
    } else if (a.act === 'repair') {
      p.inv.take('parts', 1);
      v.hp = Math.min(v.maxHp, Math.max(v.hp, 0) + v.maxHp * 0.5);
      audio.play('chop', v.pos, { vol: 0.5 }); this.ui.toast('Отремонтировано: ' + Math.round(v.hp / v.maxHp * 100) + '%');
    }
  }

  // ---------- обыск ----------
  // snd: cont — шкаф/ящик (скрип дверцы, стук), bag — сумка, cloth — карманы (только шорох ткани)
  startSearch(label, getItems, at, total, after, snd = 'cont') {
    const p = this.player;
    if (p.searching || p.using) return;
    p.searching = { label: label.replace(/^Обыскать\s*/i, '') || 'Обыск', t: 0, total, getItems, at: { x: at.x, z: at.z }, after, rustle: 0, snd };
    if (snd === 'cont') audio.play('creak', at, { vol: 0.45 });
    else audio.play('bag', at, { vol: 0.3, rate: 1.3 });
  }
  updateSearch(dt) {
    const p = this.player, s = p.searching;
    if (!s) return;
    const moved = Math.hypot(Input.move.x, Input.move.y) > 0.25 || Input.pressed.has('fire') || Input.pressed.has('jump');
    if (moved || p.dead || p.vehicle || Math.hypot(p.pos.x - s.at.x, p.pos.z - s.at.z) > 3.2) { p.searching = null; this.ui.toast('Обыск прерван'); return; }
    s.t += dt;
    s.rustle -= dt;
    if (s.rustle <= 0) {
      s.rustle = (s.snd === 'cloth' ? 0.3 : 0.45) + Math.random() * 0.3;
      // карманы — шорох ткани (тихий шелест), сумка — возня, шкаф — стук и возня
      if (s.snd === 'cloth') audio.play('stepGrass', s.at, { vol: 0.22, rate: 1.4 + Math.random() * 0.5 });
      else audio.play(s.snd === 'bag' || Math.random() < 0.5 ? 'bag' : 'wood', s.at, { vol: 0.25, rate: 1.2 + Math.random() * 0.4 });
    }
    this.zombies.hearNoise(p.pos, 4, true);
    if (s.t < s.total) return;
    p.searching = null;
    const items = s.getItems() || [];
    const got = [];
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      const n0 = it.n || 1;
      const rest = p.give(it);
      const taken = rest ? n0 - (rest.n || 0) : n0;
      if (taken > 0) { got.push((ITEMS[it.id] ? ITEMS[it.id].name : it.id) + (taken > 1 ? ' ×' + taken : '')); this.onPickup(it); }
      if (rest) items[i] = rest; else items.splice(i, 1);
    }
    if (s.after) s.after();
    if (got.length) { audio.play('pickup', null, { vol: 0.5 }); this.ui.toast('Найдено: ' + got.join(', ')); }
    else this.ui.toast(items.length ? 'Сумка полная' : 'Пусто');
    if (items.length && got.length) this.ui.toast('Не всё влезло, осталось на месте');
  }

}

// подмешать методы в класс игры
export function installInteractions(Game) {
  for (const k of Object.getOwnPropertyNames(Interactions.prototype)) if (k !== 'constructor') Game.prototype[k] = Interactions.prototype[k];
}
