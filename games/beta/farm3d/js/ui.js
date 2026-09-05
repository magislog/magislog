var FM = (typeof window !== 'undefined') ? (window.FM = window.FM || {}) : (global.FM = global.FM || {});

// FM.UI — 画面(DOM)の生成・描画・表示切替。SPEC.md §1・§2・§6 準拠。
//
// ★このファイルの前提(先行の index.html・css/style.css・js/config.js・js/game.js を実読して合わせた):
//   ・#map・#dayPanel・#tools・#items・#msg・#task・#keys・#band・#menu・#dialog・#banner・#title は
//     index.html に静的に置かれている。#menu の中の <h2>メニュー</h2> と #title の中身(.ttl/.sub/
//     .opt-tutorial/.opt-free/.help)も静的。ここでは作り直さない・触らない。
//   ・タイル・作物・#hint・#target・#player・にわとり・たまご(#eggs)は #map の子として、ここが
//     UI.init で 1 度だけ作る(§6.3)。位置(left/top)だけ動かし、class と data-* を差し替える。
//   ・css/style.css は既に実装済みで、色・形・position:absolute・width/height・z-index を
//     class/id/data-* キーで持っている(.tile.t-<type>・wet・full・.crop.k-<kind>.s-<stage>・
//     #player[data-dir]・.tile[data-r]・.tile.t-grass[data-deco]・.egg・.chicken など)。
//     ここは「どの class/data-* を付けるか」と「動く座標(left/top)」だけを扱い、色や形の実値は
//     再現しない(二重管理を避ける)。選択中の行は css 側で `.row.cursor` / `#tools > div.cursor`
//     が背景色と ▶ を描くので、ここは cursor class を付け替えるだけ。
//   ・#dialog は空(§7.5 の見出し・行・補足を毎回作り直す)。css が `#dialog h2` と `#dialog .foot`
//     を専用スタイルにしているので、見出しは <h2>、補足は class="foot" で作る(div.dialog-title
//     等の独自名にしない)。#menu は静的な <h2> を残したまま `.row` だけ増減させる。
//   ・#dayPanel の日付・所持金・体力ラベルの文字サイズは css 側に専用 class が無い旨を実読で確認
//     したので、ここでテキストの div/span を組み立てて文字サイズだけ直接指定する(§6.4)。
//     体力バーは css の `.stamina-bar`/`.stamina-fill`/`.stamina-fill.low` にそのまま乗せ、
//     ここは幅(px)と low class の有無だけを毎回計算する。
//   ・FM.CONFIG.COLOR は起動時に CSS 変数(--c-*)へ反映してもよい(SPEC §10.6)。style.css は既に
//     同じ値を直書きしているので実質は保険(config.js が将来変わっても追随できるように)。
//   ・世界(FM.World)の関数は render 時にだけ呼ぶ(読み込み時に呼ばない)。ui.js は世界を書き換えない。
// 全公開関数 try/catch 保護。SPEC §1 の 16 関数だけを実装し、新しい公開関数は足さない。
(function () {

  FM.UI = FM.UI || {};

  // ------------------------------------------------------------------
  // 内部状態(FM.UI の公開 API には出さない)
  // ------------------------------------------------------------------

  var initialized = false;
  var els = {};              // id → DOM 要素
  var tileEls = null;        // 300 個。添字 r*COLS+c(§6.3)
  var chickenEls = [];       // にわとりの div(§6.3)
  var hintPt = null;         // markHint が持つ {r,c} または null(§6.3・§8.3)
  var menuRowEls = [];       // showMenu が作った .row(render のハイライトと cellAt が使う)
  var dialogRowEls = [];     // showDialog が作った .row(同上)
  var bandTextEl = null;
  var bandNextEl = null;
  var bandPageEl = null;
  var titleOpt = { tutorial: null, free: null }; // index.html 既存の .opt-tutorial / .opt-free

  // §6.1: ステージの transform(scale/translate)。cellAt が画面上の実際の位置(getBoundingClientRect)
  // をステージ座標へ逆変換するのに使う(input.js のマウス処理と同じ式の逆)
  var lastScale = 1, lastOffsetX = 0, lastOffsetY = 0;

  // ------------------------------------------------------------------
  // 内部ヘルパー
  // ------------------------------------------------------------------

  function cfg() { return FM.CONFIG || {}; }

  function num(key, fallback) {
    var v = cfg()[key];
    return (typeof v === 'number') ? v : fallback;
  }

  function str(v) {
    return (v == null) ? '' : String(v);
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

  // 位置(left/top)だけを動かす。width/height/position は css 側(.tile・#player・.egg 等)が持つ
  function setPos(el, left, top) {
    if (!el) return;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  function clear(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  // showMenu(rows)/showDialog(title,rows,foot) は文字列配列で呼ばれる想定だが、
  // 念のためラベル付きオブジェクトも許す(null保護)
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
      try { FM.UI.init(); } catch (e) { logErr(e); }
    }
  }

  // camelCase → kebab-case(grassDot → grass-dot)。CONFIG.COLOR のキーを --c-<kebab> に写す
  function kebab(k) {
    return String(k).replace(/([A-Z])/g, '-$1').toLowerCase();
  }

  // §10.6: CONFIG.COLOR を CSS 変数へ反映する(style.css は既に同じ値を直書き済みなので実質は保険)
  function applyConfigColors() {
    try {
      var C = cfg().COLOR;
      if (!C || typeof document === 'undefined' || !document.documentElement) return;
      var key;
      for (key in C) {
        if (C.hasOwnProperty(key)) {
          document.documentElement.style.setProperty('--c-' + kebab(key), String(C[key]));
        }
      }
    } catch (e) {
      logErr(e);
    }
  }

  // §6.1: resize のたびに s とオフセットを計算して #stage へ transform をかける
  function applyStageScale() {
    try {
      if (typeof window === 'undefined' || !els.stage) return;
      var sw = num('STAGE_W', 1280), sh = num('STAGE_H', 720);
      var iw = window.innerWidth || sw;
      var ih = window.innerHeight || sh;
      var s = Math.min(iw / sw, ih / sh);
      if (!isFinite(s) || s <= 0) s = 1;
      var ox = (iw - sw * s) / 2;
      var oy = (ih - sh * s) / 2;
      els.stage.style.transform = 'translate(' + ox + 'px,' + oy + 'px) scale(' + s + ')';
      lastScale = s; lastOffsetX = ox; lastOffsetY = oy;
    } catch (e) {
      logErr(e);
    }
  }

  // 要素の実際の画面位置(getBoundingClientRect・transform 込み)をステージ座標へ逆変換する。
  // #menu/#dialog の行・#title の選択肢は通常フローで並ぶので、位置を自前計算せずここで実測する
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
  // 起動時に 1 度だけ作る土台(§6.3)
  // ------------------------------------------------------------------

  // #map の中身: タイル 300 個・#hint・#eggs・にわとり・#player・#target。位置は動かさない
  function buildMapFoundation() {
    if (!els.map) return;
    clear(els.map);
    tileEls = [];

    var COLS = num('COLS', 20), ROWS = num('ROWS', 15), TILE = num('TILE', 48);
    var mapLeft = num('MAP_LEFT', 0), mapTop = num('MAP_TOP', 0);
    var r, c, el, deco;

    for (r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        el = document.createElement('div');
        el.className = 'tile';
        el.setAttribute('data-r', String(r));
        el.setAttribute('data-c', String(c));
        deco = (r * 7 + c * 13) % 5; // grass だけが使う飾りの種類(§6.3)
        el.setAttribute('data-deco', String(deco));
        setPos(el, mapLeft + TILE * c, mapTop + TILE * r);
        els.map.appendChild(el);
        tileEls.push(el);
      }
    }

    // #hint(点線の枠。markHint で動く)
    els.hint = document.createElement('div');
    els.hint.id = 'hint';
    els.hint.hidden = true;
    els.map.appendChild(els.hint);

    // #eggs(0×0。中に div.egg を render が作り直す。位置サイズは css の #eggs が持つ)
    els.eggs = document.createElement('div');
    els.eggs.id = 'eggs';
    els.map.appendChild(els.eggs);

    // にわとり(CONFIG.CHICKENS の数だけ。無ければ 2 羽ぶん確保)
    chickenEls = [];
    var chCount = (cfg().CHICKENS && cfg().CHICKENS.length) ? cfg().CHICKENS.length : 2;
    var i, ce;
    for (i = 0; i < chCount; i++) {
      ce = document.createElement('div');
      ce.className = 'chicken';
      ce.hidden = true;
      els.map.appendChild(ce);
      chickenEls.push(ce);
    }

    // #player
    els.player = document.createElement('div');
    els.player.id = 'player';
    els.player.hidden = true;
    els.map.appendChild(els.player);

    // #target(黄色い枠。常時表示・タイトルでは hidden)
    els.target = document.createElement('div');
    els.target.id = 'target';
    els.target.hidden = true;
    els.map.appendChild(els.target);
  }

  // #band は index.html では空(§8.2 の案内文専用)。中身(本文・Z で次へ・ページ)を 1 度だけ作る
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
  // render() が使う描画ヘルパー(§6.5: 毎回作り直す)
  // ------------------------------------------------------------------

  // §6.3・§6.4: 300 タイルの class(t-<type>・wet・full)と中身(crop)を差し替える。位置は動かさない
  function renderTiles(world) {
    if (!tileEls) return;
    var COLS = num('COLS', 20);
    var i, r, c, t, type, cls, cropEl, binSum;

    for (i = 0; i < tileEls.length; i++) {
      r = Math.floor(i / COLS);
      c = i % COLS;
      t = (world && world.tiles && world.tiles[r]) ? world.tiles[r][c] : null;
      type = (t && t.type) ? t.type : 'grass'; // world が null なら全部 t-grass(§6.5)

      cls = 'tile t-' + type;
      if (t && type === 'soil' && t.watered) cls += ' wet';
      if (t && type === 'ship') {
        binSum = 0;
        if (world && world.bin) {
          binSum = (world.bin.turnip || 0) + (world.bin.potato || 0) + (world.bin.corn || 0) + (world.bin.egg || 0);
        }
        if (binSum > 0) cls += ' full';
      }
      tileEls[i].className = cls;

      clear(tileEls[i]);
      if (t && t.crop) {
        cropEl = document.createElement('div');
        cropEl.className = 'crop k-' + t.crop.kind + ' s-' + t.crop.stage;
        tileEls[i].appendChild(cropEl);
      }
    }
  }

  function renderPlayer(world) {
    if (!els.player) return;
    if (!world || !world.player) { els.player.hidden = true; return; }
    var TILE = num('TILE', 48), mapLeft = num('MAP_LEFT', 0), mapTop = num('MAP_TOP', 0);
    setPos(els.player, mapLeft + TILE * world.player.c, mapTop + TILE * world.player.r);
    els.player.setAttribute('data-dir', world.player.dir || 'down');
    els.player.hidden = false;
  }

  function renderChickens(world) {
    var TILE = num('TILE', 48), mapLeft = num('MAP_LEFT', 0), mapTop = num('MAP_TOP', 0);
    var list = (world && world.chickens) ? world.chickens : [];
    var i, ch;
    for (i = 0; i < chickenEls.length; i++) {
      ch = list[i];
      if (!ch) { chickenEls[i].hidden = true; continue; }
      setPos(chickenEls[i], mapLeft + TILE * ch.c, mapTop + TILE * ch.r);
      chickenEls[i].hidden = false;
    }
  }

  // §6.3: たまごは #eggs(0×0)の中に毎回作り直す。位置は left 48c+17, top 48r+15
  function renderEggs(world) {
    if (!els.eggs) return;
    clear(els.eggs);
    var TILE = num('TILE', 48), mapLeft = num('MAP_LEFT', 0), mapTop = num('MAP_TOP', 0);
    var list = (world && world.eggs) ? world.eggs : [];
    var i, eg, el;
    for (i = 0; i < list.length; i++) {
      eg = list[i];
      if (!eg) continue;
      el = document.createElement('div');
      el.className = 'egg';
      setPos(el, mapLeft + TILE * eg.c + 17, mapTop + TILE * eg.r + 15);
      els.eggs.appendChild(el);
    }
  }

  // §3.1・§6.3: Z の対象(黄色い枠)。phase が title なら隠す
  function renderTarget(world, phase) {
    if (!els.target) return;
    if (!world || phase === 'title') { els.target.hidden = true; return; }
    var t = null;
    try {
      if (FM.World && typeof FM.World.target === 'function') t = FM.World.target(world);
    } catch (e) {
      logErr(e);
    }
    if (!t) { els.target.hidden = true; return; }
    var TILE = num('TILE', 48), mapLeft = num('MAP_LEFT', 0), mapTop = num('MAP_TOP', 0);
    setPos(els.target, mapLeft + TILE * t.c, mapTop + TILE * t.r);
    els.target.hidden = false;
  }

  // §6.3・§8.3: markHint が覚えた {r,c} へ。null なら隠す
  function renderHint() {
    if (!els.hint) return;
    if (!hintPt) { els.hint.hidden = true; return; }
    var TILE = num('TILE', 48), mapLeft = num('MAP_LEFT', 0), mapTop = num('MAP_TOP', 0);
    setPos(els.hint, mapLeft + TILE * hintPt.c, mapTop + TILE * hintPt.r);
    els.hint.hidden = false;
  }

  // §6.2: #dayPanel。css に専用 class が無いので文字サイズはここで直接指定する(igo3d ui.js 踏襲)
  function renderDayPanel(world) {
    if (!els.dayPanel) return;
    clear(els.dayPanel);

    var STA_MAX = num('STAMINA_MAX', 100);
    var day = world ? world.day : (cfg().START ? cfg().START.day : 1);
    var money = world ? world.money : (cfg().START ? cfg().START.money : 0);
    var stamina = (world && typeof world.stamina === 'number') ? world.stamina : STA_MAX;

    var l1 = document.createElement('div');
    l1.style.fontSize = '24px';
    l1.style.fontWeight = 'bold';
    l1.textContent = day + ' 日目';
    els.dayPanel.appendChild(l1);

    var l2 = document.createElement('div');
    l2.style.fontSize = '18px';
    l2.textContent = '所持金 ' + money + ' G';
    els.dayPanel.appendChild(l2);

    // 体力バー: css の .stamina-bar/.stamina-fill/.stamina-fill.low に乗せる。幅と low だけ計算
    var pct = (STA_MAX > 0) ? Math.max(0, Math.min(1, stamina / STA_MAX)) : 0;
    var bar = document.createElement('div');
    bar.className = 'stamina-bar';
    var fill = document.createElement('div');
    fill.className = 'stamina-fill' + (stamina < 30 ? ' low' : '');
    fill.style.width = Math.round(260 * pct) + 'px';
    bar.appendChild(fill);
    els.dayPanel.appendChild(bar);

    // 体力ラベルは帯の右(§6.2)。css に専用位置が無いのでここで直接指定する
    var label = document.createElement('div');
    label.style.position = 'absolute';
    label.style.left = '276px';
    label.style.top = '60px';
    label.style.fontSize = '13px';
    label.textContent = '体力 ' + stamina + ' / ' + STA_MAX;
    els.dayPanel.appendChild(label);
  }

  // §6.2: #tools。4 行を毎回作り直す。選択中(player.tool)は cursor class(css が背景と ▶ を描く)
  function renderTools(world) {
    if (!els.tools) return;
    clear(els.tools);

    var TOOLS = cfg().TOOLS || [];
    var CROP_ORDER = cfg().CROP_ORDER || [];
    var CROPS = cfg().CROPS || {};
    var tool = (world && world.player) ? world.player.tool : -1;
    var seedKind = (world && world.player) ? world.player.seedKind : 0;
    var i, row, label, kind, cropInfo, cnt;

    for (i = 0; i < TOOLS.length; i++) {
      row = document.createElement('div');
      row.className = 'row' + (i === tool ? ' cursor' : '');
      row.setAttribute('data-index', String(i));

      label = (i + 1) + ' ' + str(TOOLS[i].name);
      if (i === 2) {
        kind = CROP_ORDER[seedKind];
        cropInfo = CROPS[kind] || {};
        cnt = (world && world.inv && world.inv.seeds) ? (world.inv.seeds[kind] || 0) : 0;
        label += '（' + str(cropInfo.name) + ' ×' + cnt + '）';
      }
      row.textContent = label;
      els.tools.appendChild(row);
    }
  }

  // §6.2: #items。持ち物(たね・作物・たまご・出荷箱)を毎回作り直す
  function renderItems(world) {
    if (!els.items) return;
    clear(els.items);

    var CROP_ORDER = cfg().CROP_ORDER || [];
    var CROPS = cfg().CROPS || {};
    var EGG_NAME = cfg().EGG_NAME || 'たまご';
    var inv = (world && world.inv) ? world.inv : { seeds: {}, produce: {} };
    var seeds = inv.seeds || {};
    var produce = inv.produce || {};
    var bin = (world && world.bin) ? world.bin : {};

    function addLine(txt) {
      var d = document.createElement('div');
      d.className = 'item-line';
      d.textContent = txt;
      els.items.appendChild(d);
    }

    var i, kind, seedsTxt = '', produceTxt = '', binN = 0, value = 0;

    for (i = 0; i < CROP_ORDER.length; i++) {
      kind = CROP_ORDER[i];
      seedsTxt += (i > 0 ? ' ／ ' : '') + str((CROPS[kind] || {}).name) + ' ' + (seeds[kind] || 0);
    }
    addLine('たね　' + seedsTxt);

    for (i = 0; i < CROP_ORDER.length; i++) {
      kind = CROP_ORDER[i];
      produceTxt += (i > 0 ? ' ／ ' : '') + str((CROPS[kind] || {}).name) + ' ' + (produce[kind] || 0);
    }
    addLine('作物　' + produceTxt);

    addLine(EGG_NAME + '　' + (produce.egg || 0));

    for (i = 0; i < CROP_ORDER.length; i++) {
      binN += bin[CROP_ORDER[i]] || 0;
    }
    binN += bin.egg || 0;
    try {
      if (FM.World && typeof FM.World.binValue === 'function' && world) value = FM.World.binValue(world);
    } catch (e) {
      logErr(e);
    }
    addLine('出荷箱　' + binN + ' 個（あす ' + value + ' G）');
  }

  // #menu の行のハイライトは css の .row.cursor が描く。ここは class を付け替えるだけ
  function renderMenuHighlight(state) {
    if (!menuRowEls || !menuRowEls.length) return;
    var idx = state.menuIndex || 0;
    var i;
    for (i = 0; i < menuRowEls.length; i++) {
      menuRowEls[i].className = (i === idx) ? 'row cursor' : 'row';
    }
  }

  // #dialog の行のハイライトも同様。state.dialog が無ければ全部非選択に戻す
  function renderDialogHighlight(state) {
    if (!dialogRowEls || !dialogRowEls.length) return;
    var idx = (state.dialog && typeof state.dialog.index === 'number') ? state.dialog.index : -1;
    var i;
    for (i = 0; i < dialogRowEls.length; i++) {
      dialogRowEls[i].className = (i === idx) ? 'row cursor' : 'row';
    }
  }

  // #title の ▶ は css の .opt.cursor::before が持つ。ここは class を付け替えるだけ
  function renderTitleHighlight(state) {
    if (!titleOpt.tutorial && !titleOpt.free) return;
    var idx = state.titleIndex || 0;
    if (titleOpt.tutorial) titleOpt.tutorial.className = 'opt opt-tutorial' + (idx === 0 ? ' cursor' : '');
    if (titleOpt.free) titleOpt.free.className = 'opt opt-free' + (idx === 1 ? ' cursor' : '');
  }

  // ------------------------------------------------------------------
  // FM.UI 公開 API(SPEC §1 の 16 関数のとおり)
  // ------------------------------------------------------------------

  // §6.1・§6.3: index.html 既存の要素を拾い、#map の中身・#band の中身・#title の参照を 1 度だけ作る
  FM.UI.init = function () {
    try {
      if (initialized) return;
      if (typeof document === 'undefined') return;
      initialized = true;

      els.stage = byId('stage');
      els.map = byId('map');
      els.dayPanel = byId('dayPanel');
      els.tools = byId('tools');
      els.items = byId('items');
      els.msg = byId('msg');
      els.task = byId('task');
      els.band = byId('band');
      els.menu = byId('menu');
      els.dialog = byId('dialog');
      els.banner = byId('banner');
      els.title = byId('title');

      // 保険: index.html に無ければ最低限を自作する(止まるより進む)
      if (!els.stage) els.stage = ensureEl('stage', 'div', document.body);
      if (!els.map) els.map = ensureEl('map', 'div', els.stage);
      if (!els.dayPanel) els.dayPanel = ensureEl('dayPanel', 'div', els.stage);
      if (!els.tools) els.tools = ensureEl('tools', 'div', els.stage);
      if (!els.items) els.items = ensureEl('items', 'div', els.stage);
      if (!els.msg) els.msg = ensureEl('msg', 'div', els.stage);
      if (!els.task) els.task = ensureEl('task', 'div', els.stage);
      if (!els.band) els.band = ensureEl('band', 'div', els.stage);
      if (!els.menu) els.menu = ensureEl('menu', 'div', els.stage);
      if (!els.dialog) els.dialog = ensureEl('dialog', 'div', els.stage);
      if (!els.banner) els.banner = ensureEl('banner', 'div', els.stage);
      if (!els.title) els.title = ensureEl('title', 'div', els.stage);

      applyConfigColors();
      buildMapFoundation();
      buildBandChildren();
      locateTitleOptions();

      if (els.band) els.band.hidden = true;
      if (els.menu) els.menu.hidden = true;
      if (els.dialog) els.dialog.hidden = true;
      if (els.banner) els.banner.hidden = true;

      applyStageScale();
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('resize', applyStageScale);
      }
    } catch (e) {
      logErr(e);
    }
  };

  // §6.5: タイル・人・にわとり・たまご・#target・#hint・3 パネル(dayPanel/tools/items)を
  // 毎回作り直す。#msg・#task はここでは触らない。#band/#menu/#dialog/#banner/#title の
  // 表示・非表示も触らない(show◯◯/hide◯◯ だけの役目)。ハイライト(cursor)だけは更新する
  FM.UI.render = function (state) {
    ensureInit();
    try {
      if (!state) return;
      var world = state.world || null;
      renderTiles(world);
      renderPlayer(world);
      renderChickens(world);
      renderEggs(world);
      renderTarget(world, state.phase);
      renderHint();
      renderDayPanel(world);
      renderTools(world);
      renderItems(world);
      renderMenuHighlight(state);
      renderDialogHighlight(state);
      renderTitleHighlight(state);
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2: #msg。自動では消えない
  FM.UI.message = function (text) {
    ensureInit();
    try {
      if (els.msg) els.msg.textContent = str(text);
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2・§8.3: #task。wait 中だけ文字があり、それ以外は空文字で呼ばれる
  FM.UI.task = function (text) {
    ensureInit();
    try {
      if (els.task) els.task.textContent = str(text);
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2・§8.2: 案内帯。表示するのは Tutorial.show() 経由のここだけ
  FM.UI.showBand = function (text, meta) {
    ensureInit();
    try {
      if (bandTextEl) bandTextEl.textContent = str(text);
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

  FM.UI.hideBand = function () {
    ensureInit();
    try {
      if (els.band) els.band.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2・§7.5: rows は文字列(またはラベル付きオブジェクト)の配列。<h2>メニュー</h2> は index.html のまま
  FM.UI.showMenu = function (rows) {
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
        row.setAttribute('data-index', String(i));
        row.textContent = itemLabel(list[i]);
        els.menu.appendChild(row);
        menuRowEls.push(row);
      }

      els.menu.hidden = false;
    } catch (e) {
      logErr(e);
    }
  };

  FM.UI.hideMenu = function () {
    ensureInit();
    try {
      if (els.menu) els.menu.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2・§7.5: 店・寝るのダイアログ。毎回中身を作り直す(見出しは css の `#dialog h2` に合わせ
  // <h2> で作る。補足は `#dialog .foot`)
  FM.UI.showDialog = function (title, rows, foot) {
    ensureInit();
    try {
      if (!els.dialog) return;
      clear(els.dialog);
      dialogRowEls = [];

      var h = document.createElement('h2');
      h.textContent = str(title);
      els.dialog.appendChild(h);

      var list = rows || [];
      var i, row;
      for (i = 0; i < list.length; i++) {
        row = document.createElement('div');
        row.className = 'row';
        row.setAttribute('data-index', String(i));
        row.textContent = itemLabel(list[i]);
        els.dialog.appendChild(row);
        dialogRowEls.push(row);
      }

      var f = document.createElement('div');
      f.className = 'foot';
      f.textContent = str(foot);
      els.dialog.appendChild(f);

      els.dialog.hidden = false;
    } catch (e) {
      logErr(e);
    }
  };

  FM.UI.hideDialog = function () {
    ensureInit();
    try {
      if (els.dialog) els.dialog.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2・§9.3・§8.6: 寝る演出・完了の帯。l3 が空文字/null なら 3 行目は作らない
  FM.UI.showBanner = function (l1, l2, l3) {
    ensureInit();
    try {
      if (!els.banner) return;
      clear(els.banner);

      var d1 = document.createElement('div');
      d1.className = 'line1';
      d1.textContent = str(l1);
      els.banner.appendChild(d1);

      var d2 = document.createElement('div');
      d2.className = 'line2';
      d2.textContent = str(l2);
      els.banner.appendChild(d2);

      var s3 = str(l3);
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

  FM.UI.hideBanner = function () {
    ensureInit();
    try {
      if (els.banner) els.banner.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.2: タイトル画面。中身(見出し・選択肢・footer)は index.html のまま。表示/非表示だけ
  FM.UI.showTitle = function () {
    ensureInit();
    try {
      if (els.title) els.title.hidden = false;
    } catch (e) {
      logErr(e);
    }
  };

  FM.UI.hideTitle = function () {
    ensureInit();
    try {
      if (els.title) els.title.hidden = true;
    } catch (e) {
      logErr(e);
    }
  };

  // §6.3・§8.3: pt は {r,c} または null(条件を満たす場所が無ければ印を出さない)
  FM.UI.markHint = function (pt) {
    try {
      hintPt = (pt && typeof pt.r === 'number' && typeof pt.c === 'number') ? { r: pt.r, c: pt.c } : null;
    } catch (e) {
      logErr(e);
      hintPt = null;
    }
  };

  // §6.1: ステージ座標(x,y) → #title の行 / #band / #menu の行 / #dialog の行 / #tools の行 /
  // マップのタイル / null。見えている重なりの上から順に見て、隠れている部品は飛ばす(§6.1)
  FM.UI.cellAt = function (x, y) {
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

      if (els.band && !els.band.hidden) {
        if (inRect(x, y, stageRect(els.band))) return { type: 'button', id: 'band' };
      }

      if (els.menu && !els.menu.hidden) {
        var j, mr;
        for (j = 0; j < menuRowEls.length; j++) {
          mr = stageRect(menuRowEls[j]);
          if (inRect(x, y, mr)) return { type: 'button', id: 'menu', index: j };
        }
        if (inRect(x, y, stageRect(els.menu))) return null; // メニュー内だが行の外
      }

      if (els.dialog && !els.dialog.hidden) {
        var k, dr;
        for (k = 0; k < dialogRowEls.length; k++) {
          dr = stageRect(dialogRowEls[k]);
          if (inRect(x, y, dr)) return { type: 'button', id: 'dialog', index: k };
        }
        if (inRect(x, y, stageRect(els.dialog))) return null; // ダイアログ内だが行の外
      }

      if (els.tools) {
        var toolRows = els.tools.querySelectorAll ? els.tools.querySelectorAll('.row') : [];
        var m, tr;
        for (m = 0; m < toolRows.length; m++) {
          tr = stageRect(toolRows[m]);
          if (inRect(x, y, tr)) return { type: 'button', id: 'tool', index: m };
        }
      }

      if (els.map) {
        var TILE = num('TILE', 48), COLS = num('COLS', 20), ROWS = num('ROWS', 15);
        var bor = stageRect(els.map);
        if (inRect(x, y, bor)) {
          var c = Math.floor((x - bor.left) / TILE);
          var r = Math.floor((y - bor.top) / TILE);
          if (r >= 0 && r < ROWS && c >= 0 && c < COLS) return { type: 'cell', r: r, c: c };
        }
      }

      return null;
    } catch (e) {
      logErr(e);
      return null;
    }
  };

})();
