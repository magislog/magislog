/* ============================================================
   app.js  ―― UIの配線（この1本だけがDOMを触る）
   設定を読む → typeset で組む → Canvasに描く → 1クリックでPDF。
   自動保存(localStorage)・プリセット流し込み・ステッパー生成も。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = window.RNK;
  const U = RNK.units;
  const $ = (id) => document.getElementById(id);
  const LS_KEY = 'rnk_state_v2';

  // 初期サンプル本文（起動即プレビュー用。実サンプルPDFと同じ文面）
  const DEFAULT_TEXT =
    '　朝の光はカーテンの隙間から細く差し込み、部屋の中に静かな帯を描いていた。目を覚ました私はしばらく天井を見つめ、昨日まで考えていたことを思い出そうとしたが、頭の中にはぼんやりとした輪郭しか残っていなかった。時計を見ると、まだ予定までには十分な時間がある。慌てて起きる理由もなく、ゆっくりと身体を起こして窓を開けた。夏の風は思っていたよりも涼しく、遠くから聞こえる鳥の声が一日の始まりを知らせているようだった。\n' +
    '　机の上には読みかけの本と使いかけのノート、それから昨夜飲み忘れた紅茶がそのまま残っている。ページをめくりかけたまま伏せられた本を見ると、続きを読もうと思っていたことを思い出した。しかし、不思議と今日は文字を追う気分ではない。代わりにノートを開き、思いつくままに言葉を書き留めてみることにした。意味のある文章にならなくても構わない。ただ頭の中を整理するためだけの時間は、思っている以上に大切なのだと最近になってようやく気づいた。\n' +
    '　しばらくペンを走らせていると、最初はまとまりのなかった言葉たちが少しずつ繋がり、一つの考えとして形になっていく。何か特別な答えが見つかったわけではない。それでも、自分が何を考え、何に迷っているのかが少しだけ見えた気がした。窓の外では風に揺れる木々が柔らかな音を立て、部屋の中には静かな時間だけが流れている。こんな何気ない朝が、あとから振り返れば案外大切な思い出になるのかもしれない。私は新しいページを開き、もう一度ゆっくりとペンを動かし始めた。';

  const NUM_FIELDS = ['charsPerLine', 'linesPerCol', 'fontSizePt', 'leadingPt', 'mTop', 'mBottom', 'mInner', 'mOuter'];

  const state = { trimW: 148, trimH: 210, bleed: 3, page: 0, doc: null, fontId: 'genei', fontReady: false };

  /* ---------- 初期化 ---------- */
  function init() {
    buildPresetOptions();
    buildFontOptions();
    buildSteppers();
    bindEvents();
    if (!loadState()) fillFromPreset('a5_2col');   // 初回はA5二段
    initFont();
    RNK.subset.init().catch(() => {});             // harfbuzz wasmを先読み
    render();
    // レイアウト確定後にプレビュー倍率を測り直す（初回は面積が0のことがある）
    if (window.ResizeObserver) new ResizeObserver(debounce(drawCurrent, 80)).observe($('previewArea'));
    requestAnimationFrame(() => requestAnimationFrame(drawCurrent));
  }

  function buildPresetOptions() {
    const sel = $('preset');
    RNK.presetOrder.forEach((id) => {
      const o = document.createElement('option');
      o.value = id; o.textContent = RNK.presets[id].label;
      sel.appendChild(o);
    });
  }
  function buildFontOptions() {
    const sel = $('font');
    Object.keys(RNK.fonts.FONTS).forEach((id) => {
      const o = document.createElement('option');
      o.value = id; o.textContent = RNK.fonts.FONTS[id].label;
      sel.appendChild(o);
    });
  }

  // 数値入力に −/＋ ステッパーを付ける
  function buildSteppers() {
    NUM_FIELDS.forEach((id) => {
      const input = $(id);
      const wrap = document.createElement('div');
      wrap.className = 'stepper';
      input.parentNode.insertBefore(wrap, input);
      const minus = mkBtn('−'), plus = mkBtn('＋');
      wrap.appendChild(minus); wrap.appendChild(input); wrap.appendChild(plus);
      const step = parseFloat(input.step) || 1;
      minus.onclick = () => { input.value = clampNum(input, (parseFloat(input.value) || 0) - step); onChange(); };
      plus.onclick = () => { input.value = clampNum(input, (parseFloat(input.value) || 0) + step); onChange(); };
    });
  }
  function mkBtn(t) { const b = document.createElement('button'); b.type = 'button'; b.textContent = t; return b; }
  function clampNum(input, v) {
    const min = input.min !== '' ? parseFloat(input.min) : -Infinity;
    const max = input.max !== '' ? parseFloat(input.max) : Infinity;
    v = Math.min(max, Math.max(min, v));
    return Math.round(v * 100) / 100;
  }

  function bindEvents() {
    $('preset').addEventListener('change', (e) => { fillFromPreset(e.target.value); onChange(); });
    NUM_FIELDS.forEach((id) => $(id).addEventListener('input', onChange));
    ['columns', 'font', 'optBangs', 'optNombre', 'optTrim', 'optRuby'].forEach((id) => $(id).addEventListener('change', onChange));
    $('body').addEventListener('input', debounce(onChange, 180));
    ['metaTitle', 'metaAuthor', 'metaDate', 'metaCircle', 'metaPrinter', 'metaContact'].forEach((id) => $(id).addEventListener('input', debounce(onChange, 300)));
    $('optOkupu').addEventListener('change', () => { $('okupuFields').hidden = !$('optOkupu').checked; onChange(); });
    $('bleedGroup').querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => { setBleed(parseInt(b.dataset.bleed, 10)); onChange(); }));
    $('prevPage').onclick = () => { gotoPage(state.page - 1); };
    $('nextPage').onclick = () => { gotoPage(state.page + 1); };
    $('btnExport').onclick = exportPDF;
    $('font').addEventListener('change', (e) => { state.fontId = e.target.value; initFont(); });
    window.addEventListener('resize', debounce(drawCurrent, 120));
  }

  /* ---------- プリセット／塗り足し ---------- */
  function fillFromPreset(id) {
    const p = RNK.presets[id];
    if (!p) return;
    $('preset').value = id;
    state.trimW = p.trimW; state.trimH = p.trimH;
    $('columns').value = p.columns;
    $('charsPerLine').value = p.charsPerLine;
    $('linesPerCol').value = p.linesPerCol;
    $('fontSizePt').value = p.fontSizePt;
    $('leadingPt').value = p.leadingPt;
    $('mTop').value = p.mTop; $('mBottom').value = p.mBottom;
    $('mInner').value = p.mInner; $('mOuter').value = p.mOuter;
    setBleed(p.bleed);
  }
  function setBleed(mm) {
    state.bleed = mm;
    $('bleedGroup').querySelectorAll('.seg').forEach((b) => b.classList.toggle('active', parseInt(b.dataset.bleed, 10) === mm));
    updateFinishNote();
  }
  function updateFinishNote() {
    const w = state.trimW + state.bleed * 2, h = state.trimH + state.bleed * 2;
    $('finishNote').textContent = state.bleed > 0
      ? `仕上がり ${state.trimW}×${state.trimH}mm ＋塗り足し${state.bleed}mm → PDF ${w}×${h}mm`
      : `塗り足しなし → PDF ${state.trimW}×${state.trimH}mm（仕上がりそのまま）`;
  }

  /* ---------- 設定読み取り ---------- */
  function readSettings() {
    const n = (id) => parseFloat($(id).value) || 0;
    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    return {
      trimW: state.trimW, trimH: state.trimH,
      columns: parseInt($('columns').value, 10),
      charsPerLine: Math.max(1, Math.round(n('charsPerLine'))),
      linesPerCol: Math.max(1, Math.round(n('linesPerCol'))),
      fontSizePt: clamp(n('fontSizePt') || 9, 1, 300),   // 直接入力での0/負を弾く
      leadingPt: clamp(n('leadingPt'), 0, 500),
      mTop: clamp(n('mTop'), 0, 500), mBottom: clamp(n('mBottom'), 0, 500),
      mInner: clamp(n('mInner'), 0, 500), mOuter: clamp(n('mOuter'), 0, 500),
      bleed: state.bleed,
      options: {
        combineBangs: $('optBangs').checked,
        showNombre: $('optNombre').checked,
        ruby: $('optRuby').checked,
        startParity: 'odd',
      },
    };
  }

  /* ---------- 組版＋描画 ---------- */
  function onChange() { render(); saveState(); }

  function getMeta() {
    return {
      title: $('metaTitle').value.trim(),
      author: $('metaAuthor').value.trim(),
      date: $('metaDate').value.trim(),
      circle: $('metaCircle').value.trim(),
      printer: $('metaPrinter').value.trim(),
      contact: $('metaContact').value.trim(),
    };
  }

  // 本文＋（任意で）奥付ページをまとめて組む。プレビューもPDFもこれを使う。
  function buildDoc() {
    const s = readSettings();
    const doc = RNK.typeset.layout($('body').value, s);
    if ($('optOkupu').checked) {
      const pg = RNK.okuduke.build(getMeta(), s, s.bleed);
      pg.index = doc.pages.length;
      pg.pageNo = doc.pages.length + 1;
      doc.pages.push(pg);
      doc.meta.totalPages = doc.pages.length;
    }
    return { doc, s };
  }

  function render() {
    const { doc } = buildDoc();
    state.doc = doc;
    if (state.page >= doc.pages.length) state.page = doc.pages.length - 1;
    if (state.page < 0) state.page = 0;
    drawCurrent();
    updateStats();
  }

  function fitScale() {
    const area = $('previewArea');
    if (!state.doc) return 3.4;
    const availH = area.clientHeight - 34;
    const availW = area.clientWidth - 34;
    const byH = availH / state.doc.pageH;
    const byW = availW / state.doc.pageW;
    return Math.max(1.2, Math.min(byH, byW));   // mmあたりpx
  }

  function drawCurrent() {
    if (!state.doc) return;
    const fam = state.fontReady ? RNK.fonts.FONTS[state.fontId].family : 'serif';
    RNK.canvas.drawPage($('pageCanvas'), state.doc, state.page, {
      fontFamily: fam,
      pxPerMm: fitScale(),
      showTrim: $('optTrim').checked,
      showNombre: $('optNombre').checked,
    });
    $('pageInfo').textContent = `${state.page + 1} / ${state.doc.pages.length}`;
  }

  function gotoPage(p) {
    if (!state.doc) return;
    state.page = Math.min(state.doc.pages.length - 1, Math.max(0, p));
    drawCurrent();
  }

  function updateStats() {
    const raw = $('body').value;
    const chars = Array.from(raw.replace(/\s/g, '')).length;
    const m = state.doc.meta;
    const P = state.doc.pages.length;
    let html = `本文 ${chars.toLocaleString()}字　/　${P}ページ`;
    if (m.oversetV) html += `　<span class="warn">⚠ 天地に収まりません（文字サイズ/字数/余白を調整）</span>`;
    if (m.oversetH) html += `　<span class="warn">⚠ 行数が多すぎて左右に収まりません（行数/行間/余白を調整）</span>`;
    if (P % 4 !== 0) {
      const next4 = Math.ceil(P / 4) * 4;
      html += `　<span class="hint">※製本の目安：中綴じは4の倍数(${next4}P)／無線綴じは偶数が無難</span>`;
    }
    $('stats').innerHTML = html;
  }

  /* ---------- PDF書き出し ---------- */
  async function exportPDF() {
    const btn = $('btnExport');
    if (!state.fontReady) { alert('フォント（源暎こぶり明朝）が未導入のため、入稿PDFを書き出せません。\n\n入手先: https://okoneya.jp/font/ （源暎こぶり明朝 v6・SIL OFL）\nGenEiKoburiMin6-R.ttf を fonts/ フォルダに置いて再読み込みしてください。'); return; }
    const old = btn.textContent; btn.disabled = true; btn.textContent = '書き出し中…';
    try {
      const { doc, s } = buildDoc();
      const fullBytes = RNK.fonts.bytes(state.fontId);

      // HarfBuzzで「使う字だけ」にサブセット→pdf-libへ丸ごと埋め込み（PDFが軽くなる）
      // 失敗した場合はフルフォント埋め込みへフォールバック（PDFは大きくなるが確実）
      let embedBytes = fullBytes;
      try {
        const cps = RNK.subset.collectCodepoints(doc);
        embedBytes = await RNK.subset.run(fullBytes, cps);
      } catch (e) {
        console.warn('サブセット失敗→フルフォント埋め込みにフォールバック:', e);
        embedBytes = fullBytes;
      }

      const meta = {
        title: $('metaTitle').value.trim(),
        author: $('metaAuthor').value.trim(),
        showNombre: s.options.showNombre,
        subset: false,   // 既にサブセット済みなので pdf-lib 側では丸ごと埋める
      };
      const pdfBytes = await RNK.pdf.build(doc, embedBytes, meta);
      const name = (meta.title || 'novel') + '_' + RNK.presets[$('preset').value].label.replace(/\s/g, '') + '.pdf';
      downloadBytes(pdfBytes, name);
    } catch (e) {
      console.error(e);
      alert('PDF書き出しでエラー: ' + e.message);
    } finally {
      btn.disabled = false; btn.textContent = old;
    }
  }
  function downloadBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }

  /* ---------- フォント読込 ---------- */
  async function initFont() {
    const st = $('fontStatus');
    st.className = 'font-status';
    st.textContent = 'フォント読込中…';
    try {
      await RNK.fonts.load(state.fontId);
      state.fontReady = true;
      st.classList.add('ok');
      st.textContent = '✓ ' + RNK.fonts.FONTS[state.fontId].label;
      $('btnExport').disabled = false;
    } catch (e) {
      state.fontReady = false;
      st.classList.add('warn');
      st.textContent = '⚠ フォント未導入（プレビューは代替明朝）';
      console.warn(e);
    }
    drawCurrent();
  }

  /* ---------- 自動保存 ---------- */
  function saveState() {
    const data = {
      preset: $('preset').value, columns: $('columns').value,
      trimW: state.trimW, trimH: state.trimH, bleed: state.bleed, fontId: state.fontId,
      nums: {}, body: $('body').value,
      opts: { bangs: $('optBangs').checked, nombre: $('optNombre').checked, trim: $('optTrim').checked, ruby: $('optRuby').checked, okupu: $('optOkupu').checked },
      meta: { title: $('metaTitle').value, author: $('metaAuthor').value, date: $('metaDate').value, circle: $('metaCircle').value, printer: $('metaPrinter').value, contact: $('metaContact').value },
    };
    NUM_FIELDS.forEach((id) => data.nums[id] = $(id).value);
    try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch (e) {}
  }
  function loadState() {
    let data; try { data = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) {}
    if (!data) { $('body').value = DEFAULT_TEXT; return false; }
    $('preset').value = data.preset || 'a5_2col';
    $('columns').value = data.columns || '2';
    state.trimW = data.trimW || 148; state.trimH = data.trimH || 210;
    state.fontId = data.fontId || 'genei'; $('font').value = state.fontId;
    NUM_FIELDS.forEach((id) => { if (data.nums && data.nums[id] != null) $(id).value = data.nums[id]; });
    setBleed(data.bleed != null ? data.bleed : 3);
    if (data.opts) { $('optBangs').checked = data.opts.bangs; $('optNombre').checked = data.opts.nombre; $('optTrim').checked = data.opts.trim; $('optRuby').checked = data.opts.ruby !== false; $('optOkupu').checked = data.opts.okupu; $('okupuFields').hidden = !data.opts.okupu; }
    if (data.meta) { $('metaTitle').value = data.meta.title || ''; $('metaAuthor').value = data.meta.author || ''; $('metaDate').value = data.meta.date || ''; $('metaCircle').value = data.meta.circle || ''; $('metaPrinter').value = data.meta.printer || ''; $('metaContact').value = data.meta.contact || ''; }
    $('body').value = (data.body != null && data.body !== '') ? data.body : DEFAULT_TEXT;
    return true;
  }

  /* ---------- utils ---------- */
  function debounce(fn, ms) { let t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  document.addEventListener('DOMContentLoaded', init);
})();
