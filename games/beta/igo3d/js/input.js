var IG = (typeof window !== 'undefined') ? (window.IG = window.IG || {}) : (global.IG = global.IG || {});

// IG.Input: キーとマウスを 8 種の action（up/down/left/right/ok/cancel/special/point）に落とし、
// dispatch(action) の 1 本だけで処理する。SPEC.md §1・§7 準拠。経路は分けない。
//
// ★手の同一判定について（§10.5 の事故対策）:
//   このファイルは「カーソル位置 → Game.humanMove({kind:'play', r, c})」／
//   「メニューのパス → Game.humanMove({kind:'pass'})」を直接呼ぶだけで、
//   合法手リストや許可された手のリストと照合する処理を持たない（§7.4 row7・§9.2）。
//   そのため Rules.sameMove を使う場面がここには無い（§10.5 の機械確認も
//   rules.js の定義＋game.js／tutorial.js／_test_rules.js の使用だけを求めており、
//   input.js は対象に入っていない）。moveToStr() を作って文字列で比べる書き方は
//   絶対にしない（2026-09-05 将棋 input.js の事故＝§10.5）。
(function () {

  IG.Input = IG.Input || {};

  var inited = false;

  // ------------------------------------------------------------------
  // §7.2 キー割り当て。IG.CONFIG.KEYMAP があればそれを使う（交換パーツ）。
  // 無ければこの既定表を使う（config.js が未整備でも入力そのものは動かすための保険）。
  // ------------------------------------------------------------------
  var DEFAULT_KEYMAP = {
    'z': 'ok', 'enter': 'ok', ' ': 'ok',
    'x': 'cancel', 'escape': 'cancel', 'backspace': 'cancel',
    'arrowup': 'up', 'arrowdown': 'down', 'arrowleft': 'left', 'arrowright': 'right',
    's': 'special'
  };

  function keymap() {
    var cfg = IG.CONFIG || {};
    return cfg.KEYMAP || DEFAULT_KEYMAP;
  }

  // 盤サイズも直書きしない（§10.6）。CONFIG が無い/壊れている時だけ 9 に落ちる保険。
  function boardSize() {
    var cfg = IG.CONFIG || {};
    return (typeof cfg.SIZE === 'number' && cfg.SIZE > 0) ? cfg.SIZE : 9;
  }

  // ------------------------------------------------------------------
  // 内部ヘルパー（IG.Input の公開 API には出さない。§1 の一覧に無いもの）
  // ------------------------------------------------------------------

  // point action の形チェック（§7.1・§6.1）。'cell' は {type,r,c}、'button' は {type,id,index}。
  function isPoint(action, type) {
    return !!action && typeof action === 'object' && action.type === type;
  }

  function isButton(action, id) {
    return isPoint(action, 'button') && action.id === id;
  }

  // §7.5: メニューの行（phase・hold・mode で内容が変わる。開くたび／使うたびに state から作る）
  function menuItems(st) {
    var items = [];
    if (st.phase === 'play' && !st.hold) {
      items.push({ id: 'pass', label: 'パス' });
      if (st.mode === 'free') {
        items.push({ id: 'resign', label: '投了する' });
      }
      items.push({ id: 'title', label: 'タイトルへ' });
      items.push({ id: 'close', label: '閉じる' });
    } else {
      // title・cpu・over・hold 中
      items.push({ id: 'title', label: 'タイトルへ' });
      items.push({ id: 'close', label: '閉じる' });
    }
    return items;
  }

  function openMenu(st) {
    st.menuOpen = true;
    st.menuIndex = 0;
    if (IG.UI && IG.UI.showMenu) {
      IG.UI.showMenu(menuItems(st).map(function (it) { return it.label; }));
    }
  }

  function closeMenu(st) {
    st.menuOpen = false;
    if (IG.UI && IG.UI.hideMenu) IG.UI.hideMenu();
  }

  // §7.5 の実行列。表の全行が「menuOpen を閉じる」を含むので先頭で必ず閉じる。
  function runMenuItem(st, item) {
    closeMenu(st);
    if (!item) return;
    if (item.id === 'pass') {
      IG.Game.humanMove({ kind: 'pass' });
    } else if (item.id === 'resign') {
      IG.Game.resign();
    } else if (item.id === 'title') {
      IG.Game.toTitle();
    }
    // 'close' はここまでで完了（何もしない）
  }

  // ------------------------------------------------------------------
  // IG.Input 公開 API（§1 の一覧のとおり: init() dispatch(action)）
  // ------------------------------------------------------------------

  // §7.4: dispatch(action) の分岐。上から順に最初に当たった条件だけを処理して終わる。
  IG.Input.dispatch = function (action) {
    try {
      var Game = IG.Game;
      var st = Game && Game.state;
      if (!st) return;
      var UI = IG.UI;
      var Tutorial = IG.Tutorial;

      // 優先 1: special — どの phase・hold 中・CPU 思考中でも開ける全状態共通の出口
      if (action === 'special') {
        if (st.menuOpen) closeMenu(st); else openMenu(st);

      // 優先 2: menuOpen
      } else if (st.menuOpen) {
        var items = menuItems(st);
        if (action === 'up') {
          st.menuIndex = Math.max(0, st.menuIndex - 1);
        } else if (action === 'down') {
          st.menuIndex = Math.min(items.length - 1, st.menuIndex + 1);
        } else if (action === 'cancel') {
          closeMenu(st);
        } else if (action === 'ok') {
          runMenuItem(st, items[st.menuIndex]);
        } else if (isButton(action, 'menu')) {
          var mi = action.index;
          if (typeof mi === 'number' && mi >= 0 && mi < items.length) {
            st.menuIndex = mi;
            runMenuItem(st, items[mi]);
          }
        }
        // 他は無視

      // 優先 3: state.hold（§8.2）
      } else if (st.hold) {
        if (action === 'ok' || isButton(action, 'band')) {
          Tutorial.confirm();
        } else if (action === 'cancel') {
          Tutorial.cancel();
        }
        // 他は無視（point が来ても無視）

      // 優先 4: phase === 'title'
      } else if (st.phase === 'title') {
        if (action === 'up' || action === 'down') {
          st.titleIndex = (st.titleIndex === 0) ? 1 : 0;
        } else if (action === 'ok') {
          if (st.titleIndex === 0) Tutorial.start(); else Game.startFree();
        } else if (isButton(action, 'title')) {
          st.titleIndex = (action.index === 1) ? 1 : 0;
          if (st.titleIndex === 0) Tutorial.start(); else Game.startFree();
        }
        // 他は無視

      // 優先 5: phase === 'over'
      } else if (st.phase === 'over') {
        if (action === 'ok') {
          if (st.mode === 'tutorial') Tutorial.onEvent('ok_over'); else Game.toTitle();
        }
        // 他は無視

      // 優先 6: phase === 'cpu' — 全部無視
      } else if (st.phase === 'cpu') {
        // 何もしない（#msg は Game 側が出す）

      // 優先 7: phase === 'play'
      } else if (st.phase === 'play') {
        if (isPoint(action, 'cell')) {
          // 盤の交点クリック＝カーソルをそこへ動かしてから ok と同じ処理（§7.3）
          st.cursor = { r: action.r, c: action.c };
          action = 'ok';
        }
        if (action === 'up') {
          st.cursor.r = Math.max(0, st.cursor.r - 1);
        } else if (action === 'down') {
          st.cursor.r = Math.min(boardSize() - 1, st.cursor.r + 1);
        } else if (action === 'left') {
          st.cursor.c = Math.max(0, st.cursor.c - 1);
        } else if (action === 'right') {
          st.cursor.c = Math.min(boardSize() - 1, st.cursor.c + 1);
        } else if (action === 'ok') {
          Game.humanMove({ kind: 'play', r: st.cursor.r, c: st.cursor.c });
        }
        // cancel: 無視（囲碁は選択の段階が無いので戻る先が無い。§7.4 row7）

      // 優先 8: それ以外
      } else {
        console.warn('IG.Input.dispatch: 未知の phase', st.phase);
      }

      Game.render();
    } catch (e) {
      console.error(e);
      try { IG.Game.recover(); } catch (e2) { console.error(e2); }
    }
  };

  // ------------------------------------------------------------------
  // マウス（§7.3）: クリック位置を UI.cellAt で解決して dispatch へ落とすだけ。
  // 判定そのものは持たない（§6.1: cellAt が cell／button:band／button:menu／button:title／null を返す）。
  // ------------------------------------------------------------------

  function stageCoords(clientX, clientY) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw / 1280, vh / 720) || 1;
    var offsetX = (vw - 1280 * s) / 2;
    var offsetY = (vh - 720 * s) / 2;
    return { x: (clientX - offsetX) / s, y: (clientY - offsetY) / s };
  }

  function onClick(e) {
    try {
      if (e.button !== undefined && e.button !== 0) return; // 左クリックのみ（§7.3）
      if (!IG.UI || !IG.UI.cellAt) return;
      var p = stageCoords(e.clientX, e.clientY);
      var point = IG.UI.cellAt(p.x, p.y);
      if (!point) return; // それ以外の場所 = 何もしない（§7.3）
      if (isButton(point, 'band')) {
        IG.Input.dispatch('ok'); // #band の上 = ok（§7.3）
      } else {
        IG.Input.dispatch(point); // cell／menu の行／title の行 はそのまま dispatch へ
      }
    } catch (err) {
      console.error(err);
      try { IG.Game.recover(); } catch (e2) { console.error(e2); }
    }
  }

  function onContextMenu(e) {
    e.preventDefault(); // 右クリック = cancel（§7.3）
    try {
      IG.Input.dispatch('cancel');
    } catch (err) {
      console.error(err);
      try { IG.Game.recover(); } catch (e2) { console.error(e2); }
    }
  }

  // ------------------------------------------------------------------
  // キーボード（§7.2）: window の keydown。e.repeat は矢印だけ受け付ける。
  // ------------------------------------------------------------------

  function onKeyDown(e) {
    try {
      var key = e.key ? String(e.key).toLowerCase() : '';
      var action = keymap()[key];
      if (!action) return; // 割り当ての無いキーは無視（エラーにしない）

      e.preventDefault(); // 上のキーは preventDefault（§7.2）

      var isArrow = (action === 'up' || action === 'down' || action === 'left' || action === 'right');
      if (e.repeat && !isArrow) return; // e.repeat は矢印だけ受け付ける

      IG.Input.dispatch(action);
    } catch (err) {
      console.error(err);
      try { IG.Game.recover(); } catch (e2) { console.error(e2); }
    }
  }

  // §1: 起動時に main.js から 1 度だけ呼ばれる
  IG.Input.init = function () {
    if (inited) return;
    inited = true;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick);
    document.addEventListener('contextmenu', onContextMenu);
  };

})();
