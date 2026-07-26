/* ============================================================
   render-canvas.js  ―― プレビュー描画（機械）
   typeset の PageDoc を Canvas に描く。PDF出力と同じ配置ロジックなので
   「プレビュー＝入稿PDF」になる。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});
  const U = RNK.units;

  // 縦組み回転の向き（時計回り=true）。PDFと必ず揃える。
  const ROTATE_CW = true;

  function drawPage(canvas, doc, pageIdx, opts) {
    opts = opts || {};
    const fam = opts.fontFamily || 'serif';
    const ppm = opts.pxPerMm || 3.4;              // 画面mmあたりピクセル
    const dpr = opts.dpr || (window.devicePixelRatio || 1);
    const page = doc.pages[pageIdx];
    if (!page) return null;

    const Wpx = doc.pageW * ppm, Hpx = doc.pageH * ppm;
    canvas.width = Math.round(Wpx * dpr);
    canvas.height = Math.round(Hpx * dpr);
    canvas.style.width = Wpx + 'px';
    canvas.style.height = Hpx + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 紙
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, Wpx, Hpx);

    // 塗り足しガイド（仕上がり線）
    if (opts.showTrim && doc.bleed > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(214,60,60,0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(doc.bleed * ppm, doc.bleed * ppm, doc.trimW * ppm, doc.trimH * ppm);
      ctx.restore();
    }

    ctx.fillStyle = opts.ink || '#111111';
    for (const g of page.glyphs) drawGlyph(ctx, g, ppm, fam);

    // ノンブル
    if (page.nombre && opts.showNombre !== false) {
      const n = page.nombre;
      const px = U.pt2mm(n.sizePt) * ppm;
      ctx.font = px + 'px "' + fam + '"';
      ctx.textAlign = n.align;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(n.text, n.x * ppm, n.y * ppm);
    }
    return { Wpx, Hpx };
  }

  function drawGlyph(ctx, g, ppm, fam) {
    const cell = g.cell * ppm;
    const gpx = U.pt2mm(g.sizePt) * ppm;
    const cx = g.x * ppm + cell / 2;
    const cy = g.y * ppm + cell / 2;
    ctx.font = gpx + 'px "' + fam + '"';

    if (g.tcy) {                                   // 縦中横（2桁数字を1マスに正立で横並び）
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = (gpx * 0.88) + 'px "' + fam + '"';  // PDF側と同じ0.88em
      const str = g.tcy.join('');
      const w = ctx.measureText(str).width || cell;
      const sx = Math.min(1, (cell * 0.94) / w);     // 万一はみ出す時だけ横圧縮
      ctx.translate(cx, cy);
      ctx.scale(sx, 1);
      ctx.fillText(str, 0, 0);
      ctx.restore();
      return;
    }
    if (g.rotate) {                                // 回転（括弧・長音など）
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.translate(cx, cy);
      ctx.rotate(ROTATE_CW ? Math.PI / 2 : -Math.PI / 2);
      ctx.fillText(g.ch, 0, 0);
      ctx.restore();
      return;
    }
    // 通常 + 約物/小書き仮名の右上寄せ
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(g.ch, cx + g.dx * ppm, cy + g.dy * ppm);
    ctx.restore();
  }

  RNK.canvas = { drawPage, ROTATE_CW };
})();
