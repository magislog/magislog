var IG = (typeof window !== 'undefined') ? (window.IG = window.IG || {}) : (global.IG = global.IG || {});

// IG.Rules — 盤と手の純粋関数。document・window を参照しない（node で検算するため）。
// pos を書き換えず、常に新しい pos を返す。SPEC.md §2〜§4 準拠。

(function () {
  // SIZE は config.js の値を使う（config.js が先に読み込まれる前提。§1）。
  // 万一 CONFIG が無くても止まらないよう 9 にフォールバック（null 保護）。
  var SIZE = (IG.CONFIG && typeof IG.CONFIG.SIZE === 'number') ? IG.CONFIG.SIZE : 9;

  IG.Rules = {};
  IG.Rules.SIZE = SIZE;

  // ---- 2.1 座標 -----------------------------------------------------

  // Rules.at: 範囲外なら例外を出さず null。範囲内なら 0/1/2。
  IG.Rules.at = function (pos, r, c) {
    if (r === null || r === undefined || c === null || c === undefined) return null;
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
    if (!pos || !pos.board || !pos.board[r]) return null;
    var v = pos.board[r][c];
    return (v === undefined) ? null : v;
  };

  // Rules.neighbors: 上下左右のうち盤内にある交点（2〜4 個）。
  IG.Rules.neighbors = function (r, c) {
    var out = [];
    var deltas = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (var i = 0; i < deltas.length; i++) {
      var nr = r + deltas[i][0];
      var nc = c + deltas[i][1];
      if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE) out.push({ r: nr, c: nc });
    }
    return out;
  };

  // Rules.ptToStr: 列文字 + (SIZE - r)
  IG.Rules.ptToStr = function (r, c) {
    try {
      var cols = IG.CONFIG.COLS;
      if (r === null || r === undefined || c === null || c === undefined) return "";
      if (c < 0 || c >= cols.length) return "";
      return cols.charAt(c) + String(SIZE - r);
    } catch (e) {
      return "";
    }
  };

  // Rules.strToPt: 大文字小文字を区別しない。壊れた入力は例外を出さず null。
  IG.Rules.strToPt = function (s) {
    try {
      if (s === null || s === undefined || typeof s !== 'string') return null;
      var t = s.trim();
      if (t.length < 2) return null;
      var colChar = t.charAt(0).toUpperCase();
      var rest = t.slice(1);
      var cols = IG.CONFIG.COLS;
      var c = cols.indexOf(colChar);
      if (c < 0) return null;
      if (!/^[0-9]+$/.test(rest)) return null;
      var num = parseInt(rest, 10);
      var r = SIZE - num;
      if (r < 0 || r >= SIZE) return null;
      return { r: r, c: c };
    } catch (e) {
      return null;
    }
  };

  // ---- 2.2 局面 pos ---------------------------------------------------

  IG.Rules.empty = function () {
    var board = [];
    for (var r = 0; r < SIZE; r++) {
      var row = [];
      for (var c = 0; c < SIZE; c++) row.push(0);
      board.push(row);
    }
    return { board: board, turn: 1, captures: { 1: 0, 2: 0 }, ko: null, passes: 0 };
  };

  // Rules.clone: board は 9 本の配列ごと複製、captures/ko は新しいオブジェクト。元と共有しない。
  IG.Rules.clone = function (pos) {
    var board = [];
    for (var r = 0; r < pos.board.length; r++) board.push(pos.board[r].slice());
    return {
      board: board,
      turn: pos.turn,
      captures: { 1: pos.captures[1], 2: pos.captures[2] },
      ko: pos.ko ? { r: pos.ko.r, c: pos.ko.c } : null,
      passes: pos.passes
    };
  };

  IG.Rules.countStones = function (pos) {
    var out = { 1: 0, 2: 0 };
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var v = pos.board[r][c];
        if (v === 1 || v === 2) out[v] += 1;
      }
    }
    return out;
  };

  // ---- 2.3 局面の文字列 ------------------------------------------------

  // fromText: 壊れた入力は例外を出さず null。呼び出し側が empty() へフォールバックする。
  IG.Rules.fromText = function (s) {
    try {
      if (s === null || s === undefined || typeof s !== 'string') return null;
      var trimmed = s.trim();
      if (trimmed === '') return null;
      var parts = trimmed.split(/\s+/);
      var boardStr = parts[0];
      var turnStr = parts.length > 1 ? parts[1] : 'b';
      var capStr = parts.length > 2 ? parts[2] : '0-0';
      var koStr = parts.length > 3 ? parts[3] : '-';

      var rows = boardStr.split('/');
      if (rows.length !== SIZE) return null;
      var board = [];
      for (var r = 0; r < SIZE; r++) {
        var row = rows[r];
        if (!row || row.length !== SIZE) return null;
        var rowArr = [];
        for (var c = 0; c < SIZE; c++) {
          var ch = row.charAt(c);
          if (ch === '.') rowArr.push(0);
          else if (ch === 'X') rowArr.push(1);
          else if (ch === 'O') rowArr.push(2);
          else return null;
        }
        board.push(rowArr);
      }

      var turn;
      if (turnStr === 'b') turn = 1;
      else if (turnStr === 'w') turn = 2;
      else return null;

      var capMatch = /^([0-9]+)-([0-9]+)$/.exec(capStr);
      if (!capMatch) return null;
      var captures = { 1: parseInt(capMatch[1], 10), 2: parseInt(capMatch[2], 10) };

      var ko = null;
      if (koStr !== '-') {
        var pt = IG.Rules.strToPt(koStr);
        if (pt === null) return null;
        ko = pt;
      }

      return { board: board, turn: turn, captures: captures, ko: ko, passes: 0 };
    } catch (e) {
      return null;
    }
  };

  // toText: 常に 4 要素を出す（fromText の逆変換）。
  IG.Rules.toText = function (pos) {
    var rows = [];
    for (var r = 0; r < SIZE; r++) {
      var row = '';
      for (var c = 0; c < SIZE; c++) {
        var v = pos.board[r][c];
        row += (v === 1) ? 'X' : (v === 2) ? 'O' : '.';
      }
      rows.push(row);
    }
    var boardStr = rows.join('/');
    var turnStr = (pos.turn === 1) ? 'b' : 'w';
    var capStr = pos.captures[1] + '-' + pos.captures[2];
    var koStr = pos.ko ? IG.Rules.ptToStr(pos.ko.r, pos.ko.c) : '-';
    return boardStr + ' ' + turnStr + ' ' + capStr + ' ' + koStr;
  };

  // ---- 2.4 手 move ------------------------------------------------------

  // sameMove: 構造（kind・r・c）で比べる。文字列化しない（§10.5 事故対策）。
  IG.Rules.sameMove = function (a, b) {
    if (a === null || a === undefined || b === null || b === undefined) return false;
    if (a.kind !== b.kind) return false;
    if (a.kind === 'pass') return true;
    if (a.kind === 'play') return a.r === b.r && a.c === b.c;
    return false;
  };

  IG.Rules.parseMove = function (s) {
    try {
      if (s === null || s === undefined || typeof s !== 'string') return null;
      var t = s.trim();
      if (t.toLowerCase() === 'pass') return { kind: 'pass' };
      var pt = IG.Rules.strToPt(t);
      if (pt === null) return null;
      return { kind: 'play', r: pt.r, c: pt.c };
    } catch (e) {
      return null;
    }
  };

  // moveToStr: 表示・console・検算の「表示」にだけ使う。判定に使わない。
  IG.Rules.moveToStr = function (m) {
    if (m === null || m === undefined) return "";
    if (m.kind === 'pass') return "pass";
    if (m.kind === 'play') return IG.Rules.ptToStr(m.r, m.c);
    return "";
  };

  IG.Rules.strToMove = function (pos, s) {
    var m = IG.Rules.parseMove(s);
    if (m === null) return null;
    if (!IG.Rules.isLegal(pos, m)) return null;
    return m;
  };

  // ---- §3 合法手 ----------------------------------------------------------

  // group: 範囲外・空点なら null。石なら幅優先探索で {color, stones, liberties}。
  // 訪問済み・呼吸点の重複排除は r*SIZE+c を鍵にした配列で管理。
  IG.Rules.group = function (pos, r, c) {
    var color = IG.Rules.at(pos, r, c);
    if (color === null || color === 0) return null;

    var visited = new Array(SIZE * SIZE);
    var libSeen = new Array(SIZE * SIZE);
    var stones = [];
    var liberties = [];
    var queue = [{ r: r, c: c }];
    visited[r * SIZE + c] = true;

    while (queue.length) {
      var cur = queue.shift();
      stones.push({ r: cur.r, c: cur.c });
      var nbrs = IG.Rules.neighbors(cur.r, cur.c);
      for (var i = 0; i < nbrs.length; i++) {
        var n = nbrs[i];
        var key = n.r * SIZE + n.c;
        var v = IG.Rules.at(pos, n.r, n.c);
        if (v === 0) {
          if (!libSeen[key]) {
            libSeen[key] = true;
            liberties.push({ r: n.r, c: n.c });
          }
        } else if (v === color) {
          if (!visited[key]) {
            visited[key] = true;
            queue.push({ r: n.r, c: n.c });
          }
        }
      }
    }
    return { color: color, stones: stones, liberties: liberties };
  };

  // apply: 合法性は見ない（isLegal で確かめてから呼ぶ）。引数は書き換えない。
  IG.Rules.apply = function (pos, m) {
    var q = IG.Rules.clone(pos);

    if (m.kind === 'pass') {
      q.ko = null;
      q.passes = pos.passes + 1;
      q.turn = 3 - pos.turn;
      return q;
    }

    var me = pos.turn;
    var opp = 3 - me;
    q.board[m.r][m.c] = me;

    var captured = [];
    var nbrs = IG.Rules.neighbors(m.r, m.c);
    for (var i = 0; i < nbrs.length; i++) {
      var n = nbrs[i];
      if (q.board[n.r][n.c] !== opp) continue; // 既に取って空になった点もここで飛ぶ
      var g = IG.Rules.group(q, n.r, n.c);
      if (g && g.liberties.length === 0) {
        for (var j = 0; j < g.stones.length; j++) {
          var s = g.stones[j];
          q.board[s.r][s.c] = 0;
          captured.push(s);
        }
      }
    }
    q.captures[me] += captured.length;

    var mine = IG.Rules.group(q, m.r, m.c);
    q.ko = (captured.length === 1 && mine.stones.length === 1 && mine.liberties.length === 1)
      ? { r: captured[0].r, c: captured[0].c }
      : null;

    q.passes = 0;
    q.turn = opp;
    return q;
  };

  // illegalReason: 上から順に最初に当たったものを返す。null なら合法。
  IG.Rules.illegalReason = function (pos, m) {
    try {
      if (!m || (m.kind !== 'play' && m.kind !== 'pass')) return 'invalid';
      if (m.kind === 'pass') return null;
      if (IG.Rules.at(pos, m.r, m.c) === null) return 'outside';
      if (IG.Rules.at(pos, m.r, m.c) !== 0) return 'occupied';
      if (pos.ko && pos.ko.r === m.r && pos.ko.c === m.c) return 'ko';
      var after = IG.Rules.apply(pos, m);
      var g = IG.Rules.group(after, m.r, m.c);
      if (g && g.liberties.length === 0) return 'suicide';
      return null;
    } catch (e) {
      console.error(e);
      return 'invalid';
    }
  };

  IG.Rules.isLegal = function (pos, m) {
    return IG.Rules.illegalReason(pos, m) === null;
  };

  IG.Rules.legalPlays = function (pos) {
    var out = [];
    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        var m = { kind: 'play', r: r, c: c };
        if (IG.Rules.isLegal(pos, m)) out.push(m);
      }
    }
    return out;
  };

  IG.Rules.legalMoves = function (pos) {
    var out = IG.Rules.legalPlays(pos);
    out.push({ kind: 'pass' });
    return out;
  };

  // isEye: 空点かつ隣接する全交点が color の石（角は2点・辺は3点で判定。斜めは見ない）。
  IG.Rules.isEye = function (pos, r, c, color) {
    if (IG.Rules.at(pos, r, c) !== 0) return false;
    var nbrs = IG.Rules.neighbors(r, c);
    for (var i = 0; i < nbrs.length; i++) {
      if (IG.Rules.at(pos, nbrs[i].r, nbrs[i].c) !== color) return false;
    }
    return true;
  };

  // ---- §4 終局と地 --------------------------------------------------------

  IG.Rules.status = function (pos) {
    if (pos.passes >= 2) return { over: true, reason: 'passes' };
    return { over: false, reason: null };
  };

  // score: 簡略ルール。盤上に残った石はすべて生きている扱い。地は「囲まれた空点」だけ。
  IG.Rules.score = function (pos) {
    var owner = [];
    var visited = [];
    for (var i = 0; i < SIZE; i++) {
      owner.push(new Array(SIZE).fill(0));
      visited.push(new Array(SIZE).fill(false));
    }
    var terr = { 1: 0, 2: 0 };
    var dame = 0;

    for (var r = 0; r < SIZE; r++) {
      for (var c = 0; c < SIZE; c++) {
        if (pos.board[r][c] !== 0 || visited[r][c]) continue;

        var region = [];
        var touchBlack = false;
        var touchWhite = false;
        var queue = [{ r: r, c: c }];
        visited[r][c] = true;

        while (queue.length) {
          var cur = queue.shift();
          region.push(cur);
          var nbrs = IG.Rules.neighbors(cur.r, cur.c);
          for (var k = 0; k < nbrs.length; k++) {
            var n = nbrs[k];
            var v = pos.board[n.r][n.c];
            if (v === 0) {
              if (!visited[n.r][n.c]) {
                visited[n.r][n.c] = true;
                queue.push({ r: n.r, c: n.c });
              }
            } else if (v === 1) {
              touchBlack = true;
            } else if (v === 2) {
              touchWhite = true;
            }
          }
        }

        if (touchBlack && !touchWhite) {
          terr[1] += region.length;
          for (var a = 0; a < region.length; a++) owner[region[a].r][region[a].c] = 1;
        } else if (touchWhite && !touchBlack) {
          terr[2] += region.length;
          for (var b = 0; b < region.length; b++) owner[region[b].r][region[b].c] = 2;
        } else {
          dame += region.length; // 両方に接する・どちらにも接しない（空の盤）はダメ
        }
      }
    }

    var stones = IG.Rules.countStones(pos);
    var total = {
      1: terr[1] + pos.captures[1],
      2: terr[2] + pos.captures[2] + IG.CONFIG.KOMI
    };
    var winner = (total[1] > total[2]) ? 1 : 2;
    var margin = Math.abs(total[1] - total[2]);

    return {
      terr: terr,
      dame: dame,
      stones: stones,
      captures: { 1: pos.captures[1], 2: pos.captures[2] },
      total: total,
      winner: winner,
      margin: margin,
      owner: owner
    };
  };
})();
