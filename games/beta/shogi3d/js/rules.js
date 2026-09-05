var SG = (typeof window !== 'undefined') ? (window.SG = window.SG || {}) : (global.SG = global.SG || {});

(function () {

  var HAND_TYPES = ['R', 'B', 'G', 'S', 'N', 'L', 'P'];
  var PIECE_LETTERS = 'KRBGSNLP';

  function inBounds(r, c) {
    return r >= 0 && r <= 8 && c >= 0 && c <= 8;
  }

  function handOrder() {
    if (SG.CONFIG && SG.CONFIG.HAND_ORDER) return SG.CONFIG.HAND_ORDER;
    return HAND_TYPES;
  }

  function emptyHands() {
    var hands = [{}, {}];
    for (var o = 0; o < 2; o++) {
      for (var i = 0; i < HAND_TYPES.length; i++) hands[o][HAND_TYPES[i]] = 0;
    }
    return hands;
  }

  function goldSteps(f) {
    return [[f, -1], [f, 0], [f, 1], [0, -1], [0, 1], [-f, 0]];
  }

  // §3.1 駒の動き。t=駒種, p=成っているか, o=手番(0=先手,1=後手)
  function movesFor(t, p, o) {
    var f = (o === 0) ? -1 : 1;
    switch (t) {
      case 'P':
        if (!p) return { steps: [[f, 0]], slides: [] };
        return { steps: goldSteps(f), slides: [] };
      case 'L':
        if (!p) return { steps: [], slides: [[f, 0]] };
        return { steps: goldSteps(f), slides: [] };
      case 'N':
        if (!p) return { steps: [[2 * f, -1], [2 * f, 1]], slides: [] };
        return { steps: goldSteps(f), slides: [] };
      case 'S':
        if (!p) return { steps: [[f, -1], [f, 0], [f, 1], [-f, -1], [-f, 1]], slides: [] };
        return { steps: goldSteps(f), slides: [] };
      case 'G':
        return { steps: goldSteps(f), slides: [] };
      case 'K':
        return { steps: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]], slides: [] };
      case 'R':
        if (!p) return { steps: [], slides: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
        return { steps: [[1, 1], [1, -1], [-1, 1], [-1, -1]], slides: [[1, 0], [-1, 0], [0, 1], [0, -1]] };
      case 'B':
        if (!p) return { steps: [], slides: [[1, 1], [1, -1], [-1, 1], [-1, -1]] };
        return { steps: [[1, 0], [-1, 0], [0, 1], [0, -1]], slides: [[1, 1], [1, -1], [-1, 1], [-1, -1]] };
      default:
        return { steps: [], slides: [] };
    }
  }

  function inEnemyZone(turn, r) {
    return (turn === 0) ? (r >= 0 && r <= 2) : (r >= 6 && r <= 8);
  }
  function isFinalRank(turn, r) {
    return (turn === 0) ? (r === 0) : (r === 8);
  }
  function isFinal2Ranks(turn, r) {
    return (turn === 0) ? (r === 0 || r === 1) : (r === 7 || r === 8);
  }

  function sq(rc) {
    return String(9 - rc.c) + 'abcdefghi'.charAt(rc.r);
  }

  SG.Rules = {};

  SG.Rules.empty = function () {
    var board = [];
    for (var r = 0; r < 9; r++) {
      var row = [];
      for (var c = 0; c < 9; c++) row.push(null);
      board.push(row);
    }
    return { board: board, hands: emptyHands(), turn: 0 };
  };

  SG.Rules.at = function (pos, r, c) {
    try {
      if (!pos || !pos.board) return null;
      if (r < 0 || r > 8 || c < 0 || c > 8) return null;
      var row = pos.board[r];
      if (!row) return null;
      var v = row[c];
      return (v === undefined) ? null : v;
    } catch (e) {
      return null;
    }
  };

  SG.Rules.clone = function (pos) {
    var board = new Array(9);
    for (var r = 0; r < 9; r++) board[r] = pos.board[r].slice();
    var hands = [{}, {}];
    for (var o = 0; o < 2; o++) {
      for (var i = 0; i < HAND_TYPES.length; i++) {
        var t = HAND_TYPES[i];
        hands[o][t] = (pos.hands[o] && pos.hands[o][t]) || 0;
      }
    }
    return { board: board, hands: hands, turn: pos.turn };
  };

  SG.Rules.fromSfen = function (s) {
    try {
      if (typeof s !== 'string') return null;
      var parts = s.trim().split(/\s+/);
      if (parts.length !== 4) return null;
      var boardPart = parts[0], turnPart = parts[1], handsPart = parts[2];

      var ranks = boardPart.split('/');
      if (ranks.length !== 9) return null;

      var board = [];
      for (var r = 0; r < 9; r++) {
        var rankStr = ranks[r];
        var row = [];
        var pending = false;
        for (var i = 0; i < rankStr.length; i++) {
          var ch = rankStr.charAt(i);
          if (ch === '+') {
            if (pending) return null;
            pending = true;
            continue;
          }
          if (ch >= '1' && ch <= '9') {
            if (pending) return null;
            var n = parseInt(ch, 10);
            for (var k = 0; k < n; k++) row.push(null);
            continue;
          }
          var upper = ch.toUpperCase();
          if (PIECE_LETTERS.indexOf(upper) === -1) return null;
          var owner = (ch === upper) ? 0 : 1;
          row.push({ t: upper, o: owner, p: pending });
          pending = false;
        }
        if (pending) return null;
        if (row.length !== 9) return null;
        board.push(row);
      }

      var turn;
      if (turnPart === 'b') turn = 0;
      else if (turnPart === 'w') turn = 1;
      else return null;

      var hands = emptyHands();
      if (handsPart !== '-') {
        var re = /(\d*)([A-Za-z])/g;
        var m2, matched = 0;
        while ((m2 = re.exec(handsPart)) !== null) {
          matched += m2[0].length;
          var cnt = m2[1] ? parseInt(m2[1], 10) : 1;
          var letter = m2[2];
          var upper2 = letter.toUpperCase();
          if (HAND_TYPES.indexOf(upper2) === -1) return null;
          var owner2 = (letter === upper2) ? 0 : 1;
          hands[owner2][upper2] += cnt;
        }
        if (matched !== handsPart.length) return null;
      }

      return { board: board, hands: hands, turn: turn };
    } catch (e) {
      return null;
    }
  };

  SG.Rules.toSfen = function (pos) {
    var rows = [];
    for (var r = 0; r < 9; r++) {
      var line = '';
      var emptyCount = 0;
      for (var c = 0; c < 9; c++) {
        var piece = SG.Rules.at(pos, r, c);
        if (!piece) { emptyCount++; continue; }
        if (emptyCount > 0) { line += String(emptyCount); emptyCount = 0; }
        if (piece.p) line += '+';
        line += (piece.o === 0) ? piece.t.toUpperCase() : piece.t.toLowerCase();
      }
      if (emptyCount > 0) line += String(emptyCount);
      rows.push(line);
    }
    var boardStr = rows.join('/');
    var turnStr = (pos.turn === 0) ? 'b' : 'w';
    var order = handOrder();
    var handParts = [];
    for (var o = 0; o < 2; o++) {
      for (var i = 0; i < order.length; i++) {
        var t = order[i];
        var cnt = (pos.hands[o] && pos.hands[o][t]) || 0;
        if (cnt > 0) {
          var letter = (o === 0) ? t.toUpperCase() : t.toLowerCase();
          handParts.push((cnt > 1 ? String(cnt) : '') + letter);
        }
      }
    }
    var handStr = handParts.length ? handParts.join('') : '-';
    return boardStr + ' ' + turnStr + ' ' + handStr + ' 1';
  };

  SG.Rules.initial = function () {
    return SG.Rules.fromSfen('lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1');
  };

  SG.Rules.findKing = function (pos, o) {
    try {
      for (var r = 0; r < 9; r++) {
        for (var c = 0; c < 9; c++) {
          var piece = SG.Rules.at(pos, r, c);
          if (piece && piece.t === 'K' && piece.o === o) return { r: r, c: c };
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  SG.Rules.rawTargets = function (pos, r, c) {
    var out = [];
    var piece = SG.Rules.at(pos, r, c);
    if (!piece) return out;
    var mv = movesFor(piece.t, piece.p, piece.o);
    var i, dr, dc, nr, nc;
    for (i = 0; i < mv.steps.length; i++) {
      dr = mv.steps[i][0]; dc = mv.steps[i][1];
      nr = r + dr; nc = c + dc;
      if (inBounds(nr, nc)) out.push({ r: nr, c: nc });
    }
    for (i = 0; i < mv.slides.length; i++) {
      dr = mv.slides[i][0]; dc = mv.slides[i][1];
      nr = r + dr; nc = c + dc;
      while (inBounds(nr, nc)) {
        out.push({ r: nr, c: nc });
        if (SG.Rules.at(pos, nr, nc) !== null) break;
        nr += dr; nc += dc;
      }
    }
    return out;
  };

  function boardMoveTargets(pos, r, c, piece) {
    var raw = SG.Rules.rawTargets(pos, r, c);
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var occ = SG.Rules.at(pos, raw[i].r, raw[i].c);
      if (!occ || occ.o !== piece.o) out.push(raw[i]);
    }
    return out;
  }

  SG.Rules.isAttacked = function (pos, r, c, by) {
    try {
      for (var pr = 0; pr < 9; pr++) {
        for (var pc = 0; pc < 9; pc++) {
          var piece = SG.Rules.at(pos, pr, pc);
          if (!piece || piece.o !== by) continue;
          var targets = SG.Rules.rawTargets(pos, pr, pc);
          for (var i = 0; i < targets.length; i++) {
            if (targets[i].r === r && targets[i].c === c) return true;
          }
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  SG.Rules.inCheck = function (pos, o) {
    var king = SG.Rules.findKing(pos, o);
    if (!king) {
      console.warn('inCheck: king not found for o=' + o);
      return false;
    }
    return SG.Rules.isAttacked(pos, king.r, king.c, 1 - o);
  };

  SG.Rules.pseudoMoves = function (pos) {
    var list = [];
    var turn = pos.turn;
    var r, c;

    for (r = 0; r < 9; r++) {
      for (c = 0; c < 9; c++) {
        var piece = SG.Rules.at(pos, r, c);
        if (!piece || piece.o !== turn) continue;
        var targets = boardMoveTargets(pos, r, c, piece);
        for (var i = 0; i < targets.length; i++) {
          var to = targets[i];
          var canPromote = (piece.t === 'R' || piece.t === 'B' || piece.t === 'S' || piece.t === 'N' || piece.t === 'L' || piece.t === 'P') &&
            piece.p === false && (inEnemyZone(turn, r) || inEnemyZone(turn, to.r));
          var mustPromote = ((piece.t === 'P' || piece.t === 'L') && isFinalRank(turn, to.r)) ||
            (piece.t === 'N' && isFinal2Ranks(turn, to.r));
          if (canPromote) {
            list.push({ from: { r: r, c: c }, to: { r: to.r, c: to.c }, drop: null, promote: true });
            if (!mustPromote) list.push({ from: { r: r, c: c }, to: { r: to.r, c: to.c }, drop: null, promote: false });
          } else {
            list.push({ from: { r: r, c: c }, to: { r: to.r, c: to.c }, drop: null, promote: false });
          }
        }
      }
    }

    var order = handOrder();
    for (var oi = 0; oi < order.length; oi++) {
      var t = order[oi];
      var count = (pos.hands[turn] && pos.hands[turn][t]) || 0;
      if (count <= 0) continue;
      for (r = 0; r < 9; r++) {
        for (c = 0; c < 9; c++) {
          if (SG.Rules.at(pos, r, c) !== null) continue;
          if ((t === 'P' || t === 'L') && isFinalRank(turn, r)) continue;
          if (t === 'N' && isFinal2Ranks(turn, r)) continue;
          if (t === 'P') {
            var nifu = false;
            for (var rr = 0; rr < 9; rr++) {
              var p2 = SG.Rules.at(pos, rr, c);
              if (p2 && p2.o === turn && p2.t === 'P' && p2.p === false) { nifu = true; break; }
            }
            if (nifu) continue;
          }
          list.push({ from: null, to: { r: r, c: c }, drop: t, promote: false });
        }
      }
    }

    return list;
  };

  SG.Rules.apply = function (pos, m) {
    var q = SG.Rules.clone(pos);
    if (m.drop) {
      q.hands[pos.turn][m.drop] = ((q.hands[pos.turn] && q.hands[pos.turn][m.drop]) || 0) - 1;
      q.board[m.to.r][m.to.c] = { t: m.drop, o: pos.turn, p: false };
    } else {
      var piece = q.board[m.from.r][m.from.c];
      var cap = q.board[m.to.r][m.to.c];
      q.board[m.from.r][m.from.c] = null;
      if (cap && cap.t !== 'K') {
        q.hands[pos.turn][cap.t] = ((q.hands[pos.turn] && q.hands[pos.turn][cap.t]) || 0) + 1;
      }
      q.board[m.to.r][m.to.c] = { t: piece.t, o: piece.o, p: (piece.p || !!m.promote) };
    }
    q.turn = 1 - pos.turn;
    return q;
  };

  SG.Rules.legalMoves = function (pos, depth) {
    depth = (typeof depth === 'number') ? depth : 0;
    var list = [];
    var pseudos = SG.Rules.pseudoMoves(pos);
    for (var i = 0; i < pseudos.length; i++) {
      var m = pseudos[i];
      var after = SG.Rules.apply(pos, m);
      if (SG.Rules.inCheck(after, pos.turn)) continue;
      if (m.drop === 'P' && depth < 2 && SG.Rules.inCheck(after, 1 - pos.turn)) {
        var follow = SG.Rules.legalMoves(after, depth + 1);
        if (follow.length === 0) continue;
      }
      list.push(m);
    }
    return list;
  };

  SG.Rules.status = function (pos) {
    try {
      var king = SG.Rules.findKing(pos, pos.turn);
      if (!king) return { over: true, loser: pos.turn, check: false };
      var moves = SG.Rules.legalMoves(pos);
      var over = moves.length === 0;
      var loser = over ? pos.turn : null;
      var check = SG.Rules.inCheck(pos, pos.turn);
      return { over: over, loser: loser, check: check };
    } catch (e) {
      console.error(e);
      return { over: true, loser: pos.turn, check: false };
    }
  };

  SG.Rules.moveToStr = function (m) {
    if (m.drop) return m.drop + '*' + sq(m.to);
    return sq(m.from) + sq(m.to) + (m.promote ? '+' : '');
  };

  SG.Rules.strToMove = function (pos, s) {
    var moves = SG.Rules.legalMoves(pos);
    for (var i = 0; i < moves.length; i++) {
      if (SG.Rules.moveToStr(moves[i]) === s) return moves[i];
    }
    return null;
  };

  SG.Rules.perft = function (pos, d) {
    if (d <= 0) return 1;
    var moves = SG.Rules.legalMoves(pos);
    if (d === 1) return moves.length;
    var total = 0;
    for (var i = 0; i < moves.length; i++) {
      total += SG.Rules.perft(SG.Rules.apply(pos, moves[i]), d - 1);
    }
    return total;
  };

  SG.Rules.countPieces = function (pos) {
    var n = 0;
    for (var r = 0; r < 9; r++) {
      for (var c = 0; c < 9; c++) {
        if (SG.Rules.at(pos, r, c)) n++;
      }
    }
    return n;
  };

})();
