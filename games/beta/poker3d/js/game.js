window.PK = window.PK || {};
PK.Game = {};

(function () {
  'use strict';

  var state = null;

  function pname(seat) { return state.players[seat].name; }

  // seat の次(時計回り)から見て、最初に「stack>0 または今ハンドで参加中(!folded)」の席
  function nextSeat(s) {
    for (var k = 1; k <= 4; k++) {
      var i = (s + k) % 4;
      var p = state.players[i];
      if (p.stack > 0 || !p.folded) return i;
    }
    return (s + 1) % 4;
  }

  // seat の次(時計回り)から見て、最初の「!folded && !allIn」の席。無ければ -1
  function nextLive(s) {
    for (var k = 1; k <= 4; k++) {
      var i = (s + k) % 4;
      var p = state.players[i];
      if (!p.folded && !p.allIn) return i;
    }
    return -1;
  }

  function pickNextToAct(fromSeat) {
    for (var k = 1; k <= 4; k++) {
      var i = (fromSeat + k) % 4;
      if (state.needToAct.has(i)) return i;
    }
    return -1;
  }

  function delay(ms) {
    clearTimeout(state.timer);
    state.timer = setTimeout(PK.Game.next, ms);
  }

  function postBet(seat, amt) {
    var p = state.players[seat];
    var pay = Math.min(amt, p.stack);
    p.stack -= pay;
    p.betThisRound += pay;
    p.totalContrib += pay;
    state.pot += pay;
    PK.Scene.setBet(seat, p.betThisRound);
    PK.Scene.setStack(seat, p.stack);
    PK.Scene.setPot(state.pot);
    if (p.stack === 0) {
      p.allIn = true;
      emit('allin', { seat: seat });
    }
  }

  function triggerCutin(name, data) {
    if (name === 'allin') {
      PK.UI.cutin('ALLIN', 'ALL IN!');
    } else if (name === 'win_uncontested') {
      if (data.seat === 0) PK.UI.cutin('WIN', 'YOU WIN');
    } else if (name === 'showdown') {
      var iWon = data.winners.some(function (w) { return w.seat === 0; });
      if (iWon) {
        var r = data.results[0];
        if (r && r.cat >= 7) PK.UI.cutin('HAND', r.name);
        else PK.UI.cutin('WIN', 'YOU WIN');
      }
    }
  }

  function buildMessage(name, data) {
    switch (name) {
      case 'action': {
        var nm = pname(data.seat);
        switch (data.kind) {
          case 'FOLD': return nm + ' フォールド';
          case 'CHECK': return nm + ' チェック';
          case 'CALL': return nm + ' コール';
          case 'BET': return nm + ' が ' + data.amount + ' にベット';
          case 'RAISE': return nm + ' が ' + data.amount + ' にレイズ';
          case 'ALLIN': return nm + ' オールイン';
        }
        return null;
      }
      case 'win_uncontested':
        return pname(data.seat) + 'の勝ち +' + data.amount;
      case 'showdown':
        return data.winners.map(function (w) {
          return pname(w.seat) + 'の勝ち +' + w.amount;
        }).join(' / ');
      case 'refund':
        return pname(data.seat) + ' に ' + data.amount + ' 戻り';
      case 'rebuy':
        return pname(data.seat) + ' に ' + PK.CONFIG.START_STACK + ' 補充';
      case 'gameover':
        return 'ゲームオーバー';
      default:
        return null;
    }
  }

  function emit(name, data) {
    PK.UI.refresh(state);
    var text = buildMessage(name, data);
    if (text) PK.UI.message(text);
    triggerCutin(name, data);
    if (PK.Tutorial.active && PK.Tutorial.onEvent(name, data) === 'hold') {
      state.hold = true;
    }
  }
  PK.Game.emit = emit;

  // ---- newGame / startHand -------------------------------------------------

  PK.Game.newGame = function () {
    state = {
      phase: 'idle', street: 'preflop', handNo: 0, dealer: 2, sb: -1, bb: -1,
      deck: [], board: [], pot: 0, currentBet: 0, minRaise: PK.CONFIG.BB,
      toAct: -1, needToAct: new Set(), hold: false, script: null, timer: null,
      players: [0, 1, 2, 3].map(function (i) {
        return {
          seat: i, name: PK.CONFIG.NAMES[i], isHuman: i === 0,
          stack: PK.CONFIG.START_STACK, hole: [], folded: false, allIn: false,
          betThisRound: 0, totalContrib: 0
        };
      })
    };
    PK.Game.state = state;
    PK.Scene.clearTable();
    for (var i = 0; i < 4; i++) {
      PK.Scene.setStack(i, state.players[i].stack);
      PK.Scene.setBet(i, 0);
    }
    PK.Scene.setPot(0);
    PK.UI.refresh(state);
  };

  PK.Game.startHand = function (script) {
    var i, p;
    for (i = 0; i < 4; i++) {
      p = state.players[i];
      p.folded = false; p.allIn = false; p.betThisRound = 0; p.totalContrib = 0; p.hole = [];
    }
    for (i = 0; i < 4; i++) {
      p = state.players[i];
      if (!p.isHuman && p.stack === 0) {
        p.stack = PK.CONFIG.START_STACK;
        emit('rebuy', { seat: p.seat });
      }
    }
    state.dealer = script ? script.dealer : nextSeat(state.dealer);
    state.deck = script ? PK.Cards.buildScriptedDeck(script) : PK.Cards.shuffle(PK.Cards.makeDeck());
    state.handNo += 1;
    state.board = [];
    state.pot = 0;
    PK.Scene.clearTable();
    PK.Scene.setDealerButton(state.dealer);

    var sb = nextSeat(state.dealer);
    var bb = nextSeat(sb);
    state.sb = sb;
    state.bb = bb;
    postBet(sb, PK.CONFIG.SB);
    postBet(bb, PK.CONFIG.BB);

    var s = sb;
    for (var round = 0; round < 2; round++) {
      for (var k = 0; k < 4; k++) {
        var pl = state.players[s];
        pl.hole.push(state.deck.pop());
        PK.Scene.setHole(s, pl.hole, s === 0);
        s = nextSeat(s);
      }
    }

    state.street = 'preflop';
    state.currentBet = PK.CONFIG.BB;
    state.minRaise = PK.CONFIG.BB;
    state.needToAct = new Set(state.players.filter(function (pl) { return !pl.folded && !pl.allIn; }).map(function (pl) { return pl.seat; }));
    state.toAct = nextLive(bb);
    state.phase = 'hand_start';
    state.script = script || null;

    emit('hand_start', { handNo: state.handNo, dealer: state.dealer, sb: sb, bb: bb });
    delay(1300);
  };

  // ---- next() の分岐 --------------------------------------------------------

  PK.Game.next = function () {
    if (state.hold) return;
    switch (state.phase) {
      case 'hand_start':
        emit('dealt', {});
        state.phase = 'betting';
        if (!state.hold) PK.Game.next();
        break;
      case 'betting':
        handleBetting();
        break;
      case 'wait_human':
        break;
      case 'runout':
        handleRunout();
        break;
      case 'showdown':
        PK.Game.showdown();
        state.phase = 'hand_end';
        delay(PK.CONFIG.SHOWDOWN_HOLD_MS);
        break;
      case 'hand_end':
        handleHandEnd();
        break;
      case 'gameover':
        break;
      default:
        break;
    }
  };

  function handleBetting() {
    var aliveCount = state.players.filter(function (p) { return !p.folded; }).length;
    if (aliveCount === 1) {
      var survivor = state.players.filter(function (p) { return !p.folded; })[0];
      var amount = state.pot;
      survivor.stack += amount;
      PK.Scene.setStack(survivor.seat, survivor.stack);
      state.pot = 0;
      PK.Scene.setPot(0);
      state.phase = 'hand_end';
      emit('win_uncontested', { seat: survivor.seat, amount: amount });
      delay(PK.CONFIG.SHOWDOWN_HOLD_MS);
      return;
    }
    if (PK.Game.roundOver()) {
      PK.Game.advanceStreet();
      return;
    }
    var seat = state.toAct;
    var p = state.players[seat];
    if (p.isHuman) {
      state.phase = 'wait_human';
      var toCall = state.currentBet - p.betThisRound;
      var legal = PK.Game.legalActions();
      emit('your_turn', { street: state.street, toCall: toCall, legal: legal });
      if (!state.hold) {
        PK.UI.showActions(legal, PK.Tutorial.allowed());
      }
    } else {
      var forced = PK.Tutorial.active ? PK.Tutorial.forcedCpuAction(seat, state.street) : null;
      var decision = forced || PK.AI.decide(seat, state);
      PK.Game.act(seat, decision);
      delay(PK.CONFIG.CPU_DELAY_MS);
    }
  }

  function handleRunout() {
    if (state.board.length < 5) {
      var n = state.board.length === 0 ? 3 : 1;
      for (var i = 0; i < n; i++) state.board.push(state.deck.pop());
      PK.Scene.setBoard(state.board);
      state.street = state.board.length === 3 ? 'flop' : (state.board.length === 4 ? 'turn' : 'river');
      emit('street', { street: state.street });
      delay(PK.CONFIG.RUNOUT_PAUSE_MS);
    } else {
      state.phase = 'showdown';
      PK.Game.next();
    }
  }

  function handleHandEnd() {
    var human = state.players[0];
    if (human.stack === 0) {
      state.phase = 'gameover';
      emit('gameover', {});
      return;
    }
    if (PK.Tutorial.active) {
      emit('hand_end', {});
      return;
    }
    PK.Game.startHand(null);
  }

  // ---- 行動 ------------------------------------------------------------

  PK.Game.roundOver = function () {
    return state.needToAct.size === 0;
  };

  PK.Game.legalActions = function () {
    var seat = state.toAct;
    var p = state.players[seat];
    var toCall = state.currentBet - p.betThisRound;
    if (toCall === 0) {
      var arr0 = ['CHECK'];
      if (p.stack > PK.CONFIG.BB) arr0.push('BET');
      arr0.push('ALLIN');
      return arr0;
    }
    var arr = ['FOLD', 'CALL'];
    if (p.stack > toCall + state.minRaise) arr.push('RAISE');
    arr.push('ALLIN');
    return arr;
  };

  PK.Game.act = function (seat, action) {
    var p = state.players[seat];
    var toCall = state.currentBet - p.betThisRound;
    var kind = action.kind;
    var amount = action.amount;

    if (kind === 'FOLD') {
      p.folded = true;
      state.needToAct.delete(seat);
      PK.Scene.setHole(seat, [], false);
    } else if (kind === 'CHECK') {
      state.needToAct.delete(seat);
    } else if (kind === 'CALL') {
      postBet(seat, toCall);
      state.needToAct.delete(seat);
      amount = p.betThisRound;
    } else if (kind === 'BET') {
      postBet(seat, amount - p.betThisRound);
      state.currentBet = amount;
      state.minRaise = amount;
      state.needToAct = new Set(state.players.filter(function (pl) { return pl.seat !== seat && !pl.folded && !pl.allIn; }).map(function (pl) { return pl.seat; }));
    } else if (kind === 'RAISE') {
      var oldCurrent = state.currentBet;
      postBet(seat, amount - p.betThisRound);
      state.minRaise = amount - oldCurrent;
      state.currentBet = amount;
      state.needToAct = new Set(state.players.filter(function (pl) { return pl.seat !== seat && !pl.folded && !pl.allIn; }).map(function (pl) { return pl.seat; }));
    } else if (kind === 'ALLIN') {
      postBet(seat, p.stack);
      amount = p.betThisRound;
      if (p.betThisRound > state.currentBet) {
        var oldCurrent2 = state.currentBet;
        state.minRaise = Math.max(state.minRaise, p.betThisRound - oldCurrent2);
        state.currentBet = p.betThisRound;
        state.needToAct = new Set(state.players.filter(function (pl) { return pl.seat !== seat && !pl.folded && !pl.allIn; }).map(function (pl) { return pl.seat; }));
      } else {
        state.needToAct.delete(seat);
      }
    }

    emit('action', { seat: seat, kind: kind, amount: amount });
    state.toAct = pickNextToAct(seat);
    state.phase = 'betting';
  };

  PK.Game.humanAction = function (action) {
    if (state.phase !== 'wait_human') return;
    var legal = PK.Game.legalActions();
    if (legal.indexOf(action.kind) === -1) return;
    var allow = PK.Tutorial.allowed();
    if (allow && allow.indexOf(action.kind) === -1) return;
    PK.UI.hideActions();
    PK.Game.act(0, action);
    PK.Game.next();
  };

  PK.Game.advanceStreet = function () {
    var i;
    for (i = 0; i < 4; i++) {
      state.players[i].betThisRound = 0;
      PK.Scene.setBet(i, 0);
    }
    state.currentBet = 0;
    state.minRaise = PK.CONFIG.BB;

    var liveCount = state.players.filter(function (p) { return !p.folded && !p.allIn; }).length;
    if (liveCount <= 1) {
      state.phase = 'runout';
      emit('runout', {});
      PK.Game.next();
      return;
    }

    if (state.street === 'preflop') {
      state.board.push(state.deck.pop(), state.deck.pop(), state.deck.pop());
      state.street = 'flop';
    } else if (state.street === 'flop') {
      state.board.push(state.deck.pop());
      state.street = 'turn';
    } else if (state.street === 'turn') {
      state.board.push(state.deck.pop());
      state.street = 'river';
    } else if (state.street === 'river') {
      state.phase = 'showdown';
      PK.Game.next();
      return;
    }

    PK.Scene.setBoard(state.board);
    state.toAct = nextLive(state.dealer);
    state.needToAct = new Set(state.players.filter(function (p) { return !p.folded && !p.allIn; }).map(function (p) { return p.seat; }));
    emit('street', { street: state.street });
    delay(PK.CONFIG.STREET_PAUSE_MS);
  };

  // ---- ショーダウン ------------------------------------------------------

  PK.Game.buildPots = function () {
    var rem = state.players.map(function (p) { return p.totalContrib; });
    var pots = [];
    while (rem.reduce(function (a, b) { return a + b; }, 0) > 0) {
      var live = [];
      for (var p = 0; p < 4; p++) {
        if (!state.players[p].folded && rem[p] > 0) live.push(p);
      }
      if (live.length === 0) {
        var total = rem.reduce(function (a, b) { return a + b; }, 0);
        pots[pots.length - 1].amount += total;
        for (var q = 0; q < 4; q++) rem[q] = 0;
        break;
      }
      var level = Math.min.apply(null, live.map(function (p) { return rem[p]; }));
      var amt = 0;
      for (var r = 0; r < 4; r++) {
        var cut = Math.min(rem[r], level);
        amt += cut;
        rem[r] -= cut;
      }
      pots.push({ amount: amt, eligible: live.slice() });
    }
    return pots;
  };

  PK.Game.showdown = function () {
    var results = {};
    state.players.forEach(function (p) {
      if (!p.folded) {
        PK.Scene.setHole(p.seat, p.hole, true);
        results[p.seat] = PK.Eval.best7(p.hole.concat(state.board));
      }
    });

    var pots = PK.Game.buildPots();
    var wonMap = new Map();
    var start = (state.dealer + 1) % 4;

    pots.forEach(function (pot) {
      if (pot.eligible.length === 1) {
        var soleSeat = pot.eligible[0];
        state.players[soleSeat].stack += pot.amount;
        PK.Scene.setStack(soleSeat, state.players[soleSeat].stack);
        emit('refund', { seat: soleSeat, amount: pot.amount });
        return;
      }
      var winners = [pot.eligible[0]];
      for (var i = 1; i < pot.eligible.length; i++) {
        var sSeat = pot.eligible[i];
        var cmp = PK.Eval.compare(results[sSeat], results[winners[0]]);
        if (cmp > 0) winners = [sSeat];
        else if (cmp === 0) winners.push(sSeat);
      }
      var share = Math.floor(pot.amount / winners.length);
      var remainder = pot.amount - share * winners.length;
      var order = winners.slice().sort(function (a, b) {
        return ((a - start + 4) % 4) - ((b - start + 4) % 4);
      });
      winners.forEach(function (wSeat) {
        state.players[wSeat].stack += share;
        PK.Scene.setStack(wSeat, state.players[wSeat].stack);
        wonMap.set(wSeat, (wonMap.get(wSeat) || 0) + share);
      });
      if (remainder > 0) {
        var firstSeat = order[0];
        state.players[firstSeat].stack += remainder;
        PK.Scene.setStack(firstSeat, state.players[firstSeat].stack);
        wonMap.set(firstSeat, (wonMap.get(firstSeat) || 0) + remainder);
      }
    });

    PK.Scene.setPot(0);
    var winnersOut = Array.from(wonMap.entries()).map(function (entry) {
      return { seat: entry[0], amount: entry[1], handName: PK.Eval.name(results[entry[0]]) };
    });
    emit('showdown', { winners: winnersOut, results: results });
  };

  PK.Game.resume = function () {
    state.hold = false;
    if (state.phase === 'wait_human') {
      PK.UI.showActions(PK.Game.legalActions(), PK.Tutorial.allowed());
    } else {
      PK.Game.next();
    }
  };

  PK.Game.delay = delay;

  // main.js の Z キー(「ハンド終了の待ちを飛ばす」§7)から使う補助。
  // hand_end で保留中の delay() タイマーを止め、next() を即実行する。
  PK.Game.skipWait = function () {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
      PK.Game.next();
    }
  };
})();
