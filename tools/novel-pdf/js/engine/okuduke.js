/* ============================================================
   okuduke.js  ―― 奥付ページ生成（機械 / 本文エンジンとは独立）
   同人誌に事実上必須の奥付（タイトル・発行日・著者・発行者・印刷所・連絡先）を
   最終ページとして1枚組む。本文と同じ座標モデル(PageDoc.pages[])に乗るので
   プレビューもPDFも本文と同じ経路で描ける（＝サブセットにも自動で乗る）。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});

  // meta: {title, author, date, circle, printer, contact}
  function build(meta, s, bleed) {
    bleed = bleed || 0;
    const U = RNK.units;
    const cellMm = U.pt2mm(s.fontSizePt);
    const pitchMm = U.pt2mm(s.fontSizePt + s.leadingPt);

    // 行（右→左）。空欄はスキップ。
    const lines = [];
    if (meta.title) { lines.push('『' + meta.title + '』'); lines.push(''); } // 表題＋空け1行
    if (meta.date) lines.push(meta.date + '　発行');
    if (meta.author) lines.push('著者　' + meta.author);
    if (meta.circle) lines.push('発行　' + meta.circle);
    if (meta.printer) lines.push('印刷　' + meta.printer);
    if (meta.contact) lines.push(meta.contact);
    // 何も無ければ最低限プレースホルダ（空の奥付ページを出さない判断は呼び出し側）
    if (lines.filter((l) => l).length === 0) lines.push('奥付');

    // 各行をセル化（縦中横などは本文と同じtokenizerで揃える）
    const cellLines = lines.map((l) => (l ? RNK.typeset.toCells(l) : []));
    const maxLen = Math.max(1, ...cellLines.map((c) => c.length));

    // 下寄せブロック（地余白の少し上で終わるように上端を決める）
    const bottomAnchor = s.trimH - s.mBottom;
    const topY = Math.max(s.mTop, bottomAnchor - maxLen * cellMm);
    // 右端は小口(外)側へ。奥付は最終ページ＝配置は自由なので右下ブロックにする。
    const rightEdge = s.trimW - s.mOuter;

    const glyphs = [];
    for (let i = 0; i < cellLines.length; i++) {
      const cells = cellLines[i];
      const colRight = rightEdge - i * pitchMm;
      const cellLeftX = colRight - cellMm;
      for (let j = 0; j < cells.length; j++) {
        const cell = cells[j];
        if (!cell || cell.blank) continue;
        const cls = RNK.vglyph.classify(cell.ch);
        glyphs.push({
          ch: cell.ch,
          tcy: cell.tcy || null,
          x: bleed + cellLeftX,
          y: bleed + topY + j * cellMm,
          cell: cellMm,
          sizePt: s.fontSizePt,
          rotate: cls.rotate,
          dx: cls.dx * cellMm,
          dy: cls.dy * cellMm,
          hanging: false,
        });
      }
    }
    return { index: -1, pageNo: null, glyphs, nombre: null, isOkuduke: true };
  }

  RNK.okuduke = { build };
})();
