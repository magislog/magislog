var SG = (typeof window !== 'undefined') ? (window.SG = window.SG || {}) : (global.SG = global.SG || {});

// SG.Tutorial: 導入 4 ページ → レッスン 5 本(人間 5 手)→ 完了画面。SPEC.md §8 準拠。
// ★案内文(導入・レッスン説明・解説・完了)を出す関数は show() だけ。
//   帯を表示する UI 関数を呼ぶのも state.hold を書くのも show()/confirm()/cancel()/stop() のここだけ(§8.2・§10.1)。
(function () {

  SG.Tutorial = SG.Tutorial || {};
  var T = SG.Tutorial;

  T.active = false;
  T.stage = 'intro';   // 'intro' | 'pre' | 'wait' | 'post' | 'complete'
  T.index = 0;          // レッスン番号 0〜4
  T.page = 0;           // 導入ページ 0〜3

  // §8.5 導入 4 ページ
  T.INTRO = [
    '将棋の練習をはじめます。相手は かなめ。あなたは先手（下側・文字がこちらを向いている駒）です。案内が出ている間は Z で次へ進みます。',
    '駒は 8 種類。玉・飛・角・金・銀・桂・香・歩。相手の陣地（上の 3 段）に入るか出るときに「成る」ことができ、動きが変わります。歩→と、香→杏、桂→圭、銀→全、角→馬、飛→竜。金と玉は成りません。',
    '取った駒は自分の持ち駒になり、空いているマスに「打つ」ことができます。同じ筋に歩を 2 枚（二歩）、次に動けないマス（一番奥の歩・香、奥 2 段の桂）には打てません。自分の玉が取られる手も指せません。',
    '操作: ←↑→↓ でカーソル、Z で決定、X で戻る。一番下の段で ↓ を押すと持ち駒へ移ります。S でメニュー（タイトルへ）。相手の玉を詰ませば勝ちです。'
  ];

  // §8.6 レッスン 5 本(setup の SFEN・allow・cpu は表の値をそのまま使う)
  T.LESSONS = [
    {
      title: '歩を進める',
      setup: 'lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1',
      text: 'まずは歩を進めます。光っている 7七の歩（下から 3 段目・左から 3 列目）にカーソルを合わせて Z、7六（1 つ上）で Z。',
      allow: ['7g7f'],
      hint: '7七の歩 → 7六',
      cpu: '3c3d',
      after: 'かなめは 3四歩と指しました。歩は 1 マスずつ前に進みます。次は角の出番です。'
    },
    {
      title: '取る・成る',
      setup: 'continue',
      text: '7六に歩が進んだので角の道が開きました。8八の角で 2二にいる相手の角を取れます。角は斜めにどこまでも進めます。取るときに「成りますか？」と出るので「成る」を選んでください（角→馬）。',
      allow: ['8h2b+'],
      hint: '8八の角 → 2二（成る）',
      cpu: '3a2b',
      after: '取った角は右下のあなたの駒台に入りました。かなめは 3一の銀で馬を取り返し、かなめの駒台にも角が入りました。'
    },
    {
      title: '持ち駒を打つ',
      setup: 'continue',
      text: '持ち駒を打ちます。一番下の段で ↓ を押して駒台へ移り、角を選んで Z。4五（上から 5 段目・右から 4 列目）で Z。',
      allow: ['B*4e'],
      hint: '駒台の角 → 4五に打つ',
      cpu: '7a6b',
      after: '打った角は 6三と 3四の歩を同時にねらっています（両取り）。かなめは 6二銀で 6三を守りました。'
    },
    {
      title: '王手',
      setup: '4k4/9/9/9/9/9/9/7R1/4K4 b - 1',
      text: '王手をかけます。局面が変わりました。2八の飛車を 2一へ進めて竜に成ると、相手の玉に利きが通ります。これが「王手」です。',
      allow: ['2h2a+'],
      hint: '2八の飛 → 2一（成る）',
      cpu: '5a5b',
      after: '王手をかけられた側は、玉を逃がす・取る・間に駒を入れる のどれかで必ず受けます。かなめは 5二へ逃げました。'
    },
    {
      title: '詰み',
      setup: '4k4/9/4P4/9/9/9/9/9/4K4 b G 1',
      text: '仕上げは詰みです。持ち駒の金を 5二に打ちます。玉の逃げ場が全部なくなり、金も取れなければ「詰み」＝あなたの勝ちです。',
      allow: ['G*5b'],
      hint: '駒台の金 → 5二に打つ',
      cpu: null,
      after: '詰み！ 5三の歩が金を守っているので玉は金を取れず、逃げ場もありません。これが「頭金」です。Z で完了画面へ。'
    }
  ];

  // ------------------------------------------------------------------
  // 内部ヘルパー(SG.Tutorial の公開 API には出さない。§1 の一覧に無いもの)
  // ------------------------------------------------------------------

  // 先手の駒台で駒種 t が何番目のチップか(§6.4: 枚数 1 以上の駒種だけを HAND_ORDER 順に並べた配列の添字)
  function chipIndexFor(t) {
    var order = SG.CONFIG.HAND_ORDER;
    var hand = (SG.Game.state.pos.hands && SG.Game.state.pos.hands[0]) || {};
    var idx = -1;
    var n = 0;
    var i;
    for (i = 0; i < order.length; i++) {
      if ((hand[order[i]] || 0) > 0) {
        if (order[i] === t) idx = n;
        n++;
      }
    }
    return idx;
  }

  // §8.2 confirm() の 'pre' 分岐: カーソルを from(打つ手なら駒台の該当チップ)に置く
  function setCursorTo(from) {
    var st = SG.Game.state;
    if (!from) return;
    if (from.drop) {
      var idx = chipIndexFor(from.drop);
      st.cursor = { zone: 'hand', r: st.cursor.r, c: st.cursor.c, i: idx >= 0 ? idx : 0 };
    } else {
      st.cursor = { zone: 'board', r: from.r, c: from.c, i: 0 };
    }
  }

  // レッスンの allow[0](USI 文字列)を現在の pos で解決して markHint/setCursorTo 用の {from, to} を返す
  function resolveAllowedMove(str) {
    var m = SG.Rules.strToMove(SG.Game.state.pos, str);
    if (!m) {
      console.warn('レッスンの allow が非合法: ' + str);
      return null;
    }
    var from = m.from ? m.from : { drop: m.drop };
    return { from: from, to: m.to };
  }

  // §8.3 beginLesson(i)
  function beginLesson(i) {
    T.index = i;
    T.stage = 'pre';
    var lesson = T.LESSONS[i];
    if (lesson.setup !== 'continue') {
      SG.Game.loadPosition(lesson.setup);
    }
    T.show(lesson.text, { page: 'レッスン ' + (i + 1) + ' / 5' });
  }

  // §8.7 完了画面
  function complete() {
    T.stage = 'complete';
    SG.UI.showBanner('チュートリアル完了', 'おつかれさまでした', '');
    T.show('チュートリアル完了。Z: フリープレイへ ／ X: タイトルへ');
  }

  // ------------------------------------------------------------------
  // SG.Tutorial 公開 API(§1 の一覧のとおり)
  // ------------------------------------------------------------------

  // タイトルで「チュートリアル」を選んだときに呼ばれる(§7.4 phase==='title' の分岐)
  T.start = function () {
    T.active = true;
    T.stage = 'intro';
    T.page = 0;
    T.index = 0;
    SG.Game.startTutorialGame();
    T.show(T.INTRO[T.page], { page: (T.page + 1) + ' / 4' });
  };

  // §8.2・§10.1: 案内文(導入・説明・解説・完了)を出す唯一の経路
  T.show = function (text, meta) {
    SG.Game.state.hold = true;
    SG.UI.showBand(text, meta);
    SG.Game.render();
  };

  // §8.2: hold 中に ok。§10.4 により自分自身を try/catch で包む
  T.confirm = function () {
    try {
      SG.Game.state.hold = false;
      SG.UI.hideBand();
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
          SG.UI.message(lesson.hint);
          var resolved = resolveAllowedMove(lesson.allow[0]);
          if (resolved) {
            SG.UI.markHint(resolved.from, resolved.to);
          }
          SG.Game.state.phase = 'select';
          if (resolved) {
            setCursorTo(resolved.from);
          }
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
          SG.Game.startFree();
          break;
        default:
          break;
      }
      SG.Game.render();
    } catch (e) {
      console.error(e);
      SG.Game.recover();
    }
  };

  // §8.2: hold 中に cancel。'complete' のときだけタイトルへ
  T.cancel = function () {
    if (T.stage === 'complete') {
      SG.Game.state.hold = false;
      SG.UI.hideBand();
      T.stop();
      SG.Game.toTitle();
    }
    // それ以外の stage では何もしない(案内文は Z で進める。X で戻る先は作らない)
  };

  // §8.2: チュートリアルを止める(タイトルへ戻るときなど)
  T.stop = function () {
    T.active = false;
    T.stage = 'intro';
    T.index = 0;
    T.page = 0;
    SG.Game.state.hold = false;
    SG.UI.hideBand();
    SG.UI.clearHint();
  };

  // §8.4
  T.onEvent = function (name, data) {
    if (!T.active) return;
    if (name === 'human_moved') {
      if (T.stage !== 'wait') return;
      SG.UI.clearHint();
      var lesson = T.LESSONS[T.index];
      if (lesson.cpu) {
        SG.Game.scheduleCpu();
      } else {
        T.stage = 'post';
        T.show(lesson.after);
      }
    } else if (name === 'cpu_moved') {
      T.stage = 'post';
      T.show(T.LESSONS[T.index].after);
    } else if (name === 'finished') {
      SG.UI.clearHint();
      T.stage = 'post';
      T.show(T.LESSONS[T.index].after);
    } else if (name === 'ok_over') {
      // §8.4: 通常は来ない保険。来たら完了画面へ
      complete();
    }
  };

  // §8.3: wait 中だけ allow 配列。それ以外は null(制限なし)
  T.allowed = function () {
    if (T.stage === 'wait') return T.LESSONS[T.index].allow;
    return null;
  };

  // §8.4: 台本の返し手。無効なら console.warn して null(呼び出し側で AI.choose にフォールバック)
  T.cpuReply = function () {
    if (!T.active) return null;
    if (T.stage !== 'wait' && T.stage !== 'post') return null;
    var lesson = T.LESSONS[T.index];
    if (!lesson.cpu) return null;
    var m = SG.Rules.strToMove(SG.Game.state.pos, lesson.cpu);
    if (!m) {
      console.warn('台本の手が非合法: ' + lesson.cpu);
      return null;
    }
    return m;
  };

  // wait 中に #msg へ出す 1 行(§8.3)
  T.lessonHint = function () {
    if (T.stage === 'wait') return T.LESSONS[T.index].hint;
    return '';
  };

})();
