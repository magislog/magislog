window.PK = window.PK || {};

// ---- M2 の自己テスト（PK.Eval の役判定を起動時に確認） -----------------------
(function selfTest() {
  function c(codes) { return codes.split(' ').map(PK.Cards.parse); }

  var r1 = PK.Eval.evaluate5(c('As Ks Qs Js Ts'));
  console.assert(r1.cat === 10, 'M2 self-test 1 (royal flush) failed', r1);

  var r2 = PK.Eval.evaluate5(c('2h 2d 2s 2c 9h'));
  console.assert(r2.cat === 8, 'M2 self-test 2 (four of a kind) failed', r2);

  var r3 = PK.Eval.evaluate5(c('Ah 2d 3s 4c 5h'));
  console.assert(r3.cat === 5 && r3.tb[0] === 5, 'M2 self-test 3 (wheel straight) failed', r3);

  var r4 = PK.Eval.evaluate5(c('Ah Kd Qs Jc 9h'));
  console.assert(r4.cat === 1, 'M2 self-test 4 (high card) failed', r4);

  var r5 = PK.Eval.best7(c('Ah Ad 7s 7d 7c 2h 3d'));
  console.assert(r5.cat === 7 && r5.tb[0] === 7 && r5.tb[1] === 14, 'M2 self-test 5 (best7 full house) failed', r5);
})();

// ---- 画面のレイアウト(PK.CONFIG.STAGE の基準サイズを画面へ収める) -------------
function layoutStage() {
  var stage = document.getElementById('stage');
  var W = PK.CONFIG.STAGE.w, H = PK.CONFIG.STAGE.h;
  var s = Math.min(window.innerWidth / W, window.innerHeight / H);
  var tx = (window.innerWidth - W * s) / 2;
  var ty = (window.innerHeight - H * s) / 2;
  stage.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + s + ')';
}

// ---- キー入力(PK.CONFIG.KEYS = e.code 基準。JoyToKey での割当を前提とする) -----

function codeMatches(spec, code) {
  return Array.isArray(spec) ? spec.indexOf(code) !== -1 : spec === code;
}

function isAllowedNow(kind) {
  var legal = PK.Game.legalActions();
  if (legal.indexOf(kind) === -1) return false;
  var allow = PK.Tutorial.allowed();
  if (allow && allow.indexOf(kind) === -1) return false;
  return true;
}

function tryAction(kind) {
  if (!isAllowedNow(kind)) return;
  PK.Game.humanAction({ kind: kind, amount: 0 });
}

function tryEnterRaise() {
  var state = PK.Game.state;
  var p = state.players[0];
  var toCall = state.currentBet - p.betThisRound;
  var kind = toCall === 0 ? 'BET' : 'RAISE';
  if (!isAllowedNow(kind)) return;
  var min = (kind === 'BET') ? PK.CONFIG.BB : (state.currentBet + state.minRaise);
  var max = p.stack + p.betThisRound;
  PK.UI.enterRaise(min, max);
}

function handleKeydown(e) {
  var K = PK.CONFIG.KEYS;
  if (e.repeat && K.REPEATABLE.indexOf(e.code) === -1) return;

  var code = e.code;
  var state = PK.Game.state;
  if (!state) return;

  // H: いつでもキー一覧の表示切替
  if (code === K.HELP) { PK.UI.toggleHelp(); return; }

  // gameover からの再開
  if (state.phase === 'gameover') {
    if (codeMatches(K.CONFIRM, code)) {
      PK.Tutorial.active = false;
      PK.Game.newGame();
      PK.Game.startHand(null);
      return;
    }
    if (code === K.TUTORIAL_RESTART) {
      PK.Game.newGame();
      PK.Tutorial.start();
      return;
    }
    return;
  }

  // チュートリアル文の表示中(hold)
  if (state.hold) {
    if (codeMatches(K.CONFIRM, code)) { PK.Tutorial.confirm(); return; }
    if (PK.Tutorial.isComplete()) {
      if (code === K.FREEPLAY) {
        PK.Tutorial.active = false;
        PK.UI.hideTutorial();
        state.hold = false;
        PK.Game.startHand(null);
        return;
      }
      if (code === K.TUTORIAL_RESTART) {
        PK.Game.newGame();
        PK.Tutorial.start();
        return;
      }
    }
    return;
  }

  // ハンド終了の待ちを飛ばす
  if (state.phase === 'hand_end') {
    if (codeMatches(K.CONFIRM, code)) PK.Game.skipWait();
    return;
  }

  // 額入力モード
  if (PK.UI.isRaiseMode()) {
    var step = PK.CONFIG.RAISE_STEP_BB * PK.CONFIG.BB;
    var info = PK.UI.raiseInfo();
    if (code === K.UP) { PK.UI.setRaise(Math.min(info.max, info.total + step)); return; }
    if (code === K.DOWN) { PK.UI.setRaise(Math.max(info.min, info.total - step)); return; }
    if (codeMatches(K.CONFIRM, code)) {
      var kind = (PK.Game.legalActions().indexOf('BET') !== -1) ? 'BET' : 'RAISE';
      PK.Game.humanAction({ kind: kind, amount: PK.UI.raiseInfo().total });
      return;
    }
    if (codeMatches(K.BACK, code)) { PK.UI.exitRaise(); return; }
    return;
  }

  // 通常の行動選択(自分の手番のときだけ)
  if (state.phase !== 'wait_human') return;

  if (code === K.LEFT) { PK.UI.moveSelect(-1); return; }
  if (code === K.RIGHT) { PK.UI.moveSelect(1); return; }
  if (code === K.FOLD) { tryAction('FOLD'); return; }
  if (code === K.CHECKCALL) {
    var toCall = state.currentBet - state.players[0].betThisRound;
    tryAction(toCall === 0 ? 'CHECK' : 'CALL');
    return;
  }
  if (code === K.ALLIN) { tryAction('ALLIN'); return; }
  if (code === K.RAISEBET) { tryEnterRaise(); return; }
  if (codeMatches(K.CONFIRM, code)) {
    var sel = PK.UI.selected();
    if (!sel) return;
    if (sel === 'BET' || sel === 'RAISE') tryEnterRaise();
    else tryAction(sel);
    return;
  }
}

// ---- 起動 --------------------------------------------------------------

PK.Scene.init(document.getElementById('three'));
PK.UI.init();
PK.Game.newGame();
PK.Tutorial.start();

window.onkeydown = handleKeydown;
window.onresize = layoutStage;
layoutStage();

(function loop() {
  PK.Scene.render();
  requestAnimationFrame(loop);
})();
