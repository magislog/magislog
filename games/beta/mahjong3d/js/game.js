// MJ.Game — 進行(SPEC.md §4)。担当C。
window.MJ = window.MJ || {};
MJ.Game = {};

(function () {
  'use strict';

  var state = null;

  function pname(seat) { return state.players[seat].name; }

  function nextSeat(s) { return (s + 1) % 4; }
  MJ.Game.nextSeat = nextSeat;

  function seatWind(s) { return (s - state.dealer + 4) % 4; }
  MJ.Game.seatWind = seatWind;

  function delay(ms) {
    clearTimeout(state.timer);
    state.timer = setTimeout(safeNext, ms);
  }
  MJ.Game.delay = delay;

  function tileCode(t) { return MJ.Tiles.code(t.id); }

  function windName(w) { return MJ.CONFIG.WIND_NAMES[w]; }

  // ---- メッセージ ----------------------------------------------------------

  function buildMessage(name, data) {
    switch (name) {
      case 'draw':
        return data.seat === 0 ? 'あなたのツモ' : (pname(data.seat) + ' のツモ');
      case 'discard':
        return pname(data.seat) + ' が ' + MJ.Tiles.code(data.tile.id) + ' を切りました';
      case 'riichi':
        return pname(data.seat) + ' リーチ';
      case 'ron_offer':
        return 'ロンできます！';
      case 'your_turn':
        return 'あなたの番です';
      case 'win':
        if (data.res && data.res.exhaustNoYaku) return pname(data.seat) + ' は役なしで和了できません';
        return pname(data.seat) + ' の ' + (data.from === -1 ? 'ツモ' : ('ロン（' + pname(data.from) + ' から）'));
      case 'exhaust':
        return '流局';
      case 'round_start':
        return '東' + (data.round + 1) + '局';
      case 'round_end':
        return '';
      case 'game_end':
        return '終局';
      default:
        return null;
    }
  }

  function triggerCutin(name, data) {
    if (name === 'riichi') MJ.UI.cutin('RIICHI');
    else if (name === 'win') MJ.UI.cutin(data.from === -1 ? 'TSUMO' : 'RON');
    else if (name === 'exhaust') MJ.UI.cutin('RYUKYOKU');
  }

  function emit(name, data) {
    MJ.UI.refresh(state);
    var text = buildMessage(name, data);
    if (text) MJ.UI.message(text);
    triggerCutin(name, data);
    if (MJ.Tutorial.active && MJ.Tutorial.onEvent(name, data) === 'hold') {
      state.hold = true;
    }
  }
  MJ.Game.emit = emit;

  // ---- newGame / startRound -------------------------------------------------

  MJ.Game.newGame = function () {
    // 終局画面と結果画面をここでも消す。T（最初から）は Tutorial.start() が
    // 導入文を出すだけで startRound をすぐ呼ばないため、startRound 側の
    // 消去だけでは終局画面が導入文の上に残ったままになる
    // （2026-09-04 表ういが実機で確認）。
    if (MJ.UI && MJ.UI.hideFinal) MJ.UI.hideFinal();
    if (MJ.UI && MJ.UI.hideResult) MJ.UI.hideResult();
    state = {
      phase: 'idle', round: 0, dealer: 0, turn: 0, wall: [], drawsLeft: 0,
      doraInd: null, kyotaku: 0, lastDiscard: null, ronCandidates: [],
      hold: false, script: null, timer: null,
      tutorialFlags: { cpuMayWin: true, cpuMayRiichi: true },
      players: [0, 1, 2, 3].map(function (i) {
        return {
          seat: i, name: MJ.CONFIG.NAMES[i], isHuman: i === 0,
          points: MJ.CONFIG.START_POINTS, hand: [], tsumo: null, river: [],
          riichi: false, riichiIndex: -1, riichiPassed: false
        };
      })
    };
    MJ.Game.state = state;
    MJ.Scene.clearTable();
    MJ.UI.refresh(state);
  };

  MJ.Game.startRound = function (script) {
    // 前局の結果画面を必ず消す。closeResult() を通らない経路（チュートリアルが
    // Tutorial.confirm() から局を進める場合）で消え残り、次局の画面に
    // 800x500 の結果パネルが乗ったままになる（2026-09-04 表ういが実機で確認）。
    if (MJ.UI && MJ.UI.hideResult) MJ.UI.hideResult();
    // 終局画面も同様に消す（N フリープレイ / T 最初から で残っていた）
    if (MJ.UI && MJ.UI.hideFinal) MJ.UI.hideFinal();
    var i, p;
    for (i = 0; i < 4; i++) {
      p = state.players[i];
      p.hand = []; p.tsumo = null; p.river = []; p.riichi = false;
      p.riichiIndex = -1; p.riichiPassed = false;
    }
    state.dealer = script ? script.dealer : (state.round % 4);
    state.turn = state.dealer;
    // kyotaku は前局から持ち越し(和了者が取る。流局なら残す)

    state.wall = script ? MJ.Tiles.buildScriptedWall(script) : MJ.Tiles.shuffle(MJ.Tiles.makeWall());
    // wall[5] にドラ表示牌の実体を置く規則(§4.2)。取り出して doraInd とし、山から除く。
    var doraTile = state.wall.splice(5, 1)[0];
    state.doraInd = doraTile;
    state.drawsLeft = MJ.CONFIG.DRAWS_PER_ROUND;

    // 配牌: dealer から時計回りに 4 枚 x 3周 + 1 枚 x 1周
    var s, k, round;
    for (round = 0; round < 3; round++) {
      s = state.dealer;
      for (k = 0; k < 4; k++) {
        for (var n = 0; n < 4; n++) {
          state.players[s].hand.push(state.wall.pop());
        }
        s = nextSeat(s);
      }
    }
    s = state.dealer;
    for (k = 0; k < 4; k++) {
      state.players[s].hand.push(state.wall.pop());
      s = nextSeat(s);
    }
    for (i = 0; i < 4; i++) {
      state.players[i].hand = MJ.Tiles.sortHand(state.players[i].hand);
      MJ.Scene.setHand(i, state.players[i].hand, null, i === 0);
    }

    state.tutorialFlags = script ? script.flags : { cpuMayWin: true, cpuMayRiichi: true };
    MJ.Scene.clearTable();
    MJ.Scene.setDora(state.doraInd.id);
    for (i = 0; i < 4; i++) MJ.Scene.setRiichiStick(i, false);

    state.phase = 'round_start';
    state.script = script || null;
    emit('round_start', { round: state.round, dealer: state.dealer });
    if (state.hold) return;
    delay(MJ.CONFIG.ROUND_START_MS + 52 * MJ.CONFIG.DEAL_GAP_MS);
  };

  // ---- next() の分岐 --------------------------------------------------------

  function safeNext() {
    try {
      MJ.Game.next();
    } catch (e) {
      console.error(e);
      state.hold = false;
      delay(MJ.CONFIG.CPU_DELAY_MS);
    }
  }

  MJ.Game.next = function () {
    if (state.hold) return;
    switch (state.phase) {
      case 'round_start':
        state.phase = 'draw';
        MJ.Game.next();
        break;
      case 'draw':
        handleDraw();
        break;
      case 'cpu_turn':
        handleCpuTurn();
        break;
      case 'wait_human':
      case 'wait_human_riichi':
      case 'wait_ron':
        break;
      case 'round_end':
        break;
      case 'game_end':
        break;
      default:
        break;
    }
  };

  function handleDraw() {
    if (state.drawsLeft === 0) {
      MJ.Game.doExhaust();
      return;
    }
    var p = state.players[state.turn];
    p.tsumo = state.wall.pop();
    state.drawsLeft -= 1;
    MJ.Scene.setHand(state.turn, p.hand, p.tsumo, state.turn === 0);
    emit('draw', { seat: state.turn, tile: p.tsumo });
    // 'draw' はどの台本ステップにも一致しないため hold は立たない想定だが、念のため
    // phase の代入は hold チェックより先に置き、非同期呼び出しだけを hold で止める。
    if (p.isHuman) {
      state.phase = 'wait_human';
      var opts = MJ.Game.humanOptions();
      emit('your_turn', opts);
      if (!state.hold) {
        MJ.UI.showHand(13, null);
        MJ.UI.showActions(opts.actions);
      }
    } else {
      state.phase = 'cpu_turn';
      if (state.hold) return;
      delay(MJ.CONFIG.CPU_DELAY_MS);
    }
  }

  function handleCpuTurn() {
    var seat = state.turn;
    var a = (MJ.Tutorial.active && MJ.Tutorial.forcedCpuAction(seat, state)) || MJ.AI.decide(seat, state);
    if (!a) {
      // 保険: forcedCpuAction/AI どちらも空を返したら止まらないよう安全な打牌にフォールバック
      var p = state.players[seat];
      a = { kind: 'discard', tile: p.tsumo || p.hand[0], riichi: false };
    }
    if (a.kind === 'tsumo') {
      MJ.Game.doWin(seat, null, -1);
    } else {
      MJ.Game.doDiscard(seat, a.tile, !!a.riichi);
    }
  }

  // ---- 打牌 ------------------------------------------------------------

  MJ.Game.doDiscard = function (seat, tile, riichi) {
    var p = state.players[seat];
    var hand14 = p.hand.concat(p.tsumo ? [p.tsumo] : []);
    var idx = -1, i;
    for (i = 0; i < hand14.length; i++) {
      if (hand14[i].uid === tile.uid) { idx = i; break; }
    }
    if (idx === -1) idx = 0; // 保険: 見つからなければ先頭を切る(止まらない優先)
    var discarded = hand14[idx];
    hand14.splice(idx, 1);
    p.hand = MJ.Tiles.sortHand(hand14);
    p.tsumo = null;
    p.river.push(discarded);
    state.lastDiscard = { tile: discarded, from: seat };

    if (riichi) {
      p.riichi = true;
      p.riichiIndex = p.river.length - 1;
      p.points -= MJ.CONFIG.RIICHI_COST;
      state.kyotaku += 1;
      MJ.Scene.setRiichiStick(seat, true);
      emit('riichi', { seat: seat });
      MJ.UI.cutin('RIICHI');
    }
    MJ.Scene.setHand(seat, p.hand, null, seat === 0);
    MJ.Scene.setRiver(seat, p.river);
    emit('discard', { seat: seat, tile: discarded });
    // 注意: ここで if(hold) return; はしない。riichi の emit がチュートリアルの
    // 「riichi:0」ステップに一致して先に hold=true が立つケース(東2)があり、そこで
    // 打ち切ると turn/phase が進まないまま止まる。ronCandidates・turn・phase の同期計算は
    // hold の有無に関わらず必ず進め、非同期(showActions/delay)の直前でだけ hold を見る。
    // js/_NOTES.txt に矛盾として記録済み。

    var order = [nextSeat(seat), nextSeat(nextSeat(seat)), nextSeat(nextSeat(nextSeat(seat)))];
    var candidates = [];
    for (i = 0; i < order.length; i++) {
      if (canRon(order[i], discarded, seat)) candidates.push(order[i]);
    }
    state.ronCandidates = candidates;

    if (candidates.indexOf(0) !== -1) {
      state.phase = 'wait_ron';
      emit('ron_offer', { tile: discarded, from: seat });
      if (state.hold) return;
      MJ.UI.showActions(['RON', 'PASS']);
      return;
    }
    var cpuCandidate = -1;
    if (state.tutorialFlags.cpuMayWin) {
      for (i = 0; i < candidates.length; i++) {
        if (candidates[i] !== 0) { cpuCandidate = candidates[i]; break; }
      }
    }
    if (cpuCandidate !== -1) {
      MJ.Game.doWin(cpuCandidate, discarded, seat);
      return;
    }
    state.turn = nextSeat(seat);
    state.phase = 'draw';
    if (state.hold) return;
    delay(MJ.CONFIG.DISCARD_PAUSE_MS);
  };

  function canRon(s, tile, from) {
    if (s === from) return false;
    var p = state.players[s];
    if (p.riichiPassed) return false;
    var c = MJ.Tiles.counts(p.hand);
    c[tile.id] += 1;
    if (!MJ.Win.isWin(c)) return false;
    var res = MJ.Score.calc({
      hand14: p.hand.concat([tile]), winTile: tile, isTsumo: false, riichi: p.riichi,
      seatWind: seatWind(s), roundWind: 0, doraInd: state.doraInd, isDealer: s === state.dealer
    });
    if (!res || res.yakuHan === 0) return false;
    var waits = MJ.Win.tenpaiTiles(MJ.Tiles.counts(p.hand));
    if (MJ.Win.isFuriten(waits, p.river)) return false;
    return true;
  }
  MJ.Game.canRon = canRon;

  // ---- 人間の操作 --------------------------------------------------------

  MJ.Game.humanOptions = function () {
    var p = state.players[0];
    var hand14 = p.hand.concat(p.tsumo ? [p.tsumo] : []);
    var c14 = MJ.Tiles.counts(hand14);
    var canTsumo = MJ.Win.isWin(c14);
    var riichiMask = [];
    var i, anyRiichi = false;
    for (i = 0; i < 14; i++) {
      if (i >= hand14.length) { riichiMask.push(false); continue; }
      var c13 = c14.slice();
      c13[hand14[i].id] -= 1;
      var ok = MJ.Win.tenpaiTiles(c13).length > 0;
      riichiMask.push(ok);
      if (ok) anyRiichi = true;
    }
    var canRiichi = !p.riichi && p.points >= MJ.CONFIG.RIICHI_COST && state.drawsLeft >= 4 && anyRiichi;

    if (p.riichi) {
      return { actions: ['DISCARD'].concat(canTsumo ? ['TSUMO'] : []), riichiMask: riichiMask };
    }
    var actions = ['DISCARD'];
    if (canTsumo) actions.push('TSUMO');
    if (canRiichi) actions.push('RIICHI');
    return { actions: actions, riichiMask: riichiMask };
  };

  var _cursor = 13;

  MJ.Game.humanAction = function (kind) {
    var allow = MJ.Tutorial.allowed();
    // 見送り(PASS)だけは台本で塞がない。塞ぐと wait_ron から出る手段が1つも無くなり
    // 進行が永久に止まる（2026-09-04 表ういが実機で再現・東1で35秒以上 無変化）。
    // SPEC §12「止まるより進む」に合わせる。
    var escapeRon = (kind === 'PASS' && state.phase === 'wait_ron');
    if (allow && allow.indexOf(kind) === -1 && !escapeRon) return;
    try {
      handleHumanAction(kind);
    } catch (e) {
      console.error(e);
      state.hold = false;
      delay(MJ.CONFIG.CPU_DELAY_MS);
    }
  };

  function handleHumanAction(kind) {
    var p = state.players[0];
    var opts = MJ.Game.humanOptions();

    if (kind === 'LEFT' || kind === 'RIGHT') {
      if (state.phase === 'wait_human_riichi') {
        var dir = kind === 'LEFT' ? -1 : 1;
        var n = 14, tries = 0, c = _cursor;
        do {
          c = (c + dir + n) % n;
          tries += 1;
        } while (!opts.riichiMask[c] && tries <= n);
        _cursor = c;
        MJ.UI.showHand(_cursor, opts.riichiMask);
        return;
      }
      if (state.phase !== 'wait_human') return;
      if (p.riichi) return; // ツモ切り固定
      var dir2 = kind === 'LEFT' ? -1 : 1;
      _cursor = (_cursor + dir2 + 14) % 14;
      MJ.UI.showHand(_cursor, null);
      return;
    }

    if (kind === 'DISCARD') {
      if (state.phase === 'wait_human') {
        var tile = _cursor === 13 ? p.tsumo : p.hand[_cursor];
        if (!tile) return;
        MJ.UI.hideActions();
        _cursor = 13;
        MJ.Game.doDiscard(0, tile, false);
        return;
      }
      if (state.phase === 'wait_human_riichi') {
        if (!opts.riichiMask[_cursor]) return;
        var tile2 = _cursor === 13 ? p.tsumo : p.hand[_cursor];
        if (!tile2) return;
        MJ.UI.hideActions();
        _cursor = 13;
        MJ.Game.doDiscard(0, tile2, true);
        return;
      }
      return;
    }

    if (kind === 'TSUMO') {
      if (state.phase !== 'wait_human') return;
      if (opts.actions.indexOf('TSUMO') === -1) return;
      MJ.UI.hideActions();
      MJ.Game.doWin(0, null, -1);
      return;
    }

    if (kind === 'RON') {
      if (state.phase !== 'wait_ron') return;
      MJ.UI.hideActions();
      MJ.Game.doWin(0, state.lastDiscard.tile, state.lastDiscard.from);
      return;
    }

    if (kind === 'RIICHI') {
      if (state.phase !== 'wait_human') return;
      if (opts.actions.indexOf('RIICHI') === -1) return;
      state.phase = 'wait_human_riichi';
      var firstIdx = 0;
      for (var i = 0; i < 14; i++) { if (opts.riichiMask[i]) { firstIdx = i; break; } }
      _cursor = firstIdx;
      MJ.UI.showHand(_cursor, opts.riichiMask);
      MJ.UI.showActions(['DISCARD', 'CANCEL']);
      return;
    }

    if (kind === 'CANCEL') {
      if (state.phase !== 'wait_human_riichi') return;
      state.phase = 'wait_human';
      _cursor = 13;
      var opts2 = MJ.Game.humanOptions();
      MJ.UI.showHand(_cursor, null);
      MJ.UI.showActions(opts2.actions);
      return;
    }

    if (kind === 'PASS') {
      if (state.phase !== 'wait_ron') return;
      MJ.UI.hideActions();
      handleRonPass();
      return;
    }
  }

  function handleRonPass() {
    var from = state.lastDiscard.from;
    if (state.players[0].riichi) {
      state.players[0].riichiPassed = true;
    }
    var cpuCandidate = -1;
    if (state.tutorialFlags.cpuMayWin) {
      for (var i = 0; i < state.ronCandidates.length; i++) {
        var s = state.ronCandidates[i];
        if (s !== 0) { cpuCandidate = s; break; }
      }
    }
    if (cpuCandidate !== -1) {
      MJ.Game.doWin(cpuCandidate, state.lastDiscard.tile, from);
      return;
    }
    state.turn = nextSeat(from);
    state.phase = 'draw';
    MJ.Game.next();
  }

  // ---- 和了・流局 --------------------------------------------------------

  MJ.Game.doWin = function (seat, ronTile, from) {
    var p = state.players[seat];
    var hand14 = ronTile ? p.hand.concat([ronTile]) : p.hand.concat([p.tsumo]);
    var res = MJ.Score.calc({
      hand14: hand14, winTile: ronTile || p.tsumo, isTsumo: !ronTile, riichi: p.riichi,
      seatWind: seatWind(seat), roundWind: 0, doraInd: state.doraInd, isDealer: seat === state.dealer
    });
    if (!res) {
      // 役無し(呼び出し側の判定漏れの保険)。進行を止めない。
      console.error('doWin called without yaku', seat, ronTile, from);
      state.phase = 'draw';
      MJ.Game.next();
      return;
    }
    var i;
    if (!ronTile) {
      // res.pay はロール別 {dealer:額, child:額}（座席別ではない・Aの実装note 2026-09-04）。
      // 支払う側から見て、その席が親(state.dealer)なら pay.dealer、それ以外は pay.child。
      // 和了者本人がその席なら支払わない(自分の役割と一致していても対象外)。
      for (i = 0; i < 4; i++) {
        if (i === seat) continue;
        var pay = (i === state.dealer) ? res.pay.dealer : res.pay.child;
        state.players[i].points -= (pay || 0);
      }
    } else {
      state.players[from].points -= res.payRon;
    }
    var kyotakuBefore = state.kyotaku;
    p.points += res.total + state.kyotaku * 1000;
    state.kyotaku = 0;

    MJ.Scene.revealHand(seat);
    MJ.UI.cutin(ronTile ? 'RON' : 'TSUMO');

    state.phase = 'round_end';
    emit('win', { seat: seat, from: from, res: res });
    // 注意: ここは hold の有無に関わらず setTimeout を必ず発火する(SPEC §4.6 の擬似コードは
    // if(hold)return の直後で止める形だが、東1〜東3のチュートリアル台本は win ステップの文で
    // 「Zで結果を閉じます」と案内しており、結果画面自体が表示されていないと文と矛盾し、かつ
    // hold中に止めると結果画面を開く手段が無くなり進行が止まる。動く方に倒した。
    // js/_NOTES.txt に記録済み。
    // 2026-09-04 表ういが実機で確認: この setTimeout が「次の局が始まったあと」に発火し、
    // 前局の結果パネル(800x500)が対局中の画面に貼りついたまま消えなくなる。
    // 予約したときの局と違っていたら、もう出さない。
    var roundAtWin = state.round;
    setTimeout(function () {
      if (state.round !== roundAtWin) return;
      MJ.UI.showResult({
        win: true, seat: seat, from: from, res: res,
        hand14: hand14, winTile: ronTile || p.tsumo, kyotakuBefore: kyotakuBefore
      });
    }, MJ.CONFIG.WIN_HOLD_MS);
  };

  MJ.Game.doExhaust = function () {
    MJ.UI.cutin('RYUKYOKU');
    state.phase = 'round_end';
    emit('exhaust', {});
    // doWin と同じ理由で hold に関わらず必ず結果(流局)画面を出す。
    // ただし doWin と同じく、次の局に入っていたらもう出さない（貼りつき防止）。
    var roundAtExhaust = state.round;
    setTimeout(function () {
      if (state.round !== roundAtExhaust) return;
      MJ.UI.showResult({ exhaust: true });
    }, MJ.CONFIG.WIN_HOLD_MS);
  };

  MJ.Game.closeResult = function () {
    MJ.UI.hideResult();
    state.round += 1;
    emit('round_end', { round: state.round });
    if (state.hold) return;
    if (state.round < MJ.CONFIG.ROUNDS) {
      if (MJ.Tutorial.active) {
        // Tutorial 側が startRound を呼ぶ(§9)
      } else {
        MJ.Game.startRound(null);
      }
    } else {
      state.phase = 'game_end';
      emit('game_end', {});
      var order = [0, 1, 2, 3].slice().sort(function (a, b) {
        var d = state.players[b].points - state.players[a].points;
        if (d !== 0) return d;
        return a - b;
      });
      // 残った供託（リーチ棒）をトップへ渡す。渡さないと順位表の合計が
      // 100000 にならず、数字が合わない画面になる
      // （2026-09-04 表ういが実機で確認: 合計 99000・供託1本が残っていた）。
      if (state.kyotaku > 0) {
        state.players[order[0]].points += state.kyotaku * 1000;
        state.kyotaku = 0;
        order = [0, 1, 2, 3].slice().sort(function (a, b) {
          var d2 = state.players[b].points - state.players[a].points;
          if (d2 !== 0) return d2;
          return a - b;
        });
      }
      MJ.UI.showFinal(order);
    }
  };

  // ---- resume ------------------------------------------------------------

  MJ.Game.resume = function () {
    state.hold = false;
    if (state.phase === 'wait_human' || state.phase === 'wait_human_riichi' || state.phase === 'wait_ron') {
      var opts = MJ.Game.humanOptions();
      if (state.phase === 'wait_human') {
        MJ.UI.showHand(_cursor, null);
        MJ.UI.showActions(opts.actions);
      } else if (state.phase === 'wait_human_riichi') {
        MJ.UI.showHand(_cursor, opts.riichiMask);
        MJ.UI.showActions(['DISCARD', 'CANCEL']);
      } else if (state.phase === 'wait_ron') {
        MJ.UI.showActions(['RON', 'PASS']);
      }
    } else {
      MJ.Game.next();
    }
  };

  MJ.Game.cursor = function () { return _cursor; };
})();
