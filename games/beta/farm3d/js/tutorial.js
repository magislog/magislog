var FM = (typeof window !== 'undefined') ? (window.FM = window.FM || {}) : (global.FM = global.FM || {});

// FM.Tutorial — 導入 3 ページ → レッスン 7 本 → 完了画面。SPEC.md §8 準拠。
//
// ★このファイルはファイルの先頭(読み込み時)で document・window・FM.Game・FM.UI を参照しない
//   (LESSONS の done/hintTile を node で検算するため。SPEC.md §1・§11.1 #23)。
//   FM.Game/FM.UI を呼ぶのは、下の各関数の「中」だけ。
// ★案内文(導入・レッスン説明・解説・完了)を出す関数は show() だけ。帯を表示する UI の処理を
//   呼ぶのも、state.hold を書くのも、show()/confirm()/cancel()/stop() のここだけ(§8.2・§10.1)。
//   他のファイルはこれらを直接いじらない。
// ★レッスンの done(world, base) と hintTile(world) は world/base だけを見る純粋関数(DOM に触らない)。
//   位置の判定はすべて FM.World.samePos か構造比較で行い、文字列化して比べない(§10.5)。
(function () {

  FM.Tutorial = FM.Tutorial || {};
  var T = FM.Tutorial;

  T.active = false;
  T.stage = 'intro';    // 'intro' | 'pre' | 'wait' | 'post' | 'complete'
  T.index = 0;            // レッスン番号 0〜6
  T.page = 0;              // 導入ページ 0〜2
  T.base = null;            // レッスン開始時の snapshot(world)

  // §8.4 導入 3 ページ
  T.INTRO = [
    '牧場の練習をはじめます。あなたは青い四角のキャラ。矢印で 1 マスずつ歩きます。進めない方向へ押すと、動かずに向きだけ変わります（黒い印が向き）。案内が出ている間は Z で次へ進みます。',
    '道具は 4 つ。1 くわ（耕す）／ 2 じょうろ（水やり）／ 3 たね（まく）／ 4 かご（収穫）。数字キーで持ち替え、Z で黄色い枠のマスに使います。枠はふだん足元にあり、家のドア・出荷箱・店の前で向くとそちらに移ります。',
    '作物は たね → め → わかい → みのり の 4 段階。水をやった日にだけ、寝ると 1 段階育ちます。体力は 耕す 5・水やり 2・収穫 3 減り、0 になると倒れて朝になります。実ったら収穫して出荷箱へ。翌朝お金になります。S でメニュー（タイトルへ戻れます）。'
  ];

  // ------------------------------------------------------------------
  // 内部ヘルパー(FM.Tutorial の公開 API には出さない。§1 の一覧に無いもの)
  // world/base だけを引数に取る純粋関数。FM.World・FM.CONFIG は参照してよい(load 時に実行されないため)
  // ------------------------------------------------------------------

  // 範囲 [r0,r1]×[c0,c1] を r 昇順 → c 昇順で走査し、条件に合う最初のタイル位置を返す(§10.4: null 安全)
  function findTile(world, r0, c0, r1, c1, pred) {
    var r, c, t;
    for (r = r0; r <= r1; r++) {
      for (c = c0; c <= c1; c++) {
        t = FM.World.at(world, r, c);
        if (t && pred(t)) return { r: r, c: c };
      }
    }
    return null;
  }

  function fullMap(world, pred) {
    var CFG = FM.CONFIG;
    return findTile(world, 0, 0, CFG.ROWS - 1, CFG.COLS - 1, pred);
  }

  // §8.5 レッスン 7 本
  T.LESSONS = [
    {
      title: '耕す',
      text: 'まず畑を作ります。1 を押して「くわ」を持ち、青い点線のマス（家の下の草地）まで歩いて乗り、Z。足元の草地が土になります。',
      hint: '1 くわ → 点線のマスに乗って Z',
      done: function (world, base) {
        return world.stats.tilled > base.tilled;
      },
      hintTile: function (world) {
        var F = FM.CONFIG.FIELD;
        return findTile(world, F.r0, F.c0, F.r1, F.c1, function (t) { return t.type === 'grass'; });
      },
      after: '土になりました。耕せるのは草地だけで、道・水・柵は耕せません。右上の体力が 5 減っています。'
    },
    {
      title: '種をまく',
      text: '3 を押して「たね」を持ちます（かぶのたねが 5 つ）。耕した土（点線）に乗って Z でまきます。耕していない草地にはまけません。',
      hint: '3 たね → 土に乗って Z',
      done: function (world, base) {
        return world.stats.sown > base.sown;
      },
      hintTile: function (world) {
        return fullMap(world, function (t) { return t.type === 'soil' && !t.crop; });
      },
      after: 'たねをまきました（土の上の小さな点）。たねが 1 つ減りました。作物は耕した土の上でしか育ちません。'
    },
    {
      title: '水をやる',
      text: '2 を押して「じょうろ」を持ち、たねをまいた土（点線）に乗って Z。土の色が濃くなれば OK。水は減りません。',
      hint: '2 じょうろ → たねの土に乗って Z',
      done: function (world, base) {
        return FM.World.crops(world).some(function (x) { return x.watered; });
      },
      hintTile: function (world) {
        return fullMap(world, function (t) { return !!t.crop && !t.watered; });
      },
      after: '水をやりました。水をやった日にだけ、寝ると 1 段階育ちます。やらなかった日は育ちません。'
    },
    {
      title: '寝る',
      text: '家のドア（点線・赤い取っ手）の下のマスに立ち、上を向いて Z。「寝る」を選ぶと次の日になります。体力も全回復します。',
      hint: 'ドアの下で ↑ → Z → 寝る',
      done: function (world, base) {
        return world.day > base.day;
      },
      hintTile: function (world) {
        return world.door;
      },
      after: '2 日目の朝。たねが「め」になりました。柵の中では にわとりが たまごを産んでいます（白い楕円）。たまごのマスに乗って Z で拾えます。'
    },
    {
      title: '実らせる',
      text: '「みのり」まで あと 2 段階。水をやって寝る、を繰り返します（じょうろで Z → ドアで寝る）。点線が次にやることの場所です。',
      hint: 'じょうろで水 → ドアで寝る（実るまで）',
      done: function (world, base) {
        return FM.World.crops(world).some(function (x) { return x.stage === 3; });
      },
      hintTile: function (world) {
        return fullMap(world, function (t) { return !!t.crop && t.crop.stage < 3 && !t.watered; }) || world.door;
      },
      after: '実りました（黄色い枠の作物）。収穫できます。'
    },
    {
      title: '収穫',
      text: '4 を押して「かご」を持ち、実った作物（点線）に乗って Z。作物が持ち物に入ります。',
      hint: '4 かご → 実った作物に乗って Z',
      done: function (world, base) {
        return world.stats.harvested > base.harvested;
      },
      hintTile: function (world) {
        return fullMap(world, function (t) { return !!t.crop && t.crop.stage === 3; });
      },
      after: 'かぶを収穫しました。土はそのまま残るので、また たねをまけます。'
    },
    {
      title: '出荷',
      text: '家の右の出荷箱（点線）の左のマスに立ち、右を向いて Z。持っている作物とたまごが全部箱に入ります。そのあと寝ると、翌朝お金になります。',
      hint: '出荷箱の前で → を押して Z → ドアで寝る',
      done: function (world, base) {
        return world.stats.income > base.income;
      },
      hintTile: function (world) {
        return FM.World.sumProduce(world) > 0 ? world.ship : world.door;
      },
      after: '出荷したぶんがお金になりました（右上の所持金）。家の左の店（看板）の前で ← を押して Z、1〜3 で たねが買えます。これで一通りです。'
    }
  ];

  // ------------------------------------------------------------------
  // FM.Tutorial 公開 API(§1 の一覧のとおり)
  // ------------------------------------------------------------------

  // §8.3: レッスン開始時の数値スナップショット(比較用のコピーだけ・DOM に触らない)
  T.snapshot = function (world) {
    var s = world.stats;
    return {
      tilled: s.tilled,
      sown: s.sown,
      watered: s.watered,
      harvested: s.harvested,
      income: s.income,
      day: world.day
    };
  };

  // タイトルで「チュートリアル」を選んだときに呼ばれる(§7.4 phase==='title' の分岐)
  T.start = function () {
    T.active = true;
    T.stage = 'intro';
    T.page = 0;
    T.index = 0;
    FM.Game.state.mode = 'tutorial';
    FM.UI.hideTitle();
    var w = FM.World.newWorld();
    FM.Game.loadWorld(w);
    if (!w) {
      console.error('Tutorial.start: World.newWorld() が null です（config.js の MAP を確認してください）');
      T.stop();
      FM.Game.toTitle();
      return;
    }
    FM.Game.state.phase = 'play';
    T.show(T.INTRO[0], { page: '1 / 3' });
  };

  // §8.2・§10.1: 案内文(導入・説明・解説・完了)を出す唯一の経路。hold を立てる行もここの 1 行だけ
  T.show = function (text, meta) {
    FM.Game.state.hold = true;
    FM.UI.showBand(text, meta);
    FM.Game.render();
  };

  // §8.2: hold 中に ok。自分自身を try/catch で包み、失敗したら Game.recover() に任せる(§10.4)
  T.confirm = function () {
    try {
      FM.Game.state.hold = false;
      FM.UI.hideBand();

      if (T.stage === 'intro') {
        T.page += 1;
        if (T.page < 3) {
          T.show(T.INTRO[T.page], { page: (T.page + 1) + ' / 3' });
        } else {
          T.beginLesson(0);
        }
      } else if (T.stage === 'pre') {
        T.stage = 'wait';
        FM.UI.task('いま: ' + T.LESSONS[T.index].hint);
        T.onEvent('enter');            // 既に条件を満たしていれば即 post へ
      } else if (T.stage === 'post') {
        FM.UI.task('');
        if (T.index + 1 < 7) {
          T.beginLesson(T.index + 1);
        } else {
          T.complete();
        }
      } else if (T.stage === 'complete') {
        T.stop();
        FM.Game.toFree();             // Z = この牧場のままフリープレイへ
      }

      FM.Game.render();
    } catch (e) {
      console.error(e);
      FM.Game.recover();
    }
  };

  // §8.2: hold 中に cancel。'complete' のときだけタイトルへ。それ以外は何もしない(案内文は Z で進める)
  T.cancel = function () {
    if (T.stage === 'complete') {
      FM.Game.state.hold = false;
      FM.UI.hideBand();
      T.stop();
      FM.Game.toTitle();               // X = タイトルへ
    }
  };

  // §8.2: チュートリアルを止める(タイトルへ戻るときなど)
  T.stop = function () {
    T.active = false;
    T.stage = 'intro';
    T.index = 0;
    T.page = 0;
    T.base = null;
    FM.Game.state.hold = false;
    FM.UI.hideBand();
    FM.UI.task('');
    FM.UI.markHint(null);
  };

  // §8.3: レッスン i を開始する。同じ牧場のまま続ける(newWorld はやり直さない)
  T.beginLesson = function (i) {
    T.index = i;
    T.stage = 'pre';
    T.base = T.snapshot(FM.Game.state.world);
    T.show(T.LESSONS[i].text, { page: 'レッスン ' + (i + 1) + ' / 7' });
  };

  // §8.6: 完了画面
  T.complete = function () {
    T.stage = 'complete';
    FM.UI.showBanner('チュートリアル完了', 'おつかれさまでした', '');
    T.show('チュートリアル完了。Z: この牧場のまま続ける（フリープレイ） ／ X: タイトルへ');
  };

  // §8.3: Game が呼ぶ。name = 'enter' | 'act' | 'move' | 'day' | 'buy'
  T.onEvent = function (name, data) {
    if (!T.active || T.stage !== 'wait') return;
    var lesson = T.LESSONS[T.index];
    if (lesson.done(FM.Game.state.world, T.base)) {
      T.stage = 'post';
      FM.UI.task('');
      T.show(lesson.after);
    }
  };

  // §6.3・§8.3: Game.render() が毎回呼ぶ。wait 中だけ指示のマスを返す(null 安全)
  T.hintFor = function (world) {
    if (!T.active || T.stage !== 'wait' || !world) return null;
    return T.LESSONS[T.index].hintTile(world);
  };

})();
