// roulette3d — main.js（起動・キー入力・M2自己テスト。SPEC.md §7・§5.5）。担当C。
window.RL = window.RL || {};

// ---- M2の自己テスト（RL.Bets / RL.Scene を起動時に確認・§5.5） ----------------------
(function selfTest() {
  var Bets = RL.Bets, C = RL.CONFIG;

  function eqArr(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  function range(a, b) {
    var r = [];
    for (var i = a; i <= b; i++) r.push(i);
    return r;
  }

  function checkSpot(x, y, type, numbers) {
    var s = Bets.spotAt(x, y);
    var ok = (type === null) ? (s === null) : !!(s && s.type === type && eqArr(s.numbers, numbers));
    console.assert(ok, 'M2 self-test spotAt(' + x + ',' + y + ') failed', s);
    return s;
  }

  function checkMove(cur, dir, exp) {
    var r = Bets.moveCursor(cur, dir);
    console.assert(r && r.x === exp.x && r.y === exp.y,
      'M2 self-test moveCursor(' + JSON.stringify(cur) + ',' + dir + ') failed', r);
  }

  // 1
  checkSpot(11, 2, 'straight', [17]);
  checkSpot(10, 2, 'split', [14, 17]);
  checkSpot(10, 1, 'corner', [14, 15, 17, 18]);
  checkSpot(4, 5, 'sixline', [4, 5, 6, 7, 8, 9]);
  checkSpot(1, 5, 'street', [1, 2, 3]);
  checkSpot(23, 0, 'straight', [36]);

  // 2
  var s0 = checkSpot(0, 3, 'straight', [0]);
  console.assert(s0 && s0.key === 'straight:0' && s0.cx === 0 && s0.cy === 2,
    'M2 self-test 2 (zero canonical) failed', s0);
  checkSpot(0, 5, null, null);
  checkSpot(24, 1, null, null);
  checkSpot(24, 0, 'column', [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36]);
  checkSpot(24, 4, 'column', [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34]);

  // 3
  checkSpot(10, 6, 'dozen', range(13, 24));
  checkSpot(4, 6, 'dozen', range(1, 12));
  checkSpot(10, 7, 'red', C.RED_NUMBERS.slice().sort(function (a, b) { return a - b; }));
  checkSpot(2, 7, 'low', range(1, 18));
  checkSpot(22, 7, 'high', range(19, 36));

  // 4
  checkMove({ x: 10, y: 7 }, 'UP', { x: 10, y: 6 });
  checkMove({ x: 10, y: 6 }, 'LEFT', { x: 4, y: 6 });
  checkMove({ x: 4, y: 6 }, 'UP', { x: 4, y: 5 });
  checkMove({ x: 24, y: 0 }, 'DOWN', { x: 24, y: 2 });
  checkMove({ x: 0, y: 4 }, 'DOWN', { x: 1, y: 5 });
  checkMove({ x: 0, y: 0 }, 'LEFT', { x: 0, y: 0 });

  // 5
  var all = Bets.listAll();
  console.assert(all.length === 151, 'M2 self-test 5 (listAll length) failed', all.length);
  var allOk = true;
  for (var i = 0; i < all.length; i++) {
    var sp = all[i];
    var pays = C.BET_TYPES[sp.type].pays;
    if (sp.numbers.length * (pays + 1) !== 36) {
      allOk = false;
      console.error('M2 self-test 5 mismatch', sp);
      break;
    }
  }
  console.assert(allOk, 'M2 self-test 5 (numbers*(pays+1)=36) failed');

  // 6
  var redSpot = Bets.spotAt(10, 7);
  var betsA = {}; betsA[redSpot.key] = { spot: redSpot, amount: 25 };
  var res1 = Bets.payout(betsA, [redSpot.key], 32);
  console.assert(res1.totalReturn === 50 && res1.net === 25, 'M2 self-test 6a failed', res1);
  var res2 = Bets.payout(betsA, [redSpot.key], 0);
  console.assert(res2.totalReturn === 0 && res2.net === -25, 'M2 self-test 6b failed', res2);

  var straightSpot = Bets.spotAt(11, 2);
  var betsB = {}; betsB[straightSpot.key] = { spot: straightSpot, amount: 100 };
  var res3 = Bets.payout(betsB, [straightSpot.key], 17);
  console.assert(res3.totalReturn === 3600 && res3.net === 3500, 'M2 self-test 6c failed', res3);

  var cornerSpot = Bets.spotAt(10, 1);
  var betsC = {}; betsC[cornerSpot.key] = { spot: cornerSpot, amount: 25 };
  var res4 = Bets.payout(betsC, [cornerSpot.key], 14);
  console.assert(res4.totalReturn === 225, 'M2 self-test 6d failed', res4);

  var res5 = Bets.payout(betsA, [redSpot.key], null);
  console.assert(res5.totalReturn === 0, 'M2 self-test 6e (winning null) failed', res5);

  // 7
  console.assert(C.WHEEL_ORDER.length === 37, 'M2 self-test 7a (WHEEL_ORDER length) failed');
  var seen = {}, okOrder = true;
  for (i = 0; i <= 36; i++) seen[i] = 0;
  for (i = 0; i < C.WHEEL_ORDER.length; i++) seen[C.WHEEL_ORDER[i]] = (seen[C.WHEEL_ORDER[i]] || 0) + 1;
  for (i = 0; i <= 36; i++) if (seen[i] !== 1) okOrder = false;
  console.assert(okOrder, 'M2 self-test 7b (WHEEL_ORDER 0..36 once each) failed');
  console.assert(C.RED_NUMBERS.length === 18, 'M2 self-test 7c (RED_NUMBERS length) failed');
  var da = RL.Scene.pocketAngle(1) - RL.Scene.pocketAngle(0);
  console.assert(Math.abs(da - (2 * Math.PI / C.POCKETS)) < 1e-9, 'M2 self-test 7d (pocketAngle step) failed', da);
})();

// ---- 画面のレイアウト（RL.CONFIG.UI.HUD_W/HUD_Hを画面へ収める・§8） -------------------
function layoutStage() {
  var stage = document.getElementById('stage');
  if (!stage) return;
  var W = RL.CONFIG.UI.HUD_W, H = RL.CONFIG.UI.HUD_H;
  var s = Math.min(window.innerWidth / W, window.innerHeight / H);
  var tx = (window.innerWidth - W * s) / 2;
  var ty = (window.innerHeight - H * s) / 2;
  stage.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + s + ')';
}

// ---- キー入力（RL.CONFIG.KEYS = e.code基準。JoyToKey前提・§7） -----------------------

function codeMatches(spec, code) {
  return Array.isArray(spec) ? spec.indexOf(code) !== -1 : spec === code;
}

function handleKeydown(e) {
  var K = RL.CONFIG.KEYS;
  var code = e.code;
  var isArrow = codeMatches(K.LEFT, code) || codeMatches(K.RIGHT, code) ||
    codeMatches(K.UP, code) || codeMatches(K.DOWN, code);

  // preventDefault() は Space と矢印だけ（§7）
  if (code === 'Space' || isArrow) e.preventDefault();

  // e.repeat は ←→↑↓ だけ受け付ける
  if (e.repeat && !isArrow) return;

  var state = RL.Game.state;
  if (!state) return;

  // 優先順: HELP → hold中のOK → phase resultのOK → phase completeのN/T → phase gameoverのOK/T → phase bettingのhumanKey（§7）
  if (codeMatches(K.HELP, code)) { RL.UI.toggleHelp(); return; }

  if (state.hold) {
    if (codeMatches(K.OK, code)) RL.Tutorial.confirm();
    return;
  }

  if (state.phase === 'result') {
    if (codeMatches(K.OK, code)) RL.Game.closeResult();
    return;
  }

  if (state.phase === 'complete') {
    if (codeMatches(K.FREEPLAY, code)) {
      RL.Tutorial.active = false;
      RL.Game.newGame();
      RL.Game.startRound(null);
      return;
    }
    if (codeMatches(K.TUTORIAL, code)) {
      // newGame()を先に呼び、#complete等の画面をここで消す。Tutorial.start()自身は
      // 導入3ページの間newGame()を呼ばないため、先にこちらで呼ばないと導入文の後ろに
      // 前の終局画面が残ったまま透けて見える（麻雀3Dの「画面を消す口を作り忘れる事故」と同型・§12）。
      RL.Game.newGame();
      RL.Tutorial.start();
      return;
    }
    return;
  }

  if (state.phase === 'gameover') {
    if (codeMatches(K.OK, code)) {
      RL.Game.newGame();
      RL.Game.startRound(null);
      return;
    }
    if (codeMatches(K.TUTORIAL, code)) {
      RL.Game.newGame(); // 同上（#gameover画面の消し残り防止）
      RL.Tutorial.start();
      return;
    }
    return;
  }

  if (state.phase !== 'betting') return; // spinning等はタイマーだけが進める（§12）

  if (codeMatches(K.LEFT, code)) { RL.Game.humanKey('LEFT'); return; }
  if (codeMatches(K.RIGHT, code)) { RL.Game.humanKey('RIGHT'); return; }
  if (codeMatches(K.UP, code)) { RL.Game.humanKey('UP'); return; }
  if (codeMatches(K.DOWN, code)) { RL.Game.humanKey('DOWN'); return; }
  if (codeMatches(K.SPIN, code)) { RL.Game.humanKey('SPIN'); return; }
  if (codeMatches(K.CHIP_UP, code)) { RL.Game.humanKey('CHIP_UP'); return; }
  if (codeMatches(K.CHIP_DOWN, code)) { RL.Game.humanKey('CHIP_DOWN'); return; }
  if (codeMatches(K.CHIP_1, code)) { RL.Game.humanKey('CHIP_1'); return; }
  if (codeMatches(K.CHIP_2, code)) { RL.Game.humanKey('CHIP_2'); return; }
  if (codeMatches(K.CHIP_3, code)) { RL.Game.humanKey('CHIP_3'); return; }
  if (codeMatches(K.CHIP_4, code)) { RL.Game.humanKey('CHIP_4'); return; }
  if (codeMatches(K.CANCEL, code)) { RL.Game.humanKey('CANCEL'); return; }
  if (codeMatches(K.OK, code)) { RL.Game.humanKey('OK'); return; }
}

// ---- 起動（Scene.init → UI.init → Game.newGame → Tutorial.start・§1） ----------------

RL.Scene.init(document.getElementById('three'));
RL.UI.init();
RL.Game.newGame();
RL.Tutorial.start();

window.onkeydown = handleKeydown;
window.onresize = layoutStage;
layoutStage();

(function loop() {
  RL.Scene.render();
  requestAnimationFrame(loop);
})();
