// PK.AI — CPUの打ち方（SPEC.md §6）。3人とも同じロジック、性格差は CONFIG.AGGR[seat] だけ。
window.PK = window.PK || {};

PK.AI = {};

(function () {

  // ---- Chen式スコア用の小ヘルパー ----
  function highCardValue(r) {
    var map = PK.CONFIG.AI.CHEN.HIGH_VALUE; // {14:10,13:8,12:7,11:6}
    if (map[r] !== undefined) return map[r];
    return r / 2; // T=5, 9=4.5, ...
  }

  function gapPenalty(gap) {
    var map = PK.CONFIG.AI.CHEN.GAP_PENALTY; // {0:0,1:-1,2:-2,3:-4}
    if (map[gap] !== undefined) return map[gap];
    return PK.CONFIG.AI.CHEN.GAP_PENALTY_DEFAULT; // gap>=4 → -5
  }

  // ---- preflopScore(hole) ----
  PK.AI.preflopScore = function (hole) {
    var CHEN = PK.CONFIG.AI.CHEN;
    var c1 = hole[0], c2 = hole[1];
    var hi = (c1.r >= c2.r) ? c1 : c2;
    var lo = (c1.r >= c2.r) ? c2 : c1;

    if (hi.r === lo.r) {
      var pairVal = highCardValue(hi.r) * CHEN.PAIR_MULT;
      return Math.max(pairVal, CHEN.PAIR_MIN);
    }

    var score = highCardValue(hi.r);
    if (c1.s === c2.s) score += CHEN.SUITED_BONUS;
    var gap = hi.r - lo.r - 1;
    score += gapPenalty(gap);
    if (gap <= CHEN.STRAIGHT_GAP_MAX && hi.r < CHEN.STRAIGHT_UNDER_RANK) {
      score += CHEN.STRAIGHT_BONUS;
    }
    return score;
  };

  // ---- postflopStrength(hole, board) ----
  function maxRank(cards) {
    var m = -Infinity;
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].r > m) m = cards[i].r;
    }
    return m;
  }

  // 同スート4枚（holeを1枚以上含む）
  function hasFourFlushWithHole(hole, all) {
    var suits = ['s', 'h', 'd', 'c'];
    for (var i = 0; i < suits.length; i++) {
      var suit = suits[i];
      var countAll = 0, countHole = 0;
      for (var j = 0; j < all.length; j++) if (all[j].s === suit) countAll++;
      for (var k = 0; k < hole.length; k++) if (hole[k].s === suit) countHole++;
      if (countAll >= 4 && countHole >= 1) return true;
    }
    return false;
  }

  // 連続する4ランク（holeを1枚以上含む）。ホイール(A-2-3-4)は仕様に明記が無いため対象外。
  function hasFourStraightWithHole(hole, all) {
    var allSet = {}, holeSet = {};
    for (var i = 0; i < all.length; i++) allSet[all[i].r] = true;
    for (var j = 0; j < hole.length; j++) holeSet[hole[j].r] = true;

    for (var start = 2; start <= 11; start++) {
      var ok = true, hasHole = false;
      for (var k = 0; k < 4; k++) {
        var r = start + k;
        if (!allSet[r]) { ok = false; break; }
        if (holeSet[r]) hasHole = true;
      }
      if (ok && hasHole) return true;
    }
    return false;
  }

  PK.AI.postflopStrength = function (hole, board) {
    var S = PK.CONFIG.AI.STRENGTH;
    var all = hole.concat(board);
    var result = PK.Eval.best7(all);
    var cat = result.cat;

    if (cat >= S.CAT_STRAIGHT_UP_MIN) return S.STRAIGHT_UP;      // cat>=5 ストレート以上
    if (cat === S.CAT_TRIPS) return S.TRIPS;                      // cat4
    if (cat === S.CAT_TWO_PAIR) return S.TWO_PAIR;                // cat3
    if (cat === S.CAT_PAIR) {
      var boardMax = maxRank(board);
      var pairRank = result.tb[0];
      return (pairRank >= boardMax) ? S.TOP_PAIR : S.WEAK_PAIR;
    }
    if (hasFourFlushWithHole(hole, all) || hasFourStraightWithHole(hole, all)) return S.DRAW;
    var bMax = maxRank(board);
    if (hole[0].r > bMax && hole[1].r > bMax) return S.OVERCARDS;
    return S.NOTHING;
  };

  // ---- half（pot/2をBBの倍数へ切り上げ・最低BB） ----
  function halfPot(pot) {
    var BB = PK.CONFIG.BB;
    var minHalf = PK.CONFIG.AI.POSTFLOP.HALF_POT_MIN_BB * BB;
    var raw = pot / 2;
    var half = Math.ceil(raw / BB) * BB;
    return Math.max(half, minHalf);
  }

  function cappedProb(p) {
    return Math.min(p, PK.CONFIG.AI.AGGR_CAP); // 上限0.95は「確率」側にかける
  }

  // ---- プリフロップ判定 ----
  // toCall===0 の分岐は仕様表に明記が無いが、legalActions()上 CALL/RAISE は使えないため
  // §6のpostflop部で既に使われているBET/CHECKの命名規則に合わせて読み替える。
  function decidePreflop(seat, state, player, toCall) {
    var P = PK.CONFIG.AI.PREFLOP;
    var BB = PK.CONFIG.BB;
    var score = PK.AI.preflopScore(player.hole);

    if (score >= P.RAISE_MIN) {
      var total = state.currentBet + Math.max(state.minRaise, P.RAISE_MIN_BB * BB);
      return { kind: (toCall === 0 ? 'BET' : 'RAISE'), amount: total };
    }
    if (score >= P.CALL_MID_MIN) {
      return (toCall === 0)
        ? { kind: 'CHECK', amount: player.betThisRound }
        : { kind: 'CALL', amount: state.currentBet };
    }
    if (score >= P.CALL_LOW_MIN) {
      if (toCall <= P.CALL_LOW_MAX_TOCALL_BB * BB) {
        return (toCall === 0)
          ? { kind: 'CHECK', amount: player.betThisRound }
          : { kind: 'CALL', amount: state.currentBet };
      }
      return { kind: 'FOLD', amount: 0 };
    }
    // score < 5
    return (toCall === 0)
      ? { kind: 'CHECK', amount: player.betThisRound }
      : { kind: 'FOLD', amount: 0 };
  }

  // ---- フロップ以降の判定 ----
  function decidePostflop(seat, state, player, toCall, aggr) {
    var PF = PK.CONFIG.AI.POSTFLOP;
    var strength = PK.AI.postflopStrength(player.hole, state.board);
    var half = halfPot(state.pot);

    if (toCall === 0) {
      if (strength >= PF.CHECK_TOCALL0_STRENGTH_MIN) {
        if (Math.random() < cappedProb(PF.CHECK_TOCALL0_BET_PROB * aggr)) {
          return { kind: 'BET', amount: half };
        }
        return { kind: 'CHECK', amount: player.betThisRound };
      }
      if (strength < PF.BLUFF_STRENGTH_MAX) {
        if (Math.random() < PF.BLUFF_BET_PROB) {
          return { kind: 'BET', amount: half };
        }
        return { kind: 'CHECK', amount: player.betThisRound };
      }
      return { kind: 'CHECK', amount: player.betThisRound };
    }

    // toCall > 0
    if (strength >= PF.RAISE_STRENGTH_MIN) {
      if (Math.random() < cappedProb(PF.RAISE_PROB * aggr)) {
        var total = state.currentBet + Math.max(state.minRaise, half);
        return { kind: 'RAISE', amount: total };
      }
      return { kind: 'CALL', amount: state.currentBet };
    }
    var potOdds = toCall / (state.pot + toCall);
    if (strength >= potOdds + PF.CALL_POTODDS_MARGIN) {
      return { kind: 'CALL', amount: state.currentBet };
    }
    if (Math.random() < PF.FOLD_BUT_CALL_PROB) {
      return { kind: 'CALL', amount: state.currentBet };
    }
    return { kind: 'FOLD', amount: 0 };
  }

  // ---- ブレ（決めた後に1段だけゆるく／かたく） ----
  // FOLD→CALL、CALL→RAISE(legalなら) はゆるく側。RAISE→CALL、BET→CHECK はかたく側。
  function applyWobble(action, state, player, toCall) {
    var W = PK.CONFIG.AI.WOBBLE;

    if (Math.random() < W.LOOSEN_PROB) {
      if (action.kind === 'FOLD') {
        return { kind: 'CALL', amount: state.currentBet };
      }
      if (action.kind === 'CALL') {
        var canRaise = player.stack > (toCall + state.minRaise);
        if (canRaise) {
          // ブレでの引き上げ幅は仕様に数式が無いため、最小合法レイズ幅を使う
          return { kind: 'RAISE', amount: state.currentBet + state.minRaise };
        }
      }
      return action;
    }

    if (Math.random() < W.TIGHTEN_PROB) {
      if (action.kind === 'RAISE') {
        return { kind: 'CALL', amount: state.currentBet };
      }
      if (action.kind === 'BET') {
        return { kind: 'CHECK', amount: player.betThisRound };
      }
    }
    return action;
  }

  // ---- 最終調整（BET/RAISEの合計がstack以上ならALLINへ。RAISEがlegalに無ければCALLへ） ----
  function finalizeAmount(action, player, state, toCall) {
    var BB = PK.CONFIG.BB;
    if (action.kind === 'BET' || action.kind === 'RAISE') {
      var maxTotal = player.betThisRound + player.stack;
      if (action.amount >= maxTotal) {
        return { kind: 'ALLIN', amount: maxTotal };
      }
      if (action.kind === 'RAISE' && !(player.stack > toCall + state.minRaise)) {
        return { kind: 'CALL', amount: state.currentBet };
      }
      if (action.kind === 'BET' && !(player.stack > BB)) {
        return { kind: 'CHECK', amount: player.betThisRound };
      }
    }
    return action;
  }

  // ---- decide(seat, state) ----
  PK.AI.decide = function (seat, state) {
    var player = state.players[seat];
    var toCall = state.currentBet - player.betThisRound;
    var aggr = PK.CONFIG.AGGR[seat]; // 上限はここでなく確率側にかける

    var action;
    if (state.street === 'preflop') {
      action = decidePreflop(seat, state, player, toCall);
    } else {
      action = decidePostflop(seat, state, player, toCall, aggr);
    }

    action = applyWobble(action, state, player, toCall);
    action = finalizeAmount(action, player, state, toCall);
    return action;
  };

})();
