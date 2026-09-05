var IG = (typeof window !== 'undefined') ? (window.IG = window.IG || {}) : (global.IG = global.IG || {});

// IG.Game — 進行状態(state)と、局面を進める一連の関数。SPEC.md §2.5・§9・§10 準拠。
// このファイルが pos を差し替えるのは loadPosition() と 内部の applyMove() の 2 か所だけ(§2.5)。
//
// ★事故対策メモ(このファイル内で守ること。詳細は SPEC.md §10):
//  - state.hold はここでは絶対に書き換えない。読むだけ(§10.1)。タイトルへ戻すのは
//    直接いじらず必ず IG.Tutorial.stop() を呼ぶ。
//  - 遅延して局面を進める予約は scheduleCpu()/cpuMove() の 2 か所だけ(§10.3)。
//    予約時に seq を token として閉じ込め、発火時に照合する。
//  - 盤の参照は Rules.at/Rules.neighbors を通し、null は例外にせず受け止める(§10.4)。
//    cpuMove・watchdog は try/catch で包み、失敗したら recover() で必ず前へ進む。
//  - 手が同じかどうかは Rules.sameMove(a,b) の構造比較だけを使う。文字列化して
//    比べない(§10.5・2026-09-05 将棋の事故)。
(function () {

  IG.Game = IG.Game || {};

  function initialState() {
    return {
      pos: IG.Rules.empty(),     // toTitle()/startFree()/beginLesson() が都度読み直す
      mode: 'free',               // 'free' | 'tutorial'
      phase: 'title',              // 'title'|'play'|'cpu'|'over'
      hold: false,                 // 案内帯が出ていて Z 待ち。読むだけ(§10.1)
      menuOpen: false,
      ply: 0,
      history: [],
      lastMove: null,
      seq: 0,
      timer: null,
      cpuSince: 0,
      result: null,
      cursor: { r: 4, c: 4 },      // 天元
      menuIndex: 0,
      titleIndex: 0
    };
  }

  IG.Game.state = initialState();

  // ------------------------------------------------------------------
  // 内部ヘルパー(IG.Game の公開 API には出さない。§1 の一覧に無いもの)
  // ------------------------------------------------------------------

  // #msg に出した最後の文字列。afterMove の cpu 分岐で「前の message」に追記するために覚える(§9.3)。
  var lastMessage = '';

  function setMessage(text) {
    lastMessage = text;
    IG.UI.message(text);
  }

  // 空の盤の局面文字列(§2.3)。rules.js の toText/empty から作る(二重に書かない)。
  function emptyText() {
    return IG.Rules.toText(IG.Rules.empty());
  }

  // §2.5「Game.applyMove()(内部関数)」。pos を差し替えるもう一方の場所。
  // captured は「その手で増えた自分の取った石の数」を history 表示用に記録するだけ。
  function applyMove(m) {
    var st = IG.Game.state;
    var before = st.pos;
    var me = before.turn;
    var after = IG.Rules.apply(before, m);
    var captured = after.captures[me] - before.captures[me];
    st.pos = after;
    st.history.push({ move: m, captured: captured });
    st.lastMove = m;
    st.ply += 1;
    st.seq += 1;
    IG.Game.render();
  }

  // ------------------------------------------------------------------
  // IG.Game 公開 API(§1 の一覧のとおり)
  // ------------------------------------------------------------------

  // pos を差し替える 2 か所のうちの 1 つ(§2.5)。読めない局面文字列は §2.3 のとおり
  // 空の盤へフォールバックし console.error を出す。
  IG.Game.loadPosition = function (text) {
    var st = IG.Game.state;
    var pos = IG.Rules.fromText(text);
    if (!pos) {
      console.error('loadPosition: 読めない局面。空の盤にフォールバックします: ' + text);
      pos = IG.Rules.empty();
    }
    st.pos = pos;
    st.history = [];
    st.lastMove = null;
    st.ply = 0;
    st.seq += 1;
    IG.Game.render();
  };

  // §9.1
  IG.Game.startFree = function () {
    var st = IG.Game.state;
    st.mode = 'free';
    IG.Tutorial.stop();
    IG.UI.hideTitle();
    IG.UI.hideBanner();
    IG.UI.hideMenu();
    IG.Game.loadPosition(emptyText());
    st.result = null;
    st.cursor = { r: 4, c: 4 };
    st.phase = 'play';
    setMessage('あなたの番です（黒）');
    IG.Game.render();
  };

  // §9.2
  IG.Game.humanMove = function (m) {
    var st = IG.Game.state;
    if (st.phase !== 'play') return;

    var reason = IG.Rules.illegalReason(st.pos, m);
    if (reason !== null) {
      setMessage(IG.CONFIG.REASON_TEXT[reason]);
      IG.Game.render();
      return;
    }

    var allowMoves = IG.Tutorial.allowed();
    if (allowMoves) {
      var ok = false;
      var i;
      for (i = 0; i < allowMoves.length; i++) {
        if (IG.Rules.sameMove(allowMoves[i], m)) { ok = true; break; }
      }
      if (!ok) {
        var lesson = IG.Tutorial.LESSONS[IG.Tutorial.index];
        setMessage('指示の手を打ってください：' + lesson.hint);
        IG.Game.render();
        return;
      }
    }

    applyMove(m);
    setMessage('あなた: ' + IG.Game.label(m));
    IG.Game.afterMove('human');
  };

  // §9.3
  IG.Game.afterMove = function (by) {
    var st = IG.Game.state;
    var stat = IG.Rules.status(st.pos);
    if (stat.over) { IG.Game.finish('passes'); return; }
    if (st.ply >= IG.CONFIG.MAX_PLY) { IG.Game.finish('maxply'); return; }

    if (by === 'human') {
      if (IG.Tutorial.active) {
        IG.Tutorial.onEvent('human_moved');
      } else {
        IG.Game.scheduleCpu();
      }
    } else {
      st.phase = 'play';
      setMessage(lastMessage + '　あなたの番です');
      if (IG.Tutorial.active) {
        IG.Tutorial.onEvent('cpu_moved');
      }
    }
    IG.Game.render();
  };

  // §9.4: 遅延して局面を進めるのはここ(scheduleCpu)と cpuMove の 2 か所だけ(§10.3)
  IG.Game.scheduleCpu = function () {
    var st = IG.Game.state;
    st.phase = 'cpu';
    st.cpuSince = performance.now();
    setMessage('そら 考え中…');
    clearTimeout(st.timer);
    var token = st.seq;                                   // 発火時に局面の世代を照合する(§10.3)
    st.timer = setTimeout(function () { IG.Game.cpuMove(token); }, IG.CONFIG.CPU_DELAY_MS);
  };

  IG.Game.cpuMove = function (token) {
    var st = IG.Game.state;
    try {
      if (token !== undefined && token !== st.seq) return;   // 局面が変わっていた古い予約
      if (st.phase !== 'cpu') return;
      if (st.hold || st.menuOpen) {
        st.timer = setTimeout(function () { IG.Game.cpuMove(token); }, 300);
        return;
      }
      var m = IG.Tutorial.cpuReply() || IG.AI.choose(st.pos);
      if (m == null || IG.Rules.illegalReason(st.pos, m) !== null) { m = { kind: 'pass' }; }
      applyMove(m);
      setMessage('そら: ' + IG.Game.label(m));
      IG.Game.afterMove('cpu');
    } catch (e) {
      console.error(e);
      IG.Game.recover();
    }
  };

  // §9.5
  IG.Game.finish = function (reason) {
    var st = IG.Game.state;
    clearTimeout(st.timer);

    var score = null;
    var winner;
    if (reason === 'resign') {
      winner = 2;                 // 投了できるのは人間だけ
    } else {
      score = IG.Rules.score(st.pos);
      winner = score.winner;
    }
    st.result = { winner: winner, reason: reason, score: score };
    st.phase = 'over';

    if (IG.Tutorial.active) {
      IG.Tutorial.onEvent('finished', st.result);   // banner は出さない。案内帯で説明する
      IG.Game.render();
      return;
    }

    var heading = (reason === 'passes') ? '終局' : (reason === 'resign') ? '投了' : '200 手';
    var sub;
    if (reason === 'resign') {
      sub = 'あなたの負け';
    } else {
      var tail = (winner === 1) ? ('あなたの勝ち（' + score.margin + ' 目）') : 'あなたの負け';
      sub = '黒 ' + score.total[1] + ' ／ 白 ' + score.total[2] + '（コミ 6.5 込み）→ ' + tail;
    }
    IG.UI.showBanner(heading, sub, 'Z でタイトルへ');
    IG.Game.render();
  };

  // メニューの「投了する」から呼ばれる。phase==='play' のときだけ有効(§9.5)
  IG.Game.resign = function () {
    var st = IG.Game.state;
    if (st.phase !== 'play') return;
    IG.Game.finish('resign');
  };

  // §10.4: 例外から復帰する。hold の書き換えは Tutorial.confirm()/stop() 経由でのみ行う
  IG.Game.recover = function () {
    var st = IG.Game.state;
    clearTimeout(st.timer);
    st.menuOpen = false;
    IG.UI.hideMenu();

    if (IG.Tutorial.active && st.hold) {
      IG.Tutorial.confirm();
    } else if (!IG.Tutorial.active && st.hold) {
      IG.Tutorial.stop();
    }

    if (st.phase === 'cpu') {
      IG.Game.scheduleCpu();
    } else if (st.phase !== 'title' && st.phase !== 'over') {
      st.phase = 'play';
    }
    setMessage('内部エラーが起きました。続行します（console 参照）');
    IG.Game.render();
  };

  // §9.4 末尾・§10.3: 3 秒進まなければ直接打たせる保険。止めない setInterval で main.js から呼ばれる
  IG.Game.watchdog = function () {
    try {
      var st = IG.Game.state;
      if (st.phase === 'cpu' && !st.hold && !st.menuOpen &&
          (performance.now() - st.cpuSince) > IG.CONFIG.WATCHDOG_MS) {
        console.warn('watchdog');
        IG.Game.cpuMove(undefined);       // token 照合なしで直接打つ
      }
    } catch (e) {
      console.error(e);
      IG.Game.recover();
    }
  };

  // §9.6: 全状態からの共通の戻り先
  IG.Game.toTitle = function () {
    var st = IG.Game.state;
    clearTimeout(st.timer);
    st.timer = null;
    IG.Tutorial.stop();
    st.menuOpen = false;
    IG.UI.hideMenu();
    IG.UI.hideBanner();
    st.result = null;
    IG.Game.loadPosition(emptyText());
    st.phase = 'title';
    st.titleIndex = 0;
    st.cursor = { r: 4, c: 4 };
    IG.UI.showTitle();
    setMessage('');
    IG.Game.render();
  };

  // §9.4 末尾: pass→"パス"、play→ptToStr(r,c)(例 C3)。表示にだけ使う
  IG.Game.label = function (m) {
    if (!m) return '';
    if (m.kind === 'pass') return 'パス';
    return IG.Rules.ptToStr(m.r, m.c);
  };

  // §6.5: UI.render 呼び出しの唯一の入口
  IG.Game.render = function () {
    try {
      IG.UI.render(IG.Game.state);
    } catch (e) {
      console.error(e);
    }
  };

})();
