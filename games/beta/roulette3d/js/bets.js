// roulette3d — RL.Bets（賭けマスの選択・配当計算）
// SPEC.md §5 のとおりに実装する。pays の数字はここに書かず RL.CONFIG.BET_TYPES から必ず引く。
window.RL = window.RL || {};

RL.Bets = {};

(function () {
  "use strict";

  function clampNum(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  // n(c, y) = 3c − y/2  （y ∈ {0,2,4}。y=0 上段 3c、y=2 中段 3c−1、y=4 下段 3c−2）
  function nAt(c, y) {
    return 3 * c - y / 2;
  }

  function rangeInclusive(a, b) {
    var out = [];
    for (var i = a; i <= b; i++) out.push(i);
    return out;
  }

  function evenNumbers() {
    var out = [];
    for (var i = 2; i <= 36; i += 2) out.push(i);
    return out;
  }

  function oddNumbers() {
    var out = [];
    for (var i = 1; i <= 35; i += 2) out.push(i);
    return out;
  }

  function blackNumbers() {
    var red = RL.CONFIG.RED_NUMBERS;
    var out = [];
    for (var i = 1; i <= 36; i++) {
      if (red.indexOf(i) === -1) out.push(i);
    }
    return out;
  }

  function columnNumbers(y) {
    var out = [];
    for (var c = 1; c <= 12; c++) {
      if (y === 0) out.push(3 * c);
      else if (y === 2) out.push(3 * c - 1);
      else out.push(3 * c - 2); // y === 4
    }
    return out;
  }

  function outsideNumbers(type) {
    switch (type) {
      case "low": return rangeInclusive(1, 18);
      case "high": return rangeInclusive(19, 36);
      case "even": return evenNumbers();
      case "odd": return oddNumbers();
      case "red": return RL.CONFIG.RED_NUMBERS.slice();
      case "black": return blackNumbers();
    }
    return [];
  }

  // spotAt の生データ判定（{type, numbers} または null。numbers は未ソートでよい＝canonical でソートする）
  function rawSpotAt(x, y) {
    // 1. ゼロ
    if (x === 0 && y <= 4) {
      return { type: "straight", numbers: [0] };
    }

    if (y === 0 || y === 2 || y === 4) {
      if (x >= 1 && x <= 23 && x % 2 === 1) {
        var c1 = (x + 1) / 2;
        return { type: "straight", numbers: [nAt(c1, y)] };
      }
      if (x >= 2 && x <= 22 && x % 2 === 0) {
        var c2 = x / 2;
        return { type: "split", numbers: [nAt(c2, y), nAt(c2 + 1, y)] };
      }
      if (x === 24) {
        return { type: "column", numbers: columnNumbers(y) };
      }
      return null;
    }

    if (y === 1 || y === 3) {
      if (x >= 1 && x <= 23 && x % 2 === 1) {
        var c3 = (x + 1) / 2;
        return { type: "split", numbers: [nAt(c3, y + 1), nAt(c3, y - 1)] };
      }
      if (x >= 2 && x <= 22 && x % 2 === 0) {
        var c4 = x / 2;
        return {
          type: "corner",
          numbers: [nAt(c4, y + 1), nAt(c4, y - 1), nAt(c4 + 1, y + 1), nAt(c4 + 1, y - 1)]
        };
      }
      return null;
    }

    if (y === 5) {
      if (x >= 1 && x <= 23 && x % 2 === 1) {
        var c5 = (x + 1) / 2;
        return { type: "street", numbers: [3 * c5 - 2, 3 * c5 - 1, 3 * c5] };
      }
      if (x >= 2 && x <= 22 && x % 2 === 0) {
        var c6 = x / 2;
        return { type: "sixline", numbers: [3 * c6 - 2, 3 * c6 - 1, 3 * c6, 3 * c6 + 1, 3 * c6 + 2, 3 * c6 + 3] };
      }
      return null;
    }

    if (y === 6) {
      var d = Math.min(2, Math.floor(x / 8));
      return { type: "dozen", numbers: rangeInclusive(12 * d + 1, 12 * d + 12) };
    }

    if (y === 7) {
      var k = Math.min(5, Math.floor(x / 4));
      var type = RL.CONFIG.OUTSIDE_ORDER[k];
      return { type: type, numbers: outsideNumbers(type) };
    }

    return null;
  }

  function stepLR(x, y, delta) {
    var nx = x;
    for (;;) {
      nx += delta;
      if (nx < 0 || nx > 24) return null;
      if (RL.Bets.spotAt(nx, y)) return nx;
    }
  }

  function findNearestX(x, y) {
    for (var d = 1; d <= 24; d++) {
      var a = x - d;
      if (a >= 0 && a <= 24 && RL.Bets.spotAt(a, y)) return a;
      var b = x + d;
      if (b >= 0 && b <= 24 && RL.Bets.spotAt(b, y)) return b;
    }
    return x; // 格子上は必ず見つかる想定。落ちない保険
  }

  // ---- 公開 API ----

  RL.Bets.isRed = function (n) {
    return RL.CONFIG.RED_NUMBERS.indexOf(n) !== -1;
  };

  RL.Bets.colorOf = function (n) {
    if (n === 0) return "green";
    return RL.Bets.isRed(n) ? "red" : "black";
  };

  RL.Bets.cellCenter = function (n) {
    var L = RL.CONFIG.LAYOUT;
    if (n === 0) {
      return { x: L.X0 + L.HALF, z: L.Z0 + 0.15 };
    }
    var c = Math.ceil(n / 3);
    var rIdx = (n - 1) % 3; // 0 = 下段 1,4,7… ／ 1 = 中段 ／ 2 = 上段
    return { x: L.X0 + L.CELL * c + L.HALF, z: L.Z0 + L.HALF + (2 - rIdx) * L.CELL };
  };

  RL.Bets.canonical = function (spot) {
    var C = RL.CONFIG;
    var type = spot.type;
    var numbers = spot.numbers.slice().sort(function (a, b) { return a - b; });
    var cx, cy;

    if (type === "straight" && numbers.length === 1 && numbers[0] === 0) {
      cx = 0; cy = 2;
    } else if (type === "dozen") {
      var d = Math.floor((numbers[0] - 1) / 12);
      cx = 8 * d + 4; cy = 6;
    } else if (C.OUTSIDE_ORDER.indexOf(type) !== -1) {
      var k = C.OUTSIDE_ORDER.indexOf(type);
      cx = 4 * k + 2; cy = 7;
    } else {
      cx = spot.x; cy = spot.y;
    }

    var key = type + ":" + numbers.join("-");
    return {
      key: key,
      type: type,
      numbers: numbers,
      pays: C.BET_TYPES[type].pays,
      cx: cx,
      cy: cy
    };
  };

  RL.Bets.spotAt = function (x, y) {
    var raw = rawSpotAt(x, y);
    if (!raw) return null;
    return RL.Bets.canonical({ type: raw.type, numbers: raw.numbers, x: x, y: y });
  };

  RL.Bets.moveCursor = function (cur, dir) {
    var x = cur.x, y = cur.y;

    if (dir === "LEFT" || dir === "RIGHT") {
      var delta = dir === "LEFT" ? -1 : 1;
      if (y <= 5) {
        var nx = stepLR(x, y, delta);
        return nx === null ? { x: x, y: y } : { x: nx, y: y };
      }
      if (y === 6) {
        var d = Math.min(2, Math.floor(x / 8));
        d = clampNum(d + delta, 0, 2);
        return { x: 8 * d + 4, y: 6 };
      }
      if (y === 7) {
        var k = Math.min(5, Math.floor(x / 4));
        k = clampNum(k + delta, 0, 5);
        return { x: 4 * k + 2, y: 7 };
      }
      return { x: x, y: y };
    }

    if (dir === "UP" || dir === "DOWN") {
      var dy = dir === "UP" ? -1 : 1;
      var ny = clampNum(y + dy, 0, 7);
      if (ny === y) return { x: x, y: y };

      var nx2 = x;
      if (ny <= 5) nx2 = clampNum(nx2, 0, 24);
      if (ny === 5) nx2 = clampNum(nx2, 1, 23);

      var guard = 0;
      while (!RL.Bets.spotAt(nx2, ny) && guard < 8) {
        var ny2 = ny + dy;
        if (ny2 < 0 || ny2 > 7) break;
        ny = ny2;
        nx2 = x;
        if (ny <= 5) nx2 = clampNum(nx2, 0, 24);
        if (ny === 5) nx2 = clampNum(nx2, 1, 23);
        guard++;
      }
      if (!RL.Bets.spotAt(nx2, ny)) {
        nx2 = findNearestX(nx2, ny);
      }
      return { x: nx2, y: ny };
    }

    return { x: x, y: y };
  };

  RL.Bets.spotPos = function (spot) {
    var L = RL.CONFIG.LAYOUT;
    var cx = spot.cx, cy = spot.cy;

    if (cx === 0 && cy === 2) {
      return RL.Bets.cellCenter(0);
    }
    if (cy <= 5 && cx >= 1 && cx <= 23) {
      return { x: L.X0 + L.CELL + cx * L.HALF, z: L.Z0 + L.HALF + cy * L.HALF };
    }
    if (cx === 24 && cy <= 5) {
      return { x: L.X0 + 1.35, z: L.Z0 + L.HALF + cy * L.HALF };
    }
    if (cy === 6) {
      var d = (cx - 4) / 8;
      return { x: L.X0 + L.CELL + 0.40 * d + 0.20, z: L.Z0 + L.OUT1_Z };
    }
    if (cy === 7) {
      var k = (cx - 2) / 4;
      return { x: L.X0 + L.CELL + 0.20 * k + 0.10, z: L.Z0 + L.OUT2_Z };
    }
    // ここには来ない想定（落ちない保険で卓の隅を返す）
    return { x: L.X0, z: L.Z0 };
  };

  RL.Bets.rectOf = function (spot) {
    var L = RL.CONFIG.LAYOUT;
    var SHRINK = 0.004;

    if (spot.type === "dozen") {
      var p1 = RL.Bets.spotPos(spot);
      return { cx: p1.x, cz: p1.z, w: 0.40 - SHRINK, h: 0.078 - SHRINK };
    }
    if (RL.CONFIG.OUTSIDE_ORDER.indexOf(spot.type) !== -1) {
      var p2 = RL.Bets.spotPos(spot);
      return { cx: p2.x, cz: p2.z, w: 0.20 - SHRINK, h: 0.078 - SHRINK };
    }
    if (spot.type === "straight" && spot.numbers.length === 1 && spot.numbers[0] === 0) {
      var c0 = RL.Bets.cellCenter(0);
      return { cx: c0.x, cz: c0.z, w: 0.10 - SHRINK, h: 0.30 - SHRINK };
    }

    // インサイド（straight以外）とコラム: numbers の各マスの cellCenter ± HALF の外接矩形
    var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    spot.numbers.forEach(function (n) {
      var c = RL.Bets.cellCenter(n);
      minX = Math.min(minX, c.x - L.HALF);
      maxX = Math.max(maxX, c.x + L.HALF);
      minZ = Math.min(minZ, c.z - L.HALF);
      maxZ = Math.max(maxZ, c.z + L.HALF);
    });
    return {
      cx: (minX + maxX) / 2,
      cz: (minZ + maxZ) / 2,
      w: (maxX - minX) - SHRINK,
      h: (maxZ - minZ) - SHRINK
    };
  };

  RL.Bets.label = function (spot) {
    var C = RL.CONFIG;
    var name = C.BET_TYPES[spot.type].name;
    var nums = spot.numbers;

    switch (spot.type) {
      case "straight":
        return name + " " + nums[0];
      case "split":
        return name + " " + nums.join("-");
      case "street":
        return name + " " + nums.join("-");
      case "corner":
        return name + " " + nums.join("-");
      case "sixline":
        return name + " " + nums[0] + "〜" + nums[nums.length - 1];
      case "dozen": {
        var d = Math.floor((nums[0] - 1) / 12);
        return name + " " + C.DOZEN_NAMES[d] + "（" + nums[0] + "〜" + nums[nums.length - 1] + "）";
      }
      case "column": {
        var n0 = nums[0];
        var idx = (n0 % 3 === 0) ? 0 : (n0 % 3 === 2 ? 1 : 2);
        return name + " " + C.COLUMN_NAMES[idx];
      }
      default:
        return name; // アウトサイド（low/even/red/black/odd/high）は name そのまま
    }
  };

  RL.Bets.listAll = function () {
    var seen = {};
    var out = [];
    for (var x = 0; x <= 24; x++) {
      for (var y = 0; y <= 7; y++) {
        var s = RL.Bets.spotAt(x, y);
        if (s && !seen[s.key]) {
          seen[s.key] = true;
          out.push(s);
        }
      }
    }
    return out;
  };

  RL.Bets.payout = function (bets, betOrder, winning) {
    var validWinning = Number.isInteger(winning);
    var rows = [];
    var totalBet = 0, totalReturn = 0;

    (betOrder || []).forEach(function (key) {
      var b = bets ? bets[key] : null;
      if (!b) return;
      var spot = b.spot;
      var amount = b.amount;
      totalBet += amount;
      var won = validWinning && spot.numbers.indexOf(winning) !== -1;
      var pay = won ? amount * spot.pays : 0;
      var ret = won ? amount + pay : 0;
      totalReturn += ret;
      rows.push({ key: key, label: RL.Bets.label(spot), amount: amount, won: won, pay: pay, ret: ret });
    });

    return {
      winning: winning,
      color: RL.Bets.colorOf(winning),
      rows: rows,
      totalBet: totalBet,
      totalReturn: totalReturn,
      net: totalReturn - totalBet
    };
  };
})();
