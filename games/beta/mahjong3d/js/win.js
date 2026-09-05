window.MJ = window.MJ || {};
MJ.Win = {};

function _mjNextIndex(c, i) {
  while (i < 34 && c[i] === 0) i++;
  return i;
}

// c を直接書き換えて再帰し、戻る前に必ず元へ戻す（§5.1）
function _mjSets(c, i) {
  i = _mjNextIndex(c, i);
  if (i === 34) return true;

  if (c[i] >= 3) {
    c[i] -= 3;
    var ok1 = _mjSets(c, i);
    c[i] += 3;
    if (ok1) return true;
  }

  if (i < 27 && MJ.Tiles.num(i) <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    var ok2 = _mjSets(c, i);
    c[i]++; c[i + 1]++; c[i + 2]++;
    if (ok2) return true;
  }

  return false;
}

// decompose 用: 全分解を収集する
function _mjDecomposeSets(c, i, acc, results) {
  i = _mjNextIndex(c, i);
  if (i === 34) {
    results.push(acc.slice());
    return;
  }

  if (c[i] >= 3) {
    c[i] -= 3;
    acc.push({ kind: 'pon', id: i });
    _mjDecomposeSets(c, i, acc, results);
    acc.pop();
    c[i] += 3;
  }

  if (i < 27 && MJ.Tiles.num(i) <= 7 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    acc.push({ kind: 'chi', id: i });
    _mjDecomposeSets(c, i, acc, results);
    acc.pop();
    c[i]++; c[i + 1]++; c[i + 2]++;
  }
}

MJ.Win.isChiitoi = function (c) {
  var pairs = 0;
  for (var i = 0; i < 34; i++) {
    if (c[i] === 2) pairs++;
    else if (c[i] !== 0) return false; // 1,3,4 枚は七対子として不可
  }
  return pairs === 7;
};

MJ.Win.isStandard = function (c) {
  var work = c.slice();
  for (var i = 0; i < 34; i++) {
    if (work[i] >= 2) {
      work[i] -= 2;
      var ok = _mjSets(work, 0);
      work[i] += 2;
      if (ok) return true;
    }
  }
  return false;
};

MJ.Win.isWin = function (c) {
  return MJ.Win.isChiitoi(c) || MJ.Win.isStandard(c);
};

MJ.Win.decompose = function (c) {
  var results = [];
  var base = c.slice();
  for (var p = 0; p < 34; p++) {
    if (base[p] >= 2) {
      base[p] -= 2;
      var setResults = [];
      _mjDecomposeSets(base, 0, [], setResults);
      for (var k = 0; k < setResults.length; k++) {
        results.push({ pair: p, sets: setResults[k] });
      }
      base[p] += 2;
    }
  }
  return results;
};

MJ.Win.tenpaiTiles = function (c13) {
  var result = [];
  var c = c13.slice();
  for (var id = 0; id < 34; id++) {
    if (c[id] < 4) {
      c[id]++;
      if (MJ.Win.isWin(c)) result.push(id);
      c[id]--;
    }
  }
  return result;
};

MJ.Win.isFuriten = function (waits, river) {
  for (var i = 0; i < waits.length; i++) {
    for (var j = 0; j < river.length; j++) {
      if (river[j].id === waits[i]) return true;
    }
  }
  return false;
};
