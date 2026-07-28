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
    renderUserPresetSelect();
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
    $('savePreset').addEventListener('click', saveUserPreset);
    $('delPreset').addEventListener('click', deleteUserPreset);
    $('userPreset').addEventListener('change', applyUserPreset);
    $('paperThick').addEventListener('input', () => { updateSpine(); saveState(); });
    NUM_FIELDS.forEach((id) => $(id).addEventListener('input', onChange));
    $('nombreStart').addEventListener('input', onChange);
    ['columns', 'font', 'optBangs', 'optNombre', 'optTrim', 'optRuby', 'optToc', 'optIndent', 'optHang', 'optHashira', 'optImpose', 'optTombo'].forEach((id) => $(id).addEventListener('change', onChange));
    $('optSpread').addEventListener('change', drawCurrent);
    $('body').addEventListener('input', debounce(onChange, 180));
    ['metaTitle', 'metaAuthor', 'metaDate', 'metaCircle', 'metaPrinter', 'metaContact'].forEach((id) => $(id).addEventListener('input', debounce(onChange, 300)));
    $('optOkupu').addEventListener('change', () => { $('okupuFields').hidden = !$('optOkupu').checked; onChange(); });
    $('bleedGroup').querySelectorAll('.seg').forEach((b) => b.addEventListener('click', () => { setBleed(parseInt(b.dataset.bleed, 10)); onChange(); }));
    $('prevPage').onclick = () => { gotoPage(state.page - ($('optSpread').checked ? 2 : 1)); };
    $('nextPage').onclick = () => { gotoPage(state.page + ($('optSpread').checked ? 2 : 1)); };
    $('btnExport').onclick = exportPDF;
    $('font').addEventListener('change', (e) => { state.fontId = e.target.value; initFont(); });
    $('btnSaveProj').addEventListener('click', saveProject);
    $('btnOpenProj').addEventListener('click', () => $('fileProj').click());
    $('fileProj').addEventListener('change', (e) => { if (e.target.files[0]) loadProjectFile(e.target.files[0]); e.target.value = ''; });
    const bodyEl = $('body');
    bodyEl.addEventListener('dragover', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.items || []).some((it) => it.kind === 'file')) e.preventDefault(); });
    bodyEl.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f && /\.txt$/i.test(f.name)) { e.preventDefault(); const r = new FileReader(); r.onload = () => { bodyEl.value = r.result; onChange(); }; r.readAsText(f, 'utf-8'); }
    });
    window.addEventListener('resize', debounce(drawCurrent, 120));
  }

  /* ---------- プリセット／塗り足し ---------- */
  function applySettings(p) {
    if (p.trimW) state.trimW = p.trimW;
    if (p.trimH) state.trimH = p.trimH;
    if (p.columns != null) $('columns').value = p.columns;
    if (p.charsPerLine != null) $('charsPerLine').value = p.charsPerLine;
    if (p.linesPerCol != null) $('linesPerCol').value = p.linesPerCol;
    if (p.fontSizePt != null) $('fontSizePt').value = p.fontSizePt;
    if (p.leadingPt != null) $('leadingPt').value = p.leadingPt;
    if (p.mTop != null) $('mTop').value = p.mTop;
    if (p.mBottom != null) $('mBottom').value = p.mBottom;
    if (p.mInner != null) $('mInner').value = p.mInner;
    if (p.mOuter != null) $('mOuter').value = p.mOuter;
    if (p.fontId && RNK.fonts.FONTS[p.fontId] && p.fontId !== state.fontId) { state.fontId = p.fontId; $('font').value = p.fontId; initFont(); }
    setBleed(p.bleed != null ? p.bleed : state.bleed);
  }

  function fillFromPreset(id) {
    const p = RNK.presets[id];
    if (!p) return;
    $('preset').value = id;
    applySettings(p);
  }

  // 現在のUIの設定を1つのオブジェクトに写す（マイプリセット保存用）
  function captureSettings() {
    const num = (id) => parseFloat($(id).value);
    return {
      trimW: state.trimW, trimH: state.trimH,
      columns: parseInt($('columns').value, 10),
      charsPerLine: num('charsPerLine'), linesPerCol: num('linesPerCol'),
      fontSizePt: num('fontSizePt'), leadingPt: num('leadingPt'),
      mTop: num('mTop'), mBottom: num('mBottom'), mInner: num('mInner'), mOuter: num('mOuter'),
      bleed: state.bleed, fontId: state.fontId,
    };
  }

  /* ---------- マイプリセット（ユーザーが名前を付けて保存） ---------- */
  const USERPRESET_KEY = 'rnk_userpresets_v1';
  function loadUserPresets() { try { return JSON.parse(localStorage.getItem(USERPRESET_KEY)) || {}; } catch (e) { return {}; } }
  function saveUserPresetsMap(map) { try { localStorage.setItem(USERPRESET_KEY, JSON.stringify(map)); } catch (e) {} }
  function renderUserPresetSelect() {
    const sel = $('userPreset');
    const cur = sel.value;
    const map = loadUserPresets();
    sel.innerHTML = '<option value="">（呼び出す）</option>';
    Object.keys(map).forEach((name) => {
      const o = document.createElement('option'); o.value = name; o.textContent = name; sel.appendChild(o);
    });
    if (map[cur]) sel.value = cur;
  }
  function saveUserPreset() {
    const name = $('userPresetName').value.trim();
    if (!name) { alert('プリセット名を入れてください。'); return; }
    const map = loadUserPresets();
    map[name] = captureSettings();
    saveUserPresetsMap(map);
    renderUserPresetSelect();
    $('userPreset').value = name;
    $('userPresetName').value = '';
  }
  function deleteUserPreset() {
    const name = $('userPreset').value;
    if (!name) { alert('削除するプリセットを選んでください。'); return; }
    if (!confirm('「' + name + '」を削除しますか？')) return;
    const map = loadUserPresets(); delete map[name]; saveUserPresetsMap(map);
    renderUserPresetSelect();
  }
  function applyUserPreset() {
    const name = $('userPreset').value;
    if (!name) return;
    const map = loadUserPresets();
    if (map[name]) { applySettings(map[name]); onChange(); }
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
        autoIndent: $('optIndent').checked,
        hangPunct: $('optHang').checked,
        hashira: $('optHashira').checked,
        hashiraText: $('metaTitle').value.trim(),
        nombreStart: Math.max(1, Math.round(n('nombreStart') || 1)),
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

  function withOffset(s, off) {
    return Object.assign({}, s, { options: Object.assign({}, s.options, { pageOffset: off }) });
  }

  // 目次(前付け)＋本文＋奥付(後付け)をまとめて組む。プレビューもPDFもこれを使う。
  function buildDoc() {
    const s = readSettings();
    const text = $('body').value;
    const useToc = $('optToc').checked;
    const nombreStart = s.options.nombreStart || 1;

    let doc = RNK.typeset.layout(text, withOffset(s, 0));   // 1回目：章位置を得る
    let tocPages = [];

    if (useToc && doc.chapters.length > 0) {
      const slots = s.columns * s.linesPerCol;
      const tocPageCount = Math.max(1, Math.ceil((doc.chapters.length + 1) / slots));
      doc = RNK.typeset.layout(text, withOffset(s, tocPageCount));  // 2回目：目次ぶんずらして本組み
      const chaptersWithPage = doc.chapters.map((c) => ({ title: c.title, page: tocPageCount + c.pageIdx + nombreStart }));
      tocPages = RNK.toc.build(chaptersWithPage, s, s.bleed, nombreStart, s.options.showNombre);
      doc.pages = tocPages.concat(doc.pages);              // 目次を先頭へ
    }

    if ($('optOkupu').checked) {
      doc.pages.push(RNK.okuduke.build(getMeta(), s, s.bleed));  // 奥付を末尾へ
    }

    // 面付け：総ページを白紙で目標(偶数/4の倍数)に合わせる
    const imp = $('optImpose').value;
    if (imp === 'even' || imp === 'four') {
      const mult = imp === 'four' ? 4 : 2;
      while (doc.pages.length % mult !== 0) doc.pages.push({ index: 0, pageNo: null, glyphs: [], nombre: null, blank: true });
    }

    doc.pages.forEach((p, i) => { p.index = i; });          // 通しindex振り直し
    doc.meta.totalPages = doc.pages.length;
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

  function fitScale(nPages) {
    const area = $('previewArea');
    if (!state.doc) return 3.4;
    nPages = nPages || 1;
    const availH = area.clientHeight - 34;
    const availW = area.clientWidth - 34 - (nPages > 1 ? 12 : 0);
    const byH = availH / state.doc.pageH;
    const byW = availW / (state.doc.pageW * nPages);
    return Math.max(1.0, Math.min(byH, byW));   // mmあたりpx
  }

  function drawCurrent() {
    if (!state.doc) return;
    const fam = state.fontReady ? RNK.fonts.FONTS[state.fontId].family : 'serif';
    const base = { fontFamily: fam, fontId: state.fontReady ? state.fontId : null, showTrim: $('optTrim').checked, showNombre: $('optNombre').checked };
    const cvL = $('pageCanvasL'), cvR = $('pageCanvas');
    const spread = $('optSpread').checked && state.doc.pages.length > 1;
    if (spread) {
      const ppm = fitScale(2);
      const P = state.page + 1;                       // 1-based
      const leftNo = (P % 2 === 1) ? P : P + 1;       // 右綴じ: 奇数=左ページ
      const rightNo = leftNo - 1;
      cvL.style.display = '';
      drawPageOrBlank(cvL, leftNo - 1, base, ppm);    // 左（大きい番号）
      drawPageOrBlank(cvR, rightNo - 1, base, ppm);   // 右（小さい番号）
      $('pageInfo').textContent = `${rightNo >= 1 ? rightNo : '–'}–${leftNo} / ${state.doc.pages.length}`;
    } else {
      cvL.style.display = 'none';
      RNK.canvas.drawPage(cvR, state.doc, state.page, Object.assign({ pxPerMm: fitScale(1) }, base));
      $('pageInfo').textContent = `${state.page + 1} / ${state.doc.pages.length}`;
    }
  }

  function drawPageOrBlank(cv, idx, base, ppm) {
    if (idx >= 0 && idx < state.doc.pages.length) {
      RNK.canvas.drawPage(cv, state.doc, idx, Object.assign({ pxPerMm: ppm }, base));
    } else {
      const blank = { pageW: state.doc.pageW, pageH: state.doc.pageH, bleed: state.doc.bleed, trimW: state.doc.trimW, trimH: state.doc.trimH, pages: [{ glyphs: [], nombre: null }] };
      RNK.canvas.drawPage(cv, blank, 0, Object.assign({ pxPerMm: ppm }, base));
    }
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
    if (state.fontReady) {
      const missing = checkCoverage(state.fontId, state.doc);
      if (missing.length) html += `　<span class="warn">⚠ このフォントに無い字：${escapeHtml(missing.slice(0, 20).join(' '))}${missing.length > 20 ? ' …' : ''}（印刷で□になります）</span>`;
    }
    $('stats').innerHTML = html;
    updateSpine();
  }

  // フォントに無い字（豆腐になる字）を洗い出す。fontkitで判定・fontごとにキャッシュ。
  const _fkCache = {};
  function checkCoverage(fontId, doc) {
    try {
      const bytes = RNK.fonts.bytes(fontId);
      if (!window.fontkit || !bytes) return [];
      let fk = _fkCache[fontId];
      if (!fk) { fk = window.fontkit.create(new Uint8Array(bytes)); _fkCache[fontId] = fk; }
      const has = (cp) => (fk.hasGlyphForCodePoint ? fk.hasGlyphForCodePoint(cp) : (fk.glyphForCodePoint(cp).id !== 0));
      const missing = new Set();
      for (const cp of RNK.subset.collectCodepoints(doc)) {
        if (cp === 0x20 || cp === 0x3000) continue;
        if (!has(cp)) missing.add(String.fromCodePoint(cp));
      }
      return Array.from(missing);
    } catch (e) { return []; }
  }
  function escapeHtml(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  // 背幅 ＝ 総ページ ÷ 2 × 用紙の厚さ(mm/枚)
  function updateSpine() {
    if (!state.doc) return;
    const pages = state.doc.pages.length;
    const t = parseFloat($('paperThick').value) || 0;
    const spine = (pages / 2) * t;
    $('spineNote').textContent = `総${pages}ページ → 背幅 約${spine.toFixed(1)} mm（表紙の紙厚は別途）`;
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
        tombo: $('optTombo').checked,
        fontId: state.fontId,   // 縦専用字形(vert)をアウトライン描画するのに使う
        subset: false,          // 既にサブセット済みなので pdf-lib 側では丸ごと埋める
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

  /* ---------- プロジェクトの保存 / 読込（ファイル） ---------- */
  function collectOpts() {
    return { bangs: $('optBangs').checked, nombre: $('optNombre').checked, trim: $('optTrim').checked, ruby: $('optRuby').checked, toc: $('optToc').checked, indent: $('optIndent').checked, hang: $('optHang').checked, hashira: $('optHashira').checked, tombo: $('optTombo').checked, impose: $('optImpose').value, okupu: $('optOkupu').checked, nombreStart: parseInt($('nombreStart').value, 10) || 1 };
  }
  function saveProject() {
    const data = { _type: 'rakunovel-kai-project', v: 1, preset: $('preset').value, settings: captureSettings(), body: $('body').value, opts: collectOpts(), meta: getMeta(), paperThick: $('paperThick').value };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = (getMeta().title || 'project') + '.rnk.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1500);
  }
  function loadProjectFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (d.settings) applySettings(d.settings);
        if (d.preset) $('preset').value = d.preset;
        if (d.body != null) $('body').value = d.body;
        if (d.paperThick != null) $('paperThick').value = d.paperThick;
        const o = d.opts || {};
        $('optBangs').checked = o.bangs !== false; $('optNombre').checked = o.nombre !== false; $('optTrim').checked = o.trim !== false;
        $('optRuby').checked = o.ruby !== false; $('optToc').checked = !!o.toc; $('optIndent').checked = !!o.indent;
        $('optHang').checked = o.hang !== false; $('optHashira').checked = !!o.hashira; $('optTombo').checked = !!o.tombo; $('optImpose').value = o.impose || 'none';
        $('optOkupu').checked = !!o.okupu; $('okupuFields').hidden = !o.okupu;
        if (o.nombreStart != null) $('nombreStart').value = o.nombreStart;
        const m = d.meta || {};
        $('metaTitle').value = m.title || ''; $('metaAuthor').value = m.author || ''; $('metaDate').value = m.date || '';
        $('metaCircle').value = m.circle || ''; $('metaPrinter').value = m.printer || ''; $('metaContact').value = m.contact || '';
        onChange();
      } catch (e) { alert('プロジェクトファイルを読めませんでした: ' + e.message); }
    };
    r.readAsText(file, 'utf-8');
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
      trimW: state.trimW, trimH: state.trimH, bleed: state.bleed, fontId: state.fontId, paperThick: $('paperThick').value,
      nums: {}, body: $('body').value,
      opts: Object.assign(collectOpts(), { spread: $('optSpread').checked }),
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
    if (data.paperThick != null) $('paperThick').value = data.paperThick;
    if (data.opts) {
      const o = data.opts;
      $('optBangs').checked = o.bangs !== false; $('optNombre').checked = o.nombre !== false; $('optTrim').checked = o.trim !== false;
      $('optRuby').checked = o.ruby !== false; $('optToc').checked = !!o.toc; $('optIndent').checked = !!o.indent;
      $('optHang').checked = o.hang !== false; $('optHashira').checked = !!o.hashira; $('optTombo').checked = !!o.tombo; $('optImpose').value = o.impose || 'none';
      $('optSpread').checked = !!o.spread; $('optOkupu').checked = !!o.okupu; $('okupuFields').hidden = !o.okupu;
      if (o.nombreStart != null) $('nombreStart').value = o.nombreStart;
    }
    if (data.meta) { $('metaTitle').value = data.meta.title || ''; $('metaAuthor').value = data.meta.author || ''; $('metaDate').value = data.meta.date || ''; $('metaCircle').value = data.meta.circle || ''; $('metaPrinter').value = data.meta.printer || ''; $('metaContact').value = data.meta.contact || ''; }
    $('body').value = (data.body != null && data.body !== '') ? data.body : DEFAULT_TEXT;
    return true;
  }

  /* ---------- utils ---------- */
  function debounce(fn, ms) { let t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  document.addEventListener('DOMContentLoaded', init);
})();
