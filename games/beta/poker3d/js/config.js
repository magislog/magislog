// PK.CONFIG — 数値・色・キー割当・名前をここに集約する（交換パーツ）。
// scene.js / game.js / ui.js / tutorial.js / cards.js / hand_eval.js / ai.js は
// ここから読むだけで、数値を直書きしない（SPEC.md §0 実装順・機械と交換パーツの分離方針）。
window.PK = window.PK || {};

PK.CONFIG = {

  // ===== §1 必須キー（そのままの名前・値） =====
  START_STACK: 1000,
  SB: 10,
  BB: 20,
  CPU_DELAY_MS: 900,
  STREET_PAUSE_MS: 700,
  RUNOUT_PAUSE_MS: 700,
  SHOWDOWN_HOLD_MS: 4000,
  DEAL_MS: 250,
  DEAL_GAP_MS: 120,
  NAMES: ["あなた", "かなめ", "そら", "ひかり"],
  AGGR: [0, 0.9, 1.2, 1.0],
  CHIP: { 500: 0x6a1b9a, 100: 0x212121, 25: 0x2e7d32, 5: 0xc62828, 1: 0xf0f0f0 },

  // ===== §2.1 座席（4席 = 人間1 + CPU3） =====
  // dir = (cos a, 0, sin a)。angleDeg は表の「角度 a」（度）。
  SEATS: [
    { seat: 0, name: "あなた", angleDeg: 90,  dir: [0, 0, 1],  screen: "手前（カメラ側）" },
    { seat: 1, name: "かなめ", angleDeg: 180, dir: [-1, 0, 0], screen: "左" },
    { seat: 2, name: "そら",   angleDeg: 270, dir: [0, 0, -1], screen: "奥" },
    { seat: 3, name: "ひかり", angleDeg: 0,   dir: [1, 0, 0],  screen: "右" }
  ],

  // 各 seatGroup 内のローカル配置（全席共通）。
  // rotation.y = Math.PI/2 - a（a はラジアン）は scene.js 側の計算。
  SEAT_LOCAL: {
    // 手札1・2（CPU・伏せ）
    HOLE_CPU_POS: [[-0.07, 0.775, 1.10], [0.07, 0.775, 1.10]],
    HOLE_CPU_ROT_X_DOWN: "PI/2",       // 裏が上（文字列は scene.js 側で Math.PI 系に変換する式の目印）
    HOLE_CPU_ROT_X_SHOWDOWN: "-PI/2",  // ショーダウンで表が上に切替
    // 手札1・2（seat0・起こして持つ）
    HOLE_SEAT0_POS: [[-0.07, 0.86, 1.30], [0.07, 0.86, 1.30]],
    HOLE_SEAT0_ROT_X: "-PI/6",         // 表がカメラを向く
    // ベット済みチップ・持ちチップ・ディーラーボタン
    BET_CHIPS_POS: [0, 0.772, 0.62],
    STACK_CHIPS_POS: [0.35, 0.772, 1.15],
    DEALER_BUTTON_POS: [0.30, 0.776, 0.90],
    // 椅子（seat 1,2,3）座面中心
    CHAIR_SEAT_CENTER: [0, 0.45, 2.10]
  },

  // ===== §2.2 卓・共有物 =====
  TABLE: {
    FELT: {
      cylinder: [1.50, 1.50, 0.04, 64],
      color: 0x1f6b3a, roughness: 0.95,
      pos: [0, 0.75, 0], topY: 0.77
    },
    RAIL: {
      torus: [1.55, 0.09, 16, 64],
      color: 0x3a2418, roughness: 0.6,
      pos: [0, 0.77, 0], rotX: "PI/2"
    },
    BET_LINE: {
      ring: [0.95, 0.97, 64],
      color: 0xd8c27a,
      pos: [0, 0.7715, 0], rotX: "-PI/2"
    },
    LEG: {
      cylinder: [0.35, 0.50, 0.73, 32],
      color: 0x2a2a2a,
      pos: [0, 0.365, 0]
    },
    DECK: {
      box: [0.12, 0.016, 0.168],
      sideColor: 0xeeeeee,       // 材質配列の裏テクスチャ以外5面
      pos: [0.60, 0.778, 0.15]
    },
    BOARD_CARDS: {
      xs: [-0.26, -0.13, 0, 0.13, 0.26],
      y: 0.775, z: 0, rotX: "-PI/2"
    },
    POT_CHIPS_POS: [0, 0.772, -0.32]
  },

  // ===== §2.3 椅子（seat 1,2,3） =====
  CHAIR: {
    color: 0x4a3020, roughness: 0.8,
    SEAT: { box: [0.45, 0.08, 0.45], pos: [0, 0.45, 2.10] },
    BACK: { box: [0.45, 0.50, 0.06], pos: [0, 0.74, 2.30] },
    // 脚×4: (±0.19, 0.205, 2.10 ± 0.19)
    LEG: { cylinder: [0.02, 0.02, 0.41, 8], offsetX: 0.19, y: 0.205, baseZ: 2.10, offsetZ: 0.19 }
  },

  // ===== §2.4 照明・床・背景・吊りランプ（影は使わない） =====
  SHADOW_ENABLED: false,
  BG_COLOR: 0x0b0b12,
  FLOOR: {
    plane: [20, 20],
    canvas: 512,
    checkerA: "#3a2b2b", checkerB: "#332525", cell: 64,
    repeat: [6, 6]
  },
  AMBIENT_LIGHT: { color: 0xffffff, intensity: 1.0 },
  LAMP_LIGHT: { color: 0xfff0d0, intensity: 10, distance: 0, decay: 2, pos: [0, 1.95, 0] },
  FILL_LIGHT: { color: 0xbfc8ff, intensity: 2.0, pos: [3, 6, 5], targetPos: [0, 0, 0] },
  LAMP_SHADE: {
    cylinder: [0.12, 0.42, 0.28, 32, 1, true],
    color: 0x1d3a2a, doubleSide: true,
    pos: [0, 2.05, 0]
  },
  LAMP_BULB: { sphere: [0.06, 16, 12], color: 0xfff4d6, pos: [0, 1.97, 0] },
  LAMP_CORD: { cylinder: [0.01, 0.01, 1.4, 8], color: 0x111111, pos: [0, 2.89, 0] },

  // ===== §2.5 カメラ・レンダラ（固定・操作なし） =====
  CAMERA: { fov: 45, near: 0.1, far: 50, pos: [0, 2.5, 3.4], lookAt: [0, 0.75, 0] },
  RENDERER: { antialias: true, maxPixelRatio: 2 },

  // ===== §2.6 アニメーション =====
  // 配りアニメの開始位置。§2.2 の山札位置(0.778)とはyが僅かに異なるが、原文どおり別値として持つ。
  DEAL_FROM_POS: [0.60, 0.79, 0.15],

  // ===== §3.1 カード（PK.Cards が使う） =====
  CARD: {
    // 文字列コード用（"As" "Td" の形。r:2..14, 10=T)。2-9はString(r)のまま・10だけ"T"。
    CODE_RANK_CHAR: { 10: "T", 11: "J", 12: "Q", 13: "K", 14: "A" },
    SUITS: ["s", "h", "d", "c"],
    plane: [0.12, 0.168],
    faceZ: 0.0004, backZ: -0.0004,
    rotX_faceUp: "-PI/2", rotX_backUp: "PI/2",
    texture: {
      w: 256, h: 358,
      borderColor: "#444444", borderWidth: 6, borderRect: [3, 3, 250, 352],
      redColor: "#d01c1c", blackColor: "#111111",
      font: "'Segoe UI Symbol', Arial, sans-serif",
      cornerRankSize: 64, cornerRankPos: [18, 70],
      cornerSuitSize: 56, cornerSuitPos: [18, 130],
      centerSuitSize: 150, centerSuitPos: [128, 190],
      rankChars: { 11: "J", 12: "Q", 13: "K", 14: "A" }, // 2-9,10 はそのまま/"10"
      suitUnicode: { s: "♠", h: "♥", d: "♦", c: "♣" },
      suitColor: { s: "black", c: "black", h: "red", d: "red" }
    },
    backTexture: {
      w: 256, h: 358,
      bgColor: "#1c3f95",
      borderColor: "#ffffff", borderWidth: 8, borderRect: [14, 14, 228, 330],
      clipRect: [18, 18, 220, 322],
      lineColor: "rgba(255,255,255,0.25)", lineWidth: 2, lineAngleDeg: 45, lineGap: 16
    }
  },

  // ===== §3.2 チップ・ディーラーボタン =====
  CHIP_GEO: {
    cylinder: [0.03, 0.03, 0.006, 24], roughness: 0.5,
    denoms: [500, 100, 25, 5, 1],      // 貪欲法の順（大きい額面が左）
    colWidth: 0.07, maxPerCol: 20,
    yBase: 0.003, yStep: 0.006
  },
  DEALER_BUTTON_GEO: {
    cylinder: [0.045, 0.045, 0.012, 24],
    sideColor: 0xf5f5f5, bottomColor: 0xf5f5f5,
    topCanvas: 128, topText: "D", topFont: "bold 90px Arial", topBg: "#ffffff", topTextColor: "#000000"
  },

  // ===== §5 役の判定（PK.Eval が使う名前・表示） =====
  HAND: {
    // cat: 名前（§5表）。name() は cat が 2,3,4,7,8 のとき「（rankChar(tb[0])）」を付ける。
    CAT_NAME: {
      10: "ロイヤルストレートフラッシュ",
      9: "ストレートフラッシュ",
      8: "フォーカード",
      7: "フルハウス",
      6: "フラッシュ",
      5: "ストレート",
      4: "スリーカード",
      3: "ツーペア",
      2: "ワンペア",
      1: "ハイカード"
    },
    CAT_SHOW_RANK: [2, 3, 4, 7, 8], // このcatだけ名前に（rankChar(tb[0])）を付ける
    RANK_CHAR: { 11: "J", 12: "Q", 13: "K", 14: "A" } // 2-10はそのまま数字文字列（10は"10"）
  },

  // ===== §6 CPU の打ち方（PK.AI が使う数値） =====
  AI: {
    // プリフロップ Chen式
    CHEN: {
      HIGH_VALUE: { 14: 10, 13: 8, 12: 7, 11: 6 }, // A,K,Q,J。それ以外は r/2
      PAIR_MULT: 2, PAIR_MIN: 5,
      SUITED_BONUS: 2,
      GAP_PENALTY: { 0: 0, 1: -1, 2: -2, 3: -4 }, GAP_PENALTY_DEFAULT: -5, // gap>=4
      STRAIGHT_GAP_MAX: 1, STRAIGHT_UNDER_RANK: 12, STRAIGHT_BONUS: 1 // gap<=1 かつ両方Q(12)未満 → +1
    },
    PREFLOP: {
      RAISE_MIN: 10,      // score >= 10 → RAISE
      CALL_MID_MIN: 7,    // 7 <= score < 10 → CALL
      CALL_LOW_MIN: 5,    // 5 <= score < 7 → toCallが小さければCALL
      CALL_LOW_MAX_TOCALL_BB: 2, // toCall <= 2*BB
      RAISE_MIN_BB: 2     // RAISE合計 = currentBet + max(minRaise, 2*BB)
    },
    // ポストフロップ strength テーブル（§6表・上から順に最初に当たる行）
    STRENGTH: {
      CAT_STRAIGHT_UP_MIN: 5, STRAIGHT_UP: 0.95,   // cat >= 5
      CAT_TRIPS: 4, TRIPS: 0.80,                    // cat 4
      CAT_TWO_PAIR: 3, TWO_PAIR: 0.70,               // cat 3
      CAT_PAIR: 2,
      TOP_PAIR: 0.60,     // cat2 かつ ペアランク >= 盤面最高ランク
      WEAK_PAIR: 0.45,    // cat2 それ以外
      DRAW: 0.45,         // 同スート4枚 or 連続4ランク（holeを1枚以上含む）
      OVERCARDS: 0.30,    // hole2枚とも盤面の全カードより高い
      NOTHING: 0.15
    },
    POSTFLOP: {
      HALF_POT_MIN_BB: 1,          // half = pot/2 を BBの倍数へ切り上げ、最低BB
      CHECK_TOCALL0_STRENGTH_MIN: 0.60, CHECK_TOCALL0_BET_PROB: 0.8,
      BLUFF_STRENGTH_MAX: 0.30, BLUFF_BET_PROB: 0.08,
      RAISE_STRENGTH_MIN: 0.80, RAISE_PROB: 0.7,
      CALL_POTODDS_MARGIN: 0.10,
      FOLD_BUT_CALL_PROB: 0.05
    },
    WOBBLE: { LOOSEN_PROB: 0.10, TIGHTEN_PROB: 0.10 },
    AGGR_CAP: 0.95
  },

  // ===== §7 キー割り当て =====
  KEYS: {
    CONFIRM: ["KeyZ", "Enter", "Space"],
    BACK: ["KeyX", "Escape"],
    LEFT: "ArrowLeft", RIGHT: "ArrowRight",
    UP: "ArrowUp", DOWN: "ArrowDown",
    FOLD: "KeyF", CHECKCALL: "KeyC", RAISEBET: "KeyR", ALLIN: "KeyA",
    HELP: "KeyH", FREEPLAY: "KeyN", TUTORIAL_RESTART: "KeyT",
    REPEATABLE: ["ArrowUp", "ArrowDown"] // e.repeat を受け付けるのはこの2つだけ
  },
  RAISE_STEP_BB: 1, // ↑↓ でレイズ/ベット合計額を ±BB

  // ===== §8 画面のUI（DOMオーバーレイ） =====
  STAGE: { w: 1280, h: 720 },
  UI_COMMON: {
    bg: "rgba(0,0,0,0.55)", radius: 6, color: "#fff",
    font: '"Segoe UI", Meiryo, sans-serif', fontSize: 16
  },
  UI_LAYOUT: {
    street:   { left: 20,   top: 16,  w: 260, h: 36 },
    pot:      { left: 520,  top: 16,  w: 240, h: 40 },
    board:    { left: 484,  top: 64,  w: 312, h: 78 },
    msg:      { left: 340,  top: 150, w: 600, h: 36 },
    p2:       { left: 540,  top: 196, w: 200, h: 64 }, // そら
    p1:       { left: 40,   top: 300, w: 200, h: 64 }, // かなめ
    p3:       { left: 1040, top: 300, w: 200, h: 64 }, // ひかり
    tut:      { left: 40,   top: 384, w: 400, h: 160 },
    handname: { left: 40,   top: 556, w: 200, h: 24 },
    herocards:{ left: 40,   top: 584, w: 190, h: 118 },
    p0:       { left: 240,  top: 600, w: 200, h: 80 }, // あなた
    actions:  { left: 840,  top: 584, w: 420, h: 120 },
    cutin:    { left: 0,    top: 280, w: 1280, h: 160 },
    help:     { left: 340,  top: 120, w: 600, h: 480 },
    hint:     { left: 1080, top: 690, w: 180, h: 24 }
  },
  UI_BOARD_CARD: { w: 56, h: 78, gap: 8, hiddenBorder: "1px dashed rgba(255,255,255,0.25)" },
  UI_HERO_CARD: { w: 84, h: 118, gap: 12 },
  UI_ACTION_BTN: { w: 96, h: 48, gap: 8, max: 4 },
  UI_SELECT_BORDER: { width: 3, color: "#ffd54f" },
  UI_DISALLOWED_OPACITY: 0.35,
  UI_TURN_BORDER: { width: 2, color: "#ffd54f" },
  UI_BADGE: { dealer: { color: "#ffd54f", textColor: "#000" }, sbbb: { color: "#42a5f5" } },
  UI_CUTIN: {
    fontSize: 72,
    allin:  { text: "ALL IN!", bg: "rgba(200,30,30,0.85)" },
    win:    { text: "YOU WIN", bg: "rgba(30,136,229,0.85)" },
    hand:   { bg: "rgba(255,179,0,0.85)" }, // 役名（フルハウス以上で勝ったとき）
    slideFrom: -1280, inMs: 250, holdMs: 900, outMs: 250
  },
  UI_HINT_TEXT: "H: キー一覧",
  UI_TUT_WAIT_TEXT: "Z / Enter で次へ",
  UI_TUT_WAIT_COLOR: "#ffd54f",
  UI_TUT_FONT_SIZE: 18,
  UI_MSG_FONT_SIZE: 18,
  UI_POT_FONT_SIZE: 20,
  UI_HANDNAME_FONT_SIZE: 16

};
