// main.js — 起動・キー入力・M2 自己テスト（SPEC.md §7・§5.4）。担当C。
window.MJ = window.MJ || {};

// ---- M2 の自己テスト（MJ.Win / MJ.Score を起動時に確認・§5.4） -----------------
(function selfTest() {
  // "234m456m678m234p55p" のような連結表記を ["2m","3m","4m",...] に展開する
  function parseCompact(str) {
    var codes = [];
    var re = /(\d+)([mpsz])/g;
    var m;
    while ((m = re.exec(str))) {
      var digits = m[1], suit = m[2];
      for (var i = 0; i < digits.length; i++) codes.push(digits[i] + suit);
    }
    return codes;
  }
  function countsFromCompact(str) {
    var c = new Array(34);
    for (var i = 0; i < 34; i++) c[i] = 0;
    parseCompact(str).forEach(function (code) { c[MJ.Tiles.parse(code)]++; });
    return c;
  }
  function entitiesFromCompact(str) {
    var used = {};
    return parseCompact(str).map(function (code) {
      var id = MJ.Tiles.parse(code);
      used[id] = used[id] || 0;
      var ent = { id: id, uid: id * 4 + used[id] };
      used[id]++;
      return ent;
    });
  }
  function lastEntityWithId(entities, code) {
    var id = MJ.Tiles.parse(code);
    for (var i = entities.length - 1; i >= 0; i--) {
      if (entities[i].id === id) return entities[i];
    }
    return null;
  }
  function tileEnt(code) { return { id: MJ.Tiles.parse(code), uid: 0 }; }

  // 1
  console.assert(MJ.Win.isWin(countsFromCompact('234m456m678m234p55p')) === true, 'M2 self-test 1a failed');
  console.assert(MJ.Win.isWin(countsFromCompact('345m678p456s678s22s')) === true, 'M2 self-test 1b failed');
  console.assert(MJ.Win.isWin(countsFromCompact('11m22p33s44m55p66s77z')) === true, 'M2 self-test 1c (chiitoi) failed');
  var tp = MJ.Win.tenpaiTiles(countsFromCompact('234m456m678m23p55p'));
  console.assert(tp.indexOf(9) !== -1 && tp.indexOf(12) !== -1 && tp.length === 2,
    'M2 self-test 1d (tenpaiTiles 1p/4p) failed', tp);

  // 2: 国士無双は和了形として認めない
  console.assert(MJ.Win.isWin(countsFromCompact('19m19p19s1234567z')) === false, 'M2 self-test 2 failed');

  // 3: 東1局の台本（親のツモ）
  var hand3 = entitiesFromCompact('234m456m678m234p55p');
  var res3 = MJ.Score.calc({
    hand14: hand3, winTile: lastEntityWithId(hand3, '4p'), isTsumo: true, riichi: false,
    seatWind: 0, roundWind: 0, doraInd: tileEnt('1z'), isDealer: true
  });
  console.assert(res3 && res3.han === 3 && res3.fu === 20 && res3.base === 640 &&
    res3.pay.child === 1300 && res3.total === 3900, 'M2 self-test 3 (東1局) failed', res3);

  // 4: 東2局の台本（子のリーチロン）
  var hand4 = entitiesFromCompact('345m678p456s678s22s');
  var res4 = MJ.Score.calc({
    hand14: hand4, winTile: lastEntityWithId(hand4, '6s'), isTsumo: false, riichi: true,
    seatWind: 1, roundWind: 0, doraInd: tileEnt('9m'), isDealer: false
  });
  console.assert(res4 && res4.han === 3 && res4.fu === 30 && res4.base === 960 &&
    res4.payRon === 3900, 'M2 self-test 4 (東2局) failed', res4);

  // 5: 東3局の台本（子のツモ・役牌+ドラ）
  var hand5 = entitiesFromCompact('234m567p99p456s777z');
  var res5 = MJ.Score.calc({
    hand14: hand5, winTile: lastEntityWithId(hand5, '6s'), isTsumo: true, riichi: false,
    seatWind: 2, roundWind: 0, doraInd: tileEnt('4s'), isDealer: false
  });
  console.assert(res5 && res5.han === 3 && res5.fu === 30 && res5.base === 960 &&
    res5.pay.dealer === 2000 && res5.pay.child === 1000 && res5.total === 4000,
    'M2 self-test 5 (東3局) failed', res5);

  // 6: 上限額（満貫・役満）
  var hand6a = entitiesFromCompact('22m33m44m55p66p77p88s'); // 七対子・断么九（混一色/清一色を避けるため3色に分散）
  var res6a = MJ.Score.calc({
    hand14: hand6a, winTile: lastEntityWithId(hand6a, '8s'), isTsumo: true, riichi: true,
    seatWind: 0, roundWind: 0, doraInd: tileEnt('9p'), isDealer: false
  });
  console.assert(res6a && res6a.han === 5 && res6a.base === 2000 && res6a.limit === '満貫',
    'M2 self-test 6a (満貫) failed', res6a);

  var hand6b = entitiesFromCompact('123m345m456m789m11m'); // 清一色+一気通貫+ドラ3
  var res6b = MJ.Score.calc({
    hand14: hand6b, winTile: lastEntityWithId(hand6b, '8m'), isTsumo: true, riichi: true,
    seatWind: 0, roundWind: 0, doraInd: tileEnt('9m'), isDealer: false
  });
  console.assert(res6b && res6b.han >= 13 && res6b.base === 8000 && res6b.limit === '役満',
    'M2 self-test 6b (役満) failed', res6b);
})();

// ---- 画面のレイアウト（MJ.CONFIG.UI.HUD_W/HUD_H を画面へ収める・§8） -----------
function layoutStage() {
  var stage = document.getElementById('stage');
  var W = MJ.CONFIG.UI.HUD_W, H = MJ.CONFIG.UI.HUD_H;
  var s = Math.min(window.innerWidth / W, window.innerHeight / H);
  var tx = (window.innerWidth - W * s) / 2;
  var ty = (window.innerHeight - H * s) / 2;
  stage.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + s + ')';
}

// ---- キー入力（MJ.CONFIG.KEYS = e.code 基準。JoyToKey 前提・§7） --------------

function codeMatches(spec, code) {
  return Array.isArray(spec) ? spec.indexOf(code) !== -1 : spec === code;
}

function handleKeydown(e) {
  var K = MJ.CONFIG.KEYS;
  var code = e.code;
  var isArrow = codeMatches(K.LEFT, code) || codeMatches(K.RIGHT, code);

  // preventDefault() は Space と矢印だけ（§7）
  if (code === 'Space' || isArrow) e.preventDefault();

  // e.repeat は ←→ だけ受け付ける
  if (e.repeat && !isArrow) return;

  var state = MJ.Game.state;
  if (!state) return;

  // 優先順: HELP → hold中のOK → round_endのOK → game_endのN/T → humanAction（§7）
  if (codeMatches(K.HELP, code)) { MJ.UI.toggleHelp(); return; }

  if (state.hold) {
    if (codeMatches(K.OK, code)) MJ.Tutorial.confirm();
    return;
  }

  if (state.phase === 'round_end') {
    if (codeMatches(K.OK, code)) MJ.Game.closeResult();
    return;
  }

  if (state.phase === 'game_end') {
    if (codeMatches(K.FREEPLAY, code)) {
      MJ.Tutorial.active = false;
      MJ.Game.newGame();
      MJ.Game.startRound(null);
      return;
    }
    if (codeMatches(K.TUTORIAL, code)) {
      MJ.Game.newGame();
      MJ.Tutorial.start();
      return;
    }
    return;
  }

  // 手番でない・許可外(Tutorial.allowed に無い)・その phase に無い操作は
  // MJ.Game.humanAction 側で無視される（エラーにしない・止まらない）
  if (codeMatches(K.LEFT, code)) { MJ.Game.humanAction('LEFT'); return; }
  if (codeMatches(K.RIGHT, code)) { MJ.Game.humanAction('RIGHT'); return; }
  if (codeMatches(K.RIICHI, code)) { MJ.Game.humanAction('RIICHI'); return; }
  if (codeMatches(K.WIN, code)) {
    if (state.phase === 'wait_ron') MJ.Game.humanAction('RON');
    else MJ.Game.humanAction('TSUMO');
    return;
  }
  if (codeMatches(K.CANCEL, code)) {
    if (state.phase === 'wait_ron') MJ.Game.humanAction('PASS');
    else MJ.Game.humanAction('CANCEL');
    return;
  }
  if (codeMatches(K.OK, code)) { MJ.Game.humanAction('DISCARD'); return; }
}

// ---- 起動（Scene.init → UI.init → Game.newGame → Tutorial.start・§1） --------

MJ.Scene.init(document.getElementById('three'));
// scene.js の init() は buildTable/buildFloor/buildLamp/buildChair(1..3) までしか
// 呼んでいないため、牌山(§10 受入チェック2の必須物)と湯呑みをここで補って作る。
// scene.js は分担Bのファイルなので直接は編集しない。js/_NOTES.txt に記録済み。
for (var _s = 0; _s < 4; _s++) {
  MJ.Scene.buildProps(_s);
}
MJ.Scene.buildWalls();

MJ.UI.init();
MJ.Game.newGame();
MJ.Tutorial.start();

window.onkeydown = handleKeydown;
window.onresize = layoutStage;
layoutStage();

(function loop() {
  MJ.Scene.render();
  requestAnimationFrame(loop);
})();
