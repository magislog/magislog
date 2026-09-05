var FM = (typeof window !== 'undefined') ? (window.FM = window.FM || {}) : (global.FM = global.FM || {});

// FM.Input: キーとマウスを 9 種の action（up/down/left/right/ok/cancel/special/num/point）に落とし、
// dispatch(action, arg) の 1 本だけで処理する。SPEC.md §1・§7 準拠。経路は分けない。
//   num  の arg = 1〜4 の整数（道具の持ち替え。§7.2）
//   point の arg = {type:'cell', r, c} / {type:'button', id, index}（§6.1・§7.1）
// このファイルが直接いじってよい state は menuOpen / menuIndex / titleIndex / dialog.index の
// ような「入力側の見た目の選択」だけ。世界（world）を書き換えるのは必ず FM.Game.* 経由で行う。
//
// ★同一判定について（2026-09-05 将棋 input.js の事故対策・§2.1・§10.5）:
//   タイル位置が同じかどうかは World.samePos(a, b) だけで判定する（無ければ r・c を数値のまま
//   比較する）。座標を文字列（"r,c" 等）に変換してから比べる書き方は絶対にしない。文字列化は
//   別々の物を同じ文字列に潰すことがあり、実際にそれで分岐を誤り操作不能になった事故がある。
//   §7.3 のクリック判定でも、方向・距離は r/c の数値差分（dr, dc）で計算し、文字列鍵は作らない。
(function () {

  FM.Input = FM.Input || {};

  var inited = false;

  // ------------------------------------------------------------------
  // §7.2 キー割り当て。FM.CONFIG.KEYMAP があればそれを使う（交換パーツ）。
  // 無ければこの既定表を使う（config.js が未整備でも入力そのものは動かすための保険）。
  // 数字キー 1〜4 は「num」に固定（SPEC 上そのものが仕様であり差し替え対象ではない）ので
  // KEYMAP には含めない。
  // ------------------------------------------------------------------
  var DEFAULT_KEYMAP = {
    'z': 'ok', 'enter': 'ok', ' ': 'ok',
    'x': 'cancel', 'escape': 'cancel', 'backspace': 'cancel',
    'arrowup': 'up', 'arrowdown': 'down', 'arrowleft': 'left', 'arrowright': 'right',
    's': 'special'
  };

  function keymap() {
    var cfg = FM.CONFIG || {};
    return cfg.KEYMAP || DEFAULT_KEYMAP;
  }

  function digitOf(rawKey) {
    // '1'〜'4' なら 1〜4、それ以外は 0（テンキーも e.key は '1' 等になるので同じ扱い。§7.2）
    if (rawKey === '1' || rawKey === '2' || rawKey === '3' || rawKey === '4') {
      return parseInt(rawKey, 10);
    }
    return 0;
  }

  // ------------------------------------------------------------------
  // 内部ヘルパー（FM.Input の公開 API には出さない。§1 の一覧に無いもの）
  // ------------------------------------------------------------------

  // point の arg 形チェック（§7.1・§6.1）。'cell' は {type,r,c}、'button' は {type,id,index}。
  function isPointArg(arg, type) {
    return !!arg && typeof arg === 'object' && arg.type === type;
  }

  function isButtonArg(arg, id) {
    return isPointArg(arg, 'button') && arg.id === id;
  }

  // §7.5: #menu は全状態で同じ 2 行
  var MENU_ITEMS = ['タイトルへ', '閉じる'];

  function openMenu(ctx) {
    ctx.st.menuOpen = true;
    ctx.st.menuIndex = 0;
    if (ctx.UI && typeof ctx.UI.showMenu === 'function') {
      ctx.UI.showMenu(MENU_ITEMS.slice());
    }
  }

  function closeMenu(ctx) {
    ctx.st.menuOpen = false;
    if (ctx.UI && typeof ctx.UI.hideMenu === 'function') {
      ctx.UI.hideMenu();
    }
  }

  // §7.5 の実行列。表の両方の行が「menuOpen を閉じる」を含むので先頭で必ず閉じる。
  function runMenuItem(ctx, idx) {
    closeMenu(ctx);
    if (idx === 0) {
      // タイトルへ
      ctx.Game.toTitle();
    }
    // idx === 1（閉じる）はここまでで完了（何もしない）
  }

  function handleMenu(ctx, action, arg) {
    var st = ctx.st;
    if (action === 'up') {
      st.menuIndex = Math.max(0, st.menuIndex - 1);
    } else if (action === 'down') {
      st.menuIndex = Math.min(MENU_ITEMS.length - 1, st.menuIndex + 1);
    } else if (action === 'cancel') {
      closeMenu(ctx);
    } else if (action === 'ok') {
      runMenuItem(ctx, st.menuIndex);
    } else if (action === 'point' && isButtonArg(arg, 'menu')) {
      if (typeof arg.index === 'number' && arg.index >= 0 && arg.index < MENU_ITEMS.length) {
        st.menuIndex = arg.index;
        runMenuItem(ctx, arg.index);
      }
    }
    // 他は無視（§7.4 優先 2）
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

  // §7.4 優先 4 の「ok」を kind ごとに実行する。sleep は Game.dialogOk() に委ねる
  // （0=寝る/1=やめるの分岐は Game 側が state.dialog.index を見て行う）。
  // shop は「閉じない・続けて買える」性質があるため Game.buy / Game.closeDialog を直接呼ぶ。
  function runDialogOk(ctx) {
    var dialog = ctx.st.dialog;
    if (!dialog) return;
    if (dialog.kind === 'sleep') {
      ctx.Game.dialogOk();
    } else if (dialog.kind === 'shop') {
      var idx = dialog.index;
      if (idx >= 0 && idx <= 2) {
        var order = (ctx.CONFIG && ctx.CONFIG.CROP_ORDER) || [];
        ctx.Game.buy(order[idx]);
      } else {
        ctx.Game.closeDialog();
      }
    }
  }

  // 優先 4: state.dialog（§7.4・§7.5）寝る／店ダイアログ
  function handleDialog(ctx, action, arg) {
    var dialog = ctx.st.dialog;
    if (!dialog) return;
    if (action === 'up' || action === 'down') {
      // 端で止まる範囲（sleep は 0〜1、shop は 0〜3）は Game.dialogMove が kind を見て決める
      ctx.Game.dialogMove(action);
    } else if (action === 'ok') {
      runDialogOk(ctx);
    } else if (action === 'cancel') {
      ctx.Game.closeDialog();
    } else if (action === 'num') {
      // 店だけ: 1〜3 で直接購入、4 は無視（§7.4）
      if (dialog.kind === 'shop' && typeof arg === 'number' && arg >= 1 && arg <= 3) {
        var order = (ctx.CONFIG && ctx.CONFIG.CROP_ORDER) || [];
        ctx.Game.buy(order[arg - 1]);
      }
    } else if (action === 'point' && isButtonArg(arg, 'dialog')) {
      if (typeof arg.index === 'number') dialog.index = arg.index;
      runDialogOk(ctx);
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

  // §7.3: マップのタイル (r,c) をクリックしたときの判定。移動と Z をここで組み立てる。
  function handleCellClick(ctx, cell) {
    var World = ctx.World, Game = ctx.Game, CONFIG = ctx.CONFIG;
    var world = ctx.st.world;
    if (!world || !world.player) return;
    if (typeof cell.r !== 'number' || typeof cell.c !== 'number') return;
    var player = world.player;

    // 位置の同一判定は samePos だけを使う（構造のまま比較。文字列化はしない）
    var same = (World && typeof World.samePos === 'function')
      ? World.samePos(cell, player)
      : (cell.r === player.r && cell.c === player.c);
    if (same) {
      Game.act(); // プレイヤーと同じタイル → ok と同じ
      return;
    }

    var dr = cell.r - player.r;
    var dc = cell.c - player.c;

    if (Math.abs(dr) + Math.abs(dc) === 1) {
      // 上下左右に隣 → その方向へ move（歩けるなら歩く。歩けないなら向くだけ）
      var dir = (dr === -1) ? 'up' : (dr === 1) ? 'down' : (dc === -1) ? 'left' : 'right';
      var tile = (World && typeof World.at === 'function') ? World.at(world, cell.r, cell.c) : null;
      var objects = (CONFIG && CONFIG.OBJECTS) || [];
      var isObject = !!tile && objects.indexOf(tile.type) !== -1;
      Game.move(dir);
      if (isObject) {
        // クリックした隣が door/shop/ship なら、向いた直後に ok と同じ処理（クリック 1 回で使える）
        Game.act();
      }
      return;
    }

    // それ以外（遠い）→ 1 歩だけ move（横優先: |dc| >= |dr|）
    var dir2 = (Math.abs(dc) >= Math.abs(dr))
      ? ((dc > 0) ? 'right' : 'left')
      : ((dr > 0) ? 'down' : 'up');
    Game.move(dir2);
  }

  // 優先 7: phase === 'play'（§7.4）
  function handlePlay(ctx, action, arg) {
    var Game = ctx.Game;
    if (action === 'point' && isPointArg(arg, 'cell')) {
      handleCellClick(ctx, arg);
    } else if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      Game.move(action);
    } else if (action === 'ok') {
      Game.act();
    } else if (action === 'num') {
      if (typeof arg === 'number' && arg >= 1 && arg <= 4) {
        Game.selectTool(arg - 1);
      }
    } else if (action === 'point' && isButtonArg(arg, 'tool')) {
      if (typeof arg.index === 'number') Game.selectTool(arg.index);
    }
    // cancel: 無視。他も無視（§7.4 優先 7）
  }

  // ------------------------------------------------------------------
  // FM.Input 公開 API（§1 の一覧のとおり: init() dispatch(action, arg)）
  // ------------------------------------------------------------------

  // §7.4: dispatch(action, arg) の分岐。上から順に最初に当たった条件だけを処理して終わる。
  FM.Input.dispatch = function (action, arg) {
    try {
      var Game = FM.Game;
      var st = Game && Game.state;
      if (!st) return; // まだ起動していない（null 保護。§10.4 と同じ考え方）

      var ctx = {
        Game: Game,
        UI: FM.UI,
        Tutorial: FM.Tutorial,
        World: FM.World,
        CONFIG: FM.CONFIG || {},
        st: st
      };

      if (action === 'special') {
        // 優先 1: どの phase・hold 中・ダイアログ中・寝る演出中でも開ける全状態共通の出口
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

      } else if (st.phase === 'sleep') {
        // 優先 6: 全部無視（banner が出ている。SLEEP_MS 後に自動で朝になる）

      } else if (st.phase === 'play') {
        // 優先 7
        handlePlay(ctx, action, arg);

      } else {
        // 優先 8: それ以外
        console.warn('FM.Input.dispatch: 未知の phase', st.phase);
      }

      Game.render(); // dispatch の最後で必ず呼ぶ（§7.4）
    } catch (e) {
      console.error(e);
      try { FM.Game.recover(); } catch (e2) { console.error(e2); }
    }
  };

  // ------------------------------------------------------------------
  // マウス（§7.3）: クリック位置を UI.cellAt で解決して dispatch へ落とすだけ。
  // 判定そのものは持たない（§6.1: cellAt が cell／button:band／button:menu／button:dialog／
  // button:title／button:tool／null を返す。ここは受け取ってそのまま point として渡すだけ）。
  // ------------------------------------------------------------------

  function stageCoords(clientX, clientY) {
    var cfg = FM.CONFIG || {};
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
      var UI = FM.UI;
      if (!UI || typeof UI.cellAt !== 'function') return;
      var p = stageCoords(e.clientX, e.clientY);
      var point = UI.cellAt(p.x, p.y);
      if (!point) return; // それ以外の場所 = 何もしない（§7.3）
      FM.Input.dispatch('point', point);
    } catch (err) {
      console.error(err);
      try { FM.Game.recover(); } catch (e2) { console.error(e2); }
    }
  }

  function onContextMenu(e) {
    e.preventDefault(); // 右クリック = cancel（contextmenu は preventDefault。§7.3）
    try {
      FM.Input.dispatch('cancel');
    } catch (err) {
      console.error(err);
      try { FM.Game.recover(); } catch (e2) { console.error(e2); }
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

      if (digit >= 1 && digit <= 4) {
        action = 'num';
        arg = digit;
      } else {
        action = keymap()[rawKey.toLowerCase()];
      }
      if (!action) return; // 割り当ての無いキーは無視（エラーにしない。§7.2）

      e.preventDefault(); // 上のキーは preventDefault（Space・矢印でスクロールしないように）

      var isArrow = (action === 'up' || action === 'down' || action === 'left' || action === 'right');
      if (e.repeat && !isArrow) return; // e.repeat は矢印だけ受け付ける

      FM.Input.dispatch(action, arg);
    } catch (err) {
      console.error(err);
      try { FM.Game.recover(); } catch (e2) { console.error(e2); }
    }
  }

  // §1: 起動時に main.js から 1 度だけ呼ばれる
  FM.Input.init = function () {
    if (inited) return;
    inited = true;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick);
    document.addEventListener('contextmenu', onContextMenu);
  };

})();
