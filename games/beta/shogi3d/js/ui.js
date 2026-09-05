var SG = (typeof window !== 'undefined') ? (window.SG = window.SG || {}) : (global.SG = global.SG || {});

// SG.UI: 画面(DOM)の生成・描画・表示切替。SPEC.md §1・§6 準拠。
// 色・数値は SG.CONFIG から読む(交換パーツは config.js だけに置く・ここに直書きしない)。
// それ以外の px(§6 で直接指定されている座標・大きさ)は SPEC の値をそのまま定数として使う。
// 全関数 try/catch 保護(止まるより進む)。SPEC の範囲(§1 の 16 関数)だけを実装し、新しい公開関数は足さない。
(function () {

  SG.UI = SG.UI || {};

  // ------------------------------------------------------------------
  // 内部状態(SG.UI の公開 API には出さない)
  // ------------------------------------------------------------------

  var initialized = false;
  var els = {};              // id → DOM 要素
  var sqEls = null;          // 81 マスの div。添字 r*9+c
  var hint = null;           // markHint/clearHint が持つ {from, to}
  var menuRowEls = [];       // showMenu が作った行 div の配列(render がハイライトに使う)
  var titleOptionEls = null; // showTitle が作った 2 行(チュートリアル/フリープレイ)
  var promoBtns = null;      // showPromo 用 [成る, 成らない]
  var bandTextEl = null;
  var bandNextEl = null;
  var bandPageEl = null;
  var lastSenteChips = [];   // render() が記録する先手駒台チップの当たり判定(cellAt 用)

  // §6.2 の id ごとの left, top, w, h(px・1280×720 基準ステージ上)
  var LAYOUT = {
    files: { left: 370, top: 8, w: 540, h: 20 },
    board: { left: 370, top: 30, w: 540, h: 540 },
    ranks: { left: 914, top: 30, w: 20, h: 540 },
    gotePanel: { left: 40, top: 30, w: 300, h: 250 },
    sentePanel: { left: 940, top: 320, w: 300, h: 250 },
    keys: { left: 940, top: 580, w: 300, h: 60 },
    msg: { left: 370, top: 574, w: 540, h: 24 },
    band: { left: 190, top: 604, w: 900, h: 100 },
    promo: { left: 490, top: 270, w: 300, h: 90 },
    menu: { left: 440, top: 200, w: 400, h: 240 },
    banner: { left: 0, top: 290, w: 1280, h: 140 },
    title: { left: 0, top: 0, w: 1280, h: 720 }
  };

  // §6.3・§6.4: 駒・チップの大きさ(SPEC 直書きの固定値。CONFIG には無いキーなのでここに定数として持つ)
  var PIECE_W = 46, PIECE_H = 50, PIECE_LEFT = 7, PIECE_TOP = 5;
  var PIECE_CLIP = 'polygon(50% 0%, 100% 22%, 88% 100%, 12% 100%, 0% 22%)';
  var CHIP_GAP = 6;
  var PANEL_PAD = 10, NAME_H = 26, PLY_H = 22, LABEL_H = 20;

  // ------------------------------------------------------------------
  // 内部ヘルパー
  // ------------------------------------------------------------------

  function cfg() { return SG.CONFIG || {}; }

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

  // id の要素が無ければ作って parent に足す(index.html が先に用意していれば再利用する)
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

  function itemLabel(item) {
    if (item == null) return '';
    if (typeof item === 'string' || typeof item === 'number') return String(item);
    if (typeof item === 'object') {
      if (item.label != null) return String(item.label);
      if (item.text != null) return String(item.text);
      if (item.name != null) return String(item.name);
    }
    return String(item);
  }

  function panelKey(owner) { return (owner === 0) ? 'sentePanel' : 'gotePanel'; }

  function ensureInit() {
    if (!initialized) {
      try { SG.UI.init(); } catch (e) { logErr(e); }
    }
  }

  // §6.1: resize のたびに s とオフセットを計算して #stage へ transform をかける
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
    } catch (e) {
      logErr(e);
    }
  }

  function layoutContainers() {
    var key;
    for (key in LAYOUT) {
      if (!LAYOUT.hasOwnProperty(key)) continue;
      if (els[key]) setBox(els[key], LAYOUT[key].left, LAYOUT[key].top, LAYOUT[key].w, LAYOUT[key].h);
    }
    // §6.1 既定パネル外観。band/promo/menu/banner/title のうち独自背景を持つものは後で上書きする
    var defaults = ['gotePanel', 'sentePanel', 'keys', 'msg', 'promo', 'menu'];
    var i, p;
    for (i = 0; i < defaults.length; i++) {
      p = els[defaults[i]];
      if (!p) continue;
      p.style.background = 'rgba(0,0,0,0.45)';
      p.style.borderRadius = '6px';
      p.style.boxSizing = 'border-box';
      p.style.overflow = 'hidden';
    }
    if (els.board) els.board.style.boxSizing = 'border-box';
    var zmap = { band: 5, promo: 6, menu: 7, banner: 8, title: 9 };
    for (key in zmap) {
      if (els[key]) els[key].style.zIndex = String(zmap[key]);
    }
  }

  // §6.3: マスは起動時に 1 度だけ作る
  function buildBoardSquares() {
    var cell = num('CELL', 60);
    var canReuse = els.board.children.length === 81 && els.board.children[0].hasAttribute && els.board.children[0].hasAttribute('data-r');
    if (canReuse) {
      sqEls = [];
      var i;
      for (i = 0; i < els.board.children.length; i++) sqEls.push(els.board.children[i]);
      return;
    }
    clear(els.board);
    sqEls = [];
    var r, c;
    for (r = 0; r < 9; r++) {
      for (c = 0; c < 9; c++) {
        var sq = document.createElement('div');
        sq.className = 'sq';
        sq.setAttribute('data-r', String(r));
        sq.setAttribute('data-c', String(c));
        setBox(sq, c * cell, r * cell, cell, cell);
        sq.style.boxSizing = 'border-box';
        sq.style.border = '1px solid ' + color('line', '#5a3a1a');
        sq.style.backgroundColor = color('board', '#f0c060');
        els.board.appendChild(sq);
        sqEls.push(sq);
      }
    }
  }

  function buildFilesRanks() {
    var cell = num('CELL', 60);
    clear(els.files);
    var i, span;
    for (i = 0; i < 9; i++) {
      span = document.createElement('div');
      setBox(span, i * cell, 0, cell, LAYOUT.files.h);
      span.style.textAlign = 'center';
      span.style.fontSize = '14px';
      span.textContent = String(9 - i);
      els.files.appendChild(span);
    }
    clear(els.ranks);
    var kanji = '一二三四五六七八九';
    for (i = 0; i < 9; i++) {
      span = document.createElement('div');
      setBox(span, 0, i * cell, LAYOUT.ranks.w, cell);
      span.style.textAlign = 'center';
      span.style.fontSize = '14px';
      span.style.lineHeight = cell + 'px';
      span.textContent = kanji.charAt(i);
      els.ranks.appendChild(span);
    }
  }

  function buildKeysPanel() {
    clear(els.keys);
    els.keys.style.fontSize = '13px';
    els.keys.style.lineHeight = '1.5';
    els.keys.style.padding = '8px 10px';
    els.keys.style.boxSizing = 'border-box';
    var lines = ['←↑→↓ カーソル ／ Z 決定 ／ X 戻る', '最下段で ↓ → 持ち駒', 'S メニュー（投了・タイトル）'];
    var i, d;
    for (i = 0; i < lines.length; i++) {
      d = document.createElement('div');
      d.textContent = lines[i];
      els.keys.appendChild(d);
    }
  }

  function buildBandSkeleton() {
    clear(els.band);
    els.band.style.background = 'rgba(20,40,90,0.9)';
    els.band.style.border = '2px solid #7aa7ff';
    els.band.style.boxSizing = 'border-box';

    bandTextEl = document.createElement('div');
    setBox(bandTextEl, 20, 12, LAYOUT.band.w - 40, 60);
    bandTextEl.style.fontSize = '18px';
    bandTextEl.style.lineHeight = '1.3em';
    bandTextEl.style.maxHeight = '3.9em';
    bandTextEl.style.overflow = 'hidden';
    els.band.appendChild(bandTextEl);

    bandNextEl = document.createElement('div');
    setBox(bandNextEl, LAYOUT.band.w - 140, LAYOUT.band.h - 32, 120, 20);
    bandNextEl.style.fontSize = '14px';
    bandNextEl.style.textAlign = 'right';
    bandNextEl.style.color = color('cursor', '#ffd54f');
    bandNextEl.textContent = 'Z で次へ';
    els.band.appendChild(bandNextEl);

    bandPageEl = document.createElement('div');
    setBox(bandPageEl, 20, LAYOUT.band.h - 32, 150, 20);
    bandPageEl.style.fontSize = '14px';
    bandPageEl.hidden = true;
    els.band.appendChild(bandPageEl);
  }

  function styleButton(el) {
    el.style.boxSizing = 'border-box';
    el.style.textAlign = 'center';
    el.style.lineHeight = '36px';
    el.style.fontSize = '16px';
    el.style.background = 'rgba(255,255,255,0.12)';
    el.style.borderRadius = '4px';
  }

  function buildPromoSkeleton() {
    clear(els.promo);
    var l1 = document.createElement('div');
    setBox(l1, 0, 8, LAYOUT.promo.w, 20);
    l1.style.textAlign = 'center';
    l1.textContent = '成りますか？';
    els.promo.appendChild(l1);

    var btnOk = document.createElement('div');
    setBox(btnOk, 20, 40, 120, 36);
    styleButton(btnOk);
    btnOk.textContent = '成る';
    els.promo.appendChild(btnOk);

    var btnNo = document.createElement('div');
    setBox(btnNo, 160, 40, 120, 36);
    styleButton(btnNo);
    btnNo.textContent = '成らない';
    els.promo.appendChild(btnNo);

    promoBtns = [btnOk, btnNo];
  }

  function buildTitleSkeleton() {
    clear(els.title);
    els.title.style.background = 'rgba(0,0,0,0.7)';

    var heading = document.createElement('div');
    setBox(heading, 0, 200, 1280, 60);
    heading.style.fontSize = '48px';
    heading.style.fontWeight = 'bold';
    heading.style.textAlign = 'center';
    heading.textContent = '将棋 β';
    els.title.appendChild(heading);

    var opt1 = document.createElement('div');
    setBox(opt1, 0, 330, 1280, 36);
    opt1.style.fontSize = '28px';
    opt1.style.textAlign = 'center';
    els.title.appendChild(opt1);

    var opt2 = document.createElement('div');
    setBox(opt2, 0, 390, 1280, 36);
    opt2.style.fontSize = '28px';
    opt2.style.textAlign = 'center';
    els.title.appendChild(opt2);

    titleOptionEls = [opt1, opt2];

    var footer = document.createElement('div');
    setBox(footer, 0, 470, 1280, 24);
    footer.style.fontSize = '16px';
    footer.style.textAlign = 'center';
    footer.textContent = '↑↓ で選び Z で決定';
    els.title.appendChild(footer);
  }

  // §6.3: 駒 1 個ぶんの見た目(盤上・駒台どちらにも使う共通の五角形)
  function paintPieceLike(div, t, o, p) {
    setBox(div, 0, 0, PIECE_W, PIECE_H);
    div.style.clipPath = PIECE_CLIP;
    div.style['-webkit-clip-path'] = PIECE_CLIP;
    div.style.background = color('piece', '#f5deb3');
    div.style.color = p ? color('promoted', '#c62828') : color('pieceText', '#111111');
    div.style.fontSize = '24px';
    div.style.fontWeight = 'bold';
    div.style.lineHeight = PIECE_H + 'px';
    div.style.textAlign = 'center';
    div.style.pointerEvents = 'none';
    if (o === 1) div.style.transform = 'rotate(180deg)';
    div.textContent = glyphOf(t, o, p);
  }

  function glyphOf(t, o, p) {
    var G = cfg().GLYPH || {};
    var GP = cfg().GLYPH_PROMOTED || {};
    if (t === 'K') {
      var kArr = G.K || ['玉', '王'];
      return kArr[o] || '玉';
    }
    if (p && GP[t]) return GP[t];
    return G[t] || t || '';
  }

  function renderPieceInSquare(sqEl, piece) {
    var existing = sqEl.querySelector ? sqEl.querySelector('.piece') : null;
    if (existing) sqEl.removeChild(existing);
    if (!piece) return;
    var div = document.createElement('div');
    div.className = 'piece' + (piece.p ? ' promoted' : '');
    div.style.position = 'absolute';
    div.style.left = PIECE_LEFT + 'px';
    div.style.top = PIECE_TOP + 'px';
    paintPieceLike(div, piece.t, piece.o, !!piece.p);
    sqEl.appendChild(div);
  }

  function buildChipEl(t, n) {
    var el = document.createElement('div');
    el.className = 'chip';
    el.style.position = 'relative';
    paintPieceLike(el, t, 0, false);
    el.style.pointerEvents = 'auto';

    var countEl = document.createElement('div');
    countEl.style.position = 'absolute';
    countEl.style.right = '-2px';
    countEl.style.top = '-4px';
    countEl.style.fontSize = '12px';
    countEl.style.color = '#ffffff';
    countEl.style.textShadow = '0 0 3px #000000, 0 0 3px #000000';
    countEl.textContent = '×' + n;
    el.appendChild(countEl);

    return el;
  }

  // §3〜§6 の橋渡し: 選択中(sel)から見える合法な行き先の集合({r_c: true})。SG.Rules が無ければ空集合
  function computeTargetSet(state) {
    var set = {};
    try {
      if (!state.sel || !SG.Rules || typeof SG.Rules.legalMoves !== 'function') return set;
      var moves = SG.Rules.legalMoves(state.pos);
      var i, m, match;
      for (i = 0; i < moves.length; i++) {
        m = moves[i];
        match = false;
        if (state.sel.from && m.from && m.from.r === state.sel.from.r && m.from.c === state.sel.from.c) match = true;
        if (state.sel.drop && !m.from && m.drop === state.sel.drop) match = true;
        if (match && m.to) set[m.to.r + '_' + m.to.c] = true;
      }
    } catch (e) {
      logErr(e);
    }
    return set;
  }

  // §6.3: マスの強調(複数同時可)。塗り(selected/target/last)は重ね、cursor は内側リング、hint は破線アウトライン
  function applySquareVisual(el, flags) {
    var cls = ['sq'];
    var bgLayers = [];
    if (flags.selected) { cls.push('selected'); bgLayers.push(flatLayer(color('selected'))); }
    if (flags.last) { cls.push('last'); bgLayers.push(flatLayer(color('last'))); }
    if (flags.target) { cls.push('target'); bgLayers.push(flatLayer(color('target'))); }
    el.style.backgroundColor = color('board', '#f0c060');
    el.style.backgroundImage = bgLayers.length ? bgLayers.join(',') : 'none';

    if (flags.cursor) {
      cls.push('cursor');
      el.style.boxShadow = 'inset 0 0 0 3px ' + color('cursor', '#ffd54f');
    } else {
      el.style.boxShadow = 'none';
    }

    if (flags.hintFrom || flags.hintTo) {
      if (flags.hintFrom) cls.push('hint-from');
      if (flags.hintTo) cls.push('hint-to');
      el.style.outline = '3px dashed ' + color('hint', '#42a5f5');
      el.style.outlineOffset = '-3px';
    } else {
      el.style.outline = 'none';
    }
    el.className = cls.join(' ');
  }

  function flatLayer(c) {
    return 'linear-gradient(' + c + ',' + c + ')';
  }

  // §6.4: 先手の駒台チップだけ選べる(cursor/selected/hint-from)。後手は表示だけ
  function applyChipVisual(el, flags) {
    var cls = ['chip'];
    if (flags.selected) {
      cls.push('selected');
    }
    var shadows = [];
    if (flags.selected) shadows.push('inset 0 0 0 40px ' + color('selected'));
    if (flags.cursor) { cls.push('cursor'); shadows.push('inset 0 0 0 3px ' + color('cursor', '#ffd54f')); }
    el.style.boxShadow = shadows.length ? shadows.join(',') : 'none';
    if (flags.hintFrom) {
      cls.push('hint-from');
      el.style.outline = '3px dashed ' + color('hint', '#42a5f5');
      el.style.outlineOffset = '-3px';
    } else {
      el.style.outline = 'none';
    }
    el.className = cls.join(' ');
  }

  function renderBoard(state) {
    var pos = state.pos;
    var cursor = state.cursor || {};
    var sel = state.sel;
    var last = state.lastMove;
    var targetSet = computeTargetSet(state);
    var r, c, sqEl, piece, flags;
    for (r = 0; r < 9; r++) {
      for (c = 0; c < 9; c++) {
        sqEl = sqEls[r * 9 + c];
        if (!sqEl) continue;
        piece = (pos.board && pos.board[r]) ? pos.board[r][c] : null;
        renderPieceInSquare(sqEl, piece || null);

        flags = {
          cursor: cursor.zone === 'board' && cursor.r === r && cursor.c === c,
          selected: !!(sel && sel.from && sel.from.r === r && sel.from.c === c),
          target: !!targetSet[r + '_' + c],
          last: !!(last && ((last.from && last.from.r === r && last.from.c === c) || (last.to && last.to.r === r && last.to.c === c))),
          hintFrom: !!(hint && hint.from && typeof hint.from.r === 'number' && hint.from.r === r && hint.from.c === c),
          hintTo: !!(hint && hint.to && typeof hint.to.r === 'number' && hint.to.r === r && hint.to.c === c)
        };
        applySquareVisual(sqEl, flags);
      }
    }
  }

  // §6.4: パネル(名前・手番・手数・持ち駒)を毎回作り直す
  function renderPanel(owner, state) {
    var panelEl = els[panelKey(owner)];
    if (!panelEl) return;
    clear(panelEl);

    var pos = state.pos;
    var turn = pos ? pos.turn : 0;
    var box = LAYOUT[panelKey(owner)];

    var nameLine = document.createElement('div');
    setBox(nameLine, PANEL_PAD, PANEL_PAD, box.w - PANEL_PAD * 2, NAME_H);
    nameLine.style.fontSize = '20px';
    nameLine.style.fontWeight = 'bold';
    var nm = (cfg().NAMES && cfg().NAMES[owner]) || (owner === 0 ? 'あなた' : 'かなめ');
    nameLine.textContent = nm + '（' + (owner === 0 ? '先手' : '後手') + '）';
    if (pos && turn === owner) {
      var dot = document.createElement('span');
      dot.textContent = '　● 手番';
      dot.style.color = color('cursor', '#ffd54f');
      nameLine.appendChild(dot);
    }
    panelEl.appendChild(nameLine);

    var y = PANEL_PAD + NAME_H;

    if (owner === 0) {
      var plyLine = document.createElement('div');
      setBox(plyLine, PANEL_PAD, y, box.w - PANEL_PAD * 2, PLY_H);
      plyLine.style.fontSize = '16px';
      plyLine.textContent = '第 ' + (((state.ply || 0)) + 1) + ' 手';
      panelEl.appendChild(plyLine);
      y += PLY_H;
    }

    var label = document.createElement('div');
    setBox(label, PANEL_PAD, y, box.w - PANEL_PAD * 2, LABEL_H);
    label.style.fontSize = '13px';
    label.textContent = '持ち駒';
    panelEl.appendChild(label);
    y += LABEL_H;

    var order = cfg().HAND_ORDER || ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
    var hand = (pos && pos.hands && pos.hands[owner]) || {};
    var present = [];
    var i;
    for (i = 0; i < order.length; i++) {
      var t = order[i];
      var n = hand[t] || 0;
      if (n > 0) present.push({ t: t, n: n });
    }

    if (present.length === 0) {
      var none = document.createElement('div');
      setBox(none, PANEL_PAD, y, box.w - PANEL_PAD * 2, PIECE_H);
      none.style.fontSize = '13px';
      none.textContent = 'なし';
      panelEl.appendChild(none);
      return;
    }

    for (i = 0; i < present.length; i++) {
      var left = PANEL_PAD + i * (PIECE_W + CHIP_GAP);
      var chipEl = buildChipEl(present[i].t, present[i].n);
      setBox(chipEl, left, y, PIECE_W, PIECE_H);
      panelEl.appendChild(chipEl);

      if (owner === 0) {
        var flags = {
          cursor: !!(state.cursor && state.cursor.zone === 'hand' && state.cursor.i === i),
          selected: !!(state.sel && state.sel.drop === present[i].t),
          hintFrom: !!(hint && hint.from && hint.from.drop === present[i].t)
        };
        applyChipVisual(chipEl, flags);
        lastSenteChips.push({ t: present[i].t, i: i, left: box.left + left, top: box.top + y, w: PIECE_W, h: PIECE_H });
      }
    }
  }

  function renderPromoHighlight(state) {
    if (!promoBtns || promoBtns.length !== 2) return;
    var choice = state.promoChoice || 0;
    var i;
    for (i = 0; i < 2; i++) {
      promoBtns[i].style.boxShadow = (i === choice) ? ('inset 0 0 0 3px ' + color('cursor', '#ffd54f')) : 'none';
    }
  }

  function renderMenuHighlight(state) {
    if (!menuRowEls || menuRowEls.length === 0) return;
    var idx = state.menuIndex || 0;
    var i;
    for (i = 0; i < menuRowEls.length; i++) {
      menuRowEls[i].style.background = (i === idx) ? 'rgba(255,213,79,0.3)' : 'transparent';
    }
  }

  function renderTitleHighlight(state) {
    if (!titleOptionEls || titleOptionEls.length !== 2) return;
    var idx = state.titleIndex || 0;
    var labels = ['チュートリアル', 'フリープレイ'];
    var i;
    for (i = 0; i < 2; i++) {
      titleOptionEls[i].textContent = (i === idx ? '▶ ' : '　') + labels[i];
    }
  }

  // ------------------------------------------------------------------
  // SG.UI 公開 API(§1 の一覧のとおり)
  // ------------------------------------------------------------------

  // §6.1・§6.3: ステージと固定要素を 1 度だけ作る。2 回目以降の呼び出しは何もしない
  SG.UI.init = function () {
    try {
      if (initialized) return;
      if (typeof document === 'undefined') return;
      initialized = true;

      els.stage = ensureEl('stage', 'div', document.body);
      els.stage.style.position = 'fixed';
      els.stage.style.left = '0';
      els.stage.style.top = '0';
      els.stage.style.width = '1280px';
      els.stage.style.height = '720px';
      els.stage.style.transformOrigin = '0 0';
      els.stage.style.background = '#2b2b33';
      els.stage.style.overflow = 'hidden';
      els.stage.style.fontFamily = '"Segoe UI", Meiryo, sans-serif';
      els.stage.style.fontSize = '16px';
      els.stage.style.color = '#ffffff';

      try {
        document.body.style.margin = '0';
        document.body.style.overflow = 'hidden';
        document.body.style.background = '#15151a';
      } catch (eBody) { logErr(eBody); }

      els.files = ensureEl('files', 'div', els.stage);
      els.board = ensureEl('board', 'div', els.stage);
      els.ranks = ensureEl('ranks', 'div', els.stage);
      els.gotePanel = ensureEl('gotePanel', 'div', els.stage);
      els.sentePanel = ensureEl('sentePanel', 'div', els.stage);
      els.keys = ensureEl('keys', 'div', els.stage);
      els.msg = ensureEl('msg', 'div', els.stage);
      els.band = ensureEl('band', 'div', els.stage);
      els.promo = ensureEl('promo', 'div', els.stage);
      els.menu = ensureEl('menu', 'div', els.stage);
      els.banner = ensureEl('banner', 'div', els.stage);
      els.title = ensureEl('title', 'div', els.stage);

      layoutContainers();
      buildBoardSquares();
      buildFilesRanks();
      buildKeysPanel();
      buildBandSkeleton();
      buildPromoSkeleton();
      buildTitleSkeleton();

      els.band.hidden = true;
      els.promo.hidden = true;
      els.menu.hidden = true;
      els.banner.hidden = true;
      els.title.hidden = true;

      applyStageScale();
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('resize', applyStageScale);
      }
    } catch (e) {
      logErr(e);
    }
  };

  // §6.5: 盤 81 マス・両パネル・カーソル・強調を毎回作り直す。#msg と band/promo/menu/banner/title の
  // 表示・非表示には触らない(それぞれ message()/showXxx()・hideXxx() だけの役目)
  SG.UI.render = function (state) {
    ensureInit();
    try {
      lastSenteChips = [];
      if (!state) return;
      if (state.pos && sqEls) {
        renderBoard(state);
        renderPanel(0, state);
        renderPanel(1, state);
      }
      renderPromoHighlight(state);
      renderMenuHighlight(state);
      renderTitleHighlight(state);
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2: #msg。自動では消えない(render は触らない)
  SG.UI.message = function (text) {
    ensureInit();
    try {
      if (els.msg) els.msg.textContent = (text == null) ? '' : String(text);
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2・§8.2: 案内帯。表示するのは Tutorial.show() 経由のここだけ
  SG.UI.showBand = function (text, meta) {
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

  SG.UI.hideBand = function () {
    ensureInit();
    try {
      if (els.band) els.band.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2: 成り確認。文言は固定なので引数無し
  SG.UI.showPromo = function () {
    ensureInit();
    try {
      if (els.promo) els.promo.hidden = false;
    } catch (e) {
      logErr(e);
    }
  };

  SG.UI.hidePromo = function () {
    ensureInit();
    try {
      if (els.promo) els.promo.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2・§7.5: items は文字列またはラベルを持つオブジェクトの配列
  SG.UI.showMenu = function (items) {
    ensureInit();
    try {
      clear(els.menu);
      menuRowEls = [];

      var heading = document.createElement('div');
      heading.style.fontSize = '22px';
      heading.style.fontWeight = 'bold';
      heading.style.padding = '10px 12px 4px';
      heading.textContent = 'メニュー';
      els.menu.appendChild(heading);

      var list = (items && items.length) ? items : [];
      var i, row;
      for (i = 0; i < list.length; i++) {
        row = document.createElement('div');
        row.style.height = '32px';
        row.style.lineHeight = '32px';
        row.style.fontSize = '20px';
        row.style.paddingLeft = '16px';
        row.style.boxSizing = 'border-box';
        row.textContent = itemLabel(list[i]);
        els.menu.appendChild(row);
        menuRowEls.push(row);
      }
      if (els.menu) els.menu.hidden = false;
    } catch (e) {
      logErr(e);
    }
  };

  SG.UI.hideMenu = function () {
    ensureInit();
    try {
      if (els.menu) els.menu.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2・§9.5・§8.7: 実際の呼び出しは (text, sub, hint) の 3 引数(3 行目・例「Z でタイトルへ」)。
  // hint 省略/空文字なら 3 行目は出さない
  SG.UI.showBanner = function (text, sub, hint3) {
    ensureInit();
    try {
      clear(els.banner);
      els.banner.style.background = 'rgba(0,0,0,0.75)';

      var l1 = document.createElement('div');
      setBox(l1, 0, 30, LAYOUT.banner.w, 50);
      l1.style.fontSize = '44px';
      l1.style.fontWeight = 'bold';
      l1.style.textAlign = 'center';
      l1.textContent = (text == null) ? '' : String(text);
      els.banner.appendChild(l1);

      var l2 = document.createElement('div');
      setBox(l2, 0, 82, LAYOUT.banner.w, 28);
      l2.style.fontSize = '22px';
      l2.style.textAlign = 'center';
      l2.textContent = (sub == null) ? '' : String(sub);
      els.banner.appendChild(l2);

      var h = (hint3 == null) ? '' : String(hint3);
      if (h) {
        var l3 = document.createElement('div');
        setBox(l3, 0, 114, LAYOUT.banner.w, 20);
        l3.style.fontSize = '16px';
        l3.style.textAlign = 'center';
        l3.textContent = h;
        els.banner.appendChild(l3);
      }
      els.banner.hidden = false;
    } catch (e) {
      logErr(e);
    }
  };

  SG.UI.hideBanner = function () {
    ensureInit();
    try {
      if (els.banner) els.banner.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  SG.UI.showTitle = function () {
    ensureInit();
    try {
      if (els.title) els.title.hidden = false;
    } catch (e) {
      logErr(e);
    }
  };

  SG.UI.hideTitle = function () {
    ensureInit();
    try {
      if (els.title) els.title.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §8.2 の resolveAllowedMove が渡す形: from は {r,c}(盤上) または {drop:'X'}(駒台)、to は常に {r,c}
  SG.UI.markHint = function (from, to) {
    try {
      hint = { from: from || null, to: to || null };
    } catch (e) {
      logErr(e);
    }
  };

  SG.UI.clearHint = function () {
    try {
      hint = null;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.1: ステージ座標(x,y)→ 盤のマス{r,c} / 先手駒台のチップ{zone:'hand',i,t} / null
  SG.UI.cellAt = function (x, y) {
    try {
      var cell = num('CELL', 60);
      var bl = LAYOUT.board.left, bt = LAYOUT.board.top;
      if (x >= bl && x < bl + cell * 9 && y >= bt && y < bt + cell * 9) {
        var c = Math.floor((x - bl) / cell);
        var r = Math.floor((y - bt) / cell);
        if (r >= 0 && r < 9 && c >= 0 && c < 9) return { r: r, c: c };
      }
      var i, ch;
      for (i = 0; i < lastSenteChips.length; i++) {
        ch = lastSenteChips[i];
        if (x >= ch.left && x < ch.left + ch.w && y >= ch.top && y < ch.top + ch.h) {
          return { zone: 'hand', i: ch.i, t: ch.t };
        }
      }
      return null;
    } catch (e) {
      logErr(e);
      return null;
    }
  };

})();
