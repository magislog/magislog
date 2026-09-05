// MJ.Scene — 卓・椅子・照明・床・牌の3D表示（SPEC.md §2・§3.2）
// 数値は全部 MJ.CONFIG から読む（このファイルには直書きしない）。
// MJ.CONFIG / MJ.Tiles は読込順により、このファイルが実行される時点で既に存在する前提。
window.MJ = window.MJ || {};
MJ.Scene = {};

(function () {
  'use strict';

  // ---- モジュール内部状態（グローバル変数は作らない） ----------------------
  var scene, camera, renderer;
  var seatGroups = [null, null, null, null];
  var handMeshes = [[], [], [], []];     // 席ごとの手牌メッシュ（13枚）
  var tsumoMeshes = [null, null, null, null]; // 席ごとのツモ牌
  var riverMeshes = [[], [], [], []];    // 席ごとの河メッシュ
  var riichiStickMeshes = [null, null, null, null]; // リーチ棒
  var wallMeshes = [null, null, null, null]; // 牌山（4席）
  var doraMesh = null;                   // ドラ表示牌
  var _chairMat = null;                  // 椅子の共有材質

  // §2.6: animateTo が積み、render() の先頭で処理する
  MJ.Scene.anims = [];

  // ---- 小さな補助関数 --------------------------------------------------------

  function v3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }
  function setPosArr(obj, a) { obj.position.set(a[0], a[1], a[2]); }
  function cylGeo(a) { return new THREE.CylinderGeometry(a[0], a[1], a[2], a[3], a[4], a[5]); }
  function boxGeo(a) { return new THREE.BoxGeometry(a[0], a[1], a[2]); }
  function ringGeo(a) { return new THREE.RingGeometry(a[0], a[1], a[2]); }
  function sphereGeo(a) { return new THREE.SphereGeometry(a[0], a[1], a[2]); }
  function planeGeo(a) { return new THREE.PlaneGeometry(a[0], a[1]); }

  // 回転を文字列で持つ場合のサポート（現状は未使用だが、互換性のため）
  function parseRot(expr) {
    if (typeof expr === 'number') return expr;
    if (typeof expr !== 'string') return 0;
    var m = /^(-?)PI(?:\/(\d+))?$/.exec(expr);
    if (!m) return 0;
    var sign = (m[1] === '-') ? -1 : 1;
    var denom = m[2] ? parseInt(m[2], 10) : 1;
    return sign * Math.PI / denom;
  }

  // geometry・material を dispose する
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
      var CH = MJ.CONFIG.COLORS;
      _chairMat = new THREE.MeshStandardMaterial({ color: CH.CHAIR, roughness: 0.8 });
    }
    return _chairMat;
  }

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---- init ------------------------------------------------------------------
  MJ.Scene.init = function (container) {
    var C = MJ.CONFIG;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(C.COLORS.BG);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.set(0, 1.35, 1.05);
    camera.lookAt(0, 0.75, -0.05);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    // 環境光
    var amb = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(amb);

    // 補助光（方向光）
    var fill = new THREE.DirectionalLight(0xbfc8ff, 2.0);
    fill.position.set(3, 6, 5);
    fill.target.position.set(0, 0, 0);
    scene.add(fill);
    scene.add(fill.target);

    // 席ごとの Group（§2.1: 原点に置き rotation.y だけで向きを決める）
    for (var s = 0; s < 4; s++) {
      var g = new THREE.Group();
      var angleDeg = [90, 0, 270, 180][s];
      var a = angleDeg * Math.PI / 180;
      g.rotation.y = Math.PI / 2 - a;
      scene.add(g);
      seatGroups[s] = g;
    }

    MJ.Scene.buildTable();
    MJ.Scene.buildFloor();
    MJ.Scene.buildLamp();
    MJ.Scene.buildChair(1);
    MJ.Scene.buildChair(2);
    MJ.Scene.buildChair(3);
    // seat 0 の椅子は作らない（カメラがある）

    window.addEventListener('resize', onWindowResize);

    MJ.Scene.camera = camera;
    MJ.Scene.renderer = renderer;
  };

  // ---- buildTable（§2.2 卓・共有物） ------------------------------------------
  MJ.Scene.buildTable = function () {
    var C = MJ.CONFIG;

    // 天板（フェルト）
    var felt = new THREE.Mesh(
      boxGeo([0.76, 0.04, 0.76]),
      new THREE.MeshStandardMaterial({ color: C.COLORS.FELT, roughness: 0.95 })
    );
    felt.position.set(0, 0.73, 0);
    scene.add(felt);

    // 縁（4枚・各席の Group の子として配置。ローカル位置は (0, 0.745, 0.40)）
    for (var s = 0; s < 4; s++) {
      var rail = new THREE.Mesh(
        boxGeo([0.84, 0.05, 0.04]),
        new THREE.MeshStandardMaterial({ color: C.COLORS.RAIL, roughness: 0.6 })
      );
      rail.position.set(0, 0.745, 0.40);
      seatGroups[s].add(rail);
    }

    // 脚
    var leg = new THREE.Mesh(
      boxGeo([0.50, 0.71, 0.50]),
      new THREE.MeshStandardMaterial({ color: C.COLORS.LEG })
    );
    leg.position.set(0, 0.355, 0);
    scene.add(leg);

    // 中央マーク
    var mark = new THREE.Mesh(
      ringGeo([0.03, 0.035, 32]),
      new THREE.MeshBasicMaterial({ color: 0xd8c27a })
    );
    mark.position.set(0, 0.7505, 0);
    mark.rotation.x = -Math.PI / 2;
    scene.add(mark);
  };

  // ---- buildChair（§2.3 椅子） -----------------------------------------------
  MJ.Scene.buildChair = function (seat) {
    var g = seatGroups[seat];
    var mat = getChairMaterial();

    // 座面
    var seat_surf = new THREE.Mesh(boxGeo([0.45, 0.08, 0.45]), mat);
    seat_surf.position.set(0, 0.45, 0.75);
    g.add(seat_surf);

    // 背もたれ
    var back = new THREE.Mesh(boxGeo([0.45, 0.50, 0.06]), mat);
    back.position.set(0, 0.74, 0.95);
    g.add(back);

    // 脚×4
    var legPos = [
      [0.19, 0.205, 0.75 + 0.19],
      [-0.19, 0.205, 0.75 + 0.19],
      [0.19, 0.205, 0.75 - 0.19],
      [-0.19, 0.205, 0.75 - 0.19]
    ];
    for (var i = 0; i < 4; i++) {
      var leg = new THREE.Mesh(
        cylGeo([0.02, 0.02, 0.41, 8]),
        mat
      );
      leg.position.set(legPos[i][0], legPos[i][1], legPos[i][2]);
      g.add(leg);
    }
  };

  // ---- buildLamp（§2.4 吊りランプ） ------------------------------------------
  MJ.Scene.buildLamp = function () {
    var C = MJ.CONFIG;

    // ランプの光（ポイントライト）
    var lamp_light = new THREE.PointLight(0xfff0d0, 8, 0, 2);
    lamp_light.position.set(0, 1.75, 0);
    scene.add(lamp_light);

    // ランプの傘
    var shade = new THREE.Mesh(
      cylGeo([0.12, 0.42, 0.28, 32, 1, true]),
      new THREE.MeshStandardMaterial({ color: C.COLORS.LAMP, side: THREE.DoubleSide })
    );
    shade.position.set(0, 1.85, 0);
    scene.add(shade);

    // 電球
    var bulb = new THREE.Mesh(
      sphereGeo([0.06, 16, 12]),
      new THREE.MeshBasicMaterial({ color: 0xfff4d6 })
    );
    bulb.position.set(0, 1.77, 0);
    scene.add(bulb);

    // コード
    var cord = new THREE.Mesh(
      cylGeo([0.01, 0.01, 1.4, 8]),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    cord.position.set(0, 2.69, 0);
    scene.add(cord);
  };

  // ---- buildFloor（§2.4 床・市松） ------------------------------------------
  MJ.Scene.buildFloor = function () {
    var C = MJ.CONFIG;

    // 市松パターンのキャンバステクスチャ
    var canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    var ctx = canvas.getContext('2d');
    var cell = 64;
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        ctx.fillStyle = ((x + y) % 2 === 0) ? "#3a2b2b" : "#332525";
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    var tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 6);
    tex.colorSpace = THREE.SRGBColorSpace;

    var floor = new THREE.Mesh(
      planeGeo([20, 20]),
      new THREE.MeshStandardMaterial({ map: tex })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);
  };

  // ---- buildWalls（§2.1 牌山・各席） -----------------------------------------
  MJ.Scene.buildWalls = function () {
    var C = MJ.CONFIG;

    for (var s = 0; s < 4; s++) {
      var g = seatGroups[s];

      // 牌山：17W × 2D × H の箱
      var wall = new THREE.Mesh(
        boxGeo([17 * C.TILE.W, C.TILE.H, 2 * C.TILE.D]),
        new THREE.MeshStandardMaterial({ color: C.COLORS.TILE_SIDE, roughness: 0.6 })
      );
      wall.position.set(0, 0.75 + C.TILE.D, C.WALL_Z);
      g.add(wall);
      wallMeshes[s] = wall;
    }
  };

  // ---- buildProps（§2.1 湯呑み・その他） ------------------------------------
  MJ.Scene.buildProps = function (seat) {
    var C = MJ.CONFIG;
    var g = seatGroups[seat];

    // 湯呑み
    var cup = new THREE.Mesh(
      cylGeo([0.03, 0.025, 0.06, 16]),
      new THREE.MeshStandardMaterial({ color: C.COLORS.CUP })
    );
    cup.position.set(0.32, 0.78, 0.34);
    g.add(cup);
  };

  // ---- makeTileMesh（§3.2 牌メッシュ） ----------------------------------------
  MJ.Scene.makeTileMesh = function (id) {
    var C = MJ.CONFIG;
    var T = C.TILE;

    // 材質配列6面: [−x, +x, −y, +y, −z(裏), +z(表)]
    var sideMat = new THREE.MeshStandardMaterial({
      color: C.COLORS.TILE_SIDE,
      roughness: 0.5
    });
    var backMat = new THREE.MeshStandardMaterial({
      color: C.COLORS.TILE_BACK
    });
    var faceMat = new THREE.MeshBasicMaterial({
      map: MJ.Tiles.texCache[id]
    });

    var mats = [sideMat, sideMat, sideMat, sideMat, backMat, faceMat];
    var mesh = new THREE.Mesh(boxGeo([T.W, T.H, T.D]), mats);
    return mesh;
  };

  // ---- setHand（自分の手牌・他家の手牌・ツモ牌） ----
  MJ.Scene.setHand = function (seat, hand13, tsumo, faceUp) {
    var C = MJ.CONFIG;
    var T = C.TILE;
    var g = seatGroups[seat];

    // 既存メッシュを削除
    for (var i = 0; i < handMeshes[seat].length; i++) {
      g.remove(handMeshes[seat][i]);
      disposeObject3D(handMeshes[seat][i]);
    }
    handMeshes[seat] = [];

    if (tsumo) {
      g.remove(tsumoMeshes[seat]);
      if (tsumoMeshes[seat]) disposeObject3D(tsumoMeshes[seat]);
      tsumoMeshes[seat] = null;
    }

    // 手牌を配置
    for (var i = 0; i < hand13.length; i++) {
      var tile = hand13[i];
      var mesh = MJ.Scene.makeTileMesh(tile.id);
      mesh.position.set((i - 6) * (T.W + T.GAP), 0.75 + T.H / 2, C.HAND_Z);
      mesh.rotation.set(0, 0, 0); // 表向き

      // アニメーションで牌山から手牌位置へ
      if (faceUp === true || faceUp === false) {
        // faceUp パラメータは存在するが、アニメーション制御は game.js 側で行う
      }

      g.add(mesh);
      handMeshes[seat].push(mesh);
    }

    // ツモ牌を配置
    if (tsumo) {
      var mesh = MJ.Scene.makeTileMesh(tsumo.id);
      mesh.position.set(7 * (T.W + T.GAP) + 0.010, 0.75 + T.H / 2, C.HAND_Z);
      mesh.rotation.set(0, 0, 0);
      g.add(mesh);
      tsumoMeshes[seat] = mesh;
    }
  };

  // ---- setRiver（河・打牌） ------------------------------------------------
  MJ.Scene.setRiver = function (seat, river) {
    var C = MJ.CONFIG;
    var T = C.TILE;
    var g = seatGroups[seat];

    // 既存の河メッシュを削除
    for (var i = 0; i < riverMeshes[seat].length; i++) {
      g.remove(riverMeshes[seat][i]);
      disposeObject3D(riverMeshes[seat][i]);
    }
    riverMeshes[seat] = [];

    // 河の牌を配置
    for (var n = 0; n < river.length; n++) {
      var tile = river[n];
      var row = Math.floor(n / C.RIVER_COLS);
      if (row > 2) row = 2;
      var col = (row < 2) ? (n % C.RIVER_COLS) : (n - 12);

      var mesh = MJ.Scene.makeTileMesh(tile.id);
      mesh.position.set((col - 2.5) * (T.W + T.GAP), 0.75 + T.D / 2, C.RIVER_Z0 + row * C.RIVER_ROW_GAP);
      mesh.rotation.x = -Math.PI / 2; // 表向きに寝かせる

      // リーチ宣言牌は横倒し（リーチ中の n 番目の牌をマークするロジックは game.js 側で管理）
      if (false) { // TODO: riichiIndex の確認
        mesh.rotation.z = Math.PI / 2;
        mesh.position.x += 0.008;
      }

      g.add(mesh);
      riverMeshes[seat].push(mesh);
    }
  };

  // ---- setRiichiStick（リーチ棒） -------------------------------------------
  MJ.Scene.setRiichiStick = function (seat, on) {
    var C = MJ.CONFIG;
    var g = seatGroups[seat];

    if (riichiStickMeshes[seat]) {
      g.remove(riichiStickMeshes[seat]);
      disposeObject3D(riichiStickMeshes[seat]);
      riichiStickMeshes[seat] = null;
    }

    if (!on) return;

    // リーチ棒: BoxGeometry(0.10, 0.004, 0.008) 白 + 中央に赤い点
    var group = new THREE.Group();

    var stick = new THREE.Mesh(
      boxGeo([0.10, 0.004, 0.008]),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    group.add(stick);

    var dot = new THREE.Mesh(
      cylGeo([0.002, 0.002, 0.005, 8]),
      new THREE.MeshBasicMaterial({ color: 0xc62828 })
    );
    group.add(dot);

    group.position.set(0, 0.752, C.STICK_Z);
    g.add(group);
    riichiStickMeshes[seat] = group;
  };

  // ---- setDora（ドラ表示牌） ------------------------------------------------
  MJ.Scene.setDora = function (id) {
    var C = MJ.CONFIG;
    var T = C.TILE;

    // ドラメッシュの既存物を削除
    if (doraMesh) {
      seatGroups[2].remove(doraMesh);
      disposeObject3D(doraMesh);
    }

    // そら（seat 2）の Group に配置
    var mesh = MJ.Scene.makeTileMesh(id);
    mesh.position.set(0.10, 0.75 + 2 * T.D + T.H / 2, C.WALL_Z);
    mesh.rotation.x = -Math.PI / 2; // 表向きに寝かせる
    seatGroups[2].add(mesh);
    doraMesh = mesh;
  };

  // ---- revealHand（和了時に手牌を全て表向きに） ----------------------------
  MJ.Scene.revealHand = function (seat) {
    // 現在の実装では既に表向き。ロン牌を 14 枚目に追加する処理は game.js で行う
    // TODO: 和了牌の視覚的マーク（枠・位置）
  };

  // ---- clearTable（局開始時にテーブルをクリア） ----------------------------
  MJ.Scene.clearTable = function () {
    for (var s = 0; s < 4; s++) {
      // 手牌・河・ツモ牌を削除
      for (var i = 0; i < handMeshes[s].length; i++) {
        seatGroups[s].remove(handMeshes[s][i]);
        disposeObject3D(handMeshes[s][i]);
      }
      handMeshes[s] = [];

      if (tsumoMeshes[s]) {
        seatGroups[s].remove(tsumoMeshes[s]);
        disposeObject3D(tsumoMeshes[s]);
        tsumoMeshes[s] = null;
      }

      for (var i = 0; i < riverMeshes[s].length; i++) {
        seatGroups[s].remove(riverMeshes[s][i]);
        disposeObject3D(riverMeshes[s][i]);
      }
      riverMeshes[s] = [];

      // リーチ棒を非表示
      MJ.Scene.setRiichiStick(s, false);
    }
  };

  // ---- animateTo（アニメーション） -----------------------------------------
  MJ.Scene.animateTo = function (obj, to, ms) {
    MJ.Scene.anims.push({
      obj: obj,
      from: obj.position.clone(),
      to: new THREE.Vector3(to[0], to[1], to[2]),
      t0: performance.now(),
      ms: ms
    });
  };

  // ---- render（毎フレーム実行） -------------------------------------------
  MJ.Scene.render = function () {
    // アニメーション処理
    var now = performance.now();
    for (var i = MJ.Scene.anims.length - 1; i >= 0; i--) {
      var anim = MJ.Scene.anims[i];
      var elapsed = now - anim.t0;
      var t = Math.min(elapsed / anim.ms, 1);

      anim.obj.position.lerpVectors(anim.from, anim.to, t);

      if (t >= 1) {
        MJ.Scene.anims.splice(i, 1);
      }
    }

    renderer.render(scene, camera);
  };

})();
