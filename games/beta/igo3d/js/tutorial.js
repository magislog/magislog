var IG = (typeof window !== 'undefined') ? (window.IG = window.IG || {}) : (global.IG = global.IG || {});

// IG.Tutorial — 導入 4 ページ → レッスン 5 本(人間 5 手) → 完了画面。SPEC.md §8 準拠。
//
// ★案内文(導入・レッスン説明・解説・完了)を出す関数は show() だけ。帯を表示する UI の
//   関数を呼ぶのも、state.hold を書くのも、show()/confirm()/cancel()/stop() のここだけ
//   (§8.2・§10.1)。他のファイルはこれらを直接いじらない。
// ★レッスンの許す手(allow)は beginLesson() で Rules.parseMove して move の配列にしておき、
//   照合は必ず Rules.sameMove の構造比較で行う。文字列にしない(§8.3・§10.5)。
(function () {

  IG.Tutorial = IG.Tutorial || {};
  var T = IG.Tutorial;

  T.active = false;
  T.stage = 'intro';   // 'intro' | 'pre' | 'wait' | 'post' | 'complete'
  T.index = 0;          // レッスン番号 0〜4
  T.page = 0;           // 導入ページ 0〜3

  // §8.5 導入 4 ページ
  T.INTRO = [
    '囲碁の練習をはじめます。相手は そら（白）。あなたは黒で、先に打ちます。案内が出ている間は Z で次へ進みます。',
    '石は線の交わる点（交点）に置きます。9路盤の交点は 81 個。置いた石は動かせません。石の上下左右の空いている点を「呼吸点」と呼び、呼吸点が 0 になった石は取られて盤から消えます。くっついた同じ色の石はひとかたまりで数えます。',
    '打てない手が 2 つ。①置いた瞬間に自分の石の呼吸点が 0 になる手（自殺手）。ただし相手の石を取れるなら打てます。②取られた直後に同じ形へ戻す手（コウ）。ほかへ 1 手打ってからなら打てます。',
    '操作: ←↑→↓ でカーソル、Z で石を置く、S でメニュー（パス・投了・タイトル）。打つところが無くなったらパス。両方が続けてパスすると終局です。囲った空点が「地」。地＋取った石の多いほうが勝ち。白は後手なので 6.5 目（コミ）をもらいます。'
  ];

  // §8.6 レッスン 5 本(setup の局面文字列・allow・cpu は表の値をそのまま使う)
  T.LESSONS = [
    {
      title: '石を置く',
      setup: '........./........./........./........./........./........./........./........./......... b 0-0 -',
      text: 'まずは石を置きます。カーソルを盤の真ん中 E5（天元）に合わせて Z。盤の上の A〜J が横の位置、右の 9〜1 が縦の位置です。',
      allow: ['E5'],
      hint: 'E5 に打つ',
      cpu: 'C3',
      after: 'そらは C3 に打ちました。黒と白が交互に 1 手ずつ打ちます。置いた石は動かせません。最後に打った石には小さな点が付きます。'
    },
    {
      title: '取る',
      setup: '........./........./........./....X..../...XOX.../........./........./........./......... b 0-0 -',
      text: '石を取ります。白の E5 は上下左右のうち 3 つを黒に囲まれ、呼吸点が E4 の 1 つだけ（アタリ）です。E4 に打つと呼吸点が 0 になり、白石を取れます。',
      allow: ['E4'],
      hint: 'E4 に打つ',
      cpu: null,
      after: '白石が消え、右のパネルの「取った石」が 1 になりました。取った石は終局のときに自分の点になります。'
    },
    {
      title: '自殺手',
      setup: '........./........./........./....O..../...O.O.../....O..../........./........./......... b 0-0 -',
      text: '打てない手。E5 は白に四方を囲まれています。試しに E5 で Z を押すと「そこには打てません（自殺手）」と出ます。確かめたら、指示の C7 に打ってください。',
      allow: ['C7'],
      hint: 'C7 に打つ（E5 は打てない）',
      cpu: 'G3',
      after: '置いた瞬間に呼吸点が 0 になる手は打てません。ただし、その手で相手の石を取れるときは打てます（取ったあとに呼吸点ができるため）。そらは G3 に打ちました。'
    },
    {
      title: 'コウ',
      setup: '........./........./........./....XO.../...XO.O../....XO.../........./........./......... b 0-1 F5',
      text: 'コウ。白は F5 にあった黒石を取ったところです（赤い枠が今打てない点）。F5 に打ち返すと 1 手前と同じ形に戻るので、すぐには打てません。試したら、指示の C3 に打ってください。',
      allow: ['C3'],
      hint: 'C3 に打つ（F5 は今は打てない）',
      cpu: 'F5',
      after: 'そらは F5 に繋ぎました。コウを取られた側は、ほかの場所に 1 手打ってからでないと取り返せません。その間に相手は繋ぐことができます。'
    },
    {
      title: '終局と地',
      setup: '..OX...../..OX...../..OX...../..OX...../..OX...../..OX...../..OX...../..OX...../..OX..... b 2-0 -',
      text: '終局と地。黒は D の列、白は C の列で盤を分け合いました。もう打つ場所がありません。S でメニューを開き「パス」を選んでください。そらもパスすると終局です。',
      allow: ['pass'],
      hint: 'S → メニュー → パス',
      cpu: 'pass',
      after: '両者が続けてパスしたので終局。囲った空点が「地」です。黒: 地 45 ＋ 取った石 2 ＝ 47。白: 地 18 ＋ 取った石 0 ＋ コミ 6.5 ＝ 24.5。黒の 22.5 目勝ち。Z で完了画面へ。'
    }
  ];

  // ------------------------------------------------------------------
  // 内部ヘルパー(IG.Tutorial の公開 API には出さない。§1 の一覧に無いもの)
  // ------------------------------------------------------------------

  // wait 中に humanMove から照合される許す手(move の配列)。beginLesson で作っておく(§8.3)
  var allowMoves = null;

  // §8.3 beginLesson(i): レッスンの局面を読み込み、説明文を表示する(hold が立つのでまだ操作できない)
  function beginLesson(i) {
    T.index = i;
    T.stage = 'pre';
    var lesson = T.LESSONS[i];

    allowMoves = [];
    var k;
    for (k = 0; k < lesson.allow.length; k++) {
      var mv = IG.Rules.parseMove(lesson.allow[k]);
      if (mv === null) {
        console.error('レッスンの allow が壊れています: ' + lesson.allow[k]);
      } else {
        allowMoves.push(mv);
      }
    }

    IG.Game.loadPosition(lesson.setup);   // 前のレッスンの局面を引き継がない
    IG.Game.state.phase = 'play';
    T.show(lesson.text, { page: 'レッスン ' + (i + 1) + ' / 5' });
  }

  // §8.7 完了画面
  function complete() {
    T.stage = 'complete';
    IG.UI.showBanner('チュートリアル完了', 'おつかれさまでした', '');
    T.show('チュートリアル完了。Z: フリープレイへ ／ X: タイトルへ');
  }

  // ------------------------------------------------------------------
  // IG.Tutorial 公開 API(§1 の一覧のとおり)
  // ------------------------------------------------------------------

  // タイトルで「チュートリアル」を選んだときに呼ばれる(§7.4 phase==='title' の分岐)
  T.start = function () {
    T.active = true;
    T.stage = 'intro';
    T.page = 0;
    T.index = 0;
    IG.Game.state.mode = 'tutorial';
    IG.UI.hideTitle();
    IG.UI.hideBanner();
    IG.UI.hideMenu();
    T.show(T.INTRO[T.page], { page: (T.page + 1) + ' / 4' });
  };

  // §8.2・§10.1: 案内文(導入・説明・解説・完了)を出す唯一の経路
  T.show = function (text, meta) {
    IG.Game.state.hold = true;
    IG.UI.showBand(text, meta);
    IG.Game.render();
  };

  // §8.2: hold 中に ok。自分自身を try/catch で包み、失敗したら Game.recover() に任せる(§10.4)
  T.confirm = function () {
    try {
      IG.Game.state.hold = false;
      IG.UI.hideBand();

      switch (T.stage) {
        case 'intro':
          T.page += 1;
          if (T.page < 4) {
            T.show(T.INTRO[T.page], { page: (T.page + 1) + ' / 4' });
          } else {
            beginLesson(0);
          }
          break;

        case 'pre': {
          T.stage = 'wait';
          var lesson = T.LESSONS[T.index];
          IG.UI.message(lesson.hint);
          var target = allowMoves && allowMoves[0];
          if (target && target.kind === 'play') {
            IG.UI.markHint({ r: target.r, c: target.c });
            IG.Game.state.cursor = { r: target.r, c: target.c };
          } else {
            IG.UI.markHint(null);              // pass の指示点は印を出さない
            IG.Game.state.cursor = { r: 4, c: 4 };
          }
          IG.Game.state.phase = 'play';
          break;
        }

        case 'post':
          if (T.index + 1 < 5) {
            beginLesson(T.index + 1);
          } else {
            complete();
          }
          break;

        case 'complete':
          T.stop();
          IG.Game.startFree();
          break;

        default:
          break;
      }
      IG.Game.render();
    } catch (e) {
      console.error(e);
      IG.Game.recover();
    }
  };

  // §8.2: hold 中に cancel。'complete' のときだけタイトルへ。それ以外は何もしない
  T.cancel = function () {
    if (T.stage === 'complete') {
      IG.Game.state.hold = false;
      IG.UI.hideBand();
      T.stop();
      IG.Game.toTitle();
    }
  };

  // §8.2: チュートリアルを止める(タイトルへ戻るときなど)
  T.stop = function () {
    T.active = false;
    T.stage = 'intro';
    T.index = 0;
    T.page = 0;
    IG.Game.state.hold = false;
    IG.UI.hideBand();
    IG.UI.clearHint();
  };

  // §8.4
  T.onEvent = function (name, data) {
    if (!T.active) return;
    if (name === 'human_moved') {
      if (T.stage !== 'wait') return;
      IG.UI.clearHint();
      var lesson = T.LESSONS[T.index];
      if (lesson.cpu) {
        IG.Game.scheduleCpu();
      } else {
        T.stage = 'post';
        T.show(lesson.after);
      }
    } else if (name === 'cpu_moved') {
      T.stage = 'post';
      T.show(T.LESSONS[T.index].after);
    } else if (name === 'finished') {
      IG.UI.clearHint();
      T.stage = 'post';
      T.show(T.LESSONS[T.index].after);   // レッスン 5 の終局用。banner は出さず案内帯で説明する
    } else if (name === 'ok_over') {
      complete();                          // 通常は来ない保険(§8.4)
    }
  };

  // §8.3: wait 中だけ許す手の配列(move の配列)。それ以外は null(制限なし)
  T.allowed = function () {
    if (T.stage === 'wait') return allowMoves;
    return null;
  };

  // §8.4: 台本の返し手。無効なら console.warn して null(呼び出し側で AI.choose にフォールバック)
  T.cpuReply = function () {
    if (!T.active) return null;
    if (T.stage !== 'wait' && T.stage !== 'post') return null;
    var lesson = T.LESSONS[T.index];
    if (!lesson.cpu) return null;
    var m = IG.Rules.strToMove(IG.Game.state.pos, lesson.cpu);
    if (!m) {
      console.warn('台本の手が非合法: ' + lesson.cpu);
      return null;
    }
    return m;
  };

})();
