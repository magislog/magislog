// roulette3d — RL.Tutorial（導入3ページ + 6回転。SPEC.md §9）。担当C。
// 案内文を出す経路は show() だけ。show() の中で必ず state.hold=true を立てる
// （ポーカー3D で導入文が emit を通らず Z が死んだ事故の封じ・SPEC §12）。
window.RL = window.RL || {};
RL.Tutorial = {};

(function () {
  'use strict';

  var T = RL.Tutorial;

  // ---- SCRIPT（§9の表。6回目(SCRIPT[5])はwinning:nullで乱数） --------------------
  T.SCRIPT = [
    { // 1回目: 置く・回す・当たり・1:1の配当
      winning: 32, cursor: { x: 10, y: 7 }, chipIdx: 2,
      steps: [
        { on: 'round_start', text: '1回目。カーソルは RED（赤）にあります。赤 18・黒 18・緑の 0 が 1 つ。Z で 25 チップを置いてください' },
        { on: 'bet', text: 'RED に 25。赤が出れば同額（1:1）が付いて 50 戻ります。S で玉を回します' },
        { on: 'result', text: '32 は赤。当たり！ 25 が 50 になって戻りました（残高 1,025）。Z で次へ' }
      ]
    },
    { // 2回目: カーソル移動（段をまたぐ）・ダース2:1・Xで取り消せる
      winning: 7, cursor: null, chipIdx: null,
      steps: [
        { on: 'round_start', text: '2回目。↑ で 1 つ上の段へ。そこは『ダース』（12 個ずつの 3 区分・2:1）。← で 1st 12（1〜12）に合わせて Z' },
        { on: 'bet', text: '1st 12 に 25。当たる確率は 12/37（約 32%）、配当は 2 倍。間違えたら X で取り消せます。S で回す' },
        { on: 'result', text: '7 は 1〜12 の中。25 × 2 = 50 の配当、合計 75 戻り（残高 1,075）。Z で次へ' }
      ]
    },
    { // 3回目: ストレートアップ35:1・チップ額の変更
      winning: 17, cursor: null, chipIdx: null,
      steps: [
        { on: 'round_start', text: '3回目はストレートアップ（1 つの数字・35:1）。C でチップを 100 に。↑ を 4 回、→ を 7 回押して 17 に合わせ Z' },
        { on: 'bet', text: '17 に 100。当たる確率は 1/37（2.7%）。当たれば 100 × 35 = 3,500 の配当。S で回す' },
        { on: 'result', text: '17！ 3,500 の配当と賭け金 100 が戻り、残高 4,575。台本どおりの当たりです。Z で次へ' }
      ]
    },
    { // 4回目: 高配当は当たりにくい（同じ賭けで外れ）
      winning: 22, cursor: null, chipIdx: null,
      steps: [
        { on: 'round_start', text: '4回目。同じ 17 にもう一度 100。Z' },
        { on: 'bet', text: '本当なら 37 回に 1 回しか当たりません。S で回す' },
        { on: 'result', text: '22。外れ。100 を失いました（残高 4,475）。高配当は当たりにくい、の裏側です。Z で次へ' }
      ]
    },
    { // 5回目: スプリット／コーナーなど数字をまたぐ賭け・倍率の並び
      winning: 14, cursor: null, chipIdx: null,
      steps: [
        { on: 'round_start', text: '5回目は複数の数字にまたがる賭け。V でチップを 25 に戻し、← で 14 と 17 の境目（スプリット 17:1）、↑ で 4 つの角（コーナー 8:1）に合わせて Z' },
        { on: 'bet', text: '14・15・17・18 の 4 つに 25。確率 4/37、配当 8 倍。S で回す' },
        { on: 'result', text: '14 は 4 つの中。25 × 8 = 200 の配当（残高 4,675）。ストレート 35・スプリット 17・ストリート 11・コーナー 8・ダブルストリート 5・ダース／コラム 2・赤黒など 1。数字が増えるほど配当は下がり、期待値はどれも 97.3%。Z で次へ' }
      ]
    },
    { // 6回目: 台本なし・自分で決める（bet/result/round_endのstepは無し）
      winning: null, cursor: null, chipIdx: null,
      steps: [
        { on: 'round_start', text: '最後は台本なし。好きなマスに好きなだけ置いて S。何も置かずに S でも進めます。H で配当表' }
      ]
    }
  ];

  T.INTRO = [
    'ようこそ。ヨーロピアン・ルーレット（0〜36 の 37 マス）の練習台です。ディーラーは かなめ。Z で進みます',
    '遊び方: 賭け台にチップを置く → 玉を回す → 止まったマスで当たり外れ → 配当を受け取る。当たりにくい賭けほど配当が高く、どの賭けも期待値は同じ（賭け金の 97.3%）です',
    '操作: ←→↑↓ でマスを選び Z でチップを置く。X 取り消し ／ C・V でチップの額 ／ S で玉を回す。H でいつでも配当表'
  ];

  T.active = false;
  T.index = 0;
  T.introIdx = 0;
  T.steps = [];
  T.pending = [];

  var _stage = 'idle'; // 'intro' | 'round'
  var _pendingRoundAdvance = false; // round_end のstepを見せてからZで次回転へ進める合図(保険。実際の台本には無い)

  // ---- show（案内文を出す唯一の経路。ここで必ず hold=true・SPEC §9） -----------------
  T.show = function (text) {
    RL.UI.tutorialBox(text, true);
    RL.Game.state.hold = true;
  };

  function showNextPending() {
    var t = T.pending.shift();
    T.show(t);
  }

  function queueOrShow(text) {
    if (RL.Game.state.hold) {
      T.pending.push(text);
    } else {
      T.show(text);
    }
  }

  // 6回目終了時は完了画面、それ以外は次の回転へ（§9）。
  function advanceRound() {
    if (T.index === 5) {
      RL.Game.state.phase = 'complete';
      RL.Scene.clearChips();
      RL.Game.state.bets = {};
      RL.Game.state.betOrder = [];
      RL.UI.showComplete(RL.Game.state.balance);
      return;
    }
    T.index += 1;
    RL.Game.startRound(T.SCRIPT[T.index]);
  }

  // ---- start（§9）。呼ぶ側(main.js)が先に RL.Game.newGame() を呼んでいる前提。
  // ここではnewGameを呼ばない(導入3ページの途中はGame.startRoundを呼ばずTutorial.confirm()の
  // 「3ページ終わったら」分岐でのみ呼ぶため)。呼ぶ側がnewGame()を省くと、#complete/#gameoverの
  // 前の画面が導入文の後ろに残ったまま消えない事故になる(main.jsのTキー処理で対応済み)。
  T.start = function () {
    T.active = true;
    T.index = 0;
    T.introIdx = 0;
    T.steps = [];
    T.pending = [];
    _stage = 'intro';
    _pendingRoundAdvance = false;
    T.show(T.INTRO[0]);
  };

  // ---- onRoundStart（§9追記。Game.startRoundの冒頭から呼ばれ、現在のindexの台本に steps を合わせる） --
  T.onRoundStart = function () {
    var script = T.SCRIPT[T.index];
    T.steps = (script && script.steps) ? script.steps.slice() : [];
  };

  // ---- onEvent（§9。先頭のstepとだけ照合。round_endは台本に無くても即進める） -----------
  T.onEvent = function (name, data) {
    if (!T.active || _stage !== 'round') return undefined;
    var top = T.steps[0];
    if (top && top.on === name) {
      T.steps.shift();
      if (name === 'round_end') _pendingRoundAdvance = true;
      queueOrShow(top.text);
      return 'hold';
    }
    if (name === 'round_end') {
      // この台本のどの回転にも round_end の step は無いため、文を出さずそのまま次へ進める。
      // (index===5なら advanceRound() が完了画面を出す。この分岐では hold を立てない。)
      advanceRound();
      return undefined;
    }
    return undefined;
  };

  // ---- confirm（Z。§9） ---------------------------------------------------------
  T.confirm = function () {
    if (T.pending.length) {
      showNextPending();
      return;
    }
    if (_stage === 'intro') {
      if (T.introIdx + 1 < T.INTRO.length) {
        T.introIdx += 1;
        T.show(T.INTRO[T.introIdx]);
      } else {
        _stage = 'round';
        RL.Game.newGame();
        RL.Game.startRound(T.SCRIPT[0]);
      }
      return;
    }
    if (_pendingRoundAdvance) {
      _pendingRoundAdvance = false;
      RL.UI.hideTutorial();
      advanceRound();
      return;
    }
    RL.UI.hideTutorial();
    RL.Game.resume();
  };
})();
