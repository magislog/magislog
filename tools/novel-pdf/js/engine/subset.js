/* ============================================================
   subset.js  ―― フォントのサブセット化（機械 / harfbuzz wasm）
   pdf-lib同梱fontkitのサブセットはCJKを取りこぼすため、
   HarfBuzz(hb-subset.wasm) で「使う字だけ」の正しいTTFを先に作り、
   それを pdf-lib に丸ごと埋め込む(subset:false)。→ 数十KBの入稿PDFになる。
   実装は subset-font(npm) の生wasm呼び出しをブラウザ向けに移植したもの。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});

  let _exports = null;
  let _loading = null;

  async function init(wasmUrl) {
    if (_exports) return _exports;
    if (!_loading) {
      _loading = (async () => {
        const res = await fetch(wasmUrl || 'js/lib/hb-subset.wasm');
        if (!res.ok) throw new Error('hb-subset.wasm 取得失敗: ' + res.status);
        const bytes = await res.arrayBuffer();
        const { instance } = await WebAssembly.instantiate(bytes);
        _exports = instance.exports;
        return _exports;
      })();
    }
    return _loading;
  }

  // codepoints: number[] / Set<number> / string いずれか可
  async function run(fontBytes, codepoints, wasmUrl) {
    const hb = await init(wasmUrl);
    const heap = () => new Uint8Array(hb.memory.buffer); // mallocで拡張し得るので都度取得

    const font = fontBytes instanceof Uint8Array ? fontBytes : new Uint8Array(fontBytes);
    const ptr = hb.malloc(font.byteLength);
    heap().set(font, ptr);

    const blob = hb.hb_blob_create(ptr, font.byteLength, 2 /*WRITABLE*/, 0, 0);
    const face = hb.hb_face_create(blob, 0);
    hb.hb_blob_destroy(blob);

    const input = hb.hb_subset_input_create_or_fail();
    if (input === 0) { hb.hb_face_destroy(face); hb.free(ptr); throw new Error('hb_subset_input_create_or_fail 失敗'); }

    // レイアウト機能は全保持（--font-features=* 相当）
    const lf = hb.hb_subset_input_set(input, 6 /*LAYOUT_FEATURE_TAG*/);
    hb.hb_set_clear(lf);
    hb.hb_set_invert(lf);

    // 使うコードポイントを登録
    const uni = hb.hb_subset_input_unicode_set(input);
    const cps = normalizeCps(codepoints);
    for (const cp of cps) hb.hb_set_add(uni, cp);

    let subset = 0;
    try {
      subset = hb.hb_subset_or_fail(face, input);
    } finally {
      hb.hb_subset_input_destroy(input);
    }
    if (subset === 0) { hb.hb_face_destroy(face); hb.free(ptr); throw new Error('hb_subset_or_fail 失敗（フォント破損の可能性）'); }

    const result = hb.hb_face_reference_blob(subset);
    const offset = hb.hb_blob_get_data(result, 0);
    const len = hb.hb_blob_get_length(result);
    let out;
    if (len === 0) {
      out = null;
    } else {
      out = heap().slice(offset, offset + len); // ヒープからコピーして取り出す
    }

    hb.hb_blob_destroy(result);
    hb.hb_face_destroy(subset);
    hb.hb_face_destroy(face);
    hb.free(ptr);

    if (!out) throw new Error('サブセット結果が空（フォント破損の可能性）');
    return out;
  }

  function normalizeCps(x) {
    const set = new Set();
    if (typeof x === 'string') { for (const ch of x) set.add(ch.codePointAt(0)); }
    else if (x instanceof Set || Array.isArray(x)) {
      for (const v of x) set.add(typeof v === 'string' ? v.codePointAt(0) : v);
    }
    // 予備でASCII数字(ノンブル)を確実に含める
    for (let c = 0x30; c <= 0x39; c++) set.add(c);
    return set;
  }

  // PageDocから実際に使う文字コードポイント集合を集める
  function collectCodepoints(doc) {
    const set = new Set();
    for (const pg of doc.pages) {
      for (const g of pg.glyphs) {
        if (g.tcy) { set.add(g.tcy[0].codePointAt(0)); set.add(g.tcy[1].codePointAt(0)); }
        else if (g.ch) set.add(g.ch.codePointAt(0));
      }
      if (pg.nombre) for (const c of pg.nombre.text) set.add(c.codePointAt(0));
    }
    return set;
  }

  RNK.subset = { init, run, collectCodepoints };
})();
