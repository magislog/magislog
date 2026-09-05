var FD = (typeof window !== 'undefined') ? (window.FD = window.FD || {}) : (global.FD = global.FD || {});

// FD.Tutorial — 導入 3 ページ → レッスン 4 本 → 完了画面。SPEC.md §8 準拠。
//
// ★このファイルはファイルの先頭(読み込み時)で document・window・FD.Game・FD.UI を参照しない
//   (LESSONS の done/hintFor を node で検算するため。SPEC.md §1・§11.1 #24)。
//   FD.Game/FD.UI を呼ぶのは、下の各関数の「中」だけ。
// ★案内文(導入・レッスン説明・解説・完了)を出す関数は show() だけ。帯を表示する UI の処理を
//   呼ぶのも、state.hold を true にするのも show() の中の 1 行だけ。false にするのは
//   confirm()/cancel()/stop() の 3 か所だけ(§8.2・§10.1)。他のファイルはこれらを直接いじらない。
// ★レッスンの done(fund, base, view) と hintFor(fund, view) は fund・base・view だけを見る
//   純粋関数(DOM に触らない)。同一判定は id・cursor などの構造比較で行い、文字列化して比べない
//   (§10.5)。
(function () {

  FD.Tutorial = FD.Tutorial || {};
  var T = FD.Tutorial;

  T.active = false;
  T.stage = 'intro';    // 'intro' | 'pre' | 'wait' | 'post' | 'complete'
  T.index = 0;             // レッスン番号 0〜3
  T.page = 0;               // 導入ページ 0〜2
  T.base = null;             // レッスン開始時の snapshot(fund)

  // §8.4 導入 3 ページ
  T.INTRO = [
    '投資ファンドの練習をはじめます。あなたはファンドの運用担当。開始の現金は 1,000 万円。6 つの銘柄を売買して、30 日後に資産をどれだけ増やせるかを競います。案内が出ている間は Z で次へ進みます。',
    '1 日 1 ターン。表の一番下の「次の日へ」を押すと、6 銘柄の株価が動きます。動き方は 乱数 ＋ 業種の傾向（IT は大きく動く・食品は小さく動く・エネルギーは中くらい）＋ ニュース の合計です。上の帯に 現金・株の評価額・合計・前日比・開始からの騰落率 が出ます。',
    '毎日 1 本ニュースが出ます。右上の「対象」と「予想」を見て、上がりやすい業種を買い、下がりやすい業種を売るのが基本です。ニュースは「次の日へ」を押したときに効きます。売買の手数料は代金の 0.1%。S でメニュー（タイトルへ戻れます）。'
  ];

  // §8.5 レッスン 4 本。done・hintFor は fund・base・view だけを見る純粋関数(DOM・Game・UI に触らない)
  T.LESSONS = [
    {
      title: '銘柄を見る',
      text: '左の表が 6 銘柄、右のチャートが選んでいる銘柄の直近 20 日です。今日のニュースは「IT に好材料」。IT の株は明日 必ず上がります。↓ を 1 回押して QBIT（キュービット・IT）に合わせてください。',
      hint: '↓ で QBIT に合わせる',
      done: function (fund, base, view) {
        return view.cursor === 1;
      },
      hintFor: function (fund, view) {
        return { kind: 'row', index: 1 };
      },
      after: 'QBIT を選ぶと右のチャートが QBIT になります。「前日比」の列は きのうからの値動き、「損益」は持っている株の含み損益です。'
    },
    {
      title: '買う',
      text: 'QBIT に合わせたまま Z で売買を開きます。「買う」の行で 3 を押す（割合 30%）と、現金の 30% で買える株数と支払額が出ます。Z で買います。',
      hint: 'Z → 買う の行で 3 → Z',
      done: function (fund, base, view) {
        return fund.stats.buys > base.buys && fund.pos.qbit.shares > 0;
      },
      hintFor: function (fund, view) {
        return view.dialogId === 'qbit' ? { kind: 'dialogRow', index: 0 } : { kind: 'row', index: 1 };
      },
      after: '買いました。現金が減り、株の評価額が増えます。合計は 手数料（代金の 0.1%・切り捨て）のぶんだけ減ります。X でダイアログを閉じてください。'
    },
    {
      title: '次の日へ',
      text: 'X で閉じ、↓ で一番下の「次の日へ」に合わせて Z。株価が動き、あしたのニュースが出ます。',
      hint: 'X で閉じる → ↓ で 次の日へ → Z',
      done: function (fund, base, view) {
        return fund.day > base.day;
      },
      hintFor: function (fund, view) {
        return view.dialogId !== null ? { kind: 'dialogRow', index: 2 } : { kind: 'row', index: 6 };
      },
      after: '2 日目。好材料の IT は 2 銘柄とも上がりました（好材料は必ず上がり、悪材料は必ず下がります。うわさと景気は外れることがあります）。上の帯の 前日比 と 開始から を見てください。'
    },
    {
      title: '売る',
      text: '上がった QBIT を売って利益を確定します。QBIT で Z → ↓ で「売る」の行 → 9（90%）→ Z。',
      hint: 'QBIT で Z → ↓ 売る → 9 → Z',
      done: function (fund, base, view) {
        return fund.stats.sells > base.sells;
      },
      hintFor: function (fund, view) {
        return view.dialogId === 'qbit' ? { kind: 'dialogRow', index: 1 } : { kind: 'row', index: 1 };
      },
      after: '売りました。受取は 代金 − 手数料 です。残りの 10% はまだ持っています（売るときも 10〜90% なので、全部売るなら 90% を繰り返します）。X で閉じると完了です。'
    }
  ];

  // ------------------------------------------------------------------
  // FD.Tutorial 公開 API(§1 の一覧のとおり)
  // ------------------------------------------------------------------

  // §8.3: レッスン開始時の数値スナップショット(比較用のコピーだけ・DOM に触らない)
  T.snapshot = function (fund) {
    return { buys: fund.stats.buys, sells: fund.stats.sells, day: fund.day };
  };

  // タイトルで「チュートリアル」を選んだときに呼ばれる(§7.4 phase==='title' の分岐・§8.2)
  T.start = function () {
    T.active = true;
    T.stage = 'intro';
    T.page = 0;
    T.index = 0;
    FD.Game.state.mode = 'tutorial';
    FD.UI.hideTitle();
    var f = FD.Fund.newFund(FD.CONFIG.TUTORIAL.SEED, FD.CONFIG.TUTORIAL.FIRST_NEWS);
    FD.Game.loadFund(f);
    if (!f) {
      console.error('Tutorial.start: Fund.newFund() が null です（config.js の TUTORIAL を確認してください）');
      T.stop();
      FD.Game.toTitle();
      return;
    }
    FD.Game.state.phase = 'play';
    FD.Game.state.cursor = 0;
    FD.Game.message('チュートリアル');
    T.show(T.INTRO[0], { page: '1 / 3' });
  };

  // §8.2・§10.1: 案内文(導入・説明・解説・完了)を出す唯一の経路。hold を立てる行もここの 1 行だけ
  T.show = function (text, meta) {
    FD.Game.state.hold = true;
    FD.UI.showBand(text, meta);
    FD.Game.render();
  };

  // §8.2: hold 中に ok。自分自身を try/catch で包み、失敗したら Game.recover() に任せる(§10.4)
  T.confirm = function () {
    try {
      FD.Game.state.hold = false;
      FD.UI.hideBand();

      if (T.stage === 'intro') {
        T.page += 1;
        if (T.page < 3) {
          T.show(T.INTRO[T.page], { page: (T.page + 1) + ' / 3' });
        } else {
          T.beginLesson(0);
        }
      } else if (T.stage === 'pre') {
        T.stage = 'wait';
        FD.UI.task('いま: ' + T.LESSONS[T.index].hint);
        T.onEvent('enter');            // 既に条件を満たしていれば即 post へ
      } else if (T.stage === 'post') {
        FD.UI.task('');
        if (T.index + 1 < 4) {
          T.beginLesson(T.index + 1);
        } else {
          T.complete();
        }
      } else if (T.stage === 'complete') {
        T.stop();
        FD.Game.toFree();             // Z = このファンドのまま 30 日目まで続ける（フリープレイ）
      }

      FD.Game.render();
    } catch (e) {
      console.error(e);
      FD.Game.recover();
    }
  };

  // §8.2: hold 中に cancel。'complete' のときだけタイトルへ。それ以外は何もしない(案内文は Z で進める)
  T.cancel = function () {
    if (T.stage === 'complete') {
      FD.Game.state.hold = false;
      FD.UI.hideBand();
      T.stop();
      FD.Game.toTitle();               // X = タイトルへ
    }
    // それ以外は何もしない(§8.2: X で戻る先は作らない)
  };

  // §8.2: チュートリアルを止める(タイトルへ戻るときなど)
  T.stop = function () {
    T.active = false;
    T.stage = 'intro';
    T.index = 0;
    T.page = 0;
    T.base = null;
    FD.Game.state.hold = false;
    FD.UI.hideBand();
    FD.UI.task('');
    FD.UI.markHint(null);
  };

  // §8.3: レッスン i を開始する。同じファンドのまま続ける(newFund はやり直さない)
  T.beginLesson = function (i) {
    T.index = i;
    T.stage = 'pre';
    T.base = T.snapshot(FD.Game.state.fund);
    T.show(T.LESSONS[i].text, { page: 'レッスン ' + (i + 1) + ' / 4' });
  };

  // §8.6: 完了画面(帯だけ)
  T.complete = function () {
    T.stage = 'complete';
    T.show('チュートリアル完了。悪材料の業種は前日に売り、好材料の業種は前日に買う、が基本です。Z: このファンドのまま 30 日目まで続ける（フリープレイ） ／ X: タイトルへ');
  };

  // §8.3: Game が呼ぶ。name = 'enter' | 'move' | 'open' | 'close' | 'trade' | 'day'
  T.onEvent = function (name, data) {
    if (!T.active || T.stage !== 'wait') return;
    var lesson = T.LESSONS[T.index];
    if (lesson.done(FD.Game.state.fund, T.base, FD.Game.view())) {
      T.stage = 'post';
      FD.UI.task('');
      T.show(lesson.after);
    }
  };

  // §6.6・§8.3: Game.render() が毎回呼ぶ。wait 中だけ指示の場所を返す(null 安全)
  T.hintFor = function (fund, view) {
    if (!T.active || T.stage !== 'wait' || !fund) return null;
    return T.LESSONS[T.index].hintFor(fund, view);
  };

})();
