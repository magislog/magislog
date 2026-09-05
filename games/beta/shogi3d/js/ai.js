var SG = (typeof window !== 'undefined') ? (window.SG = window.SG || {}) : (global.SG = global.SG || {});

(function () {

  SG.AI = {};

  // §5 score(pos, m): 大きいほど良い。pos.turn が指す側、1-pos.turn が相手
  SG.AI.score = function (pos, m) {
    try {
      var CFG = SG.CONFIG;
      var Rules = SG.Rules;
      var turn = pos.turn;
      var opp = 1 - turn;
      var s = 0;

      // 取る駒
      var capturedPiece = m.drop ? null : Rules.at(pos, m.to.r, m.to.c);
      if (capturedPiece) {
        var capVal = capturedPiece.p ? CFG.VALUE_PROMOTED[capturedPiece.t] : CFG.VALUE[capturedPiece.t];
        if (typeof capVal !== 'number') capVal = 0;
        s += capVal;
      }

      // 成る
      if (!m.drop && m.promote) {
        var movingPiece = Rules.at(pos, m.from.r, m.from.c);
        if (movingPiece) {
          var baseVal = CFG.VALUE[movingPiece.t];
          var promVal = CFG.VALUE_PROMOTED[movingPiece.t];
          if (typeof baseVal === 'number' && typeof promVal === 'number') {
            s += (promVal - baseVal);
          }
        }
      }

      var after = Rules.apply(pos, m);

      // 取り返される
      if (Rules.isAttacked(after, m.to.r, m.to.c, opp)) {
        var movedType = null, movedPromoted = false;
        if (m.drop) {
          movedType = m.drop;
          movedPromoted = false;
        } else {
          var origPiece = Rules.at(pos, m.from.r, m.from.c);
          if (origPiece) {
            movedType = origPiece.t;
            movedPromoted = origPiece.p || !!m.promote;
          }
        }
        if (movedType) {
          var lossVal = movedPromoted ? CFG.VALUE_PROMOTED[movedType] : CFG.VALUE[movedType];
          if (typeof lossVal !== 'number') lossVal = CFG.VALUE[movedType];
          if (typeof lossVal !== 'number') lossVal = 0;
          s -= lossVal;
        }
      }

      // 王手・詰み
      if (Rules.inCheck(after, opp)) {
        s += 0.5;
        if (Rules.legalMoves(after).length === 0) s += 10000;
      }

      // 玉を前へ出す抑制
      if (!m.drop) {
        var pieceMoved = Rules.at(pos, m.from.r, m.from.c);
        if (pieceMoved && pieceMoved.t === 'K') {
          var forward = (turn === 0) ? (m.to.r < m.from.r) : (m.to.r > m.from.r);
          if (forward) s -= 2;
        }
      }

      return s;
    } catch (e) {
      console.error(e);
      return 0;
    }
  };

  // §5 choose(pos): 全合法手に score+乱数 を付けて最大を選ぶ。例外は投げない
  SG.AI.choose = function (pos) {
    var moves = null;
    try {
      moves = SG.Rules.legalMoves(pos);
      if (!moves || moves.length === 0) return null;
      var best = null;
      var bestScore = -Infinity;
      for (var i = 0; i < moves.length; i++) {
        var m = moves[i];
        var s = SG.AI.score(pos, m) + Math.random();
        if (s > bestScore) { bestScore = s; best = m; }
      }
      return best;
    } catch (e) {
      console.error(e);
      try {
        if (!moves) moves = SG.Rules.legalMoves(pos);
        return (moves && moves.length) ? moves[0] : null;
      } catch (e2) {
        console.error(e2);
        return null;
      }
    }
  };

})();
