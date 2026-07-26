/* ============================================================
   units.js  ―― 単位変換（機械の共通土台）
   mm / pt / px を相互変換するだけの純粋関数群。
   組版エンジン・プレビュー・PDF出力すべてがこの1本を共有する。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});

  const PT_PER_MM = 72 / 25.4;   // 1mm = 2.8346pt
  const MM_PER_PT = 25.4 / 72;   // 1pt = 0.3528mm

  RNK.units = {
    PT_PER_MM,
    MM_PER_PT,
    mm2pt: (mm) => mm * PT_PER_MM,
    pt2mm: (pt) => pt * MM_PER_PT,
    mm2px: (mm, dpi) => (mm / 25.4) * dpi,
    px2mm: (px, dpi) => (px / dpi) * 25.4,
    pt2px: (pt, dpi) => (pt / 72) * dpi,
    round2: (x) => Math.round(x * 100) / 100,
  };
})();
