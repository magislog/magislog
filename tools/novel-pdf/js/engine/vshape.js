/* ============================================================
   vshape.js  ―― 縦組み字形をフォントから取り出す（機械）
   長音符「ー」や括弧は、横字形を90°回すと線の抑揚がズレて“斜め”に
   見える。フォントには縦組み専用字形(vert)が入っているので、
   fontkitでそのアウトライン(パス)を取り出し、正しい縦向きで描く。
     ・vert(fontId, ch) … 縦専用字形が有る時だけ {commands, advance, upm} を返す
                          （無ければ null → 呼び出し側は従来の回転にフォールバック）
     ・フォント本体と字形パスはキャッシュ（同じ字を何度引いても軽い）
   依存: window.fontkit, RNK.fonts.bytes()
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});
  const _fonts = {};     // fontId -> fontkit font（生成失敗は null で記録して再試行しない）
  const _paths = {};     // "fontId:ch" -> {commands, advance, upm} | null

  function getFont(fontId) {
    if (fontId in _fonts) return _fonts[fontId];
    let f = null;
    try {
      const bytes = RNK.fonts && RNK.fonts.bytes(fontId);
      if (window.fontkit && bytes) f = window.fontkit.create(new Uint8Array(bytes));
    } catch (e) { f = null; }
    _fonts[fontId] = f;
    return f;
  }

  // 縦字形(vert)を取り出す。横字形と同じ id（＝縦専用形が無い）なら null。
  function vert(fontId, ch) {
    if (!fontId || !ch) return null;
    const key = fontId + ':' + ch;
    if (key in _paths) return _paths[key];
    let out = null;
    try {
      const font = getFont(fontId);
      if (font) {
        const def = font.glyphForCodePoint(ch.codePointAt(0));
        const run = font.layout(ch, ['vert']);
        const g = run.glyphs[0];
        if (g && def && g.id !== def.id && g.path && g.path.commands.length) {
          out = { commands: g.path.commands, advance: g.advanceWidth, upm: font.unitsPerEm };
        }
      }
    } catch (e) { out = null; }
    _paths[key] = out;
    return out;
  }

  RNK.vshape = { vert, getFont };
})();
