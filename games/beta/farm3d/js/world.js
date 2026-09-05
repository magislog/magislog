var FM = (typeof window !== 'undefined') ? (window.FM = window.FM || {}) : (global.FM = global.FM || {});

// FM.World: 牧場の純粋関数（DOM に触らない）。SPEC.md §2〜§5 準拠。
// 同一判定は必ず samePos（構造比較）で行う。文字列に変換してからの比較は禁止（§10.5）。
FM.World = {};

// LEGEND（文字→種別）から 種別→文字 の逆引きをここで作る（config.js には書かない）
FM.World.TYPE_CHAR = (function () {
  var rev = {};
  try {
    var legend = FM.CONFIG.LEGEND;
    for (var ch in legend) {
      if (Object.prototype.hasOwnProperty.call(legend, ch)) {
        rev[legend[ch]] = ch;
      }
    }
  } catch (e) { /* CONFIG 未読込なら空のまま */ }
  return rev;
})();

// ---- 2.1 座標と向き ------------------------------------------------------

FM.World.inBounds = function (r, c) {
  try {
    var CONFIG = FM.CONFIG;
    return Number.isInteger(r) && Number.isInteger(c) &&
      r >= 0 && r < CONFIG.ROWS && c >= 0 && c < CONFIG.COLS;
  } catch (e) { return false; }
};

FM.World.at = function (world, r, c) {
  try {
    if (!FM.World.inBounds(r, c)) return null;
    if (!world || !world.tiles || !world.tiles[r]) return null;
    var t = world.tiles[r][c];
    return (t === undefined) ? null : t;
  } catch (e) { return null; }
};

FM.World.step = function (dir) {
  try {
    var d = FM.CONFIG.DELTA[dir];
    if (!d) return null;
    return { dr: d.dr, dc: d.dc };
  } catch (e) { return null; }
};

FM.World.samePos = function (a, b) {
  if (a == null || b == null) return false;
  return a.r === b.r && a.c === b.c;
};

FM.World.inPen = function (r, c) {
  try {
    var PEN = FM.CONFIG.PEN;
    return r >= PEN.r0 && r <= PEN.r1 && c >= PEN.c0 && c <= PEN.c1;
  } catch (e) { return false; }
};

FM.World.chickenAt = function (world, r, c) {
  try {
    if (!world || !world.chickens) return -1;
    for (var i = 0; i < world.chickens.length; i++) {
      if (FM.World.samePos(world.chickens[i], { r: r, c: c })) return i;
    }
    return -1;
  } catch (e) { return -1; }
};

FM.World.eggAt = function (world, r, c) {
  try {
    if (!world || !world.eggs) return -1;
    for (var i = 0; i < world.eggs.length; i++) {
      if (FM.World.samePos(world.eggs[i], { r: r, c: c })) return i;
    }
    return -1;
  } catch (e) { return -1; }
};

// ---- 2.3 マップ文字列 ↔ world ---------------------------------------------

FM.World.fromText = function (rows) {
  try {
    var CONFIG = FM.CONFIG;
    if (!Array.isArray(rows) || rows.length !== CONFIG.ROWS) return null;

    var tiles = [];
    var doorPos = null, shipPos = null, shopPos = null;
    var doorCount = 0, shipCount = 0, shopCount = 0;

    for (var r = 0; r < CONFIG.ROWS; r++) {
      var line = rows[r];
      if (typeof line !== 'string' || line.length !== CONFIG.COLS) return null;
      var rowArr = [];
      for (var c = 0; c < CONFIG.COLS; c++) {
        var ch = line.charAt(c);
        var type = CONFIG.LEGEND[ch];
        if (!type) return null;
        rowArr.push({ type: type, crop: null, watered: false });
        if (type === 'door') { doorCount++; doorPos = { r: r, c: c }; }
        if (type === 'ship') { shipCount++; shipPos = { r: r, c: c }; }
        if (type === 'shop') { shopCount++; shopPos = { r: r, c: c }; }
      }
      tiles.push(rowArr);
    }

    if (doorCount !== 1 || shipCount !== 1 || shopCount !== 1) return null;

    var spawn = CONFIG.SPAWN;
    if (!spawn || !FM.World.inBounds(spawn.r, spawn.c)) return null;
    var spawnTile = tiles[spawn.r][spawn.c];
    if (CONFIG.WALKABLE.indexOf(spawnTile.type) === -1) return null;

    var chickens = CONFIG.CHICKENS || [];
    for (var i = 0; i < chickens.length; i++) {
      var ch2 = chickens[i];
      if (!ch2 || !FM.World.inBounds(ch2.r, ch2.c)) return null;
      if (!FM.World.inPen(ch2.r, ch2.c)) return null;
      var ct = tiles[ch2.r][ch2.c];
      if (CONFIG.WALKABLE.indexOf(ct.type) === -1) return null;
      for (var j = 0; j < i; j++) {
        if (FM.World.samePos(chickens[j], ch2)) return null;
      }
    }

    return { tiles: tiles, door: doorPos, ship: shipPos, shop: shopPos };
  } catch (e) {
    return null;
  }
};

FM.World.toText = function (world) {
  try {
    var typeChar = FM.World.TYPE_CHAR;
    var lines = [];
    for (var r = 0; r < world.tiles.length; r++) {
      var s = '';
      var row = world.tiles[r];
      for (var c = 0; c < row.length; c++) {
        var ch = typeChar[row[c].type];
        s += (ch || '?');
      }
      lines.push(s);
    }
    return lines;
  } catch (e) {
    return [];
  }
};

FM.World.newWorld = function () {
  try {
    var CONFIG = FM.CONFIG;
    var base = FM.World.fromText(CONFIG.MAP);
    if (!base) return null;

    var world = {
      tiles: base.tiles,
      door: base.door,
      ship: base.ship,
      shop: base.shop,
      player: {
        r: CONFIG.SPAWN.r,
        c: CONFIG.SPAWN.c,
        dir: CONFIG.SPAWN.dir,
        tool: 0,
        seedKind: 0
      },
      chickens: CONFIG.CHICKENS.map(function (ch) { return { r: ch.r, c: ch.c }; }),
      eggs: [],
      inv: {
        seeds: {
          turnip: CONFIG.START.seeds.turnip,
          potato: CONFIG.START.seeds.potato,
          corn: CONFIG.START.seeds.corn
        },
        produce: { turnip: 0, potato: 0, corn: 0, egg: 0 }
      },
      bin: { turnip: 0, potato: 0, corn: 0, egg: 0 },
      money: CONFIG.START.money,
      day: CONFIG.START.day,
      stamina: CONFIG.STAMINA_MAX,
      stats: {
        tilled: 0, sown: 0, watered: 0, harvested: 0, eggsPicked: 0,
        shipped: 0, sold: 0, income: 0, bought: 0, spent: 0, slept: 0
      }
    };
    return world;
  } catch (e) {
    return null;
  }
};

// ---- 3.1 移動 -------------------------------------------------------------

FM.World.canWalk = function (world, r, c) {
  try {
    if (!FM.World.inBounds(r, c)) return false;
    var t = FM.World.at(world, r, c);
    if (!t) return false;
    if (FM.CONFIG.WALKABLE.indexOf(t.type) === -1) return false;
    if (FM.World.chickenAt(world, r, c) >= 0) return false;
    return true;
  } catch (e) { return false; }
};

FM.World.front = function (world) {
  try {
    if (!world || !world.player) return null;
    var d = FM.World.step(world.player.dir);
    if (!d) return null;
    var r = world.player.r + d.dr;
    var c = world.player.c + d.dc;
    if (!FM.World.inBounds(r, c)) return null;
    return { r: r, c: c };
  } catch (e) { return null; }
};

FM.World.target = function (world) {
  try {
    if (!world || !world.player) return null;
    var f = FM.World.front(world);
    if (f) {
      var t = FM.World.at(world, f.r, f.c);
      if (t && FM.CONFIG.OBJECTS.indexOf(t.type) !== -1) {
        return { r: f.r, c: f.c, kind: 'object' };
      }
    }
    return { r: world.player.r, c: world.player.c, kind: 'self' };
  } catch (e) { return null; }
};

FM.World.move = function (world, dir) {
  try {
    if (!world || !world.player) return { moved: false };
    var d = FM.World.step(dir);
    if (!d) return { moved: false };
    world.player.dir = dir;
    var nr = world.player.r + d.dr;
    var nc = world.player.c + d.dc;
    if (!FM.World.canWalk(world, nr, nc)) return { moved: false };
    world.player.r = nr;
    world.player.c = nc;
    return { moved: true };
  } catch (e) { return { moved: false }; }
};

// ---- 3.2 Z の処理 ----------------------------------------------------------

FM.World.act = function (world) {
  var NONE = { kind: 'none', ok: false, reason: 'none', cost: 0, exhausted: false, extra: {} };
  try {
    if (!world || !world.player) return NONE;
    var CONFIG = FM.CONFIG;

    var kind = 'none', ok = false, reason = 'none', cost = 0, extra = {};

    var t = FM.World.target(world);
    if (!t) {
      // kind/ok/reason は初期値のまま（none）
    } else if (t.kind === 'object') {
      var otile = FM.World.at(world, t.r, t.c);
      if (otile && otile.type === 'door') {
        kind = 'door'; ok = true; reason = null;
      } else if (otile && otile.type === 'shop') {
        kind = 'shop'; ok = true; reason = null;
      } else if (otile && otile.type === 'ship') {
        kind = 'ship';
        var n = FM.World.sumProduce(world);
        if (n === 0) {
          ok = false; reason = 'nothing_to_ship';
        } else {
          var kinds = CONFIG.CROP_ORDER;
          var moved = {};
          for (var mi = 0; mi < kinds.length; mi++) {
            var mk = kinds[mi];
            moved[mk] = world.inv.produce[mk];
            world.bin[mk] += world.inv.produce[mk];
            world.inv.produce[mk] = 0;
          }
          moved.egg = world.inv.produce.egg;
          world.bin.egg += world.inv.produce.egg;
          world.inv.produce.egg = 0;
          world.stats.shipped += n;
          ok = true; reason = null;
          extra = { moved: moved, value: FM.World.binValue(world) };
        }
      }
      // otile がこれ以外になることは OBJECTS の定義上ない（防御的に none のまま）
    } else {
      // t.kind === 'self'（足元）
      var pr = world.player.r, pc = world.player.c;
      var eggIdx = FM.World.eggAt(world, pr, pc);
      if (eggIdx >= 0) {
        world.eggs.splice(eggIdx, 1);
        world.inv.produce.egg += 1;
        world.stats.eggsPicked += 1;
        kind = 'egg'; ok = true; reason = null;
      } else {
        var tile = FM.World.at(world, pr, pc);
        if (!tile) {
          // none のまま
        } else {
          var tool = world.player.tool;
          if (tool === 0) { // くわ
            kind = 'till';
            if (tile.type === 'grass') {
              tile.type = 'soil'; tile.crop = null; tile.watered = false;
              world.stats.tilled += 1;
              ok = true; reason = null; cost = CONFIG.COST.till;
            } else if (tile.type === 'soil') {
              ok = false; reason = tile.crop ? 'has_crop' : 'already_soil';
            } else {
              ok = false; reason = 'cannot_till';
            }
          } else if (tool === 1) { // じょうろ
            kind = 'water';
            if (tile.type === 'soil') {
              if (tile.watered) {
                ok = false; reason = 'already_wet';
              } else {
                tile.watered = true;
                world.stats.watered += 1;
                ok = true; reason = null; cost = CONFIG.COST.water;
              }
            } else {
              ok = false; reason = 'cannot_water';
            }
          } else if (tool === 2) { // たね
            kind = 'sow';
            if (tile.type === 'soil') {
              if (tile.crop) {
                ok = false; reason = 'occupied';
              } else {
                var sk = CONFIG.CROP_ORDER[world.player.seedKind];
                if (!sk || world.inv.seeds[sk] === 0) {
                  ok = false; reason = 'no_seed';
                } else {
                  tile.crop = { kind: sk, stage: 0 };
                  world.inv.seeds[sk] -= 1;
                  world.stats.sown += 1;
                  ok = true; reason = null; cost = CONFIG.COST.sow; extra = { kind: sk };
                }
              }
            } else {
              ok = false; reason = 'need_soil';
            }
          } else if (tool === 3) { // かご
            kind = 'harvest';
            if (tile.type === 'soil' && tile.crop) {
              if (tile.crop.stage === 3) {
                var hk = tile.crop.kind;
                tile.crop = null;
                world.inv.produce[hk] += 1;
                world.stats.harvested += 1;
                ok = true; reason = null; cost = CONFIG.COST.harvest; extra = { kind: hk };
              } else {
                ok = false; reason = 'not_ripe';
              }
            } else {
              ok = false; reason = 'nothing_to_harvest';
            }
          }
          // tool が 0〜3 以外なら none のまま（防御的）
        }
      }
    }

    var exhausted = false;
    if (ok) {
      world.stamina = Math.max(0, world.stamina - cost);
      exhausted = (world.stamina === 0);
    } else {
      cost = 0;
    }
    return { kind: kind, ok: ok, reason: reason, cost: cost, exhausted: exhausted, extra: extra };
  } catch (e) {
    return NONE;
  }
};

// ---- 3.3 道具の持ち替え -----------------------------------------------------

FM.World.selectTool = function (world, i) {
  try {
    if (!world || !world.player) return;
    if (!Number.isInteger(i) || i < 0 || i > 3) return;
    if (i === 2 && world.player.tool === 2) {
      FM.World.cycleSeed(world);
      return;
    }
    world.player.tool = i;
  } catch (e) { /* 止まるより進む */ }
};

FM.World.cycleSeed = function (world) {
  try {
    if (!world || !world.player) return;
    world.player.seedKind = (world.player.seedKind + 1) % 3;
  } catch (e) { /* 止まるより進む */ }
};

// ---- 3.4 店 ----------------------------------------------------------------

FM.World.buy = function (world, kind) {
  try {
    var CONFIG = FM.CONFIG;
    if (!world || !world.inv || CONFIG.CROP_ORDER.indexOf(kind) === -1) {
      return { ok: false, reason: 'none' };
    }
    var price = CONFIG.CROPS[kind].seedPrice;
    if (world.money < price) {
      return { ok: false, reason: 'no_money', price: price };
    }
    world.money -= price;
    world.inv.seeds[kind] += 1;
    world.stats.bought += 1;
    world.stats.spent += price;
    return { ok: true, reason: null, price: price };
  } catch (e) {
    return { ok: false, reason: 'none' };
  }
};

// ---- 3.5 読み取り関数 -------------------------------------------------------

FM.World.crops = function (world) {
  var out = [];
  try {
    for (var r = 0; r < world.tiles.length; r++) {
      var row = world.tiles[r];
      for (var c = 0; c < row.length; c++) {
        var tile = row[c];
        if (tile.type === 'soil' && tile.crop) {
          out.push({ r: r, c: c, kind: tile.crop.kind, stage: tile.crop.stage, watered: tile.watered });
        }
      }
    }
  } catch (e) { /* 空配列のまま */ }
  return out;
};

FM.World.count = function (world, type) {
  var n = 0;
  try {
    for (var r = 0; r < world.tiles.length; r++) {
      var row = world.tiles[r];
      for (var c = 0; c < row.length; c++) {
        if (row[c].type === type) n++;
      }
    }
  } catch (e) { return 0; }
  return n;
};

FM.World.sumProduce = function (world) {
  try {
    var p = world.inv.produce;
    return p.turnip + p.potato + p.corn + p.egg;
  } catch (e) { return 0; }
};

FM.World.binValue = function (world) {
  try {
    var CROPS = FM.CONFIG.CROPS;
    var bin = world.bin;
    return bin.turnip * CROPS.turnip.sellPrice +
      bin.potato * CROPS.potato.sellPrice +
      bin.corn * CROPS.corn.sellPrice +
      bin.egg * FM.CONFIG.EGG_PRICE;
  } catch (e) { return 0; }
};

// ---- §4 作物の成長と1日の進行 ------------------------------------------------

FM.World.nextDay = function (world) {
  var CONFIG = FM.CONFIG;
  try {
    var grown = 0;
    for (var r = 0; r < world.tiles.length; r++) {
      var row = world.tiles[r];
      for (var c = 0; c < row.length; c++) {
        var tile = row[c];
        if (tile.type !== 'soil') continue;
        if (tile.crop && tile.watered && tile.crop.stage < 3) {
          tile.crop.stage += 1;
          grown += 1;
        }
        tile.watered = false;
      }
    }

    var income = FM.World.binValue(world);
    var sold = world.bin.turnip + world.bin.potato + world.bin.corn + world.bin.egg;
    world.money += income;
    world.stats.income += income;
    world.stats.sold += sold;
    world.bin.turnip = 0; world.bin.potato = 0; world.bin.corn = 0; world.bin.egg = 0;

    var laid = 0;
    var order = ['up', 'down', 'left', 'right'];
    for (var i = 0; i < world.chickens.length; i++) {
      if (world.eggs.length >= CONFIG.EGG_CAP) break;
      var ch = world.chickens[i];
      var spot = null;
      if (FM.World.eggAt(world, ch.r, ch.c) < 0) {
        spot = { r: ch.r, c: ch.c };
      } else {
        for (var oi = 0; oi < order.length; oi++) {
          var d = CONFIG.DELTA[order[oi]];
          var nr = ch.r + d.dr, nc = ch.c + d.dc;
          if (!FM.World.inPen(nr, nc)) continue;
          var t = FM.World.at(world, nr, nc);
          if (!t || CONFIG.WALKABLE.indexOf(t.type) === -1) continue;
          if (FM.World.eggAt(world, nr, nc) >= 0) continue;
          spot = { r: nr, c: nc };
          break;
        }
      }
      if (spot) {
        world.eggs.push({ r: spot.r, c: spot.c });
        laid += 1;
      }
    }

    world.stamina = CONFIG.STAMINA_MAX;
    world.day += 1;
    world.stats.slept += 1;
    world.player.r = CONFIG.SPAWN.r;
    world.player.c = CONFIG.SPAWN.c;
    world.player.dir = CONFIG.SPAWN.dir;

    return { day: world.day, income: income, sold: sold, grown: grown, laid: laid };
  } catch (e) {
    return { day: (world && world.day) || 0, income: 0, sold: 0, grown: 0, laid: 0 };
  }
};

// ---- §5 動物の動きとたまご ---------------------------------------------------

FM.World.stepChickens = function (world, rng) {
  try {
    if (!world || !world.chickens || typeof rng !== 'function') return false;
    var CONFIG = FM.CONFIG;
    var changed = false;
    for (var i = 0; i < world.chickens.length; i++) {
      if (rng() >= CONFIG.CHICKEN_MOVE_P) continue;
      var k = Math.floor(rng() * 4);
      if (k < 0 || k > 3) k = 0;
      var d = CONFIG.DELTA[CONFIG.DIRS[k]];
      var ch = world.chickens[i];
      var nr = ch.r + d.dr, nc = ch.c + d.dc;
      if (!FM.World.inPen(nr, nc)) continue;
      var t = FM.World.at(world, nr, nc);
      if (!t || CONFIG.WALKABLE.indexOf(t.type) === -1) continue;
      if (FM.World.chickenAt(world, nr, nc) >= 0) continue;
      if (FM.World.samePos({ r: nr, c: nc }, world.player)) continue;
      ch.r = nr; ch.c = nc; changed = true;
    }
    return changed;
  } catch (e) { return false; }
};

// ---- 2.4 不変量チェック -----------------------------------------------------

FM.World.validate = function (world) {
  var errs = [];
  try {
    var CONFIG = FM.CONFIG;
    if (!world || !world.tiles) { errs.push('world/tiles missing'); return errs; }

    function nn(v) { return Number.isInteger(v) && v >= 0; }

    var validTypes = [];
    for (var ch in CONFIG.LEGEND) {
      if (Object.prototype.hasOwnProperty.call(CONFIG.LEGEND, ch)) validTypes.push(CONFIG.LEGEND[ch]);
    }

    // 1) tiles の形と各タイルの規則
    if (world.tiles.length !== CONFIG.ROWS) errs.push('tiles.length !== ROWS');
    for (var r = 0; r < CONFIG.ROWS; r++) {
      var row = world.tiles[r];
      if (!row || row.length !== CONFIG.COLS) { errs.push('row length r=' + r); continue; }
      for (var c = 0; c < CONFIG.COLS; c++) {
        var tile = row[c];
        if (!tile || validTypes.indexOf(tile.type) === -1) { errs.push('bad type ' + r + ' ' + c); continue; }
        if (tile.type !== 'soil') {
          if (tile.crop) errs.push('crop on non-soil ' + r + ' ' + c);
          if (tile.watered) errs.push('watered on non-soil ' + r + ' ' + c);
        } else if (tile.crop) {
          if (CONFIG.CROP_ORDER.indexOf(tile.crop.kind) === -1) errs.push('bad crop kind ' + r + ' ' + c);
          if (!Number.isInteger(tile.crop.stage) || tile.crop.stage < 0 || tile.crop.stage > 3) errs.push('bad stage ' + r + ' ' + c);
        }
      }
    }

    // 2) door / ship / shop
    ['door', 'ship', 'shop'].forEach(function (key) {
      var pos = world[key];
      if (!pos) { errs.push('missing ' + key); return; }
      var t = FM.World.at(world, pos.r, pos.c);
      if (!t || t.type !== key) errs.push('mismatch ' + key);
    });

    // 3) player
    var p = world.player;
    if (!p) {
      errs.push('no player');
    } else {
      if (!FM.World.inBounds(p.r, p.c)) {
        errs.push('player oob');
      } else {
        var pt = FM.World.at(world, p.r, p.c);
        if (!pt || CONFIG.WALKABLE.indexOf(pt.type) === -1) errs.push('player not walkable');
        if (FM.World.chickenAt(world, p.r, p.c) >= 0) errs.push('player on chicken');
      }
      if (CONFIG.DIRS.indexOf(p.dir) === -1) errs.push('bad dir');
      if (!Number.isInteger(p.tool) || p.tool < 0 || p.tool > 3) errs.push('bad tool');
      if (!Number.isInteger(p.seedKind) || p.seedKind < 0 || p.seedKind > 2) errs.push('bad seedKind');
    }

    // 4) chickens
    if (!world.chickens || world.chickens.length !== 2) {
      errs.push('chickens count');
    } else {
      for (var ci = 0; ci < world.chickens.length; ci++) {
        var chk = world.chickens[ci];
        if (!FM.World.inPen(chk.r, chk.c)) errs.push('chicken not in pen ' + ci);
        var ctile = FM.World.at(world, chk.r, chk.c);
        if (!ctile || CONFIG.WALKABLE.indexOf(ctile.type) === -1) errs.push('chicken not walkable ' + ci);
      }
      if (FM.World.samePos(world.chickens[0], world.chickens[1])) errs.push('chickens overlap');
    }

    // 5) eggs
    if (!world.eggs || world.eggs.length > CONFIG.EGG_CAP) {
      errs.push('too many eggs');
    } else {
      for (var ei = 0; ei < world.eggs.length; ei++) {
        var egg = world.eggs[ei];
        if (!FM.World.inPen(egg.r, egg.c)) errs.push('egg not in pen ' + ei);
        for (var ej = ei + 1; ej < world.eggs.length; ej++) {
          if (FM.World.samePos(egg, world.eggs[ej])) errs.push('egg dup');
        }
      }
    }

    // 6) 数値範囲
    if (!Number.isInteger(world.stamina) || world.stamina < 0 || world.stamina > CONFIG.STAMINA_MAX) errs.push('bad stamina');
    if (!Number.isInteger(world.money) || world.money < 0) errs.push('bad money');
    if (!Number.isInteger(world.day) || world.day < 1) errs.push('bad day');
    if (world.inv) {
      if (world.inv.seeds) {
        if (!nn(world.inv.seeds.turnip)) errs.push('bad seeds.turnip');
        if (!nn(world.inv.seeds.potato)) errs.push('bad seeds.potato');
        if (!nn(world.inv.seeds.corn)) errs.push('bad seeds.corn');
      } else { errs.push('no inv.seeds'); }
      if (world.inv.produce) {
        if (!nn(world.inv.produce.turnip)) errs.push('bad produce.turnip');
        if (!nn(world.inv.produce.potato)) errs.push('bad produce.potato');
        if (!nn(world.inv.produce.corn)) errs.push('bad produce.corn');
        if (!nn(world.inv.produce.egg)) errs.push('bad produce.egg');
      } else { errs.push('no inv.produce'); }
    } else { errs.push('no inv'); }
    if (world.bin) {
      if (!nn(world.bin.turnip)) errs.push('bad bin.turnip');
      if (!nn(world.bin.potato)) errs.push('bad bin.potato');
      if (!nn(world.bin.corn)) errs.push('bad bin.corn');
      if (!nn(world.bin.egg)) errs.push('bad bin.egg');
    } else { errs.push('no bin'); }
    var st = world.stats;
    if (!st) {
      errs.push('no stats');
    } else {
      ['tilled', 'sown', 'watered', 'harvested', 'eggsPicked', 'shipped', 'sold', 'income', 'bought', 'spent', 'slept'].forEach(function (k) {
        if (!nn(st[k])) errs.push('bad stats.' + k);
      });
    }

    // 7) 勘定
    if (st && world.inv && world.bin) {
      var START = CONFIG.START;
      if (world.money !== START.money - st.spent + st.income) errs.push('money accounting');
      var seedsTotal = world.inv.seeds.turnip + world.inv.seeds.potato + world.inv.seeds.corn;
      var startSeedsTotal = START.seeds.turnip + START.seeds.potato + START.seeds.corn;
      if (seedsTotal !== startSeedsTotal + st.bought - st.sown) errs.push('seeds accounting');
      if (st.sown !== FM.World.crops(world).length + st.harvested) errs.push('sown accounting');
      var produceTotal = FM.World.sumProduce(world);
      var binTotal = world.bin.turnip + world.bin.potato + world.bin.corn + world.bin.egg;
      if (st.harvested + st.eggsPicked !== produceTotal + binTotal + st.sold) errs.push('produce accounting');
    }
  } catch (e) {
    errs.push('exception: ' + (e && e.message ? e.message : String(e)));
  }
  return errs;
};
