// MJ.CONFIG — 数値・色・キー割当・名前をここに集約する（交換パーツ）。
// scene.js / game.js / ui.js / tutorial.js / tiles.js / win.js / score.js / ai.js は
// ここから読むだけで、数値を直書きしない（SPEC.md §0 実装順・機械と交換パーツの分離方針）。
window.MJ = window.MJ || {};

MJ.CONFIG = {

  // ===== §1 必須キー（そのままの名前・値）SPEC 51-63 =====
  START_POINTS: 25000,
  RIICHI_COST: 1000,
  ROUNDS: 4,
  DRAWS_PER_ROUND: 70,
  DEAD_WALL: 14,
  ROUND_START_MS: 1500,
  CPU_DELAY_MS: 700,
  DISCARD_PAUSE_MS: 350,
  WIN_HOLD_MS: 600,
  DEAL_MS: 200,
  DEAL_GAP_MS: 40,
  NAMES: ["あなた", "かなめ", "そら", "ひかり"],
  WIND_NAMES: ["東", "南", "西", "北"],
  TILE: { W: 0.024, H: 0.032, D: 0.018, GAP: 0.002 },
  HAND_Z: 0.30,
  RIVER_Z0: 0.09,
  RIVER_ROW_GAP: 0.035,
  RIVER_COLS: 6,
  WALL_Z: 0.20,
  STICK_Z: 0.055,
  COLORS: {
    BG: 0x0b0b12,
    FELT: 0x1f6b3a,
    RAIL: 0x3a2418,
    LEG: 0x2a2a2a,
    CHAIR: 0x4a3020,
    TILE_BACK: 0x2e8b57,
    TILE_SIDE: 0xf3ecd8,
    CUP: 0x3b6e8f,
    LAMP: 0x1d3a2a
  },
  FACE: {
    BG: "#fdf6e3",
    FRAME: "#8c7a5a",
    MAN: "#1a1a1a",
    MAN_RED: "#c62828",
    PIN_BLUE: "#1e4e9c",
    PIN_RED: "#c62828",
    PIN_GREEN: "#2e7d32",
    SOU_GREEN: "#2e7d32",
    SOU_RED: "#c62828",
    HONOR: "#1a1a1a",
    HAKU: "#1e4e9c",
    HATSU: "#2e7d32",
    CHUN: "#c62828",
    FONT: "'Yu Mincho', 'MS Mincho', serif"
  },
  KEYS: {
    OK: ["KeyZ", "Enter", "Space"],
    CANCEL: ["KeyX", "Escape"],
    LEFT: ["ArrowLeft"],
    RIGHT: ["ArrowRight"],
    WIN: ["KeyA"],
    RIICHI: ["KeyR"],
    HELP: ["KeyH"],
    FREEPLAY: ["KeyN"],
    TUTORIAL: ["KeyT"]
  },
  UI: {
    HUD_W: 1280,
    HUD_H: 720,
    TILE_IMG_W: 56,
    TILE_IMG_H: 78,
    HAND_GAP: 4,
    TSUMO_GAP: 16,
    CURSOR_LIFT: 12,
    CURSOR_COLOR: "#ffd54f"
  },
  CUTIN: {
    RIICHI: "rgba(200,120,0,0.85)",
    TSUMO: "rgba(30,136,229,0.85)",
    RON: "rgba(200,30,30,0.85)",
    RYUKYOKU: "rgba(90,90,90,0.85)"
  }

};
