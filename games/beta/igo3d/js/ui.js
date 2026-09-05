var IG = (typeof window !== 'undefined') ? (window.IG = window.IG || {}) : (global.IG = global.IG || {});

// IG.UI: 画面(DOM)の生成・描画・表示切替。SPEC.md §1・§6 準拠。
//
// ★このファイルの前提(先行の index.html・css/style.css・js/input.js を実読して合わせた):
//   ・#cols・#rows・#keys・#menu の <h2>・#title の中身(.ttl/.opt-tutorial/.opt-free/.help)は
//     index.html に静的に書かれている。ここでは作り直さない・触らない。
//   ・盤・石・印の位置と色は css/style.css が #board 内の .line/.star/.pt/.stone/.dot/.komark/.terr の
//     class と CSS変数(--c-board 等)で持つ。ここは「どの class を付けるか」と「線・星・交点81個の
//     left/top(座標そのものは盤サイズに依るので毎回 JS が要る)」だけを扱い、色・box-shadow・outline の
//     実値は再現しない(二重管理を避ける)。
//   ・IG.CONFIG.COLOR は起動時に CSS変数へ反映し(数値・色を直書きしない)、config.js が無い/壊れている
//     ときは style.css 自身の既定値(:root)にフォールバックする(止まるより進む)。
//   ・#cpuPanel・#youPanel の中身(名前・手番・石数など)は style.css 側に専用 class が無い旨が明記されて
//     いるので、ここでテキストの div を組み立てる(§6.4)。
// 全公開関数 try/catch 保護。SPEC §1 の 14 関数だけを実装し、新しい公開関数は足さない。
(function () {

  IG.UI = IG.UI || {};

  // ------------------------------------------------------------------
  // 内部状態(IG.UI の公開 API には出さない)
  // ------------------------------------------------------------------

  var initialized = false;
  var els = {};              // id → DOM 要素
  var ptEls = null;          // 81 個の div.pt。添字 r*SIZE+c
  var hintPt = null;         // markHint/clearHint が持つ {r,c} または null
  var menuRowEls = [];       // showMenu が作った行 div の配列(render のハイライトと cellAt が使う)
  var bandTextEl = null;
  var bandNextEl = null;
  var bandPageEl = null;
  var titleOpt = { tutorial: null, free: null }; // index.html 既存の .opt-tutorial / .opt-free

  // §6.1: ステージの transform(scale/translate)。cellAt が画面上の実際の位置(getBoundingClientRect)
  // をステージ座標へ逆変換するのに使う(座標系は input.js の stageCoords と同じ式)。
  var lastScale = 1, lastOffsetX = 0, lastOffsetY = 0;

  var ROW_GAP = 6; // パネル内の行間(px)。SPEC に明記無し・見た目は後回しなので適当な値

  // ------------------------------------------------------------------
  // 内部ヘルパー
  // ------------------------------------------------------------------

  function cfg() { return IG.CONFIG || {}; }

  function color(key, fallback) {
    var c = cfg().COLOR;
    return (c && c[key]) || fallback || '#000000';
  }

  function num(key, fallback) {
    var v = cfg()[key];
    return (typeof v === 'number') ? v : fallback;
  }

  function logErr(e) {
    if (typeof console !== 'undefined' && console.error) console.error(e);
  }

  function byId(id) {
    return (typeof document !== 'undefined') ? document.getElementById(id) : null;
  }

  // index.html に無ければ最低限を自作する(止まるより進む)。あれば再利用する
  function ensureEl(id, tag, parent) {
    var el = byId(id);
    if (!el) {
      el = document.createElement(tag || 'div');
      el.id = id;
      (parent || document.body).appendChild(el);
    }
    return el;
  }

  function setBox(el, left, top, w, h) {
    if (!el) return;
    el.style.position = 'absolute';
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    if (w != null) el.style.width = w + 'px';
    if (h != null) el.style.height = h + 'px';
  }

  function clear(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // showMenu(rows) は文字列配列で呼ばれる想定(js/input.js)だが、念のためラベル付きオブジェクトも許す
  function itemLabel(item) {
    if (item == null) return '';
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    if (typeof item === 'object') {
      if (item.label != null) return String(item.label);
      if (item.text != null) return String(item.text);
    }
    return String(item);
  }

  function ensureInit() {
    if (!initialized) {
      try { IG.UI.init(); } catch (e) { logErr(e); }
    }
  }

  // §1: IG.CONFIG.COLOR を css/style.css の :root 変数(--c-*)へ反映する。CONFIG が無ければ
  // style.css 自身の既定値(SPEC §1 と同じ色)がそのまま使われる
  function applyConfigColors() {
    try {
      var C = cfg().COLOR;
      if (!C || typeof document === 'undefined' || !document.documentElement) return;
      var map = {
        board: '--c-board', line: '--c-line', star: '--c-star',
        black: '--c-black', white: '--c-white', whiteEdge: '--c-white-edge',
        dotOnBlack: '--c-dot-on-black', dotOnWhite: '--c-dot-on-white',
        cursor: '--c-cursor', ko: '--c-ko', hint: '--c-hint',
        terrBlack: '--c-terr-black', terrWhite: '--c-terr-white'
      };
      var key;
      for (key in map) {
        if (map.hasOwnProperty(key) && C[key] != null) {
          document.documentElement.style.setProperty(map[key], String(C[key]));
        }
      }
    } catch (e) {
      logErr(e);
    }
  }

  // §6.1: resize のたびに s とオフセットを計算して #stage へ transform をかける(数値の意味は
  // input.js の stageCoords と同じ式の逆)。cellAt の stageRect 換算のため毎回キャッシュする
  function applyStageScale() {
    try {
      if (typeof window === 'undefined' || !els.stage) return;
      var iw = window.innerWidth || 1280;
      var ih = window.innerHeight || 720;
      var s = Math.min(iw / 1280, ih / 720);
      if (!isFinite(s) || s <= 0) s = 1;
      var ox = (iw - 1280 * s) / 2;
      var oy = (ih - 720 * s) / 2;
      els.stage.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + s + ')';
      lastScale = s; lastOffsetX = ox; lastOffsetY = oy;
    } catch (e) {
      logErr(e);
    }
  }

  // 要素の実際の画面位置(getBoundingClientRect・transform 込み)をステージ座標へ逆変換する。
  // #menu の行・#title の選択肢は css の通常フローで並ぶため、位置を自前計算せずここで実測する
  function stageRect(el) {
    try {
      if (!el || !el.getBoundingClientRect) return { left: 0, top: 0, w: 0, h: 0 };
      var r = el.getBoundingClientRect();
      var s = lastScale || 1;
      return {
        left: (r.left - lastOffsetX) / s,
        top: (r.top - lastOffsetY) / s,
        w: r.width / s,
        h: r.height / s
      };
    } catch (e) {
      logErr(e);
      return { left: 0, top: 0, w: 0, h: 0 };
    }
  }

  function inRect(x, y, rect) {
    return x >= rect.left && x < rect.left + rect.w && y >= rect.top && y < rect.top + rect.h;
  }

  // ------------------------------------------------------------------
  // 起動時に 1 度だけ作る土台(§6.3: 線→星→交点の順。交点を最前面にして重ねる)
  // ------------------------------------------------------------------

  function buildBoardFoundation() {
    if (!els.board) return;
    clear(els.board);
    ptEls = [];

    var cell = num('CELL', 60);
    var margin = num('MARGIN', 30);
    var size = num('SIZE', 9);
    var stars = cfg().STARS || [];
    var i, ln, s, st, r, c, pt;

    // 線 18 本(横 9 + 縦 9)。色・太さは css の .line が持つ
    for (i = 0; i < size; i++) {
      ln = document.createElement('div');
      ln.className = 'line';
      setBox(ln, margin, margin + cell * i - 1, cell * (size - 1), 2);
      els.board.appendChild(ln);

      ln = document.createElement('div');
      ln.className = 'line';
      setBox(ln, margin + cell * i - 1, margin, 2, cell * (size - 1));
      els.board.appendChild(ln);
    }

    // 星(CONFIG.STARS の [r,c] 5 個)。大きさ・色は css の .star が持つ
    for (i = 0; i < stars.length; i++) {
      st = stars[i];
      if (!st) continue;
      s = document.createElement('div');
      s.className = 'star';
      setBox(s, margin + cell * st[1] - 4, margin + cell * st[0] - 4, null, null);
      els.board.appendChild(s);
    }

    // 交点 81 個。大きさは css の .pt(60×60)が持つ。ここでは位置と data-r/data-c だけ
    for (r = 0; r < size; r++) {
      for (c = 0; c < size; c++) {
        pt = document.createElement('div');
        pt.className = 'pt';
        pt.setAttribute('data-r', String(r));
        pt.setAttribute('data-c', String(c));
        setBox(pt, cell * c, cell * r, null, null);
        els.board.appendChild(pt);
        ptEls.push(pt);
      }
    }
  }

  // #band は index.html では空(§8.2 の案内文専用)。中身(本文・Zで次へ・ページ)を 1 度だけ作る
  function buildBandChildren() {
    if (!els.band) return;
    clear(els.band);

    bandTextEl = document.createElement('div');
    bandTextEl.className = 'text';
    els.band.appendChild(bandTextEl);

    bandNextEl = document.createElement('div');
    bandNextEl.className = 'next';
    bandNextEl.textContent = 'Z で次へ';
    els.band.appendChild(bandNextEl);

    bandPageEl = document.createElement('div');
    bandPageEl.className = 'page';
    bandPageEl.hidden = true;
    els.band.appendChild(bandPageEl);
  }

  // #title の選択肢 2 行は index.html に既に有る(.opt-tutorial / .opt-free)。参照だけ取る
  function locateTitleOptions() {
    if (!els.title || !els.title.querySelector) return;
    titleOpt.tutorial = els.title.querySelector('.opt-tutorial') || null;
    titleOpt.free = els.title.querySelector('.opt-free') || null;
  }

  // ------------------------------------------------------------------
  // render() が使う描画ヘルパー
  // ------------------------------------------------------------------

  // §6.3: 81 交点の中身(石・最後の点・コウ枠・地の印)と強調(cursor/hint)を毎回作り直す
  function renderBoard(state) {
    var pos = state.pos;
    var board = pos ? pos.board : null;
    var ko = pos ? pos.ko : null;
    var last = state.lastMove;
    var cursor = state.cursor || {};
    var scoreObj = (state.result && state.result.score) ? state.result.score : null;
    var owner = scoreObj ? scoreObj.owner : null;
    var size = num('SIZE', 9);
    var cell = num('CELL', 60);
    var stone = num('STONE', 54);
    var stoneOff = (cell - stone) / 2; // css の .stone は既定 54(off 3px)。CONFIG.STONE を変えても効くように上書き
    var r, c, idx, ptEl, v, el, ow, isCursor, isHint, cls;

    for (r = 0; r < size; r++) {
      for (c = 0; c < size; c++) {
        idx = r * size + c;
        ptEl = ptEls[idx];
        if (!ptEl) continue;
        clear(ptEl);

        v = (board && board[r]) ? board[r][c] : 0;

        if (v === 1 || v === 2) {
          el = document.createElement('div');
          el.className = 'stone ' + (v === 1 ? 'black' : 'white');
          setBox(el, stoneOff, stoneOff, stone, stone);
          ptEl.appendChild(el);
        }

        if (last && last.kind === 'play' && last.r === r && last.c === c && (v === 1 || v === 2)) {
          el = document.createElement('div');
          el.className = 'dot ' + (v === 1 ? 'on-black' : 'on-white');
          ptEl.appendChild(el);
        }

        if (ko && ko.r === r && ko.c === c) {
          el = document.createElement('div');
          el.className = 'komark';
          ptEl.appendChild(el);
        }

        if (owner && v === 0) {
          ow = owner[r] ? owner[r][c] : 0;
          if (ow === 1 || ow === 2) {
            el = document.createElement('div');
            el.className = 'terr ' + (ow === 1 ? 'black' : 'white');
            ptEl.appendChild(el);
          }
        }

        isCursor = !!(cursor && cursor.r === r && cursor.c === c);
        isHint = !!(hintPt && hintPt.r === r && hintPt.c === c);
        cls = 'pt';
        if (isCursor) cls += ' cursor';
        if (isHint) cls += ' hint';
        ptEl.className = cls;
      }
    }
  }

  function panelKey(owner) { return owner === 1 ? 'youPanel' : 'cpuPanel'; }

  // §6.4: パネルの中身(名前・手番・手数・取った石・コミ・終局後の地/合計)を毎回作り直す。
  // css/style.css は専用 class を持たない旨が明記されているので、ここでテキストの div を組む
  function renderPanel(owner, state) {
    var panelEl = els[panelKey(owner)];
    if (!panelEl) return;
    clear(panelEl);

    var pos = state.pos;
    var turn = pos ? pos.turn : 0;
    var names = cfg().NAMES || { 1: 'あなた', 2: 'そら' };
    var colorNames = cfg().COLOR_NAMES || { 1: '黒', 2: '白' };

    var nameLine = document.createElement('div');
    nameLine.style.fontSize = '20px';
    nameLine.style.fontWeight = 'bold';
    nameLine.textContent = (names[owner] || '') + '（' + (colorNames[owner] || '') + '）';
    if (pos && turn === owner) {
      var dot = document.createElement('span');
      dot.textContent = '　● 手番';
      dot.style.color = color('cursor', '#ffd54f');
      nameLine.appendChild(dot);
    }
    panelEl.appendChild(nameLine);

    if (owner === 1) {
      var plyLine = document.createElement('div');
      plyLine.style.fontSize = '16px';
      plyLine.style.marginTop = ROW_GAP + 'px';
      plyLine.textContent = '第 ' + (((state.ply || 0)) + 1) + ' 手';
      panelEl.appendChild(plyLine);
    }

    var capLine = document.createElement('div');
    capLine.style.fontSize = '16px';
    capLine.style.marginTop = ROW_GAP + 'px';
    var capN = (pos && pos.captures && typeof pos.captures[owner] === 'number') ? pos.captures[owner] : 0;
    capLine.textContent = '取った石: ' + capN;
    panelEl.appendChild(capLine);

    if (owner === 2) {
      var komiLine = document.createElement('div');
      komiLine.style.fontSize = '13px';
      komiLine.style.marginTop = ROW_GAP + 'px';
      komiLine.textContent = 'コミ: ' + num('KOMI', 6.5);
      panelEl.appendChild(komiLine);
    }

    var scoreObj = (state.result && state.result.score) ? state.result.score : null;
    if (scoreObj) {
      var terrLine = document.createElement('div');
      terrLine.style.fontSize = '16px';
      terrLine.style.marginTop = ROW_GAP + 'px';
      var terrN = (scoreObj.terr && typeof scoreObj.terr[owner] === 'number') ? scoreObj.terr[owner] : 0;
      terrLine.textContent = '地: ' + terrN;
      panelEl.appendChild(terrLine);

      var totalLine = document.createElement('div');
      totalLine.style.fontSize = '16px';
      totalLine.style.marginTop = ROW_GAP + 'px';
      var totalN = (scoreObj.total && typeof scoreObj.total[owner] === 'number') ? scoreObj.total[owner] : 0;
      totalLine.textContent = '合計: ' + totalN;
      panelEl.appendChild(totalLine);
    }
  }

  // #menu の行の色は css の .row.cursor が持つ。ここは class を付け替えるだけ
  function renderMenuHighlight(state) {
    if (!menuRowEls || !menuRowEls.length) return;
    var idx = state.menuIndex || 0;
    var i;
    for (i = 0; i < menuRowEls.length; i++) {
      menuRowEls[i].className = (i === idx) ? 'row cursor' : 'row';
    }
  }

  // #title の ▶ は css の .opt.cursor::before が持つ。ここは class を付け替えるだけ(文字は index.html のまま)
  function renderTitleHighlight(state) {
    if (!titleOpt.tutorial && !titleOpt.free) return;
    var idx = state.titleIndex || 0;
    if (titleOpt.tutorial) titleOpt.tutorial.className = 'opt opt-tutorial' + (idx === 0 ? ' cursor' : '');
    if (titleOpt.free) titleOpt.free.className = 'opt opt-free' + (idx === 1 ? ' cursor' : '');
  }

  // ------------------------------------------------------------------
  // IG.UI 公開 API(SPEC §1 の 14 関数のとおり)
  // ------------------------------------------------------------------

  // §6.1・§6.3: index.html 既存の要素を拾い、#board・#band の中身・#title の参照を 1 度だけ作る
  IG.UI.init = function () {
    try {
      if (initialized) return;
      if (typeof document === 'undefined') return;
      initialized = true;

      els.stage = byId('stage');
      els.board = byId('board');
      els.cpuPanel = byId('cpuPanel');
      els.youPanel = byId('youPanel');
      els.msg = byId('msg');
      els.band = byId('band');
      els.menu = byId('menu');
      els.banner = byId('banner');
      els.title = byId('title');

      // 保険: index.html に無ければ最低限を自作する(止まるより進む)
      if (!els.stage) els.stage = ensureEl('stage', 'div', document.body);
      if (!els.board) els.board = ensureEl('board', 'div', els.stage);
      if (!els.cpuPanel) els.cpuPanel = ensureEl('cpuPanel', 'div', els.stage);
      if (!els.youPanel) els.youPanel = ensureEl('youPanel', 'div', els.stage);
      if (!els.msg) els.msg = ensureEl('msg', 'div', els.stage);
      if (!els.band) els.band = ensureEl('band', 'div', els.stage);
      if (!els.menu) els.menu = ensureEl('menu', 'div', els.stage);
      if (!els.banner) els.banner = ensureEl('banner', 'div', els.stage);
      if (!els.title) els.title = ensureEl('title', 'div', els.stage);

      applyConfigColors();
      buildBoardFoundation();
      buildBandChildren();
      locateTitleOptions();

      if (els.band) els.band.hidden = true;
      if (els.menu) els.menu.hidden = true;
      if (els.banner) els.banner.hidden = true;

      applyStageScale();
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('resize', applyStageScale);
      }
    } catch (e) {
      logErr(e);
    }
  };

  // §6.5: 81 交点の中身・両パネル・カーソル・強調(・メニュー/タイトルのハイライト)を毎回作り直す。
  // #msg と band/menu/banner/title の表示・非表示はここでは触らない(show◯◯/hide◯◯ だけの役目)
  IG.UI.render = function (state) {
    ensureInit();
    try {
      if (!state) return;
      if (ptEls && ptEls.length) renderBoard(state);
      renderPanel(1, state);
      renderPanel(2, state);
      renderMenuHighlight(state);
      renderTitleHighlight(state);
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2: #msg。自動では消えない
  IG.UI.message = function (text) {
    ensureInit();
    try {
      if (els.msg) els.msg.textContent = (text == null) ? '' : String(text);
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2・§8.2: 案内帯。表示するのは Tutorial.show() 経由のここだけ
  IG.UI.showBand = function (text, meta) {
    ensureInit();
    try {
      if (bandTextEl) bandTextEl.textContent = (text == null) ? '' : String(text);
      if (bandPageEl) {
        if (meta && meta.page != null) {
          bandPageEl.textContent = String(meta.page);
          bandPageEl.hidden = false;
        } else {
          bandPageEl.textContent = '';
          bandPageEl.hidden = true;
        }
      }
      if (els.band) els.band.hidden = false;
    } catch (e) {
      logErr(e);
    }
  };

  IG.UI.hideBand = function () {
    ensureInit();
    try {
      if (els.band) els.band.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2・§7.5: rows は文字列(またはラベル付きオブジェクト)の配列。#menu の <h2> は index.html のまま
  IG.UI.showMenu = function (rows) {
    ensureInit();
    try {
      if (!els.menu) return;

      var existing = els.menu.querySelectorAll ? els.menu.querySelectorAll('.row') : [];
      var k;
      for (k = 0; k < existing.length; k++) els.menu.removeChild(existing[k]);

      menuRowEls = [];
      var list = rows || [];
      var i, row;
      for (i = 0; i < list.length; i++) {
        row = document.createElement('div');
        row.className = 'row';
        row.textContent = itemLabel(list[i]);
        els.menu.appendChild(row);
        menuRowEls.push(row);
      }

      els.menu.hidden = false;
    } catch (e) {
      logErr(e);
    }
  };

  IG.UI.hideMenu = function () {
    ensureInit();
    try {
      if (els.menu) els.menu.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2・§9.5・§8: 終局・完了の帯。3 行目(hint3)は省略/空文字なら出さない
  IG.UI.showBanner = function (l1, l2, l3) {
    ensureInit();
    try {
      if (!els.banner) return;
      clear(els.banner);

      var d1 = document.createElement('div');
      d1.className = 'line1';
      d1.textContent = (l1 == null) ? '' : String(l1);
      els.banner.appendChild(d1);

      var d2 = document.createElement('div');
      d2.className = 'line2';
      d2.textContent = (l2 == null) ? '' : String(l2);
      els.banner.appendChild(d2);

      var s3 = (l3 == null) ? '' : String(l3);
      if (s3) {
        var d3 = document.createElement('div');
        d3.className = 'line3';
        d3.textContent = s3;
        els.banner.appendChild(d3);
      }

      els.banner.hidden = false;
    } catch (e) {
      logErr(e);
    }
  };

  IG.UI.hideBanner = function () {
    ensureInit();
    try {
      if (els.banner) els.banner.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2: タイトル画面。中身(見出し・選択肢・footer)は index.html のまま。表示/非表示だけ
  IG.UI.showTitle = function () {
    ensureInit();
    try {
      if (els.title) els.title.hidden = false;
    } catch (e) {
      logErr(e);
    }
  };

  IG.UI.hideTitle = function () {
    ensureInit();
    try {
      if (els.title) els.title.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.3・§8.3: pt は {r,c} または null(パスの指示は印を出さない)
  IG.UI.markHint = function (pt) {
    try {
      hintPt = pt || null;
    } catch (e) {
      logErr(e);
    }
  };

  IG.UI.clearHint = function () {
    try {
      hintPt = null;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.1: ステージ座標(x,y)→ 盤の交点 {type:'cell',r,c} / 帯 {type:'button',id:'band'} /
  // メニューの行 {type:'button',id:'menu',index} / タイトルの行 {type:'button',id:'title',index} / null。
  // #title・#banner・#menu は画面上で盤に重なるので、表示中のものを手前から順に見て先に当たったら返す
  IG.UI.cellAt = function (x, y) {
    try {
      if (els.title && !els.title.hidden) {
        var topts = [
          { el: titleOpt.tutorial, index: 0 },
          { el: titleOpt.free, index: 1 }
        ];
        var i, rr;
        for (i = 0; i < topts.length; i++) {
          if (!topts[i].el) continue;
          rr = stageRect(topts[i].el);
          if (inRect(x, y, rr)) return { type: 'button', id: 'title', index: topts[i].index };
        }
        return null; // タイトルは全画面を覆うので、行以外は何も無い
      }

      if (els.banner && !els.banner.hidden) {
        if (inRect(x, y, stageRect(els.banner))) return null; // banner に押しボタンは無いが盤を覆う
      }

      if (els.menu && !els.menu.hidden) {
        var j, mr;
        for (j = 0; j < menuRowEls.length; j++) {
          mr = stageRect(menuRowEls[j]);
          if (inRect(x, y, mr)) return { type: 'button', id: 'menu', index: j };
        }
        if (inRect(x, y, stageRect(els.menu))) return null; // メニュー内だが行の外
      }

      if (els.band && !els.band.hidden) {
        if (inRect(x, y, stageRect(els.band))) return { type: 'button', id: 'band' };
      }

      if (els.board) {
        var cell = num('CELL', 60);
        var size = num('SIZE', 9);
        var bor = stageRect(els.board);
        if (inRect(x, y, bor)) {
          var c = Math.floor((x - bor.left) / cell);
          var r = Math.floor((y - bor.top) / cell);
          if (r >= 0 && r < size && c >= 0 && c < size) return { type: 'cell', r: r, c: c };
        }
      }

      return null;
    } catch (e) {
      logErr(e);
      return null;
    }
  };

})();
