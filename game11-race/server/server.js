// Сервер онлайна «Ковровых Гонок»: лобби и пересылка поз. Без зависимостей, чистый Node.
//   node server.js [port]          (по умолчанию 8786)
// Сервер не считает физику. Каждый клиент ведёт свою машинку, ведущий комнаты ведёт ботов,
// сервер раздаёт позы остальным участникам комнаты. Так на сервере почти нет нагрузки,
// а у игрока своя машинка отзывается без задержки сети.
// В проде ставится за nginx с TLS (wss://), см. ../NET.md.
'use strict';
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8786;
const MAX = 4;                 // мест в гонке, пустые занимают боты
const MAPS = 3;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// Адрес этого компьютера в локальной сети, чтобы лобби подсказало, что набрать на телефонах.
// Берём интерфейс, через который идёт маршрут наружу: так не попадаются адреса
// виртуальных адаптеров (VirtualBox и т. п.). UDP connect пакетов не отправляет.
let LAN = null;
{
  const dgram = require('dgram'), os = require('os');
  const fallback = () => {
    for (const list of Object.values(os.networkInterfaces()))
      for (const a of list || []) if (a.family === 'IPv4' && !a.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
    return null;
  };
  try {
    const s = dgram.createSocket('udp4');
    s.on('error', () => { LAN = LAN || fallback(); try { s.close(); } catch (e) {} });
    s.connect(80, '8.8.8.8', () => {
      try { LAN = s.address().address; } catch (e) { LAN = fallback(); }
      s.close();
      if (LAN) console.log(`\nОткрой на телефонах в этой же Wi-Fi сети:\n\n    http://${LAN}:${PORT}/\n\nНа этом ноутбуке: http://localhost:${PORT}/\nЗакрой окно, чтобы остановить.\n`);
    });
  } catch (e) { LAN = fallback(); }
}

const clients = new Map();     // id -> client
const rooms = new Map();       // code -> room
let nextId = 1;

/* ─── сама игра: отдаём только её файлы, по белому списку, только чтение ───
   Так сервер можно выставить в интернет через туннель: на одном адресе и страница,
   и онлайн. Общий serve.js наружу выставлять нельзя: он отдаёт всю папку проекта
   и принимает запись файлов через /upload. */
const fs = require('fs'), path = require('path');
const GAME_DIR = path.join(__dirname, '..');
const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/vendor/three.module.min.js': ['vendor/three.module.min.js', 'text/javascript; charset=utf-8'],
  '/vendor/three.core.min.js': ['vendor/three.core.min.js', 'text/javascript; charset=utf-8'],
  '/vendor/sfx.js': ['vendor/sfx.js', 'text/javascript; charset=utf-8'],
};

/* ─── WebSocket: рукопожатие и кадры (RFC 6455, только текст) ─── */
const server = http.createServer((req, res) => {
  const url = (req.url || '/').split('?')[0];
  if (url === '/status') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(`carpet-race ok, rooms ${rooms.size}, players ${clients.size}\n`);
    return;
  }
  const f = FILES[url];
  if (!f || (req.method !== 'GET' && req.method !== 'HEAD')) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('not found'); return; }
  fs.readFile(path.join(GAME_DIR, f[0]), (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    // явная длина: без неё Node шлёт кусками (chunked), и туннели вроде serveo обрывают такой ответ на ~21 КБ
    res.writeHead(200, { 'Content-Type': f[1], 'Content-Length': data.length, 'Cache-Control': url.startsWith('/vendor/') ? 'max-age=3600' : 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});

server.on('upgrade', (req, sock) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { sock.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
             `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  sock.setNoDelay(true);
  const c = { id: 'p' + (nextId++), sock, buf: Buffer.alloc(0), name: 'Гонщик', car: { body: 0, color: 0, acc: 0 }, room: null, ready: false, alive: true };
  clients.set(c.id, c);
  sock.on('data', d => { c.buf = Buffer.concat([c.buf, d]); parse(c); });
  sock.on('close', () => drop(c));
  sock.on('error', () => drop(c));
});

function parse(c) {
  for (;;) {
    const b = c.buf;
    if (b.length < 2) return;
    const op = b[0] & 0x0f, masked = b[1] & 0x80;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return; len = Number(b.readBigUInt64BE(2)); off = 10; }
    if (len > 1 << 20) { c.sock.destroy(); return; }          // защита от мусора
    const mOff = off; if (masked) off += 4;
    if (b.length < off + len) return;
    const data = Buffer.from(b.subarray(off, off + len));
    if (masked) for (let i = 0; i < len; i++) data[i] ^= b[mOff + (i & 3)];
    c.buf = b.subarray(off + len);
    if (op === 8) { c.sock.end(); return; }
    if (op === 9) { frame(c, data, 10); continue; }
    if (op === 1) { let m; try { m = JSON.parse(data.toString('utf8')); } catch (e) { continue; } onMsg(c, m); }
  }
}
function frame(c, payload, op = 1) {
  if (c.sock.destroyed) return;
  const n = payload.length;
  const head = n < 126 ? Buffer.from([0x80 | op, n])
             : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255])
             : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); return h; })();
  c.sock.write(Buffer.concat([head, payload]));
}
const send = (c, m) => frame(c, Buffer.from(JSON.stringify(m)));

/* ─── лобби ─── */
const clean = s => String(s || '').replace(/[<>]/g, '').trim().slice(0, 14) || 'Гонщик';
const carOk = car => ({ body: (car?.body | 0) % 3, color: (car?.color | 0) % 6, acc: (car?.acc | 0) % 4 });

function roomView(r) {
  return { t: 'room', code: r.code, host: r.host, map: r.map, state: r.state,
           players: r.players.map(id => { const p = clients.get(id); return { id, name: p.name, car: p.car, ready: p.ready }; }) };
}
function roomsList() {
  return [...rooms.values()].filter(r => r.players.length).map(r => ({
    code: r.code, map: r.map, n: r.players.length, max: MAX, state: r.state, host: clients.get(r.host)?.name || '' }));
}
function pushRoom(r) { const v = roomView(r); for (const id of r.players) send(clients.get(id), v); }
function pushList() { const m = { t: 'rooms', list: roomsList() }; for (const c of clients.values()) if (!c.room) send(c, m); }

function newCode() { let k; do k = String(1000 + Math.floor(Math.random() * 9000)); while (rooms.has(k)); return k; }

function join(c, r) {
  if (r.players.length >= MAX) return send(c, { t: 'err', e: 'full' });
  if (r.state !== 'lobby') return send(c, { t: 'err', e: 'started' });
  leave(c, true);
  r.players.push(c.id); c.room = r.code; c.ready = false;
  pushRoom(r); pushList();
}
function leave(c, silent) {
  const r = rooms.get(c.room); c.room = null; c.ready = false;
  if (!r) return;
  r.players = r.players.filter(id => id !== c.id);
  if (!r.players.length) rooms.delete(r.code);
  else { if (r.host === c.id) r.host = r.players[0]; pushRoom(r); }
  if (!silent) send(c, { t: 'left' });
  pushList();
}
function drop(c) {
  if (!c.alive) return; c.alive = false;
  leave(c, true); clients.delete(c.id);
}

function onMsg(c, m) {
  const r = rooms.get(c.room);
  switch (m.t) {
    case 'hello':
      c.name = clean(m.name); c.car = carOk(m.car);
      send(c, { t: 'welcome', id: c.id, lan: LAN }); send(c, { t: 'rooms', list: roomsList() });
      break;
    case 'profile':
      c.name = clean(m.name); c.car = carOk(m.car); if (r) pushRoom(r);
      break;
    case 'list': send(c, { t: 'rooms', list: roomsList() }); break;
    case 'create': {
      const code = newCode();
      const nr = { code, host: c.id, map: Math.abs(m.map | 0) % MAPS, state: 'lobby', players: [], seed: 0 };
      rooms.set(code, nr); join(c, nr);
      break;
    }
    case 'join': { const t = rooms.get(String(m.code || '').trim()); if (!t) send(c, { t: 'err', e: 'nf' }); else join(c, t); break; }
    case 'quick': {                          // любая открытая комната, иначе своя
      const t = [...rooms.values()].find(x => x.state === 'lobby' && x.players.length < MAX);
      if (t) join(c, t); else onMsg(c, { t: 'create', map: m.map });
      break;
    }
    case 'leave': leave(c); break;
    case 'map': if (r && r.host === c.id && r.state === 'lobby') { r.map = Math.abs(m.map | 0) % MAPS; for (const id of r.players) clients.get(id).ready = false; pushRoom(r); pushList(); } break;
    case 'ready': if (r && r.state === 'lobby') { c.ready = !!m.v; pushRoom(r); } break;
    case 'start': {
      if (!r || r.host !== c.id || r.state !== 'lobby') break;
      if (r.players.some(id => id !== r.host && !clients.get(id).ready)) { send(c, { t: 'err', e: 'notready' }); break; }
      r.state = 'race'; r.seed = Math.floor(Math.random() * 1e9);
      const slots = r.players.map(id => { const p = clients.get(id); return { id, name: p.name, car: p.car, bot: false }; });
      const used = new Set(slots.map(s => s.car.color));
      let b = 0;
      while (slots.length < MAX) {
        let color = 0; while (used.has(color) && color < 5) color++; used.add(color);
        slots.push({ id: 'b' + b, nameIdx: b, car: { body: Math.floor(Math.random() * 3), color, acc: Math.floor(Math.random() * 4) }, bot: true });
        b++;
      }
      // люди в начале списка встают на задние места стартовой решётки
      const msg = { t: 'start', map: r.map, seed: r.seed, host: r.host, slots };
      for (const id of r.players) { clients.get(id).ready = false; send(clients.get(id), msg); }
      pushRoom(r); pushList();
      break;
    }
    case 'back':        // ведущий вернул комнату в лобби после заезда
      if (r && r.host === c.id && r.state === 'race') { r.state = 'lobby'; pushRoom(r); pushList(); }
      break;
    case 'pose': case 'fin':
      if (r) { m.from = c.id; const s = Buffer.from(JSON.stringify(m)); for (const id of r.players) if (id !== c.id) frame(clients.get(id), s); }
      break;
  }
}

// пинг, чтобы мёртвые сокеты не висели в комнатах
setInterval(() => { for (const c of clients.values()) frame(c, Buffer.alloc(0), 9); }, 20000);

server.listen(PORT, () => console.log(`carpet-race server on :${PORT}`));
