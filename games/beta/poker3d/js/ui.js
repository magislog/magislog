window.PK = window.PK || {};
PK.UI = {};

(function () {
  'use strict';

  var LABELS = {
    FOLD: 'F フォールド',
    CHECK: 'C チェック',
    BET: 'R ベット',
    RAISE: 'R レイズ',
    ALLIN: 'A オールイン'
  };

  // ---- 行動選択・額入力の内部状態(main.js のキー入力から使う補助) ----------
  var _legal = [];
  var _allow = null;
  var _selIndex = 0;
  var _raiseMode = false;
  var _raiseMin = 0, _raiseMax = 0, _raiseTotal = 0;
  var _cutinBusy = false;

  function isAllowed(kind) {
    return !_allow || _allow.indexOf(kind) !== -1;
  }

  function firstAllowedIndex() {
    for (var i = 0; i < _legal.length; i++) {
      if (isAllowed(_legal[i])) return i;
    }
    return 0;
  }

  function actionLabel(kind) {
    if (kind === 'CALL') {
      var st = PK.Game.state;
      var toCall = st.currentBet - st.players[0].betThisRound;
      if (st.players[0].stack <= toCall) return 'C コール（オールイン）';
      return 'C コール ' + toCall;
    }
    return LABELS[kind];
  }

  function renderActions() {
    var BTN = PK.CONFIG.UI_ACTION_BTN;
    var SEL = PK.CONFIG.UI_SELECT_BORDER;
    var OFF = PK.CONFIG.UI_DISALLOWED_OPACITY;
    var el = document.getElementById('actions');
    el.innerHTML = '';
    var row = document.createElement('div');
    row.className = 'row';
    row.style.gap = BTN.gap + 'px';
    _legal.forEach(function (kind, i) {
      var btn = document.createElement('div');
      btn.className = 'abtn';
      btn.style.width = BTN.w + 'px';
      btn.style.height = BTN.h + 'px';
      btn.textContent = actionLabel(kind);
      if (i === _selIndex) btn.style.boxShadow = 'inset 0 0 0 ' + SEL.width + 'px ' + SEL.color;
      if (!isAllowed(kind)) btn.style.opacity = String(OFF);
      row.appendChild(btn);
    });
    el.appendChild(row);
    if (_raiseMode) {
      var raiseRow = document.createElement('div');
      raiseRow.id = 'raiseRow';
      raiseRow.textContent = raiseText();
      el.appendChild(raiseRow);
    }
  }

  function raiseText() {
    return '合計 ' + _raiseTotal + '　↑↓ 変更　Z 決定　X 戻る';
  }

  PK.UI.showActions = function (legal, allow) {
    _legal = legal.slice();
    _allow = allow || null;
    _raiseMode = false;
    _selIndex = firstAllowedIndex();
    renderActions();
  };

  PK.UI.hideActions = function () {
    document.getElementById('actions').innerHTML = '';
    _raiseMode = false;
    _legal = [];
  };

  PK.UI.enterRaise = function (min, max) {
    _raiseMode = true;
    _raiseMin = min; _raiseMax = max; _raiseTotal = min;
    renderActions();
  };

  PK.UI.setRaise = function (total) {
    _raiseTotal = total;
    var row = document.getElementById('raiseRow');
    if (row) row.textContent = raiseText();
  };

  // main.js のキー処理から使う小さな補助(§1 の見出し一覧には無いが、
  // ←→↑↓の実際の配線に必要なため ui.js 内部で持つ)
  PK.UI.moveSelect = function (dir) {
    if (_raiseMode || _legal.length === 0) return;
    var n = _legal.length;
    var i = _selIndex;
    for (var k = 0; k < n; k++) {
      i = (i + dir + n) % n;
      if (isAllowed(_legal[i])) { _selIndex = i; break; }
    }
    renderActions();
  };
  PK.UI.selected = function () { return _legal[_selIndex]; };
  PK.UI.isRaiseMode = function () { return _raiseMode; };
  PK.UI.raiseInfo = function () { return { min: _raiseMin, max: _raiseMax, total: _raiseTotal }; };
  PK.UI.exitRaise = function () { _raiseMode = false; renderActions(); };

  // ---- メッセージ・チュートリアル文 ----------------------------------------

  PK.UI.message = function (text) {
    document.getElementById('msg').textContent = text || '';
  };

  PK.UI.tutorialBox = function (text, waiting) {
    var el = document.getElementById('tut');
    el.hidden = false;
    el.innerHTML = '';
    var body = document.createElement('div');
    body.className = 'body';
    body.textContent = text;
    el.appendChild(body);
    if (waiting) {
      var w = document.createElement('div');
      w.className = 'waiting';
      w.textContent = PK.CONFIG.UI_TUT_WAIT_TEXT;
      w.style.color = PK.CONFIG.UI_TUT_WAIT_COLOR;
      el.appendChild(w);
    }
  };

  PK.UI.hideTutorial = function () {
    document.getElementById('tut').hidden = true;
  };

  // ---- カットイン ----------------------------------------------------------

  PK.UI.cutin = function (kind, text) {
    if (_cutinBusy) return;
    _cutinBusy = true;
    var C = PK.CONFIG.UI_CUTIN;
    var bg = (kind === 'ALLIN') ? C.allin.bg : (kind === 'WIN') ? C.win.bg : C.hand.bg;
    var from = C.slideFrom + 'px';
    var el = document.getElementById('cutin');
    el.textContent = text;
    el.style.background = bg;
    el.style.transition = 'none';
    el.style.opacity = '1';
    el.style.transform = 'translateX(' + from + ')';
    void el.offsetWidth; // reflow
    el.style.transition = 'transform ' + C.inMs + 'ms linear';
    el.style.transform = 'translateX(0)';
    setTimeout(function () {
      setTimeout(function () {
        el.style.transition = 'opacity ' + C.outMs + 'ms linear';
        el.style.opacity = '0';
        setTimeout(function () {
          el.style.transition = 'none';
          el.style.transform = 'translateX(' + from + ')';
          el.style.opacity = '1';
          _cutinBusy = false;
        }, C.outMs);
      }, C.holdMs);
    }, C.inMs);
  };

  // ---- ヘルプ ----------------------------------------------------------

  function buildHelpContent() {
    var el = document.getElementById('help');
    var html = '<h3>キー一覧</h3><table>';
    var keys = [
      ['Z / Enter / Space', '決定(選択実行・額確定・文を進める・待ちを飛ばす・gameoverから再開)'],
      ['X / Escape', '戻る(額入力 → 行動選択)'],
      ['← →', '行動選択を移動'],
      ['↑ ↓', 'レイズ・ベット額を ±BB'],
      ['F', 'フォールド'],
      ['C', 'チェック / コール'],
      ['R', 'レイズ / ベット(額入力へ)'],
      ['A', 'オールイン'],
      ['H', 'この一覧の表示切替'],
      ['N', '(完了画面) フリープレイ開始'],
      ['T', '(完了画面・gameover) チュートリアルを最初から']
    ];
    keys.forEach(function (row) {
      html += '<tr><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>';
    });
    html += '</table><h3>役の強さ(強い順)</h3><table>';
    var order = PK.CONFIG.HAND.CAT_NAME;
    for (var cat = 10; cat >= 1; cat--) {
      html += '<tr><td>' + cat + '</td><td>' + order[cat] + '</td></tr>';
    }
    html += '</table>';
    el.innerHTML = html;
  }

  PK.UI.toggleHelp = function () {
    var el = document.getElementById('help');
    el.hidden = !el.hidden;
  };

  // ---- カード画像 ----------------------------------------------------------

  PK.UI.cardImg = function (card) {
    var img = document.createElement('img');
    var code = PK.Cards.code(card);
    var tex = PK.Cards.texCache[code];
    if (tex && tex.image) img.src = tex.image.toDataURL();
    return img;
  };

  // ---- 全体リフレッシュ ------------------------------------------------

  function streetLabel(state) {
    var map = { preflop: 'プリフロップ', flop: 'フロップ', turn: 'ターン', river: 'リバー' };
    if (state.phase === 'showdown') return 'ショーダウン';
    if (state.phase === 'hand_end') {
      var liveCount = state.players.filter(function (p) { return !p.folded; }).length;
      if (liveCount >= 2) return 'ショーダウン';
    }
    return map[state.street] || state.street;
  }

  // board が3枚未満のときは PK.Eval.name() に hole の2枚配列をそのまま渡す
  // (hand_eval.js の name() がその形を特例として受ける実装になっている)
  function handNameText(state) {
    var hole = state.players[0].hole;
    if (!hole || hole.length < 2) return '';
    if (state.board.length >= 3) {
      return PK.Eval.name(PK.Eval.best7(hole.concat(state.board)));
    }
    return PK.Eval.name(hole);
  }

  function renderBoard(state) {
    var cfg = PK.CONFIG.UI_BOARD_CARD;
    var el = document.getElementById('board');
    el.style.gap = cfg.gap + 'px';
    el.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      var slot = document.createElement('div');
      slot.className = 'card2d';
      slot.style.width = cfg.w + 'px';
      slot.style.height = cfg.h + 'px';
      if (state.board[i]) {
        slot.appendChild(PK.UI.cardImg(state.board[i]));
      } else {
        slot.classList.add('back');
        slot.style.border = cfg.hiddenBorder;
      }
      el.appendChild(slot);
    }
  }

  function renderHeroCards(state) {
    var cfg = PK.CONFIG.UI_HERO_CARD;
    var el = document.getElementById('herocards');
    el.style.gap = cfg.gap + 'px';
    el.innerHTML = '';
    var hole = state.players[0].hole;
    for (var i = 0; i < 2; i++) {
      var slot = document.createElement('div');
      slot.className = 'card2d';
      slot.style.width = cfg.w + 'px';
      slot.style.height = cfg.h + 'px';
      if (hole[i]) slot.appendChild(PK.UI.cardImg(hole[i]));
      el.appendChild(slot);
    }
  }

  function renderPanel(elId, seat, state) {
    var UB = PK.CONFIG.UI_BADGE;
    var TB = PK.CONFIG.UI_TURN_BORDER;
    var el = document.getElementById(elId);
    var p = state.players[seat];
    var badges = '';
    if (state.dealer === seat) {
      badges += '<span class="badge" style="background:' + UB.dealer.color + ';color:' + UB.dealer.textColor + ';">D</span>';
    }
    if (state.sb === seat) {
      badges += '<span class="badge" style="background:' + UB.sbbb.color + ';">SB</span>';
    }
    if (state.bb === seat) {
      badges += '<span class="badge" style="background:' + UB.sbbb.color + ';">BB</span>';
    }
    var myTurn = (state.toAct === seat) && (state.phase === 'betting' || state.phase === 'wait_human');
    var row3;
    if (p.folded) row3 = 'フォールド';
    else if (p.allIn) row3 = 'オールイン';
    else if (!p.isHuman && myTurn) row3 = '考え中…';
    else if (p.betThisRound > 0) row3 = 'BET ' + p.betThisRound;
    else row3 = '';
    var panelStyle = myTurn ? ('box-shadow:inset 0 0 0 ' + TB.width + 'px ' + TB.color + ';') : '';
    el.innerHTML =
      '<div class="panel" style="' + panelStyle + '">' +
      '<div class="row1">' + p.name + badges + '</div>' +
      '<div class="row2">' + p.stack + '</div>' +
      '<div class="row3">' + row3 + '</div>' +
      '</div>';
  }

  PK.UI.refresh = function (state) {
    document.getElementById('street').textContent = 'ハンド ' + state.handNo + ' ／ ' + streetLabel(state);
    document.getElementById('pot').textContent = 'POT ' + state.pot;
    renderBoard(state);
    document.getElementById('handname').textContent = handNameText(state);
    renderHeroCards(state);
    renderPanel('p0', 0, state);
    renderPanel('p1', 1, state);
    renderPanel('p2', 2, state);
    renderPanel('p3', 3, state);
  };

  // PK.CONFIG.UI_LAYOUT / UI_COMMON / STAGE などの数値を #stage の各要素へ反映する。
  // 直書きしない方針(§0/task 指示)のため、位置・共通見た目・個別フォントサイズは
  // すべて起動時に CONFIG から読み取って適用する。
  function applyConfigStyles() {
    var stageEl = document.getElementById('stage');
    stageEl.style.width = PK.CONFIG.STAGE.w + 'px';
    stageEl.style.height = PK.CONFIG.STAGE.h + 'px';

    var UL = PK.CONFIG.UI_LAYOUT;
    var UC = PK.CONFIG.UI_COMMON;
    Object.keys(UL).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var r = UL[id];
      el.style.left = r.left + 'px';
      el.style.top = r.top + 'px';
      el.style.width = r.w + 'px';
      el.style.height = r.h + 'px';
      // #actions と #cutin は個別の見た目(透明背景・帯)を持つため共通見た目は適用しない
      if (id === 'actions' || id === 'cutin') return;
      el.style.background = UC.bg;
      el.style.borderRadius = UC.radius + 'px';
      el.style.color = UC.color;
      el.style.fontFamily = UC.font;
      el.style.fontSize = UC.fontSize + 'px';
    });

    document.getElementById('hint').textContent = PK.CONFIG.UI_HINT_TEXT;
    document.getElementById('pot').style.fontSize = PK.CONFIG.UI_POT_FONT_SIZE + 'px';
    document.getElementById('msg').style.fontSize = PK.CONFIG.UI_MSG_FONT_SIZE + 'px';
    document.getElementById('tut').style.fontSize = PK.CONFIG.UI_TUT_FONT_SIZE + 'px';
    document.getElementById('handname').style.fontSize = PK.CONFIG.UI_HANDNAME_FONT_SIZE + 'px';
    var cutinEl = document.getElementById('cutin');
    cutinEl.style.fontSize = PK.CONFIG.UI_CUTIN.fontSize + 'px';
    cutinEl.style.transform = 'translateX(' + PK.CONFIG.UI_CUTIN.slideFrom + 'px)'; // 待機時の初期位置
  }

  PK.UI.init = function () {
    applyConfigStyles();
    buildHelpContent();
  };
})();
