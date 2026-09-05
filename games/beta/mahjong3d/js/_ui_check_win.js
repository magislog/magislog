// 表ういの独立チェック（分担Aの自己申告テストとは別に、ういが自分で作ったもの）
// 実行: node js/_ui_check_win.js
// 目的: MJ.Win.isWin / isChiitoi / tenpaiTiles / isFuriten を、既知の手で外から確かめる。
"use strict";
global.window = global;
require('./config.js');
require('./tiles.js');
require('./win.js');

// "1m 2m 3m ..." を長さ34の枚数配列にする（tiles.js の parse を使う＝そこも同時に検算される）
function C(str) {
  var c = new Array(34);
  for (var i = 0; i < 34; i++) c[i] = 0;
  str.trim().split(/\s+/).forEach(function (t) {
    var id = MJ.Tiles.parse(t);
    if (typeof id !== "number" || id < 0 || id > 33) throw new Error("parse失敗: " + t + " -> " + id);
    c[id]++;
  });
  return c;
}
function total(c) { var n = 0; for (var i = 0; i < 34; i++) n += c[i]; return n; }

var pass = 0, fail = 0, bad = [];
function ck(label, got, want) {
  if (got === want) { pass++; }
  else { fail++; bad.push(label + "  期待=" + want + " 実際=" + got); }
  console.log((got === want ? "OK  " : "NG  ") + label);
}

// ---- 14枚・和了する手 ----
ck("平和形 123m456p789s11z 22z…ではなく標準形",
  MJ.Win.isWin(C("1m 2m 3m 4p 5p 6p 7s 8s 9s 1m 2m 3m 5z 5z")), true);
ck("四暗刻形（面子4+雀頭）",
  MJ.Win.isWin(C("1m 1m 1m 2m 2m 2m 3m 3m 3m 4m 4m 4m 5m 5m")), true);
ck("字牌のみの標準形",
  MJ.Win.isWin(C("1z 1z 1z 2z 2z 2z 3z 3z 3z 4z 4z 4z 5z 5z")), true);
ck("七対子",
  MJ.Win.isWin(C("1m 1m 3m 3m 5p 5p 7p 7p 2s 2s 9s 9s 1z 1z")), true);
ck("七対子と判定される",
  MJ.Win.isChiitoi(C("1m 1m 3m 3m 5p 5p 7p 7p 2s 2s 9s 9s 1z 1z")), true);
ck("九蓮宝燈の形（標準形として成立）",
  MJ.Win.isWin(C("1m 1m 1m 2m 3m 4m 5m 6m 7m 8m 9m 9m 9m 9m")), true);
ck("順子3+刻子1+雀頭",
  MJ.Win.isWin(C("2p 3p 4p 5p 6p 7p 1s 2s 3s 7z 7z 7z 9m 9m")), true);

// ---- 14枚・和了しない手 ----
ck("1枚足りない形（雀頭が2つ）",
  MJ.Win.isWin(C("1m 1m 2m 2m 3m 3m 4m 4m 5m 5m 6m 6m 7m 8m")), false);
ck("バラバラ",
  MJ.Win.isWin(C("1m 3m 5m 7m 9m 1p 3p 5p 7p 9p 1s 3s 5s 7z")), false);
// 4枚使いが3種あっても和了する例。ういが最初「和了しない」と読み違えた手。
// 正解は 雀頭 3m3m ＋ 111m / 222m / 123m / 345m。Python の総当たりでも True。
ck("4枚使い3種でも成立する（雀頭3m3m + 111m 222m 123m 345m）",
  MJ.Win.isWin(C("1m 1m 1m 1m 2m 2m 2m 2m 3m 3m 3m 3m 4m 5m")), true);
ck("同じ牌が2組の対子だけ余る",
  MJ.Win.isWin(C("1m 2m 3m 4m 5m 6m 7m 8m 9m 1p 1p 2p 2p 3p")), false);
ck("七対子に見えるが4枚使い（同じ対子2組は不成立）",
  MJ.Win.isChiitoi(C("1m 1m 1m 1m 3m 3m 5p 5p 7p 7p 2s 2s 9s 9s")), false);

// ---- 枚数の異常 ----
ck("13枚は和了でない", MJ.Win.isWin(C("1m 2m 3m 4p 5p 6p 7s 8s 9s 1m 2m 3m 5z")), false);

// ---- 聴牌牌 ----
(function () {
  var c13 = C("1m 2m 3m 4p 5p 6p 7s 8s 9s 1m 2m 3m 5z"); // 5z 単騎
  var w = MJ.Win.tenpaiTiles(c13) || [];
  ck("単騎待ちの待ち牌が1種", w.length === 1, true);
  ck("その待ち牌が 5z(id=31)", w.length === 1 && w[0] === MJ.Tiles.parse("5z"), true);
})();
(function () {
  var c13 = C("1m 2m 3m 4p 5p 6p 7s 8s 9s 5z 5z 2m 3m"); // 1m/4m 両面
  var w = (MJ.Win.tenpaiTiles(c13) || []).slice().sort(function (a, b) { return a - b; });
  var want = [MJ.Tiles.parse("1m"), MJ.Tiles.parse("4m")].sort(function (a, b) { return a - b; });
  ck("両面待ちが2種になる", w.length === 2, true);
  ck("両面の待ち牌が 1m と 4m", JSON.stringify(w) === JSON.stringify(want), true);
})();

// ---- フリテン ----
(function () {
  var waits = [MJ.Tiles.parse("1m"), MJ.Tiles.parse("4m")];
  var river = [{ id: MJ.Tiles.parse("4m") }];
  ck("待ち牌が河にあればフリテン", MJ.Win.isFuriten(waits, river), true);
  ck("待ち牌が河に無ければフリテンでない",
    MJ.Win.isFuriten(waits, [{ id: MJ.Tiles.parse("9p") }]), false);
})();

// ---- 牌コードの往復 ----
(function () {
  var ok = true, ng = null;
  for (var id = 0; id < 34; id++) {
    var code = MJ.Tiles.code(id);
    if (MJ.Tiles.parse(code) !== id) { ok = false; ng = id + " -> " + code; break; }
  }
  ck("34種すべてで code→parse が元に戻る" + (ng ? ("（崩れ: " + ng + "）") : ""), ok, true);
})();

console.log("------------------------------------------------------------");
console.log("PASS " + pass + " / FAIL " + fail);
if (bad.length) { console.log("--- 落ちたもの ---"); bad.forEach(function (b) { console.log("  " + b); }); }
process.exit(fail ? 1 : 0);
