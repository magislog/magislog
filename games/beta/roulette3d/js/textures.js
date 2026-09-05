// roulette3d — RL.Tex（Canvas 2D → CanvasTexture。数字・記号・賭け台・ホイールの盤面はここだけで描く）
// SPEC.md §3 のとおりに実装する。document / THREE を使うのでブラウザ専用（Node の自己テストからは require しない）。
window.RL = window.RL || {};

RL.Tex = {};
RL.Tex.texCache = { chip: {} };

(function () {
  "use strict";

  // canvas → THREE.CanvasTexture（colorSpace=SRGB、可能なら anisotropy を最大値に）
  // RL.Scene.renderer を参照する（scene.js が WebGLRenderer をここに置く想定）。
  // まだ無い/形が違う場合は anisotropy 設定をスキップして落ちないようにする。
  RL.Tex.canvasToTex = function (canvas) {
    var tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    var renderer = (RL.Scene && RL.Scene.renderer) ? RL.Scene.renderer : null;
    if (renderer && renderer.capabilities && typeof renderer.capabilities.getMaxAnisotropy === "function") {
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
    return tex;
  };

  // §3.1 賭け台テクスチャ（1400×456。1px = 1mm。canvas の上端 = 卓の奥）
  RL.Tex.makeLayoutTexture = function () {
    var C = RL.CONFIG;
    var LT = C.LAYOUT_TEX;
    var L = C.LAYOUT;
    var canvas = document.createElement("canvas");
    canvas.width = L.PX;
    canvas.height = L.PY;
    var ctx = canvas.getContext("2d");

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 1. 全面 FELT
    ctx.fillStyle = LT.FELT;
    ctx.fillRect(0, 0, L.PX, L.PY);

    // 2. ゼロマス
    ctx.fillStyle = LT.GREEN;
    ctx.fillRect(0, 0, 100, 300);
    ctx.fillStyle = LT.TEXT;
    ctx.font = LT.FONT;
    ctx.fillText("0", 50, 150);

    // 3. 数字マス（列 c=1..12）
    var dozenX = [100, 500, 900];
    for (var c = 1; c <= 12; c++) {
      var x0 = 100 * c;
      var rows = [
        { y: 0, n: 3 * c },
        { y: 100, n: 3 * c - 1 },
        { y: 200, n: 3 * c - 2 }
      ];
      for (var r = 0; r < rows.length; r++) {
        var row = rows[r];
        ctx.fillStyle = RL.Bets.isRed(row.n) ? LT.RED : LT.BLACK;
        ctx.fillRect(x0, row.y, 100, 100);
        ctx.fillStyle = LT.TEXT;
        ctx.font = LT.FONT;
        ctx.fillText(String(row.n), x0 + 50, row.y + 50);
      }
    }

    // 4. コラム（x 1300〜1400、3段）
    for (var ci = 0; ci < 3; ci++) {
      ctx.fillStyle = LT.GREEN;
      ctx.fillRect(1300, ci * 100, 100, 100);
      ctx.fillStyle = LT.TEXT;
      ctx.font = LT.FONT_OUT;
      ctx.fillText("2:1", 1350, ci * 100 + 50);
    }

    // 5. ダース段（y 300〜378）
    for (var di = 0; di < 3; di++) {
      ctx.fillStyle = LT.GREEN;
      ctx.fillRect(dozenX[di], 300, 400, 78);
      ctx.fillStyle = LT.TEXT;
      ctx.font = LT.FONT_OUT;
      ctx.fillText(C.DOZEN_NAMES[di], dozenX[di] + 200, 339);
    }

    // 6. アウトサイド段（y 378〜456）
    var outLabels = { low: "1-18", even: "EVEN", red: "RED", black: "BLACK", odd: "ODD", high: "19-36" };
    for (var k = 0; k < 6; k++) {
      var type = C.OUTSIDE_ORDER[k];
      var xk = 100 + 200 * k;
      ctx.fillStyle = (type === "red") ? LT.RED : (type === "black") ? LT.BLACK : LT.GREEN;
      ctx.fillRect(xk, 378, 200, 78);
      ctx.fillStyle = LT.TEXT;
      ctx.font = LT.FONT_OUT;
      ctx.fillText(outLabels[type], xk + 100, 417);
    }

    // 7. 罫線
    ctx.strokeStyle = LT.LINE;
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, 100, 300);
    for (var cc = 1; cc <= 12; cc++) {
      var xcc = 100 * cc;
      ctx.strokeRect(xcc, 0, 100, 100);
      ctx.strokeRect(xcc, 100, 100, 100);
      ctx.strokeRect(xcc, 200, 100, 100);
    }
    for (var cci = 0; cci < 3; cci++) ctx.strokeRect(1300, cci * 100, 100, 100);
    for (var ddi = 0; ddi < 3; ddi++) ctx.strokeRect(dozenX[ddi], 300, 400, 78);
    for (var kk = 0; kk < 6; kk++) ctx.strokeRect(100 + 200 * kk, 378, 200, 78);

    RL.Tex.texCache.layout = RL.Tex.canvasToTex(canvas);
    return RL.Tex.texCache.layout;
  };

  // §3.2 ホイール盤面テクスチャ（TEX×TEX。中心(512,512)、半径 R=500）
  RL.Tex.makeWheelTexture = function () {
    var C = RL.CONFIG;
    var WT = C.WHEEL_TEX;
    var POCKETS = C.POCKETS;
    var SIZE = C.WHEEL.TEX;
    var canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    var ctx = canvas.getContext("2d");
    var cx = 512, cy = 512, R = 500;
    var STEP = 2 * Math.PI / POCKETS;

    // 1. 全面 HUB
    ctx.fillStyle = WT.HUB;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // 2. 扇形（WHEEL_ORDER の idx = 0..36）
    for (var idx = 0; idx < POCKETS; idx++) {
      var n = C.WHEEL_ORDER[idx];
      var color = (n === 0) ? WT.GREEN : (RL.Bets.isRed(n) ? WT.RED : WT.BLACK);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, -(idx + 0.5) * STEP, -(idx - 0.5) * STEP);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    // 3. 数字
    ctx.fillStyle = WT.TEXT;
    ctx.font = WT.FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (var i2 = 0; i2 < POCKETS; i2++) {
      var n2 = C.WHEEL_ORDER[i2];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-i2 * STEP);
      ctx.translate(410, 0);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(String(n2), 0, 0);
      ctx.restore();
    }

    // 4. 内側の塗り直し・境界線・外周
    ctx.fillStyle = WT.HUB;
    ctx.beginPath();
    ctx.arc(cx, cy, 330, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = WT.LINE;
    ctx.lineWidth = 2;
    for (var i3 = 0; i3 < POCKETS; i3++) {
      var a = -(i3 + 0.5) * STEP;
      ctx.beginPath();
      ctx.moveTo(cx + 330 * Math.cos(a), cy + 330 * Math.sin(a));
      ctx.lineTo(cx + 500 * Math.cos(a), cy + 500 * Math.sin(a));
      ctx.stroke();
    }

    ctx.strokeStyle = WT.RIM;
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    RL.Tex.texCache.wheel = RL.Tex.canvasToTex(canvas);
    return RL.Tex.texCache.wheel;
  };

  // §3.3 チップテクスチャ（64×64）
  RL.Tex.makeChipTexture = function (value) {
    var C = RL.CONFIG;
    var chip = C.CHIP[value] || C.CHIP[1]; // 無い額面は白(1)で代用＝落ちない
    var canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    var ctx = canvas.getContext("2d");

    ctx.fillStyle = chip.fill;
    ctx.beginPath();
    ctx.arc(32, 32, 30, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(32, 32, 26, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = chip.text;
    ctx.font = "bold 22px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(value), 32, 32);

    var tex = RL.Tex.canvasToTex(canvas);
    RL.Tex.texCache.chip[value] = tex;
    return tex;
  };

  // §2.4 床テクスチャ（512×512 市松、1マス64px）
  RL.Tex.makeFloorTexture = function () {
    var canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    var ctx = canvas.getContext("2d");
    var cell = 64;
    for (var iy = 0; iy < 8; iy++) {
      for (var ix = 0; ix < 8; ix++) {
        ctx.fillStyle = ((ix + iy) % 2 === 0) ? "#3a2b2b" : "#332525";
        ctx.fillRect(ix * cell, iy * cell, cell, cell);
      }
    }
    var tex = RL.Tex.canvasToTex(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    RL.Tex.texCache.floor = tex;
    return tex;
  };
})();
