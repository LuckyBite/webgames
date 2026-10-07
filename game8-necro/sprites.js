// Пиксельные матрицы и процедурные текстуры.
// Знает про <canvas>, но НЕ знает про three.js: наружу отдаются готовые канвасы,
// оборачивать их в текстуры — работа render.js. Матрицы заменяемы на PNG без правок рендера.

import { STONE, COLD, NECRO, FIRE, BLOOD, SCHOOL_RAMP, OUTLINE } from './palette.js';
import { ART } from './art/sprites-art.js';

/* ═══════════════ Палитры ═══════════════
   Ни одного цвета мимо palette.js — иначе палитра расползётся за вечер, ровно как
   у трёх игр на общем движке (174/143/187 цветов против нашего порога в 48).

   Нежить — в цветах своей школы, но глаза у ВСЕЙ нежити зелёные: это твой свет,
   один на всю армию. Герои — в холодной стали, включая лица: их освещает чужой
   верхний свет. Школа героя читается не по одежде, а по цвету огонька, который он
   несёт (огонёк живёт в 3D, а не в спрайте). Герои различаются силуэтом и
   светлотой, а не тоном — иначе тезис ломается на первом же спрайте. */
const B = SCHOOL_RAMP.bone, R = SCHOOL_RAMP.rot, S = SCHOOL_RAMP.soul, D = SCHOOL_RAMP.dust;

const P = {
  /* Третья ступень рампы (k, l, m) добавлена под силуэты 20×28: на двенадцати
     пикселях две ступени были потолком, на двадцати ими не вылепить ни бинт, ни
     стрелу, ни зубы. Ни одного нового цвета при этом не завелось — только те же
     SCHOOL_RAMP, взятые целиком, а не наполовину. */
  bone:   { w: B[2], W: B[1], k: B[0], g: NECRO[2], b: STONE[3] },
  rot:    { f: R[1], d: R[0], l: R[2], g: NECRO[2] },
  plague: { p: R[2], m: R[1], o: R[0], g: NECRO[2] },
  shade:  { s: S[1], t: S[0], h: S[2], g: NECRO[2] },
  banshee:{ b: S[1], h: S[2], t: S[0], g: NECRO[2] },
  dust:   { c: D[1], d: D[0], g: NECRO[2], m: STONE[3], o: D[2] },

  militia:   { n: COLD[3], e: COLD[0], l: COLD[1], i: COLD[4] },
  mercenary: { n: COLD[3], e: COLD[0], a: COLD[3], i: COLD[4], y: COLD[2] },
  archer:    { n: COLD[3], e: COLD[0], v: COLD[1], b: COLD[2] },
  priest:    { n: COLD[3], e: COLD[0], r: COLD[4], y: COLD[2] },
  mage:      { n: COLD[3], e: COLD[0], u: COLD[1], q: COLD[0], m: COLD[2], o: COLD[4] },
  paladin:   { n: COLD[3], e: COLD[0], a: COLD[4], y: COLD[2] },

  // Некромант: тёмная мантия праха, а весь свет на нём — твой зелёный.
  // Живёт в интерфейсе, не на сцене, поэтому нарисован крупным бюстом, а не фигуркой:
  // на портрет 24×24 пикселей уходит столько же, сколько на фигуру в полный рост,
  // но лица и капюшона в нём помещается несравнимо больше.
  necro:  { k: D[0], r: D[1], g: NECRO[2], o: NECRO[2], m: STONE[3], v: STONE[0] },

  icon:   { w: B[2], k: STONE[0], g: NECRO[2], d: STONE[2], r: BLOOD[2] },
};

/* ═══════════════ Матрицы 12×16 ═══════════════ */
export const MATRICES = {
  /* 20×28 — переезд с 12×16. Двенадцать пикселей в ширину читаются пятном, а не
     фигурой: там нет места ни на рёбра, ни на суставы, ни на разделение силуэта.
     Матрицы разной высоты уживаются, ширина плоскости считается по каждому спрайту. */
  skeleton: { pal: P.bone, rows: [
    '....................',
    '.......wwwwww.......',
    '......wwwwwwww......',
    '.....wwwwwwwwww.....',
    '.....wwgwwwwgww.....',
    '.....wwgwwwwgww.....',
    '.....wwwwwwwwww.....',
    '......wwwWWwww......',
    '......wwWWWWww......',
    '.......wwwwww.......',
    '........wwww........',
    '....wwwwwwwwwwww....',
    '...ww.wwwwwwww.ww...',
    '...ww.wwwwwwww.ww...',
    '...ww.wwWWWWww.ww...',
    '...ww.wwwwwwww.ww...',
    '...ww.wwWWWWww.ww...',
    '...ww..wwwwww..ww...',
    '...ww...wwww...ww...',
    '...www..wwww..www...',
    '.....wwwwwwwwww.....',
    '.....wwww..wwww.....',
    '......www..www......',
    '......www..www......',
    '......www..www......',
    '......www..www......',
    '.....wwww..wwww.....',
    '....wwwww..wwwww....',
  ]},
  /* ── T1 и T2 в 20×28. Раньше здесь стояли заглушки 12×16 по одному шаблону
     «голова, туловище, две ноги», и восемь видов, которые на экране с первой
     минуты, различались только цветом. Тезису это не мешало, но игра выглядела
     дешевле, чем есть: главную работу в пиксель-арте делает силуэт, а в
     двенадцать пикселей ширины силуэт не влезает.

     Поэтому у каждого вида теперь свой ХУК — то, что читается, когда спрайт
     залит чёрным: лучнику дуга лука и оперение стрел, трупу перекос и рука до
     колена, чумному бинты поперёк, тени хвост вместо ног, баньши распущенные
     волосы вдвое шире фигуры, прахолову приземистая масса без шеи, колдуну
     остроконечный капюшон и посох. Проверять это положено силуэтным превью в
     tools/art-lab.html и tools/sprite-sheet.html, а не на глаз в сцене. ── */

  // Костяной лучник: дуга лука на всю высоту слева, оперение стрел над плечом
  boneArcher: { pal: P.bone, rows: [
    '....................',
    '...............k....',
    '.......wwwwww..kk...',
    '......wwwwwwww..k...',
    '..bb..wgwwwwgw..kk..',
    '.bb...wgwwwwgw...k..',
    '.bb...wwwwwwww...kk.',
    '.bb....wwWWww.....k.',
    'bb......wwww......k.',
    'bb.....wwwwww.....k.',
    'bb....wwwwwwwww.....',
    'bb...wwwwwwwwwww....',
    'bb..wwwwwwwwwwwww...',
    'bb...ww.wwwww.ww....',
    'bb...ww.wwWWw.ww....',
    'bb...ww.wwwww.ww....',
    'bb...ww.wwWWw.ww....',
    '.bb..ww.wwwww.ww....',
    '.bb...w..wwww..w....',
    '.bb......wwww.......',
    '..bb.....wwww.......',
    '...bb...wwwwww......',
    '........wwww.www....',
    '.......www....ww....',
    '.......ww.....www...',
    '.......ww......ww...',
    '......www......ww...',
    '.....wwww.....wwww..',
  ]},
  // Ходячий труп: перекос всей фигуры, левая рука висит до колена, зубы наружу
  corpse: { pal: P.rot, rows: [
    '....................',
    '.........ffff.......',
    '........ffffff......',
    '........fgffgf......',
    '........ffffff......',
    '........fllff.......',
    '.........fff........',
    '.........fff........',
    '......ffffffff......',
    '.....fffffffffff....',
    '....ffffffffffff....',
    '....fffffffffff.....',
    '...ff.fffdfff.......',
    '...ff.ffdddff.......',
    '...ff.fffdfff.......',
    '...ff.fffffff.......',
    '...ff.ffdddff.......',
    '...ff..fffff........',
    '...ff..fffff........',
    '...ff..ffffff.......',
    '...fff.fffffff......',
    '....ff.ffff.ff......',
    '.......fff..ff......',
    '.......fff..fff.....',
    '.......ff...fff.....',
    '......fff...fff.....',
    '......fff....ff.....',
    '.....ffff....fff....',
  ]},
  // Чумной носитель: бинты поперёк раздутого тела, один тянется с руки до земли
  plague: { pal: P.plague, rows: [
    '....................',
    '......pppppp........',
    '.....pppppppp.......',
    '.....pgppppgp.......',
    '.....pppppppp.......',
    '.....mmmmmmmm.......',
    '......pppppp........',
    '....pppppppppp......',
    '...pppppppppppp.....',
    '..pppppppppppppp....',
    '..mmmmmmmmmmmmmm....',
    '..pppppppppppppp.m..',
    '..ppppppppppppppmm..',
    '..ppppppppppppppmm..',
    '..mmmmmmmmmmmmmm.mm.',
    '..pppppppppppppp..mm',
    '..pppppppppppppp..m.',
    '...pppppppppppp...m.',
    '...mmmmmmmmmmmm...m.',
    '....pppppppppp....m.',
    '.....pppppppp.....m.',
    '.....ppp..ppp.......',
    '.....ppp..ppp.......',
    '.....mmm..mmm.......',
    '.....ppp..ppp.......',
    '....pppp..pppp......',
    '....ppp....ppp......',
    '...pppp....pppp.....',
  ]},
  /* Тень: ног нет вообще, хвост струится в пол, руки — два отдельных усика.
     Ширина держится в шести-восьми пикселях намеренно: T1 читается тем, что он
     ТОЩИЙ, и первая версия в 20×28 провалилась ровно на этом — раздутая до
     четырнадцати пикселей, она читалась каплей, а не тенью. */
  shade: { pal: P.shade, rows: [
    '....................',
    '.......ssssss.......',
    '.......sgssgs.......',
    '.......ssssss.......',
    '........ssss........',
    '......ssssssss......',
    '.....ssssssssss.....',
    '..sss.ssssssss.sss..',
    '...ss..ssssss..ss...',
    '....s..ssssss..s....',
    '.......ssssss.......',
    '.......ssssss.......',
    '.......tssssst......',
    '.......tssssst......',
    '........tssst.......',
    '........tssst.......',
    '.........tsst.......',
    '.........tsst.......',
    '..........ss........',
    '..........tt........',
    '..........ss........',
    '..........tt........',
    '..........ss........',
    '..........tt........',
    '....................',
    '....................',
    '....................',
    '....................',
  ]},
  /* Баньши: волосы обрамляют лицо и двумя прядями свисают ОТДЕЛЬНО от фигуры —
     иначе в силуэте они не читаются вовсе. Первая версия разводила волосы
     горизонтально, и получилась шляпа; вторая ставила их светлой ступенью S[2] и
     нарушала право на акцент — у нежити самого яркого пятна в кадре быть не
     может. Поэтому масса волос в базовой ступени, а S[2] оставлена одним
     блеском в два пикселя. Рот — зелёный провал: вой это твой свет, а не её. */
  banshee: { pal: P.banshee, rows: [
    '....................',
    '.......bbbbbb.......',
    '......bbttttbb......',
    '.....bbggttggbb.....',
    '.....bbttttttbb.....',
    '.....bbttggttbb.....',
    '....bbbttttttbbb....',
    '....bbbttttttbbb....',
    '...bbbbttttttbbbb...',
    '...bbbbbttttbbbbb...',
    '..bbbbbbbbbbbbbbbb..',
    '..bbbbbbbbbbbbbbbb..',
    '..bbbbbbhhbbbbbbbb..',
    '..bbbbbbbbbbbbbbbb..',
    '..bb...bbbbbb...bb..',
    '..bb...bbbbbb...bb..',
    '..bb...tbbbbt...bb..',
    '..bb...tbbbbt...bb..',
    '...bb..tbbbbt..bb...',
    '...bb..tbbbbt..bb...',
    '....b..tbbbbt..b....',
    '.......tbbbbt.......',
    '.......tbbbbt.......',
    '........tbbt........',
    '........tbbt........',
    '.........bb.........',
    '.........tt.........',
    '....................',
  ]},
  // Прахолов: приземистая масса без шеи, снизу расходится на четыре опоры
  dustling: { pal: P.dust, rows: [
    '....................',
    '....................',
    '....................',
    '....................',
    '.......cccccc.......',
    '......cccccccc......',
    '......cgccccgc......',
    '......cccccccc......',
    '.....cccccccccc.....',
    '...cccccccccccccc...',
    '..cccccccccccccccc..',
    '.cccccccccccccccccc.',
    '.cccccccccccccccccc.',
    '.cccccccccccccccccc.',
    '..cccccccccccccccc..',
    '..ccccdddccccccdcc..',
    '...cccdddccccccc....',
    '...cccccccccccccc...',
    '..cccccccccccccccc..',
    '..cccccccccccccccc..',
    '..cccccccccccccccc..',
    '...cccc......cccc...',
    '...ccc........ccc...',
    '...ccc........ccc...',
    '..cccc........cccc..',
    '..ccc..........ccc..',
    '.cccc..........cccc.',
    '.ccc............ccc.',
  ]},
  // Костяной колдун: остроконечный капюшон и посох с навершием на всю высоту
  sorcerer: { pal: P.dust, rows: [
    '...............o....',
    '......c.......ooo...',
    '.....ccc.......o....',
    '.....ccc......m.....',
    '....ccccc.....m.....',
    '....cgcgc.....m.....',
    '....ccccc.....m.....',
    '...ccccccc....m.....',
    '...ccccccc....m.....',
    '..ccccccccc..mm.....',
    '..cccccccccccm......',
    '..cccccccccccm......',
    '..ccccccccc..m......',
    '..ccccccccc..m......',
    '..ccccccccc..m......',
    '...ccccccc...m......',
    '...ccccccc...m......',
    '...ccccccc...m......',
    '...ddcccdd...m......',
    '...ccccccc...m......',
    '..ccccccccc..m......',
    '..ccccccccc..m......',
    '..ccccccccc.........',
    '.ccccccccccc........',
    '.ccccccccccc........',
    '.ccccccccccc........',
    '..ccccccccc.........',
    '...ccccccc..........',
  ]},

  /* ── T3 и T4: у верхних тиров свои силуэты 20×28 и 24×28.
     Пока они донашивали спрайты T1/T2, гача была слепой: поднятый Костяной голем
     выглядел на поле обычным скелетом, и главный приз ритуала не читался вовсе.
     Тир добирает массу и деталь, рендер сверху добавляет масштаб группы по тиру. ── */

  // Скелет-щитоносец: половину силуэта съедает башенный щит — броня видна без цифр
  boneGuard: { pal: P.bone, rows: [
    '....................',
    '.........wwwwww.....',
    '........wwwwwwww....',
    '........wgwwwwgw....',
    '........wgwwwwgw....',
    '........wwwwwwww....',
    '.........wwWWww.....',
    '..........wwww......',
    '..bbbbbb..wwww......',
    '.bbbbbbbb.wwwwww....',
    '.bbWWWWbb.wwwwwww...',
    '.bbWbbWbbwwwwww.w...',
    '.bbWbbWbbwwwwww.w...',
    '.bbWWWWbbwwWWww.w...',
    '.bbWbbWbbwwwwww.w...',
    '.bbWbbWbbwwWWww.w...',
    '.bbWWWWbbwwwwww.w...',
    '.bbbbbbbb.wwwwww....',
    '.bbbbbbbb.wwww......',
    '..bbbbbb..wwww......',
    '..........wwww......',
    '.........www.ww.....',
    '........www...ww....',
    '........ww....ww....',
    '........ww....ww....',
    '........ww....ww....',
    '.......www....www...',
    '......wwww....wwww..',
  ]},
  // Костяной голем: сросшаяся груда костей, руки толще ног обычного скелета
  boneGolem: { pal: P.bone, rows: [
    '.........wwwwww.........',
    '........wwwwwwww........',
    '........wgwwwwgw........',
    '........wwwwwwww........',
    '.........wWWWWw.........',
    '.....wwwwwwwwwwwwww.....',
    '...wwwwwwwwwwwwwwwwww...',
    '..wwwwwWwwwwwwwwWwwwww..',
    '..wwww.wwwwwwwwww.wwww..',
    '.wwww..wwwWWWWwww..wwww.',
    '.wwww..wwwwwwwwww..wwww.',
    '.wwww..wwWWWWWWww..wwww.',
    '.wwww..wwwwwwwwww..wwww.',
    '..www..wwWWWWWWww..www..',
    '..www..wwwwwwwwww..www..',
    '..www...wwwwwwww...www..',
    '..ww....wwwwwwww....ww..',
    '........wwwwwwww........',
    '.......wwww..wwww.......',
    '.......www....www.......',
    '......wwww....wwww......',
    '......www......www......',
    '......www......www......',
    '......www......www......',
    '.....wwww......wwww.....',
    '....wwwww......wwwww....',
    '....wwww........wwww....',
    '........................',
  ]},
  // Гнилой громила: горбатая туша, одна рука волочится до земли
  brute: { pal: P.plague, rows: [
    '....................',
    '......oooooo........',
    '....ooppppppoo......',
    '...opppppppppo......',
    '...oppgppppgpo......',
    '...opppppppppo......',
    '...ooppppppppoo.....',
    '..ooppppppppppoo....',
    '..opppppppppppppo...',
    '.opppppopppppppppo..',
    '.oppppo.oppppppppo..',
    '.opppo...opppppppo..',
    '.oppo.....opppppo...',
    '.oppo.....opppppo...',
    '.oppo....opppppo....',
    '.oppo....opppppo....',
    '.oppo....opppppo....',
    '.oppo...oppppppo....',
    '.oppo...opppppo.....',
    '.oppo...opppppo.....',
    '.opppo..oppppo......',
    '..oppo..oppppo......',
    '..oppo..oppppo......',
    '...oo...opppo.......',
    '........oppppo......',
    '.......opppppo......',
    '......oppppppo......',
    '....................',
  ]},
  // Мясная гора: тыловая куча плоти с пастью — лечит, поэтому пасть, а не кулаки
  meatHill: { pal: P.plague, rows: [
    '........................',
    '........................',
    '..........oooo..........',
    '........ooppppoo........',
    '......ooppppppppoo......',
    '.....oppppppppppppo.....',
    '....opppgpppppgppppo....',
    '....oppppppppppppppo....',
    '...opppppppppppppppo....',
    '...opppoooooooopppppo...',
    '..oppo..........oppppo..',
    '..oppooooooooooooppppo..',
    '..opppppppppppppppppo...',
    '.opppppppppppppppppppo..',
    '.oppppppopppppopppppppo.',
    '.opppppppppppppppppppo..',
    '.oppppppppppppppppppppo.',
    '.opppopppppppppppopppo..',
    '.oppppppppppppppppppppo.',
    '..oppppppppppppppppppo..',
    '..opppppppppppppppppo...',
    '...oppppppppppppppppo...',
    '...ooppppppppppppppoo...',
    '....oooppppppppppooo....',
    '......ooooooooooo.......',
    '........................',
    '........................',
    '........................',
  ]},
  // Фантом: тень в полный рост, низ расходится на два хвоста — сквозь броню
  phantom: { pal: P.banshee, rows: [
    '....................',
    '.......bbbbbb.......',
    '......bbbbbbbb......',
    '......bgbbbbgb......',
    '......bbbbbbbb......',
    '.....bbbbbbbbbb.....',
    '.....bbbbbbbbbb.....',
    '....bbbbbbbbbbbb....',
    '....bbbbbbbbbbbb....',
    '....bbbbbbbbbbbb....',
    '...bbbbbbbbbbbbbb...',
    '...bbbbbbbbbbbbbb...',
    '...bbbbbbbbbbbbbb...',
    '...tbbbbbbbbbbbbt...',
    '...tbbbbbbbbbbbbt...',
    '....tbbbbbbbbbbt....',
    '....tbbbbbbbbbt.....',
    '....ttbbbbbbbtt.....',
    '.....ttbbbbbtt......',
    '.....tbbbtbbbt......',
    '.....tbbt.tbbt......',
    '.....tbt...tbt......',
    '.....tbt...tbt......',
    '......tt...tt.......',
    '......t.....t.......',
    '....................',
    '....................',
    '....................',
  ]},
  // Жнец: капюшон и коса через всю высоту — бьёт задний ряд, и это видно по оружию
  reaper: { pal: P.banshee, rows: [
    '..................hh....',
    '................hhhh....',
    '..............hhhh......',
    '......tttttt..hhh.......',
    '.....tttttttt.hh........',
    '.....ttgttgtt.bb........',
    '.....tttttttt.bb........',
    '......tttttt..bb........',
    '.....bbbbbbbb.bb........',
    '....bbbbbbbbbbbb........',
    '...bbbbbbbbbbbbb........',
    '...bbb.bbbbbb.bb........',
    '...bbb.bbbbbb.bb........',
    '...bbb.bbbbbb.bb........',
    '...bb..bbbbbb.bb........',
    '.......bbbbbb.bb........',
    '.......bbbbbb.bb........',
    '.......bbbbbb.bb........',
    '......bbbbbbbbbb........',
    '......bbbbbbbb.b........',
    '......tbbbbbbt..........',
    '......tbbbbbbt..........',
    '.......tbbbbt...........',
    '.......tbbbbt...........',
    '........tbbt............',
    '........tbbt............',
    '.........tt.............',
    '........................',
  ]},
  // Некрофаг: пригнувшийся пожиратель на четырёх точках, длинные передние лапы
  ghoul: { pal: P.dust, rows: [
    '....................',
    '....................',
    '....................',
    '........cccccc......',
    '.......cccccccc.....',
    '.......cgccccgc.....',
    '.......cccccccc.....',
    '........ccmmcc......',
    '......cccccccc......',
    '....cccccccccccc....',
    '...cccccccccccccc...',
    '..cccc.cccccc.cccc..',
    '..ccc..cccccc..ccc..',
    '..ccc..cccccc..ccc..',
    '..cc...dcccccd..cc..',
    '..cc...dcccccd..cc..',
    '..cc...ddcccdd..cc..',
    '..cc....dcccd...cc..',
    '.ccc....dcccd...ccc.',
    '.cc.....dcccd....cc.',
    '.cc....ddcccdd...cc.',
    '.cc....dd...dd...cc.',
    '.cc...ddd...ddd..cc.',
    '.c....dd.....dd...c.',
    '......dd.....dd.....',
    '.....ddd.....ddd....',
    '....................',
    '....................',
  ]},
  // Лич-прислужник: мантия, венец и посох с камнем — шипы возвращают урон
  lichling: { pal: P.dust, rows: [
    '....................o...',
    '........o.o.o......om...',
    '........cococ......m....',
    '.......ccccccc.....m....',
    '.......cgcccgc.....m....',
    '.......ccccccc.....m....',
    '........ccccc......m....',
    '......ccccccccc....m....',
    '.....ccccccccccc...m....',
    '....ccccccccccccc..m....',
    '....ccc.ccccc.ccc..m....',
    '....ccc.ccccc.cccmmm....',
    '....ccc.ccccc.ccc..m....',
    '....cc..ccccc..cc..m....',
    '........ccccc......m....',
    '.......ccccccc.....m....',
    '.......ccccccc.....m....',
    '.......cdddddc.....m....',
    '.......cdddddc.....m....',
    '......ccdddddcc....m....',
    '......cdddddddc....m....',
    '......cdddddddc....m....',
    '.....ccdddddddcc...m....',
    '.....cdddddddddc...m....',
    '.....cdddddddddc........',
    '....ccdddddddddcc.......',
    '....ddddddddddddd.......',
    '........................',
  ]},

  militia: { pal: P.militia, rows: [
    '....................',
    '.......nnnnnn.......',
    '......nnnnnnnn......',
    '......nnnnnnnn......',
    '......nennnnen......',
    '......nnnnnnnn......',
    '.......nnnnnn.......',
    '........nnnn........',
    '.....llllllllll.....',
    '....llllllllllll....',
    '...lll.llllll.lll...',
    '...lll.llllll.lll..i',
    '...lll.llllll.lll..i',
    '...lll.llllll.lll..i',
    '...lll.llllll.lll..i',
    '....ll.llllll.ll...i',
    '.......llllll......i',
    '.......llllll.....ii',
    '......llllllll......',
    '......llll.llll.....',
    '......lll...lll.....',
    '......lll...lll.....',
    '......lll...lll.....',
    '......lll...lll.....',
    '......lll...lll.....',
    '.....llll...llll....',
    '.....llll...llll....',
    '....lllll...lllll...',
  ]},
  archer: { pal: P.archer, rows: [
    '....vvvv..b.', '...vvvvvv.b.', '...vnnnnvbb.', '...vnenvv.b.',
    '...vvvvvv.b.', '..vvvvvvvbb.', '..vvvvvvvv.b', '.vvvvvvvvv.b',
    '.vv.vvvv.v.b', '..v.vvvv.v.b', '....vvvv....', '...vv..vv...',
    '...vv..vv...', '...v....v...', '..vv....vv..', '.vvv....vvv.',
  ]},
  priest: { pal: P.priest, rows: [
    '....nnnn....', '...nnnnnn...', '...nennen...', '...nnnnnn...',
    '....yyyy....', '...rrrrrr...', '..rrryyrrr..', '.rrrryyrrrr.',
    '.rrrryyrrrr.', '.rrrrrrrrrr.', '..rrrrrrrr..', '..rrrrrrrr..',
    '..rrrrrrrr..', '...rrrrrr...', '...yyyyyy...', '............',
  ]},
  // Наёмник — школа «кость»: сталь и строй. Отличается от ополченца материалом,
  // а не силуэтом: игрок должен читать школу по цвету с одного взгляда.
  mercenary: { pal: P.mercenary, rows: [
    '....nnnn....', '...nnnnnn...', '...nennen...', '..aaaaaaaa.i',
    '..aaaaaaaa.i', '...aaaaaa..i', '..aaaaaaaa.i', '.aaaaaaaaa.i',
    '.aa.aaaa.a.i', '..a.aaaa.a.i', '....aaaa....', '...aa..aa...',
    '...aa..aa...', '...a....a...', '..aa....aa..', '.yyy....yyy.',
  ]},
  // Маг — школа «прах»
  mage: { pal: P.mage, rows: [
    '..........o.', '....nnnn..m.', '...nnnnnn.m.', '...nennen.m.',
    '....uuuu..m.', '...uuuuuum..', '..uuuuuuuu..', '.uuuuuuuuuu.',
    '.uuuuuuuuuu.', '.uuuuuuuuuu.', '..uuuuuuuu..', '..uuuuuuuu..',
    '..uuuuuuuu..', '...uuuuuu...', '...qqqqqq...', '............',
  ]},
  // Бюст некроманта для интерфейса: капюшон с рогами, провал тени вместо лица,
  // два зелёных глаза и оплечье. На 24×24 помещается характер, которого в фигурке
  // 12×16 не было и быть не могло.
  necroBust: { pal: P.necro, rows: [
    '...k................k...',
    '...kk..............kk...',
    '...kkk............kkk...',
    '....kkk..........kkk....',
    '.....kkkkkkkkkkkkkk.....',
    '....kkkkkkkkkkkkkkkk....',
    '...kkkkkkkkkkkkkkkkkk...',
    '..kkkkkkkkkkkkkkkkkkkk..',
    '..kkkvvvvvvvvvvvvvvkkk..',
    '..kkvvvvvvvvvvvvvvvvkk..',
    '..kkvvvggvvvvvvggvvvkk..',
    '..kkvvvggvvvvvvggvvvkk..',
    '..kkvvvvvvvvvvvvvvvvkk..',
    '..kkkvvvvvvvvvvvvvvkkk..',
    '...kkkvvvvvvvvvvvvkkk...',
    '....kkkkvvvvvvvvkkkk....',
    '.....kkkkkkkkkkkkkk.....',
    '...rrkkkkkkkkkkkkkkrr...',
    '..rrrkkkkkkkkkkkkkkrrr..',
    '.rrrrkkkkkkkkkkkkkkrrrr.',
    'rrrrkkkkkkkkkkkkkkkkrrrr',
    'rrrkkkkkkkkkkkkkkkkkkrrr',
    '..kkkkkkkkkkkkkkkkkkkk..',
    '..vvvvvvvvvvvvvvvvvvvv..',
  ]},

  // Фигура в полный рост больше не используется на сцене, но матрица оставлена:
  // она понадобится, если некромант когда-нибудь выйдет на поле сам
  necromancer: { pal: P.necro, rows: [
    '..k....k..o.', '..kkkkkk..m.', '.kkkkkkkk.m.', '.kkgkkgkk.m.',
    '.kkkkkkkk.m.', '..kkkkkk..m.', '.rkkkkkkrm..', 'rrkkkkkkrr..',
    '.rkkkkkkr...', '.kkkkkkkk...', '.kkkkkkkk...', '.kkkkkkkk...',
    '..kkkkkk....', '..kkkkkk....', '..vvvvvv....', '............',
  ]},

  paladin: { pal: P.paladin, rows: [
    '...aaaaaa...', '..aayyyyaa..', '..aannnnaa..', '..aanennaa..',
    '...aaaaaa...', '..aaaaaaaa..', '.aaaayyaaaa.', 'aaaaayyaaaaa',
    'aaaaayyaaaaa', '.aaaaaaaaaa.', '..aaaaaaaa..', '..aaa..aaa..',
    '..aaa..aaa..', '..aa....aa..', '.aaa....aaa.', '.yyy....yyy.',
  ]},
};

/* ═══════════════ Иконки заклинаний 12×12 ═══════════════ */
export const ICONS = {
  bolt: { pal: P.icon, rows: [
    '...wwwwww...', '..wwwwwwww..', '.wwwwwwwwww.', '.wwkkwwkkww.',
    '.wwkkwwkkww.', '.wwwwwwwwww.', '.wwwwkkwwww.', '..wwwwwwww..',
    '...wwwwww...', '...w.ww.w...', '...wwwwww...', '............',
  ]},
  rise: { pal: P.icon, rows: [
    '.....gg.....', '....gggg....', '...gggggg...', '..gggggggg..',
    '.gg..gg..gg.', '.....gg.....', '.....gg.....', '.....gg.....',
    '.....gg.....', '............', '.dddddddddd.', '............',
  ]},
  frenzy: { pal: P.icon, rows: [
    '............', '..rr....rr..', '..rrr..rrr..', '...rrrrrr...',
    '....rrrr....', '............', '..rr....rr..', '..rrr..rrr..',
    '...rrrrrr...', '....rrrr....', '............', '............',
  ]},
};

/* ═══════════════ Сборка спрайта ═══════════════ */
function drawMatrix(rows, pal) {
  const h = rows.length, w = rows[0].length;
  if (rows.some(r => r.length !== w)) throw new Error('строки матрицы разной длины');
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  rows.forEach((row, y) => {
    for (let i = 0; i < w; i++) {
      const col = pal[row[i]];
      if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
    }
  });
  return c;
}

// Тёмный контур по краю силуэта — главный приём «дорогого» пиксель-арта (взят у Фермы).
function outline(src, col = OUTLINE) {
  const w = src.width + 2, h = src.height + 2;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.drawImage(src, 1, 1);
  const d = x.getImageData(0, 0, w, h), a = d.data;
  const solid = (i, j) => i >= 0 && j >= 0 && i < w && j < h && a[(j * w + i) * 4 + 3] > 0;
  x.fillStyle = col;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++)
    if (a[(j * w + i) * 4 + 3] === 0 && (solid(i + 1, j) || solid(i - 1, j) || solid(i, j + 1) || solid(i, j - 1)))
      x.fillRect(i, j, 1, 1);
  return c;
}

/* Контровой свет по стороне источника. Плоский биллборд, залитый Lambert-ом, не имеет
   формы вообще — фигура читается силуэтом и плоским пятном. Одна светлая линия по
   верхне-левому краю возвращает объём даром.

   Цвет рима выводится из тезиса, а не выбирается: героев подсвечивает чужой холод
   сверху, нежить — рыжие жаровни. Поэтому рим ещё и разводит два семейства. */
function rim(src, col) {
  const w = src.width, h = src.height;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.drawImage(src, 0, 0);
  const d = x.getImageData(0, 0, w, h), a = d.data;
  const solid = (i, j) => i >= 0 && j >= 0 && i < w && j < h && a[(j * w + i) * 4 + 3] > 0;
  x.fillStyle = col;
  /* Только верхняя кромка. Условие «нет соседа сверху ИЛИ слева» пробовалось и
     провалилось: у фигуры 20×28 конечности шириной в два-три пикселя, там краевым
     оказывается почти каждый пиксель, и рим заливает силуэт целиком — скелет
     превращается в оранжевого человека. По верхней кромке рим ложится тонко. */
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    if (!solid(i, j)) continue;
    if (!solid(i, j - 1)) x.fillRect(i, j, 1, 1);
  }
  return c;
}

// Кому какой контровой: выводится из того, чей свет на него падает
const RIM_COLD = new Set(['militia', 'mercenary', 'archer', 'priest', 'mage', 'paladin']);

const cache = new Map();
export function spriteCanvas(name) {
  if (cache.has(name)) return cache.get(name);
  /* Импортный арт (art/sprites-art.js, тайлы DCSS) идёт первым и как есть: у тайлов
     свой контур и своя лепка светом, наш outline() дал бы второй контур, а рыжий
     рим по верхней кромке лёг бы поверх чужого рисунка. Ручные матрицы ниже
     остаются запасными — для ролей, у которых тайла нет. */
  const a = ART[name];
  if (a) {
    const c = drawMatrix(a.rows, a.pal);
    cache.set(name, c);
    return c;
  }
  const m = MATRICES[name];
  if (!m) throw new Error('нет спрайта: ' + name);
  const lit = rim(drawMatrix(m.rows, m.pal), RIM_COLD.has(name) ? COLD[4] : FIRE[1]);
  const c = outline(lit);
  cache.set(name, c);
  return c;
}

/* ═══════════════ Кадры анимации из одной матрицы ═══════════════
   ART.md заказывает художнику покой ×2 и замах ×1, но пока лент нет — движок делает
   эти кадры сам, сдвигая половины фигуры на ОДИН пиксель. Ровно так рисуется дыхание
   в пиксель-арте: не деформацией, а смещением верхней половины на пиксель.

   Прирост несоизмерим с ценой: без него вся сцена — набор неподвижных табличек, и
   никакая работа со светом этого не лечит. Когда придут настоящие ленты кадров,
   функция просто перестанет вызываться — рендер уже спрашивает кадры по индексу. */
function shifted(src, dy, dx = 0, from = 0.5) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  const split = Math.round(src.height * from);
  // Низ на месте — фигура не должна отрываться от пола
  x.drawImage(src, 0, split, src.width, src.height - split, 0, split, src.width, src.height - split);
  // Верх со сдвигом; строка на стыке дублируется, и это верно: тело «сжимается»
  x.drawImage(src, 0, 0, src.width, split, dx, dy, src.width, split);
  return c;
}

/* Кадр 0 — покой, 1 — вдох (верх на пиксель ниже), 2 — замах (верх подан вперёд-вверх).
   Порядок фиксирован: рендер держит индексы, а не имена. */
export function spriteFrames(name) {
  const key = 'frames:' + name;
  if (cache.has(key)) return cache.get(key);
  const base = spriteCanvas(name);
  const frames = [base, shifted(base, 1, 0, 0.55), shifted(base, -1, 1, 0.45)];
  cache.set(key, frames);
  return frames;
}

// Мягкое пятно под фигурой. Тени в three дороги и на биллбордах смотрятся странно,
// а простое пятно ставит фигуру на землю — без него все юниты висят над полом.
export function shadowCanvas(size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  const half = size / 2;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = (i - half) / half, dy = (j - half) / half;
    const d = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    const o = (j * size + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 0;
    img.data[o + 3] = Math.round(Math.pow(1 - d, 1.7) * 215);
  }
  x.putImageData(img, 0, 0);
  return c;
}

export function iconCanvas(name) {
  const key = 'icon:' + name;
  if (cache.has(key)) return cache.get(key);
  const m = ICONS[name];
  if (!m) throw new Error('нет иконки: ' + name);
  const c = drawMatrix(m.rows, m.pal);
  cache.set(key, c);
  return c;
}
export const SPRITE_W = 14, SPRITE_H = 18;   // с учётом контура

/* ═══════════════ Процедурные текстуры подземелья ═══════════════
   Ни одного загружаемого ассета: спека требует, чтобы билд был самодостаточным. */

const rgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

// Зерно камня — не новые цвета, а разброс светлоты вокруг ступени рампы.
// Ступени между собой камень не смешивает, поэтому счётчик палитры это не ломает.
function noiseFill(x, size, baseHex, spread, seed) {
  const base = rgb(baseHex);
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const n = (rnd() - 0.5) * spread;
    const r = Math.max(0, Math.min(255, base[0] + n));
    const g = Math.max(0, Math.min(255, base[1] + n));
    const b = Math.max(0, Math.min(255, base[2] + n));
    x.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
    x.fillRect(i, j, 1, 1);
  }
}

// Плита пола: крупные швы плюс зерно.
export function floorCanvas(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  noiseFill(x, size, STONE[2], 26, 7);
  x.fillStyle = STONE[0];
  const cell = size / 4;
  for (let i = 0; i <= 4; i++) {
    x.fillRect(0, Math.round(i * cell), size, 1);
    x.fillRect(Math.round(i * cell), 0, 1, size);
  }
  return c;
}

// Стена: тот же камень, темнее и с горизонтальной кладкой со смещением.
export function wallCanvas(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  noiseFill(x, size, STONE[1], 20, 19);
  x.fillStyle = STONE[0];
  const rowH = size / 8;
  for (let r = 0; r <= 8; r++) {
    const y = Math.round(r * rowH);
    x.fillRect(0, y, size, 1);
    const off = (r % 2) * (size / 4);
    for (let k = 0; k < 2; k++) x.fillRect(Math.round(off + k * size / 2), y, 1, Math.round(rowH));
  }
  return c;
}

// Мягкое пятно света под юнитом: дешёвая замена персональному источнику на каждого.
export function glowCanvas(size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  const r = size / 2;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const d = Math.hypot(i - r + 0.5, j - r + 0.5) / r;
    const a = Math.max(0, 1 - d) ** 2.2;
    const o = (j * size + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
    img.data[o + 3] = Math.round(a * 255);
  }
  x.putImageData(img, 0, 0);
  return c;
}

/* Виньетка: чёрный по краям, прозрачный в центре. Настоящая постобработка потребовала бы
   тянуть EffectComposer из three/examples — это ещё файлы в билд, который и так 800 КБ.
   Один квад перед камерой даёт тот же эффект даром. */
export function vignetteCanvas(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const img = x.createImageData(size, size);
  const half = size / 2;
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const dx = (i - half) / half, dy = (j - half) / half;
    const d = Math.min(1, Math.sqrt(dx * dx + dy * dy) / 1.32);
    const a = Math.pow(d, 2.6);           // держим центр чистым, темнота копится к краю
    const o = (j * size + i) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 0;
    img.data[o + 3] = Math.round(a * 230);
  }
  x.putImageData(img, 0, 0);
  return c;
}

// Пятно крови на полу. Форма всегда одна, разворот и масштаб задаёт рендер.
export function bloodCanvas(size = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  let s = 5;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  x.fillStyle = BLOOD[0];
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * size * 0.3;
    const r = size * (0.06 + rnd() * 0.13);
    x.beginPath();
    x.arc(size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, r, 0, Math.PI * 2);
    x.fill();
  }
  return c;
}
