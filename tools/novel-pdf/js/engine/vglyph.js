/* ============================================================
   vglyph.js  ―― 縦組みの字形処理（機械）
   ブラウザの writing-mode に頼らず、1文字ずつ「回転／位置ずらし」を
   自前で決める。これでCanvasプレビューとPDF出力を完全に一致させる。
     ・回転(rotate) … 長音符・ダッシュ・各種括弧など。90°回して縦向きに
     ・右上寄せ(offset) … 、。 の約物、小書き仮名
     ・それ以外 … 升目の中央にそのまま
   dx,dy は em(＝フォントサイズ)を1とした比率。y+ が下方向。
   ※数値はプレビューを実物サンプルと見比べて微調整する前提の初期値。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});

  // 90°回転させて縦向きにする文字
  const ROTATE = new Set([
    'ー', 'ｰ', '〜', '～', '~',
    '‐', '‑', '‒', '–', '—', '―', '−', '－', '─', '━', '│', '｜',
    '（', '）', '(', ')', '｛', '｝', '{', '}', '〔', '〕', '［', '］', '[', ']',
    '「', '」', '『', '』', '【', '】', '〈', '〉', '《', '》',
    '〖', '〗', '〘', '〙', '〚', '〛',
    '＝', '=', '≒', '≠', '→', '←', '↑', '↓', '⇒', '⇔',
    '‥', '…',
  ]);

  // 右上へ寄せる約物（句読点）
  const TOP_RIGHT = new Set(['、', '。', '，', '．', '､', '｡']);

  // 小書き仮名（少しだけ右上へ）
  const SMALL_KANA = new Set([
    'ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'っ', 'ゃ', 'ゅ', 'ょ', 'ゎ', 'ゕ', 'ゖ',
    'ァ', 'ィ', 'ゥ', 'ェ', 'ォ', 'ッ', 'ャ', 'ュ', 'ョ', 'ヮ', 'ヵ', 'ヶ',
  ]);

  // オフセット量（emに対する比率）。QAで詰める初期値。
  const OFF = {
    punctDx: 0.56, punctDy: -0.56,   // 、。を右斜め上へ・升の上の文字に近づける（利用者要望）
    kanaDx: 0.08, kanaDy: -0.10,     // 小書き仮名を少し右上へ
  };

  function classify(ch) {
    if (ROTATE.has(ch)) return { rotate: true, dx: 0, dy: 0 };
    if (TOP_RIGHT.has(ch)) return { rotate: false, dx: OFF.punctDx, dy: OFF.punctDy };
    if (SMALL_KANA.has(ch)) return { rotate: false, dx: OFF.kanaDx, dy: OFF.kanaDy };
    return { rotate: false, dx: 0, dy: 0 };
  }

  RNK.vglyph = { classify, ROTATE, TOP_RIGHT, SMALL_KANA, OFF };
})();
