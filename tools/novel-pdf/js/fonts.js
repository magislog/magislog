/* ============================================================
   fonts.js  ―― フォント登録（交換パーツ）
   ★これも交換パーツ。フォントを増やす時はここの表に足すだけ。
   1つのTTFを「Canvas用(FontFace)」と「PDF用(ArrayBuffer)」の両方に使う。
   源暎こぶり明朝(GenEiKoburiMin6-R.ttf) は SIL OFL 1.1 でPDF埋め込み許諾済み。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});

  const FONTS = {
    genei: {
      family: 'GenEiKoburiMin',
      label: '源暎こぶり明朝 v6',
      url: 'fonts/GenEiKoburiMin6-R.ttf',
    },
    // 例）別フォントを足す時はここに1行:
    // shippori: { family:'ShipporiMincho', label:'しっぽり明朝', url:'fonts/ShipporiMincho-Regular.ttf' },
  };

  const state = { bytes: {}, ready: {} };

  async function load(id) {
    const f = FONTS[id];
    if (!f) throw new Error('未知のフォント: ' + id);
    if (state.ready[id]) return f;

    const res = await fetch(f.url);
    if (!res.ok) throw new Error('フォント取得失敗: ' + f.url + ' (HTTP ' + res.status + ')');
    const buf = await res.arrayBuffer();
    state.bytes[id] = buf;                       // PDF埋め込み用に保持

    // Canvas用にFontFace登録（bufは複製を渡して元を守る）
    const face = new FontFace(f.family, buf.slice(0));
    await face.load();
    document.fonts.add(face);

    state.ready[id] = true;
    return f;
  }

  function bytes(id) { return state.bytes[id]; }
  function isReady(id) { return !!state.ready[id]; }

  RNK.fonts = { FONTS, load, bytes, isReady, state };
})();
