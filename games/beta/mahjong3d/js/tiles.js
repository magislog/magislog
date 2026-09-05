window.MJ = window.MJ || {};
MJ.Tiles = {};

// ---- id/code conversion --------------------------------------------------
// id 0-8 = 1m-9m, 9-17 = 1p-9p, 18-26 = 1s-9s, 27-33 = 1z-7z (東南西北白發中)
var SUIT_BASE = { m: 0, p: 9, s: 18, z: 27 };

MJ.Tiles.suit = function (id) {
  if (id < 9) return 'm';
  if (id < 18) return 'p';
  if (id < 27) return 's';
  return 'z';
};

MJ.Tiles.num = function (id) {
  if (id < 27) return (id % 9) + 1;
  return (id - 27) + 1;
};

MJ.Tiles.code = function (id) {
  return String(MJ.Tiles.num(id)) + MJ.Tiles.suit(id);
};

MJ.Tiles.parse = function (str) {
  var m = /^([1-9])([mpsz])$/.exec(String(str));
  if (!m) {
    console.error('MJ.Tiles.parse: invalid code "' + str + '"');
    return 0;
  }
  var n = parseInt(m[1], 10);
  var s = m[2];
  return SUIT_BASE[s] + (n - 1);
};

MJ.Tiles.isHonor = function (id) {
  return id >= 27;
};

MJ.Tiles.isTerminal = function (id) {
  if (id >= 27) return false;
  var n = MJ.Tiles.num(id);
  return n === 1 || n === 9;
};

// ---- wall / hand utilities -------------------------------------------------
MJ.Tiles.shuffle = function (arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
};

MJ.Tiles.makeWall = function () {
  var wall = [];
  for (var id = 0; id < 34; id++) {
    for (var k = 0; k < 4; k++) {
      wall.push({ id: id, uid: id * 4 + k });
    }
  }
  return MJ.Tiles.shuffle(wall);
};

MJ.Tiles.sortHand = function (hand) {
  return hand.slice().sort(function (a, b) {
    return (a.id - b.id) || (a.uid - b.uid);
  });
};

MJ.Tiles.counts = function (hand) {
  var c = new Array(34);
  for (var i = 0; i < 34; i++) c[i] = 0;
  for (var j = 0; j < hand.length; j++) c[hand[j].id]++;
  return c;
};

// 台本つきの牌山を組む（§4.2）。
// 実測できないため設計文の記述を素直に再現した実装。詳細は js/_NOTES.txt 参照。
MJ.Tiles.buildScriptedWall = function (script) {
  script = script || {};
  var Tiles = MJ.Tiles;

  var all = [];
  for (var id = 0; id < 34; id++) {
    for (var k = 0; k < 4; k++) all.push({ id: id, uid: id * 4 + k });
  }
  var usedUid = {};

  function reserve(code) {
    var tid = Tiles.parse(code);
    for (var k2 = 0; k2 < 4; k2++) {
      var uid = tid * 4 + k2;
      if (!usedUid[uid]) {
        usedUid[uid] = true;
        return { id: tid, uid: uid };
      }
    }
    console.error('MJ.Tiles.buildScriptedWall: code "' + code + '" exceeds 4 copies, using random tile instead');
    return null;
  }

  var dealer = script.dealer || 0;
  var seatOrder = [dealer, (dealer + 1) % 4, (dealer + 2) % 4, (dealer + 3) % 4];

  var seatHands = [[], [], [], []];
  for (var s = 0; s < 4; s++) {
    var codes = (script.hands && script.hands[s]) || [];
    for (var i = 0; i < 13; i++) {
      seatHands[s].push(i < codes.length ? reserve(codes[i]) : null);
    }
  }

  var drawCodes = script.draws || [];
  var drawsEnts = [];
  for (var d = 0; d < drawCodes.length; d++) drawsEnts.push(reserve(drawCodes[d]));

  var doraEnt = script.dora ? reserve(script.dora) : null;

  // 指定分を除いた残りをシャッフルして、null 埋めと山尻に使う
  var remaining = [];
  for (var m = 0; m < all.length; m++) {
    if (!usedUid[all[m].uid]) remaining.push(all[m]);
  }
  remaining = Tiles.shuffle(remaining);

  function take() {
    return remaining.pop();
  }

  if (!doraEnt) doraEnt = take();
  for (s = 0; s < 4; s++) {
    for (i = 0; i < 13; i++) {
      if (!seatHands[s][i]) seatHands[s][i] = take();
    }
  }
  for (d = 0; d < drawsEnts.length; d++) {
    if (!drawsEnts[d]) drawsEnts[d] = take();
  }

  // 配牌順 D[0..51]: dealer から時計回りに 4 枚×3周 + 1 枚×1周
  var D = new Array(52);
  var ptr = [0, 0, 0, 0];
  var pos = 0;
  for (var round = 0; round < 3; round++) {
    for (var oi = 0; oi < 4; oi++) {
      var seat = seatOrder[oi];
      for (var t = 0; t < 4; t++) D[pos++] = seatHands[seat][ptr[seat]++];
    }
  }
  for (oi = 0; oi < 4; oi++) {
    var seat2 = seatOrder[oi];
    D[pos++] = seatHands[seat2][ptr[seat2]++];
  }

  // wall.pop() が「配牌52枚 → draws → ランダム」の順で出るように並べる。
  // ドラ表示牌は wall[5] に挿入する（game.js が wall[5] を splice して取り出す想定）。
  var wall = remaining.slice();
  wall = wall.concat(drawsEnts.slice().reverse());
  wall = wall.concat(D.slice().reverse());
  wall.splice(5, 0, doraEnt);

  return wall;
};

// ---- 牌の絵（Canvas 2D） ---------------------------------------------------
MJ.Tiles.texCache = {};
var _faceCanvasCache = {};

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function _pinCircle(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, r / 3, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}

function _drawPin(ctx, num, FACE) {
  var B = FACE.PIN_BLUE, R = FACE.PIN_RED, G = FACE.PIN_GREEN;
  var defs = {
    1: [[64, 88, 34, R]],
    2: [[64, 50, 24, B], [64, 126, 24, B]],
    3: [[34, 44, 20, B], [64, 88, 20, G], [94, 132, 20, R]],
    4: [[36, 52, 20, B], [92, 52, 20, B], [36, 124, 20, B], [92, 124, 20, B]],
    5: [[36, 52, 20, B], [92, 52, 20, B], [36, 124, 20, B], [92, 124, 20, B], [64, 88, 20, R]],
    6: [[36, 40, 18, G], [92, 40, 18, G], [36, 88, 18, B], [92, 88, 18, B], [36, 136, 18, B], [92, 136, 18, B]],
    7: [[36, 88, 18, B], [92, 88, 18, B], [36, 136, 18, B], [92, 136, 18, B], [26, 34, 18, G], [64, 44, 18, G], [102, 54, 18, G]],
    8: [[36, 30, 16, B], [92, 30, 16, B], [36, 69, 16, B], [92, 69, 16, B], [36, 108, 16, B], [92, 108, 16, B], [36, 147, 16, B], [92, 147, 16, B]],
    9: [[30, 44, 16, G], [64, 44, 16, G], [98, 44, 16, G], [30, 88, 16, R], [64, 88, 16, R], [98, 88, 16, R], [30, 132, 16, B], [64, 132, 16, B], [98, 132, 16, B]]
  };
  var list = defs[num] || [];
  for (var i = 0; i < list.length; i++) {
    _pinCircle(ctx, list[i][0], list[i][1], list[i][2], list[i][3]);
  }
}

function _bamboo(ctx, x, y, color) {
  ctx.fillStyle = color;
  _roundRect(ctx, x - 6, y - 22, 12, 44, 5);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y - 6);
  ctx.moveTo(x - 6, y + 6); ctx.lineTo(x + 6, y + 6);
  ctx.stroke();
}

function _drawSou(ctx, num, FACE) {
  var G = FACE.SOU_GREEN, R = FACE.SOU_RED;
  if (num === 1) {
    ctx.fillStyle = G;
    ctx.beginPath();
    ctx.ellipse(64, 88, 18, 40, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = R;
    ctx.beginPath();
    ctx.arc(64, 44, 10, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  var defs = {
    2: [[64, 55, G], [64, 121, G]],
    3: [[64, 45, G], [40, 125, G], [88, 125, G]],
    4: [[40, 50, G], [88, 50, G], [40, 126, G], [88, 126, G]],
    5: [[40, 50, G], [88, 50, G], [40, 126, G], [88, 126, G], [64, 88, R]],
    6: [[36, 50, G], [64, 50, G], [92, 50, G], [36, 126, G], [64, 126, G], [92, 126, G]],
    7: [[64, 40, R], [36, 88, G], [64, 88, G], [92, 88, G], [36, 136, G], [64, 136, G], [92, 136, G]],
    8: [[36, 45, G], [64, 45, G], [92, 45, G], [36, 88, G], [92, 88, G], [36, 131, G], [64, 131, G], [92, 131, G]],
    9: [[36, 40, G], [64, 40, G], [92, 40, G], [36, 88, R], [64, 88, R], [92, 88, R], [36, 136, G], [64, 136, G], [92, 136, G]]
  };
  var list = defs[num] || [];
  for (var i = 0; i < list.length; i++) {
    _bamboo(ctx, list[i][0], list[i][1], list[i][2]);
  }
}

MJ.Tiles.faceCanvas = function (id) {
  if (_faceCanvasCache[id]) return _faceCanvasCache[id];
  var CFG = MJ.CONFIG;
  var FACE = CFG.FACE;

  var canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 176;
  var ctx = canvas.getContext('2d');

  ctx.fillStyle = FACE.BG;
  ctx.fillRect(0, 0, 128, 176);
  ctx.strokeStyle = FACE.FRAME;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 172);

  var suit = MJ.Tiles.suit(id);
  var num = MJ.Tiles.num(id);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (suit === 'm') {
    var kanji = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
    ctx.fillStyle = FACE.MAN;
    ctx.font = 'bold 64px ' + FACE.FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(kanji[num - 1], 64, 60);
    ctx.fillStyle = FACE.MAN_RED;
    ctx.font = 'bold 56px ' + FACE.FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('萬', 64, 128);
  } else if (suit === 'p') {
    _drawPin(ctx, num, FACE);
  } else if (suit === 's') {
    _drawSou(ctx, num, FACE);
  } else {
    if (num >= 1 && num <= 4) {
      var windNames = { 1: '東', 2: '南', 3: '西', 4: '北' };
      ctx.fillStyle = FACE.HONOR;
      ctx.font = 'bold 84px ' + FACE.FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(windNames[num], 64, 88);
    } else if (num === 5) {
      ctx.strokeStyle = FACE.HAKU;
      ctx.lineWidth = 6;
      ctx.strokeRect(20, 24, 88, 128);
    } else if (num === 6) {
      ctx.fillStyle = FACE.HATSU;
      ctx.font = 'bold 84px ' + FACE.FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('發', 64, 88);
    } else {
      ctx.fillStyle = FACE.CHUN;
      ctx.font = 'bold 84px ' + FACE.FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('中', 64, 88);
    }
  }

  _faceCanvasCache[id] = canvas;
  return canvas;
};

MJ.Tiles.makeFaceTexture = function (id) {
  if (MJ.Tiles.texCache[id]) return MJ.Tiles.texCache[id];
  var canvas = MJ.Tiles.faceCanvas(id);
  var tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  MJ.Tiles.texCache[id] = tex;
  return tex;
};

MJ.Tiles.makeBackTexture = function () {
  // §3.2: 裏面は色面（TILE_BACK）で表すため作らない。関数名だけ残す。
  return null;
};
