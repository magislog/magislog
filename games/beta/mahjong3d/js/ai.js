// MJ.AI — CPUの打ち方（SPEC.md §6）。3人とも同じロジック。乱数なし＝決定的。
window.MJ = window.MJ || {};
MJ.AI = {};

(function () {
  'use strict';

  // ---- handValue(c13)（§6-5・貪欲・決定的） ----
  MJ.AI.handValue = function (c13) {
    var c = c13.slice();
    var sets = 0, pairs = 0, adj = 0, kan = 0;
    var i;

    // ① 刻子
    for (i = 0; i < 34; i++) {
      if (c[i] >= 3) { c[i] -= 3; sets += 1; }
    }
    // ② 順子（同色内）
    for (i = 0; i <= 26; i++) {
      if (MJ.Tiles.num(i) <= 7 && c[i] > 0 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i] -= 1; c[i + 1] -= 1; c[i + 2] -= 1; sets += 1;
      }
    }
    // ③ 対子（最初の1組だけ）
    for (i = 0; i < 34 && pairs < 1; i++) {
      if (c[i] >= 2) { c[i] -= 2; pairs += 1; }
    }
    // 塔子(両面・辺張)・嵌張は sets+pairs が 4 組に達するまでだけ数える
    var maxTaatsu = 4 - sets - pairs;
    // ④ 両面・辺張（同色内・num<=8）
    for (i = 0; i <= 26 && (adj + kan) < maxTaatsu; i++) {
      if (MJ.Tiles.num(i) <= 8 && c[i] > 0 && c[i + 1] > 0) {
        c[i] -= 1; c[i + 1] -= 1; adj += 1;
      }
    }
    // ⑤ 嵌張（同色内・num<=7）
    for (i = 0; i <= 26 && (adj + kan) < maxTaatsu; i++) {
      if (MJ.Tiles.num(i) <= 7 && c[i] > 0 && c[i + 2] > 0) {
        c[i] -= 1; c[i + 2] -= 1; kan += 1;
      }
    }

    return 8 * sets + 3 * pairs + 2 * adj + 1 * kan;
  };

  // ---- seenCount(id, state)（SPEC §1 は2引数。「自分」は state.turn で決まる
  //      ＝ decide(seat, state) は常に state.turn===seat で呼ばれる前提） ----
  MJ.AI.seenCount = function (id, state) {
    var n = 0, i, j;
    var p = state.players[state.turn];
    var hand14 = p.hand.concat(p.tsumo ? [p.tsumo] : []);
    for (i = 0; i < hand14.length; i++) if (hand14[i].id === id) n++;
    for (i = 0; i < 4; i++) {
      var river = state.players[i].river;
      for (j = 0; j < river.length; j++) if (river[j].id === id) n++;
    }
    if (state.doraInd && state.doraInd.id === id) n++;
    return n;
  };

  function safeTiles(seat, state) {
    var p = state.players[seat];
    var hand14 = p.hand.concat(p.tsumo ? [p.tsumo] : []);
    var result = [];
    var i, k;
    for (i = 0; i < 4; i++) {
      if (i === seat) continue;
      if (!state.players[i].riichi) continue;
      var river = state.players[i].river;
      for (k = 0; k < hand14.length; k++) {
        var t = hand14[k];
        var inRiver = false;
        for (var j = 0; j < river.length; j++) {
          if (river[j].id === t.id) { inRiver = true; break; }
        }
        if (inRiver) result.push(t);
      }
      if (result.length > 0) break; // 最初に見つかったリーチ者を基準にする
    }
    if (result.length === 0) return null;
    var best = result[0];
    for (i = 1; i < result.length; i++) {
      if (result[i].id > best.id) best = result[i];
    }
    return best;
  }
  MJ.AI.safeTiles = safeTiles;

  MJ.AI.decide = function (seat, state) {
    var p = state.players[seat];
    var hand14 = p.hand.concat(p.tsumo ? [p.tsumo] : []);
    var c14 = MJ.Tiles.counts(hand14);

    // 1. ツモ和了
    if (MJ.Win.isWin(c14) && state.tutorialFlags.cpuMayWin) {
      return { kind: 'tsumo' };
    }

    // 2. リーチ中はツモ切り固定
    if (p.riichi) {
      return { kind: 'discard', tile: p.tsumo, riichi: false };
    }

    // 3. 守り: 他家にリーチがいて自分が非聴牌なら安全牌
    var i, otherRiichi = false;
    for (i = 0; i < 4; i++) {
      if (i !== seat && state.players[i].riichi) { otherRiichi = true; break; }
    }
    if (otherRiichi) {
      var myTenpai = MJ.Win.tenpaiTiles(MJ.Tiles.counts(p.hand)).length > 0;
      if (!myTenpai) {
        var safe = safeTiles(seat, state);
        if (safe) return { kind: 'discard', tile: safe, riichi: false };
      }
    }

    // 4. 攻め: id ごとに候補を評価
    var seenId = {};
    var bestScore = -Infinity;
    var bestTile = null;
    var bestId = -1;
    var bestWaits = null;

    for (i = 0; i < hand14.length; i++) {
      var cand = hand14[i];
      if (seenId[cand.id]) continue;
      seenId[cand.id] = true;

      // 実体は uid 最小のものを使う
      var chosen = cand;
      for (var k = 0; k < hand14.length; k++) {
        if (hand14[k].id === cand.id && hand14[k].uid < chosen.uid) chosen = hand14[k];
      }

      var h13 = c14.slice();
      h13[cand.id] -= 1;
      var waits = MJ.Win.tenpaiTiles(h13);
      var score;
      if (waits.length > 0) {
        score = 1000;
        for (var w = 0; w < waits.length; w++) {
          score += (4 - MJ.AI.seenCount(waits[w], state));
        }
      } else {
        score = MJ.AI.handValue(h13);
      }

      if (score > bestScore) {
        bestScore = score; bestTile = chosen; bestId = cand.id; bestWaits = waits;
      } else if (score === bestScore) {
        var pick = tieBreak(bestId, cand.id);
        if (pick === cand.id) {
          bestScore = score; bestTile = chosen; bestId = cand.id; bestWaits = waits;
        }
      }
    }

    var riichi = false;
    if (bestWaits && bestWaits.length > 0 && !p.riichi && p.points >= MJ.CONFIG.RIICHI_COST &&
        state.drawsLeft >= 4 && state.tutorialFlags.cpuMayRiichi) {
      riichi = true;
    }
    return { kind: 'discard', tile: bestTile, riichi: riichi };
  };

  // 同点タイブレーク: 字牌 > 么九牌 > 中張牌 の順で捨てやすい方（字牌を先に切る）、
  // それでも同点なら |num-5| が大きい方、それでも同点なら id 小さい方
  function tileRank(id) {
    if (MJ.Tiles.isHonor(id)) return 2;
    if (MJ.Tiles.isTerminal(id)) return 1;
    return 0;
  }
  function tieBreak(curId, candId) {
    var rc = tileRank(curId), rn = tileRank(candId);
    if (rn !== rc) return rn > rc ? candId : curId;
    var dc = Math.abs(MJ.Tiles.num(curId) - 5);
    var dn = Math.abs(MJ.Tiles.num(candId) - 5);
    if (dn !== dc) return dn > dc ? candId : curId;
    return candId < curId ? candId : curId;
  }
})();
