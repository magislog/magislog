// MJ.Tutorial — 導入3ページ + 東1〜東4（SPEC.md §9）。担当C。
window.MJ = window.MJ || {};
MJ.Tutorial = {};

(function () {
  'use strict';

  var T = MJ.Tutorial;

  function stepMatches(step, name, data) {
    if (!step) return false;
    var idx = step.on.indexOf(':');
    if (idx === -1) return step.on === name;
    var base = step.on.slice(0, idx);
    var seatStr = step.on.slice(idx + 1);
    return base === name && data && String(data.seat) === seatStr;
  }

  // ---- SCRIPT（§9 の表・東1〜東4） ------------------------------------------
  T.SCRIPT = [
    { // 東1
      dealer: 0,
      dora: '1z',
      hands: { 0: ['2m', '3m', '4m', '4m', '5m', '6m', '6m', '7m', '8m', '2p', '3p', '5p', '5p'] },
      draws: ['9s', '1z', '2z', '3z', '4p'],
      cpu: { 1: ['1z'], 2: ['2z'], 3: ['3z'] },
      flags: { cpuMayWin: false, cpuMayRiichi: false },
      steps: [
        { on: 'round_start', text: '東1局。あなたが親（東）。親の和了は 1.5 倍。左下が自分の手牌、右端の 1 枚がツモ牌です' },
        { on: 'your_turn', text: '九索をツモ。ほかと繋がらない孤立牌なので切ります。カーソルは最初からツモ牌にあります → Z', allow: ['DISCARD'] },
        { on: 'discard:0', text: '切ったあとの 13 枚は 一筒 か 四筒 が来れば和了＝聴牌です。CPU 3 人が順に切ります' },
        { on: 'your_turn', text: '四筒をツモ！ 14 枚が 4 面子 1 雀頭に揃いました。A でツモ和了', allow: ['TSUMO'] },
        { on: 'win', text: '役: 門前清自摸和・断么九・平和 = 3 翻 20 符。親のツモは子 3 人から 1300 ずつ、合計 3900 点。Z で結果を閉じます' },
        { on: 'round_end', text: 'Z で東2局へ。親が かなめ に移ります' }
      ]
    },
    { // 東2
      dealer: 1,
      dora: '5z',
      hands: { 0: ['3m', '4m', '5m', '6p', '7p', '8p', '4s', '5s', '6s', '7s', '8s', '2s', '2s'] },
      draws: ['5z', '6z', '7z', '1z', '2z', '6s'],
      cpu: { 1: ['5z', '2z'], 2: ['6z', '6s'], 3: ['7z'] },
      flags: { cpuMayWin: false, cpuMayRiichi: false },
      steps: [
        { on: 'round_start', text: '東2局。あなたは南家（子）。親は かなめ' },
        { on: 'your_turn', text: '東をツモ。すでに 六索・九索 待ちの聴牌です。R でリーチ宣言 → カーソルがツモ牌（東）にある状態で Z', allow: ['RIICHI', 'DISCARD'] },
        { on: 'riichi:0', text: 'リーチ棒 1000 点を出しました。リーチ後は手を変えられず、ツモ切りだけ。代わりにロンに役が付きます' },
        { on: 'ron_offer', text: 'そらが 六索 を切りました。あなたの当たり牌です → A でロン', allow: ['RON'] },
        { on: 'win', text: 'リーチ・断么九・平和 = 3 翻 30 符 → 3900 点を そら から。供託の 1000 点も戻ります' },
        { on: 'round_end', text: 'Z で東3局へ' }
      ]
    },
    { // 東3
      dealer: 2,
      dora: '4s',
      hands: { 0: ['2m', '3m', '4m', '5p', '6p', '7p', '9p', '9p', '4s', '5s', '7z', '7z', '7z'] },
      draws: ['1z', '2z', '1z', '3z', '4z', '5z', '6s'],
      cpu: { 1: ['3z'], 2: [{ t: '1z', riichi: true }, '4z'], 3: ['2z', '5z'] },
      flags: { cpuMayWin: false, cpuMayRiichi: false },
      steps: [
        { on: 'round_start', text: '東3局。あなたは西家。ドラ表示牌は 四索 → ドラは『次の牌』の 五索。手牌に 1 枚あるので和了時に 1 翻ぶん加算' },
        { on: 'riichi:2', text: 'そらがリーチ。ここからそらに当たる牌は切りたくない。リーチ後に相手が切った牌と同じ牌（現物）は絶対にロンされません' },
        { on: 'your_turn', text: '東をツモ。東は そらの河にある現物 → 安全。Z でツモ切り', allow: ['DISCARD'] },
        { on: 'your_turn', text: '六索をツモ！ A でツモ', allow: ['TSUMO'] },
        { on: 'win', text: '門前清自摸和・役牌（中）・ドラ 1 = 3 翻 30 符。子のツモは 親 2000・子 1000 = 4000 点 + そらの供託 1000' },
        { on: 'round_end', text: 'Z で東4局へ。最後は台本なし' }
      ]
    },
    { // 東4（台本なし: dealer だけ指定。hands/draws/cpu は使わない）
      dealer: 3,
      dora: null,
      hands: {},
      draws: [],
      cpu: {},
      flags: { cpuMayWin: true, cpuMayRiichi: true },
      steps: [
        { on: 'round_start', text: '東4局（最終局）。台本なし。手牌を見て自分で切る牌を決めてください。聴牌したら R でリーチ、揃ったら A。H で役一覧' }
      ]
    }
  ];

  T.INTRO = [
    'ようこそ。四人麻雀（東風戦・4局）の練習卓です。相手は かなめ・そら・ひかり。Z で進みます',
    '手牌 13 枚に 1 枚ツモって 1 枚切る、を繰り返し、4 面子 1 雀頭の 14 枚を作れば和了。自分でツモれば『ツモ』、相手の捨て牌なら『ロン』。鳴き（ポン・チー）はこの練習卓にはありません',
    '操作: ←→ で牌を選び Z で切る。R リーチ ／ A ツモ・ロン ／ X パス。H でいつでも一覧'
  ];

  T.active = false;
  T.index = 0;
  T.pending = [];

  var _stage = 'idle'; // 'intro' | 'round'
  var _curSteps = [];
  var _allow = null;
  var _pendingRoundAdvance = false;

  // hold=true は onEvent が 'hold' を返す経路と、pending から次の文を出す経路の
  // 両方で必ず立てる（ポーカー3D で落ちた箇所・SPEC §9 の明記）。
  function showText(text) {
    MJ.UI.tutorialBox(text, true);
    MJ.Game.state.hold = true;
  }

  function showNextPending() {
    var t = T.pending.shift();
    showText(t);
  }

  function queueOrShow(text) {
    T.pending.push(text);
    if (!MJ.Game.state.hold) showNextPending();
  }

  function beginRound(i) {
    T.index = i;
    _stage = 'round';
    _allow = null;
    _pendingRoundAdvance = false;
    _curSteps = T.SCRIPT[i].steps.slice();
    MJ.Game.state.hold = false;
    MJ.Game.startRound(T.SCRIPT[i]);
  }

  // 呼ぶ側(main.js)が先に MJ.Game.newGame() を呼んでいる前提（SPEC §1 main.js の起動順）。
  T.start = function () {
    T.active = true;
    T.index = 0;
    T.pending = [];
    _stage = 'intro';
    _allow = null;
    _pendingRoundAdvance = false;
    _curSteps = [];
    T.pending = T.INTRO.slice();
    showNextPending();
  };

  T.onEvent = function (name, data) {
    if (!T.active || _stage !== 'round') return undefined;
    var top = _curSteps[0];
    if (!stepMatches(top, name, data)) return undefined;
    _curSteps.shift();
    if (top.on === 'your_turn' || top.on === 'ron_offer') _allow = top.allow || null;
    if (top.on === 'round_end') _pendingRoundAdvance = true;
    queueOrShow(top.text);
    return 'hold';
  };

  T.confirm = function () {
    if (T.pending.length) {
      showNextPending();
      return;
    }
    if (_stage === 'intro') {
      MJ.UI.hideTutorial();
      beginRound(0);
      return;
    }
    if (_pendingRoundAdvance) {
      _pendingRoundAdvance = false;
      MJ.UI.hideTutorial();
      // steps に round_end が現れるのは次の局がある東1〜東3 のときだけ(§9)。
      // 東4(index 3)には round_end step が無いため、ここに来る時点で index+1 < ROUNDS。
      beginRound(T.index + 1);
      return;
    }
    MJ.UI.hideTutorial();
    MJ.Game.resume();
  };

  T.forcedCpuAction = function (seat, state) {
    if (!T.active) return null;
    var script = T.SCRIPT[T.index];
    if (!script || !script.cpu || !script.cpu[seat] || !script.cpu[seat].length) return null;
    var entry = script.cpu[seat].shift();
    var code, riichi;
    if (entry && typeof entry === 'object') {
      code = entry.t; riichi = !!entry.riichi;
    } else {
      code = entry; riichi = false;
    }
    var id = MJ.Tiles.parse(code);
    var p = state.players[seat];
    var tile = null;
    if (p.tsumo && p.tsumo.id === id) {
      tile = p.tsumo;
    } else {
      for (var i = 0; i < p.hand.length; i++) {
        if (p.hand[i].id === id) { tile = p.hand[i]; break; }
      }
    }
    if (!tile) {
      console.error('MJ.Tutorial.forcedCpuAction: code "' + code + '" not found in hand14 for seat ' + seat);
      return null;
    }
    return { kind: 'discard', tile: tile, riichi: riichi };
  };

  T.allowed = function () {
    if (!T.active) return null;
    if (T.index === 3) return null; // 東4局(SCRIPT[3])は台本なし・全操作可(§9)
    return _allow;
  };
})();
