// 表ういの独立チェック（分担Aの自己申告テストとは別に、ういが自分で作ったもの）
// 実行: node js/_ui_check_bets.js
// 教材の芯＝「どの賭け方でも 数字の数 ×（配当+1）= 36」＝期待値がどれも同じ（36/37 = 97.3%）。
// これが崩れていたら、このゲームは教えたいことを教えられない。
"use strict";
global.window = global;
require('./config.js');
require('./bets.js');

var C = RL.CONFIG;
var pass = 0, fail = 0, bad = [];
function ck(label, cond, detail) {
  if (cond) { pass++; console.log("OK  " + label); }
  else { fail++; bad.push(label + (detail ? " :: " + detail : "")); console.log("NG  " + label + (detail ? "  [" + detail + "]" : "")); }
}

// ---- 1) 全マスで「数字の数 ×（配当+1）= 36」 ----
var all = RL.Bets.listAll();
console.log("賭けマスの総数: " + all.length);
var badSpots = [];
all.forEach(function (s) {
  var n = s.numbers.length;
  if (n * (s.pays + 1) !== 36) badSpots.push(s.key + " 数字" + n + "×(" + s.pays + "+1)=" + (n * (s.pays + 1)));
});
ck("全マスで 数字数×(配当+1)=36（期待値が全部同じ）", badSpots.length === 0, badSpots.slice(0, 6).join(" / "));

// ---- 2) 賭け方ごとの数字の数 ----
var byType = {};
all.forEach(function (s) { (byType[s.type] = byType[s.type] || []).push(s); });
var wantCount = {
  straight: 1, split: 2, street: 3, corner: 4, sixline: 6,
  dozen: 12, column: 12, low: 18, high: 18, red: 18, black: 18, odd: 18, even: 18
};
Object.keys(wantCount).forEach(function (t) {
  var list = byType[t] || [];
  var okAll = list.length > 0 && list.every(function (s) { return s.numbers.length === wantCount[t]; });
  ck("賭け方 " + t + " の数字の数が " + wantCount[t], okAll,
    list.length ? ("マス数 " + list.length + " / 例 " + list[0].numbers.length) : "マスが1つも無い");
});

// ---- 3) 0 の扱い（0 はどの外側賭けにも入らない＝控除の正体） ----
var outsideTypes = ["red", "black", "odd", "even", "low", "high", "dozen", "column"];
var zeroIn = all.filter(function (s) {
  return outsideTypes.indexOf(s.type) !== -1 && s.numbers.indexOf(0) !== -1;
});
ck("0 はどの外側賭けにも含まれない（＝控除の正体）", zeroIn.length === 0,
  zeroIn.map(function (s) { return s.key; }).join(","));

// ---- 4) 赤の数字が18個・欧州標準の並び ----
var reds = [];
for (var n = 1; n <= 36; n++) if (RL.Bets.isRed(n)) reds.push(n);
var wantReds = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
ck("赤は18個で欧州標準の並び", JSON.stringify(reds) === JSON.stringify(wantReds), reds.join(","));
// colorOf は色のキー（red/black/green）を返し、CONFIG.COLOR_NAMES で日本語にする作り
// （ういは最初 colorOf が直接「緑」を返すと思い込んだ＝期待値の誤り）
ck("0 は緑（COLOR_NAMES 経由）", C.COLOR_NAMES[RL.Bets.colorOf(0)] === "緑", RL.Bets.colorOf(0));
ck("1 は赤・2 は黒（COLOR_NAMES 経由）",
  C.COLOR_NAMES[RL.Bets.colorOf(1)] === "赤" && C.COLOR_NAMES[RL.Bets.colorOf(2)] === "黒",
  RL.Bets.colorOf(1) + "/" + RL.Bets.colorOf(2));

// ---- 5) 期待値を実際に数えて 36/37 になるか ----
//     1マスに1ずつ賭け、0〜36 の全結果について戻りを合計する
var pockets = C.POCKETS;
var evBad = [];
all.forEach(function (s) {
  var total = 0;
  for (var w = 0; w < pockets; w++) {
    var r = RL.Bets.payout({ k: { spot: s, amount: 1 } }, ["k"], w);
    total += r.totalReturn;
  }
  // 37通りで賭け金は 37。戻りの合計が 36 なら期待値 36/37
  if (total !== 36) evBad.push(s.key + " 戻り合計=" + total);
});
ck("全マスで 37回まわしたときの戻り合計が 36（期待値 36/37 = 97.3%）",
  evBad.length === 0, evBad.slice(0, 6).join(" / "));

// ---- 6) payout の基本 ----
(function () {
  var straight = all.filter(function (s) { return s.type === "straight" && s.numbers[0] === 17; })[0];
  if (!straight) { ck("17のストレートが存在する", false); return; }
  ck("17のストレートが存在する", true);
  var hit = RL.Bets.payout({ a: { spot: straight, amount: 10 } }, ["a"], 17);
  ck("ストレート的中で 戻り=360・純利益=350", hit.totalReturn === 360 && hit.net === 350,
    "戻り" + hit.totalReturn + " 純" + hit.net);
  var miss = RL.Bets.payout({ a: { spot: straight, amount: 10 } }, ["a"], 18);
  ck("外れたら 戻り0・純利益 -10", miss.totalReturn === 0 && miss.net === -10,
    "戻り" + miss.totalReturn + " 純" + miss.net);
  var red = all.filter(function (s) { return s.type === "red"; })[0];
  var z = RL.Bets.payout({ a: { spot: red, amount: 10 } }, ["a"], 0);
  ck("赤に賭けて 0 が出たら負け（戻り0）", z.totalReturn === 0, "戻り" + z.totalReturn);
})();

console.log("------------------------------------------------------------");
console.log("PASS " + pass + " / FAIL " + fail);
if (bad.length) { console.log("--- 落ちたもの ---"); bad.forEach(function (b) { console.log("  " + b); }); }
process.exit(fail ? 1 : 0);
