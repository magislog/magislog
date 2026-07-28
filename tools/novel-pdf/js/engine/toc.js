/* ============================================================
   toc.js  ―― 目次ページ生成（機械 / 本文エンジンと独立）
   章一覧 [{title, page}] から目次ページを組む。
   各章＝1列：タイトルを上、ページ番号を下、間を「・」の点線で埋める。
   本文と同じ座標モデルに乗るので、プレビューもPDFも同じ経路で描ける。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});
  const U = RNK.units;

  // chapters: [{title, page}]  page＝最終通し番号(数値)
  // startPageNo: 目次1ページ目の通し番号（1想定）
  function build(chapters, s, bleed, startPageNo, showNombre, binding) {
    bleed = bleed || 0;
    startPageNo = startPageNo || 1;
    const cellMm = U.pt2mm(s.fontSizePt);
    const pitchMm = U.pt2mm(s.fontSizePt + s.leadingPt);
    const N = s.charsPerLine, L = s.linesPerCol, C = s.columns;
    const blockW = (L - 1) * pitchMm + cellMm;
    const tierH = N * cellMm;
    const availV = s.trimH - s.mTop - s.mBottom;
    const gap = C === 2 ? (availV - tierH * 2) : 0;
    const tierTop = (t) => s.mTop + t * (tierH + gap);
    const slots = C * L;

    // 1章を升目列(長さN目安)へ：タイトル上・ページ番号下・間は「・」で埋める
    const entryCells = (ch) => {
      const titleCells = RNK.typeset.paragraphToCells(String(ch.title || ''), { n: 0 }, false);
      const pageCells = RNK.typeset.toCells(String(ch.page));
      const maxTitle = Math.max(1, N - pageCells.length - 1);   // 最低1マスは点
      const t = titleCells.slice(0, maxTitle);
      const dots = Math.max(1, N - t.length - pageCells.length);
      const cells = t.slice();
      for (let k = 0; k < dots; k++) cells.push({ ch: '・' });
      for (const pc of pageCells) cells.push(pc);
      return cells;
    };

    // 列リスト：先頭に「目次」見出し列、続いて章列
    const cols = [{ cells: [{ ch: '　', blank: true }].concat(RNK.typeset.toCells('目次')) }];
    for (const ch of chapters) cols.push({ cells: entryCells(ch) });

    const pages = [];
    let ci = 0, pno = startPageNo;
    while (ci < cols.length) {
      const isOdd = (pno % 2 === 1);
      const isLeftPage = (binding === 'left') ? !isOdd : isOdd;
      const rightEdge = isLeftPage ? (s.mOuter + blockW) : (s.trimW - s.mOuter);
      const glyphs = [];
      for (let slot = 0; slot < slots && ci < cols.length; slot++, ci++) {
        const col = cols[ci];
        const tier = Math.floor(slot / L);
        const iInTier = slot % L;
        const colRight = rightEdge - iInTier * pitchMm;
        const cellLeftX = colRight - cellMm;
        const top = tierTop(tier);
        col.cells.forEach((cell, j) => {
          if (!cell || cell.blank) return;
          const cls = RNK.vglyph.classify(cell.ch);
          glyphs.push({
            ch: cell.ch, tcy: cell.tcy || null,
            x: bleed + cellLeftX, y: bleed + top + j * cellMm,
            cell: cellMm, sizePt: s.fontSizePt,
            rotate: cls.rotate, dx: cls.dx * cellMm, dy: cls.dy * cellMm, hanging: false,
          });
        });
      }
      const nombre = showNombre ? RNK.typeset.makeNombre(pno, isLeftPage, s, bleed) : null;
      pages.push({ index: -1, pageNo: pno, glyphs, nombre, isToc: true });
      pno++;
    }
    return pages;
  }

  RNK.toc = { build };
})();
