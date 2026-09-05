// roulette3d — RL.CONFIG（交換パーツ：数値・色・キー割当・名前・文言・ホイールの数字順・赤の数字・配当倍率の表）
// SPEC.md §1 の必須キーをそのまま書く。他ファイルは必ず RL.CONFIG.XXX で参照する。
window.RL = window.RL || {};

RL.CONFIG = {
  START_BALANCE: 1000,
  CHIP_VALUES: [1, 5, 25, 100],
  START_CHIP_IDX: 2,
  MAX_PER_SPOT: 500,
  POCKETS: 37,

  SPIN_MS: 6000,
  LAND_HOLD_MS: 800,
  DROP_S: 1.2,
  BALL_SPEED0: -10,
  WHEEL_SPEED: 0.6,
  CUTIN_MS: 900,

  WHEEL_ORDER: [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26],
  RED_NUMBERS: [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36],

  BET_TYPES: {
    straight: { name: "ストレートアップ", pays: 35 },
    split: { name: "スプリット", pays: 17 },
    street: { name: "ストリート", pays: 11 },
    corner: { name: "コーナー", pays: 8 },
    sixline: { name: "ダブルストリート", pays: 5 },
    dozen: { name: "ダース", pays: 2 },
    column: { name: "コラム", pays: 2 },
    low: { name: "1〜18", pays: 1 },
    even: { name: "偶数", pays: 1 },
    red: { name: "赤", pays: 1 },
    black: { name: "黒", pays: 1 },
    odd: { name: "奇数", pays: 1 },
    high: { name: "19〜36", pays: 1 }
  },

  OUTSIDE_ORDER: ["low", "even", "red", "black", "odd", "high"],

  DOZEN_NAMES: ["1st 12", "2nd 12", "3rd 12"],
  COLUMN_NAMES: ["上段(3,6…36)", "中段(2,5…35)", "下段(1,4…34)"],

  NAMES: { PLAYER: "あなた", DEALER: "かなめ" },
  COLOR_NAMES: { red: "赤", black: "黒", green: "緑" },

  START_CURSOR: { x: 10, y: 7 },

  LAYOUT: {
    CELL: 0.10, HALF: 0.05, X0: -0.42, Z0: -0.228, W: 1.40, H: 0.456,
    CX: 0.28, CZ: 0, PX: 1400, PY: 456, CELL_PX: 100, OUT_PX: 78,
    OUT1_Z: 0.339, OUT2_Z: 0.417,
    Y_PLANE: 0.7505, Y_HILITE: 0.7510, Y_RING: 0.7515, Y_CHIP: 0.7520, Y_DOLLY: 0.752
  },

  WHEEL: {
    X: -0.78, Z: 0, R_BOWL: 0.36, R_ROTOR: 0.29, R_TRACK: 0.33, R_POCKET: 0.245,
    Y_TRACK: 0.075, Y_POCKET: 0.04, BALL_R: 0.012, TEX: 1024
  },

  CAMERA: { POS: [-0.06, 1.80, 1.10], LOOK: [-0.06, 0.75, -0.05], FOV: 45 },

  COLORS: {
    BG: 0x0b0b12, FELT: 0x1f6b3a, RAIL: 0x3a2418, LEG: 0x2a2a2a,
    WOOD: 0x6b3e1e, WOOD_DARK: 0x4a2a12, METAL: 0xd0d0d0, BALL: 0xf5f5f5,
    CURSOR: 0xffd54f, DOLLY: 0xf5f5f5, LAMP: 0x1d3a2a, RACK: 0x2b2b2b, GLASS: 0x9ad0ff
  },

  LAYOUT_TEX: {
    FELT: "#1f6b3a", RED: "#b3202b", BLACK: "#1c1c1c", GREEN: "#0a7a3a",
    LINE: "#f2f2f2", TEXT: "#ffffff",
    FONT: "bold 56px 'Segoe UI', Arial, sans-serif",
    FONT_OUT: "bold 40px 'Segoe UI', Arial, sans-serif"
  },

  WHEEL_TEX: {
    RED: "#b3202b", BLACK: "#1c1c1c", GREEN: "#0a7a3a", RIM: "#c69a5a",
    HUB: "#8a5a2b", LINE: "#e8d8b0", TEXT: "#ffffff", FONT: "bold 40px Arial"
  },

  CHIP: {
    100: { fill: "#212121", text: "#ffffff" },
    25: { fill: "#2e7d32", text: "#ffffff" },
    5: { fill: "#c62828", text: "#ffffff" },
    1: { fill: "#f0f0f0", text: "#222222" }
  },

  CHIP_GEO: { R: 0.02, H: 0.005, MAX_VISIBLE: 12 },

  KEYS: {
    OK: ["KeyZ", "Enter", "Space"],
    CANCEL: ["KeyX", "Escape"],
    LEFT: ["ArrowLeft"],
    RIGHT: ["ArrowRight"],
    UP: ["ArrowUp"],
    DOWN: ["ArrowDown"],
    SPIN: ["KeyS"],
    CHIP_UP: ["KeyC"],
    CHIP_DOWN: ["KeyV"],
    CHIP_1: ["Digit1"],
    CHIP_2: ["Digit2"],
    CHIP_3: ["Digit3"],
    CHIP_4: ["Digit4"],
    HELP: ["KeyH"],
    FREEPLAY: ["KeyN"],
    TUTORIAL: ["KeyT"]
  },

  UI: { HUD_W: 1280, HUD_H: 720, HISTORY_N: 8, BETS_ROWS: 8, CURSOR_COLOR: "#ffd54f" },

  CUTIN: { WIN: "rgba(30,136,229,0.85)", BIGWIN: "rgba(255,179,0,0.85)", BIGWIN_MIN: 1000 },

  TEXT: {
    PHASE: {
      idle: "準備中", betting: "賭け受付中", spinning: "回転中", result: "結果",
      round_end: "結果", complete: "完了", gameover: "ゲームオーバー"
    },
    MSG: {
      placed: "{spot} に {v}",
      removed: "{spot} の賭けを取り消し",
      undo: "最後の賭けを取り消し",
      spin: "玉を回しました",
      nobet: "賭け無しで回しました",
      win: "{n} {color}！ 配当 +{pay}",
      lose: "{n} {color}。外れ",
      nomoney: "チップが足りません",
      maxbet: "このマスの上限は {max}",
      gameover: "残高 0。Z で 1000 から再開",
      yourturn: "賭けてください（S で回す）"
    },
    KEYS_LINE: "←→↑↓ 移動　Z 置く　X 取消　C/V チップ額　S 回す　H 配当表",
    NEXT: "Z / Enter で次へ",
    EV: "期待値はどの賭けも 36/37 = 97.3%（控除 2.7%）"
  }
};
