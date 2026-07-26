/* ============================================================
   presets.js  ―― 判型プリセット（交換パーツ）
   ★これは「交換パーツ」。機械(engine/)には一切ロジックを持たせず、
     判型ごとの初期値だけをここに置く。増やす時はこの表に足すだけ。
   ★a5_2col / bunko の数値は、マスター提示の実機スクショの実数値そのもの。
     （A5二段=26字×21行×2段/9pt/行間6、文庫=42字×16行/8pt/行間5.5）
   ★全項目はUIで編集可能な「初期値」。プリセット選択で下記が流し込まれる。

   単位: 寸法=mm, 文字サイズ/行間=pt
   columns … 段組み(1 or 2)。2なら上下2段。段間は天地余白を守って自動算出。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});

  RNK.presets = {
    a5_2col: {
      label: 'A5 二段組み',
      trimW: 148, trimH: 210,
      columns: 2,
      charsPerLine: 26,   // 1行字数(縦の字数)
      linesPerCol: 21,    // 1段の行数
      fontSizePt: 9.0,
      leadingPt: 6.0,     // 行間(行の隙間)
      mTop: 15, mBottom: 19, mInner: 21, mOuter: 15,  // 天/地/ノド/小口
      bleed: 3,
    },
    bunko: {
      label: '文庫 (A6)',
      trimW: 105, trimH: 148,
      columns: 1,
      charsPerLine: 42,
      linesPerCol: 16,
      fontSizePt: 8.0,
      leadingPt: 5.5,
      mTop: 13, mBottom: 14, mInner: 15, mOuter: 12,
      bleed: 3,
    },
    a5_1col: {
      label: 'A5 一段組み',
      trimW: 148, trimH: 210,
      columns: 1,
      charsPerLine: 40,
      linesPerCol: 17,
      fontSizePt: 10.0,
      leadingPt: 8.0,
      mTop: 20, mBottom: 20, mInner: 22, mOuter: 18,
      bleed: 3,
    },
    shinsho: {
      label: '新書',
      trimW: 103, trimH: 182,
      columns: 1,
      charsPerLine: 40,
      linesPerCol: 16,
      fontSizePt: 8.5,
      leadingPt: 6.0,
      mTop: 16, mBottom: 16, mInner: 18, mOuter: 14,
      bleed: 3,
    },
    b6: {
      label: 'B6',
      trimW: 128, trimH: 182,
      columns: 1,
      charsPerLine: 40,
      linesPerCol: 17,
      fontSizePt: 9.0,
      leadingPt: 7.0,
      mTop: 18, mBottom: 18, mInner: 20, mOuter: 16,
      bleed: 3,
    },
  };

  // プリセット選択の並び順（UIのドロップダウン用）
  RNK.presetOrder = ['a5_2col', 'bunko', 'a5_1col', 'shinsho', 'b6'];
})();
