/* ============================================================
   fonts.js  ―― フォント登録（交換パーツ）
   ★これも交換パーツ。フォントを増やす時はここの表に足すだけ。
   1つのTTFを「Canvas用(FontFace)」と「PDF用(ArrayBuffer)」の両方に使う。
   源暎こぶり明朝(GenEiKoburiMin6-R.ttf) は SIL OFL 1.1 でPDF埋め込み許諾済み。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});

  // ★フォントを足す時はここに1行＋ttfを fonts/ に置くだけ（エンジンは無改修）。
  //   すべて SIL OFL 1.1（PDF埋め込み・商用同人OK）。選んだ時だけ読み込む。
  const FONTS = {
    genei:    { family: 'GenEiKoburiMin',  label: '源暎こぶり明朝',            url: 'fonts/GenEiKoburiMin6-R.ttf' },
    shippori: { family: 'ShipporiMincho',  label: 'しっぽり明朝',              url: 'fonts/ShipporiMincho-jp.ttf' },
    chikugo:  { family: 'GenEiChikugoMin', label: '源暎ちくご明朝',            url: 'fonts/GenEiChikugoMin3-R.ttf' },
    antique:  { family: 'GenEiAntique',    label: '源暎アンチック（漫画風）',  url: 'fonts/GenEiAntiqueNv6-M.ttf' },
    mgothic:  { family: 'GenEiMGothic',    label: '源暎エムゴ（ゴシック）',    url: 'fonts/GenEiMGothic2-Regular.ttf' },
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
