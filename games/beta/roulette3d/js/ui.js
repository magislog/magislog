// roulette3d — RL.UI（画面のUI。SPEC.md §8）。DOM オーバーレイ。担当C。
// css/style.css（担当B）が用意した id・class（.hist-chip/.num-badge/.sel/.waiting/
// .title/.line/.next/.help-title/.help-body/.result-*）をそのまま使う。css は直さない。
window.RL = window.RL || {};
RL.UI = {};

(function () {
  'use strict';

  var _cutinBusy = false;

  // ---- 数字の色チップ（§8。24×24角丸・赤/黒/緑・白文字14pxbold。色は css の .hist-chip.<color>） --

  RL.UI.historyChip = function (n) {
    var color = RL.Bets.colorOf(n);
    return '<span class="hist-chip ' + color + '">' + n + '</span>';
  };

  // ---- メッセージ --------------------------------------------------------------

  RL.UI.message = function (text) {
    var el = document.getElementById('msg');
    if (el) el.textContent = text || '';
  };

  // ---- チュートリアル文（waitingクラスでcss側の::afterが「Z/Enterで次へ」を出す） -----

  RL.UI.tutorialBox = function (text, waiting) {
    var el = document.getElementById('tut');
    if (!el) return;
    el.hidden = false;
    el.textContent = text || '';
    el.classList.toggle('waiting', !!waiting);
  };

  RL.UI.hideTutorial = function () {
    var el = document.getElementById('tut');
    if (!el) return;
    el.hidden = true;
    el.classList.remove('waiting');
  };

  // ---- カットイン（§4.1「setTimeoutを書いてよいのはdelay()とここだけ」・CUTIN_MS駆動） -----

  RL.UI.cutin = function (kind, text) {
    if (_cutinBusy) return;
    var el = document.getElementById('cutin');
    if (!el) return;
    var C = RL.CONFIG;
    var bg = kind === 'BIGWIN' ? C.CUTIN.BIGWIN : C.CUTIN.WIN;
    var label = kind === 'BIGWIN' ? 'BIG WIN' : 'WIN';
    _cutinBusy = true;

    el.textContent = label + ' ' + (text || '');
    el.style.background = bg;
    el.style.transition = 'none';
    el.style.opacity = '1';
    el.style.transform = 'translateX(-1280px)';
    void el.offsetWidth; // reflow
    el.style.transition = 'transform 250ms linear';
    el.style.transform = 'translateX(0)';

    setTimeout(function () {
      setTimeout(function () {
        el.style.transition = 'opacity 250ms linear';
        el.style.opacity = '0';
        setTimeout(function () {
          el.style.transition = 'none';
          el.style.transform = 'translateX(-1280px)';
          el.style.opacity = '1';
          _cutinBusy = false;
        }, 250);
      }, C.CUTIN_MS);
    }, 250);
  };

  // ---- 結果パネル（§8 #result。null で落ちない） --------------------------------

  RL.UI.showResult = function (res) {
    var el = document.getElementById('result');
    if (!el) return;
    el.hidden = false;
    var C = RL.CONFIG;

    var winning = (res && Number.isInteger(res.winning)) ? res.winning : null;
    var color = (winning !== null) ? res.color : null;
    var colorClass = color || 'green';
    var colorName = color ? (C.COLOR_NAMES[color] || '') : '';
    var numText = winning === null ? '—' : String(winning);

    var html = '';
    html += '<div class="result-title">当たり</div>';
    html += '<div class="result-num"><span class="num-badge ' + colorClass + '">' + numText + '</span></div>';
    html += '<div class="result-color">' + colorName + '</div>';

    var rows = (res && res.rows) ? res.rows : [];
    var shown = rows.slice(0, 6);
    var rowsHtml = '';
    var i;
    for (i = 0; i < shown.length; i++) {
      var r = shown[i];
      var outcome = r.won ? ('当たり +' + r.pay.toLocaleString()) : '外れ';
      rowsHtml += '<div>' + r.label + '　' + r.amount.toLocaleString() + ' → ' + outcome + '</div>';
    }
    if (rows.length > 6) rowsHtml += '<div>…他 ' + (rows.length - 6) + ' 件</div>';
    html += '<div class="result-rows">' + rowsHtml + '</div>';

    var totalBet = (res && res.totalBet) || 0;
    var totalReturn = (res && res.totalReturn) || 0;
    var net = (res && res.net) || 0;
    var sign = net >= 0 ? '+' : '';
    html += '<div class="result-total">賭け ' + totalBet.toLocaleString() + ' → 戻り ' +
      totalReturn.toLocaleString() + '（' + sign + net.toLocaleString() + '）</div>';
    html += '<div class="result-next">' + C.TEXT.NEXT + '</div>';

    el.innerHTML = html;
  };

  RL.UI.hideResult = function () {
    var el = document.getElementById('result');
    if (el) el.hidden = true;
  };

  // ---- 完了・ゲームオーバー画面（§8） --------------------------------------------

  RL.UI.showComplete = function (balance) {
    var el = document.getElementById('complete');
    if (!el) return;
    el.hidden = false;
    var C = RL.CONFIG;
    var bal = balance || 0;
    var html = '';
    html += '<div class="title">チュートリアル完了</div>';
    html += '<div class="line">残高 ' + bal.toLocaleString() + '（開始 ' + C.START_BALANCE.toLocaleString() + '）</div>';
    html += '<div class="line">' + C.TEXT.EV + '</div>';
    html += '<div class="next">N: フリープレイ（1000 から）　T: チュートリアルを最初から</div>';
    el.innerHTML = html;
  };

  RL.UI.hideComplete = function () {
    var el = document.getElementById('complete');
    if (el) el.hidden = true;
  };

  RL.UI.showGameover = function () {
    var el = document.getElementById('gameover');
    if (!el) return;
    el.hidden = false;
    var C = RL.CONFIG;
    var html = '';
    html += '<div class="title">残高 0</div>';
    html += '<div class="line">' + C.TEXT.MSG.gameover + '</div>';
    html += '<div class="next">T: チュートリアルを最初から</div>';
    el.innerHTML = html;
  };

  RL.UI.hideGameover = function () {
    var el = document.getElementById('gameover');
    if (el) el.hidden = true;
  };

  // ---- ヘルプ（キー一覧＋配当表。§7・§5.3。倍率・確率はCONFIGから計算し直書きしない） -----

  function buildHelpContent() {
    var el = document.getElementById('help');
    if (!el) return;
    var C = RL.CONFIG;
    var html = '<div class="help-title">キー一覧と配当表</div>';
    html += '<div class="help-body">';

    html += '<b>キー一覧</b><br>';
    var keys = [
      ['←→↑↓', 'マス移動'],
      ['Z / Enter / Space', '置く／文を進める／結果を閉じる／ゲームオーバーから再開'],
      ['X / Escape', 'カーソルのマスの賭けを取り消し（無ければ最後の賭けを取り消し）'],
      ['S', '玉を回す（賭け 0 でも回せる）'],
      ['C / V', 'チップ額を上げる／下げる'],
      ['1 2 3 4', 'チップ額を直接指定'],
      ['H', 'この一覧の表示切替'],
      ['N', '(完了画面) フリープレイ'],
      ['T', '(完了・ゲームオーバー画面) チュートリアルを最初から']
    ];
    var i;
    for (i = 0; i < keys.length; i++) {
      html += keys[i][0] + '　' + keys[i][1] + '<br>';
    }

    html += '<br><b>配当表</b><br>';
    var order = ['straight', 'split', 'street', 'corner', 'sixline', 'dozen', 'column', 'red', 'odd', 'low'];
    for (i = 0; i < order.length; i++) {
      var type = order[i];
      var bt = C.BET_TYPES[type];
      var mult = bt.pays + 1;
      var n = (C.POCKETS - 1) / mult; // 数字の数×(pays+1)=POCKETS-1（§5.3の教材の芯）
      var pct = (n / C.POCKETS * 100).toFixed(1);
      html += bt.name + '　' + mult + ' 倍（' + bt.pays + ':1）　' + n + '/' + C.POCKETS + '（' + pct + '%）<br>';
    }

    html += '<br>' + C.TEXT.EV;
    html += '</div>';
    el.innerHTML = html;
  }

  RL.UI.toggleHelp = function () {
    var el = document.getElementById('help');
    if (el) el.hidden = !el.hidden;
  };

  // ---- 全体リフレッシュ（§8。差分更新はしない・毎回作り直す） ---------------------

  RL.UI.refresh = function (state) {
    var C = RL.CONFIG;

    var balEl = document.getElementById('balance');
    if (balEl) balEl.textContent = '残高 ' + state.balance.toLocaleString();

    var totalBet = 0;
    var i;
    for (i = 0; i < state.betOrder.length; i++) {
      var b = state.bets[state.betOrder[i]];
      if (b) totalBet += b.amount;
    }
    var tbEl = document.getElementById('totalbet');
    if (tbEl) tbEl.textContent = '賭け合計 ' + totalBet.toLocaleString();

    var lwEl = document.getElementById('lastwin');
    if (lwEl) {
      var net = state.lastNet || 0;
      var sign = net >= 0 ? '+' : '';
      lwEl.textContent = '前回 ' + sign + net.toLocaleString();
      lwEl.classList.toggle('pos', net > 0);
      lwEl.classList.toggle('neg', net < 0);
    }

    var roundEl = document.getElementById('round');
    if (roundEl) {
      roundEl.textContent = '回転 ' + state.roundNo + ' ／ ' + (C.TEXT.PHASE[state.phase] || '');
    }

    var histEl = document.getElementById('history');
    if (histEl) {
      var h = state.history || [];
      var htmlH = '';
      for (i = 0; i < h.length; i++) htmlH += RL.UI.historyChip(h[i]);
      histEl.innerHTML = htmlH;
    }

    var cursorEl = document.getElementById('cursor');
    if (cursorEl) {
      var spot = RL.Bets.spotAt(state.cursor.x, state.cursor.y);
      if (!spot) {
        cursorEl.textContent = '選択: —';
      } else {
        var here = state.bets[spot.key];
        var amt = here ? here.amount : 0;
        var pays = C.BET_TYPES[spot.type].pays;
        cursorEl.textContent = '選択: ' + RL.Bets.label(spot) + '（' + pays + ':1）　このマス ' + amt.toLocaleString();
      }
    }

    var chipEl = document.getElementById('chip');
    if (chipEl) {
      var parts = [];
      for (i = 0; i < C.CHIP_VALUES.length; i++) {
        var v = C.CHIP_VALUES[i];
        parts.push(i === state.chipIdx ? ('<span class="sel">[' + v + ']</span>') : String(v));
      }
      chipEl.innerHTML = 'チップ: ' + parts.join(' ／ ') + '　C/V で変更';
    }

    var betsEl = document.getElementById('bets');
    if (betsEl) {
      if (!state.betOrder.length) {
        betsEl.textContent = '賭け無し';
      } else {
        var rowsShown = state.betOrder.slice(0, C.UI.BETS_ROWS);
        var htmlB = '';
        for (i = 0; i < rowsShown.length; i++) {
          var bet = state.bets[rowsShown[i]];
          if (!bet) continue;
          htmlB += '<div>' + RL.Bets.label(bet.spot) + '　' + bet.amount.toLocaleString() + '</div>';
        }
        var extra = state.betOrder.length - rowsShown.length;
        if (extra > 0) htmlB += '<div>…他 ' + extra + ' 件</div>';
        betsEl.innerHTML = htmlB;
      }
    }
  };

  // ---- init ------------------------------------------------------------------

  RL.UI.init = function () {
    buildHelpContent();
    var keysEl = document.getElementById('keys');
    if (keysEl) keysEl.textContent = RL.CONFIG.TEXT.KEYS_LINE;
    var hintEl = document.getElementById('hint');
    if (hintEl) hintEl.textContent = 'H: 配当表';
  };
})();
