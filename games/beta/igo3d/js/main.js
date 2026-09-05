var IG = (typeof window !== 'undefined') ? (window.IG = window.IG || {}) : (global.IG = global.IG || {});

// main.js — 起動シーケンスと IG.SelfCheck(§11.2)。SPEC.md §1・§11.2 準拠。
(function () {

  IG.SelfCheck = IG.SelfCheck || {};

  // §11.2 ブラウザ起動時の軽い検算。1 つでも落ちても止めずに続行する。
  // L3・L4・L5 の局面文字列は tutorial.js の LESSONS[i].setup から取る(二重に書かない)。
  IG.SelfCheck.quick = function () {
    var results = [false, false, false, false];
    try {
      results[0] = IG.Rules.legalPlays(IG.Rules.empty()).length === 81;
      console.assert(results[0], 'SelfCheck 1: legalPlays(empty()).length === 81');

      var l5 = IG.Tutorial.LESSONS[4].setup;
      var sc = IG.Rules.score(IG.Rules.fromText(l5));
      results[1] = sc.total[1] === 47 && sc.total[2] === 24.5;
      console.assert(results[1], 'SelfCheck 2: score(fromText(L5)).total === {1:47, 2:24.5}');

      var l3 = IG.Tutorial.LESSONS[2].setup;
      results[2] = IG.Rules.illegalReason(IG.Rules.fromText(l3), IG.Rules.parseMove('E5')) === 'suicide';
      console.assert(results[2], "SelfCheck 3: illegalReason(fromText(L3), 'E5') === 'suicide'");

      var l4 = IG.Tutorial.LESSONS[3].setup;
      results[3] = IG.Rules.illegalReason(IG.Rules.fromText(l4), IG.Rules.parseMove('F5')) === 'ko';
      console.assert(results[3], "SelfCheck 4: illegalReason(fromText(L4), 'F5') === 'ko'");
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
      IG.UI.message('自己検算 FAIL（console 参照）');
    }
  };

  // §1 起動シーケンス: UI.init → Input.init → Game.toTitle → watchdog 登録(500ms) → SelfCheck
  IG.UI.init();
  IG.Input.init();
  IG.Game.toTitle();
  setInterval(IG.Game.watchdog, 500);
  IG.SelfCheck.quick();

})();
