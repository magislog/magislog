var FD = (typeof window !== 'undefined') ? (window.FD = window.FD || {}) : (global.FD = global.FD || {});

// FD.Input: キーとマウスを 9 種の action（up/down/left/right/ok/cancel/special/num/point）に落とし、
// dispatch(action, arg) の 1 本だけで処理する。SPEC.md §1・§7 準拠。経路は分けない（3D ではない）。
//   num   の arg = 1〜9 の整数（ダイアログの中だけで有効。割合 10%〜90% に対応。§7.1・§7.2）
//   point の arg = {type:'button', id, index}（マウス専用。§7.1・§7.3）
//     id は 'row'（表の行 0〜6）／'dialog'（ダイアログの行 0〜2）／'pctMinus'／'pctPlus'／
//     'band'／'menu'（行 0〜1）／'title'（行 0〜1）／'result'。cellAt（ui.js）が返す形に合わせる。
// このファイルが直接いじってよい state は menuOpen / menuIndex / titleIndex と、point で選んだ
// 行を反映するだけの dialog.index。ファンド（fund）や phase を書き換える処理は必ず FD.Game.* 経由。
//
// ★同一判定について（2026-09-05 将棋 input.js の事故対策・SPEC §10.5）:
//   action・id・index・銘柄 id はすべて文字列化してから比べたりしない。=== のまま数値／識別子を
//   比較する。文字列に変換すると別々の物が同じ文字列に潰れて誤った分岐に入ることがあり、実際に
//   それで操作不能になった事故がある（将棋 input.js）。ここでは isButtonArg で type と id を
//   そのまま比較し、cursor・index は数値のまま扱う。
(function () {

  FD.Input = FD.Input || {};

  var inited = false;

  // ------------------------------------------------------------------
  // §7.2 キー割り当て。FD.CONFIG.KEYMAP があればそれを使う（交換パーツ）。
  // 無ければこの既定表を使う（config.js が未整備でも入力そのものは動かすための保険）。
  // 数字キー 1〜9 は「num」に固定（SPEC 上そのものが仕様であり差し替え対象ではない）ので
  // KEYMAP には含めない。
  // ------------------------------------------------------------------
  var DEFAULT_KEYMAP = {
    'z': 'ok', 'enter': 'ok', ' ': 'ok',
    'x': 'cancel', 'escape': 'cancel', 'backspace': 'cancel',
    'arrowup': 'up', 'arrowdown': 'down', 'arrowleft': 'left', 'arrowright': 'right',
    's': 'special'
  };

  function keymap() {
    var cfg = FD.CONFIG || {};
    return cfg.KEYMAP || DEFAULT_KEYMAP;
  }

  function digitOf(rawKey) {
    // '1'〜'9' なら 1〜9、それ以外は 0（テンキーも e.key は '1' 等になるので同じ扱い。§7.2）
    switch (rawKey) {
      case '1': return 1;
      case '2': return 2;
      case '3': return 3;
      case '4': return 4;
      case '5': return 5;
      case '6': return 6;
      case '7': return 7;
      case '8': return 8;
      case '9': return 9;
      default: return 0;
    }
  }

  // ダイアログの割合の増減幅。FD.CONFIG.PCT_STEP を読む（数値の直書きをしない。§1）
  function pctStep(ctx) {
    var cfg = ctx.CONFIG || {};
    return (typeof cfg.PCT_STEP === 'number' && cfg.PCT_STEP > 0) ? cfg.PCT_STEP : 10;
  }

  // ------------------------------------------------------------------
  // 内部ヘルパー（FD.Input の公開 API には出さない。§1 の一覧に無いもの）
  // ------------------------------------------------------------------

  // point の arg 形チェック（§7.1）。'button' は {type,id,index}。id は構造のまま比較する
  // （文字列化してから比べない。§10.5 事故対策）。
  function isButtonArg(arg, id) {
    return !!arg && typeof arg === 'object' && arg.type === 'button' && arg.id === id;
  }

  // §7.5: #menu は全状態で同じ 2 行（タイトルへ／閉じる）。文言そのものは ui.js 側が持つ。
  var MENU_ROW_COUNT = 2;

  function openMenu(ctx) {
    ctx.st.menuOpen = true;
    ctx.st.menuIndex = 0;
    if (ctx.UI && typeof ctx.UI.showMenu === 'function') {
      ctx.UI.showMenu();
    }
  }

  function closeMenu(ctx) {
    ctx.st.menuOpen = false;
    if (ctx.UI && typeof ctx.UI.hideMenu === 'function') {
      ctx.UI.hideMenu();
    }
  }

  // §7.5 の実行列（行 0: タイトルへ／行 1: 閉じる）
  function runMenuItem(ctx, idx) {
    closeMenu(ctx);
    if (idx === 0) {
      ctx.Game.toTitle();
    }
    // idx === 1（閉じる）はここまでで完了（何もしない）
  }

  // 優先 2: menuOpen（§7.4）
  function handleMenu(ctx, action, arg) {
    var st = ctx.st;
    if (action === 'up') {
      st.menuIndex = Math.max(0, st.menuIndex - 1);
    } else if (action === 'down') {
      st.menuIndex = Math.min(MENU_ROW_COUNT - 1, st.menuIndex + 1);
    } else if (action === 'cancel') {
      closeMenu(ctx);
    } else if (action === 'ok') {
      runMenuItem(ctx, st.menuIndex);
    } else if (action === 'point' && isButtonArg(arg, 'menu')) {
      if (typeof arg.index === 'number' && arg.index >= 0 && arg.index < MENU_ROW_COUNT) {
        st.menuIndex = arg.index;
        runMenuItem(ctx, arg.index);
      }
    }
    // 他は無視
  }

  // 優先 3: state.hold（§7.4・§8.2）チュートリアルの案内帯待ち
  function handleHold(ctx, action, arg) {
    var Tutorial = ctx.Tutorial;
    if (!Tutorial) return;
    if (action === 'ok' || (action === 'point' && isButtonArg(arg, 'band'))) {
      if (typeof Tutorial.confirm === 'function') Tutorial.confirm();
    } else if (action === 'cancel') {
      if (typeof Tutorial.cancel === 'function') Tutorial.cancel();
    }
    // 他は無視（point でも上記以外は無視）
  }

  // §7.4 優先 4 の「ok」を index ごとに実行（§7.5: 0=買う／1=売る／2=閉じる）
  function runDialogOk(ctx) {
    var dialog = ctx.st.dialog;
    if (!dialog) return;
    if (dialog.index === 0) {
      ctx.Game.buy();
    } else if (dialog.index === 1) {
      ctx.Game.sell();
    } else {
      ctx.Game.closeDialog();
    }
  }

  // left/right/pctMinus/pctPlus 共通: 割合を pctStep だけ増減する（§7.4）
  function stepPct(ctx, sign) {
    var dialog = ctx.st.dialog;
    if (!dialog) return;
    ctx.Game.setPct(dialog.pct + sign * pctStep(ctx));
  }

  // 優先 4: state.dialog（§7.4・§7.5）売買ダイアログ
  function handleDialog(ctx, action, arg) {
    var dialog = ctx.st.dialog;
    if (!dialog) return;
    var Game = ctx.Game;
    if (action === 'up') {
      Game.dialogMove(-1);
    } else if (action === 'down') {
      Game.dialogMove(1);
    } else if (action === 'left') {
      stepPct(ctx, -1);
    } else if (action === 'right') {
      stepPct(ctx, 1);
    } else if (action === 'num') {
      if (typeof arg === 'number' && arg >= 1 && arg <= 9) {
        Game.setPct(arg * pctStep(ctx));
      }
    } else if (action === 'ok') {
      runDialogOk(ctx);
    } else if (action === 'cancel') {
      Game.closeDialog();
    } else if (action === 'point' && isButtonArg(arg, 'dialog')) {
      if (typeof arg.index === 'number') dialog.index = arg.index;
      runDialogOk(ctx);
    } else if (action === 'point' && isButtonArg(arg, 'pctMinus')) {
      stepPct(ctx, -1);
    } else if (action === 'point' && isButtonArg(arg, 'pctPlus')) {
      stepPct(ctx, 1);
    }
    // 他は無視
  }

  // 優先 5: phase === 'title'（§7.4）
  function handleTitle(ctx, action, arg) {
    var st = ctx.st;
    function decide(idx) {
      if (idx === 0) {
        if (ctx.Tutorial && typeof ctx.Tutorial.start === 'function') ctx.Tutorial.start();
      } else {
        ctx.Game.startFree();
      }
    }
    if (action === 'up' || action === 'down') {
      st.titleIndex = (st.titleIndex === 0) ? 1 : 0;
    } else if (action === 'ok') {
      decide(st.titleIndex);
    } else if (action === 'point' && isButtonArg(arg, 'title')) {
      st.titleIndex = (arg.index === 1) ? 1 : 0;
      decide(st.titleIndex);
    }
    // 他は無視
  }

  // 優先 6: phase === 'result'（§7.4）
  function handleResult(ctx, action, arg) {
    if (action === 'ok' || action === 'cancel' || (action === 'point' && isButtonArg(arg, 'result'))) {
      ctx.Game.toTitle();
    }
    // 他は無視
  }

  // §7.4 優先 7 の「ok」: cursor に応じてダイアログを開くか次の日へ進める。
  // 境界は CONFIG.STOCKS.length から取る（6 を直書きしない。§1）。
  function runPlayOk(ctx) {
    var st = ctx.st;
    var cfg = ctx.CONFIG || {};
    var stocks = cfg.STOCKS || [];
    if (st.cursor < stocks.length) {
      var s = stocks[st.cursor];
      if (s) ctx.Game.openDialog(s.id);
    } else {
      ctx.Game.nextDay();
    }
  }

  // 優先 7: phase === 'play'（§7.4）
  function handlePlay(ctx, action, arg) {
    var Game = ctx.Game;
    if (action === 'up') {
      Game.moveCursor(-1);
    } else if (action === 'down') {
      Game.moveCursor(1);
    } else if (action === 'ok') {
      runPlayOk(ctx);
    } else if (action === 'point' && isButtonArg(arg, 'row')) {
      if (typeof arg.index === 'number') ctx.st.cursor = arg.index;
      runPlayOk(ctx);
    }
    // left/right/num/cancel: 無視。他も無視（§7.4 優先 7）
  }

  // ------------------------------------------------------------------
  // FD.Input 公開 API（§1 の一覧のとおり: init() dispatch(action, arg)）
  // ------------------------------------------------------------------

  // §7.4: dispatch(action, arg) の分岐。上から順に最初に当たった条件だけを処理して終わる。
  FD.Input.dispatch = function (action, arg) {
    try {
      var Game = FD.Game;
      var st = Game && Game.state;
      if (!st) return; // まだ起動していない（null 保護。§10.4 と同じ考え方）

      var ctx = {
        Game: Game,
        UI: FD.UI,
        Tutorial: FD.Tutorial,
        CONFIG: FD.CONFIG || {},
        st: st
      };

      if (action === 'special') {
        // 優先 1: どの phase・hold 中・ダイアログ中・結果画面でも開ける全状態共通の出口
        if (st.menuOpen) closeMenu(ctx); else openMenu(ctx);

      } else if (st.menuOpen) {
        // 優先 2
        handleMenu(ctx, action, arg);

      } else if (st.hold) {
        // 優先 3
        handleHold(ctx, action, arg);

      } else if (st.dialog) {
        // 優先 4
        handleDialog(ctx, action, arg);

      } else if (st.phase === 'title') {
        // 優先 5
        handleTitle(ctx, action, arg);

      } else if (st.phase === 'result') {
        // 優先 6
        handleResult(ctx, action, arg);

      } else if (st.phase === 'play') {
        // 優先 7
        handlePlay(ctx, action, arg);

      } else {
        // 優先 8: それ以外
        console.warn('FD.Input.dispatch: 未知の phase', st.phase);
      }

      Game.render(); // dispatch の最後で必ず呼ぶ（§7.4）
      st.recoverCount = 0; // 正常に終わったら回復カウンタをリセット（§7.4・§10.4）
    } catch (e) {
      console.error(e);
      try { FD.Game.recover(); } catch (e2) { console.error(e2); }
    }
  };

  // ------------------------------------------------------------------
  // マウス（§7.3）: クリック位置を UI.cellAt で解決して dispatch へ落とすだけ。
  // 判定そのものは持たない（ui.js の cellAt が button:row／button:dialog／button:pctMinus／
  // button:pctPlus／button:band／button:menu／button:title／button:result／null を返す想定。
  // ここは受け取ってそのまま point として渡すだけ）。
  // ------------------------------------------------------------------

  function stageCoords(clientX, clientY) {
    var cfg = FD.CONFIG || {};
    var stageW = (typeof cfg.STAGE_W === 'number' && cfg.STAGE_W > 0) ? cfg.STAGE_W : 1280;
    var stageH = (typeof cfg.STAGE_H === 'number' && cfg.STAGE_H > 0) ? cfg.STAGE_H : 720;
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw / stageW, vh / stageH) || 1;
    var offsetX = (vw - stageW * s) / 2;
    var offsetY = (vh - stageH * s) / 2;
    return { x: (clientX - offsetX) / s, y: (clientY - offsetY) / s };
  }

  function onClick(e) {
    try {
      if (e.button !== undefined && e.button !== 0) return; // 左クリックのみ（§7.3）
      var UI = FD.UI;
      if (!UI || typeof UI.cellAt !== 'function') return;
      var p = stageCoords(e.clientX, e.clientY);
      var point = UI.cellAt(p.x, p.y);
      if (!point) return; // それ以外の場所 = 何もしない（§7.3）
      FD.Input.dispatch('point', point);
    } catch (err) {
      console.error(err);
      try { FD.Game.recover(); } catch (e2) { console.error(e2); }
    }
  }

  function onContextMenu(e) {
    e.preventDefault(); // 右クリック = cancel（contextmenu は preventDefault。§7.3）
    try {
      FD.Input.dispatch('cancel');
    } catch (err) {
      console.error(err);
      try { FD.Game.recover(); } catch (e2) { console.error(e2); }
    }
  }

  // ------------------------------------------------------------------
  // キーボード（§7.2）: window の keydown。e.repeat は矢印だけ受け付ける。
  // ------------------------------------------------------------------

  function onKeyDown(e) {
    try {
      var rawKey = e.key ? String(e.key) : '';
      var digit = digitOf(rawKey);
      var action, arg;

      if (digit >= 1 && digit <= 9) {
        action = 'num';
        arg = digit;
      } else {
        action = keymap()[rawKey.toLowerCase()];
      }
      if (!action) return; // 割り当ての無いキーは無視（エラーにしない。§7.2）

      e.preventDefault(); // 上のキーは preventDefault（Space・矢印でスクロールしないように）

      var isArrow = (action === 'up' || action === 'down' || action === 'left' || action === 'right');
      if (e.repeat && !isArrow) return; // e.repeat は矢印だけ受け付ける

      FD.Input.dispatch(action, arg);
    } catch (err) {
      console.error(err);
      try { FD.Game.recover(); } catch (e2) { console.error(e2); }
    }
  }

  // §1: 起動時に main.js から 1 度だけ呼ばれる
  FD.Input.init = function () {
    if (inited) return;
    inited = true;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick);
    document.addEventListener('contextmenu', onContextMenu);
  };

})();
