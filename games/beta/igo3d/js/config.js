var IG = (typeof window !== 'undefined') ? (window.IG = window.IG || {}) : (global.IG = global.IG || {});

// IG.CONFIG — 数値・色・名前・文言（交換パーツ）。SPEC.md §1 の必須キーのみ。
// 他ファイル（rules.js / ai.js / game.js / ui.js / tutorial.js / input.js）はここの値を参照し、
// 数値・文字・色を直書きしない（SPEC.md §10.6）。

IG.CONFIG = {
  SIZE: 9,
  CELL: 60,
  MARGIN: 30,
  BOARD_LEFT: 370,
  BOARD_TOP: 30,
  STONE: 54,
  KOMI: 6.5,
  CPU_DELAY_MS: 600,
  WATCHDOG_MS: 3000,
  MAX_PLY: 200,

  NAMES: { 1: "あなた", 2: "そら" },
  COLOR_NAMES: { 1: "黒", 2: "白" },

  // 列の文字。囲碁の慣例で I を飛ばす（9 文字 = SIZE と一致）
  COLS: "ABCDEFGHJ",

  // 星の [r,c]。C7・G7・E5・C3・G3
  STARS: [[2, 2], [2, 6], [4, 4], [6, 2], [6, 6]],

  AI: {
    CAPTURE: 10,
    ATARI: 4,
    SELF_ATARI: -8,
    EYE_FILL: -30,
    LIBERTY: 0.5,
    LIBERTY_CAP: 4,
    CENTER: 0.25,
    PASS_BELOW: -5,
    PASS_AFTER_PASS_BELOW: 4
  },

  REASON_TEXT: {
    outside: "盤の外です",
    occupied: "そこには石があります",
    ko: "コウです。今はそこへ打てません",
    suicide: "そこには打てません（自殺手）",
    invalid: "その手は受け付けられません"
  },

  COLOR: {
    board: "#e8c37a",
    line: "#4a3218",
    star: "#4a3218",
    black: "#111111",
    white: "#f4f4f4",
    whiteEdge: "#8a8a8a",
    dotOnBlack: "#f4f4f4",
    dotOnWhite: "#111111",
    cursor: "#ffd54f",
    ko: "#e53935",
    hint: "#42a5f5",
    terrBlack: "rgba(0,0,0,0.55)",
    terrWhite: "rgba(255,255,255,0.85)"
  }
};
