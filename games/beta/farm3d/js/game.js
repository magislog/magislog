var FM = (typeof window !== 'undefined') ? (window.FM = window.FM || {}) : (global.FM = global.FM || {});

// FM.Game — 進行状態(state)と、局面を進める一連の関数。SPEC.md §2.5・§9・§10 準拠。
// このファイルが world を差し替えるのは loadWorld() の 1 か所だけ(§2.5)。
//
// ★事故対策メモ(このファイル内で守ること。詳細は SPEC.md §10):
//  - state.hold はここでは絶対に書き換えない。読むだけ(§10.1)。タイトルへ戻すのは
//    直接いじらず必ず FM.Tutorial.stop() を呼ぶ。
//  - 遅延して局面(日付)を進める予約は sleep()/wake() の 2 か所だけ(§10.3)。
//    予約時に seq を token として閉じ込め、発火時に照合する。定期呼び出しは main.js が 1 本だけ持つ。
//  - タイルの参照は FM.World.at/front/target を通し、null は例外にせず受け止める(§10.4)。
//    wake・tick・recover は try/catch で包み、失敗したら recover() で必ず前へ進む。
//  - 位置が同じかどうかは FM.World.samePos の構造比較だけを使う。文字列化して
//    比べない(§10.5・2026-09-05 将棋の事故)。ここでは道具・種類の識別子はそのまま値で比べる。
(function () {

  FM.Game = FM.Game || {};

  function initialState() {
    return {
      world: null,
      mode: 'free',            // 'free' | 'tutorial'
      phase: 'title',           // 'title' | 'play' | 'sleep'
      hold: false,               // 案内帯が出ていて Z 待ち(§10.1)。読むだけ
      menuOpen: false,
      menuIndex: 0,
      dialog: null,               // null | {kind:'sleep', index:0} | {kind:'shop', index:0}
      seq: 0,                      // 世界の世代番号。loadWorld と sleep で +1(§10.3)
      timer: null,                  // 寝る演出の遅延予約 id。常に 1 本
      sleepSince: 0,
      chickenAt: 0,
      lastReport: null,
      titleIndex: 0
    };
  }

  FM.Game.state = initialState();

  // ------------------------------------------------------------------
  // 内部ヘルパー(FM.Game の公開 API には出さない。§1 の一覧に無いもの)
  // ------------------------------------------------------------------

  function message(text) {
    FM.UI.message(text);
  }

  // §9.2 ship の内訳「かぶ ×2、たまご ×3」。0 でない種類だけを CROP_ORDER → たまご の順でつなぐ
  function produceBreakdown(moved) {
    var order = FM.CONFIG.CROP_ORDER;
    var parts = [];
    var i, kind;
    for (i = 0; i < order.length; i++) {
      kind = order[i];
      if (moved[kind] > 0) parts.push(FM.Game.cropName(kind) + ' ×' + moved[kind]);
    }
    if (moved.egg > 0) parts.push(FM.Game.cropName('egg') + ' ×' + moved.egg);
    return parts.join('、');
  }

  // §7.5 寝るダイアログの見出し(所持金ではなく日数)
  function sleepHeading(world) {
    return '寝ますか？（' + world.day + ' 日目を終えます）';
  }

  // §7.5 店ダイアログの見出し(所持金を都度作り直す)と行(CONFIG から組む。数値を直書きしない・§10.6)
  function shopHeading(world) {
    return '店　所持金 ' + world.money + ' G';
  }

  function shopRows() {
    var C = FM.CONFIG.CROPS;
    var order = FM.CONFIG.CROP_ORDER;
    return [
      '1 ' + C[order[0]].name + 'のたね ' + C[order[0]].seedPrice + ' G',
      '2 ' + C[order[1]].name + 'のたね ' + C[order[1]].seedPrice + ' G',
      '3 ' + C[order[2]].name + 'のたね ' + C[order[2]].seedPrice + ' G',
      '閉じる'
    ];
  }

  // ------------------------------------------------------------------
  // FM.Game 公開 API(§1 の一覧のとおり)
  // ------------------------------------------------------------------

  // world を差し替える唯一の場所(§2.5)。壊れたマップ(null)でも落ちない(§2.3・§10.4)
  FM.Game.loadWorld = function (world) {
    var st = FM.Game.state;
    clearTimeout(st.timer);
    st.timer = null;
    if (!world) {
      console.error('loadWorld: world が null です（config.js の MAP を確認してください）');
      st.world = null;
      st.seq += 1;
      message('マップが壊れています（config.js の MAP）');
      FM.Game.render();
      return;
    }
    st.world = world;
    st.seq += 1;
    st.chickenAt = performance.now();
    FM.Game.render();
  };

  // §9.1
  FM.Game.startFree = function () {
    var st = FM.Game.state;
    st.mode = 'free';
    FM.Tutorial.stop();
    FM.UI.hideTitle();
    FM.UI.hideBanner();
    FM.UI.hideMenu();
    FM.UI.hideDialog();
    st.dialog = null;
    st.menuOpen = false;
    var w = FM.World.newWorld();
    FM.Game.loadWorld(w);
    if (!w) { FM.Game.toTitle(); return; }
    st.phase = 'play';
    message('1 日目。1 くわ で草地を耕すところから');
    FM.UI.task('');
    FM.Game.render();
  };

  // §9.1(チュートリアル完了から。牧場・持ち物・日数はそのまま)
  FM.Game.toFree = function () {
    var st = FM.Game.state;
    st.mode = 'free';
    FM.Tutorial.stop();
    FM.UI.hideBanner();
    st.phase = 'play';
    message('フリープレイ。好きに牧場を育ててください（S → タイトルへ で終了）');
    FM.Game.render();
  };

  // §9.2(phase !== 'play' は dispatch が先に弾いているが、二重に守る・§10.4)
  FM.Game.move = function (dir) {
    var st = FM.Game.state;
    if (st.phase !== 'play' || !st.world) return;
    FM.World.move(st.world, dir);
    FM.Game.render();
    if (FM.Tutorial.active) FM.Tutorial.onEvent('move');
  };

  // §3.2・§9.2(道具・対象・結果の判定は World.act の 1 関数に閉じ、ここは結果の表示だけ)
  FM.Game.act = function () {
    var st = FM.Game.state;
    if (st.phase !== 'play' || !st.world) return;

    var res = FM.World.act(st.world);
    var RT = FM.CONFIG.REASON_TEXT;
    var kind = res.kind;

    if (kind === 'door') { FM.Game.openDialog('sleep'); return; }
    if (kind === 'shop') { FM.Game.openDialog('shop'); return; }

    if (kind === 'ship') {
      if (res.ok) {
        message('出荷箱に入れた: ' + produceBreakdown(res.extra.moved) + '（あす ' + res.extra.value + ' G）');
      } else {
        message(RT.nothing_to_ship);
      }
    } else if (kind === 'egg') {
      message('たまごを拾った（たまご ' + st.world.inv.produce.egg + '）');
    } else if (kind === 'till') {
      message(res.ok ? ('耕した（体力 −' + res.cost + '）') : RT[res.reason]);
    } else if (kind === 'water') {
      message(res.ok ? ('水をやった（体力 −' + res.cost + '）') : RT[res.reason]);
    } else if (kind === 'sow') {
      if (res.ok) {
        var sk = res.extra.kind;
        message(FM.Game.cropName(sk) + 'のたねをまいた（残り ' + st.world.inv.seeds[sk] + '）');
      } else {
        message(RT[res.reason]);
      }
    } else if (kind === 'harvest') {
      if (res.ok) {
        var hk = res.extra.kind;
        message(FM.Game.cropName(hk) + 'を収穫した（体力 −' + res.cost + '）');
      } else {
        message(RT[res.reason]);
      }
    } else {
      message(RT.none);
    }

    FM.Game.render();
    if (FM.Tutorial.active) FM.Tutorial.onEvent('act', res);
    if (res.ok && res.exhausted) FM.Game.sleep('exhausted');   // ★体力 0 → 強制睡眠
  };

  // §3.3・§9.2(3 の 2 度押しは World 側で cycleSeed するのでここは呼ぶだけ)
  FM.Game.selectTool = function (i) {
    var st = FM.Game.state;
    if (st.phase !== 'play' || !st.world) return;
    FM.World.selectTool(st.world, i);
    FM.Game.render();
  };

  // §7.5(寝る・買うはダイアログの中だけ。phase==='play' かつ !hold のときだけ開く)
  FM.Game.openDialog = function (kind) {
    var st = FM.Game.state;
    if (st.phase !== 'play' || st.hold || !st.world) return;
    st.dialog = { kind: kind, index: 0 };
    if (kind === 'sleep') {
      FM.UI.showDialog(sleepHeading(st.world), ['寝る', 'やめる'], 'Z 決定 ／ X やめる');
    } else if (kind === 'shop') {
      FM.UI.showDialog(shopHeading(st.world), shopRows(), '1〜3 で買う ／ X 閉じる');
    }
    FM.Game.render();
  };

  FM.Game.closeDialog = function () {
    var st = FM.Game.state;
    st.dialog = null;
    FM.UI.hideDialog();
    FM.Game.render();
  };

  // §7.4 の行 4(dialog中の ok)。kind ごとに分かれる。sleep: index0=寝る/1=やめる。shop: index0〜2=買う/3=閉じる
  FM.Game.dialogOk = function () {
    var st = FM.Game.state;
    if (!st.dialog) return;
    if (st.dialog.kind === 'sleep') {
      var idx = st.dialog.index;
      FM.Game.closeDialog();
      if (idx === 0) FM.Game.sleep('door');
    } else if (st.dialog.kind === 'shop') {
      var order = FM.CONFIG.CROP_ORDER;
      if (st.dialog.index >= 0 && st.dialog.index <= 2) {
        FM.Game.buy(order[st.dialog.index]);       // 閉じない・続けて買える(§7.5)
      } else {
        FM.Game.closeDialog();
      }
    }
  };

  // §7.4 の行 4(dialog中の up/down)。sleep は 0↔1 のトグル、shop は 0〜3 で端に止まる
  FM.Game.dialogMove = function (d) {
    var st = FM.Game.state;
    if (!st.dialog) return;
    if (st.dialog.kind === 'sleep') {
      st.dialog.index = (st.dialog.index === 0) ? 1 : 0;
    } else if (st.dialog.kind === 'shop') {
      var idx = st.dialog.index + (d === 'down' ? 1 : -1);
      if (idx < 0) idx = 0;
      if (idx > 3) idx = 3;
      st.dialog.index = idx;
    }
    FM.Game.render();
  };

  // §3.4・§9.2
  FM.Game.buy = function (kind) {
    var st = FM.Game.state;
    if (!st.world) return;
    var r = FM.World.buy(st.world, kind);
    var RT = FM.CONFIG.REASON_TEXT;
    if (r.ok) {
      message(FM.Game.cropName(kind) + 'のたねを買った（−' + r.price + ' G）');
    } else {
      message(RT[r.reason]);
    }
    if (st.dialog && st.dialog.kind === 'shop') {
      FM.UI.showDialog(shopHeading(st.world), shopRows(), '1〜3 で買う ／ X 閉じる');
    }
    FM.Game.render();
    if (FM.Tutorial.active) FM.Tutorial.onEvent('buy');
  };

  // §9.3・§10.3: 遅延して局面(日付)を進める予約はここ(sleep)と wake の 2 か所だけ
  FM.Game.sleep = function (reason) {
    var st = FM.Game.state;
    if (st.phase !== 'play') return;
    clearTimeout(st.timer);
    st.phase = 'sleep';
    st.sleepSince = performance.now();
    var report = FM.World.nextDay(st.world);          // ★世界はここで進む(表示だけが遅れる)
    st.seq += 1;
    st.lastReport = report;
    FM.UI.showBanner(
      reason === 'exhausted' ? '力尽きて眠った…' : 'おやすみ…',
      report.day + ' 日目の朝',
      report.income > 0 ? '出荷 +' + report.income + ' G' : ''
    );
    var token = st.seq;                                 // ★発火時に「今どの世界か」を照合する(§10.3)
    st.timer = setTimeout(function () { FM.Game.wake(token); }, FM.CONFIG.SLEEP_MS);
    FM.Game.render();
  };

  FM.Game.wake = function (token) {
    var st = FM.Game.state;
    try {
      if (token !== undefined && token !== st.seq) return;    // 世界が変わっていたら何もしない(古い予約)
      if (st.phase !== 'sleep') return;                          // タイトルへ戻った等
      if (st.hold || st.menuOpen || st.dialog) {
        st.timer = setTimeout(function () { FM.Game.wake(token); }, FM.CONFIG.RETRY_MS);
        return;
      }
      FM.UI.hideBanner();
      st.phase = 'play';
      var rep = st.lastReport;
      message(
        rep.day + ' 日目の朝。' +
        (rep.income > 0 ? '出荷で +' + rep.income + ' G。' : '') +
        (rep.laid > 0 ? 'たまご +' + rep.laid : '')
      );
      FM.Game.render();
      if (FM.Tutorial.active) FM.Tutorial.onEvent('day', rep);
    } catch (e) {
      console.error(e);
      FM.Game.recover();
    }
  };

  // §9.5: 定期処理。呼ぶのは main.js の定期呼び出し 1 本だけ
  FM.Game.tick = function () {
    var st = FM.Game.state;
    try {
      var now = performance.now();
      if (st.phase === 'play' && !st.hold && !st.menuOpen && !st.dialog && st.world &&
          (now - st.chickenAt) >= FM.CONFIG.CHICKEN_STEP_MS) {
        st.chickenAt = now;
        if (FM.World.stepChickens(st.world, Math.random)) FM.Game.render();
      }
      if (st.phase === 'sleep' && (now - st.sleepSince) > FM.CONFIG.WATCHDOG_MS) {
        console.warn('watchdog: sleep');
        FM.Game.wake(undefined);                     // token 照合なしで直接起こす
      }
    } catch (e) {
      console.error(e);
      FM.Game.recover();
    }
  };

  // §10.4: 例外から復帰する。hold の書き換えは Tutorial.confirm()/stop() 経由でのみ行う
  FM.Game.recover = function () {
    var st = FM.Game.state;
    clearTimeout(st.timer);
    st.menuOpen = false;
    FM.UI.hideMenu();
    st.dialog = null;
    FM.UI.hideDialog();

    if (FM.Tutorial.active && st.hold) {
      try {
        FM.Tutorial.confirm();
      } catch (e2) {
        console.error(e2);
        FM.Tutorial.stop();
        FM.Game.toTitle();
      }
    } else if (!FM.Tutorial.active && st.hold) {
      FM.Tutorial.stop();
    }

    if (st.phase === 'sleep') {
      FM.UI.hideBanner();
      st.phase = 'play';
    }

    if (st.phase !== 'title') {
      var errs = st.world ? FM.World.validate(st.world) : ['world is null'];
      if (errs.length > 0) {
        console.error(errs);
        FM.Game.loadWorld(FM.World.newWorld());        // 牧場を作り直す。止まるよりまし
      }
    }

    message('内部エラーが起きました。続行します（console 参照）');
    FM.Game.render();
  };

  // §9.4: 全状態からの共通の戻り先
  FM.Game.toTitle = function () {
    var st = FM.Game.state;
    clearTimeout(st.timer);
    st.timer = null;
    FM.Tutorial.stop();
    st.menuOpen = false;
    st.dialog = null;
    FM.UI.hideMenu();
    FM.UI.hideDialog();
    FM.UI.hideBanner();
    FM.Game.loadWorld(FM.World.newWorld());     // null でも loadWorld が落ちない(§2.3)。タイトルは必ず出す
    st.phase = 'title';
    st.titleIndex = 0;
    FM.UI.showTitle();
    message('');
    FM.Game.render();
  };

  // §9.2: cropName(kind) = CONFIG.CROPS[kind].name('egg' は CONFIG.EGG_NAME)
  FM.Game.cropName = function (kind) {
    if (kind === 'egg') return FM.CONFIG.EGG_NAME;
    var c = FM.CONFIG.CROPS[kind];
    return c ? c.name : '';
  };

  // §6.3・§6.5: UI.render 呼び出しの唯一の入口。指示のマスは局面で動くので毎回 markHint してから render する
  FM.Game.render = function () {
    try {
      var st = FM.Game.state;
      FM.UI.markHint(FM.Tutorial.active ? FM.Tutorial.hintFor(st.world) : null);
      FM.UI.render(st);
    } catch (e) {
      console.error(e);
    }
  };

})();
