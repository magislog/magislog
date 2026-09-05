// RL.Scene — 卓・ホイール・賭け台・玉・カーソル・小物の3D表示（SPEC.md §2・一部§3呼び出し）
// 数値は全部 RL.CONFIG から読む（このファイルには直書きしない）。
// RL.CONFIG / RL.Bets / RL.Tex は読込順（three→config→bets→textures→scene）により、
// このファイルが実行される時点で既に存在する前提。
window.RL = window.RL || {};
RL.Scene = {};

(function () {
  'use strict';

  // ---- モジュール内部状態（グローバル変数は作らない） ----------------------
  var scene, camera, renderer;
  var tEpoch = 0;

  var wheelGroup = null;
  var rotor = null;
  var ball = null;
  var ballState = { mode: 'rest', idx: 0 };

  var dollyMesh = null;
  var cursorRing = null;
  var cursorHilite = null;

  var chipStacks = []; // setChips/clearChips が管理する Group の配列

  // ---- 小さな補助関数 --------------------------------------------------------

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

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ---- init（§2.5 カメラ・レンダラ＋各 build 呼び出し） -----------------------
  RL.Scene.init = function (container) {
    var C = RL.CONFIG;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(C.COLORS.BG);

    camera = new THREE.PerspectiveCamera(C.CAMERA.FOV, window.innerWidth / window.innerHeight, 0.1, 50);
    camera.position.set(C.CAMERA.POS[0], C.CAMERA.POS[1], C.CAMERA.POS[2]);
    camera.lookAt(C.CAMERA.LOOK[0], C.CAMERA.LOOK[1], C.CAMERA.LOOK[2]);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    tEpoch = performance.now();

    // ---- 照明（§2.4。ランプ本体の傘・電球・コードは buildLamp） ----
    var amb = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(amb);

    var fill = new THREE.DirectionalLight(0xbfc8ff, 2.0);
    fill.position.set(3, 6, 5);
    fill.target.position.set(0, 0, 0);
    scene.add(fill);
    scene.add(fill.target);

    RL.Scene.buildFloor();
    RL.Scene.buildTable();
    RL.Scene.buildWheel();
    RL.Scene.buildLayout();
    RL.Scene.buildBall();
    RL.Scene.buildLamp();
    RL.Scene.buildProps();
    RL.Scene.buildCursor();

    RL.Scene.restBall(0); // 数字0のポケットに置く（§4.4）

    window.addEventListener('resize', onWindowResize);

    RL.Scene.camera = camera;
    RL.Scene.renderer = renderer;
  };

  // ---- buildFloor（§2.4 床・市松。テクスチャは RL.Tex.makeFloorTexture） -------
  RL.Scene.buildFloor = function () {
    var tex = RL.Tex.makeFloorTexture();
    var floor = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ map: tex })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    scene.add(floor);
  };

  // ---- buildTable（§2.1 天板・縁・脚） ----------------------------------------
  RL.Scene.buildTable = function () {
    var C = RL.CONFIG;

    // 天板（フェルト）
    var felt = new THREE.Mesh(
      new THREE.BoxGeometry(2.60, 0.06, 1.20),
      new THREE.MeshStandardMaterial({ color: C.COLORS.FELT, roughness: 0.95 })
    );
    felt.position.set(0, 0.72, 0);
    scene.add(felt);

    // 縁 ×4（長辺2・短辺2）
    var railMat = new THREE.MeshStandardMaterial({ color: C.COLORS.RAIL, roughness: 0.6 });
    var railLongGeo = new THREE.BoxGeometry(2.72, 0.06, 0.06);
    var railShortGeo = new THREE.BoxGeometry(0.06, 0.06, 1.32);

    var railN = new THREE.Mesh(railLongGeo, railMat);
    railN.position.set(0, 0.75, 0.63);
    scene.add(railN);

    var railS = new THREE.Mesh(railLongGeo, railMat);
    railS.position.set(0, 0.75, -0.63);
    scene.add(railS);

    var railE = new THREE.Mesh(railShortGeo, railMat);
    railE.position.set(1.33, 0.75, 0);
    scene.add(railE);

    var railW = new THREE.Mesh(railShortGeo, railMat);
    railW.position.set(-1.33, 0.75, 0);
    scene.add(railW);

    // 脚 ×4
    var legMat = new THREE.MeshStandardMaterial({ color: C.COLORS.LEG });
    var legGeo = new THREE.BoxGeometry(0.10, 0.69, 0.10);
    var legX = [1.15, -1.15];
    var legZ = [0.45, -0.45];
    for (var i = 0; i < legX.length; i++) {
      for (var j = 0; j < legZ.length; j++) {
        var leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(legX[i], 0.345, legZ[j]);
        scene.add(leg);
      }
    }
  };

  // ---- buildWheel（§2.2 ホイール。回転するのは rotor だけ） --------------------
  RL.Scene.buildWheel = function () {
    var C = RL.CONFIG;
    var W = C.WHEEL;

    wheelGroup = new THREE.Group();
    wheelGroup.position.set(W.X, 0.75, W.Z);
    scene.add(wheelGroup);

    // ボウル（外枠）
    var bowl = new THREE.Mesh(
      new THREE.CylinderGeometry(W.R_BOWL, W.R_BOWL + 0.02, 0.09, 64),
      new THREE.MeshStandardMaterial({ color: C.COLORS.WOOD, roughness: 0.5 })
    );
    bowl.position.set(0, 0.045, 0);
    wheelGroup.add(bowl);

    // 玉の走路
    var track = new THREE.Mesh(
      new THREE.RingGeometry(W.R_ROTOR + 0.01, W.R_TRACK + 0.02, 64),
      new THREE.MeshStandardMaterial({ color: C.COLORS.WOOD_DARK, roughness: 0.4 })
    );
    track.rotation.x = -Math.PI / 2;
    track.position.set(0, 0.091, 0);
    wheelGroup.add(track);

    // rotor（回転するのはこの Group だけ）
    rotor = new THREE.Group();
    rotor.position.set(0, 0.092, 0);
    wheelGroup.add(rotor);

    // 盤面
    var face = new THREE.Mesh(
      new THREE.CircleGeometry(W.R_ROTOR, 74),
      new THREE.MeshBasicMaterial({ map: RL.Tex.makeWheelTexture() })
    );
    face.rotation.x = -Math.PI / 2;
    face.position.set(0, 0.001, 0);
    rotor.add(face);

    // コーン
    var cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.10, 0.06, 32),
      new THREE.MeshStandardMaterial({ color: C.COLORS.WOOD, roughness: 0.4 })
    );
    cone.position.set(0, 0.03, 0);
    rotor.add(cone);

    // タレット（柱＋球）と十字の腕：共通の金属材質
    var metalMat = new THREE.MeshStandardMaterial({ color: C.COLORS.METAL, metalness: 0.6, roughness: 0.3 });

    var post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.10, 16), metalMat);
    post.position.set(0, 0.10, 0);
    rotor.add(post);

    var knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 12), metalMat);
    knob.position.set(0, 0.16, 0);
    rotor.add(knob);

    var armGeo = new THREE.BoxGeometry(0.16, 0.012, 0.012);
    var arm1 = new THREE.Mesh(armGeo, metalMat);
    arm1.position.set(0, 0.13, 0);
    rotor.add(arm1);

    var arm2 = new THREE.Mesh(armGeo, metalMat);
    arm2.position.set(0, 0.13, 0);
    arm2.rotation.y = Math.PI / 2;
    rotor.add(arm2);
  };

  // ---- buildLayout（§2.1 賭け台平面＋ドリー） ---------------------------------
  RL.Scene.buildLayout = function () {
    var C = RL.CONFIG;
    var L = C.LAYOUT;

    var plane = new THREE.Mesh(
      new THREE.PlaneGeometry(L.W, L.H),
      new THREE.MeshBasicMaterial({ map: RL.Tex.makeLayoutTexture() })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(L.CX, L.Y_PLANE, L.CZ);
    scene.add(plane);

    dollyMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.05, 16),
      new THREE.MeshStandardMaterial({ color: C.COLORS.DOLLY })
    );
    dollyMesh.position.set(0, L.Y_DOLLY + 0.025, 0);
    dollyMesh.visible = false;
    scene.add(dollyMesh);
  };

  // ---- buildBall（§2.2 玉。wheelGroup の直接の子・rotor の子にしない） ---------
  RL.Scene.buildBall = function () {
    var C = RL.CONFIG;
    var W = C.WHEEL;
    ball = new THREE.Mesh(
      new THREE.SphereGeometry(W.BALL_R, 16, 12),
      new THREE.MeshStandardMaterial({ color: C.COLORS.BALL, roughness: 0.2 })
    );
    wheelGroup.add(ball);
  };

  // ---- buildLamp（§2.4 吊りランプ） ------------------------------------------
  RL.Scene.buildLamp = function () {
    var C = RL.CONFIG;

    var lampLight = new THREE.PointLight(0xfff0d0, 8, 0, 2);
    lampLight.position.set(0, 1.75, 0);
    scene.add(lampLight);

    var shade = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.42, 0.28, 32, 1, true),
      new THREE.MeshStandardMaterial({ color: C.COLORS.LAMP, side: THREE.DoubleSide })
    );
    shade.position.set(0, 1.85, 0);
    scene.add(shade);

    var bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff4d6 })
    );
    bulb.position.set(0, 1.77, 0);
    scene.add(bulb);

    var cord = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, 1.4, 8),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    cord.position.set(0, 2.69, 0);
    scene.add(cord);
  };

  // ---- buildProps（§2.3 チップラック・グラス・予備の玉皿） --------------------
  RL.Scene.buildProps = function () {
    var C = RL.CONFIG;

    var rack = new THREE.Mesh(
      new THREE.BoxGeometry(0.30, 0.03, 0.10),
      new THREE.MeshStandardMaterial({ color: C.COLORS.RACK })
    );
    rack.position.set(0.75, 0.765, 0.45);
    scene.add(rack);

    // ラックの中のチップ ×4列（金額は見た目用の固定値。§3.3 の makeChipStack をそのまま使う）
    var rackAmounts = [800, 200, 40, 8];
    var rackOffsets = [-0.105, -0.035, 0.035, 0.105];
    for (var i = 0; i < rackAmounts.length; i++) {
      var stack = RL.Scene.makeChipStack(rackAmounts[i]);
      stack.position.set(0.75 + rackOffsets[i], 0.78, 0.45);
      scene.add(stack);
    }

    var glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.02, 0.08, 16),
      new THREE.MeshStandardMaterial({ color: C.COLORS.GLASS, transparent: true, opacity: 0.5 })
    );
    glass.position.set(1.10, 0.79, 0.35);
    scene.add(glass);

    var dish = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.035, 0.015, 24),
      new THREE.MeshStandardMaterial({ color: C.COLORS.WOOD_DARK })
    );
    dish.position.set(-0.78, 0.7575, 0.48);
    scene.add(dish);
  };

  // ---- buildCursor（§2.1 カーソルの枠・覆い） ---------------------------------
  RL.Scene.buildCursor = function () {
    var C = RL.CONFIG;
    var L = C.LAYOUT;

    cursorRing = new THREE.Mesh(
      new THREE.RingGeometry(0.025, 0.035, 32),
      new THREE.MeshBasicMaterial({ color: C.COLORS.CURSOR })
    );
    cursorRing.rotation.x = -Math.PI / 2;
    cursorRing.position.set(0, L.Y_RING, 0);
    scene.add(cursorRing);

    cursorHilite = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: C.COLORS.CURSOR, transparent: true, opacity: 0.28, depthWrite: false })
    );
    cursorHilite.rotation.x = -Math.PI / 2;
    cursorHilite.position.set(0, L.Y_HILITE, 0);
    cursorHilite.scale.set(0.001, 0.001, 1);
    scene.add(cursorHilite);
  };

  // ---- polar（角度→位置の変換はこの1関数だけを使う。§2.2） ---------------------
  RL.Scene.polar = function (r, a) {
    return new THREE.Vector3(r * Math.cos(a), 0, -r * Math.sin(a));
  };

  // ---- rotorAngle（時刻の関数。積分しない。§2.2） -----------------------------
  RL.Scene.rotorAngle = function (nowMs) {
    var C = RL.CONFIG;
    var TWO_PI = Math.PI * 2;
    return ((nowMs - tEpoch) / 1000 * C.WHEEL_SPEED) % TWO_PI;
  };

  // ---- pocketAngle（idx→盤面の中心角。§2.2） -----------------------------------
  RL.Scene.pocketAngle = function (idx) {
    var C = RL.CONFIG;
    return idx * 2 * Math.PI / C.POCKETS;
  };

  // ---- setCursor（カーソルの枠・覆いを spot に合わせる。§2.1・§5） -------------
  RL.Scene.setCursor = function (spot) {
    if (!spot) {
      if (cursorRing) cursorRing.visible = false;
      if (cursorHilite) cursorHilite.visible = false;
      return;
    }
    cursorRing.visible = true;
    cursorHilite.visible = true;

    var pos = RL.Bets.spotPos(spot);
    cursorRing.position.x = pos.x;
    cursorRing.position.z = pos.z;

    var rect = RL.Bets.rectOf(spot);
    cursorHilite.position.x = rect.cx;
    cursorHilite.position.z = rect.cz;
    cursorHilite.scale.set(Math.max(rect.w, 0.001), Math.max(rect.h, 0.001), 1);
  };

  // ---- makeChipStack（§3.3。100→25→5→1 の貪欲法で1列に積む） -------------------
  RL.Scene.makeChipStack = function (amount) {
    var C = RL.CONFIG;
    var group = new THREE.Group();
    amount = amount || 0;
    if (amount <= 0) return group;

    var denoms = [100, 25, 5, 1];
    var pieces = [];
    var rem = amount;
    for (var i = 0; i < denoms.length; i++) {
      var v = denoms[i];
      var n = Math.floor(rem / v);
      rem -= n * v;
      for (var j = 0; j < n; j++) pieces.push(v);
    }

    var GEO = C.CHIP_GEO;
    var count = Math.min(pieces.length, GEO.MAX_VISIBLE);
    var chipGeo = new THREE.CylinderGeometry(GEO.R, GEO.R, GEO.H, 24);

    for (var k = 0; k < count; k++) {
      var value = pieces[k];
      var def = C.CHIP[value];
      var tex = (RL.Tex.texCache.chip && RL.Tex.texCache.chip[value]) || null;
      var sideMat = new THREE.MeshStandardMaterial({ color: def.fill });
      var topMat = new THREE.MeshBasicMaterial({ map: tex });
      var mesh = new THREE.Mesh(chipGeo, [sideMat, topMat, sideMat]);
      mesh.position.set(0, GEO.H / 2 + GEO.H * k, 0);
      group.add(mesh);
    }
    return group;
  };

  // ---- setChips（§3.3。差分更新しない・毎回作り直す） --------------------------
  RL.Scene.setChips = function (bets, betOrder) {
    var C = RL.CONFIG;
    RL.Scene.clearChips();
    for (var i = 0; i < betOrder.length; i++) {
      var key = betOrder[i];
      var b = bets[key];
      if (!b) continue;
      var stack = RL.Scene.makeChipStack(b.amount);
      var pos = RL.Bets.spotPos(b.spot);
      stack.position.set(pos.x, C.LAYOUT.Y_CHIP, pos.z);
      scene.add(stack);
      chipStacks.push(stack);
    }
  };

  // ---- clearChips ------------------------------------------------------------
  RL.Scene.clearChips = function () {
    for (var i = 0; i < chipStacks.length; i++) {
      removeAndDispose(chipStacks[i]);
    }
    chipStacks = [];
  };

  // ---- setDolly / hideDolly（§2.1 当たり数字の印） -----------------------------
  RL.Scene.setDolly = function (n) {
    var C = RL.CONFIG;
    var center = RL.Bets.cellCenter(n);
    dollyMesh.position.set(center.x, C.LAYOUT.Y_DOLLY + 0.025, center.z);
    dollyMesh.visible = true;
  };

  RL.Scene.hideDolly = function () {
    if (dollyMesh) dollyMesh.visible = false;
  };

  // ---- startSpin（§4.4。結果が先・見た目は後。theta0 を逆算） ------------------
  RL.Scene.startSpin = function (idx, t0) {
    var C = RL.CONFIG;
    var T = C.SPIN_MS / 1000;
    var w0 = C.BALL_SPEED0;
    var aEnd = RL.Scene.rotorAngle(t0 + C.SPIN_MS);
    var theta0 = aEnd + RL.Scene.pocketAngle(idx) - (w0 * T) / 2;
    ballState = { mode: 'spin', idx: idx, t0: t0, theta0: theta0 };
  };

  // ---- restBall（§4.4。ポケットidxに乗せて rotor と一緒に回す） -----------------
  RL.Scene.restBall = function (idx) {
    ballState = { mode: 'rest', idx: idx };
  };

  // ---- render（毎フレーム実行。§2.6） -----------------------------------------
  RL.Scene.render = function () {
    var C = RL.CONFIG;
    var now = performance.now();

    if (rotor) rotor.rotation.y = RL.Scene.rotorAngle(now);

    if (ball && ballState) {
      if (ballState.mode === 'spin') {
        var T = C.SPIN_MS / 1000;
        var t = (now - ballState.t0) / 1000;
        if (t < T) {
          var w0 = C.BALL_SPEED0;
          var theta = ballState.theta0 + w0 * t - (w0 / (2 * T)) * t * t;
          var W = C.WHEEL;
          var dropStart = T - C.DROP_S;
          var r, y;
          if (t < dropStart) {
            r = W.R_TRACK;
            y = W.Y_TRACK;
          } else {
            var ratio = (t - dropStart) / C.DROP_S;
            r = W.R_TRACK + (W.R_POCKET - W.R_TRACK) * ratio;
            y = W.Y_TRACK + (W.Y_POCKET - W.Y_TRACK) * ratio;
          }
          var p = RL.Scene.polar(r, theta);
          ball.position.set(p.x, y, p.z);
        } else {
          ballState = { mode: 'rest', idx: ballState.idx };
        }
      }
      if (ballState.mode === 'rest') {
        var W2 = C.WHEEL;
        var a = RL.Scene.rotorAngle(now) + RL.Scene.pocketAngle(ballState.idx);
        var p2 = RL.Scene.polar(W2.R_POCKET, a);
        ball.position.set(p2.x, W2.Y_POCKET, p2.z);
      }
    }

    if (cursorRing) {
      var s = 1 + 0.15 * Math.sin(now / 250);
      cursorRing.scale.set(s, s, 1);
    }

    renderer.render(scene, camera);
  };

})();
