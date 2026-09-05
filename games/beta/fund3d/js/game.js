var FD = (typeof window !== 'undefined') ? (window.FD = window.FD || {}) : (global.FD = global.FD || {});

// FD.Game — 進行状態(state)と、局面を進める一連の関数。SPEC.md §2.6・§9・§10 準拠。
// このファイルが fund を差し替えるのは loadFund() の 1 か所だけ(§9.1)。
//
// ★事故対策メモ(このファイル内で守ること。詳細は SPEC.md §10):
//  - state.hold はここでは絶対に書き換えない。読むだけ(§10.1)。タイトルへ戻すのは
//    直接いじらず必ず FD.Tutorial.stop() 経由(toTitle() の中)で行う。
//  - 遅延して局面(日付)を進める処理は無い。遅延タイマーは 0 本(§10.3)。nextDay() は同期で
//    完結する。定期呼び出し(tick)は main.js が 1 本だけ持ち、表示と状態の食い違いを直すだけ。
//  - state.fund は null のことがある(render・tick・nextDay・openDialog はその場合何もしない)。
//    state.dialog も null のことがある(参照は必ず state.dialog && ... の形)。recover/tick は
//    try/catch で包み、失敗したら recover() で必ず前へ進む(§10.4)。
//  - 銘柄が同じかどうかは id === id の構造比較だけを使う。表示文字列(fmtYen・fmtPct・ログ)は
//    表示にだけ使い、判定には使わない(§10.5)。
(function () {

  FD.Game = FD.Game || {};

  function initialState() {
    return {
      fund: null,
      mode: 'free',           // 'free' | 'tutorial'
      phase: 'title',          // 'title' | 'play' | 'result'
      hold: false,               // 案内帯が出ていて Z 待ち(§10.1)。読むだけ
      menuOpen: false,
      menuIndex: 0,
      dialog: null,               // null | { id, index: 0|1|2, pct: 10〜90 }
      cursor: 0,                   // 0〜5 = 銘柄、6 = 「次の日へ」
      chartId: 'nova',              // チャートに出す銘柄の id
      titleIndex: 0,                 // タイトルの選択行
      recoverCount: 0                 // 連続で recover した回数(§9.5)
    };
  }

  FD.Game.state = initialState();

  // ------------------------------------------------------------------
  // 内部ヘルパー(FD.Game の公開 API には出さない。§1 の一覧に無いもの)
  // ------------------------------------------------------------------

  // 「符号付き」表示(§4.6): n > 0 なら "+" を付ける。0・負は fmtYen の結果のまま
  function signedYen(n) {
    return (n > 0 ? '+' : '') + FD.Fund.fmtYen(n);
  }

  // ------------------------------------------------------------------
  // FD.Game 公開 API(§1 の一覧のとおり)
  // ------------------------------------------------------------------

  // ブラウザで乱数(Math の random 系)を使うのはここだけ(§3.1・§9.1)。フリープレイの種
  FD.Game.randomSeed = function () {
    return Math.floor(Math.random() * 2147483647);
  };

  // fund を差し替える唯一の場所(§9.1)。null が来ても落ちない(render 側が null 安全・§10.4)
  FD.Game.loadFund = function (fund) {
    var st = FD.Game.state;
    st.fund = fund;
    st.chartId = 'nova';
    st.cursor = 0;
    st.dialog = null;
    FD.Game.render();
  };

  // #msg などに文字を出す唯一の経路(§1)
  FD.Game.message = function (text) {
    FD.UI.message(text);
  };

  // §9.1: タイトルから「フリープレイ」を選んだときに呼ばれる
  FD.Game.startFree = function () {
    var st = FD.Game.state;
    st.mode = 'free';
    FD.Tutorial.stop();
    FD.UI.hideTitle();
    FD.UI.hideResult();
    FD.UI.hideMenu();
    FD.UI.hideDialog();
    st.dialog = null;
    st.menuOpen = false;
    var f = FD.Fund.newFund(FD.Game.randomSeed(), null);
    FD.Game.loadFund(f);
    if (!f) {
      console.error('startFree: Fund.newFund() が null です');
      FD.Game.toTitle();
      return;
    }
    st.phase = 'play';
    st.cursor = 0;
    FD.Game.message('1 日目。ニュースを見て、上がりやすい業種を買うところから');
    FD.UI.task('');
    FD.Game.render();
  };

  // §9.1: チュートリアル完了から。fund・保有・日数はそのまま
  FD.Game.toFree = function () {
    var st = FD.Game.state;
    st.mode = 'free';
    FD.Tutorial.stop();
    st.phase = (st.fund && st.fund.finished) ? 'result' : 'play';
    if (st.phase === 'result') {
      FD.UI.showResult(FD.Fund.result(st.fund));
    } else {
      FD.UI.hideResult();
    }
    FD.Game.message('フリープレイ。30 日目まで進めると結果が出ます（S → タイトルへ で終了）');
    FD.Game.render();
  };

  // §9.2: phase === 'play' のときだけ。hold・menuOpen・dialog は dispatch(input.js)が先に弾いている
  FD.Game.moveCursor = function (d) {
    var st = FD.Game.state;
    if (st.phase !== 'play' || !st.fund) return;
    st.cursor = Math.max(0, Math.min(6, st.cursor + d));
    if (st.cursor <= 5) st.chartId = st.fund.stocks[st.cursor].id;
    FD.Game.render();
    FD.Tutorial.onEvent('move');
  };

  // §7.5・§9.2: 売買はダイアログの中だけ。phase==='play' かつ !hold かつ fund があり !finished のときだけ開く
  FD.Game.openDialog = function (id) {
    var st = FD.Game.state;
    if (st.phase !== 'play' || st.hold || !st.fund || st.fund.finished) return;
    st.dialog = { id: id, index: 0, pct: FD.CONFIG.PCT_DEFAULT };
    FD.UI.showDialog();
    FD.Game.render();
    FD.Tutorial.onEvent('open');
  };

  FD.Game.closeDialog = function () {
    var st = FD.Game.state;
    st.dialog = null;
    FD.UI.hideDialog();
    FD.Game.render();
    FD.Tutorial.onEvent('close');
  };

  // §7.4 行 4: dialog 中の up/down。index を 0〜2 で移動(端で止まる)
  FD.Game.dialogMove = function (d) {
    var st = FD.Game.state;
    if (!st.dialog) return;
    st.dialog.index = Math.max(0, Math.min(2, st.dialog.index + d));
    FD.Game.render();
  };

  // §9.2: dialog があるときだけ。不正な割合(clampPct が null)は無視して現状を保つ
  FD.Game.setPct = function (p) {
    var st = FD.Game.state;
    if (!st.dialog) return;
    var q = FD.Fund.clampPct(p);
    if (q === null) return;
    st.dialog.pct = q;
    FD.Game.render();
  };

  // §9.2: dialog があるときだけ。計算は Fund.buy が行う(ここでは計算し直さない・§10.6)
  FD.Game.buy = function () {
    var st = FD.Game.state;
    if (!st.dialog || !st.fund) return;
    var s = FD.Fund.stock(st.fund, st.dialog.id);
    var r = FD.Fund.buy(st.fund, st.dialog.id, st.dialog.pct);
    if (r.ok) {
      FD.Game.message((s ? s.ticker : '') + ' を ' + FD.Fund.fmtYen(r.shares) + ' 株 買った（代金 ' + FD.Fund.fmtYen(r.amount) + ' 円 + 手数料 ' + FD.Fund.fmtYen(r.fee) + ' 円）');
    } else {
      FD.Game.message(FD.CONFIG.REASON_TEXT[r.reason]);
    }
    FD.Game.render();
    FD.Tutorial.onEvent('trade', r);
  };

  FD.Game.sell = function () {
    var st = FD.Game.state;
    if (!st.dialog || !st.fund) return;
    var s = FD.Fund.stock(st.fund, st.dialog.id);
    var r = FD.Fund.sell(st.fund, st.dialog.id, st.dialog.pct);
    if (r.ok) {
      FD.Game.message((s ? s.ticker : '') + ' を ' + FD.Fund.fmtYen(r.shares) + ' 株 売った（受取 ' + FD.Fund.fmtYen(r.total) + ' 円・損益 ' + signedYen(r.amount - r.released) + ' 円）');
    } else {
      FD.Game.message(FD.CONFIG.REASON_TEXT[r.reason]);
    }
    FD.Game.render();
    FD.Tutorial.onEvent('trade', r);
  };

  // §9.3: phase === 'play' かつ fund があり !finished のときだけ。同期で完結する(遅延タイマー無し・§10.3)
  FD.Game.nextDay = function () {
    var st = FD.Game.state;
    if (st.phase !== 'play' || !st.fund || st.fund.finished) return;
    var rep = FD.Fund.nextDay(st.fund);
    if (rep == null) return;

    if (rep.finished) {
      st.phase = 'result';
      FD.UI.showResult(FD.Fund.result(st.fund));
      FD.Game.message('30 日が終わりました');
      FD.Game.render();
      return;                      // ★onEvent は呼ばない
    }

    var up = [];
    var down = [];
    var i, m, s;
    for (i = 0; i < rep.moves.length; i++) {
      m = rep.moves[i];
      s = st.fund.stocks[i];
      if (m.price > m.prev) up.push(s ? s.ticker : m.id);
      else if (m.price < m.prev) down.push(s ? s.ticker : m.id);
    }
    var text = rep.day + ' 日目。合計 ' + FD.Fund.fmtYen(rep.total) + ' 円（前日比 ' + signedYen(rep.total - rep.prevTotal) + '）。上げ: ' + (up.join('、') || 'なし') + ' ／ 下げ: ' + (down.join('、') || 'なし');
    if (rep.applied && rep.applied.type === 'rumor') {
      text += rep.rumorDir > 0 ? '。うわさは本当だった（＋3%）' : '。うわさは外れた（−3%）';
    }
    FD.Game.message(text);
    FD.Game.render();
    FD.Tutorial.onEvent('day', rep);
  };

  // §9.4: 全状態からの共通の戻り先
  FD.Game.toTitle = function () {
    var st = FD.Game.state;
    FD.Tutorial.stop();
    st.menuOpen = false;
    st.dialog = null;
    FD.UI.hideMenu();
    FD.UI.hideDialog();
    FD.UI.hideResult();
    var f = FD.Fund.newFund(FD.Game.randomSeed(), null);
    if (!f) console.error('toTitle: Fund.newFund() が null です');
    FD.Game.loadFund(f);               // null でも loadFund・render は落ちない(§10.4)。タイトルは必ず出す
    st.phase = 'title';
    st.titleIndex = 0;
    FD.UI.showTitle();
    FD.Game.message('');
    FD.Game.render();
  };

  // §9.5: 定期処理(見張り)。呼ぶのは main.js の定期呼び出し 1 本だけ。正常時は何もしない
  FD.Game.tick = function () {
    var st = FD.Game.state;
    try {
      var bad = false;
      if ((st.phase === 'title') !== !FD.UI.isHidden('title')) bad = true;
      if (st.hold !== !FD.UI.isHidden('band')) bad = true;
      if ((st.dialog !== null) !== !FD.UI.isHidden('dialog')) bad = true;
      if (st.menuOpen !== !FD.UI.isHidden('menu')) bad = true;
      if ((st.phase === 'result') !== !FD.UI.isHidden('result')) bad = true;
      if (st.phase === 'play' && st.fund && st.fund.finished) bad = true;
      if (bad) {
        console.warn('watchdog');
        FD.Game.recover();
      } else {
        st.recoverCount = 0;
      }
    } catch (e) {
      console.error(e);
      FD.Game.recover();
    }
  };

  // §9.6・§10.4: 例外や表示のずれから復帰する。3 回続けて直らなければタイトルへ
  FD.Game.recover = function () {
    var st = FD.Game.state;
    st.recoverCount += 1;
    if (st.recoverCount > FD.CONFIG.RECOVER_LIMIT) {
      st.recoverCount = 0;
      FD.Game.toTitle();
      return;
    }

    st.menuOpen = false;
    FD.UI.hideMenu();
    st.dialog = null;
    FD.UI.hideDialog();

    if (st.hold) {
      try {
        if (FD.Tutorial.active) FD.Tutorial.confirm(); else FD.Tutorial.stop();
      } catch (e) {
        console.error(e);
        FD.Tutorial.stop();
      }
    }

    if (st.phase === 'title') {
      FD.UI.showTitle();
      FD.UI.hideResult();
    } else {
      if (st.fund == null || FD.Fund.validate(st.fund).length > 0) {
        console.error(st.fund ? FD.Fund.validate(st.fund) : 'fund null');
        FD.Tutorial.stop();
        st.mode = 'free';
        FD.Game.loadFund(FD.Fund.newFund(FD.Game.randomSeed(), null));   // 作り直す。止まるよりまし
      }
      st.phase = (st.fund && st.fund.finished) ? 'result' : 'play';
      if (st.phase === 'result') FD.UI.showResult(FD.Fund.result(st.fund)); else FD.UI.hideResult();
      FD.UI.hideTitle();
    }

    st.cursor = Math.max(0, Math.min(6, st.cursor));
    FD.Game.message('内部エラーが起きました。続行します（console 参照）');
    FD.Game.render();
  };

  // §8.3: Tutorial が見る「いま何を選んでいるか」の純粋なスナップショット
  FD.Game.view = function () {
    var st = FD.Game.state;
    return { cursor: st.cursor, dialogId: st.dialog ? st.dialog.id : null };
  };

  // §6.6: UI.render 呼び出しの唯一の入口。指示の場所は局面で動くので毎回 markHint してから render する
  FD.Game.render = function () {
    try {
      var st = FD.Game.state;
      FD.UI.markHint(FD.Tutorial.active ? FD.Tutorial.hintFor(st.fund, FD.Game.view()) : null);
      FD.UI.render(st);
    } catch (e) {
      console.error(e);
    }
  };

})();
