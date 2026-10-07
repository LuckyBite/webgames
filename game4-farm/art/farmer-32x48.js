/* Фермер 32×48, нарисован руками матрицей. Референс — pics/character1.png.
   Рендерит нативный PNG и превью nearest ×10. */
const fs = require('fs'), zlib = require('zlib');

const CRC=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
function crc32(b){let c=-1;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return (c^-1)>>>0;}
function writePNG(f,{w,h,px}){const ch=(t,d)=>{const l=Buffer.alloc(4);l.writeUInt32BE(d.length);
  const td=Buffer.concat([Buffer.from(t,'ascii'),d]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(td));return Buffer.concat([l,td,c]);};
  const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
  const raw=Buffer.alloc(h*(w*4+1));for(let y=0;y<h;y++){raw[y*(w*4+1)]=0;
    Buffer.from(px.buffer,px.byteOffset+y*w*4,w*4).copy(raw,y*(w*4+1)+1);}
  fs.writeFileSync(f,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),
    ch('IHDR',ih),ch('IDAT',zlib.deflateSync(raw,{level:9})),ch('IEND',Buffer.alloc(0))]));}

/* ── палитра: направление по ART.md, тёплая солома как в эталоне.
      Пять ступеней на шляпу — она герой спрайта и держит весь силуэт. ── */
const PAL = {
  '#': '2f2116',  // контур и самая глубокая тень
  'D': '5c3410',  // испод полей, самое тёмное на шляпе
  'd': '8a4f1a',  // солома, глубокая тень
  'h': 'c07f24',  // солома в тени
  'H': 'e0a838',  // солома средняя
  'R': 'f2c95e',  // солома на свету и кант по краю полей
  'b': '7a3b2e',  // лента на свету
  'B': '5a2a20',  // лента в тени
  'j': '7a3f26',  // кожа в тени от полей
  'k': 'a35a34',  // кожа тёмная
  'K': 'd98a4e',  // кожа средняя
  'L': 'f0b076',  // кожа на свету
  's': '4a4568',  // рубаха в тени
  'S': '6f6a99',  // рубаха средняя
  'P': 'a8a2c8',  // светлая панель рубахи
  't': '3a2a1c',  // штаны в тени и пояс
  'T': '6b4a2a',  // штаны средние
  'U': '8a6a40',  // светлое пятно на бедре и пряжка
  'o': '241a12',  // сапог
  'O': '5c3f24',  // мысок сапога
};

/* ── 32×48 ── */
const ART = [
/* 0*/ '................................',
/* 1*/ '................................',
/* 2*/ '............########............',
/* 3*/ '..........##RRRRRRRR##..........',
/* 4*/ '.........#RRRRRRRRRRHH#.........',
/* 5*/ '........#RRRRRRRRRHHHHh#........',
/* 6*/ '........#RRRRRRRRHHHHhh#........',
/* 7*/ '........#HHHHHHHHHHHhhd#........',
/* 8*/ '........#bbbbbbbbbbBBBB#........',
/* 9*/ '.......#HHHHHHHHHHhhhhhh#.......',
/*10*/ '......#RRRRRRRRRRRRHHhhhh#......',
/*11*/ '.....#RRRRRRRRRRRRRRHHHHhh#.....',
/*12*/ '....#RRRRRRRRRRRRRRRRHHHHhh#....',
/*13*/ '...#RRRRRRRRRRRRRRRRRRHHHHhh#...',
/*14*/ '...#ddddDDDDDDDDDDDDDDDDdddd#...',
/*15*/ '...##########################...',
/*16*/ '........#jjjjjjjjjjjjjj#........',
/*17*/ '........#jjj##jjjj##jjj#........',
/*18*/ '........#jjk##kkkk##kkj#........',
/*19*/ '........#jkK##KKKK##KKk#........',
/*20*/ '........#jkKKKKKKKKKKkj#........',
/*21*/ '........#kLLKKKKKKKKKkj#........',
/*22*/ '........#kLLKKK##KKKKkj#........',
/*23*/ '........#kkLKKKKKKKKKkj#........',
/*24*/ '.........##############.........',
/*25*/ '........#ssssssKKssssss#........',
/*26*/ '.......#sSSSSPPKKPPSSSSs#.......',
/*27*/ '......#SS#SSSPPPPPPSSS#ss#......',
/*28*/ '......#SS#SSSPPPPPPSSS#ss#......',
/*29*/ '......#ss#SSSPPPPPPSSS#ss#......',
/*30*/ '......#LK#SSSPPPPPPSSS#kK#......',
/*31*/ '......#LK#SSSPPPPPPSSS#kK#......',
/*32*/ '......#LK#SSSPPPPPPSSS#kK#......',
/*33*/ '.....#kKL#SSSPPPPPPSSS#Kkj#.....',
/*34*/ '.....#kLL#SSSPPPPPPSSS#KKj#.....',
/*35*/ '.....#kkK#SSSPPPPPPSSS#kkj#.....',
/*36*/ '......###ttttttUUtttttt###......',
/*37*/ '........#TTTTTTTTTTTTTT#........',
/*38*/ '........#TTTTTT##TTTTTT#........',
/*39*/ '........#UUTTTt##UUTTTt#........',
/*40*/ '........#UUTTTt##UUTTTt#........',
/*41*/ '........#TTTTTt##TTTTTt#........',
/*42*/ '........#tTTTTT##TTTTTt#........',
/*43*/ '........#tttttt##tttttt#........',
/*44*/ '.......#OOOOOOO##OOOOOOO#.......',
/*45*/ '.......#ooooooo##ooooooo#.......',
/*46*/ '.......#OOOOooo##oooOOOO#.......',
/*47*/ '.......########..########.......',
];

/* ── проверки формы ── */
const W = 32, H = 48;
let bad = 0;
ART.forEach((r, y) => { if (r.length !== W) { console.log(`строка ${y}: длина ${r.length}, надо ${W}`); bad++; } });
if (ART.length !== H) { console.log(`строк ${ART.length}, надо ${H}`); bad++; }
for (const r of ART) for (const c of r) if (c !== '.' && !PAL[c]) { console.log(`неизвестный символ "${c}"`); bad++; }
if (bad) process.exit(1);

const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? '.' : ART[y][x];

/* одиночные пиксели — их запрещает наш же протокол */
let lonely = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (ART[y][x] === '.') continue;
  const n = [[1,0],[-1,0],[0,1],[0,-1]].filter(([dx,dy]) => at(x+dx,y+dy) !== '.').length;
  if (n === 0) { console.log(`одиночный пиксель на (${x},${y})`); lonely++; }
}

/* незакрытый край: цветной пиксель граничит с прозрачным, а контура там нет */
const open = [];
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const c = ART[y][x];
  if (c === '.' || c === '#') continue;
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]])
    if (at(x+dx, y+dy) === '.') { open.push(`(${x},${y})→${dx?'гор':'верт'}`); break; }
}
if (open.length) console.log(`незакрытый край, ${open.length} шт: ${open.slice(0,14).join(' ')}${open.length>14?' …':''}`);

/* ── в пиксели ── */
const px = new Uint8Array(W * H * 4);
const used = new Set();
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const c = ART[y][x], d = (y * W + x) * 4;
  if (c === '.') continue;
  const hex = PAL[c]; used.add(hex);
  px[d] = parseInt(hex.slice(0, 2), 16);
  px[d+1] = parseInt(hex.slice(2, 4), 16);
  px[d+2] = parseInt(hex.slice(4, 6), 16);
  px[d+3] = 255;
}

const [outNative, outPreview] = process.argv.slice(2);
writePNG(outNative, { w: W, h: H, px });

const K = 10;
const pw = W*K, ph = H*K, pp = new Uint8Array(pw*ph*4);
for (let i = 0; i < pw*ph; i++) { pp[i*4]=26; pp[i*4+1]=28; pp[i*4+2]=32; pp[i*4+3]=255; }
for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
  const s = (((y/K)|0)*W + ((x/K)|0))*4; if (!px[s+3]) continue;
  const d = (y*pw+x)*4; pp[d]=px[s]; pp[d+1]=px[s+1]; pp[d+2]=px[s+2]; pp[d+3]=255;
}
writePNG(outPreview, { w: pw, h: ph, px: pp });

let opaque = 0; for (let i = 0; i < W*H; i++) if (px[i*4+3]) opaque++;
const outline = [...ART.join('')].filter(c => c === '#').length;
console.log(`${W}×${H} · цветов ${used.size} · непрозрачных ${opaque} · контур ${outline} = ${(100*outline/opaque).toFixed(0)}%` +
            ` · одиночных ${lonely} · незакрытых краёв ${open.length}`);
