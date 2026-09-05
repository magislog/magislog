var FD = (typeof window !== 'undefined') ? (window.FD = window.FD || {}) : (global.FD = global.FD || {});

// main.js — 起動シーケンスと FD.SelfCheck(§11.2)。SPEC.md §1・§11.2 準拠。
(function () {

  FD.SelfCheck = FD.SelfCheck || {};

  // §11.2 ブラウザ起動時の軽い検算。1 つでも落ちても止めずに続行する(§10.4)。期待値は §11.1 と同じ
  FD.SelfCheck.quick = function () {
    var results = [false, false, false, false];
    try {
      var f = FD.Fund.newFund(1, null);
      results[0] = !!f && FD.Fund.validate(f).length === 0;
      console.assert(results[0], 'SelfCheck 1: newFund(1, null) が null でなく validate が []');

      results[1] = !!f && f.stocks[0].price === 2604 && f.stocks[5].price === 2844;
      console.assert(results[1], 'SelfCheck 2: 1 日目の株価 NOVA 2604 / PETR 2844');

      results[2] = FD.Fund.fee(1000) === 1 && FD.Fund.nextPrice(1000, 600) === 1060;
      console.assert(results[2], 'SelfCheck 3: fee(1000)===1 かつ nextPrice(1000,600)===1060');

      var f2 = FD.Fund.newFund(1, null);                 // 別のファンド(株価を検算用に固定する)
      if (f2) {
        var nova = FD.Fund.stock(f2, 'nova');
        if (nova) {
          nova.price = 2400;
          nova.hist[nova.hist.length - 1] = 2400;
        }
      }
      results[3] = !!f2 && FD.Fund.quoteBuy(f2, 'nova', 10).shares === 416;
      console.assert(results[3], "SelfCheck 4: quoteBuy(f2, 'nova', 10).shares === 416");
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
      FD.UI.message('自己検算 FAIL（console 参照）');
    }
  };

  // §1 起動シーケンス: UI.init → Input.init → Game.toTitle → 定期呼び出し登録(Game.tick, TICK_MS) → SelfCheck
  FD.UI.init();
  FD.Input.init();
  FD.Game.toTitle();
  setInterval(FD.Game.tick, FD.CONFIG.TICK_MS);
  FD.SelfCheck.quick();

})();
