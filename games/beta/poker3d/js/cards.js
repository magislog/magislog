// PK.Cards — カードの生成・シャッフル・コード変換・台本デッキ・テクスチャ生成（SPEC.md §3.1 / §9）
window.PK = window.PK || {};

PK.Cards = {};

(function () {
  var CFG = function () { return PK.CONFIG; }; // 呼び出し時点で参照する（読込順は config.js が先なので常に存在）

  // ---- ランク文字の相互変換（config の CODE_RANK_CHAR を単一の正本にする） ----
  function codeRankChar(r) {
    var map = PK.CONFIG.CARD.CODE_RANK_CHAR;
    return map[r] || String(r); // 2-9はそのまま数字文字列、10=T,11=J,12=Q,13=K,14=A
  }
  var _revRankCache = null;
  function reverseRankChar(ch) {
    if (!_revRankCache) {
      _revRankCache = {};
      var map = PK.CONFIG.CARD.CODE_RANK_CHAR;
      for (var k in map) {
        if (Object.prototype.hasOwnProperty.call(map, k)) _revRankCache[map[k]] = parseInt(k, 10);
      }
    }
    if (Object.prototype.hasOwnProperty.call(_revRankCache, ch)) return _revRankCache[ch];
    return parseInt(ch, 10);
  }

  // ---- makeDeck / shuffle / code / parse ----

  PK.Cards.makeDeck = function () {
    var suits = PK.CONFIG.CARD.SUITS; // ["s","h","d","c"]
    var deck = [];
    for (var si = 0; si < suits.length; si++) {
      for (var r = 2; r <= 14; r++) {
        deck.push({ r: r, s: suits[si] });
      }
    }
    return deck;
  };

  // Fisher–Yates + Math.random()（SPEC §4.2）。引数を直接並べ替えて同じ配列を返す。
  PK.Cards.shuffle = function (deck) {
    for (var i = deck.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = deck[i];
      deck[i] = deck[j];
      deck[j] = tmp;
    }
    return deck;
  };

  PK.Cards.code = function (card) {
    return codeRankChar(card.r) + card.s;
  };

  PK.Cards.parse = function (str) {
    var s = str.charAt(str.length - 1);
    var rankPart = str.slice(0, str.length - 1);
    var r = reverseRankChar(rankPart);
    return { r: r, s: s };
  };

  // ---- buildScriptedDeck（SPEC §9） ----
  // seq = 配る順（sb から時計回り×2周、各席 holes の1枚目→2枚目）の8枚 + board 5枚。
  // 残りをシャッフルした配列の後ろに seq を逆順で連結する（deck.pop() で seq の先頭から出る）。
  // holes/board が無い台本（ハンド6＝ランダム）は通常のシャッフル済みデッキを返す。
  PK.Cards.buildScriptedDeck = function (script) {
    if (!script || !script.holes || !script.board) {
      return PK.Cards.shuffle(PK.Cards.makeDeck());
    }
    var sb = (script.dealer + 1) % 4; // ハンド開始直後は全席参加中なので単純な次席でよい
    var seq = [];
    for (var round = 0; round < 2; round++) {
      for (var i = 0; i < 4; i++) {
        var seat = (sb + i) % 4;
        seq.push(PK.Cards.parse(script.holes[seat][round]));
      }
    }
    for (var b = 0; b < script.board.length; b++) {
      seq.push(PK.Cards.parse(script.board[b]));
    }

    var seqCodeSet = {};
    for (var qi = 0; qi < seq.length; qi++) seqCodeSet[PK.Cards.code(seq[qi])] = true;

    var rest = PK.Cards.makeDeck().filter(function (c) {
      return !seqCodeSet[PK.Cards.code(c)];
    });
    rest = PK.Cards.shuffle(rest);

    var seqRev = seq.slice().reverse();
    return rest.concat(seqRev);
  };

  // ---- テクスチャ生成 ----

  function getAnisotropy() {
    // renderer は scene.js が作る（cards.js の読込時点ではまだ無いことが多い）。
    // 無ければ 1（等方フィルタなし）で作り、実害の無い見た目の妥協として扱う。
    try {
      if (PK.Scene && PK.Scene.renderer && PK.Scene.renderer.capabilities) {
        return PK.Scene.renderer.capabilities.getMaxAnisotropy();
      }
    } catch (e) { /* noop */ }
    return 1;
  }

  function rankDisplayText(r) {
    if (r === 10) return "10";
    var chars = PK.CONFIG.CARD.texture.rankChars;
    return chars[r] || String(r);
  }

  PK.Cards.makeFaceTexture = function (card) {
    var cfg = PK.CONFIG.CARD.texture;
    var canvas = document.createElement('canvas');
    canvas.width = cfg.w;
    canvas.height = cfg.h;
    var ctx = canvas.getContext('2d');

    // 1. 白地 + 枠
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cfg.w, cfg.h);
    ctx.strokeStyle = cfg.borderColor;
    ctx.lineWidth = cfg.borderWidth;
    ctx.strokeRect(cfg.borderRect[0], cfg.borderRect[1], cfg.borderRect[2], cfg.borderRect[3]);

    // 2. 色・フォント
    var isRed = (card.s === 'h' || card.s === 'd');
    ctx.fillStyle = isRed ? cfg.redColor : cfg.blackColor;

    var rankStr = rankDisplayText(card.r);
    var suitStr = cfg.suitUnicode[card.s];

    function drawCorner() {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = 'bold ' + cfg.cornerRankSize + 'px ' + cfg.font;
      ctx.fillText(rankStr, cfg.cornerRankPos[0], cfg.cornerRankPos[1]);
      ctx.font = cfg.cornerSuitSize + 'px ' + cfg.font;
      ctx.fillText(suitStr, cfg.cornerSuitPos[0], cfg.cornerSuitPos[1]);
    }

    // 3. 左上
    drawCorner();

    // 4. 中央
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = cfg.centerSuitSize + 'px ' + cfg.font;
    ctx.fillText(suitStr, cfg.centerSuitPos[0], cfg.centerSuitPos[1]);

    // 5. 右下（180度回転させて同じ絵を描く）
    ctx.save();
    ctx.translate(cfg.w, cfg.h);
    ctx.rotate(Math.PI);
    drawCorner();
    ctx.restore();

    var tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = getAnisotropy();
    return tex;
  };

  PK.Cards.makeBackTexture = function () {
    var cfg = PK.CONFIG.CARD.backTexture;
    var canvas = document.createElement('canvas');
    canvas.width = cfg.w;
    canvas.height = cfg.h;
    var ctx = canvas.getContext('2d');

    ctx.fillStyle = cfg.bgColor;
    ctx.fillRect(0, 0, cfg.w, cfg.h);

    ctx.strokeStyle = cfg.borderColor;
    ctx.lineWidth = cfg.borderWidth;
    ctx.strokeRect(cfg.borderRect[0], cfg.borderRect[1], cfg.borderRect[2], cfg.borderRect[3]);

    ctx.save();
    ctx.beginPath();
    ctx.rect(cfg.clipRect[0], cfg.clipRect[1], cfg.clipRect[2], cfg.clipRect[3]);
    ctx.clip();

    ctx.strokeStyle = cfg.lineColor;
    ctx.lineWidth = cfg.lineWidth;
    var x0 = cfg.clipRect[0], y0 = cfg.clipRect[1];
    var w = cfg.clipRect[2], h = cfg.clipRect[3];
    var pad = w + h; // 45度の斜線がクリップ域を覆い切る長さ
    for (var off = -pad; off <= pad; off += cfg.lineGap) {
      ctx.beginPath();
      ctx.moveTo(x0 + off, y0 - pad);
      ctx.lineTo(x0 + off + pad * 2, y0 - pad + pad * 2);
      ctx.stroke();
    }
    ctx.restore();

    var tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = getAnisotropy();
    return tex;
  };

  // ---- texCache: 52枚 + 裏1枚を起動時に全部作って保持（毎回作らない） ----
  PK.Cards.texCache = {};

  (function buildAllTextures() {
    var suits = PK.CONFIG.CARD.SUITS;
    for (var si = 0; si < suits.length; si++) {
      for (var r = 2; r <= 14; r++) {
        var card = { r: r, s: suits[si] };
        PK.Cards.texCache[PK.Cards.code(card)] = PK.Cards.makeFaceTexture(card);
      }
    }
    PK.Cards.texCache.back = PK.Cards.makeBackTexture();
  })();

})();
