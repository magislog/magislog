// MJ.UI — 画面のUI（SPEC.md §8）。DOM オーバーレイ。
window.MJ = window.MJ || {};
MJ.UI = {};

(function () {
  'use strict';

  var LABELS = {
    DISCARD: 'Z 切る', RIICHI: 'R リーチ', TSUMO: 'A ツモ', RON: 'A ロン',
    PASS: 'X パス', CANCEL: 'X 戻る'
  };

  var CUTIN_TEXT = { RIICHI: 'リーチ', TSUMO: 'ツモ', RON: 'ロン', RYUKYOKU: '流局' };

  var _tileDataUrl = [];
  var _cutinBusy = false;

  MJ.UI.tileImg = function (id) {
    var img = document.createElement('img');
    img.src = _tileDataUrl[id] || '';
    img.style.width = MJ.CONFIG.UI.TILE_IMG_W + 'px';
    img.style.height = MJ.CONFIG.UI.TILE_IMG_H + 'px';
    return img;
  };

  // ---- メッセージ ----------------------------------------------------------

  MJ.UI.message = function (text) {
    document.getElementById('msg').textContent = text || '';
  };

  // ---- チュートリアル文 ------------------------------------------------------

  MJ.UI.tutorialBox = function (text, waiting) {
    var el = document.getElementById('tut');
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle('waiting', !!waiting);
  };

  MJ.UI.hideTutorial = function () {
    var el = document.getElementById('tut');
    el.hidden = true;
    el.classList.remove('waiting');
  };

  // ---- 手牌・カーソル --------------------------------------------------------

  MJ.UI.showHand = function (cursor, allowedMask) {
    var slots = document.getElementById('hand').querySelectorAll('.tile-slot');
    for (var i = 0; i < slots.length; i++) {
      var el = slots[i];
      el.classList.toggle('cursor', i === cursor);
      var disabled = !!(allowedMask && allowedMask[i] === false);
      el.classList.toggle('disabled', disabled);
    }
  };

  MJ.UI.hideHand = function () {
    document.getElementById('hand').innerHTML = '';
  };

  // ---- 行動ボタン --------------------------------------------------------

  MJ.UI.showActions = function (list) {
    var allow = MJ.Tutorial.allowed();
    var el = document.getElementById('actions');
    el.innerHTML = '';
    for (var i = 0; i < list.length; i++) {
      var kind = list[i];
      var btn = document.createElement('div');
      btn.className = 'action-btn';
      btn.setAttribute('data-action', kind);
      btn.textContent = LABELS[kind] || kind;
      if (allow && allow.indexOf(kind) === -1) btn.classList.add('disabled');
      el.appendChild(btn);
    }
  };

  MJ.UI.hideActions = function () {
    document.getElementById('actions').innerHTML = '';
  };

  // ---- カットイン ----------------------------------------------------------

  MJ.UI.cutin = function (kind) {
    if (_cutinBusy) return;
    _cutinBusy = true;
    var el = document.getElementById('cutin');
    var color = MJ.CONFIG.CUTIN[kind];
    el.textContent = CUTIN_TEXT[kind] || '';
    el.style.background = color || '';
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
      }, 700);
    }, 250);
  };

  // ---- ヘルプ ----------------------------------------------------------

  function buildHelpContent() {
    var el = document.getElementById('help');
    var html = '<div class="help-title">キー一覧と採用役</div><div class="help-content">';
    html += '<b>キー一覧</b><table><tbody>';
    var keys = [
      ['Z / Enter / Space', '決定: 牌を切る／文を進める／結果画面を閉じる'],
      ['X / Escape', 'ロンを見送る（パス）／リーチ選択をやめる'],
      ['← →', '手牌のカーソル移動'],
      ['A', 'ツモ・ロン'],
      ['R', 'リーチ宣言モードへ'],
      ['H', 'この一覧の表示切替'],
      ['N', '(終局画面) フリープレイ開始'],
      ['T', '(終局画面) チュートリアルを最初から']
    ];
    for (var i = 0; i < keys.length; i++) {
      html += '<tr><td>' + keys[i][0] + '</td><td>' + keys[i][1] + '</td></tr>';
    }
    html += '</tbody></table><br><b>採用役</b><table><tbody>';
    var yaku = [
      ['リーチ', '1'], ['門前清自摸和', '1'], ['断么九', '1'],
      ['役牌 白／發／中', '各1'], ['自風牌', '1'], ['場風牌', '1'],
      ['平和', '1'], ['一盃口', '1'], ['七対子', '2'], ['対々和', '2'],
      ['一気通貫', '2'], ['三色同順', '2'], ['混一色', '3'], ['清一色', '6']
    ];
    for (i = 0; i < yaku.length; i++) {
      html += '<tr><td>' + yaku[i][0] + '</td><td>' + yaku[i][1] + '翻</td></tr>';
    }
    html += '</tbody></table></div>';
    el.innerHTML = html;
  }

  MJ.UI.toggleHelp = function () {
    var el = document.getElementById('help');
    el.hidden = !el.hidden;
  };

  // ---- 和了・流局結果 --------------------------------------------------------

  function playerDelta(seat, r) {
    if (r.exhaust) return 0;
    if (seat === r.seat) return r.res.total + (r.kyotakuBefore || 0) * 1000;
    if (r.from === -1) {
      // ツモ: 他家が支払う
      var isDealerSeat = seat === MJ.Game.state.dealer;
      var pay = isDealerSeat ? r.res.pay.dealer : r.res.pay.child;
      return -(pay || 0);
    }
    // ロン: from の席だけ支払う
    return (seat === r.from) ? -r.res.payRon : 0;
  }

  MJ.UI.showResult = function (res) {
    var el = document.getElementById('result');
    el.hidden = false;
    var titleEl = el.querySelector('.result-title');
    var handEl = el.querySelector('.result-hand');
    var yakuEl = el.querySelector('.result-yaku');
    var pointsEl = el.querySelector('.result-points');
    var payEl = el.querySelector('.result-payment');

    if (res.exhaust) {
      titleEl.textContent = '流局';
      handEl.innerHTML = '';
      yakuEl.innerHTML = '';
      pointsEl.textContent = '点数の移動はありません';
      payEl.textContent = '';
      return;
    }

    var names = MJ.CONFIG.NAMES;
    titleEl.textContent = names[res.seat] + ' の ' +
      (res.from === -1 ? 'ツモ' : ('ロン（' + names[res.from] + ' から）'));

    handEl.innerHTML = '';
    // winTile が null で来ることがあり、そのまま .uid を読んで例外で落ちていた
    // （2026-09-04 表ういが実機で確認: Uncaught TypeError ... reading 'uid'）。
    // SPEC §12「止まるより進む」に合わせ、無いときは強調なしで14枚だけ並べる。
    var winTile = res.winTile || null;
    var all = res.hand14 || [];
    var others = winTile ? all.filter(function (t) { return t.uid !== winTile.uid; }) : all.slice();
    others = MJ.Tiles.sortHand(others);
    var i;
    for (i = 0; i < others.length; i++) {
      handEl.appendChild(MJ.UI.tileImg(others[i].id));
    }
    if (winTile) {
      var winImg = MJ.UI.tileImg(winTile.id);
      winImg.className = 'ron-tile';
      handEl.appendChild(winImg);
    }

    yakuEl.innerHTML = '';
    for (i = 0; i < res.res.yaku.length; i++) {
      var y = res.res.yaku[i];
      var line = document.createElement('div');
      line.textContent = (y.name === 'ドラ') ? ('ドラ ' + y.han) : (y.name + ' ' + y.han + '翻');
      yakuEl.appendChild(line);
    }

    pointsEl.textContent = res.res.text;

    var parts = [];
    for (i = 0; i < 4; i++) {
      var d = playerDelta(i, res);
      var sign = d >= 0 ? '+' : '';
      parts.push(names[i] + ' ' + sign + d);
    }
    payEl.textContent = parts.join('　');
  };

  MJ.UI.hideResult = function () {
    document.getElementById('result').hidden = true;
  };

  // 終局画面を消す口が無く、N（フリープレイ）や T（最初から）で新しい局が始まっても
  // 終局画面が画面に残り続けていた（2026-09-04 表ういが実機で確認）。
  MJ.UI.hideFinal = function () {
    var el = document.getElementById('final');
    if (el) el.hidden = true;
  };

  MJ.UI.showFinal = function (rank) {
    var el = document.getElementById('final');
    el.hidden = false;
    var names = MJ.CONFIG.NAMES;
    var state = MJ.Game.state;
    var html = '<div class="final-title">終局' +
      (MJ.Tutorial.active ? '<br>チュートリアル完了' : '') + '</div>';
    for (var i = 0; i < rank.length; i++) {
      var seat = rank[i];
      var pts = state.players[seat].points;
      var diff = pts - MJ.CONFIG.START_POINTS;
      var sign = diff >= 0 ? '+' : '';
      html += '<div class="final-rank">' + (i + 1) + '位　' + names[seat] + '　' + pts +
        '（' + sign + diff + '）</div>';
    }
    html += '<div class="final-next">N: フリープレイ　T: チュートリアルを最初から</div>';
    el.innerHTML = html;
  };

  // ---- 全体リフレッシュ ------------------------------------------------

  function windBadge(seat, state) {
    var w = MJ.Game.seatWind(seat);
    var isDealer = w === 0;
    var cls = isDealer ? 'yellow' : 'blue';
    return '<span class="wind-badge ' + cls + '">' + MJ.CONFIG.WIND_NAMES[w] + '</span>';
  }

  var ACTIVE_TURN_PHASES = { draw: 1, cpu_turn: 1, wait_human: 1, wait_human_riichi: 1, wait_ron: 1 };

  function renderPanel(elId, seat, state) {
    var el = document.getElementById(elId);
    var p = state.players[seat];
    var riichiBadge = p.riichi ? '<span class="wind-badge" style="background:#e53935;color:#fff;">リーチ</span>' : '';
    var isTurn = ACTIVE_TURN_PHASES[state.phase] && state.turn === seat;
    el.innerHTML =
      '<div class="player-name">' + p.name + windBadge(seat, state) + riichiBadge + '</div>' +
      '<div class="player-points">' + p.points + '</div>';
    el.style.boxShadow = isTurn ? 'inset 0 0 0 2px #ffd54f' : '';
  }

  function renderCenter(state) {
    var el = document.getElementById('center');
    var isTurn = function (s) { return ACTIVE_TURN_PHASES[state.phase] && state.turn === s; };
    function ptText(seat) {
      var p = state.players[seat];
      var style = isTurn(seat) ? ' style="color:#ffd54f;"' : '';
      var dealerMark = (seat === state.dealer) ? '東' : '';
      return '<span' + style + '>' + p.name + dealerMark + ' ' + p.points + '</span>';
    }
    el.innerHTML =
      '<div class="center-line">' + ptText(2) + '</div>' +
      '<div class="center-line">' + ptText(3) + ' ' + ptText(1) + '</div>' +
      '<div class="center-main">東' + (state.round + 1) + '局<br>残り ' + state.drawsLeft +
      '<br>供託 ' + state.kyotaku + '</div>' +
      '<div class="center-line">' + ptText(0) + '</div>';
  }

  function renderDora(state) {
    var el = document.getElementById('dora-img');
    el.innerHTML = '';
    if (state.doraInd) el.appendChild(MJ.UI.tileImg(state.doraInd.id));
  }

  function renderRound(state) {
    document.getElementById('round').textContent = '東' + (state.round + 1) + '局 ／ 残り ' + state.drawsLeft + ' 枚';
  }

  function renderHand(state) {
    var el = document.getElementById('hand');
    el.innerHTML = '';
    var p = state.players[0];
    var i;
    for (i = 0; i < 13; i++) {
      var slot = document.createElement('div');
      slot.className = 'tile-slot';
      if (p.hand[i]) slot.appendChild(MJ.UI.tileImg(p.hand[i].id));
      el.appendChild(slot);
    }
    var gap = document.createElement('div');
    gap.className = 'tsumo-gap';
    el.appendChild(gap);

    var tsumoSlot = document.createElement('div');
    tsumoSlot.className = 'tile-slot';
    if (p.tsumo) {
      tsumoSlot.appendChild(MJ.UI.tileImg(p.tsumo.id));
    } else {
      tsumoSlot.classList.add('empty');
    }
    el.appendChild(tsumoSlot);
  }

  MJ.UI.refresh = function (state) {
    renderRound(state);
    renderDora(state);
    renderPanel('p0', 0, state);
    renderPanel('p1', 1, state);
    renderPanel('p2', 2, state);
    renderPanel('p3', 3, state);
    renderCenter(state);
    renderHand(state);
    document.getElementById('actions').innerHTML = '';
  };

  // ---- init ------------------------------------------------------------------

  MJ.UI.init = function () {
    for (var id = 0; id < 34; id++) {
      _tileDataUrl[id] = MJ.Tiles.faceCanvas(id).toDataURL();
    }
    buildHelpContent();
    document.getElementById('hint').textContent = 'H: キー一覧';
  };
})();
