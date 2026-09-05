var SG = (typeof window !== 'undefined') ? (window.SG = window.SG || {}) : (global.SG = global.SG || {});

// main.js: 起動シーケンスと SG.SelfCheck(§11.2)。SPEC.md §1・§11.2 準拠。
(function () {

  SG.SelfCheck = SG.SelfCheck || {};

  // §11.2 ブラウザ起動時の軽い検算。1 つでも落ちても止めずに続行する
  SG.SelfCheck.quick = function () {
    var results = [false, false, false, false];
    try {
      var initial = SG.Rules.initial();

      results[0] = SG.Rules.countPieces(initial) === 40;
      console.assert(results[0], 'SelfCheck 1: countPieces(initial) === 40');

      results[1] = SG.Rules.legalMoves(initial).length === 30;
      console.assert(results[1], 'SelfCheck 2: legalMoves(initial).length === 30');

      results[2] = SG.Rules.perft(initial, 2) === 900;
      console.assert(results[2], 'SelfCheck 3: perft(initial, 2) === 900');

      var lesson5Sfen = SG.Tutorial.LESSONS[4].setup;
      results[3] = SG.Rules.fromSfen(lesson5Sfen) !== null;
      console.assert(results[3], 'SelfCheck 4: fromSfen(lesson5) !== null');
    } catch (e) {
      console.error(e);
    }

    var passCount = 0;
    var i;
    for (i = 0; i < results.length; i++) {
      if (results[i]) passCount += 1;
    }
    console.log('SelfCheck: PASS ' + passCount + '/4');
    if (passCount < 4) {
      SG.UI.message('自己検算 FAIL（console 参照）');
    }
  };

  // §1 起動シーケンス: UI.init → Input.init → Game.toTitle → watchdog 登録 → SelfCheck
  SG.UI.init();
  SG.Input.init();
  SG.Game.toTitle();
  setInterval(SG.Game.watchdog, 500);
  SG.SelfCheck.quick();

})();
