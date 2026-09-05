var FD = (typeof window !== 'undefined') ? (window.FD = window.FD || {}) : (global.FD = global.FD || {});

// FD.UI — 画面(DOM)の生成・描画・表示切替。SPEC.md §1・§2・§6 準拠(投資ファンド経営 β版)。
//
// ★このファイルだけを作る依頼のため、index.html・css/style.css・js/config.js・js/fund.js・
//   js/game.js 等はまだ存在しない前提で書く(実読して確認済み。fund3d/ には SPEC.md しか無い)。
//   そのため、ここで触る要素は「あれば使う・無ければ作る」(ensureEl。§10.4 止まるより進む)。
//   位置(left/top/width/height)・パネルの背景色・枠線も、css/style.css が無くても画面として
//   成立するように、ここで §6 の px 値をそのまま inline style であてる(タスク指示の
//   「座標をそのまま使う」)。将来 index.html/css/style.css が同じ値で実装されても、
//   inline style が同じ値を上書きするだけなので衝突しない。
// ・数値・色は FD.CONFIG から読む。CONFIG に無い純粋な画面レイアウト値(パネルの座標・列幅・
//   チャート描画域の px など。§1 の CONFIG 必須キーに無いもの)だけ、このファイル内の定数
//   として持つ(SPEC §6 の値をそのまま)。
// ・お金の計算はしない(§10.6)。売買ダイアログの数字は Fund.quoteBuy/quoteSell の返り値を
//   そのまま表示するだけ、資産の数字は Fund.equity/total/…の返り値をそのまま表示するだけ。
//   評価額(shares×price)だけは対応する fund.js 関数が無く SPEC 自身が式を書いているので、
//   その式のままここで表示用に使う(§6.3・§6.5)。
// ・#top・#table・#nextBtn・#news・#chart・#log・#dialog の中身は render() が毎回作り直す
//   (§6.6・差分更新しない)。#menu・#title は行の文字を init 時に 1 度だけ作り、選択中の
//   ハイライトだけ render() で毎回更新する。#msg・#task は message()/task() だけが触る。
//   #band・#dialog・#menu・#result・#title の表示/非表示は show◯◯/hide◯◯ だけが触る
//   (render はそれらの hidden 属性を変えない。§6.6)。
// 全公開関数 try/catch 保護。SPEC §1 の 17 関数だけを実装し、新しい公開関数は足さない。
(function () {

  FD.UI = FD.UI || {};

  // ------------------------------------------------------------------
  // 画面レイアウト定数(§6.2〜§6.5)。CONFIG の必須キーに無い純粋な px 値なのでここに持つ
  // ------------------------------------------------------------------

  var RECT = {
    top:     { left: 0,   top: 0,   w: 1280, h: 64 },
    table:   { left: 16,  top: 80,  w: 760,  h: 296 },
    nextBtn: { left: 16,  top: 388, w: 760,  h: 44 },
    msg:     { left: 16,  top: 444, w: 760,  h: 52 },
    log:     { left: 16,  top: 508, w: 760,  h: 196 },
    news:    { left: 792, top: 80,  w: 472,  h: 132 },
    chart:   { left: 792, top: 224, w: 472,  h: 232 },
    task:    { left: 792, top: 468, w: 472,  h: 44 },
    keys:    { left: 792, top: 520, w: 472,  h: 184 },
    band:    { left: 40,  top: 556, w: 1200, h: 148 },
    dialog:  { left: 340, top: 120, w: 600,  h: 440 },
    menu:    { left: 490, top: 260, w: 300,  h: 160 },
    result:  { left: 0,   top: 0,   w: 1280, h: 720 },
    title:   { left: 0,   top: 0,   w: 1280, h: 720 }
  };

  var TOP_CELL_W = [213, 213, 213, 213, 213, 215];
  var TOP_CELL_LEFT = [0, 213, 426, 639, 852, 1065];
  var TOP_LABELS = ['日', '現金', '株の評価額', '合計', '前日比', '開始から'];

  var TABLE_HEAD_H = 32;   // 表内の相対 0〜32(絶対 80〜112)
  var TABLE_ROW_H = 40;    // 行 i = 絶対 112+40i 〜 152+40i(§6.2)
  var TABLE_COLS = [
    { w: 16,  align: 'center' }, // カーソル
    { w: 56,  align: 'left' },   // ティッカー
    { w: 132, align: 'left' },   // 銘柄
    { w: 64,  align: 'left' },   // 業種
    { w: 96,  align: 'right' },  // 株価
    { w: 132, align: 'right' },  // 前日比
    { w: 72,  align: 'right' },  // 保有
    { w: 100, align: 'right' },  // 評価額
    { w: 92,  align: 'right' }   // 損益
  ];
  var TABLE_HEAD_TEXT = ['', 'ティッカー', '銘柄', '業種', '株価', '前日比', '保有', '評価額', '損益'];

  var CHART_PLOT = { left: 24, top: 48, w: 440, h: 160 }; // #chart 相対(§6.4)

  var DIALOG_ROW_TOP = 160; // 行 k = 相対 160+64k 〜 224+64k(§6.5)
  var DIALOG_ROW_H = 64;

  var SECTOR_COLOR_KEY = { tech: 'sectorTech', food: 'sectorFood', energy: 'sectorEnergy' };
  var NEWS_COLOR_KEY = { boom: 'newsBoom', bust: 'newsBust', rumor: 'newsRumor', macro: 'newsMacro', calm: 'newsCalm' };

  var KEYS_LINES = [
    '↑↓ 銘柄を選ぶ（一番下の行は「次の日へ」）',
    'Z 選んだ銘柄の売買を開く ／ 一番下なら 次の日へ',
    '売買: ↑↓ 買う・売る・閉じる ／ ←→ か 1〜9 で割合 10〜90%',
    'Z 実行 ／ X 閉じる',
    'S メニュー（タイトルへ）',
    '右のチャートは選んだ銘柄の直近 20 日',
    'ニュースは次の「次の日へ」で効く'
  ];

  // config.js が無い/読めない時だけ使う保険(§1 の CONFIG.COLOR と同じ値。§10.4 止まるより進む)
  var FALLBACK_COLOR = {
    bg: '#101318', stage: '#1a1f27', panel: 'rgba(255,255,255,0.05)', panelEdge: '#2c3440',
    text: '#e8ecf1', dim: '#8a94a3', up: '#3ddc84', down: '#ff5c5c', flat: '#c0c6cf',
    select: 'rgba(255,213,79,0.22)', cursor: '#ffd54f', hint: '#42a5f5',
    band: 'rgba(20,40,90,0.92)', bandEdge: '#7aa7ff',
    chartLine: '#7aa7ff', chartDot: '#ffd54f', chartGrid: '#2c3440',
    newsBoom: '#3ddc84', newsBust: '#ff5c5c', newsRumor: '#ffb74d', newsMacro: '#64b5f6', newsCalm: '#8a94a3',
    button: '#2f3a4a', buttonEdge: '#4a5a70', next: '#2e7d32', overlay: 'rgba(0,0,0,0.75)',
    sectorTech: '#64b5f6', sectorFood: '#ffb74d', sectorEnergy: '#ba68c8'
  };
  var FALLBACK_NAMES = { title: '投資ファンド β', sub: '株を売買してファンドを増やす（30 日・1 日 1 ターン）' };

  // ------------------------------------------------------------------
  // 内部状態(FD.UI の公開 API には出さない)
  // ------------------------------------------------------------------

  var initialized = false;
  var els = {};                 // 'stage'|'top'|'table'|'nextBtn'|'msg'|'log'|'news'|'chart'|'task'|
                                 // 'keys'|'band'|'dialog'|'hint'|'result'|'menu'|'title' → DOM 要素
  var lastScale = 1, lastOffsetX = 0, lastOffsetY = 0;

  var tableRowEls = [];         // 6 個(§6.1 row 0〜5)。render のたびに中身を作り直す
  var menuRowEls = [];          // 2 個(タイトルへ/閉じる)。文字は init で 1 度だけ作る
  var dialogRowEls = [];        // 3 個(買う/売る/閉じる)。render のたびに作り直す
  var dialogPctMinusEl = null;
  var dialogPctPlusEl = null;
  var titleOptEls = [];         // 2 個(チュートリアル/フリープレイ)

  var bandTextEl = null, bandNextEl = null, bandPageEl = null;

  var hintSpec = null;          // null | {kind:'row'|'dialogRow', index}(§6.6・§8.3)

  // ------------------------------------------------------------------
  // 汎用ヘルパー
  // ------------------------------------------------------------------

  function cfg() { return FD.CONFIG || {}; }

  function num(key, fallback) {
    var v = cfg()[key];
    return (typeof v === 'number') ? v : fallback;
  }

  function str(v) { return (v == null) ? '' : String(v); }

  function logErr(e) { if (typeof console !== 'undefined' && console.error) console.error(e); }

  function byId(id) { return (typeof document !== 'undefined') ? document.getElementById(id) : null; }

  function clear(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // index.html に無ければ最低限を自作する(止まるより進む。§10.4)。あれば再利用する
  function ensureEl(id, tag, parent) {
    var el = byId(id);
    if (!el) {
      el = document.createElement(tag || 'div');
      el.id = id;
      (parent || document.body).appendChild(el);
    }
    return el;
  }

  function place(el, rect) {
    if (!el || !rect) return;
    el.style.position = 'absolute';
    if (rect.left != null) el.style.left = rect.left + 'px';
    if (rect.top != null) el.style.top = rect.top + 'px';
    if (rect.w != null) el.style.width = rect.w + 'px';
    if (rect.h != null) el.style.height = rect.h + 'px';
  }

  // parent 配下に position:absolute の div を 1 個作って置く(parent は position 指定済み前提)
  function absChild(parent, rect, cls) {
    var el = document.createElement('div');
    if (cls) el.className = cls;
    place(el, rect);
    if (parent) parent.appendChild(el);
    return el;
  }

  function kebab(k) { return String(k).replace(/([A-Z])/g, '-$1').toLowerCase(); }

  // CONFIG.COLOR[key] があればそれ、無ければ FALLBACK_COLOR[key](§10.4)
  function C(key) {
    var col = cfg().COLOR;
    if (col && col[key] != null) return col[key];
    return FALLBACK_COLOR[key] || '#888';
  }

  // §10.6: CONFIG.COLOR を CSS 変数へも反映しておく(将来 css/style.css が拾えるように。保険)
  function applyConfigColors() {
    try {
      if (typeof document === 'undefined' || !document.documentElement) return;
      var keys = Object.keys(FALLBACK_COLOR), i;
      for (i = 0; i < keys.length; i++) {
        document.documentElement.style.setProperty('--c-' + kebab(keys[i]), String(C(keys[i])));
      }
    } catch (e) { logErr(e); }
  }

  // fund.js の関数を安全に呼ぶ(無ければ fallback を返す。§10.4・例外にしない)
  function fcall(name, args, fallback) {
    try {
      var Fu = FD.Fund;
      if (Fu && typeof Fu[name] === 'function') return Fu[name].apply(Fu, args);
    } catch (e) { logErr(e); }
    return fallback;
  }

  // 表示の文字列は必ず Fund.fmtYen/fmtPct を使う(§10.6・同じ計算/整形を2箇所に書かない)。
  // fund.js が読めていない時だけ素の文字列にする(桁区切りの再実装はしない。§10.4)
  function FY(n) { return fcall('fmtYen', [n], String(n)); }
  function FP(h) { return fcall('fmtPct', [h], String(h) + '%'); }
  function signedYen(n) { return (n > 0 ? '+' : '') + FY(n); }
  function changeColor(n) { return n > 0 ? C('up') : (n < 0 ? C('down') : C('flat')); }

  // §6.1: resize のたびに s とオフセットを計算して #stage へ transform をかける
  function applyStageScale() {
    try {
      if (typeof window === 'undefined' || !els.stage) return;
      var sw = num('STAGE_W', 1280), sh = num('STAGE_H', 720);
      var iw = window.innerWidth || sw, ih = window.innerHeight || sh;
      var s = Math.min(iw / sw, ih / sh);
      if (!isFinite(s) || s <= 0) s = 1;
      var ox = (iw - sw * s) / 2, oy = (ih - sh * s) / 2;
      els.stage.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + s + ')';
      lastScale = s; lastOffsetX = ox; lastOffsetY = oy;
    } catch (e) { logErr(e); }
  }

  // 実際の画面位置(transform 込み)をステージ座標へ逆変換する(§6.1・input.js のマウス処理の逆)
  function stageRect(el) {
    try {
      if (!el || !el.getBoundingClientRect) return { left: 0, top: 0, w: 0, h: 0 };
      var r = el.getBoundingClientRect();
      var s = lastScale || 1;
      return { left: (r.left - lastOffsetX) / s, top: (r.top - lastOffsetY) / s, w: r.width / s, h: r.height / s };
    } catch (e) { logErr(e); return { left: 0, top: 0, w: 0, h: 0 }; }
  }

  function inRect(x, y, rect) {
    return !!rect && x >= rect.left && x < rect.left + rect.w && y >= rect.top && y < rect.top + rect.h;
  }

  // ------------------------------------------------------------------
  // 起動時に 1 度だけ作る土台
  // ------------------------------------------------------------------

  function panelize(el) {
    if (!el) return;
    el.style.boxSizing = 'border-box';
    el.style.overflow = 'hidden';
    el.style.color = C('text');
    el.style.fontFamily = '"Segoe UI", Meiryo, sans-serif';
    el.style.fontSize = '15px';
    el.style.background = C('panel');
    el.style.border = '1px solid ' + C('panelEdge');
    el.style.borderRadius = '6px';
  }

  // #stage と §6.2 の全パネルを、無ければ作る(あれば位置だけ合わせて再利用。§10.4)
  function buildSkeleton() {
    if (typeof document === 'undefined') return;

    if (document.body) {
      document.body.style.margin = '0';
      document.body.style.overflow = 'hidden';
      document.body.style.background = C('bg');
    }

    els.stage = byId('stage') || ensureEl('stage', 'div', document.body);
    els.stage.style.position = 'fixed';
    els.stage.style.left = '0'; els.stage.style.top = '0';
    els.stage.style.width = num('STAGE_W', 1280) + 'px';
    els.stage.style.height = num('STAGE_H', 720) + 'px';
    els.stage.style.transformOrigin = '0 0';
    els.stage.style.background = C('stage');
    els.stage.style.overflow = 'hidden';
    els.stage.style.fontFamily = '"Segoe UI", Meiryo, sans-serif';
    els.stage.style.fontSize = '15px';
    els.stage.style.color = C('text');

    els.top = ensureEl('top', 'div', els.stage);
    place(els.top, RECT.top);
    els.top.style.zIndex = '1';
    els.top.style.boxSizing = 'border-box';
    els.top.style.overflow = 'hidden';
    els.top.style.background = C('panel');
    els.top.style.borderBottom = '1px solid ' + C('panelEdge');

    els.table = ensureEl('table', 'div', els.stage);
    place(els.table, RECT.table);
    panelize(els.table);
    els.table.style.zIndex = '1';

    els.nextBtn = ensureEl('nextBtn', 'div', els.stage);
    place(els.nextBtn, RECT.nextBtn);
    els.nextBtn.style.zIndex = '1';
    els.nextBtn.style.boxSizing = 'border-box';
    els.nextBtn.style.display = 'flex';
    els.nextBtn.style.alignItems = 'center';
    els.nextBtn.style.justifyContent = 'center';
    els.nextBtn.style.background = C('next');
    els.nextBtn.style.color = C('text');
    els.nextBtn.style.fontFamily = '"Segoe UI", Meiryo, sans-serif';
    els.nextBtn.style.fontWeight = 'bold';
    els.nextBtn.style.fontSize = '20px';
    els.nextBtn.style.borderRadius = '6px';

    els.msg = ensureEl('msg', 'div', els.stage);
    place(els.msg, RECT.msg);
    panelize(els.msg);
    els.msg.style.zIndex = '1';
    els.msg.style.padding = '8px 10px';

    els.log = ensureEl('log', 'div', els.stage);
    place(els.log, RECT.log);
    panelize(els.log);
    els.log.style.zIndex = '1';
    els.log.style.padding = '6px 10px';

    els.news = ensureEl('news', 'div', els.stage);
    place(els.news, RECT.news);
    panelize(els.news);
    els.news.style.zIndex = '1';
    els.news.style.padding = '8px 12px';

    els.chart = ensureEl('chart', 'div', els.stage);
    place(els.chart, RECT.chart);
    panelize(els.chart);
    els.chart.style.zIndex = '1';

    els.task = ensureEl('task', 'div', els.stage);
    place(els.task, RECT.task);
    panelize(els.task);
    els.task.style.zIndex = '1';
    els.task.style.color = C('hint');
    els.task.style.fontSize = '14px';
    els.task.style.padding = '6px 10px';

    els.keys = ensureEl('keys', 'div', els.stage);
    place(els.keys, RECT.keys);
    panelize(els.keys);
    els.keys.style.zIndex = '1';
    els.keys.style.fontSize = '12px';
    els.keys.style.padding = '6px 10px';

    els.band = ensureEl('band', 'div', els.stage);
    place(els.band, RECT.band);
    els.band.style.zIndex = '30';
    els.band.style.boxSizing = 'border-box';
    els.band.style.padding = '12px 20px';
    els.band.style.background = C('band');
    els.band.style.border = '2px solid ' + C('bandEdge');
    els.band.style.borderRadius = '6px';
    els.band.style.color = C('text');
    els.band.style.fontFamily = '"Segoe UI", Meiryo, sans-serif';
    els.band.style.fontSize = '18px';
    els.band.hidden = true;

    els.dialog = ensureEl('dialog', 'div', els.stage);
    place(els.dialog, RECT.dialog);
    els.dialog.style.zIndex = '35';
    els.dialog.style.boxSizing = 'border-box';
    els.dialog.style.background = C('stage');
    els.dialog.style.border = '2px solid ' + C('buttonEdge');
    els.dialog.style.borderRadius = '6px';
    els.dialog.style.color = C('text');
    els.dialog.style.fontFamily = '"Segoe UI", Meiryo, sans-serif';
    els.dialog.hidden = true;

    els.hint = ensureEl('hint', 'div', els.stage);
    els.hint.style.position = 'absolute';
    els.hint.style.zIndex = '36';
    els.hint.style.outline = '3px dotted ' + C('hint');
    els.hint.style.outlineOffset = '-3px';
    els.hint.style.boxSizing = 'border-box';
    els.hint.style.pointerEvents = 'none';
    els.hint.hidden = true;

    els.result = ensureEl('result', 'div', els.stage);
    place(els.result, RECT.result);
    els.result.style.zIndex = '45';
    els.result.style.boxSizing = 'border-box';
    els.result.style.background = C('overlay');
    els.result.style.color = C('text');
    els.result.style.fontFamily = '"Segoe UI", Meiryo, sans-serif';
    els.result.hidden = true;

    els.menu = ensureEl('menu', 'div', els.stage);
    place(els.menu, RECT.menu);
    els.menu.style.zIndex = '48';
    els.menu.style.boxSizing = 'border-box';
    els.menu.style.background = C('stage');
    els.menu.style.border = '2px solid ' + C('buttonEdge');
    els.menu.style.borderRadius = '6px';
    els.menu.style.color = C('text');
    els.menu.style.fontFamily = '"Segoe UI", Meiryo, sans-serif';
    els.menu.hidden = true;

    els.title = ensureEl('title', 'div', els.stage);
    place(els.title, RECT.title);
    els.title.style.zIndex = '50';
    els.title.style.boxSizing = 'border-box';
    els.title.style.background = C('overlay');
    els.title.style.color = C('text');
    els.title.style.fontFamily = '"Segoe UI", Meiryo, sans-serif';
    els.title.hidden = true;
  }

  // #table: 見出し行 + 6 行の入れ物を 1 度だけ作る(§6.2・§6.3)。中身は render のたびに作り直す
  function buildTableSkeleton() {
    if (!els.table) return;
    clear(els.table);
    tableRowEls = [];

    var head = absChild(els.table, { left: 0, top: 0, w: 760, h: TABLE_HEAD_H });
    head.style.display = 'flex';
    head.style.alignItems = 'center';
    head.style.fontSize = '13px';
    head.style.color = C('dim');
    var i, cell;
    for (i = 0; i < TABLE_COLS.length; i++) {
      cell = document.createElement('div');
      cell.style.flex = '0 0 ' + TABLE_COLS[i].w + 'px';
      cell.style.width = TABLE_COLS[i].w + 'px';
      cell.style.textAlign = TABLE_COLS[i].align;
      cell.style.overflow = 'hidden';
      cell.style.whiteSpace = 'nowrap';
      cell.textContent = TABLE_HEAD_TEXT[i];
      head.appendChild(cell);
    }

    var r, row;
    for (r = 0; r < 6; r++) {
      row = absChild(els.table, { left: 0, top: TABLE_HEAD_H + TABLE_ROW_H * r, w: 760, h: TABLE_ROW_H });
      row.setAttribute('data-index', String(r));
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.fontSize = '15px';
      row.style.boxSizing = 'border-box';
      tableRowEls.push(row);
    }
  }

  // #band の中身(本文・Z で次へ・ページ)を 1 度だけ作る(§6.2・§8.2)。表示するのは
  // Tutorial.show() 経由の UI.showBand() だけ(§10.1)。ここは箱を作るだけ
  function buildBandChildren() {
    if (!els.band) return;
    clear(els.band);

    bandTextEl = document.createElement('div');
    bandTextEl.style.maxHeight = '4.4em';
    bandTextEl.style.overflow = 'hidden';
    bandTextEl.style.whiteSpace = 'pre-wrap';
    els.band.appendChild(bandTextEl);

    bandNextEl = document.createElement('div');
    bandNextEl.textContent = 'Z で次へ';
    bandNextEl.style.position = 'absolute';
    bandNextEl.style.right = '20px';
    bandNextEl.style.bottom = '10px';
    bandNextEl.style.fontSize = '14px';
    bandNextEl.style.color = C('cursor');
    els.band.appendChild(bandNextEl);

    bandPageEl = document.createElement('div');
    bandPageEl.style.position = 'absolute';
    bandPageEl.style.left = '20px';
    bandPageEl.style.bottom = '10px';
    bandPageEl.style.fontSize = '14px';
    bandPageEl.hidden = true;
    els.band.appendChild(bandPageEl);
  }

  // #menu: 見出し + 2 行(タイトルへ/閉じる)を 1 度だけ作る(§6.2・§7.5)。行の文字は固定
  function buildMenuChildren() {
    if (!els.menu) return;
    clear(els.menu);
    menuRowEls = [];

    var h = document.createElement('div');
    h.textContent = 'メニュー';
    h.style.position = 'absolute';
    h.style.left = '16px'; h.style.top = '12px';
    h.style.fontSize = '20px'; h.style.fontWeight = 'bold';
    els.menu.appendChild(h);

    var labels = ['タイトルへ', '閉じる'];
    var i, row;
    for (i = 0; i < labels.length; i++) {
      row = absChild(els.menu, { left: 16, top: 52 + 32 * i, w: 268, h: 32 });
      row.setAttribute('data-index', String(i));
      row.setAttribute('data-label', labels[i]);
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.fontSize = '20px';
      row.textContent = labels[i];
      menuRowEls.push(row);
    }
  }

  // #title: 見出し・サブ・選択肢2つ・ヒントを 1 度だけ作る(§6.2)。選択の▶だけ render で更新
  function buildTitleChildren() {
    if (!els.title) return;
    clear(els.title);
    titleOptEls = [];

    var names = cfg().NAMES || FALLBACK_NAMES;

    var h1 = absChild(els.title, { left: 0, top: 200, w: 1280, h: 56 });
    h1.style.textAlign = 'center'; h1.style.fontSize = '48px'; h1.style.fontWeight = 'bold';
    h1.textContent = str(names.title != null ? names.title : FALLBACK_NAMES.title);

    var h2 = absChild(els.title, { left: 0, top: 262, w: 1280, h: 26 });
    h2.style.textAlign = 'center'; h2.style.fontSize = '18px'; h2.style.color = C('dim');
    h2.textContent = str(names.sub != null ? names.sub : FALLBACK_NAMES.sub);

    var labels = ['チュートリアル', 'フリープレイ'];
    var tops = [318, 378]; // 当たり判定 y318〜358・378〜418(§6.2)。行自体は40px高で中に収まる
    var i, opt;
    for (i = 0; i < labels.length; i++) {
      opt = absChild(els.title, { left: 0, top: tops[i], w: 1280, h: 40 });
      opt.setAttribute('data-index', String(i));
      opt.setAttribute('data-label', labels[i]);
      opt.style.textAlign = 'center';
      opt.style.fontSize = '28px';
      opt.style.lineHeight = '40px';
      opt.textContent = labels[i];
      titleOptEls.push(opt);
    }

    var hint = absChild(els.title, { left: 0, top: 470, w: 1280, h: 24 });
    hint.style.textAlign = 'center'; hint.style.fontSize = '16px'; hint.style.color = C('dim');
    hint.textContent = '↑↓ で選び Z で決定';
  }

  // #keys: 常時表示のキー一覧 7 行。文言は変わらないので 1 度だけ作る(§6.2)
  function buildKeysStatic() {
    if (!els.keys) return;
    clear(els.keys);
    var i, d;
    for (i = 0; i < KEYS_LINES.length; i++) {
      d = document.createElement('div');
      d.style.height = '26px';
      d.style.lineHeight = '26px';
      d.style.overflow = 'hidden';
      d.style.whiteSpace = 'nowrap';
      d.textContent = KEYS_LINES[i];
      els.keys.appendChild(d);
    }
  }

  // ------------------------------------------------------------------
  // render() が使う描画ヘルパー(§6.6: 毎回作り直す)
  // ------------------------------------------------------------------

  // §6.2 #top: 資産の帯。6 マス。fund が無ければ全部 '-'
  function renderTop(state) {
    if (!els.top) return;
    clear(els.top);
    var fund = state.fund;

    var labels = TOP_LABELS.slice();
    if (state.phase === 'result') labels[0] = '終了';

    var values = ['-', '-', '-', '-', '-', '-'];
    var colors = [null, null, null, null, null, null];

    if (fund) {
      var days = num('DAYS', 30);
      values[0] = Math.min(fund.day, days) + ' / ' + days;
      values[1] = FY(fund.cash);
      var equity = fcall('equity', [fund], 0);
      var total = fcall('total', [fund], fund.cash);
      values[2] = FY(equity);
      values[3] = FY(total);
      var totalChange = fcall('totalChange', [fund], 0);
      var totalChangeH = fcall('totalChangeH', [fund], 0);
      values[4] = signedYen(totalChange) + ' (' + FP(totalChangeH) + ')';
      colors[4] = changeColor(totalChange);
      var retH = fcall('retHundredths', [fund], 0);
      values[5] = FP(retH);
      colors[5] = changeColor(retH);
    }

    var i, cell, lab, val;
    for (i = 0; i < 6; i++) {
      cell = absChild(els.top, { left: TOP_CELL_LEFT[i], top: 0, w: TOP_CELL_W[i], h: 64 });
      cell.style.boxSizing = 'border-box';
      cell.style.padding = '8px 10px';
      cell.style.overflow = 'hidden';

      lab = document.createElement('div');
      lab.style.fontSize = '12px';
      lab.style.color = C('dim');
      lab.textContent = labels[i];
      cell.appendChild(lab);

      val = document.createElement('div');
      val.style.fontSize = '22px';
      val.style.fontWeight = 'bold';
      val.style.marginTop = '2px';
      val.style.whiteSpace = 'nowrap';
      val.style.overflow = 'hidden';
      val.textContent = values[i];
      if (colors[i]) val.style.color = colors[i];
      cell.appendChild(val);
    }
  }

  // §6.2・§6.3 #table: 銘柄の表。fund が無ければ 6 行とも '-'(§6.6)
  function renderTable(state) {
    if (!tableRowEls.length) return;
    var fund = state.fund;
    var cursor = (typeof state.cursor === 'number') ? state.cursor : -1;
    var SECTORS = cfg().SECTORS || {};
    var i, row, stock;

    for (i = 0; i < 6; i++) {
      row = tableRowEls[i];
      clear(row);
      row.style.background = (cursor === i) ? C('select') : 'transparent';

      var texts = ['', '-', '-', '-', '-', '-', '-', '-', '-'];
      var colors = [C('cursor'), null, null, null, null, null, null, null, null];
      if (cursor === i) texts[0] = '▶';

      stock = fund ? fund.stocks[i] : null;
      if (stock && fund) {
        var pos = fund.pos[stock.id] || { shares: 0, bookCost: 0 };
        var sectorInfo = SECTORS[stock.sector] || {};
        texts[1] = stock.ticker;
        texts[2] = stock.name;
        texts[3] = sectorInfo.name || stock.sector;
        colors[3] = C(SECTOR_COLOR_KEY[stock.sector] || 'text');
        texts[4] = FY(stock.price);
        var dc = fcall('dayChange', [fund, i], 0);
        var dcH = fcall('dayChangeH', [fund, i], 0);
        texts[5] = signedYen(dc) + ' (' + FP(dcH) + ')';
        colors[5] = changeColor(dc);
        texts[6] = FY(pos.shares);
        colors[6] = (pos.shares === 0) ? C('dim') : null;
        texts[7] = FY(pos.shares * stock.price); // §6.3: fmtYen(shares×price)。専用関数が無いのでこの式のまま
        if (pos.shares > 0) {
          var unreal = fcall('unrealized', [fund, stock.id], 0);
          texts[8] = signedYen(unreal);
          colors[8] = changeColor(unreal);
        } else {
          texts[8] = '-';
        }
      }

      var c, cell;
      for (c = 0; c < TABLE_COLS.length; c++) {
        cell = document.createElement('div');
        cell.style.flex = '0 0 ' + TABLE_COLS[c].w + 'px';
        cell.style.width = TABLE_COLS[c].w + 'px';
        cell.style.textAlign = TABLE_COLS[c].align;
        cell.style.overflow = 'hidden';
        cell.style.whiteSpace = 'nowrap';
        if (c === 1) cell.style.fontWeight = 'bold'; // ティッカー(§6.3)
        cell.textContent = texts[c];
        if (colors[c]) cell.style.color = colors[c];
        row.appendChild(cell);
      }
    }
  }

  // §6.2 #nextBtn: phase!=='play' で hidden。cursor===6 で枠+▶
  function renderNextBtn(state) {
    if (!els.nextBtn) return;
    var show = (state.phase === 'play');
    els.nextBtn.hidden = !show;
    if (!show) return;

    var fund = state.fund;
    var day = fund ? fund.day : 1;
    var days = num('DAYS', 30);
    var text = (day < days)
      ? ('次の日へ（Z）　いま ' + day + ' 日目')
      : ('最終結果へ（Z）　いま ' + days + ' 日目');

    var cursor = (typeof state.cursor === 'number') ? state.cursor : -1;
    if (cursor === 6) {
      els.nextBtn.style.border = '3px solid ' + C('cursor');
      text = '▶ ' + text;
    } else {
      els.nextBtn.style.border = 'none';
    }
    els.nextBtn.textContent = text;
  }

  // §5.5 #news: fund が無ければ空。fund.news が無ければ「30日が終わりました」
  function renderNews(state) {
    if (!els.news) return;
    clear(els.news);
    var fund = state.fund;
    if (!fund) return;

    if (!fund.news) {
      var d = document.createElement('div');
      d.style.fontSize = '16px';
      d.textContent = '30 日が終わりました';
      els.news.appendChild(d);
      return;
    }

    var news = fund.news;
    var C_ = cfg();
    var NEWS_TEXT = C_.NEWS_TEXT || {};
    var EFFECT_TEXT = C_.EFFECT_TEXT || {};
    var SECTORS = C_.SECTORS || {};

    var l1 = document.createElement('div');
    l1.style.fontSize = '14px'; l1.style.color = C('dim');
    l1.textContent = '本日のニュース（' + fund.day + ' 日目）';
    els.news.appendChild(l1);

    var key = 'calm';
    if (news.type === 'macro') key = (news.dir === 1) ? 'up' : 'down';
    else if (news.type !== 'calm') key = news.sector;
    var textLine = ((NEWS_TEXT[news.type] || {})[key]) || '';

    var l2 = document.createElement('div');
    l2.style.fontSize = '16px'; l2.style.marginTop = '6px';
    l2.style.maxHeight = '2.6em'; l2.style.overflow = 'hidden';
    l2.textContent = textLine;
    els.news.appendChild(l2);

    var targetName = 'なし';
    if (news.type === 'macro') targetName = '全銘柄';
    else if (news.type !== 'calm') targetName = (SECTORS[news.sector] || {}).name || news.sector;

    var effectKey = news.type;
    if (news.type === 'macro') effectKey = 'macro_' + (news.dir === 1 ? 'up' : 'down');
    var effectTextVal = EFFECT_TEXT[effectKey] || '';

    var l4 = document.createElement('div');
    l4.style.fontSize = '14px'; l4.style.marginTop = '6px';
    l4.style.color = C(NEWS_COLOR_KEY[news.type] || 'text');
    l4.textContent = '対象: ' + targetName + ' ／ 予想: ' + effectTextVal;
    els.news.appendChild(l4);
  }

  // §6.4 #chart: div だけで折れ線。fund が無ければ空
  function renderChart(state) {
    if (!els.chart) return;
    clear(els.chart);
    var fund = state.fund;
    if (!fund) return;

    var targetId;
    if (typeof state.cursor === 'number' && state.cursor >= 0 && state.cursor <= 5 && fund.stocks[state.cursor]) {
      targetId = fund.stocks[state.cursor].id;
    } else {
      targetId = state.chartId || (fund.stocks[0] && fund.stocks[0].id);
    }
    var stock = fcall('stock', [fund, targetId], null);
    if (!stock) return;

    var chartDays = num('CHART_DAYS', 20);
    var values = fcall('chartSeries', [fund, targetId], stock.hist ? stock.hist.slice(-chartDays) : [stock.price]);
    var layout = fcall('chartLayout', [values, CHART_PLOT.w, CHART_PLOT.h], null);
    if (!layout) return;

    var title = document.createElement('div');
    title.style.position = 'absolute'; title.style.left = '12px'; title.style.top = '8px';
    title.style.fontSize = '14px'; title.style.whiteSpace = 'nowrap'; title.style.overflow = 'hidden';
    title.textContent = stock.ticker + ' ' + stock.name + '　直近 20 日　いま ' + FY(stock.price) + ' 円';
    els.chart.appendChild(title);

    var hiLab = document.createElement('div');
    hiLab.style.position = 'absolute'; hiLab.style.left = '24px'; hiLab.style.top = '30px';
    hiLab.style.fontSize = '11px'; hiLab.style.color = C('dim');
    hiLab.textContent = '高 ' + FY(layout.hi);
    els.chart.appendChild(hiLab);

    var loLab = document.createElement('div');
    loLab.style.position = 'absolute'; loLab.style.left = '24px'; loLab.style.top = '212px';
    loLab.style.fontSize = '11px'; loLab.style.color = C('dim');
    loLab.textContent = '安 ' + FY(layout.lo);
    els.chart.appendChild(loLab);

    var plot = absChild(els.chart, CHART_PLOT);
    plot.style.overflow = 'hidden';

    var g, gy, grids = [0, 79, 159];
    for (g = 0; g < grids.length; g++) {
      gy = absChild(plot, { left: 0, top: grids[g], w: CHART_PLOT.w, h: 1 });
      gy.style.background = C('chartGrid');
    }

    var pts = layout.pts || [];
    var i, p0, p1, dx, dy, seg, len, ang, dot, size;
    for (i = 0; i < pts.length - 1; i++) {
      p0 = pts[i]; p1 = pts[i + 1];
      dx = p1.x - p0.x; dy = p1.y - p0.y;
      len = Math.round(Math.sqrt(dx * dx + dy * dy));
      ang = Math.atan2(dy, dx);
      seg = absChild(plot, { left: p0.x, top: p0.y - 1, w: len, h: 2 });
      seg.style.background = C('chartLine');
      seg.style.transformOrigin = '0 50%';
      seg.style.transform = 'rotate(' + ang + 'rad)';
    }

    for (i = 0; i < pts.length; i++) {
      size = (i === pts.length - 1) ? 8 : 6;
      dot = absChild(plot, { left: pts[i].x - size / 2, top: pts[i].y - size / 2, w: size, h: size });
      dot.style.background = (i === pts.length - 1) ? C('chartDot') : C('chartLine');
    }
  }

  // §6.2 #log: fund.log の末尾 LOG_SHOW 件を古い順に
  function renderLog(state) {
    if (!els.log) return;
    clear(els.log);
    var fund = state.fund;
    if (!fund || !fund.log) return;
    var showN = num('LOG_SHOW', 8);
    var lines = fund.log.slice(-showN);
    var i, d;
    for (i = 0; i < lines.length; i++) {
      d = document.createElement('div');
      d.style.fontSize = '13px';
      d.style.height = '22px';
      d.style.lineHeight = '22px';
      d.style.overflow = 'hidden';
      d.style.whiteSpace = 'nowrap';
      d.textContent = lines[i];
      els.log.appendChild(d);
    }
  }

  // §6.5 #dialog: state.dialog が無ければ空。あれば quoteBuy/quoteSell の返り値をそのまま表示
  function renderDialog(state) {
    if (!els.dialog) return;
    clear(els.dialog);
    dialogRowEls = [];
    dialogPctMinusEl = null;
    dialogPctPlusEl = null;

    var dlg = state.dialog;
    var fund = state.fund;
    if (!dlg || !fund) return;

    var stock = fcall('stock', [fund, dlg.id], null);
    if (!stock) return;
    var idx = fcall('index', [fund, dlg.id], -1);
    var pos = fund.pos[dlg.id] || { shares: 0, bookCost: 0 };
    var sectorInfo = (cfg().SECTORS || {})[stock.sector] || {};

    var head = absChild(els.dialog, { left: 16, top: 12, w: 568, h: 28 });
    head.style.fontSize = '22px'; head.style.fontWeight = 'bold';
    head.textContent = stock.ticker + ' ' + stock.name + '（' + (sectorInfo.name || stock.sector) + '）';

    var dc = (idx >= 0) ? fcall('dayChange', [fund, idx], 0) : 0;
    var dcH = (idx >= 0) ? fcall('dayChangeH', [fund, idx], 0) : 0;
    var line2 = absChild(els.dialog, { left: 16, top: 48, w: 568, h: 22 });
    line2.style.fontSize = '16px';
    line2.textContent = '株価 ' + FY(stock.price) + ' 円（前日比 ' + signedYen(dc) + ' / ' + FP(dcH) + '）';

    var unreal = (pos.shares > 0) ? fcall('unrealized', [fund, dlg.id], 0) : 0;
    var line3 = absChild(els.dialog, { left: 16, top: 74, w: 568, h: 22 });
    line3.style.fontSize = '16px';
    line3.textContent = '保有 ' + FY(pos.shares) + ' 株（評価額 ' + FY(pos.shares * stock.price) + ' 円・損益 ' +
      (pos.shares > 0 ? (signedYen(unreal) + ' 円') : '-') + '）　現金 ' + FY(fund.cash) + ' 円';

    // 割合行(§6.5 相対 104〜140)
    var pctLabel = absChild(els.dialog, { left: 40, top: 108, w: 80, h: 28 });
    pctLabel.style.fontSize = '20px';
    pctLabel.textContent = '割合';

    dialogPctMinusEl = absChild(els.dialog, { left: 140, top: 104, w: 44, h: 36 });
    dialogPctMinusEl.style.display = 'flex'; dialogPctMinusEl.style.alignItems = 'center'; dialogPctMinusEl.style.justifyContent = 'center';
    dialogPctMinusEl.style.background = C('button'); dialogPctMinusEl.style.border = '1px solid ' + C('buttonEdge');
    dialogPctMinusEl.style.borderRadius = '4px'; dialogPctMinusEl.style.fontSize = '18px'; dialogPctMinusEl.style.boxSizing = 'border-box';
    dialogPctMinusEl.textContent = '◀';

    var pctVal = absChild(els.dialog, { left: 196, top: 104, w: 200, h: 36 });
    pctVal.style.display = 'flex'; pctVal.style.alignItems = 'center'; pctVal.style.justifyContent = 'center';
    pctVal.style.fontSize = '24px'; pctVal.style.fontWeight = 'bold';
    pctVal.textContent = dlg.pct + '%';

    dialogPctPlusEl = absChild(els.dialog, { left: 408, top: 104, w: 44, h: 36 });
    dialogPctPlusEl.style.display = 'flex'; dialogPctPlusEl.style.alignItems = 'center'; dialogPctPlusEl.style.justifyContent = 'center';
    dialogPctPlusEl.style.background = C('button'); dialogPctPlusEl.style.border = '1px solid ' + C('buttonEdge');
    dialogPctPlusEl.style.borderRadius = '4px'; dialogPctPlusEl.style.fontSize = '18px'; dialogPctPlusEl.style.boxSizing = 'border-box';
    dialogPctPlusEl.textContent = '▶';

    var pctHint = absChild(els.dialog, { left: 470, top: 108, w: 120, h: 28 });
    pctHint.style.fontSize = '14px'; pctHint.style.color = C('dim');
    pctHint.textContent = '（←→ か 1〜9）';

    // 買う/売る/閉じる の 3 行(§6.5・当たり判定 y160+64k〜224+64k)
    var REASON = cfg().REASON_TEXT || {};
    var qb = fcall('quoteBuy', [fund, dlg.id, dlg.pct], { ok: false, reason: 'none' });
    var qs = fcall('quoteSell', [fund, dlg.id, dlg.pct], { ok: false, reason: 'none' });

    function buildRow(k, line1Text, line2Text, line2Fail) {
      var row = absChild(els.dialog, { left: 0, top: DIALOG_ROW_TOP + DIALOG_ROW_H * k, w: 600, h: DIALOG_ROW_H });
      row.setAttribute('data-index', String(k));
      row.style.boxSizing = 'border-box';
      row.style.padding = '10px 28px';
      if (dlg.index === k) row.style.background = C('select');

      var l1 = document.createElement('div');
      l1.style.fontSize = '20px'; l1.style.fontWeight = 'bold';
      l1.textContent = (dlg.index === k ? '▶ ' : '　') + line1Text;
      row.appendChild(l1);

      if (line2Text != null) {
        var l2 = document.createElement('div');
        l2.style.fontSize = '14px'; l2.style.marginTop = '4px';
        if (line2Fail) l2.style.color = C('down');
        l2.textContent = line2Text;
        row.appendChild(l2);
      }
      dialogRowEls.push(row);
      return row;
    }

    var buyShares = (qb && typeof qb.shares === 'number') ? qb.shares : 0;
    var buyLine2, buyFail = false;
    if (qb && qb.ok) {
      buyLine2 = '代金 ' + FY(qb.amount) + ' 円 + 手数料 ' + FY(qb.fee) + ' 円 = 支払 ' + FY(qb.total) + ' 円（残り現金 ' + FY(qb.cashAfter) + ' 円）';
    } else {
      buyLine2 = REASON[(qb && qb.reason) || 'none'] || REASON.none || 'できません';
      buyFail = true;
    }
    buildRow(0, '買う　' + dlg.pct + '% → ' + FY(buyShares) + ' 株', buyLine2, buyFail);

    var sellShares = (qs && typeof qs.shares === 'number') ? qs.shares : 0;
    var sellLine2, sellFail = false;
    if (qs && qs.ok) {
      sellLine2 = '代金 ' + FY(qs.amount) + ' 円 − 手数料 ' + FY(qs.fee) + ' 円 = 受取 ' + FY(qs.total) + ' 円（損益 ' + signedYen(qs.amount - qs.released) + ' 円）';
    } else {
      sellLine2 = REASON[(qs && qs.reason) || 'none'] || REASON.none || 'できません';
      sellFail = true;
    }
    buildRow(1, '売る　' + dlg.pct + '% → ' + FY(sellShares) + ' 株', sellLine2, sellFail);

    buildRow(2, '閉じる（X）', null, false);

    var foot = absChild(els.dialog, { left: 16, top: 380, w: 568, h: 20 });
    foot.style.fontSize = '14px'; foot.style.color = C('dim');
    foot.textContent = 'Z 実行 ／ X 閉じる ／ ↑↓ 行 ／ ←→ 割合';
  }

  // #menu: 行の文字は固定(init 時作成済)。選択中の背景/▶だけ毎回更新
  function renderMenuHighlight(state) {
    if (!menuRowEls.length) return;
    var idx = state.menuOpen ? (state.menuIndex || 0) : -1;
    var i, lbl;
    for (i = 0; i < menuRowEls.length; i++) {
      lbl = menuRowEls[i].getAttribute('data-label') || '';
      menuRowEls[i].style.background = (i === idx) ? C('select') : 'transparent';
      menuRowEls[i].textContent = (i === idx ? '▶ ' : '　') + lbl;
    }
  }

  // #title: 選択肢の▶だけ毎回更新(文字は init 時作成済)
  function renderTitleHighlight(state) {
    if (!titleOptEls.length) return;
    var idx = state.titleIndex || 0;
    var i, lbl;
    for (i = 0; i < titleOptEls.length; i++) {
      lbl = titleOptEls[i].getAttribute('data-label') || '';
      titleOptEls[i].textContent = (i === idx ? '▶ ' : '　') + lbl;
    }
  }

  // §6.6・§8.3: markHint が覚えた場所へ #hint を動かす。null なら隠す
  function renderHint() {
    if (!els.hint) return;
    if (!hintSpec) { els.hint.hidden = true; return; }
    var rect = null;
    if (hintSpec.kind === 'row') {
      if (hintSpec.index >= 0 && hintSpec.index <= 5) {
        rect = { left: RECT.table.left, top: RECT.table.top + TABLE_HEAD_H + TABLE_ROW_H * hintSpec.index, w: 760, h: TABLE_ROW_H };
      } else if (hintSpec.index === 6) {
        rect = RECT.nextBtn;
      }
    } else if (hintSpec.kind === 'dialogRow') {
      if (hintSpec.index >= 0 && hintSpec.index <= 2) {
        rect = { left: RECT.dialog.left, top: RECT.dialog.top + DIALOG_ROW_TOP + DIALOG_ROW_H * hintSpec.index, w: 600, h: DIALOG_ROW_H };
      }
    }
    if (!rect) { els.hint.hidden = true; return; }
    place(els.hint, rect);
    els.hint.hidden = false;
  }

  // ------------------------------------------------------------------
  // FD.UI 公開 API(SPEC §1 の 17 関数のとおり)
  // ------------------------------------------------------------------

  FD.UI.init = function () {
    try {
      if (initialized) return;
      if (typeof document === 'undefined') return;
      initialized = true;

      buildSkeleton();
      applyConfigColors();
      buildTableSkeleton();
      buildBandChildren();
      buildMenuChildren();
      buildTitleChildren();
      buildKeysStatic();

      applyStageScale();
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('resize', applyStageScale);
      }
    } catch (e) { logErr(e); }
  };

  function ensureInit() {
    if (!initialized) { try { FD.UI.init(); } catch (e) { logErr(e); } }
  }

  // §6.6: #top・#table・#nextBtn・#news・#chart・#log・#dialog の中身、#menu/#title の選択、
  // #hint の位置を毎回作り直す。#msg・#task はここでは触らない。show/hide はここでは触らない
  FD.UI.render = function (state) {
    ensureInit();
    try {
      if (!state) return;
      renderTop(state);
      renderTable(state);
      renderNextBtn(state);
      renderNews(state);
      renderChart(state);
      renderLog(state);
      renderDialog(state);
      renderMenuHighlight(state);
      renderTitleHighlight(state);
      renderHint();
    } catch (e) { logErr(e); }
  };

  FD.UI.message = function (text) {
    ensureInit();
    try { if (els.msg) els.msg.textContent = str(text); } catch (e) { logErr(e); }
  };

  FD.UI.task = function (text) {
    ensureInit();
    try { if (els.task) els.task.textContent = str(text); } catch (e) { logErr(e); }
  };

  // §8.2・§10.1: 表示するのは Tutorial.show() 経由のここだけ。state.hold はここでは触らない
  FD.UI.showBand = function (text, meta) {
    ensureInit();
    try {
      if (bandTextEl) bandTextEl.textContent = str(text);
      if (bandPageEl) {
        if (meta && meta.page != null) { bandPageEl.textContent = String(meta.page); bandPageEl.hidden = false; }
        else { bandPageEl.textContent = ''; bandPageEl.hidden = true; }
      }
      if (els.band) els.band.hidden = false;
    } catch (e) { logErr(e); }
  };

  FD.UI.hideBand = function () {
    ensureInit();
    try { if (els.band) els.band.hidden = true; } catch (e) { logErr(e); }
  };

  FD.UI.showMenu = function () {
    ensureInit();
    try { if (els.menu) els.menu.hidden = false; } catch (e) { logErr(e); }
  };

  FD.UI.hideMenu = function () {
    ensureInit();
    try { if (els.menu) els.menu.hidden = true; } catch (e) { logErr(e); }
  };

  FD.UI.showDialog = function () {
    ensureInit();
    try { if (els.dialog) els.dialog.hidden = false; } catch (e) { logErr(e); }
  };

  FD.UI.hideDialog = function () {
    ensureInit();
    try { if (els.dialog) els.dialog.hidden = true; } catch (e) { logErr(e); }
  };

  FD.UI.showTitle = function () {
    ensureInit();
    try { if (els.title) els.title.hidden = false; } catch (e) { logErr(e); }
  };

  FD.UI.hideTitle = function () {
    ensureInit();
    try { if (els.title) els.title.hidden = true; } catch (e) { logErr(e); }
  };

  // §6.2・§9.3: Fund.result(f) の値(res)で文字を作る。ここでは計算しない
  FD.UI.showResult = function (res) {
    ensureInit();
    try {
      if (!els.result) return;
      clear(els.result);
      var r = res || {};

      var box = absChild(els.result, { left: 240, top: 180, w: 800, h: 360 });
      box.style.boxSizing = 'border-box';
      box.style.background = C('stage');
      box.style.border = '2px solid ' + C('cursor');
      box.style.borderRadius = '6px';

      var t1 = absChild(box, { left: 0, top: 20, w: 800, h: 44 });
      t1.style.textAlign = 'center'; t1.style.fontSize = '36px'; t1.style.fontWeight = 'bold';
      t1.textContent = '30 日間の運用結果';

      var t2 = absChild(box, { left: 0, top: 90, w: 800, h: 34 });
      t2.style.textAlign = 'center'; t2.style.fontSize = '26px';
      t2.textContent = '開始 ' + FY(r.start) + ' 円 → 最終 ' + FY(r.final) + ' 円';

      var t3 = absChild(box, { left: 0, top: 130, w: 800, h: 34 });
      t3.style.textAlign = 'center'; t3.style.fontSize = '26px'; t3.style.fontWeight = 'bold';
      t3.style.color = changeColor(typeof r.retH === 'number' ? r.retH : 0);
      t3.textContent = '騰落率 ' + FP(r.retH);

      var t4 = absChild(box, { left: 0, top: 190, w: 800, h: 24 });
      t4.style.textAlign = 'center'; t4.style.fontSize = '18px';
      t4.textContent = '現金 ' + FY(r.cash) + ' 円 ／ 株の評価額 ' + FY(r.equity) + ' 円';

      var t5 = absChild(box, { left: 0, top: 224, w: 800, h: 24 });
      t5.style.textAlign = 'center'; t5.style.fontSize = '18px';
      t5.textContent = '買い ' + (r.buys || 0) + ' 回・売り ' + (r.sells || 0) + ' 回 ／ 手数料合計 ' + FY(r.feePaid) + ' 円';

      var t6 = absChild(box, { left: 0, top: 290, w: 800, h: 22 });
      t6.style.textAlign = 'center'; t6.style.fontSize = '16px'; t6.style.color = C('dim');
      t6.textContent = 'Z または X でタイトルへ';

      els.result.hidden = false;
    } catch (e) { logErr(e); }
  };

  FD.UI.hideResult = function () {
    ensureInit();
    try { if (els.result) els.result.hidden = true; } catch (e) { logErr(e); }
  };

  // §6.6・§8.3: h = null | {kind:'row', index} | {kind:'dialogRow', index}
  FD.UI.markHint = function (h) {
    try {
      if (h && (h.kind === 'row' || h.kind === 'dialogRow') && typeof h.index === 'number') {
        hintSpec = { kind: h.kind, index: h.index };
      } else {
        hintSpec = null;
      }
    } catch (e) { logErr(e); hintSpec = null; }
  };

  // §6.1: ステージ座標(x,y) → 見えている重なりの上から順に判定。隠れている部品は飛ばす
  FD.UI.cellAt = function (x, y) {
    try {
      if (els.title && !els.title.hidden) {
        var ti, tr;
        for (ti = 0; ti < titleOptEls.length; ti++) {
          tr = stageRect(titleOptEls[ti]);
          if (inRect(x, y, tr)) return { type: 'button', id: 'title', index: ti };
        }
        return null; // タイトルは全画面を覆うので、行以外は何も無い
      }

      if (els.result && !els.result.hidden) return { type: 'button', id: 'result' };

      if (els.menu && !els.menu.hidden) {
        var mi, mr;
        for (mi = 0; mi < menuRowEls.length; mi++) {
          mr = stageRect(menuRowEls[mi]);
          if (inRect(x, y, mr)) return { type: 'button', id: 'menu', index: mi };
        }
        if (inRect(x, y, stageRect(els.menu))) return null;
      }

      if (els.dialog && !els.dialog.hidden) {
        if (dialogPctMinusEl && inRect(x, y, stageRect(dialogPctMinusEl))) return { type: 'button', id: 'pctMinus' };
        if (dialogPctPlusEl && inRect(x, y, stageRect(dialogPctPlusEl))) return { type: 'button', id: 'pctPlus' };
        var di, dr;
        for (di = 0; di < dialogRowEls.length; di++) {
          dr = stageRect(dialogRowEls[di]);
          if (inRect(x, y, dr)) return { type: 'button', id: 'dialog', index: di };
        }
        if (inRect(x, y, stageRect(els.dialog))) return null;
      }

      if (els.band && !els.band.hidden) {
        if (inRect(x, y, stageRect(els.band))) return { type: 'button', id: 'band' };
      }

      var ri, rr;
      for (ri = 0; ri < tableRowEls.length; ri++) {
        rr = stageRect(tableRowEls[ri]);
        if (inRect(x, y, rr)) return { type: 'button', id: 'row', index: ri };
      }

      if (els.nextBtn && !els.nextBtn.hidden) {
        if (inRect(x, y, stageRect(els.nextBtn))) return { type: 'button', id: 'row', index: 6 };
      }

      return null;
    } catch (e) { logErr(e); return null; }
  };

  // §9.5: id = 'title'|'band'|'dialog'|'menu'|'result' の hidden 属性の有無
  FD.UI.isHidden = function (id) {
    try {
      var el = els[id];
      if (!el) return true;
      return !!el.hidden;
    } catch (e) { logErr(e); return true; }
  };

})();
