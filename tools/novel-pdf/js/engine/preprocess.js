/* ============================================================
   preprocess.js  ―― 入力テキストの正規化（機械）
   「貼り付けをそのまま組む」思想なので加工は最小限。
   ・改行コード統一 / NFC正規化
   ・！？→⁉ などの合字化（オプション。既定ON）
   段落インデントや全角スペースは「入力のまま」尊重する（勝手に足さない）。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});

  // 感嘆符・疑問符の並びを1文字の合字へ（縦組みで綺麗に見える）
  // 長い順に処理するため2文字→…の順で。全角・半角どちらの入力も拾う。
  const BANG_MAP = [
    ['！？', '⁉'], ['？！', '⁈'], ['！！', '‼'], ['？？', '⁇'],
    ['!?', '⁉'], ['?!', '⁈'], ['!!', '‼'], ['??', '⁇'],
  ];

  function combineBangs(s) {
    for (const [a, b] of BANG_MAP) s = s.split(a).join(b);
    return s;
  }

  function normalize(text, opts) {
    opts = opts || {};
    let s = String(text == null ? '' : text);
    s = s.normalize('NFC');
    s = s.replace(/\r\n?/g, '\n');            // CRLF/CR → LF
    s = s.replace(/\t/g, '　');           // タブ→全角空白（升目を崩さない）
    if (opts.autoIndent) {
      // 段落の頭を1字下げ（既に字下げ済み・空行・[章:]等のマーカー行は触らない）
      s = s.split('\n').map((line) => {
        if (!line || /^[\s　]/.test(line)) return line;
        if (/^\[.+\]\s*$/.test(line)) return line;
        return '　' + line;
      }).join('\n');
    }
    if (opts.combineBangs !== false) s = combineBangs(s);
    return s;
  }

  RNK.preprocess = { normalize, combineBangs };
})();
