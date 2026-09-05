var IG = (typeof window !== 'undefined') ? (window.IG = window.IG || {}) : (global.IG = global.IG || {});

// IG.AI — CPU（そら）の手の選び方。弱くてよい。読みは1手。document・window を参照しない。
// SPEC.md §5 準拠。

(function () {
  var SIZE = (IG.Rules && typeof IG.Rules.SIZE === 'number') ? IG.Rules.SIZE
    : (IG.CONFIG && typeof IG.CONFIG.SIZE === 'number') ? IG.CONFIG.SIZE : 9;

  IG.AI = {};

  // score(pos, m): 大きいほど良い。me = pos.turn、相手は 3-me。
  IG.AI.score = function (pos, m) {
    var CFG = IG.CONFIG.AI;
    var me = pos.turn;
    var after = IG.Rules.apply(pos, m);
    var g = IG.Rules.group(after, m.r, m.c);
    var libs = g ? g.liberties.length : 0;
    var cap = after.captures[me] - pos.captures[me];

    var total = 0;

    // 取れる石
    total += CFG.CAPTURE * cap;

    // 相手の連をアタリにする（個数。同じ連を2回数えない。連の識別は stones[0] の r*SIZE+c）
    var opp = 3 - me;
    var seenGroup = {};
    var atariCount = 0;
    if (g) {
      for (var i = 0; i < g.stones.length; i++) {
        var st = g.stones[i];
        var nbrs = IG.Rules.neighbors(st.r, st.c);
        for (var j = 0; j < nbrs.length; j++) {
          var n = nbrs[j];
          var v = IG.Rules.at(after, n.r, n.c);
          if (v === opp) {
            var og = IG.Rules.group(after, n.r, n.c);
            if (og && og.liberties.length === 1) {
              var key = og.stones[0].r * SIZE + og.stones[0].c;
              if (!seenGroup[key]) {
                seenGroup[key] = true;
                atariCount += 1;
              }
            }
          }
        }
      }
    }
    total += CFG.ATARI * atariCount;

    // 自分からアタリになる
    if (cap === 0 && libs === 1) total += CFG.SELF_ATARI;

    // 自分の眼を埋める（打つ前の pos で判定）
    if (IG.Rules.isEye(pos, m.r, m.c, me)) total += CFG.EYE_FILL;

    // 呼吸点のゆとり
    total += CFG.LIBERTY * Math.min(libs, CFG.LIBERTY_CAP);

    // 中央寄り（天元 +1、辺 0）
    var center = Math.floor((SIZE - 1) / 2);
    total += CFG.CENTER * (center - Math.max(Math.abs(m.r - center), Math.abs(m.c - center)));

    return total;
  };

  // choose(pos): 必ず move を返す（パスもある）。例外を投げない。
  IG.AI.choose = function (pos) {
    try {
      var plays = IG.Rules.legalPlays(pos);
      if (plays.length === 0) return { kind: 'pass' };

      var CFG = IG.CONFIG.AI;
      var best = null;
      var bestScore = -Infinity;
      var bestBase = -Infinity;

      for (var i = 0; i < plays.length; i++) {
        var m = plays[i];
        var base = IG.AI.score(pos, m);
        var s = base + Math.random(); // 同点は乱数で散らす（0 以上 1 未満）
        if (s > bestScore) {
          best = m;
          bestScore = s;
          bestBase = base;
        }
      }

      if (bestBase < CFG.PASS_BELOW) return { kind: 'pass' };
      if (pos.passes >= 1 && bestBase < CFG.PASS_AFTER_PASS_BELOW) return { kind: 'pass' };
      return best;
    } catch (e) {
      console.error(e);
      try {
        var fallback = IG.Rules.legalPlays(pos);
        return (fallback && fallback.length) ? fallback[0] : { kind: 'pass' };
      } catch (e2) {
        return { kind: 'pass' };
      }
    }
  };
})();
