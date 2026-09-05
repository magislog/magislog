window.PK = window.PK || {};
PK.Tutorial = {};

(function () {
  'use strict';

  var T = PK.Tutorial;

  function parseAction(str) {
    var idx = str.indexOf(':');
    if (idx === -1) return { kind: str.toUpperCase(), amount: 0 };
    return { kind: str.slice(0, idx).toUpperCase(), amount: parseInt(str.slice(idx + 1), 10) };
  }

  function stepMatches(step, name, data) {
    if (!step) return false;
    var idx = step.on.indexOf(':');
    if (idx === -1) return step.on === name;
    var base = step.on.slice(0, idx);
    var street = step.on.slice(idx + 1);
    return base === name && data && data.street === street;
  }

  T.SCRIPT = [
    { // 1
      dealer: 2,
      holes: { 0: ["Ah", "Kh"], 1: ["Jc", "3d"], 2: ["Qd", "5c"], 3: ["7s", "8s"] },
      board: ["As", "7d", "2c", "9s", "4d"],
      cpu: {
        1: { preflop: ["call"], flop: ["fold"] },
        2: { preflop: ["call"], flop: ["fold"] },
        3: { preflop: ["call"], flop: ["bet:20"], turn: ["check"], river: ["check"] }
      },
      steps: [
        { on: 'dealt', text: '手札 2 枚が配られました。あなたは BB（20 を出した席）。A♥ K♥ は強い手です' },
        { on: 'your_turn:preflop', text: '全員がコールしたので追加は不要。C でチェック（タダで次へ）', allow: ['CHECK'] },
        { on: 'street:flop', text: 'フロップ：共有カード 3 枚。全員が使えます。A が落ちてあなたは A のワンペア' },
        { on: 'your_turn:flop', text: 'ひかりが 20 ベット。ワンペアなら受けます。C でコール', allow: ['CALL'] },
        { on: 'street:turn', text: 'ターン：4 枚目' },
        { on: 'your_turn:turn', text: '相手はチェック。C でチェック', allow: ['CHECK'] },
        { on: 'street:river', text: 'リバー：5 枚目。共有カードはこれで全部' },
        { on: 'your_turn:river', text: 'C でチェックしてショーダウンへ', allow: ['CHECK'] },
        { on: 'showdown', text: 'ショーダウン：手札 2 枚＋共有 5 枚から最強の 5 枚。A のペア vs 7 のペア → あなたの勝ち。ポット 120 獲得' }
      ]
    },
    { // 2
      dealer: 3,
      holes: { 0: ["7c", "2d"], 1: ["9d", "9c"], 2: ["As", "Qs"], 3: ["Jh", "4s"] },
      board: ["Ks", "Qh", "5d", "8c", "3s"],
      cpu: {
        1: { preflop: ["call"], flop: ["check", "fold"] },
        2: { preflop: ["raise:60"], flop: ["bet:60"] },
        3: { preflop: ["fold"] }
      },
      steps: [
        { on: 'dealt', text: '7♣ 2♦ は最弱の組み合わせ。そらがレイズしてきます' },
        { on: 'your_turn:preflop', text: '50 追加で払う手ではない。F でフォールド。失うのは SB の 10 だけ', allow: ['FOLD'] },
        { on: 'win_uncontested', text: '降りたあとは見ているだけ。残った 2 人で決着します' }
      ]
    },
    { // 3
      dealer: 0,
      holes: { 0: ["Qs", "Qc"], 1: ["Ts", "4c"], 2: ["Ad", "Jd"], 3: ["6d", "2h"] },
      board: ["Qd", "8s", "3h", "6c", "2s"],
      cpu: {
        1: { preflop: ["fold"] },
        2: { preflop: ["call"], flop: ["check", "fold"] },
        3: { preflop: ["fold"] }
      },
      steps: [
        { on: 'dealt', text: 'Q♠ Q♣ のポケットペア。あなたは D なので最後に動けます' },
        { on: 'your_turn:preflop', text: '強い手はレイズで育てる。R → ↑ 1 回（合計 60）→ Z', allow: ['RAISE'] },
        { on: 'your_turn:flop', text: 'Q が落ちてスリーカード。相手はチェック。R → ↑ 2 回（60）→ Z でベット', allow: ['BET'] },
        { on: 'win_uncontested', text: '相手が降りたので手札を見せずに勝ち。ポットとベット分が戻ります' }
      ]
    },
    { // 4
      dealer: 1,
      holes: { 0: ["9h", "8h"], 1: ["3c", "4s"], 2: ["Ts", "6s"], 3: ["Kd", "Qd"] },
      board: ["6h", "7h", "Ks", "Tc", "2d"],
      cpu: {
        1: { preflop: ["fold"] },
        2: { preflop: ["call"], flop: ["check", "fold"] },
        3: { preflop: ["check"], flop: ["bet:40"], turn: ["bet:80", "call"], river: ["check"] }
      },
      steps: [
        { on: 'dealt', text: '9♥ 8♥：同じスートの連番。安く見に行く手' },
        { on: 'your_turn:preflop', text: 'C でコール（20）', allow: ['CALL'] },
        { on: 'your_turn:flop', text: '6♥7♥K♠。ストレートもフラッシュも 1 枚で完成する引き目（15 枚）。40 払って 140 を狙う → 約半分で当たるのでコール。C', allow: ['CALL'] },
        { on: 'street:turn', text: 'T♣ でストレート完成（6-7-8-9-T）' },
        { on: 'your_turn:turn', text: 'できた手はレイズで取り切る。R → ↑ 2 回（合計 200）→ Z', allow: ['RAISE'] },
        { on: 'your_turn:river', text: 'C でチェック。相手もチェックなら見せ合いへ', allow: ['CHECK'] },
        { on: 'showdown', text: 'ストレート vs K のワンペア。役の順は H の一覧でいつでも確認' }
      ]
    },
    { // 5
      dealer: 2,
      holes: { 0: ["Ac", "Ad"], 1: ["8d", "3c"], 2: ["Js", "7h"], 3: ["Ks", "Kh"] },
      board: ["5s", "9d", "Jc", "3h", "7d"],
      cpu: {
        1: { preflop: ["fold"] },
        2: { preflop: ["fold"] },
        3: { preflop: ["raise:100", "allin"] }
      },
      steps: [
        { on: 'dealt', text: 'A♣ A♦：最強のスタート' },
        { on: 'your_turn:preflop', text: 'ひかりが 100 にレイズ。A でオールイン（全部を賭ける）', allow: ['ALLIN'] },
        { on: 'runout', text: '両者オールインなので残りの共有カードは自動で開きます' },
        { on: 'refund', text: 'コールされなかった 720 はあなたに戻ります' },
        { on: 'showdown', text: 'A のペアが K のペアに勝ち。ポット 1400 獲得。ひかりのチップは 0 → 次のハンドで 1000 に補充' }
      ]
    },
    { // 6 (台本なし: dealer/holes/board/cpu は使わない。steps だけ使う)
      dealer: null,
      holes: null,
      board: null,
      cpu: null,
      steps: [
        { on: 'dealt', text: '最後は台本なし。左下の役名を見ながら自分で決めてください' },
        { on: 'hand_end', text: 'チュートリアル完了。N: フリープレイ（ブラインド 10/20 固定）／ T: 最初から' }
      ]
    }
  ];

  T.INTRO = [
    'ようこそ。テキサスホールデムの練習卓です。相手は かなめ・そら・ひかり。Z で進みます',
    '各自 1000 チップ。強制ベット（ブラインド）は 10 と 20。ボタン D は毎ハンド左隣へ回り、D の次が SB、その次が BB',
    '操作: ←→ で選び Z で決定。F フォールド ／ C チェック・コール ／ R レイズ ／ A オールイン。H でいつでも一覧'
  ];

  T.active = false;
  T.index = 0;

  var _stage = 'idle'; // 'intro' | 'steps' | 'awaitNext' | 'done'
  var _queue = [];
  var _curSteps = [];
  var _allow = null;

  function showNextQueued() {
    var t = _queue.shift();
    PK.UI.tutorialBox(t, true);
    // ★2026-09-04 うい修正：文を出したら必ず「入力待ち」にする。
    //   これが無いと main.js の handleKeydown が state.hold を見て分岐するため、
    //   導入文（emit を通らない経路）で Z が一切効かず、入口で永久に止まっていた。
    //   hold=true は emit() の中の1か所にしか無く、start() の経路が漏れていた。
    PK.Game.state.hold = true;
  }

  function queueOrShow(text) {
    _queue.push(text);
    if (!PK.Game.state.hold) showNextQueued();
  }

  function beginHand(i) {
    T.index = i;
    _stage = 'steps';
    _allow = null;
    _curSteps = T.SCRIPT[i].steps.slice();
    var scr = (i === 5) ? null : T.SCRIPT[i];
    PK.Game.state.hold = false;
    PK.Game.startHand(scr);
  }

  T.start = function () {
    T.active = true;
    T.index = 0;
    _stage = 'intro';
    _queue = T.INTRO.slice();
    showNextQueued();
  };

  T.onEvent = function (name, data) {
    if (!T.active || _stage !== 'steps') return undefined;
    var top = _curSteps[0];
    if (stepMatches(top, name, data)) {
      _curSteps.shift();
      if (top.on.indexOf('your_turn') === 0) _allow = top.allow || null;
      if (name === 'hand_end') _stage = 'done'; // ハンド6専用の明示 hand_end step
      queueOrShow(top.text);
      return 'hold';
    }
    if (name === 'hand_end') {
      // ハンド1〜5: steps に hand_end が無いので、ここで次ハンドへの合図を出す
      if (T.index + 1 < 6) {
        _stage = 'awaitNext';
        queueOrShow('Z で次のハンドへ');
      } else {
        _stage = 'done';
        queueOrShow('チュートリアル完了。N: フリープレイ（ブラインド 10/20 固定）／ T: 最初から');
      }
      return 'hold';
    }
    return undefined;
  };

  T.confirm = function () {
    if (_queue.length) {
      showNextQueued();
      return;
    }
    if (_stage === 'intro') {
      PK.UI.hideTutorial();
      beginHand(0);
      return;
    }
    if (_stage === 'awaitNext') {
      PK.UI.hideTutorial();
      beginHand(T.index + 1);
      return;
    }
    if (_stage === 'done') {
      return; // N / T で main.js が処理する
    }
    PK.UI.hideTutorial();
    PK.Game.resume();
  };

  T.forcedCpuAction = function (seat, street) {
    if (!T.active) return null;
    var hand = T.SCRIPT[T.index];
    if (!hand || !hand.cpu || !hand.cpu[seat] || !hand.cpu[seat][street] || !hand.cpu[seat][street].length) {
      return null;
    }
    return parseAction(hand.cpu[seat][street].shift());
  };

  T.allowed = function () {
    if (!T.active) return null;
    return _allow;
  };

  // main.js の N/T キー処理から使う補助(§1 見出し一覧には無いが、
  // 完了画面の判定に必要なため tutorial.js 内部で持つ)
  T.isComplete = function () { return _stage === 'done'; };
})();
