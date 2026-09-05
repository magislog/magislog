// PK.Eval — 役の判定（SPEC.md §5）。勝敗に直結するため、上から順に最初に当たった行を返す
// §5表の判定順を一切変えない。tb（タイブレーク配列）の中身も表の指定どおりに組み立てる。
window.PK = window.PK || {};

PK.Eval = {};

(function () {

  function isFlush(c5) {
    var suit = c5[0].s;
    for (var i = 1; i < 5; i++) {
      if (c5[i].s !== suit) return false;
    }
    return true;
  }

  function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // 連続 = ランクが5種類すべて異なり max-min==4、または集合が {14,5,4,3,2}（このとき最高位5）
  // 戻り値: ストレートの最高位（無ければ null）
  function straightHighCard(c5) {
    var uniq = c5.map(function (c) { return c.r; }).sort(function (a, b) { return a - b; });
    for (var i = 1; i < uniq.length; i++) {
      if (uniq[i] === uniq[i - 1]) return null; // 同ランクがあれば5種類すべて異なる、を満たさない
    }
    if (uniq.length !== 5) return null;
    var max = uniq[uniq.length - 1], min = uniq[0];
    if (max - min === 4) return max;
    if (arraysEqual(uniq, [2, 3, 4, 5, 14])) return 5; // A-2-3-4-5（Aを1として扱う）
    return null;
  }

  // rank -> 出現数
  function rankCounts(c5) {
    var counts = {};
    for (var i = 0; i < 5; i++) {
      var r = c5[i].r;
      counts[r] = (counts[r] || 0) + 1;
    }
    return counts;
  }

  // 出現数(1〜4) -> ランク配列（降順）。ランク降順で走査して積むので各配列も自然に降順になる。
  function groupByCount(c5) {
    var counts = rankCounts(c5);
    var ranksDesc = Object.keys(counts).map(function (k) { return parseInt(k, 10); })
      .sort(function (a, b) { return b - a; });
    var byCount = { 4: [], 3: [], 2: [], 1: [] };
    for (var i = 0; i < ranksDesc.length; i++) {
      var r = ranksDesc[i];
      byCount[counts[r]].push(r);
    }
    return byCount;
  }

  // ---- evaluate5(c5) → {cat, tb} ----
  // §5表を上から順に確認し、最初に当たった行を返す。
  PK.Eval.evaluate5 = function (c5) {
    var ranksDesc = c5.map(function (c) { return c.r; }).sort(function (a, b) { return b - a; });
    var flush = isFlush(c5);
    var straightHigh = straightHighCard(c5);

    // cat10 ロイヤルストレートフラッシュ / cat9 ストレートフラッシュ
    if (flush && straightHigh !== null) {
      if (straightHigh === 14) {
        return { cat: 10, tb: [14] };
      }
      return { cat: 9, tb: [straightHigh] };
    }

    var byCount = groupByCount(c5);

    // cat8 フォーカード
    if (byCount[4].length === 1) {
      var quadRank = byCount[4][0];
      var quadKicker = byCount[3].concat(byCount[2]).concat(byCount[1])[0];
      return { cat: 8, tb: [quadRank, quadKicker] };
    }

    // cat7 フルハウス（同ランク3枚 + 別の同ランク2枚）
    if (byCount[3].length === 1 && byCount[2].length >= 1) {
      return { cat: 7, tb: [byCount[3][0], byCount[2][0]] };
    }

    // cat6 フラッシュ
    if (flush) {
      return { cat: 6, tb: ranksDesc.slice() };
    }

    // cat5 ストレート（A-2-3-4-5 は tb[0]==5）
    if (straightHigh !== null) {
      return { cat: 5, tb: [straightHigh] };
    }

    // cat4 スリーカード
    if (byCount[3].length === 1) {
      var tripRank = byCount[3][0];
      var tripKickers = byCount[2].concat(byCount[1]); // この時点で byCount[2] は空のはず
      return { cat: 4, tb: [tripRank].concat(tripKickers) };
    }

    // cat3 ツーペア
    if (byCount[2].length === 2) {
      var pairsDesc = byCount[2]; // 既に降順
      var twoPairKicker = byCount[1][0];
      return { cat: 3, tb: [pairsDesc[0], pairsDesc[1], twoPairKicker] };
    }

    // cat2 ワンペア
    if (byCount[2].length === 1) {
      var pairRank = byCount[2][0];
      return { cat: 2, tb: [pairRank].concat(byCount[1]) };
    }

    // cat1 ハイカード
    return { cat: 1, tb: ranksDesc.slice() };
  };

  // ---- compare(a,b) ----
  // cat の差を優先。同じなら tb を先頭から順に比較して最初の差。全部同じなら0（引き分け）。
  PK.Eval.compare = function (a, b) {
    if (a.cat !== b.cat) return a.cat - b.cat;
    var len = Math.max(a.tb.length, b.tb.length);
    for (var i = 0; i < len; i++) {
      var av = (a.tb[i] !== undefined) ? a.tb[i] : -1;
      var bv = (b.tb[i] !== undefined) ? b.tb[i] : -1;
      if (av !== bv) return av - bv;
    }
    return 0;
  };

  // ---- best7(cards)（5〜7枚） ----
  // 5枚の組み合わせ全部（7枚なら21通り）を evaluate5 → compare で最大を返す。
  function combinations5(cards) {
    var n = cards.length;
    if (n === 5) return [cards.slice()];
    var result = [];
    var chosen = [];
    (function pick(start) {
      if (chosen.length === 5) { result.push(chosen.slice()); return; }
      for (var i = start; i < n; i++) {
        chosen.push(cards[i]);
        pick(i + 1);
        chosen.pop();
      }
    })(0);
    return result;
  }

  PK.Eval.best7 = function (cards) {
    var combos = combinations5(cards);
    var best = null;
    for (var i = 0; i < combos.length; i++) {
      var r = PK.Eval.evaluate5(combos[i]);
      if (best === null || PK.Eval.compare(r, best) > 0) {
        best = r;
      }
    }
    return best;
  };

  // ---- rankChar(r) ----
  // 画面表示用の1ランク文字（10は"10"のまま・J/Q/K/Aは文字）。PK.CONFIG.HAND.RANK_CHAR が正本。
  PK.Eval.rankChar = function (r) {
    var map = PK.CONFIG.HAND.RANK_CHAR;
    return map[r] || String(r);
  };

  // ---- name(result) ----
  // 通常: evaluate5/best7 の結果 {cat, tb} を渡す。役名 + catが2,3,4,7,8のとき（rankChar(tb[0])）。
  // 特例: board が3枚未満（プリフロップ）で hole 2枚しか無いときは、
  //       2枚のカード配列を直接渡す呼び方を許し、同ランク→「ワンペア（X）」、違えば「ハイカード（高い方）」を返す。
  PK.Eval.name = function (input) {
    if (Array.isArray(input)) {
      var a = input[0], b = input[1];
      if (a.r === b.r) {
        return "ワンペア（" + PK.Eval.rankChar(a.r) + "）";
      }
      var hi = (a.r > b.r) ? a.r : b.r;
      return "ハイカード（" + PK.Eval.rankChar(hi) + "）";
    }
    var result = input;
    var base = PK.CONFIG.HAND.CAT_NAME[result.cat];
    var showRank = PK.CONFIG.HAND.CAT_SHOW_RANK.indexOf(result.cat) !== -1;
    if (showRank) {
      return base + "（" + PK.Eval.rankChar(result.tb[0]) + "）";
    }
    return base;
  };

})();
