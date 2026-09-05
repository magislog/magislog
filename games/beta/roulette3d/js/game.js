// roulette3d — RL.Game（進行。SPEC.md §4）。担当C。
// 数値は必ず RL.CONFIG から読む。直書きしない。
window.RL = window.RL || {};
RL.Game = {};

(function () {
  'use strict';

  var state = null;

  // ---- 小さな補助関数 --------------------------------------------------------

  function fmt(tpl, obj) {
    return tpl.replace(/\{(\w+)\}/g, function (_, k) {
      var v = obj[k];
      return (v === undefined || v === null) ? '' : v;
    });
  }

  function totalBetOf() {
    var t = 0;
    for (var i = 0; i < state.betOrder.length; i++) {
      var b = state.bets[state.betOrder[i]];
      if (b) t += b.amount;
    }
    return t;
  }

  // ---- #msg 文の組み立て（emit の②。事前にUI.messageで直接出した文は上書きしない） ---

  function buildMessage(name, data) {
    var C = RL.CONFIG, MSG = C.TEXT.MSG;
    switch (name) {
      case 'round_start':
        return MSG.yourturn;
      case 'bet':
        // {v} = 今置いた1枚のチップ額（CHIP_VALUES[chipIdx]）。data.amountはそのマスの合計なので使わない。
        return fmt(MSG.placed, { spot: RL.Bets.label(data.spot), v: C.CHIP_VALUES[state.chipIdx] });
      case 'spin':
        return (data && data.totalBet > 0) ? MSG.spin : MSG.nobet;
      case 'result': {
        var win = !!(data && data.net > 0);
        var color = C.COLOR_NAMES[data && data.color] || '';
        var n = (data && Number.isInteger(data.winning)) ? data.winning : '—';
        if (win) return fmt(MSG.win, { n: n, color: color, pay: data.net });
        return fmt(MSG.lose, { n: n, color: color });
      }
      case 'gameover':
        return MSG.gameover;
      default:
        return null; // 'unbet' / 'round_end' などは既存の#msgを上書きしない
    }
  }

  // ---- emit（§4.1。呼ぶ側は直後に if(state.hold) return; を必ず置く） -------------

  function emit(name, data) {
    RL.UI.refresh(state);
    var text = buildMessage(name, data);
    if (text) RL.UI.message(text);
    if (RL.Tutorial.active && RL.Tutorial.onEvent(name, data) === 'hold') {
      state.hold = true;
    }
  }
  RL.Game.emit = emit;

  // ---- delay（タイマーは常にこの1本だけ。§4.1） -------------------------------

  function delay(ms) {
    clearTimeout(state.timer);
    var r = state.roundNo;
    state.timer = setTimeout(function () {
      if (RL.Game.state.roundNo !== r) return;
      RL.Game.next();
    }, ms);
  }
  RL.Game.delay = delay;

  // ---- エラー回復（§12「止まるより進む」） -----------------------------------

  function recoverFromError() {
    state.hold = false;
    if (state.phase === 'spinning') {
      delay(RL.CONFIG.LAND_HOLD_MS);
    } else if (state.phase === 'result') {
      RL.UI.showResult(null);
    }
  }

  // ---- newGame（§4.1） --------------------------------------------------------

  RL.Game.newGame = function () {
    state = {
      phase: 'idle', roundNo: 0, balance: RL.CONFIG.START_BALANCE,
      bets: {}, betOrder: [],
      cursor: { x: RL.CONFIG.START_CURSOR.x, y: RL.CONFIG.START_CURSOR.y },
      chipIdx: RL.CONFIG.START_CHIP_IDX, winning: null, lastNet: 0, history: [],
      hold: false, script: null, timer: null, timerRound: 0, spinT0: 0
    };
    RL.Game.state = state;
    clearTimeout(state.timer);
    RL.UI.hideResult();
    RL.UI.hideComplete();
    RL.UI.hideGameover();
    RL.Scene.clearChips();
    RL.Scene.hideDolly();
    RL.UI.refresh(state);
  };

  // ---- startRound（§4.2） ------------------------------------------------------

  RL.Game.startRound = function (script) {
    state.roundNo += 1;
    clearTimeout(state.timer);
    RL.UI.hideResult();
    RL.UI.hideGameover();
    RL.Scene.clearChips();
    RL.Scene.hideDolly();
    state.bets = {};
    state.betOrder = [];
    state.winning = null;
    state.script = script || null;
    if (script && script.cursor) state.cursor = { x: script.cursor.x, y: script.cursor.y };
    if (script && Number.isInteger(script.chipIdx)) state.chipIdx = script.chipIdx;
    // Tutorial側のsteps再構築(§9)。Game.startRoundが呼ばれるたび、Tutorialが現在のindexの
    // 台本に合わせてsteps配列を作り直す。round_startのemitより前に済ませておく必要がある。
    if (RL.Tutorial.active && RL.Tutorial.onRoundStart) RL.Tutorial.onRoundStart();
    RL.Scene.setCursor(RL.Bets.spotAt(state.cursor.x, state.cursor.y));
    state.phase = 'betting';
    emit('round_start', { roundNo: state.roundNo });
    if (state.hold) return;
  };

  // ---- next()の分岐（§4.3） -----------------------------------------------------

  function handleSpinning() {
    var C = RL.CONFIG;
    var el = performance.now() - state.spinT0;
    if (el < C.SPIN_MS + C.LAND_HOLD_MS) {
      delay(C.SPIN_MS + C.LAND_HOLD_MS - el);
      return;
    }
    var res = RL.Bets.payout(state.bets, state.betOrder, state.winning);
    state.balance += res.totalReturn;
    state.lastNet = res.net;
    state.history.unshift(state.winning);
    if (state.history.length > C.UI.HISTORY_N) state.history.pop();
    RL.Scene.setDolly(state.winning);

    // 負けたスタックを外す（betsからwonでないkeyを消しbetOrderも詰める）
    var newOrder = [];
    for (var i = 0; i < state.betOrder.length; i++) {
      var key = state.betOrder[i];
      var row = null;
      for (var j = 0; j < res.rows.length; j++) {
        if (res.rows[j].key === key) { row = res.rows[j]; break; }
      }
      if (row && row.won) {
        newOrder.push(key);
      } else {
        delete state.bets[key];
      }
    }
    state.betOrder = newOrder;
    RL.Scene.setChips(state.bets, state.betOrder);

    state.phase = 'result';
    RL.UI.showResult(res);
    if (res.net > 0) {
      RL.UI.cutin(res.net >= C.CUTIN.BIGWIN_MIN ? 'BIGWIN' : 'WIN', '+' + res.net);
    }
    emit('result', res);
  }

  function handleRoundEnd() {
    var C = RL.CONFIG;
    state.bets = {};
    state.betOrder = [];
    RL.Scene.clearChips();
    if (RL.Tutorial.active) return; // Tutorialがstartroundか完了画面を呼ぶ
    if (state.balance < C.CHIP_VALUES[0]) {
      state.phase = 'gameover';
      RL.UI.showGameover();
      emit('gameover');
      if (state.hold) return;
    } else {
      RL.Game.startRound(null);
    }
  }

  function nextInner() {
    if (state.hold) return;
    switch (state.phase) {
      case 'idle':
        break;
      case 'betting':
        break;
      case 'spinning':
        handleSpinning();
        break;
      case 'result':
        break;
      case 'round_end':
        handleRoundEnd();
        break;
      case 'complete':
        break;
      case 'gameover':
        break;
      default:
        break;
    }
  }

  RL.Game.next = function () {
    try {
      nextInner();
    } catch (e) {
      console.error(e);
      recoverFromError();
    }
  };

  // ---- 賭けの操作（§4.5） -------------------------------------------------------

  RL.Game.placeChip = function () {
    if (state.phase !== 'betting' || state.hold) return;
    var C = RL.CONFIG;
    var spot = RL.Bets.spotAt(state.cursor.x, state.cursor.y);
    if (!spot) return;
    var v = C.CHIP_VALUES[state.chipIdx];
    if (state.balance < v) { RL.UI.message(C.TEXT.MSG.nomoney); return; }
    var existing = state.bets[spot.key];
    var currentAmount = existing ? existing.amount : 0;
    if (currentAmount + v > C.MAX_PER_SPOT) {
      RL.UI.message(fmt(C.TEXT.MSG.maxbet, { max: C.MAX_PER_SPOT }));
      return;
    }
    state.balance -= v;
    if (!existing) {
      existing = { spot: spot, amount: 0 };
      state.bets[spot.key] = existing;
      state.betOrder.push(spot.key);
    }
    existing.amount += v;
    RL.Scene.setChips(state.bets, state.betOrder);
    emit('bet', { spot: spot, amount: existing.amount, total: totalBetOf() });
    if (state.hold) return;
  };

  RL.Game.removeChip = function () {
    if (state.phase !== 'betting' || state.hold) return;
    var C = RL.CONFIG;
    var spot = RL.Bets.spotAt(state.cursor.x, state.cursor.y);
    var key;
    if (spot && state.bets[spot.key]) {
      key = spot.key;
      var removedSpot = state.bets[key].spot;
      state.balance += state.bets[key].amount;
      delete state.bets[key];
      var oi = state.betOrder.indexOf(key);
      if (oi !== -1) state.betOrder.splice(oi, 1);
      RL.UI.message(fmt(C.TEXT.MSG.removed, { spot: RL.Bets.label(removedSpot) }));
    } else if (state.betOrder.length) {
      key = state.betOrder[state.betOrder.length - 1];
      state.balance += state.bets[key].amount;
      delete state.bets[key];
      state.betOrder.pop();
      RL.UI.message(C.TEXT.MSG.undo);
    } else {
      return;
    }
    RL.Scene.setChips(state.bets, state.betOrder);
    emit('unbet', {});
    if (state.hold) return;
  };

  RL.Game.spin = function () {
    if (state.phase !== 'betting' || state.hold) return;
    var C = RL.CONFIG;
    var script = state.script;
    state.winning = (script && Number.isInteger(script.winning)) ? script.winning : Math.floor(Math.random() * C.POCKETS);
    var idx = C.WHEEL_ORDER.indexOf(state.winning);
    state.spinT0 = performance.now();
    RL.Scene.startSpin(idx, state.spinT0);
    state.phase = 'spinning';
    delay(C.SPIN_MS + C.LAND_HOLD_MS);
    // hold は想定しない（§9にspinのstepを置かない）
    emit('spin', { winning: state.winning, totalBet: totalBetOf() });
  };

  function moveCursorDir(dir) {
    state.cursor = RL.Bets.moveCursor(state.cursor, dir);
    RL.Scene.setCursor(RL.Bets.spotAt(state.cursor.x, state.cursor.y));
    RL.UI.refresh(state); // emitしない＝チュートリアルのstepに掛けない
  }

  function setChipIdx(idx) {
    state.chipIdx = idx;
    RL.UI.refresh(state);
  }

  RL.Game.closeResult = function () {
    try {
      RL.UI.hideResult();
      state.phase = 'round_end';
      emit('round_end', { balance: state.balance });
      if (state.hold) return;
      RL.Game.next();
    } catch (e) {
      console.error(e);
      recoverFromError();
    }
  };

  function handleHumanKey(kind) {
    switch (kind) {
      case 'LEFT': moveCursorDir('LEFT'); break;
      case 'RIGHT': moveCursorDir('RIGHT'); break;
      case 'UP': moveCursorDir('UP'); break;
      case 'DOWN': moveCursorDir('DOWN'); break;
      case 'OK': RL.Game.placeChip(); break;
      case 'CANCEL': RL.Game.removeChip(); break;
      case 'SPIN': RL.Game.spin(); break;
      case 'CHIP_UP': setChipIdx((state.chipIdx + 1) % RL.CONFIG.CHIP_VALUES.length); break;
      case 'CHIP_DOWN': setChipIdx((state.chipIdx + RL.CONFIG.CHIP_VALUES.length - 1) % RL.CONFIG.CHIP_VALUES.length); break;
      case 'CHIP_1': setChipIdx(0); break;
      case 'CHIP_2': setChipIdx(1); break;
      case 'CHIP_3': setChipIdx(2); break;
      case 'CHIP_4': setChipIdx(3); break;
      default: break;
    }
  }

  RL.Game.humanKey = function (kind) {
    try {
      handleHumanKey(kind);
    } catch (e) {
      console.error(e);
      recoverFromError();
    }
  };

  // ---- resume（§4.1。Tutorial.confirm から呼ぶ） --------------------------------

  RL.Game.resume = function () {
    state.hold = false;
    if (state.phase === 'betting' || state.phase === 'result') {
      RL.UI.refresh(state);
    } else {
      RL.Game.next();
    }
  };
})();
