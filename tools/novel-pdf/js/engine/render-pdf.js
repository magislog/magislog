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
        if (opts.tombo) drawTombo(pg, Wpt, Hpt, bleedPt, ink);
      }
      for (const g of page.glyphs) drawGlyph(pg, font, g, Hpt, ink, degrees, opts.fontId);
      if (page.nombre && opts.showNombre !== false) drawFurniture(pg, font, page.nombre, Hpt, ink);
      if (page.hashira) drawFurniture(pg, font, page.hashira, Hpt, ink);   // 柱（上部タイトル）
    }
    return await pdf.save();   // Uint8Array
  }

  // ノンブル/柱など横並びの号物を1つ描く（表裏で右/左そろえ・長い柱は…で詰める）
  function drawFurniture(pg, font, item, Hpt, ink) {
    let text = clampWidth(font, item.text, item.sizePt, item.maxWidthMm);
    const w = font.widthOfTextAtSize(text, item.sizePt);
    const x = (item.align === 'right') ? (U.mm2pt(item.x) - w) : U.mm2pt(item.x);
    const y = Hpt - U.mm2pt(item.y);
    pg.drawText(text, { x, y, size: item.sizePt, font, color: ink });
  }
  // 版面幅を超える柱は末尾を…に詰める（反対マージンへの突き抜け防止）
  function clampWidth(font, text, sizePt, maxWidthMm) {
    if (!maxWidthMm) return text;
    const maxPt = U.mm2pt(maxWidthMm);
    if (font.widthOfTextAtSize(text, sizePt) <= maxPt) return text;
    let t = text;
    while (t.length > 1 && font.widthOfTextAtSize(t + '…', sizePt) > maxPt) t = t.slice(0, -1);
    return t + '…';
  }

  function drawGlyph(pg, font, g, Hpt, ink, degrees, fontId) {
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
    if (g.rotate) {                                  // 括弧・長音など縦向きにする字
      const vg = RNK.vshape ? RNK.vshape.vert(fontId, g.ch) : null;
      if (vg) {                                       // 縦専用字形をアウトラインで（回転より正確な向き）
        const scale = size / vg.upm;
        const x0 = cellLeft + (cellPt - vg.advance * scale) / 2;
        const baseline = (cellTopY - cellPt) + DESC * size;   // 通常字と同じベースライン
        drawGlyphPath(pg, vg.commands, scale, x0, baseline, ink);
        return;
      }
      // 縦専用字形が無い字（— ダッシュ等）は従来どおり90°回転
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

  // 字形アウトラインをベクター塗りで描く（縦専用字形用）。
  // commands は fontkit のパス（フォント座標・y上向き）。PDFも y上向きなので反転不要。
  function drawGlyphPath(pg, commands, scale, x0, y0, ink) {
    const P = window.PDFLib;
    const ops = [P.pushGraphicsState(), P.setFillingColor(ink)];
    for (const c of commands) {
      const a = c.args;
      switch (c.command) {
        case 'moveTo': ops.push(P.moveTo(x0 + a[0] * scale, y0 + a[1] * scale)); break;
        case 'lineTo': ops.push(P.lineTo(x0 + a[0] * scale, y0 + a[1] * scale)); break;
        case 'quadraticCurveTo': ops.push(P.appendQuadraticCurve(x0 + a[0] * scale, y0 + a[1] * scale, x0 + a[2] * scale, y0 + a[3] * scale)); break;
        case 'bezierCurveTo': ops.push(P.appendBezierCurve(x0 + a[0] * scale, y0 + a[1] * scale, x0 + a[2] * scale, y0 + a[3] * scale, x0 + a[4] * scale, y0 + a[5] * scale)); break;
        case 'closePath': ops.push(P.closePath()); break;
      }
    }
    ops.push(P.fill(), P.popGraphicsState());
    pg.pushOperators(...ops);
  }

  // トンボ（角＝二重L、各辺中央＝十字）。塗り足し内に描く。
  function drawTombo(pg, W, H, b, ink) {
    const lw = 0.4;
    const L = b, R = W - b, B = b, T = H - b;
    const ln = (x1, y1, x2, y2) => pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: lw, color: ink });
    ln(0, T, L, T); ln(L, T, L, H); ln(0, H, L, H); ln(0, T, 0, H);          // 左上
    ln(R, T, W, T); ln(R, T, R, H); ln(R, H, W, H); ln(W, T, W, H);          // 右上
    ln(0, B, L, B); ln(L, 0, L, B); ln(0, 0, L, 0); ln(0, 0, 0, B);          // 左下
    ln(R, B, W, B); ln(R, 0, R, B); ln(R, 0, W, 0); ln(W, 0, W, B);          // 右下
    const cx = W / 2, cy = H / 2, t = b * 0.55;
    ln(cx, T, cx, H); ln(cx - t, (T + H) / 2, cx + t, (T + H) / 2);          // 上辺中央
    ln(cx, 0, cx, B); ln(cx - t, B / 2, cx + t, B / 2);                      // 下辺中央
    ln(0, cy, L, cy); ln(L / 2, cy - t, L / 2, cy + t);                      // 左辺中央
    ln(R, cy, W, cy); ln((R + W) / 2, cy - t, (R + W) / 2, cy + t);          // 右辺中央
  }

  RNK.pdf = { build };
})();
