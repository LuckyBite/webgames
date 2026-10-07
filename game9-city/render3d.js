// Рендер «Удачного Квартала»: стол, острова, кубик, камера.
//
// Тезис арт-дирекции (ART.md): «город — макет на столе под одной лампой; всё построенное
// отбрасывает тень на соседа, непостроенное — чистая столешница». Отсюда всё ниже:
//   • свет один, угол зафиксирован — солнце не ходит, иначе тени мигали бы при каждой
//     постройке и макет перестал бы стоять на столе;
//   • камера ортографическая, возвышение 50° (ниже — ряды домов сливаются, замер
//     camera-lab.html), поворот только шагами по 90°;
//   • право на акцент у сработавшего на броске здания: во всей сцене нет других ярких
//     пятен, поэтому подсветку видно без единого слова;
//   • за краем островов — пустая столешница и туман, мира вокруг нет.
//
// Раскладка выбирается по КОРОТКОЙ стороне вьюпорта, а не по ориентации (замер
// table-lab.html): от 600 px помещается весь стол, меньше — только свой город и тот,
// чей сейчас ход. Иначе либо кадр пустой, либо тайл падает ниже 44 px.

import * as THREE from 'three';
import { RULES, BY_ID, MONUMENTS } from './economy.js';

const N = RULES.gridN;
const TILE = 1;
const GAP = 2;                  // зазор между городами: минимум для читаемости (замер)
const TILT = 50;
const HEIGHT_CAP = 1.2;         // дом выше закрывает ряд позади — замер camera-lab

const PALETTE = {
  felt:    0x8fa8b8,
  ground:  [0xa8b797, 0x9fae8e],
  groundFoe: [0x93a496, 0x8b9c8e],
  wall:    { поле: 0xd9cf9f, жильё: 0xe0d6c8, ремесло: 0xc9c2b6, торговля: 0xdcc9ae, зелень: 0x7f9b6a },
  roof:    { промысел: 0xb08b72, мастерская: 0x9c7f63, рынок: 0xa9705e },
  mon:     0xe8e2d6,
  hot:     0xffd27a,            // единственный яркий цвет в игре — сработавшее здание
  pick:    0x9fd6b0,
};

export class Table {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcfd6dd);

    const sun = new THREE.DirectionalLight(0xfff2df, 2.0);
    sun.position.set(-16, 22, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
    this.scene.add(sun, new THREE.HemisphereLight(0xbcd4e6, 0x6b7a86, 0.9));

    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 300);
    this.scene.add(this.camera);

    const felt = new THREE.Mesh(new THREE.PlaneGeometry(400, 400),
                                new THREE.MeshLambertMaterial({ color: PALETTE.felt }));
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = -0.42;
    felt.receiveShadow = true;
    this.scene.add(felt);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.rot = 0;                 // поворот стола шагами по 90°
    this.layout = 'table';        // 'table' | 'duel'
    this.focus = [0, 0];          // какие места показываем в режиме дуэли
    this.uiReserve = 140;
    this.rollDur = 0.85;          // длительность броска; автопрогон ужимает её
    this.anims = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this._tmpV = new THREE.Vector3();
    this._tmpM = new THREE.Matrix4();
    this._tmpQ = new THREE.Quaternion();
    this._tmpS = new THREE.Vector3();
    this._box = new THREE.Box3();
  }

  // ---------- постройка стола ----------
  build(players) {
    this.players = players;
    this.root.clear();
    this.seatGroups = players.map((p, i) => {
      const g = new THREE.Group();
      g.userData.seat = i;
      this.root.add(g);
      return g;
    });

    const geoTile = new THREE.BoxGeometry(TILE, 0.4, TILE);
    const geoWall = new THREE.BoxGeometry(0.74, 1, 0.74);
    const geoRoof = new THREE.ConeGeometry(0.62, 0.5, 4);
    this.ground = [];
    this.walls = [];
    this.roofs = [];

    players.forEach((p, seat) => {
      const g = this.seatGroups[seat];
      // земля: один InstancedMesh на остров — 36 клеток одним вызовом отрисовки
      const ground = new THREE.InstancedMesh(geoTile, new THREE.MeshLambertMaterial(), N * N);
      ground.receiveShadow = true;
      ground.userData = { seat, kind: 'ground' };
      const pal = seat === 0 ? PALETTE.ground : PALETTE.groundFoe;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const i = r * N + c;
        this._tmpM.compose(this._tmpV.set(c - (N - 1) / 2, -0.2, r - (N - 1) / 2),
                           this._tmpQ.identity(), this._tmpS.set(1, 1, 1));
        ground.setMatrixAt(i, this._tmpM);
        ground.setColorAt(i, new THREE.Color(pal[(r + c) % 2]));
      }
      ground.instanceMatrix.needsUpdate = true;
      ground.instanceColor.needsUpdate = true;
      g.add(ground);
      this.ground.push(ground);

      const walls = new THREE.InstancedMesh(geoWall, new THREE.MeshLambertMaterial(), N * N);
      const roofs = new THREE.InstancedMesh(geoRoof, new THREE.MeshLambertMaterial(), N * N);
      walls.castShadow = roofs.castShadow = true;
      walls.receiveShadow = roofs.receiveShadow = true;
      walls.count = roofs.count = 0;
      walls.userData = { seat, kind: 'walls' };
      g.add(walls, roofs);

      // Набережная под монументы: они стоят вне сетки 6×6 (высокие — закрыли бы ряд),
      // и без плиты висели бы прямо над столешницей.
      const quay = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.4, 1.3),
                                  new THREE.MeshLambertMaterial({ color: seat === 0 ? 0x9aa88c : 0x8b9c8e }));
      quay.position.set(-0.5, -0.2, -(N - 1) / 2 - 1.35);
      quay.receiveShadow = true;
      g.add(quay);
      this.walls.push(walls);
      this.roofs.push(roofs);
    });

    // кубик лежит в центре стола и не двигается никогда — якорь камеры между ходами
    this.die = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.15, 1.15),
                                new THREE.MeshLambertMaterial({ color: 0xf5f1e8 }));
    body.castShadow = body.receiveShadow = true;
    this.die.add(body);
    this.pips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.18, 0.07, 0.18),
                                        new THREE.MeshLambertMaterial({ color: 0x2f3a42 }), 6);
    this.pips.count = 0;
    this.die.add(this.pips);
    this.root.add(this.die);
    this.setDie(1);

    this.placeSeats();
    this.syncAll();
  }

  // Позиции городов: в режиме стола — по кругу вокруг кубика, в дуэли — колонной или
  // рядом вдоль длинной оси экрана, кубик в зазоре между ними.
  placeSeats() {
    const step = N + GAP;
    const land = innerWidth > innerHeight;
    if (this.layout === 'table') {
      const ring = [[0, step * 0.62], [-step * 0.62, 0], [0, -step * 0.62], [step * 0.62, 0]];
      this.seatGroups.forEach((g, i) => {
        const [x, z] = ring[i % 4];
        g.position.set(x, 0, z);
        g.scale.setScalar(i === 0 ? 1 : 0.8);
        g.visible = true;
      });
      this.die.position.set(0, 0.57, 0);
    } else {
      const [a, b] = this.focus;
      this.seatGroups.forEach((g, i) => { g.visible = (i === a || i === b); });
      const near = this.seatGroups[a], far = this.seatGroups[b];
      const d = step * 0.55;
      if (land) { near.position.set(-d, 0, 0); far.position.set(d, 0, 0); }
      else      { near.position.set(0, 0, d);  far.position.set(0, 0, -d); }
      near.scale.setScalar(1);
      far.scale.setScalar(a === b ? 1 : 0.85);
      // В дуэли кубик нельзя ставить в геометрический центр: при наклоне 50° дома дальнего
      // города проецируются ВНИЗ по экрану и накрывают зазор — главный объект хода пропадает.
      // Сдвигаем его к краю зазора и приподнимаем.
      if (land) this.die.position.set(0, 0.75, -N * 0.42);
      else      this.die.position.set(N * 0.42, 0.75, 0);
    }
  }

  setLayout(layout, focus) {
    this.layout = layout;
    if (focus) this.focus = focus;
    this.placeSeats();
    this.fit();
  }

  rotate() { this.rot = (this.rot + 90) % 360; this.root.rotation.y = THREE.MathUtils.degToRad(this.rot); this.fit(); }

  // ---------- синхронизация зданий ----------
  syncAll() { this.players.forEach((_, i) => this.sync(i)); }

  sync(seat) {
    const p = this.players[seat];
    const walls = this.walls[seat], roofs = this.roofs[seat];
    let wi = 0, ri = 0;
    this.entryIndex = this.entryIndex || new Map();
    for (const e of p.list) {
      const b = BY_ID[e.id];
      const h = b.cls === 'парк' || b.pay === 0 ? 0.22
              : Math.min(HEIGHT_CAP, 0.45 + b.cost * 0.09);
      const x = e.c - (N - 1) / 2, z = e.r - (N - 1) / 2;
      this._tmpM.compose(this._tmpV.set(x, h / 2, z), this._tmpQ.identity(), this._tmpS.set(1, h, 1));
      walls.setMatrixAt(wi, this._tmpM);
      walls.setColorAt(wi, new THREE.Color(PALETTE.wall[b.tag] || 0xd8d2c8));
      e._wi = wi; e._h = h; e._seat = seat;
      wi++;
      if (b.pay > 0) {
        this._tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
        this._tmpM.compose(this._tmpV.set(x, h + 0.25, z), this._tmpQ, this._tmpS.set(1, 1, 1));
        roofs.setMatrixAt(ri, this._tmpM);
        roofs.setColorAt(ri, new THREE.Color(PALETTE.roof[b.cls] || 0xb08b72));
        e._ri = ri; ri++;
      } else e._ri = -1;
      this._tmpQ.identity();
    }
    walls.count = wi; roofs.count = ri;
    walls.instanceMatrix.needsUpdate = true; roofs.instanceMatrix.needsUpdate = true;
    if (walls.instanceColor) walls.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;
    this.syncMonuments(seat);
  }

  // Монументы стоят НЕ в сетке, а вдоль дальнего края острова: они высокие, а по замеру
  // camera-lab дом выше 1.2 тайла закрывает ряд позади. У дальнего края закрывать нечего.
  syncMonuments(seat) {
    const g = this.seatGroups[seat];
    const p = this.players[seat];
    if (!g.userData.mons) g.userData.mons = [];
    while (g.userData.mons.length < p.monuments.length) {
      const idx = g.userData.mons.length;
      const height = 1.6 + idx * 0.45;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.85, height, 0.85),
                               new THREE.MeshLambertMaterial({ color: PALETTE.mon }));
      m.castShadow = m.receiveShadow = true;
      m.position.set(idx - 1.5, height / 2, -(N - 1) / 2 - 1.35);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.6, 4),
                                  new THREE.MeshLambertMaterial({ color: 0x8fa2ad }));
      roof.position.y = height / 2 + 0.3; roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      m.add(roof);
      g.add(m);
      g.userData.mons.push(m);
      this.anims.push({ obj: m, t: 0, dur: 0.5, from: 0.01, to: 1, kind: 'grow' });
    }
  }

  // ---------- подсветка сработавших зданий ----------
  highlight(entries) {
    this.clearHighlight();
    this.hot = entries.map(e => {
      const walls = this.walls[e._seat];
      const col = new THREE.Color();
      walls.getColorAt(e._wi, col);
      walls.setColorAt(e._wi, new THREE.Color(PALETTE.hot));
      walls.instanceColor.needsUpdate = true;
      this.anims.push({ entry: e, t: 0, dur: 0.45, kind: 'bounce' });
      return { e, col };
    });
  }

  clearHighlight() {
    for (const h of this.hot || []) {
      const walls = this.walls[h.e._seat];
      if (h.e._wi < walls.count) {
        walls.setColorAt(h.e._wi, h.col);
        walls.instanceColor.needsUpdate = true;
      }
    }
    this.hot = [];
  }

  // ---------- выбор клетки ----------
  showFreeCells(seat, on) {
    const ground = this.ground[seat];
    const p = this.players[seat];
    const pal = seat === 0 ? PALETTE.ground : PALETTE.groundFoe;
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const i = r * N + c;
      const free = !p.grid[r][c];
      ground.setColorAt(i, new THREE.Color(on && free ? PALETTE.pick : pal[(r + c) % 2]));
    }
    ground.instanceColor.needsUpdate = true;
  }

  pick(clientX, clientY, seat) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.ground[seat], false)[0];
    if (!hit || hit.instanceId === undefined) return null;
    return { r: Math.floor(hit.instanceId / N), c: hit.instanceId % N };
  }

  // ---------- кубик ----------
  setDie(value) {
    const layouts = {
      1: [[0, 0]],
      2: [[-0.28, -0.28], [0.28, 0.28]],
      3: [[-0.3, -0.3], [0, 0], [0.3, 0.3]],
      4: [[-0.28, -0.28], [0.28, -0.28], [-0.28, 0.28], [0.28, 0.28]],
      5: [[-0.3, -0.3], [0.3, -0.3], [0, 0], [-0.3, 0.3], [0.3, 0.3]],
      6: [[-0.3, -0.32], [0.3, -0.32], [-0.3, 0], [0.3, 0], [-0.3, 0.32], [0.3, 0.32]],
    };
    const pts = layouts[value] || layouts[1];
    pts.forEach(([x, z], i) => {
      this._tmpM.compose(this._tmpV.set(x, 0.59, z), this._tmpQ.identity(), this._tmpS.set(1, 1, 1));
      this.pips.setMatrixAt(i, this._tmpM);
    });
    this.pips.count = pts.length;
    this.pips.instanceMatrix.needsUpdate = true;
  }

  rollDie(value, done) {
    this.anims.push({ kind: 'roll', t: 0, dur: this.rollDur, value, done });
  }

  // ---------- камера ----------
  fit() {
    const W = innerWidth || document.documentElement.clientWidth;
    const H = innerHeight || document.documentElement.clientHeight;
    if (W < 2 || H < 2) return;                 // свёрнутая вкладка: иначе камера уйдёт в NaN
    this.renderer.setSize(W, H, false);

    const t = THREE.MathUtils.degToRad(TILT), d = 90;
    this.camera.position.set(0, Math.sin(t) * d, Math.cos(t) * d);
    this.camera.lookAt(0, 0, 0);
    this.camera.updateMatrixWorld(true);
    // Без этого габариты считаются по СТАРЫМ матрицам: острова только что переставлены
    // в placeSeats, но их matrixWorld ещё в центре стола — камера зумит не туда.
    this.root.updateMatrixWorld(true);

    // габариты того, что реально видно, в системе координат камеры
    this._box.makeEmpty();
    const bb = new THREE.Box3(), v = this._tmpV;
    this.root.traverse(o => {
      if (!o.isMesh || !o.visible) return;
      if (o.isInstancedMesh && o.count === 0) return;   // пустые инстансы дали бы точку в центре
      let parent = o, hidden = false;
      while (parent) { if (parent.visible === false) hidden = true; parent = parent.parent; }
      if (hidden) return;
      bb.setFromObject(o);
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z)
         .applyMatrix4(this.camera.matrixWorldInverse);
        this._box.expandByPoint(v);
      }
    });
    const iw = this._box.max.x - this._box.min.x, ih = this._box.max.y - this._box.min.y;
    if (!(iw > 0 && ih > 0)) return;
    const cx = (this._box.max.x + this._box.min.x) / 2, cy = (this._box.max.y + this._box.min.y) / 2;

    // кадрируем в свободный от интерфейса прямоугольник: в альбоме панель справа,
    // в портрете — снизу. Проценты заполнения кадра считаются от всего экрана.
    const land = W > H;
    const rectW = Math.max(80, land ? W - this.uiReserve : W);
    const rectH = Math.max(80, land ? H : H - this.uiReserve);
    const wpp = Math.max(iw / rectW, ih / rectH) * 1.06;
    const halfW = W * wpp / 2, halfH = H * wpp / 2;
    const Cx = cx - halfW * (2 * (rectW / 2) / W - 1);
    const Cy = cy - halfH * (1 - 2 * (rectH / 2) / H);
    this.camera.left = Cx - halfW; this.camera.right = Cx + halfW;
    this.camera.top = Cy + halfH; this.camera.bottom = Cy - halfH;
    this.camera.updateProjectionMatrix();
  }

  worldOf(entry) {
    const g = this.seatGroups[entry._seat];
    const v = new THREE.Vector3(entry.c - (N - 1) / 2, (entry._h || 0.5) + 0.4, entry.r - (N - 1) / 2);
    return g.localToWorld(v);
  }

  toScreen(world) {
    const v = world.clone().project(this.camera);
    return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
  }

  // ---------- цикл ----------
  update(dt) {
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(a.t / a.dur, 1);
      if (a.kind === 'bounce') {
        const e = a.entry;
        const walls = this.walls[e._seat];
        if (e._wi < walls.count) {
          const lift = Math.sin(k * Math.PI) * 0.35;
          this._tmpM.compose(this._tmpV.set(e.c - (N - 1) / 2, e._h / 2 + lift, e.r - (N - 1) / 2),
                             this._tmpQ.identity(), this._tmpS.set(1, e._h, 1));
          walls.setMatrixAt(e._wi, this._tmpM);
          walls.instanceMatrix.needsUpdate = true;
          if (e._ri >= 0) {
            this._tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
            this._tmpM.compose(this._tmpV.set(e.c - (N - 1) / 2, e._h + 0.25 + lift, e.r - (N - 1) / 2),
                               this._tmpQ, this._tmpS.set(1, 1, 1));
            this.roofs[e._seat].setMatrixAt(e._ri, this._tmpM);
            this.roofs[e._seat].instanceMatrix.needsUpdate = true;
            this._tmpQ.identity();
          }
        }
      } else if (a.kind === 'roll') {
        this.die.position.y = 0.57 + Math.sin(k * Math.PI) * 1.8;
        this.die.rotation.set(k * 9, k * 7, k * 5);
        if (k < 1 && a.t % 0.1 < dt) this.setDie(1 + Math.floor(Math.random() * 6));
        if (k >= 1) {
          this.die.rotation.set(0, 0, 0);
          this.die.position.y = 0.57;
          this.setDie(a.value);
          a.done && a.done();
        }
      } else if (a.kind === 'grow') {
        a.obj.scale.setScalar(a.from + (a.to - a.from) * (1 - Math.pow(1 - k, 3)));
      }
      if (k >= 1) this.anims.splice(i, 1);
    }
    this.renderer.render(this.scene, this.camera);
  }
}
