window.MJ = window.MJ || {};
MJ.Score = {};

// §12: 数値・色・キー・文言は MJ.CONFIG から引く決まりだが、役名・翻数の
// 一覧そのものは §1 の MJ.CONFIG 必須キーに含まれておらず config.js（分担B所有）
// にも項目が無い。ここは §5.2 の表そのものが正本なので score.js 内に直書きする。
// js/_NOTES.txt に矛盾として1行記録した。
var YAKUHAI_NAMES = { 31: '白', 32: '發', 33: '中' };

function _mjIsTanyao(c14) {
  for (var i = 0; i < 34; i++) {
    if (c14[i] > 0 && (MJ.Tiles.isHonor(i) || MJ.Tiles.isTerminal(i))) return false;
  }
  return true;
}

function _mjFlushType(c14) {
  var suits = {};
  var hasHonor = false;
  for (var i = 0; i < 34; i++) {
    if (c14[i] > 0) {
      if (i >= 27) hasHonor = true;
      else suits[MJ.Tiles.suit(i)] = true;
    }
  }
  var suitCount = 0;
  for (var k in suits) if (suits.hasOwnProperty(k)) suitCount++;
  if (suitCount === 1 && !hasHonor) return 'chinitsu';
  if (suitCount === 1 && hasHonor) return 'honitsu';
  return null;
}

function _mjHasIipeikou(sets) {
  var seen = {};
  for (var i = 0; i < sets.length; i++) {
    if (sets[i].kind === 'chi') {
      if (seen[sets[i].id]) return true;
      seen[sets[i].id] = true;
    }
  }
  return false;
}

function _mjHasIttsuu(sets) {
  var bases = [0, 9, 18]; // m, p, s
  for (var b = 0; b < bases.length; b++) {
    var base = bases[b];
    var has0 = false, has3 = false, has6 = false;
    for (var i = 0; i < sets.length; i++) {
      if (sets[i].kind === 'chi') {
        if (sets[i].id === base) has0 = true;
        if (sets[i].id === base + 3) has3 = true;
        if (sets[i].id === base + 6) has6 = true;
      }
    }
    if (has0 && has3 && has6) return true;
  }
  return false;
}

function _mjHasSanshoku(sets) {
  var byNum = {};
  for (var i = 0; i < sets.length; i++) {
    if (sets[i].kind === 'chi') {
      var suit = MJ.Tiles.suit(sets[i].id);
      var n = MJ.Tiles.num(sets[i].id);
      byNum[n] = byNum[n] || {};
      byNum[n][suit] = true;
    }
  }
  for (var num in byNum) {
    if (byNum.hasOwnProperty(num) && byNum[num].m && byNum[num].p && byNum[num].s) return true;
  }
  return false;
}

// 平和の両面判定（§5.2 直下の式のみを使う）
function _mjIsPinfuWait(ctx, decomp) {
  var w = ctx.winTile.id;
  var num = MJ.Tiles.num(w);
  for (var i = 0; i < decomp.sets.length; i++) {
    var s = decomp.sets[i];
    if (s.kind !== 'chi') continue;
    if (s.id === w && num <= 6) return true;
    if (s.id + 2 === w && num >= 4) return true;
  }
  return false;
}

MJ.Score.listYaku = function (ctx, decomp) {
  var yaku = [];
  var c14 = MJ.Tiles.counts(ctx.hand14);

  if (decomp.chiitoi) {
    yaku.push({ name: '七対子', han: 2 });
    if (ctx.riichi) yaku.push({ name: 'リーチ', han: 1 });
    if (ctx.isTsumo) yaku.push({ name: '門前清自摸和', han: 1 });
    if (_mjIsTanyao(c14)) yaku.push({ name: '断么九', han: 1 });
    var flush0 = _mjFlushType(c14);
    if (flush0 === 'chinitsu') yaku.push({ name: '清一色', han: 6 });
    else if (flush0 === 'honitsu') yaku.push({ name: '混一色', han: 3 });
    return yaku;
  }

  if (ctx.riichi) yaku.push({ name: 'リーチ', han: 1 });
  if (ctx.isTsumo) yaku.push({ name: '門前清自摸和', han: 1 });
  if (_mjIsTanyao(c14)) yaku.push({ name: '断么九', han: 1 });

  var sets = decomp.sets;
  var pair = decomp.pair;

  for (var i = 0; i < sets.length; i++) {
    if (sets[i].kind === 'pon' && YAKUHAI_NAMES[sets[i].id]) {
      yaku.push({ name: '役牌 ' + YAKUHAI_NAMES[sets[i].id], han: 1 });
    }
  }

  var seatWindId = 27 + ctx.seatWind;
  var hasPonAt = function (id) {
    for (var j = 0; j < sets.length; j++) if (sets[j].kind === 'pon' && sets[j].id === id) return true;
    return false;
  };
  if (hasPonAt(seatWindId)) yaku.push({ name: '自風牌', han: 1 });
  if (hasPonAt(27 + ctx.roundWind)) yaku.push({ name: '場風牌', han: 1 });

  var allChi = true, allPon = true;
  for (i = 0; i < sets.length; i++) {
    if (sets[i].kind !== 'chi') allChi = false;
    if (sets[i].kind !== 'pon') allPon = false;
  }

  if (allChi && !YAKUHAI_NAMES[pair] && pair !== seatWindId && pair !== (27 + ctx.roundWind)) {
    if (_mjIsPinfuWait(ctx, decomp)) yaku.push({ name: '平和', han: 1 });
  }

  if (_mjHasIipeikou(sets)) yaku.push({ name: '一盃口', han: 1 });
  if (allPon) yaku.push({ name: '対々和', han: 2 });
  if (_mjHasIttsuu(sets)) yaku.push({ name: '一気通貫', han: 2 });
  if (_mjHasSanshoku(sets)) yaku.push({ name: '三色同順', han: 2 });

  var flush = _mjFlushType(c14);
  if (flush === 'chinitsu') yaku.push({ name: '清一色', han: 6 });
  else if (flush === 'honitsu') yaku.push({ name: '混一色', han: 3 });

  return yaku;
};

MJ.Score.fu = function (ctx, decomp, yaku) {
  if (decomp.chiitoi) return 25;
  var hasPinfu = false;
  for (var i = 0; i < yaku.length; i++) {
    if (yaku[i].name === '平和') { hasPinfu = true; break; }
  }
  if (hasPinfu && ctx.isTsumo) return 20;
  return 30;
};

MJ.Score.limitName = function (han, base) {
  if (han >= 13) return '役満';
  if (han >= 11) return '三倍満';
  if (han >= 8) return '倍満';
  if (han >= 6) return '跳満';
  if (han >= 5 || base > 2000) return '満貫';
  return '';
};

var _LIMIT_AMOUNT = { '役満': 8000, '三倍満': 6000, '倍満': 4000, '跳満': 3000, '満貫': 2000 };

function _mjNextDoraId(id) {
  if (id < 27) {
    var suitBase = id - (id % 9);
    var n = MJ.Tiles.num(id);
    var nextN = (n === 9) ? 1 : n + 1;
    return suitBase + (nextN - 1);
  }
  if (id <= 30) return (id === 30) ? 27 : id + 1; // 東南西北
  return (id === 33) ? 31 : id + 1; // 白發中
}

MJ.Score.doraCount = function (hand14, indicator) {
  // ドラ表示牌が無いとき（state.doraInd の初期値は null）に .id を読んで落ちていた。
  // SPEC §12「止まるより進む」に合わせ、無いときはドラ0枚として扱う
  // （2026-09-04 表ういが独立チェックで発見）。
  if (!indicator || typeof indicator.id !== 'number') return 0;
  var doraId = _mjNextDoraId(indicator.id);
  var count = 0;
  for (var i = 0; i < hand14.length; i++) {
    if (hand14[i].id === doraId) count++;
  }
  return count;
};

MJ.Score.calc = function (ctx) {
  var c14 = MJ.Tiles.counts(ctx.hand14);

  var candidates = [];
  if (MJ.Win.isChiitoi(c14)) candidates.push({ chiitoi: true });
  var std = MJ.Win.decompose(c14);
  for (var i = 0; i < std.length; i++) candidates.push(std[i]);

  if (candidates.length === 0) return null;

  var bestDecomp = null, bestYaku = null, bestHan = -1;
  for (i = 0; i < candidates.length; i++) {
    var y = MJ.Score.listYaku(ctx, candidates[i]);
    var h = 0;
    for (var k = 0; k < y.length; k++) h += y[k].han;
    if (h > bestHan) {
      bestHan = h;
      bestDecomp = candidates[i];
      bestYaku = y;
    }
  }

  var yakuHan = bestHan;
  if (yakuHan <= 0) return null; // ドラだけの 0 役は和了不可（§5.2）

  var dora = MJ.Score.doraCount(ctx.hand14, ctx.doraInd);
  var yakuOut = bestYaku.slice();
  if (dora > 0) yakuOut.push({ name: 'ドラ', han: dora });
  var han = yakuHan + dora;

  var fuVal = MJ.Score.fu(ctx, bestDecomp, bestYaku);
  var rawBase = fuVal * Math.pow(2, han + 2);
  var limitNm = MJ.Score.limitName(han, rawBase);
  var base = limitNm ? _LIMIT_AMOUNT[limitNm] : rawBase;

  function ceil100(x) { return Math.ceil(x / 100) * 100; }

  var pay = null, payRon = 0, total = 0;
  if (ctx.isTsumo) {
    if (ctx.isDealer) {
      var each = ceil100(base * 2);
      pay = { dealer: 0, child: each };
      total = each * 3;
    } else {
      var dealerPay = ceil100(base * 2);
      var childPay = ceil100(base * 1);
      pay = { dealer: dealerPay, child: childPay };
      total = dealerPay + childPay * 2;
    }
  } else {
    payRon = ceil100(base * (ctx.isDealer ? 6 : 4));
    total = payRon;
  }

  var text = limitNm ? (limitNm + ' ' + total + '点') : (fuVal + '符 ' + han + '翻 ' + total + '点');

  return {
    yaku: yakuOut,
    yakuHan: yakuHan,
    han: han,
    fu: fuVal,
    base: base,
    limit: limitNm,
    total: total,
    pay: pay,
    payRon: payRon,
    text: text
  };
};
