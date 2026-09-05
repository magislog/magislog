// 表ういの独立チェック（役14種が実際に出るか）。
// 実行: node js/_ui_check_yaku.js
// 実機のチュートリアルでは6種しか発火しなかったため、残りも含めて外から確かめる。
"use strict";
global.window = global;
require('./config.js');
require('./tiles.js');
require('./win.js');
require('./score.js');

function T(str) {
  return str.trim().split(/\s+/).map(function (t, i) {
    var id = MJ.Tiles.parse(t);
    if (typeof id !== "number") throw new Error("parse失敗: " + t);
    return { id: id, uid: i };
  });
}

var pass = 0, fail = 0, bad = [];
function has(list, name) {
  for (var i = 0; i < list.length; i++) if (list[i].name.indexOf(name) === 0) return list[i];
  return null;
}
function ck(label, hand, opt, wantName, wantHan) {
  var tiles = T(hand);
  var ctx = {
    hand14: tiles,
    hand: tiles,
    winTile: tiles[tiles.length - 1],
    isTsumo: opt.tsumo === undefined ? true : opt.tsumo,
    riichi: !!opt.riichi,
    seatWind: opt.seatWind === undefined ? 0 : opt.seatWind,
    roundWind: opt.roundWind === undefined ? 0 : opt.roundWind,
    isDealer: !!opt.dealer,
    // doraInd は牌の実体 {id, uid}。数値の id を渡すのは誤り（ういの最初の誤り）
    doraInd: opt.doraInd === undefined ? null : { id: MJ.Tiles.parse(opt.doraInd), uid: 200 }
  };
  var res = MJ.Score.calc(ctx);
  if (!res) {
    fail++; bad.push(label + " :: 役なし(null)が返った");
    console.log("NG  " + label + "  (null)");
    return;
  }
  var y = has(res.yaku, wantName);
  var ok = !!y && (wantHan === undefined || y.han === wantHan);
  if (ok) { pass++; } else { fail++; bad.push(label + " :: 出た役=" + res.yaku.map(function (a) { return a.name + a.han; }).join(",")); }
  console.log((ok ? "OK  " : "NG  ") + label + "   [" + res.yaku.map(function (a) { return a.name + " " + a.han; }).join(" / ") + "]  " + res.han + "翻" + res.fu + "符 " + res.total + "点");
}

console.log("=== 役が出るかの独立チェック（表うい） ===");

// 1翻
ck("門前清自摸和", "1m 2m 3m 4p 5p 6p 7s 8s 9s 2m 3m 4m 5z 5z", { tsumo: true }, "門前清自摸和", 1);
ck("リーチ",       "1m 2m 3m 4p 5p 6p 7s 8s 9s 2m 3m 4m 5z 5z", { riichi: true }, "リーチ", 1);
ck("断么九",       "2m 3m 4m 4p 5p 6p 7s 8s 6s 2m 3m 4m 5p 5p", { tsumo: true }, "断么九", 1);
ck("役牌（中）",   "7z 7z 7z 2m 3m 4m 4p 5p 6p 7s 8s 9s 5p 5p", { tsumo: true }, "役牌", 1);
// 平和は「両面待ちで和了る」ことが条件。最後の牌が和了牌になるので、
// 2p3p に 4p が来て 234p が完成する形にする（単騎待ちにすると平和はつかない＝ういの最初の誤り）
ck("平和",         "2m 3m 4m 4p 5p 6p 7s 8s 9s 6s 6s 2p 3p 4p", { tsumo: false }, "平和", 1);
ck("一盃口",       "2m 3m 4m 2m 3m 4m 4p 5p 6p 7s 8s 9s 5z 5z", { tsumo: true }, "一盃口", 1);

// 2翻
ck("七対子",       "1m 1m 3m 3m 5p 5p 7p 7p 2s 2s 9s 9s 1z 1z", { tsumo: true }, "七対子", 2);
ck("対々和",       "1m 1m 1m 5p 5p 5p 9s 9s 9s 3z 3z 3z 7z 7z", { tsumo: true }, "対々和", 2);
ck("一気通貫",     "1m 2m 3m 4m 5m 6m 7m 8m 9m 4p 5p 6p 5z 5z", { tsumo: true }, "一気通貫", 2);
ck("三色同順",     "2m 3m 4m 2p 3p 4p 2s 3s 4s 6m 7m 8m 5z 5z", { tsumo: true }, "三色同順", 2);

// 3翻・6翻
ck("混一色",       "1m 2m 3m 5m 6m 7m 9m 9m 9m 1z 1z 1z 5z 5z", { tsumo: true }, "混一色", 3);
ck("清一色",       "1m 2m 3m 4m 5m 6m 7m 8m 9m 2m 3m 4m 5m 5m", { tsumo: true }, "清一色", 6);

// ドラ
// 表示牌の「次の牌」がドラ。5p をドラにしたいので表示牌は 4p（1p を指すと 2p がドラで、
// この手には1枚も無い＝ういの最初の誤り）
// この手の 5p は 4p5p6p の1枚＋雀頭2枚＝計3枚。よってドラは3（ういは最初2と数え違えた）
ck("ドラ3",        "2m 3m 4m 4p 5p 6p 7s 8s 6s 2m 3m 4m 5p 5p", { tsumo: true, doraInd: "4p" }, "ドラ", 3);

// 自風・場風
ck("自風牌（東）", "1z 1z 1z 2m 3m 4m 4p 5p 6p 7s 8s 9s 5p 5p", { tsumo: true, seatWind: 0, roundWind: 1 }, "自風牌", 1);
ck("場風牌（南）", "2z 2z 2z 2m 3m 4m 4p 5p 6p 7s 8s 9s 5p 5p", { tsumo: true, seatWind: 0, roundWind: 1 }, "場風牌", 1);

console.log("------------------------------------------------------------");
console.log("PASS " + pass + " / FAIL " + fail);
if (bad.length) { console.log("--- 出なかったもの ---"); bad.forEach(function (b) { console.log("  " + b); }); }
process.exit(fail ? 1 : 0);
