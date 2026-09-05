var SG = (typeof window !== 'undefined') ? (window.SG = window.SG || {}) : (global.SG = global.SG || {});

// SG.Game: 進行状態(state)と、局面を進める一連の関数。SPEC.md §2.5・§9・§10 準拠。
// このファイルが pos を差し替えるのは loadPosition() と 内部の applyMove() の 2 か所だけ(§2.5)。
(function () {

  SG.Game = SG.Game || {};

  function initialState() {
    return {
      pos: null,                // SG.Rules の局面。toTitle() 実行後に入る
      mode: 'free',              // 'free' | 'tutorial'
      phase: 'title',            // 'title'|'select'|'target'|'promote'|'cpu'|'over'
      hold: false,               // ★このファイルでは絶対に書き換えない(§10.1)。読むだけ
      menuOpen: false,
      ply: 0,
      history: [],
      lastMove: null,
      seq: 0,
      timer: null,
      cpuSince: 0,
      result: null,
      cursor: { zone: 'board', r: 6, c: 2, i: 0 },
      sel: null,
      pending: null,
      promoChoice: 0,
      menuIndex: 0,
      titleIndex: 0
    };
  }

  SG.Game.state = initialState();

  // ------------------------------------------------------------------
  // 内部ヘルパー(SG.Game の公開 API には出さない。§1 の一覧に無いもの)
  // ------------------------------------------------------------------

  // §9.4「表記(m)」。例: 3四歩 / 2二銀 / 4五角打 / 2一飛成
  // 呼ぶタイミングは apply する"前"の pos(from に駒が残っている状態)。
  function notation(pos, m) {
    var t, o;
    if (m.drop) {
      t = m.drop;
      o = pos.turn;
    } else {
      var piece = SG.Rules.at(pos, m.from.r, m.from.c);
      t = piece ? piece.t : '';
      o = piece ? piece.o : pos.turn;
    }
    var glyph = (t === 'K') ? (SG.CONFIG.GLYPH.K[o] || '') : (SG.CONFIG.GLYPH[t] || '');
    var file = 9 - m.to.c;
    var rankKanji = '一二三四五六七八九'.charAt(m.to.r);
    var suffix = m.drop ? '打' : (m.promote ? '成' : '');
    return String(file) + rankKanji + glyph + suffix;
  }

  // §7.6 末尾: 持ち駒が減って cursor.i が範囲外になったときの補正。render の前に毎回呼ぶ
  function fixHandCursor() {
    var st = SG.Game.state;
    if (!st.pos || st.cursor.zone !== 'hand') return;
    var order = SG.CONFIG.HAND_ORDER;
    var hand = (st.pos.hands && st.pos.hands[0]) || {};
    var chips = [];
    var i;
    for (i = 0; i < order.length; i++) {
      if ((hand[order[i]] || 0) > 0) chips.push(order[i]);
    }
    if (chips.length === 0) {
      st.cursor = { zone: 'board', r: 8, c: st.cursor.c, i: 0 };
    } else if (st.cursor.i >= chips.length) {
      st.cursor.i = chips.length - 1;
    }
  }

  // §2.5「Game.applyMove()(内部関数)」。pos を差し替えるもう一方の場所
  function applyMove(m) {
    var st = SG.Game.state;
    var before = st.pos;
    var capturedPiece = SG.Rules.at(before, m.to.r, m.to.c);
    var captured = capturedPiece ? { t: capturedPiece.t, p: capturedPiece.p } : null;
    st.pos = SG.Rules.apply(before, m);
    st.history.push({ move: m, captured: captured });
    st.lastMove = m;
    st.ply += 1;
    st.seq += 1;
    st.sel = null;
    st.pending = null;
    SG.UI.hidePromo();
    SG.Game.render();
  }

  // ------------------------------------------------------------------
  // SG.Game 公開 API(§1 の一覧のとおり)
  // ------------------------------------------------------------------

  // pos を差し替える 2 か所のうちの 1 つ(§2.5)。sfen 省略時は初期配置(Rules.initial())を使う。
  // 読めない SFEN は §2.3 のとおり null フォールバック + console.error。
  SG.Game.loadPosition = function (sfen) {
    var st = SG.Game.state;
    var pos = sfen ? SG.Rules.fromSfen(sfen) : SG.Rules.initial();
    if (!pos) {
      console.error('loadPosition: 読めない SFEN。初期配置にフォールバックします: ' + sfen);
      pos = SG.Rules.initial();
    }
    st.pos = pos;
    st.history = [];
    st.lastMove = null;
    st.ply = 0;
    st.seq += 1;
    SG.Game.render();
  };

  // §9.1
  SG.Game.startFree = function () {
    var st = SG.Game.state;
    st.mode = 'free';
    SG.Tutorial.stop();
    SG.UI.hideTitle();
    SG.UI.hideBanner();
    SG.UI.hidePromo();
    SG.UI.hideMenu();
    SG.Game.loadPosition();
    st.result = null;
    st.cursor = { zone: 'board', r: 6, c: 2, i: 0 };
    st.sel = null;
    st.phase = 'select';
    SG.UI.message('あなたの手番です');
    SG.Game.render();
  };

  // タイトルで「チュートリアル」を選んだときに Tutorial.start() から呼ばれる、
  // チュートリアル用のゲーム状態の初期化(§9.1 の startFree に相当するもの)。
  // phase はここでは変えない。intro の間は 'title' のままでよい(hold が優先するため)。
  SG.Game.startTutorialGame = function () {
    var st = SG.Game.state;
    st.mode = 'tutorial';
    SG.UI.hideTitle();
    SG.UI.hideBanner();
    SG.UI.hidePromo();
    SG.UI.hideMenu();
    SG.Game.loadPosition();
    st.result = null;
    st.cursor = { zone: 'board', r: 6, c: 2, i: 0 };
    st.sel = null;
    SG.UI.message('');
    SG.Game.render();
  };

  // §9.2
  SG.Game.humanMove = function (m) {
    var st = SG.Game.state;
    if (st.phase !== 'select' && st.phase !== 'target' && st.phase !== 'promote') return;

    var moves = SG.Rules.legalMoves(st.pos);
    var str = SG.Rules.moveToStr(m);
    var found = false;
    var i;
    for (i = 0; i < moves.length; i++) {
      if (SG.Rules.moveToStr(moves[i]) === str) { found = true; break; }
    }
    if (!found) {
      SG.UI.message('そこには動かせません');
      SG.Game.render();
      return;
    }

    // §8.3 の差し戻し: チュートリアル中は allow の手以外を拒否する
    var allow = SG.Tutorial.allowed();
    if (allow) {
      var ok = false;
      for (i = 0; i < allow.length; i++) {
        if (allow[i] === str) { ok = true; break; }
      }
      if (!ok) {
        SG.UI.message('指示の手を指してください：' + SG.Tutorial.lessonHint());
        st.sel = null;
        st.phase = 'select';
        if (m.from) {
          st.cursor = { zone: 'board', r: m.from.r, c: m.from.c, i: 0 };
        } else if (m.drop) {
          var order = SG.CONFIG.HAND_ORDER;
          var hand = (st.pos.hands && st.pos.hands[st.pos.turn]) || {};
          var chips = [];
          var k;
          for (k = 0; k < order.length; k++) {
            if ((hand[order[k]] || 0) > 0) chips.push(order[k]);
          }
          var idx = chips.indexOf(m.drop);
          st.cursor = { zone: 'hand', r: st.cursor.r, c: st.cursor.c, i: idx >= 0 ? idx : 0 };
        }
        SG.Game.render();
        return;
      }
    }

    applyMove(m);
    SG.Game.afterMove('human');
  };

  // §9.3
  SG.Game.afterMove = function (by) {
    var st = SG.Game.state;
    var stat = SG.Rules.status(st.pos);
    if (stat.over) { SG.Game.finish(stat.loser); return; }
    if (st.ply >= SG.CONFIG.MAX_PLY) { SG.Game.finish(1, 'maxply'); return; }
    SG.UI.message(stat.check ? '王手！' : (by === 'human' ? 'かなめ 考え中…' : 'あなたの手番です'));
    if (by === 'human') {
      if (SG.Tutorial.active) {
        SG.Tutorial.onEvent('human_moved');
      } else {
        SG.Game.scheduleCpu();
      }
    } else {
      st.phase = 'select';
      if (SG.Tutorial.active) {
        SG.Tutorial.onEvent('cpu_moved');
      }
    }
    SG.Game.render();
  };

  // §9.4: 遅延して局面を進めるのはここだけ(§10.3)
  SG.Game.scheduleCpu = function () {
    var st = SG.Game.state;
    st.phase = 'cpu';
    st.cpuSince = performance.now();
    clearTimeout(st.timer);
    var token = st.seq;
    st.timer = setTimeout(function () { SG.Game.cpuMove(token); }, SG.CONFIG.CPU_DELAY_MS);
  };

  SG.Game.cpuMove = function (token) {
    var st = SG.Game.state;
    try {
      if (token !== undefined && token !== st.seq) return;   // 局面が変わっていた古い予約(§10.3)
      if (st.phase !== 'cpu') return;
      if (st.hold || st.menuOpen) {
        st.timer = setTimeout(function () { SG.Game.cpuMove(token); }, 300);
        return;
      }
      var m = SG.Tutorial.cpuReply() || SG.AI.choose(st.pos);
      if (m == null) { SG.Game.finish(1); return; }
      var text = notation(st.pos, m);
      applyMove(m);
      SG.UI.message('かなめ: ' + text);
      SG.Game.afterMove('cpu');
    } catch (e) {
      console.error(e);
      SG.Game.recover();
    }
  };

  // §9.5
  SG.Game.finish = function (loser, reason) {
    var st = SG.Game.state;
    clearTimeout(st.timer);
    st.result = { loser: loser, reason: reason || 'mate' };
    st.phase = 'over';
    st.sel = null;
    SG.UI.hidePromo();
    if (SG.Tutorial.active) {
      SG.Tutorial.onEvent('finished', { loser: loser });
      return;
    }
    var heading = reason === 'resign' ? '投了' : (reason === 'maxply' ? '400 手' : '詰み');
    var sub = loser === 1 ? 'あなたの勝ち' : 'あなたの負け';
    SG.UI.showBanner(heading, sub, 'Z でタイトルへ');
  };

  SG.Game.resign = function () {
    var st = SG.Game.state;
    if (st.phase === 'over') return;
    SG.Game.finish(0, 'resign');
  };

  // §9.6: 全状態からの共通の戻り先
  SG.Game.toTitle = function () {
    var st = SG.Game.state;
    clearTimeout(st.timer);
    st.timer = null;
    SG.Tutorial.stop();
    st.menuOpen = false;
    SG.UI.hidePromo();
    SG.UI.hideMenu();
    SG.UI.hideBanner();
    st.sel = null;
    st.pending = null;
    st.result = null;
    SG.Game.loadPosition();
    st.phase = 'title';
    st.titleIndex = 0;
    SG.UI.showTitle();
    SG.UI.message('');
    SG.Game.render();
  };

  // §10.4: 例外から復帰する。hold の書き換えは Tutorial.confirm()/stop() 経由でのみ行う
  SG.Game.recover = function () {
    var st = SG.Game.state;
    clearTimeout(st.timer);
    SG.UI.hidePromo();
    st.sel = null;
    st.pending = null;
    if (SG.Tutorial.active && st.hold) {
      SG.Tutorial.confirm();
    } else {
      SG.Tutorial.stop();
    }
    if (st.phase === 'cpu') {
      SG.Game.scheduleCpu();
    } else if (st.phase !== 'title' && st.phase !== 'over') {
      st.phase = 'select';
    }
    SG.UI.message('内部エラーが起きました。続行します（console 参照）');
    SG.Game.render();
  };

  // §9.4 末尾・§10.3: 3 秒進まなければ直接指させる保険。止めない setInterval で main.js から呼ばれる
  SG.Game.watchdog = function () {
    try {
      var st = SG.Game.state;
      if (st.phase === 'cpu' && !st.hold && !st.menuOpen && (performance.now() - st.cpuSince) > SG.CONFIG.WATCHDOG_MS) {
        console.warn('watchdog');
        SG.Game.cpuMove(undefined);
      }
    } catch (e) {
      console.error(e);
      SG.Game.recover();
    }
  };

  // §6.5: UI.render 呼び出しの唯一の入口
  SG.Game.render = function () {
    try {
      fixHandCursor();
      SG.UI.render(SG.Game.state);
    } catch (e) {
      console.error(e);
    }
  };

})();
