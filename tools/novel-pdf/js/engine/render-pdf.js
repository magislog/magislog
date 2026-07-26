/* ============================================================
   render-pdf.js  ―― 入稿PDF書き出し（機械）
   typeset の PageDoc を pdf-lib で本物のベクターPDFにする。
   フォントは源暎こぶり明朝をサブセット埋め込み（OFLで許諾済み）。
   1文字ずつ座標指定で描くので、プレビュー(Canvas)と完全一致する。
   依存: window.PDFLib(UMD), window.fontkit(UMD)
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});
  const U = RNK.units;

  // em内訳の目安（源暎明朝＝Source Han系, unitsPerEm=1000, ascent≈880/descent≈120）
  const ASC = 0.88, DESC = 0.12;
  // 縦組み回転は視覚的に時計回り（Canvasの ROTATE_CW=true と一致）→ pdf-libでは -90°
  const ROT_DEG = -90;

  async function build(doc, fontBytes, opts) {
    opts = opts || {};
    if (!window.PDFLib) throw new Error('pdf-lib 未ロード');
    if (!window.fontkit) throw new Error('fontkit 未ロード');
    const { PDFDocument, rgb, cmyk, degrees } = window.PDFLib;

    const pdf = await PDFDocument.create();
    pdf.registerFontkit(window.fontkit);
    const font = await pdf.embedFont(fontBytes, { subset: opts.subset !== false });

    pdf.setProducer('RakuNovel改 縦組み入稿PDFメーカー');
    pdf.setCreator('RakuNovel改');
    if (opts.title) pdf.setTitle(opts.title);
    if (opts.author) pdf.setAuthor(opts.author);

    const ink = cmyk(0, 0, 0, 1);   // 墨はK100（オフセットのリッチブラック化・裏移りを避ける）
    const Wpt = U.mm2pt(doc.pageW), Hpt = U.mm2pt(doc.pageH);
    const bleedPt = U.mm2pt(doc.bleed);
    const trimWpt = U.mm2pt(doc.trimW), trimHpt = U.mm2pt(doc.trimH);

    for (const page of doc.pages) {
      const pg = pdf.addPage([Wpt, Hpt]);
      if (doc.bleed > 0) {
        pg.setBleedBox(0, 0, Wpt, Hpt);                     // 塗り足し込みの全面
        pg.setTrimBox(bleedPt, bleedPt, trimWpt, trimHpt);  // 仕上がり矩形（RIPのトンボ基準）
      }
      for (const g of page.glyphs) drawGlyph(pg, font, g, Hpt, ink, degrees);
      if (page.nombre && opts.showNombre !== false) {
        const n = page.nombre;
        const w = font.widthOfTextAtSize(n.text, n.sizePt);
        const x = (n.align === 'right') ? (U.mm2pt(n.x) - w) : U.mm2pt(n.x);
        const y = Hpt - U.mm2pt(n.y);
        pg.drawText(n.text, { x, y, size: n.sizePt, font, color: ink });
      }
    }
    return await pdf.save();   // Uint8Array
  }

  function drawGlyph(pg, font, g, Hpt, ink, degrees) {
    const size = g.sizePt;
    const cellPt = U.mm2pt(g.cell);
    const cellLeft = U.mm2pt(g.x);
    const cellTopY = Hpt - U.mm2pt(g.y);            // PDF座標(下原点)での上端
    const cx = cellLeft + cellPt / 2;
    const cy = cellTopY - cellPt / 2;

    if (g.tcy) {                                     // 縦中横（2桁数字を1マスに正立で横並び）
      let s2 = size * 0.88;                           // ほぼ全高。半角2桁でおよそ1em幅に収まる
      let ws = g.tcy.map((d) => font.widthOfTextAtSize(d, s2));
      let total = ws.reduce((a, b) => a + b, 0);
      if (total > cellPt * 0.94) {                    // 万一はみ出す時だけ縮める
        s2 *= (cellPt * 0.94) / total;
        ws = g.tcy.map((d) => font.widthOfTextAtSize(d, s2));
        total = ws.reduce((a, b) => a + b, 0);
      }
      let x = cx - total / 2;
      const y = cy - 0.34 * s2;                       // 升目の縦中央へ
      for (let k = 0; k < g.tcy.length; k++) {
        pg.drawText(g.tcy[k], { x, y, size: s2, font, color: ink });
        x += ws[k];
      }
      return;
    }
    if (g.rotate) {                                  // 回転（括弧・長音など）
      // origin = center - R(-90)*(0.5size, 0.38size) = (cx-0.38size, cy+0.5size)
      const x = cx - 0.38 * size;
      const y = cy + 0.5 * size;
      pg.drawText(g.ch, { x, y, size, font, color: ink, rotate: degrees(ROT_DEG) });
      return;
    }
    // 通常（+ 約物/小書き仮名の右上寄せ）
    const w = font.widthOfTextAtSize(g.ch, size);
    const x = cellLeft + (cellPt - w) / 2 + U.mm2pt(g.dx);
    const baseline = (cellTopY - cellPt) + DESC * size;   // em下端 + descent
    const y = baseline - U.mm2pt(g.dy);                   // dy(上=負) → 上へ
    pg.drawText(g.ch, { x, y, size, font, color: ink });
  }

  RNK.pdf = { build };
})();
