/* ============================================================
   typeset.js  ―― 縦組みグリッド組版エンジン（機械の心臓）
   入力: 本文テキスト + 設定 → 出力: ページ配置モデル(PageDoc)
   ここが唯一の「正」。プレビュー(Canvas)もPDFも、この同じモデルを描くだけ。
   だから「見たまま入稿PDF」が保証される。

   ・ベタ組み(全角=1em四方のマス目)を右→左・上→下に敷く
   ・二段組みは上段→下段。段間は天地余白を守って自動算出
   ・禁則(追い出し/ぶら下げ)・縦中横(2桁数字)・約物右上寄せに対応
   ・塗り足し(bleed)はページを仕上がり+塗り足しに拡大し、余白は仕上がり端から測る

   座標系: モデルは「ページ左上原点・x右・y下・単位mm(塗り足し込み)」。
   ============================================================ */
;(function () {
  'use strict';
  const RNK = (window.RNK = window.RNK || {});
  const U = RNK.units;

  // 半角数字判定
  const isAsciiDigit = (c) => c >= '0' && c <= '9';
  const isBlank = (c) => c === '　' || c === ' ';
  // ルビ親になり得る漢字系
  const isKanji = (c) => /[一-鿿㐀-䶿豈-﫿々〆ヶ]/.test(c);

  /* --- 段落を升目セルの配列へ（縦中横まとめ＋青空文庫ルビもここで） ---
     ・｜親《ルビ》 … 親を明示     ・漢字《ルビ》 … 直前の漢字連続を親に
     ・ルビは親セルに cell.ruby={gid,text} として紐付け（描画は配置後の後処理） */
  function paragraphToCells(paragraph, gidRef, doRuby) {
    const cells = [];
    const s = Array.from(paragraph); // サロゲート対応
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      // --- ルビ: ｜親《ルビ》 ---
      if (doRuby && (c === '｜' || c === '|')) {
        const open = s.indexOf('《', i + 1);
        const close = open >= 0 ? s.indexOf('》', open + 1) : -1;
        if (open > i && close > open) {
          const start = cells.length;
          for (const bc of s.slice(i + 1, open)) cells.push({ ch: bc, blank: isBlank(bc) });
          const ruby = s.slice(open + 1, close).join('');
          const gid = ++gidRef.n;
          for (let m = start; m < cells.length; m++) cells[m].ruby = { gid, text: ruby };
          i = close + 1; continue;
        }
        cells.push({ ch: c }); i++; continue;
      }
      // --- ルビ: 漢字《ルビ》（親省略） ---
      if (doRuby && c === '《') {
        const close = s.indexOf('》', i + 1);
        if (close > i) {
          let k = cells.length;
          while (k > 0 && cells[k - 1].ch && isKanji(cells[k - 1].ch) && !cells[k - 1].ruby && !cells[k - 1].tcy) k--;
          if (k < cells.length) {
            const ruby = s.slice(i + 1, close).join('');
            const gid = ++gidRef.n;
            for (let m = k; m < cells.length; m++) cells[m].ruby = { gid, text: ruby };
            i = close + 1; continue;
          }
        }
        cells.push({ ch: c }); i++; continue;   // 親無し→《は括弧として素通り
      }
      // --- 半角数字（縦中横） ---
      if (isAsciiDigit(c)) {
        let j = i;
        while (j < s.length && isAsciiDigit(s[j])) j++;
        const run = s.slice(i, j).join('');
        if (run.length === 2) cells.push({ ch: run, tcy: [run[0], run[1]] });      // 2桁→縦中横
        else if (run.length === 1) cells.push({ ch: run, upright: true });          // 1桁→正立
        else for (const d of run) cells.push({ ch: d, upright: true });             // 3桁以上→各正立
        i = j; continue;
      }
      cells.push({ ch: c, blank: isBlank(c) });
      i++;
    }
    return cells;
  }

  function toCells(paragraph) { return paragraphToCells(paragraph, { n: 0 }, false); }

  /* --- ルビの後処理: 配置済みの親グリフの右(行間側)に、小さくルビを分配 ---
     列(行)をまたいだ親は、親字数の比でルビを分割して各列に置く（崩れ防止） */
  function addRuby(glyphs) {
    const byGid = new Map();
    for (const g of glyphs) {
      if (!g.ruby) continue;
      if (!byGid.has(g.ruby.gid)) byGid.set(g.ruby.gid, []);
      byGid.get(g.ruby.gid).push(g);
    }
    if (byGid.size === 0) return;
    const extra = [];
    for (const ps of byGid.values()) {
      const rubyText = Array.from(ps[0].ruby.text);
      const R = rubyText.length;
      if (R === 0) continue;
      const G = ps.length;
      const byCol = new Map();                                   // 同一列(x)ごと
      for (const g of ps) {
        const key = Math.round(g.x * 100);
        if (!byCol.has(key)) byCol.set(key, []);
        byCol.get(key).push(g);
      }
      const cols = [...byCol.values()].sort((a, b) => b[0].x - a[0].x); // 右(大x)から
      let seen = 0;
      for (const col of cols) {
        col.sort((a, b) => a.y - b.y);
        const g0 = col[0];
        const cMm = g0.cell;
        const top = col[0].y;
        const spanH = (col[col.length - 1].y + cMm) - top;
        const rStart = Math.round((seen / G) * R);
        const rEnd = Math.round(((seen + col.length) / G) * R);
        seen += col.length;
        const slice = rubyText.slice(rStart, rEnd);
        const n = slice.length;
        if (n === 0) continue;
        const rubyPt = g0.sizePt * 0.5;
        const rubyCell = U.pt2mm(rubyPt);
        const rubyX = g0.x + cMm;                                // 親の右（行間側）へ
        for (let k = 0; k < n; k++) {
          const cls = RNK.vglyph.classify(slice[k]);
          const cy = top + (k + 0.5) * (spanH / n);
          extra.push({
            ch: slice[k], tcy: null,
            x: rubyX, y: cy - rubyCell / 2,
            cell: rubyCell, sizePt: rubyPt,
            rotate: cls.rotate, dx: cls.dx * rubyCell, dy: cls.dy * rubyCell,
            hanging: false, isRuby: true,
          });
        }
      }
    }
    for (const e of extra) glyphs.push(e);
  }

  /* --- 1段落を行(升目N個)へ割る。禁則(追い出し/ぶら下げ)込み --- */
  const NOSPLIT = new Set(['—', '―', '…', '‥', '─', '━']); // 連続を割らない（ダーシ・三点リーダ）
  function breakParagraph(cells, N, allowHang) {
    const K = RNK.kinsoku;
    if (allowHang === undefined) allowHang = true;
    N = Math.max(1, N | 0);              // N=0での無限ループ自衛（公開APIとして単体でも安全に）
    const lines = [];
    if (cells.length === 0) { lines.push({ cells: [], hang: null }); return lines; }
    let i = 0;
    while (i < cells.length) {
      let take = Math.min(N, cells.length - i);
      // 禁則調整（有限ループ）
      for (let guard = 0; guard < N + 4; guard++) {
        const endIdx = i + take - 1;
        const nextIdx = i + take;
        let changed = false;
        if (take > 1 && nextIdx < cells.length && K.isEndForbidden(cells[endIdx].ch)) {
          take--; changed = true; continue;                        // 行末禁則: 開き括弧を次行へ
        }
        if (take > 1 && nextIdx < cells.length &&
            K.isStartForbidden(cells[nextIdx].ch) && !(allowHang && K.isHangable(cells[nextIdx].ch))) {
          take--; changed = true; continue;                        // 行頭禁則: 末尾を次行へ
        }
        if (take > 1 && nextIdx < cells.length &&
            NOSPLIT.has(cells[endIdx].ch) && NOSPLIT.has(cells[nextIdx].ch)) {
          take--; changed = true; continue;                        // 分離禁則: ——・……を割らない
        }
        if (!changed) break;
      }
      const lineCells = cells.slice(i, i + take);
      let hang = null;
      let consumed = take;
      const nextIdx = i + take;
      if (allowHang && take === N && nextIdx < cells.length && K.isHangable(cells[nextIdx].ch)) {
        hang = cells[nextIdx]; consumed = take + 1;                 // ぶら下げ: 、。を行末に
      }
      lines.push({ cells: lineCells, hang });
      i += consumed;
    }
    return lines;
  }

  // 中扉ページ：中央付近にタイトルを1列で置く（残りは空白＝padToPageが埋める）
  function pushNakatobira(allLines, title, N, L, gidRef, doRuby) {
    const tcells = paragraphToCells(title, gidRef, doRuby);
    const midCol = Math.max(0, Math.floor((L - 1) / 2));
    for (let c = 0; c < midCol; c++) allLines.push({ cells: [], hang: null });
    const topPad = Math.max(0, Math.floor((N - tcells.length) / 2));
    const col = [];
    for (let k = 0; k < topPad; k++) col.push({ ch: '　', blank: true });
    for (const c of tcells) col.push(c);
    allLines.push({ cells: col, hang: null });
  }

  // ノンブル/柱の号数（本文サイズより一回り小さく＝6.5〜8pt目安）
  function furnitureSize(s) { return Math.max(6.5, Math.min(s.fontSizePt * 0.8, 8)); }

  // ノンブル1個ぶんを作る（本文/目次で共通・表裏で左右反転）
  function makeNombre(displayNo, isOdd, s, bleed) {
    const numSize = furnitureSize(s);
    const yTrim = s.trimH - Math.min(s.mBottom * 0.55, 7);
    const nx = isOdd ? s.mInner * 0.6 + 3 : s.trimW - (s.mInner * 0.6 + 3);
    return { text: String(displayNo), x: bleed + nx, y: bleed + yTrim, sizePt: numSize, align: isOdd ? 'left' : 'right' };
  }

  // 柱（ランニングヘッド）＝ページ上部・小口側にタイトルを横並びで置く。
  // ノンブル（下・小口側）と左右をそろえ、天地対称の位置にする。
  // 奇数=左ページ→左上そろえ / 偶数=右ページ→右上そろえ。
  function makeHashira(title, isOdd, s, bleed) {
    const yTrim = Math.min(s.mTop * 0.55, 7);                                    // 天からの距離（ノンブルと対称）
    const nx = isOdd ? s.mInner * 0.6 + 3 : s.trimW - (s.mInner * 0.6 + 3);      // ノンブルと同じx
    const maxWidthMm = Math.max(10, s.trimW - s.mInner - s.mOuter);              // 版面幅を超えたら描画側で…に詰める
    return { text: title, x: bleed + nx, y: bleed + yTrim, sizePt: furnitureSize(s), align: isOdd ? 'left' : 'right', maxWidthMm };
  }

  /* --- メイン: テキスト+設定 → PageDoc --- */
  function layout(text, s) {
    const opt = Object.assign({
      combineBangs: true,
      startParity: 'odd',   // 1ページ目を奇数(右起こし)とみなす
      showNombre: true,
      ruby: true,           // 青空文庫ルビの解釈
      pageOffset: 0,        // 本文の前にある枚数(目次等)＝通し番号/表裏の起点
      autoIndent: false,    // 段落の自動字下げ
      hangPunct: true,      // 、。のぶら下げ
      hashira: false,       // 柱(ランニングヘッド)を入れる
      hashiraText: '',      // 柱に出すタイトル
      nombreStart: 1,       // ノンブル開始番号（先頭ページの番号）
    }, s.options || {});

    const norm = RNK.preprocess.normalize(text, { combineBangs: opt.combineBangs, autoIndent: opt.autoIndent });

    // --- 幾何(すべてmm) ---
    const cellMm = U.pt2mm(s.fontSizePt);                 // マス目=1em
    const pitchMm = U.pt2mm(s.fontSizePt + s.leadingPt);  // 行送り
    const N = s.charsPerLine;
    const L = s.linesPerCol;
    const C = s.columns;
    const bleed = s.bleed || 0;
    const pageW = s.trimW + bleed * 2;
    const pageH = s.trimH + bleed * 2;

    const tierH = N * cellMm;                             // 1段の高さ
    const availV = s.trimH - s.mTop - s.mBottom;          // 天地内の使える高さ
    const gap = C === 2 ? (availV - tierH * 2) : 0;       // 段間(自動)
    const tierTop = (t) => s.mTop + t * (tierH + gap);    // 各段の上端(仕上がり座標)
    const blockW = (L - 1) * pitchMm + cellMm;            // 版面(行方向)の幅
    const textAreaW = s.trimW - s.mInner - s.mOuter;      // ノド〜小口の使える幅
    const overV = (C === 2) ? (gap < -0.01) : (tierH > availV + 0.01); // 天地はみ出し(段組み非依存)
    const overH = blockW > textAreaW + 0.01;              // 左右(行数過多)のはみ出し
    const slotsPerPage = C * L;                           // 1ページの行スロット数(段×行)

    // --- 段落→行（[章:タイトル]で改ページ＋見出し、[改ページ]で改ページ、章は目次用に記録） ---
    const doRuby = opt.ruby !== false;
    const paragraphs = norm.split('\n');
    const gidRef = { n: 0 };                 // ルビのグループ通し番号
    const allLines = [];
    const chapters = [];                     // {title, pageIdx}（pageIdxは本文内0基点ページ）
    const tobiraSet = new Set();             // 中扉ページのindex（柱を出さない）
    const padToPage = () => { while (allLines.length % slotsPerPage !== 0) allLines.push({ cells: [], hang: null }); };
    const addBlankPage = () => { padToPage(); for (let k = 0; k < slotsPerPage; k++) allLines.push({ cells: [], hang: null }); };
    for (const p of paragraphs) {
      const mTobira = p.match(/^\s*\[中扉[:：]\s*(.*?)\s*\]\s*$/);
      if (mTobira) {
        padToPage();                                             // 中扉は新ページ
        const tpi = allLines.length / slotsPerPage;
        tobiraSet.add(tpi);                                      // このページは扉＝柱を出さない
        chapters.push({ title: mTobira[1], pageIdx: tpi });
        pushNakatobira(allLines, mTobira[1], N, L, gidRef, doRuby);
        padToPage();                                             // 扉ページの残りは空白
        continue;
      }
      const mChap = p.match(/^\s*\[章[:：]\s*(.*?)\s*\]\s*$/);
      if (mChap) {
        padToPage();                                             // 章は新ページから
        chapters.push({ title: mChap[1], pageIdx: allLines.length / slotsPerPage });
        const head = [{ ch: '　', blank: true }].concat(paragraphToCells(mChap[1], gidRef, doRuby)); // 頭を1マス下げ
        for (const ln of breakParagraph(head, N, opt.hangPunct)) allLines.push(ln);
        allLines.push({ cells: [], hang: null });                // 見出し後に1行空け
        continue;
      }
      if (/^\s*\[改ページ\]\s*$/.test(p)) { padToPage(); continue; }
      if (/^\s*\[空白\]\s*$/.test(p)) { addBlankPage(); continue; }
      for (const ln of breakParagraph(paragraphToCells(p, gidRef, doRuby), N, opt.hangPunct)) allLines.push(ln);
    }

    // --- 行をページ/段へ配分して座標付け ---
    const pageOffset = opt.pageOffset || 0;
    const totalPages = Math.max(1, Math.ceil(allLines.length / slotsPerPage));
    const pages = [];
    for (let pi = 0; pi < totalPages; pi++) {
      const displayNo = pi + pageOffset + (opt.nombreStart || 1);   // 通し番号(開始番号＋前付け)
      const isOdd = (opt.startParity === 'odd') ? (displayNo % 2 === 1) : (displayNo % 2 === 0);
      // ノド/小口の左右（奇数=右起こし: ノド左・小口右）
      // 右綴じ(縦組みの標準): 奇数=左ページ→小口は左 / 偶数=右ページ→小口は右。
      // 版面は小口(外)側にそろえ、端数はノド(綴じ)側へ。→ 実サンプルと一致・見開きでノド対称。
      const rightEdgeTrim = isOdd ? (s.mOuter + blockW) : (s.trimW - s.mOuter);  // 最右行の右端(仕上がり座標)

      const glyphs = [];
      for (let slot = 0; slot < slotsPerPage; slot++) {
        const lineIdx = pi * slotsPerPage + slot;
        if (lineIdx >= allLines.length) break;
        const line = allLines[lineIdx];
        const tier = Math.floor(slot / L);
        const iInTier = slot % L;                          // 0=最右
        const colRight = rightEdgeTrim - iInTier * pitchMm;
        const cellLeftX = colRight - cellMm;               // マスの左端(仕上がり座標)
        const top = tierTop(tier);

        const place = (cell, j, hanging) => {
          if (!cell || cell.blank) return;
          const cls = RNK.vglyph.classify(cell.ch);
          glyphs.push({
            ch: cell.ch,
            tcy: cell.tcy || null,
            upright: !!cell.upright,
            // 塗り足し分だけ全体座標へオフセット
            x: bleed + cellLeftX,
            y: bleed + top + j * cellMm,
            cell: cellMm,
            sizePt: s.fontSizePt,
            rotate: cls.rotate,
            dx: cls.dx * cellMm,
            dy: cls.dy * cellMm,
            hanging: !!hanging,
            ruby: cell.ruby || null,
          });
        };
        line.cells.forEach((cell, j) => place(cell, j, false));
        if (line.hang) place(line.hang, N, true);          // ぶら下げは最終マスの1つ下
      }
      addRuby(glyphs);                                      // 親グリフ配置後にルビを右へ添える

      const nombre = opt.showNombre ? makeNombre(displayNo, isOdd, s, bleed) : null;
      // 柱＝左ページ(奇数)のみ・中扉ページは除外（あやか指示「左ページの左上」準拠）
      const hashira = (opt.hashira && opt.hashiraText && isOdd && !tobiraSet.has(pi))
        ? makeHashira(opt.hashiraText, isOdd, s, bleed) : null;
      pages.push({ index: pi, pageNo: displayNo, glyphs, nombre, hashira });
    }

    return {
      pageW, pageH, bleed,
      trimW: s.trimW, trimH: s.trimH,
      pages,
      chapters,
      meta: {
        totalPages,
        totalLines: allLines.length,
        slotsPerPage,
        cellMm, pitchMm, tierH, gap, blockW,
        overset: overV || overH,        // 天地 or 左右のはみ出し
        oversetV: overV, oversetH: overH,
        capacityChars: slotsPerPage * N,
      },
    };
  }

  RNK.typeset = { layout, toCells, paragraphToCells, breakParagraph, addRuby, makeNombre };
})();
