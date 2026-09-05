var FM = (typeof window !== 'undefined') ? (window.FM = window.FM || {}) : (global.FM = global.FM || {});

// main.js — 起動シーケンスと FM.SelfCheck(§11.2)。SPEC.md §1・§11.2 準拠。
(function () {

  FM.SelfCheck = FM.SelfCheck || {};

  // §11.2 ブラウザ起動時の軽い検算。1 つでも落ちても止めずに続行する。MAP は CONFIG から取る(二重に書かない)
  FM.SelfCheck.quick = function () {
    var results = [false, false, false, false];
    try {
      var w = FM.World.newWorld();
      results[0] = !!w && w.tiles.length === 15 && w.tiles[0].length === 20;
      console.assert(results[0], 'SelfCheck 1: newWorld().tiles が 15x20');

      results[1] = !!w && FM.World.validate(w).length === 0;
      console.assert(results[1], 'SelfCheck 2: validate(newWorld()) が []');

      results[2] = FM.World.fromText(['x']) === null;
      console.assert(results[2], "SelfCheck 3: fromText(['x']) === null");

      results[3] = !!w && FM.World.count(w, 'grass') === 177;
      console.assert(results[3], 'SelfCheck 4: count(newWorld(), grass) === 177');
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
      FM.UI.message('自己検算 FAIL（console 参照）');
    }
  };

  // §1 起動シーケンス: UI.init → Input.init → Game.toTitle → 定期呼び出し登録(Game.tick, TICK_MS) → SelfCheck
  FM.UI.init();
  FM.Input.init();
  FM.Game.toTitle();
  setInterval(FM.Game.tick, FM.CONFIG.TICK_MS);
  FM.SelfCheck.quick();

})();
