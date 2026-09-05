var FD = (typeof window !== 'undefined') ? (window.FD = window.FD || {}) : (global.FD = global.FD || {});

// FD.Fund — ファンドの純粋関数群。document・window を参照しない（node で検算するため。SPEC.md §1・§10.6）。
// 画面側（ui.js・game.js）はここの返り値をそのまま表示する。お金の計算をここ以外でしない。
FD.Fund = {};

// ---- §3.1 乱数（mulberry32。状態は f.rngState だけ） ----
FD.Fund.rand = function (f) {
  f.rngState = (f.rngState + 0x6D2B79F5) | 0;
  var t = f.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---- §4.1 手数料（代金の 0.1%・切り捨て） ----
FD.Fund.fee = function (amount) {
  if (!Number.isFinite(amount)) return 0;
  return Math.floor(amount * FD.CONFIG.FEE_PER_MILLE / 1000);
};

// ---- §3.2 1 日の値動き ----
FD.Fund.nextPrice = function (price, bp) {
  var CONFIG = FD.CONFIG;
  var b = Math.max(-CONFIG.MAX_MOVE_BP, Math.min(CONFIG.MAX_MOVE_BP, bp));
  return Math.max(CONFIG.MIN_PRICE, Math.floor((price * (10000 + b) + 5000) / 10000));
};

// ---- §4.2 割合の丸め ----
FD.Fund.clampPct = function (p) {
  var CONFIG = FD.CONFIG;
  if (!Number.isInteger(p)) return null;
  if (p < CONFIG.PCT_MIN || p > CONFIG.PCT_MAX) return null;
  if (p % CONFIG.PCT_STEP !== 0) return null;
  return p;
};

// ---- §2.1 識別子の同一判定（構造で比べる。文字列化しない） ----
FD.Fund.index = function (f, id) {
  if (!f || !f.stocks) return -1;
  for (var i = 0; i < f.stocks.length; i++) {
    if (f.stocks[i].id === id) return i;
  }
  return -1;
};

FD.Fund.stock = function (f, id) {
  var i = FD.Fund.index(f, id);
  return i >= 0 ? f.stocks[i] : null;
};

// ---- §3.4 ファンドを作る ----
FD.Fund.newFund = function (seed, firstNews) {
  try {
    if (!Number.isInteger(seed)) return null;
    var CONFIG = FD.CONFIG;
    var f = {
      seed: seed,
      rngState: seed | 0,
      day: 1,
      finished: false,
      cash: CONFIG.START_CASH,
      stocks: [],
      pos: {},
      news: null,
      prevTotal: CONFIG.START_CASH,
      stats: { buys: 0, sells: 0, days: 0, boughtAmt: 0, soldAmt: 0, feePaid: 0, bookReleased: 0 },
      log: []
    };
    for (var i = 0; i < CONFIG.STOCKS.length; i++) {
      var c = CONFIG.STOCKS[i];
      f.stocks.push({ id: c.id, ticker: c.ticker, name: c.name, sector: c.sector, price: c.price, hist: [c.price] });
      f.pos[c.id] = { shares: 0, bookCost: 0 };
    }
    var zero6 = [0, 0, 0, 0, 0, 0];
    for (var k = 0; k < CONFIG.WARMUP; k++) {
      FD.Fund.movePrices(f, zero6);
    }
    if (firstNews) {
      f.news = { type: firstNews.type, sector: firstNews.sector, dir: firstNews.dir };
    } else {
      f.news = FD.Fund.drawNews(f);
    }
    f.log.push("1 日目 開始 現金 " + FD.Fund.fmtYen(CONFIG.START_CASH) + " 円（seed " + seed + "）");
    return f;
  } catch (e) {
    return null;
  }
};

// ---- §5.2 ニュースを引く ----
FD.Fund.drawNews = function (f) {
  var CONFIG = FD.CONFIG;
  var u = FD.Fund.rand(f);
  var type = 'calm';
  var acc = 0;
  for (var i = 0; i < CONFIG.NEWS_WEIGHTS.length; i++) {
    acc += CONFIG.NEWS_WEIGHTS[i][1];
    if (u * 100 < acc) { type = CONFIG.NEWS_WEIGHTS[i][0]; break; }
  }
  var news = { type: type, sector: null, dir: 0 };
  if (type === 'boom' || type === 'bust' || type === 'rumor') {
    var k = Math.floor(FD.Fund.rand(f) * 3);
    if (k < 0 || k > 2) k = 0;
    news.sector = CONFIG.SECTOR_ORDER[k];
    news.dir = (type === 'boom') ? 1 : (type === 'bust' ? -1 : 0);
  } else if (type === 'macro') {
    news.dir = FD.Fund.rand(f) < 0.5 ? 1 : -1;
  }
  return news;
};

// ---- §5.3 ニュースを効かせる ----
FD.Fund.effectBp = function (f, news) {
  var CONFIG = FD.CONFIG;
  var eff = [0, 0, 0, 0, 0, 0];
  var rumorDir = 0;
  if (!news) return { eff: eff, rumorDir: rumorDir };
  var bp = CONFIG.NEWS_BP[news.type];
  var i;
  if (news.type === 'boom' || news.type === 'bust') {
    for (i = 0; i < f.stocks.length; i++) {
      if (f.stocks[i].sector === news.sector) eff[i] = news.dir * bp;
    }
  } else if (news.type === 'rumor') {
    rumorDir = FD.Fund.rand(f) < 0.5 ? 1 : -1;
    for (i = 0; i < f.stocks.length; i++) {
      if (f.stocks[i].sector === news.sector) eff[i] = rumorDir * bp;
    }
  } else if (news.type === 'macro') {
    for (i = 0; i < f.stocks.length; i++) {
      eff[i] = news.dir * bp;
    }
  }
  // calm: 何もしない
  return { eff: eff, rumorDir: rumorDir };
};

// ---- §3.3 6 銘柄をまとめて動かす ----
FD.Fund.movePrices = function (f, eff) {
  var CONFIG = FD.CONFIG;
  var moves = [];
  for (var i = 0; i < f.stocks.length; i++) {
    var s = f.stocks[i];
    var sec = CONFIG.SECTORS[s.sector];
    var noise = Math.floor(FD.Fund.rand(f) * (2 * sec.vol + 1)) - sec.vol;
    var e = (eff && typeof eff[i] === 'number') ? eff[i] : 0;
    var bp = Math.max(-CONFIG.MAX_MOVE_BP, Math.min(CONFIG.MAX_MOVE_BP, sec.drift + noise + e));
    var prev = s.price;
    s.price = FD.Fund.nextPrice(prev, bp);
    s.hist.push(s.price);
    moves.push({ id: s.id, prev: prev, price: s.price, bp: bp });
  }
  return moves;
};

// ---- §3.5 日を進める ----
FD.Fund.nextDay = function (f) {
  try {
    if (!f || f.finished) return null;
    var CONFIG = FD.CONFIG;
    f.prevTotal = FD.Fund.total(f);
    var e = FD.Fund.effectBp(f, f.news);
    var moves = FD.Fund.movePrices(f, e.eff);
    f.day += 1;
    f.stats.days += 1;
    var applied = f.news;
    if (f.day > CONFIG.DAYS) {
      f.finished = true;
      f.news = null;
    } else {
      f.news = FD.Fund.drawNews(f);
    }
    var totalNow = FD.Fund.total(f);
    var report = {
      day: f.day,
      moves: moves,
      applied: applied,
      rumorDir: e.rumorDir,
      news: f.news,
      total: totalNow,
      prevTotal: f.prevTotal,
      finished: f.finished
    };
    var diff = report.total - f.prevTotal;
    var diffStr = (diff > 0 ? "+" : "") + FD.Fund.fmtYen(diff);
    f.log.push((f.finished ? "最終" : (f.day + " 日目")) + " 合計 " + FD.Fund.fmtYen(report.total) + " 円（前日比 " + diffStr + "）");
    if (f.log.length > CONFIG.LOG_MAX) f.log.shift();
    return report;
  } catch (err) {
    return null;
  }
};

// ---- §4.3 買う（計算は quote、実行は buy） ----
FD.Fund.quoteBuy = function (f, id, pct) {
  try {
    if (!f) return { ok: false, reason: 'none' };
    var s = FD.Fund.stock(f, id);
    var p = FD.Fund.clampPct(pct);
    if (!s || p === null) return { ok: false, reason: 'none' };
    if (f.finished) return { ok: false, reason: 'finished' };
    var budget = Math.floor(f.cash * p / 100);
    var shares = Math.floor(budget / s.price);
    while (shares > 0 && shares * s.price + FD.Fund.fee(shares * s.price) > budget) shares -= 1;
    if (shares <= 0) return { ok: false, reason: 'no_cash', shares: 0, amount: 0, fee: 0, total: 0, cashAfter: f.cash };
    var amount = shares * s.price;
    var feeAmt = FD.Fund.fee(amount);
    return { ok: true, reason: null, shares: shares, amount: amount, fee: feeAmt, total: amount + feeAmt, cashAfter: f.cash - amount - feeAmt };
  } catch (e) {
    return { ok: false, reason: 'none' };
  }
};

FD.Fund.buy = function (f, id, pct) {
  try {
    var q = FD.Fund.quoteBuy(f, id, pct);
    if (!q.ok) return q;
    var s = FD.Fund.stock(f, id);
    var pos = f.pos[id];
    f.cash -= q.total;
    pos.shares += q.shares;
    pos.bookCost += q.amount;
    f.stats.buys += 1;
    f.stats.boughtAmt += q.amount;
    f.stats.feePaid += q.fee;
    f.log.push(f.day + " 日目 買い " + s.ticker + " " + q.shares + " 株 @" + FD.Fund.fmtYen(s.price) + " = " + FD.Fund.fmtYen(q.amount) + " 円 + 手数料 " + FD.Fund.fmtYen(q.fee));
    if (f.log.length > FD.CONFIG.LOG_MAX) f.log.shift();
    return q;
  } catch (e) {
    return { ok: false, reason: 'none' };
  }
};

// ---- §4.4 売る ----
FD.Fund.quoteSell = function (f, id, pct) {
  try {
    if (!f) return { ok: false, reason: 'none' };
    var s = FD.Fund.stock(f, id);
    var p = FD.Fund.clampPct(pct);
    if (!s || p === null) return { ok: false, reason: 'none' };
    if (f.finished) return { ok: false, reason: 'finished' };
    var pos = f.pos[id];
    if (!pos || pos.shares <= 0) return { ok: false, reason: 'no_shares', shares: 0, amount: 0, fee: 0, total: 0, cashAfter: f.cash, released: 0 };
    var qty = Math.max(1, Math.floor(pos.shares * p / 100));
    var amount = qty * s.price;
    var feeAmt = FD.Fund.fee(amount);
    var released = Math.floor(pos.bookCost * qty / pos.shares);
    return { ok: true, reason: null, shares: qty, amount: amount, fee: feeAmt, total: amount - feeAmt, cashAfter: f.cash + amount - feeAmt, released: released };
  } catch (e) {
    return { ok: false, reason: 'none' };
  }
};

FD.Fund.sell = function (f, id, pct) {
  try {
    var q = FD.Fund.quoteSell(f, id, pct);
    if (!q.ok) return q;
    var s = FD.Fund.stock(f, id);
    var pos = f.pos[id];
    f.cash += q.total;
    pos.bookCost -= q.released;
    pos.shares -= q.shares;
    f.stats.sells += 1;
    f.stats.soldAmt += q.amount;
    f.stats.feePaid += q.fee;
    f.stats.bookReleased += q.released;
    var pl = q.amount - q.released;
    var plStr = (pl > 0 ? "+" : "") + FD.Fund.fmtYen(pl);
    f.log.push(f.day + " 日目 売り " + s.ticker + " " + q.shares + " 株 @" + FD.Fund.fmtYen(s.price) + " = " + FD.Fund.fmtYen(q.amount) + " 円 − 手数料 " + FD.Fund.fmtYen(q.fee) + "（損益 " + plStr + "）");
    if (f.log.length > FD.CONFIG.LOG_MAX) f.log.shift();
    return q;
  } catch (e) {
    return { ok: false, reason: 'none' };
  }
};

// ---- §4.5 読み取り関数（ファンドを変えない） ----
FD.Fund.equity = function (f) {
  if (!f || !f.stocks) return 0;
  var sum = 0;
  for (var i = 0; i < f.stocks.length; i++) {
    var s = f.stocks[i];
    var pos = f.pos ? f.pos[s.id] : null;
    sum += (pos ? pos.shares : 0) * s.price;
  }
  return sum;
};

FD.Fund.total = function (f) {
  if (!f) return 0;
  return f.cash + FD.Fund.equity(f);
};

FD.Fund.retHundredths = function (f) {
  if (!f) return 0;
  var CONFIG = FD.CONFIG;
  return Math.round((FD.Fund.total(f) - CONFIG.START_CASH) * 10000 / CONFIG.START_CASH);
};

FD.Fund.dayChange = function (f, i) {
  if (!f || !f.stocks || !f.stocks[i]) return 0;
  var s = f.stocks[i];
  var hist = s.hist;
  if (!hist || hist.length < 2) return 0;
  return s.price - hist[hist.length - 2];
};

FD.Fund.dayChangeH = function (f, i) {
  if (!f || !f.stocks || !f.stocks[i]) return 0;
  var hist = f.stocks[i].hist;
  if (!hist || hist.length < 2) return 0;
  var prev = hist[hist.length - 2];
  if (!prev) return 0;
  return Math.round(FD.Fund.dayChange(f, i) * 10000 / prev);
};

FD.Fund.totalChange = function (f) {
  if (!f) return 0;
  return FD.Fund.total(f) - f.prevTotal;
};

FD.Fund.totalChangeH = function (f) {
  if (!f) return 0;
  var pt = f.prevTotal;
  if (!(pt > 0)) return 0;
  return Math.round(FD.Fund.totalChange(f) * 10000 / pt);
};

FD.Fund.unrealized = function (f, id) {
  if (!f) return 0;
  var s = FD.Fund.stock(f, id);
  var pos = f.pos ? f.pos[id] : null;
  if (!s || !pos) return 0;
  return pos.shares * s.price - pos.bookCost;
};

FD.Fund.chartSeries = function (f, id) {
  var CONFIG = FD.CONFIG;
  var s = FD.Fund.stock(f, id);
  if (!s || !s.hist) return [];
  return s.hist.slice(-CONFIG.CHART_DAYS);
};

// ---- §6.4 チャート（純粋関数。DOM に触らない） ----
FD.Fund.chartLayout = function (values, W, H) {
  if (!values || values.length === 0) return { lo: 0, hi: 0, pts: [] };
  var lo = values[0], hi = values[0];
  for (var j = 1; j < values.length; j++) {
    if (values[j] < lo) lo = values[j];
    if (values[j] > hi) hi = values[j];
  }
  var n = values.length;
  var pts = [];
  for (var i = 0; i < n; i++) {
    var x = (n <= 1) ? 0 : Math.round(i * (W - 1) / (n - 1));
    var y = (hi === lo) ? Math.floor((H - 1) / 2) : (H - 1) - Math.round((values[i] - lo) * (H - 1) / (hi - lo));
    pts.push({ x: x, y: y });
  }
  return { lo: lo, hi: hi, pts: pts };
};

// ---- §4.5 最終結果 ----
FD.Fund.result = function (f) {
  if (!f || !f.finished) return null;
  var CONFIG = FD.CONFIG;
  return {
    start: CONFIG.START_CASH,
    final: FD.Fund.total(f),
    cash: f.cash,
    equity: FD.Fund.equity(f),
    retH: FD.Fund.retHundredths(f),
    buys: f.stats.buys,
    sells: f.stats.sells,
    feePaid: f.stats.feePaid
  };
};

// ---- §2.5 不変量チェック（空配列 = 正常） ----
FD.Fund.validate = function (f) {
  var errs = [];
  try {
    var CONFIG = FD.CONFIG;
    if (!f) { errs.push('fund is null'); return errs; }

    // 1
    if (!Number.isInteger(f.cash) || f.cash < 0) errs.push('cash invalid: ' + f.cash);
    if (!Number.isInteger(f.day) || f.day < 1 || f.day > 31) errs.push('day invalid: ' + f.day);
    if (f.finished !== (f.day > 30)) errs.push('finished mismatch');
    if (!Number.isInteger(f.prevTotal) || f.prevTotal < 0) errs.push('prevTotal invalid: ' + f.prevTotal);
    if (!Number.isInteger(f.rngState)) errs.push('rngState invalid');

    // 2
    if (!f.stocks || f.stocks.length !== CONFIG.STOCKS.length) {
      errs.push('stocks length invalid');
    } else {
      for (var i = 0; i < CONFIG.STOCKS.length; i++) {
        var cs = CONFIG.STOCKS[i];
        var s = f.stocks[i];
        if (!s || s.id !== cs.id || s.sector !== cs.sector) errs.push('stocks[' + i + '] id/sector mismatch');
        if (!s || !Number.isInteger(s.price) || s.price < CONFIG.MIN_PRICE) errs.push('stocks[' + i + '] price invalid');
      }
    }

    // 3
    for (var j = 0; j < CONFIG.STOCKS.length; j++) {
      var id = CONFIG.STOCKS[j].id;
      var pos = f.pos ? f.pos[id] : null;
      if (!pos || !Number.isInteger(pos.shares) || pos.shares < 0 || !Number.isInteger(pos.bookCost) || pos.bookCost < 0) {
        errs.push('pos[' + id + '] invalid');
      } else {
        if (pos.shares === 0 && pos.bookCost !== 0) errs.push('pos[' + id + '] bookCost should be 0');
        if (pos.shares > 0 && pos.bookCost < pos.shares) errs.push('pos[' + id + '] bookCost below shares');
      }
    }

    // 4
    if (f.stocks) {
      for (var k = 0; k < f.stocks.length; k++) {
        var sk = f.stocks[k];
        if (!sk || !sk.hist || sk.hist.length !== CONFIG.WARMUP + f.day) {
          errs.push('hist length invalid for ' + (sk && sk.id));
        } else if (sk.hist[sk.hist.length - 1] !== sk.price) {
          errs.push('hist last mismatch for ' + sk.id);
        }
      }
    }

    // 5
    if (f.stats) {
      var statKeys = ['buys', 'sells', 'days', 'boughtAmt', 'soldAmt', 'feePaid', 'bookReleased'];
      for (var m = 0; m < statKeys.length; m++) {
        var v = f.stats[statKeys[m]];
        if (!Number.isInteger(v) || v < 0) errs.push('stats.' + statKeys[m] + ' invalid');
      }
      if (f.stats.days !== f.day - 1) errs.push('stats.days mismatch');
    } else {
      errs.push('stats missing');
    }

    // 6 お金の勘定（最重要）
    if (f.stats && Number.isInteger(f.cash)) {
      var expectCash = CONFIG.START_CASH - f.stats.boughtAmt - f.stats.feePaid + f.stats.soldAmt;
      if (f.cash !== expectCash) errs.push('cash accounting mismatch: ' + f.cash + ' !== ' + expectCash);
    }

    // 7 簿価の勘定
    if (f.pos && f.stats) {
      var sumBook = 0;
      for (var n = 0; n < CONFIG.STOCKS.length; n++) {
        var pid = CONFIG.STOCKS[n].id;
        sumBook += (f.pos[pid] ? f.pos[pid].bookCost : 0);
      }
      var expectBook = f.stats.boughtAmt - f.stats.bookReleased;
      if (sumBook !== expectBook) errs.push('bookCost accounting mismatch: ' + sumBook + ' !== ' + expectBook);
    }

    // 8 ニュース
    if (f.finished) {
      if (f.news !== null) errs.push('news should be null when finished');
    } else {
      if (!f.news) {
        errs.push('news missing when not finished');
      } else {
        if (CONFIG.NEWS_TYPES.indexOf(f.news.type) < 0) errs.push('news.type invalid');
        if (f.news.type === 'boom' || f.news.type === 'bust' || f.news.type === 'rumor') {
          if (CONFIG.SECTOR_ORDER.indexOf(f.news.sector) < 0) errs.push('news.sector invalid for ' + f.news.type);
        } else {
          if (f.news.sector !== null) errs.push('news.sector should be null for ' + f.news.type);
        }
        if (f.news.type === 'boom' && f.news.dir !== 1) errs.push('news.dir invalid for boom');
        if (f.news.type === 'bust' && f.news.dir !== -1) errs.push('news.dir invalid for bust');
        if (f.news.type === 'macro' && f.news.dir !== 1 && f.news.dir !== -1) errs.push('news.dir invalid for macro');
        if (f.news.type === 'rumor' && f.news.dir !== 0) errs.push('news.dir invalid for rumor');
        if (f.news.type === 'calm' && f.news.dir !== 0) errs.push('news.dir invalid for calm');
      }
    }
  } catch (e) {
    errs.push('validate exception: ' + (e && e.message));
  }
  return errs;
};

// ---- §4.6 表示の文字列（表示・ログだけに使う。判定に使わない） ----
FD.Fund.fmtYen = function (n) {
  if (!Number.isFinite(n)) n = 0;
  n = Math.round(n);
  var neg = n < 0;
  var abs = Math.abs(n);
  var str = String(abs);
  var out = '';
  var count = 0;
  for (var i = str.length - 1; i >= 0; i--) {
    out = str.charAt(i) + out;
    count++;
    if (count % 3 === 0 && i !== 0) out = ',' + out;
  }
  return (neg ? '-' : '') + out;
};

FD.Fund.fmtPct = function (h) {
  if (!Number.isFinite(h)) h = 0;
  h = Math.round(h);
  var sign = h > 0 ? '+' : (h < 0 ? '-' : '');
  var abs = Math.abs(h);
  var intPart = Math.floor(abs / 100);
  var fracPart = abs % 100;
  var fracStr = (fracPart < 10 ? '0' : '') + fracPart;
  return sign + intPart + '.' + fracStr + '%';
};
