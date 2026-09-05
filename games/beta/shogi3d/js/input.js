var SG = (typeof window !== 'undefined') ? (window.SG = window.SG || {}) : (global.SG = global.SG || {});

// SG.Input: キーとマウスを 8 種の action（up/down/left/right/ok/cancel/special/point）に落とし、
// dispatch(action) の 1 本だけで処理する。SPEC.md §1・§7 準拠。
// ★このファイルが触ってよい state のフィールドは §7.4/§7.6 に出てくるものだけ（hold は Tutorial 専用・ここでは書かない）。
(function () {

  SG.Input = SG.Input || {};

  var inited = false;

  // ------------------------------------------------------------------
  // §7.2 キー割り当て。SG.CONFIG.KEYMAP があればそれを使う（交換パーツ）。
  // 無ければこの既定表を使う（config.js が未整備でも入力そのものは動かすための保険）。
  // ------------------------------------------------------------------
  var DEFAULT_KEYMAP = {
    'z': 'ok', 'enter': 'ok', ' ': 'ok',
    'x': 'cancel', 'escape': 'cancel', 'backspace': 'cancel',
    'arrowup': 'up', 'arrowdown': 'down', 'arrowleft': 'left', 'arrowright': 'right',
    's': 'special'
  };

  function keymap() {
    var cfg = SG.CONFIG || {};
    return cfg.KEYMAP || DEFAULT_KEYMAP;
  }

  // ------------------------------------------------------------------
  // 内部ヘルパー(SG.Input の公開 API には出さない。§1 の一覧に無いもの)
  // ------------------------------------------------------------------

  function isPoint(action, type) {
    return !!action && typeof action === 'object' && action.type === type;
  }

  // §6.4・§7.6: 先手(0)の持ち駒台に並ぶチップ(枚数 1 以上の駒種だけ・HAND_ORDER 順)
  function senteChipList(pos) {
    var order = (SG.CONFIG && SG.CONFIG.HAND_ORDER) || ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
    var hand = (pos && pos.hands && pos.hands[0]) || {};
    var out = [];
    var i;
    for (i = 0; i < order.length; i++) {
      if ((hand[order[i]] || 0) > 0) out.push(order[i]);
    }
    return out;
  }

  function chipIndexOf(pos, t) {
    var idx = senteChipList(pos).indexOf(t);
    return idx >= 0 ? idx : 0;
  }

  function movesInclude(legal, cand) {
    var str = SG.Rules.moveToStr(cand);
    var i;
    for (i = 0; i < legal.length; i++) {
      if (SG.Rules.moveToStr(legal[i]) === str) return true;
    }
    return false;
  }

  // §7.6: phase === 'select' でのカーソル移動
  function moveCursorSelect(st, action) {
    var cur = st.cursor;
    if (cur.zone === 'board') {
      if (action === 'up') {
        cur.r = Math.max(0, cur.r - 1);
      } else if (action === 'down') {
        if (cur.r === 8) {
          if (senteChipList(st.pos).length >= 1) {
            cur.zone = 'hand';
            cur.i = 0;
          }
          // 持ち駒が無ければ止まる(何もしない)
        } else {
          cur.r = Math.min(8, cur.r + 1);
        }
      } else if (action === 'left') {
        cur.c = Math.max(0, cur.c - 1);
      } else if (action === 'right') {
        cur.c = Math.min(8, cur.c + 1);
      }
    } else if (cur.zone === 'hand') {
      var chips = senteChipList(st.pos);
      if (action === 'left') {
        cur.i = Math.max(0, cur.i - 1);
      } else if (action === 'right') {
        cur.i = Math.min(Math.max(0, chips.length - 1), cur.i + 1);
      } else if (action === 'up') {
        cur.zone = 'board';
        cur.r = 8;
      }
      // down は無視
    }
  }

  // §7.4 row9: 盤内だけのカーソル移動(駒台へは行かない)
  function moveCursorTarget(st, action) {
    var cur = st.cursor;
    if (action === 'up') cur.r = Math.max(0, cur.r - 1);
    else if (action === 'down') cur.r = Math.min(8, cur.r + 1);
    else if (action === 'left') cur.c = Math.max(0, cur.c - 1);
    else if (action === 'right') cur.c = Math.min(8, cur.c + 1);
  }

  // §7.4 row9 cancel と「from === to」の共通処理
  function cancelTargetSelection(st) {
    var wasDrop = st.sel && st.sel.drop;
    st.sel = null;
    st.phase = 'select';
    if (wasDrop) {
      st.cursor = { zone: 'hand', r: st.cursor.r, c: st.cursor.c, i: chipIndexOf(st.pos, wasDrop) };
    }
  }

  // §7.5: メニューの行(mode/phase で内容が変わる)
  function menuItems(st) {
    var items = [];
    if (st.mode === 'free' && st.phase !== 'over') {
      items.push({ id: 'resign', label: '投了する' });
    }
    items.push({ id: 'title', label: 'タイトルへ' });
    items.push({ id: 'close', label: '閉じる' });
    return items;
  }

  function openMenu(st) {
    st.menuOpen = true;
    st.menuIndex = 0;
    if (SG.UI && SG.UI.showMenu) {
      SG.UI.showMenu(menuItems(st).map(function (it) { return it.label; }));
    }
  }

  function closeMenu(st) {
    st.menuOpen = false;
    if (SG.UI && SG.UI.hideMenu) SG.UI.hideMenu();
  }

  function runMenuItem(st, item) {
    closeMenu(st);
    if (!item) return;
    if (item.id === 'resign') SG.Game.resign();
    else if (item.id === 'title') SG.Game.toTitle();
    // 'close' はここまでで完了
  }

  // ------------------------------------------------------------------
  // SG.Input 公開 API(§1 の一覧のとおり: init() dispatch(action))
  // ------------------------------------------------------------------

  // §7.4: dispatch(action) の分岐。上から順に最初に当たった条件だけを処理して終わる。
  SG.Input.dispatch = function (action) {
    try {
      var st = SG.Game && SG.Game.state;
      if (!st) return;
      var UI = SG.UI;
      var Tutorial = SG.Tutorial;
      var Game = SG.Game;
      var Rules = SG.Rules;

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
        } else if (isPoint(action, 'button')) {
          if (action.id >= 0 && action.id < items.length) {
            st.menuIndex = action.id;
            runMenuItem(st, items[action.id]);
          }
        }
        // 他は無視

      // 優先 3: state.hold(§8.2)
      } else if (st.hold) {
        if (action === 'ok') {
          Tutorial.confirm();
        } else if (action === 'cancel') {
          Tutorial.cancel();
        }
        // 他は無視(point が来ても無視)

      // 優先 4: phase === 'title'
      } else if (st.phase === 'title') {
        if (isPoint(action, 'button')) {
          st.titleIndex = (action.id === 1) ? 1 : 0;
          action = 'ok';
        }
        if (action === 'up' || action === 'down') {
          st.titleIndex = (st.titleIndex === 0) ? 1 : 0;
        } else if (action === 'ok') {
          if (st.titleIndex === 0) Tutorial.start(); else Game.startFree();
        }

      // 優先 5: phase === 'over'
      } else if (st.phase === 'over') {
        if (action === 'ok') {
          if (st.mode === 'tutorial') Tutorial.onEvent('ok_over'); else Game.toTitle();
        }

      // 優先 6: phase === 'promote'
      } else if (st.phase === 'promote') {
        if (isPoint(action, 'button')) {
          st.promoChoice = (action.id === 1) ? 1 : 0;
          action = 'ok';
        }
        if (action === 'left' || action === 'right') {
          st.promoChoice = (st.promoChoice === 0) ? 1 : 0;
        } else if (action === 'ok') {
          st.pending.promote = (st.promoChoice === 0);
          Game.humanMove(st.pending);
        } else if (action === 'cancel') {
          if (UI && UI.hidePromo) UI.hidePromo();
          st.phase = 'target';
        }

      // 優先 7: phase === 'cpu' — 全部無視
      } else if (st.phase === 'cpu') {
        // 何もしない(#msg は Game 側が出す)

      // 優先 8: phase === 'select'
      } else if (st.phase === 'select') {
        if (isPoint(action, 'cell')) {
          st.cursor = { zone: 'board', r: action.r, c: action.c, i: 0 };
          action = 'ok';
        } else if (isPoint(action, 'chip')) {
          st.cursor = { zone: 'hand', r: st.cursor.r, c: st.cursor.c, i: action.i };
          action = 'ok';
        }
        if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
          moveCursorSelect(st, action);
        } else if (action === 'ok') {
          if (st.cursor.zone === 'board') {
            var piece = Rules.at(st.pos, st.cursor.r, st.cursor.c);
            if (piece && piece.o === st.pos.turn) {
              st.sel = { from: { r: st.cursor.r, c: st.cursor.c } };
              st.phase = 'target';
            } else if (UI && UI.message) {
              UI.message('自分の駒を選んでください');
            }
          } else if (st.cursor.zone === 'hand') {
            var t = senteChipList(st.pos)[st.cursor.i];
            if (t) {
              st.sel = { drop: t };
              st.phase = 'target';
              st.cursor = { zone: 'board', r: 4, c: 4, i: 0 };
            } else if (UI && UI.message) {
              UI.message('自分の駒を選んでください');
            }
          } else if (UI && UI.message) {
            UI.message('自分の駒を選んでください');
          }
        }
        // チュートリアル中の allow 制限は Game.humanMove() 側(§8.3)で行う

      // 優先 9: phase === 'target'
      } else if (st.phase === 'target') {
        if (isPoint(action, 'cell')) {
          st.cursor = { zone: 'board', r: action.r, c: action.c, i: 0 };
          action = 'ok';
        }
        if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
          moveCursorTarget(st, action);
        } else if (action === 'cancel') {
          cancelTargetSelection(st);
        } else if (action === 'ok' && st.sel) {
          var to = { r: st.cursor.r, c: st.cursor.c };
          var from = st.sel.from;
          var drop = st.sel.drop;
          if (from && from.r === to.r && from.c === to.c) {
            cancelTargetSelection(st);
          } else {
            var candNo = from ? { from: from, to: to, promote: false } : { drop: drop, to: to, promote: false };
            var candYes = from ? { from: from, to: to, promote: true } : { drop: drop, to: to, promote: true };
            var legal = Rules.legalMoves(st.pos);
            var hasNo = movesInclude(legal, candNo);
            // ★2026-09-05 実機で発見。打つ手は成れないのに「成りますか？」が出て手が指せなかった。
            //   原因＝moveToStr() が打つ手の promote を無視して同じ文字列（"B*4e"）を返すため、
            //   hasNo と hasYes が両方 true になり「成る／成らない の両方あり」と誤判定していた。
            //   打つ手（drop）では成りの確認を出さない。
            var hasYes = from ? movesInclude(legal, candYes) : false;
            if (hasNo && hasYes) {
              st.pending = from ? { from: from, to: to } : { drop: drop, to: to };
              st.promoChoice = 0;
              st.phase = 'promote';
              if (UI && UI.showPromo) UI.showPromo();
            } else if (hasYes) {
              Game.humanMove(candYes);
            } else if (hasNo) {
              Game.humanMove(candNo);
            } else if (UI && UI.message) {
              UI.message('そこには動かせません');
            }
          }
        }

      // 優先 10: それ以外
      } else {
        console.warn('SG.Input.dispatch: 未知の phase', st.phase);
      }

      SG.Game.render();
    } catch (e) {
      console.error(e);
      try { SG.Game.recover(); } catch (e2) { console.error(e2); }
    }
  };

  // ------------------------------------------------------------------
  // マウス(§7.3): クリック位置を解決して dispatch へ落とすだけ。判定そのものは持たない。
  // ------------------------------------------------------------------

  function stageCoords(clientX, clientY) {
    var vw = window.innerWidth, vh = window.innerHeight;
    var s = Math.min(vw / 1280, vh / 720) || 1;
    var offsetX = (vw - 1280 * s) / 2;
    var offsetY = (vh - 720 * s) / 2;
    return { x: (clientX - offsetX) / s, y: (clientY - offsetY) / s };
  }

  function isWithin(el, containerId) {
    var container = document.getElementById(containerId);
    if (!container || !el) return false;
    return container === el || (container.contains && container.contains(el));
  }

  // #promo・#menu・#title の中で、クリックされた要素(またはその祖先)が持つ data-index を拾う。
  // 見つからなければ -1(その場所は何もしない = §7.3 末尾)。
  function indexedRowOf(el, containerId) {
    var container = document.getElementById(containerId);
    if (!container || !el) return -1;
    var node = el;
    while (node && node !== container) {
      if (node.getAttribute && node.getAttribute('data-index') !== null) {
        return parseInt(node.getAttribute('data-index'), 10);
      }
      node = node.parentNode;
    }
    return -1;
  }

  function onClick(e) {
    try {
      if (e.button !== undefined && e.button !== 0) return; // 左クリックのみ(§7.3)
      var target = e.target;

      if (isWithin(target, 'band')) {
        SG.Input.dispatch('ok');
        return;
      }
      var idx;
      if (isWithin(target, 'menu')) {
        idx = indexedRowOf(target, 'menu');
        if (idx >= 0) SG.Input.dispatch({ type: 'button', id: idx });
        return;
      }
      if (isWithin(target, 'promo')) {
        idx = indexedRowOf(target, 'promo');
        if (idx >= 0) SG.Input.dispatch({ type: 'button', id: idx });
        return;
      }
      if (isWithin(target, 'title')) {
        idx = indexedRowOf(target, 'title');
        if (idx >= 0) SG.Input.dispatch({ type: 'button', id: idx });
        return;
      }

      if (SG.UI && SG.UI.cellAt) {
        var pos = stageCoords(e.clientX, e.clientY);
        var point = SG.UI.cellAt(pos.x, pos.y);
        if (point) SG.Input.dispatch(point);
      }
      // それ以外の場所 = 何もしない(§7.3)
    } catch (err) {
      console.error(err);
      try { SG.Game.recover(); } catch (e2) { console.error(e2); }
    }
  }

  function onContextMenu(e) {
    e.preventDefault(); // 右クリック = cancel(§7.3)
    try {
      SG.Input.dispatch('cancel');
    } catch (err) {
      console.error(err);
      try { SG.Game.recover(); } catch (e2) { console.error(e2); }
    }
  }

  // ------------------------------------------------------------------
  // キーボード(§7.2): window の keydown。e.repeat は矢印だけ受け付ける。
  // ------------------------------------------------------------------

  function onKeyDown(e) {
    try {
      var key = e.key ? String(e.key).toLowerCase() : '';
      var action = keymap()[key];
      if (!action) return; // 割り当ての無いキーは無視(エラーにしない)

      e.preventDefault(); // 上のキーは preventDefault(§7.2)

      var isArrow = (action === 'up' || action === 'down' || action === 'left' || action === 'right');
      if (e.repeat && !isArrow) return; // e.repeat は矢印だけ受け付ける

      SG.Input.dispatch(action);
    } catch (err) {
      console.error(err);
      try { SG.Game.recover(); } catch (e2) { console.error(e2); }
    }
  }

  // §1: 起動時に main.js から 1 度だけ呼ばれる
  SG.Input.init = function () {
    if (inited) return;
    inited = true;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onClick);
    document.addEventListener('contextmenu', onContextMenu);
  };

})();
