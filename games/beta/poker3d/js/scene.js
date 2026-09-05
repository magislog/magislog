// PK.Scene — 卓・椅子・照明・床・カード・チップの3D表示（SPEC.md §1 / §2 / §3）
// 数値は全部 PK.CONFIG から読む（このファイルには直書きしない）。
// PK.CONFIG / PK.Cards は読込順（config → cards → hand_eval → scene …）により、
// このファイルが実行される時点で既に存在する前提。
window.PK = window.PK || {};
PK.Scene = {};

(function () {
  'use strict';

  // ---- モジュール内部状態（グローバル変数は作らない） ----------------------
  var scene, camera, renderer;
  var seatGroups = [null, null, null, null];
  var holeMeshes = [[], [], [], []];   // 席ごとの手札 Group（最大2枚）
  var betMeshes = [null, null, null, null];   // 席ごとのベット済みチップ Group
  var stackMeshes = [null, null, null, null];   // 席ごとの持ちチップ Group
  var boardMeshes = [];                          // 共有カード Group（最大5枚）
  var potMesh = null;                         // ポットのチップ Group
  var dealerButtonMesh = null;                         // ディーラーボタン（単一・使い回し）
  var _chairMat = null;                         // 椅子の共有材質（使い回し）

  // §2.6: animateTo が積み、render() の先頭で処理する
  PK.Scene.anims = [];

  // ---- 小さな補助関数 --------------------------------------------------------

  function v3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
  function setPosArr(obj, a) { obj.position.set(a[0], a[1], a[2]); }
  function cylGeo(a) { return new THREE.CylinderGeometry(a[0], a[1], a[2], a[3], a[4], a[5]); }
  function boxGeo(a) { return new THREE.BoxGeometry(a[0], a[1], a[2]); }
  function torusGeo(a) { return new THREE.TorusGeometry(a[0], a[1], a[2], a[3]); }
  function ringGeo(a) { return new THREE.RingGeometry(a[0], a[1], a[2]); }
  function sphereGeo(a) { return new THREE.SphereGeometry(a[0], a[1], a[2]); }
  function planeGeo(a) { return new THREE.PlaneGeometry(a[0], a[1]); }

  // config.js は一部の回転を "PI/2" "-PI/2" "-PI/6" のような文字列で持つ（数値はconfig側の正本）。
  // ここでラジアンへ変換する。パターン外は 0（未使用の値のみ渡ってくる想定）。
  function parseRot(expr) {
    var m = /^(-?)PI(?:\/(\d+))?$/.exec(expr);
    if (!m) return 0;
    var sign = (m[1] === '-') ? -1 : 1;
    var denom = m[2] ? parseInt(m[2], 10) : 1;
    return sign * Math.PI / denom;
  }

  // geometry・material を dispose する（§3.2 の「差分更新はしない」を全メッシュへ適用）。
  // texture（.map）はここで絶対に dispose しない： card の表裏テクスチャは
  // PK.Cards.texCache が保持し使い回すため、1枚を消すたびに壊すと他のカードが白紙になる。
  function disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse(function (node) {
      if (node.geometry) node.geometry.dispose();
      if (node.material) {
        if (Array.isArray(node.material)) {
          for (var i = 0; i < node.material.length; i++) node.material[i].dispose();
        } else {
          node.material.dispose();
        }
      }
    });
  }

  function removeAndDispose(obj) {
    if (!obj) return;
    if (obj.parent) obj.parent.remove(obj);
    disposeObject3D(obj);
  }

  function getChairMaterial() {
    if (!_chairMat) {
      var CH = PK.CONFIG.CHAIR;
      _chairMat = new THREE.MeshStandardMaterial({ color: CH.color, roughness: CH.roughness });
    }
    return _chairMat;
  }

  function buildDealerButtonMesh() {
    var D = PK.CONFIG.DEALER_BUTTON_GEO;
    var canvas = document.createElement('canvas');
    canvas.width = D.topCanvas;
    canvas.height = D.topCanvas;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = D.topBg;
    ctx.fillRect(0, 0, D.topCanvas, D.topCanvas);
    ctx.fillStyle = D.topTextColor;
    ctx.font = D.topFont;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(D.topText, D.topCanvas / 2, D.topCanvas / 2);
    var tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;

    var sideMat = new THREE.MeshStandardMaterial({ color: D.sideColor });
    var topMat = new THREE.MeshBasicMaterial({ map: tex });
    var botMat = new THREE.MeshStandardMaterial({ color: D.bottomColor });
    // Cylinder の材質配列順は [側面, 上面, 底面]
    return new THREE.Mesh(cylGeo(D.cylinder), [sideMat, topMat, botMat]);
  }

  // main.js は window.onresize = layoutStage で #stage（2D UI）だけを扱い、
  // カメラ・レンダラは触らない。§2.5 の resize 要件はここで自前に満たす。
  // addEventListener なので main.js 側の window.onresize 代入とは競合しない。
  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---- init ------------------------------------------------------------------
  PK.Scene.init = function (container) {
    var C = PK.CONFIG;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(C.BG_COLOR);

    var camCfg = C.CAMERA;
    camera = new THREE.PerspectiveCamera(camCfg.fov, window.innerWidth / window.innerHeight, camCfg.near, camCfg.far);
    camera.position.set(camCfg.pos[0], camCfg.pos[1], camCfg.pos[2]);
    camera.lookAt(camCfg.lookAt[0], camCfg.lookAt[1], camCfg.lookAt[2]);

    renderer = new THREE.WebGLRenderer({ antialias: C.RENDERER.antialias });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, C.RENDERER.maxPixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = C.SHADOW_ENABLED;
    container.appendChild(renderer.domElement);

    // 環境光・補助光（ランプ本体の光は buildLamp 側でランプと一緒に作る）
    var amb = new THREE.AmbientLight(C.AMBIENT_LIGHT.color, C.AMBIENT_LIGHT.intensity);
    scene.add(amb);

    var fill = new THREE.DirectionalLight(C.FILL_LIGHT.color, C.FILL_LIGHT.intensity);
    fill.position.set(C.FILL_LIGHT.pos[0], C.FILL_LIGHT.pos[1], C.FILL_LIGHT.pos[2]);
    fill.target.position.set(C.FILL_LIGHT.targetPos[0], C.FILL_LIGHT.targetPos[1], C.FILL_LIGHT.targetPos[2]);
    scene.add(fill);
    scene.add(fill.target);

    // 席ごとの Group（§2.1: 原点に置き rotation.y だけで向きを決める。回転計算はここ1か所だけ）
    for (var s = 0; s < 4; s++) {
      var g = new THREE.Group();
      var a = C.SEATS[s].angleDeg * Math.PI / 180;
      g.rotation.y = Math.PI / 2 - a;
      scene.add(g);
      seatGroups[s] = g;
    }

    PK.Scene.buildTable();
    PK.Scene.buildFloor();
    PK.Scene.buildLamp();
    PK.Scene.buildChair(1);
    PK.Scene.buildChair(2);
    PK.Scene.buildChair(3);
    // seat 0 の椅子は作らない（そこにカメラがある）

    window.addEventListener('resize', onWindowResize);

    // cards.js の getAnisotropy() が PK.Scene.renderer.capabilities を探すため公開しておく
    // （実際のテクスチャ生成は cards.js 読込時＝この時点より前に完了しているため現状は使われないが、
    //  cards.js 側の想定に合わせて安全に公開する）
    PK.Scene.camera = camera;
    PK.Scene.renderer = renderer;
  };

  // ---- buildTable（§2.2 卓・共有物） ------------------------------------------
  PK.Scene.buildTable = function () {
    var T = PK.CONFIG.TABLE;

    var felt = new THREE.Mesh(
      cylGeo(T.FELT.cylinder),
      new THREE.MeshStandardMaterial({ color: T.FELT.color, roughness: T.FELT.roughness })
    );
    setPosArr(felt, T.FELT.pos);
    scene.add(felt);

    var rail = new THREE.Mesh(
      torusGeo(T.RAIL.torus),
      new THREE.MeshStandardMaterial({ color: T.RAIL.color, roughness: T.RAIL.roughness })
    );
    setPosArr(rail, T.RAIL.pos);
    rail.rotation.x = parseRot(T.RAIL.rotX);
    scene.add(rail);

    var line = new THREE.Mesh(
      ringGeo(T.BET_LINE.ring),
      new THREE.MeshBasicMaterial({ color: T.BET_LINE.color })
    );
    setPosArr(line, T.BET_LINE.pos);
    line.rotation.x = parseRot(T.BET_LINE.rotX);
    scene.add(line);

    var leg = new THREE.Mesh(
      cylGeo(T.LEG.cylinder),
      new THREE.MeshStandardMaterial({ color: T.LEG.color })
    );
    setPosArr(leg, T.LEG.pos);
    scene.add(leg);

    // 山札: 材質配列6枚、index2（+y 上面）だけ裏テクスチャ、他5面は共通色
    var deckSideMat = new THREE.MeshStandardMaterial({ color: T.DECK.sideColor });
    var deckTopMat = new THREE.MeshBasicMaterial({ map: PK.Cards.texCache.back });
    var deck = new THREE.Mesh(
      boxGeo(T.DECK.box),
      [deckSideMat, deckSideMat, deckTopMat, deckSideMat, deckSideMat, deckSideMat]
    );
    setPosArr(deck, T.DECK.pos);
    scene.add(deck);
  };

  // ---- buildChair（§2.3・seat 1,2,3 のみ呼ばれる想定） --------------------------
  PK.Scene.buildChair = function (seat) {
    var CH = PK.CONFIG.CHAIR;
    var mat = getChairMaterial();
    var group = seatGroups[seat];

    var seatMesh = new THREE.Mesh(boxGeo(CH.SEAT.box), mat);
    setPosArr(seatMesh, CH.SEAT.pos);
    group.add(seatMesh);

    var backMesh = new THREE.Mesh(boxGeo(CH.BACK.box), mat);
    setPosArr(backMesh, CH.BACK.pos);
    group.add(backMesh);

    // 脚×4: (±offsetX, y, baseZ±offsetZ)
    var lg = CH.LEG;
    var xs = [lg.offsetX, -lg.offsetX];
    var zs = [lg.baseZ + lg.offsetZ, lg.baseZ - lg.offsetZ];
    for (var xi = 0; xi < xs.length; xi++) {
      for (var zi = 0; zi < zs.length; zi++) {
        var legMesh = new THREE.Mesh(cylGeo(lg.cylinder), mat);
        legMesh.position.set(xs[xi], lg.y, zs[zi]);
        group.add(legMesh);
      }
    }
  };

  // ---- buildLamp（§2.4・傘/電球/コード＋ランプ自身の光） -------------------------
  PK.Scene.buildLamp = function () {
    var C = PK.CONFIG;

    var shade = new THREE.Mesh(
      cylGeo(C.LAMP_SHADE.cylinder),
      new THREE.MeshStandardMaterial({
        color: C.LAMP_SHADE.color,
        side: C.LAMP_SHADE.doubleSide ? THREE.DoubleSide : THREE.FrontSide
      })
    );
    setPosArr(shade, C.LAMP_SHADE.pos);
    scene.add(shade);

    var bulb = new THREE.Mesh(
      sphereGeo(C.LAMP_BULB.sphere),
      new THREE.MeshBasicMaterial({ color: C.LAMP_BULB.color })
    );
    setPosArr(bulb, C.LAMP_BULB.pos);
    scene.add(bulb);

    var cord = new THREE.Mesh(
      cylGeo(C.LAMP_CORD.cylinder),
      new THREE.MeshStandardMaterial({ color: C.LAMP_CORD.color })
    );
    setPosArr(cord, C.LAMP_CORD.pos);
    scene.add(cord);

    var lampLight = new THREE.PointLight(
      C.LAMP_LIGHT.color, C.LAMP_LIGHT.intensity, C.LAMP_LIGHT.distance, C.LAMP_LIGHT.decay
    );
    setPosArr(lampLight, C.LAMP_LIGHT.pos);
    scene.add(lampLight);
  };

  // ---- buildFloor（§2.4・市松模様の CanvasTexture） -----------------------------
  PK.Scene.buildFloor = function () {
    var F = PK.CONFIG.FLOOR;
    var canvas = document.createElement('canvas');
    canvas.width = F.canvas;
    canvas.height = F.canvas;
    var ctx = canvas.getContext('2d');
    var n = F.canvas / F.cell;
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        ctx.fillStyle = ((x + y) % 2 === 0) ? F.checkerA : F.checkerB;
        ctx.fillRect(x * F.cell, y * F.cell, F.cell, F.cell);
      }
    }
    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(F.repeat[0], F.repeat[1]);
    tex.colorSpace = THREE.SRGBColorSpace;

    var floor = new THREE.Mesh(planeGeo(F.plane), new THREE.MeshStandardMaterial({ map: tex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);
  };

  // ---- makeCardMesh（§3.1・戻り値は THREE.Group。回転は呼び出し側が決める） -------
  PK.Scene.makeCardMesh = function (card) {
    var CD = PK.CONFIG.CARD;
    var group = new THREE.Group();

    // 52枚+裏1枚は cards.js が起動時に作り済み（texCache）。ここでは再生成しない。
    var faceTex = PK.Cards.texCache[PK.Cards.code(card)];
    var backTex = PK.Cards.texCache.back;

    var faceMesh = new THREE.Mesh(planeGeo(CD.plane), new THREE.MeshBasicMaterial({ map: faceTex }));
    faceMesh.position.z = CD.faceZ;
    group.add(faceMesh);

    var backMesh = new THREE.Mesh(planeGeo(CD.plane), new THREE.MeshBasicMaterial({ map: backTex }));
    backMesh.rotation.y = Math.PI;
    backMesh.position.z = CD.backZ;
    group.add(backMesh);

    return group;
  };

  // ---- makeChipPile（§3.2・貪欲法・戻り値は THREE.Group。amount 0 なら空Group） ----
  PK.Scene.makeChipPile = function (amount) {
    var G = PK.CONFIG.CHIP_GEO;
    var group = new THREE.Group();

    var remaining = amount;
    var counts = [];
    var d;
    for (d = 0; d < G.denoms.length; d++) {
      var c = Math.floor(remaining / G.denoms[d]);
      counts.push(c);
      remaining -= c * G.denoms[d];
    }

    var activeCols = [];
    for (d = 0; d < G.denoms.length; d++) {
      if (counts[d] > 0) activeCols.push(d);
    }

    var n = activeCols.length;
    for (var ci = 0; ci < n; ci++) {
      var denomIdx = activeCols[ci];
      var denomValue = G.denoms[denomIdx];
      var count = Math.min(counts[denomIdx], G.maxPerCol);
      var x = (ci - (n - 1) / 2) * G.colWidth;
      var color = PK.CONFIG.CHIP[denomValue];

      for (var i = 0; i < count; i++) {
        var mesh = new THREE.Mesh(
          cylGeo(G.cylinder),
          new THREE.MeshStandardMaterial({ color: color, roughness: G.roughness })
        );
        mesh.position.set(x, G.yBase + G.yStep * i, 0);
        group.add(mesh);
      }
    }
    return group;
  };

  // ---- setHole（§2.1 / §4.4 fold / §4.5 showdown） ------------------------------
  // cards=[] は「手札を消す」（fold）。既に配り済みの席への再呼び出しは「表裏を切替」（showdown）。
  // それ以外は新規の配り（山札位置からアニメーションで配る）。
  PK.Scene.setHole = function (seat, cards, faceUp) {
    var isHuman = (seat === 0);
    var existing = holeMeshes[seat];
    var SL = PK.CONFIG.SEAT_LOCAL;

    if (!cards || cards.length === 0) {
      for (var r = 0; r < existing.length; r++) removeAndDispose(existing[r]);
      holeMeshes[seat] = [];
      return;
    }

    if (existing.length > 0) {
      // 配り済みのぶんは位置そのまま、CPU だけ表裏を即時切替（seat0 の回転は常に固定）
      if (!isHuman) {
        var rotFlip = faceUp ? parseRot(SL.HOLE_CPU_ROT_X_SHOWDOWN) : parseRot(SL.HOLE_CPU_ROT_X_DOWN);
        for (var i = 0; i < existing.length; i++) existing[i].rotation.x = rotFlip;
      }
      // ここで無条件に return していたため、2枚目のカードが3D卓上に一生作られなかった。
      // game.js の配りは「1枚ずつ2周」なので、2周目の呼び出しは必ず existing.length>0 で来る。
      // 結果、4席とも手札が1枚しか表示されていなかった（2026-09-04 表ういが実機で確認）。
      // 足りないぶんだけ下の生成ループで作り足す。
      if (existing.length >= cards.length || existing.length >= 2) return;
    }

    // 新規の配り：山札の位置（このseatのローカル座標へ変換）からアニメーションで配る
    var targetsArr = isHuman ? SL.HOLE_SEAT0_POS : SL.HOLE_CPU_POS;
    var rotX = isHuman
      ? parseRot(SL.HOLE_SEAT0_ROT_X)
      : (faceUp ? parseRot(SL.HOLE_CPU_ROT_X_SHOWDOWN) : parseRot(SL.HOLE_CPU_ROT_X_DOWN));

    var group = seatGroups[seat];
    // worldToLocal は group.matrixWorld を使う。最初の配りは render() が一度も
    // 走る前（Tutorial.start → Game.startHand 経由）に起こり得るため、matrixWorld が
    // 未更新（単位行列のまま）の可能性がある。ここで明示的に更新してから変換する。
    group.updateMatrixWorld(true);
    var startLocal = group.worldToLocal(v3(PK.CONFIG.DEAL_FROM_POS));

    // 既にあるぶんは残し、足りないぶんだけ作って足す
    var created = existing.slice();
    for (var k = created.length; k < cards.length && k < 2; k++) {
      var mesh = PK.Scene.makeCardMesh(cards[k]);
      mesh.rotation.x = rotX;
      mesh.position.copy(startLocal);
      group.add(mesh);
      created.push(mesh);

      (function (m, targetLocal, delayMs) {
        setTimeout(function () {
          PK.Scene.animateTo(m, targetLocal, PK.CONFIG.DEAL_MS);
        }, delayMs);
      })(mesh, v3(targetsArr[k]), k * PK.CONFIG.DEAL_GAP_MS);
    }
    holeMeshes[seat] = created;
  };

  // ---- setBoard（§2.2 共有カード・§2.6 配りアニメ・累積配列を前提に差分だけ足す） ----
  PK.Scene.setBoard = function (cards) {
    var BC = PK.CONFIG.TABLE.BOARD_CARDS;
    var rotX = parseRot(BC.rotX);
    var start = boardMeshes.length;

    for (var i = start; i < cards.length && i < 5; i++) {
      var mesh = PK.Scene.makeCardMesh(cards[i]);
      mesh.rotation.x = rotX;
      mesh.position.copy(v3(PK.CONFIG.DEAL_FROM_POS));
      scene.add(mesh);
      boardMeshes.push(mesh);

      (function (m, targetPos, delayMs) {
        setTimeout(function () {
          PK.Scene.animateTo(m, targetPos, PK.CONFIG.DEAL_MS);
        }, delayMs);
      })(mesh, new THREE.Vector3(BC.xs[i], BC.y, BC.z), (i - start) * PK.CONFIG.DEAL_GAP_MS);
    }
  };

  // ---- setBet / setStack / setPot（§3.2: 差分更新せず作り直す） ------------------
  PK.Scene.setBet = function (seat, amt) {
    removeAndDispose(betMeshes[seat]);
    var g = PK.Scene.makeChipPile(amt);
    setPosArr(g, PK.CONFIG.SEAT_LOCAL.BET_CHIPS_POS);
    seatGroups[seat].add(g);
    betMeshes[seat] = g;
  };

  PK.Scene.setStack = function (seat, amt) {
    removeAndDispose(stackMeshes[seat]);
    var g = PK.Scene.makeChipPile(amt);
    setPosArr(g, PK.CONFIG.SEAT_LOCAL.STACK_CHIPS_POS);
    seatGroups[seat].add(g);
    stackMeshes[seat] = g;
  };

  PK.Scene.setPot = function (amt) {
    removeAndDispose(potMesh);
    var g = PK.Scene.makeChipPile(amt);
    setPosArr(g, PK.CONFIG.TABLE.POT_CHIPS_POS);
    scene.add(g);
    potMesh = g;
  };

  // ---- setDealerButton（単一メッシュを使い回し、席の Group へ付け替える） ----------
  PK.Scene.setDealerButton = function (seat) {
    if (!dealerButtonMesh) dealerButtonMesh = buildDealerButtonMesh();
    seatGroups[seat].add(dealerButtonMesh); // Object3D.add は旧親から自動的に外す
    setPosArr(dealerButtonMesh, PK.CONFIG.SEAT_LOCAL.DEALER_BUTTON_POS);
  };

  // ---- clearTable（新しいハンドの直前に呼ばれる想定。スタックとボタンは触らない） ---
  PK.Scene.clearTable = function () {
    for (var s = 0; s < 4; s++) {
      for (var i = 0; i < holeMeshes[s].length; i++) removeAndDispose(holeMeshes[s][i]);
      holeMeshes[s] = [];
      removeAndDispose(betMeshes[s]);
      betMeshes[s] = null;
    }
    for (var b = 0; b < boardMeshes.length; b++) removeAndDispose(boardMeshes[b]);
    boardMeshes = [];
    removeAndDispose(potMesh);
    potMesh = null;
    PK.Scene.anims.length = 0;
  };

  // ---- animateTo / render（§2.6：位置だけを線形補間） ---------------------------
  PK.Scene.animateTo = function (obj, to, ms) {
    PK.Scene.anims.push({
      obj: obj,
      from: obj.position.clone(),
      to: to.clone(),
      t0: performance.now(),
      ms: ms
    });
  };

  PK.Scene.render = function () {
    var now = performance.now();
    var anims = PK.Scene.anims;
    for (var i = anims.length - 1; i >= 0; i--) {
      var a = anims[i];
      var t = (now - a.t0) / a.ms;
      if (t >= 1) {
        a.obj.position.copy(a.to);
        anims.splice(i, 1);
      } else {
        a.obj.position.lerpVectors(a.from, a.to, t);
      }
    }
    renderer.render(scene, camera);
  };

})();
