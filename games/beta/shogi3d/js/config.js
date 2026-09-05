var SG = (typeof window !== 'undefined') ? (window.SG = window.SG || {}) : (global.SG = global.SG || {});

SG.CONFIG = {
  CELL: 60,
  BOARD_LEFT: 370,
  BOARD_TOP: 30,
  CPU_DELAY_MS: 600,
  WATCHDOG_MS: 3000,
  MAX_PLY: 400,

  NAMES: { 0: "あなた", 1: "かなめ" },

  GLYPH: { K: ["玉", "王"], R: "飛", B: "角", G: "金", S: "銀", N: "桂", L: "香", P: "歩" },
  GLYPH_PROMOTED: { R: "竜", B: "馬", S: "全", N: "圭", L: "杏", P: "と" },

  HAND_ORDER: ["R", "B", "G", "S", "N", "L", "P"],

  VALUE: { P: 1, L: 3, N: 3, S: 5, G: 6, B: 8, R: 10, K: 0 },
  VALUE_PROMOTED: { P: 6, L: 6, N: 6, S: 6, B: 12, R: 13 },

  COLOR: {
    board: "#f0c060",
    line: "#5a3a1a",
    piece: "#f5deb3",
    pieceText: "#111111",
    promoted: "#c62828",
    cursor: "#ffd54f",
    selected: "rgba(255,213,79,0.55)",
    target: "rgba(66,165,245,0.45)",
    last: "rgba(255,152,0,0.35)",
    hint: "#42a5f5"
  }
};
