var FM = (typeof window !== 'undefined') ? (window.FM = window.FM || {}) : (global.FM = global.FM || {});

// FM.CONFIG: 数値・色・キー割当・名前・文言・マップ文字列（交換パーツはここだけ）
// SPEC.md §1 / §2 の値をそのまま使う。ここに無い値を他ファイルへ直書きしない。
FM.CONFIG = {
  COLS: 20,
  ROWS: 15,
  TILE: 48,
  MAP_LEFT: 0,
  MAP_TOP: 0,
  STAGE_W: 1280,
  STAGE_H: 720,

  STAMINA_MAX: 100,
  COST: { till: 5, water: 2, sow: 0, harvest: 3 },

  TICK_MS: 100,
  CHICKEN_STEP_MS: 800,
  CHICKEN_MOVE_P: 0.5,
  EGG_CAP: 6,
  SLEEP_MS: 900,
  WATCHDOG_MS: 3000,
  RETRY_MS: 300,

  CROP_ORDER: ['turnip', 'potato', 'corn'],

  CROPS: {
    turnip: { name: "かぶ", seedPrice: 30, sellPrice: 60 },
    potato: { name: "じゃがいも", seedPrice: 50, sellPrice: 110 },
    corn: { name: "とうもろこし", seedPrice: 80, sellPrice: 180 }
  },

  EGG_PRICE: 40,
  EGG_NAME: "たまご",

  STAGES: 4,
  STAGE_NAMES: ["たね", "め", "わかい", "みのり"],

  TOOLS: [
    { id: 'hoe', name: "くわ" },
    { id: 'can', name: "じょうろ" },
    { id: 'seed', name: "たね" },
    { id: 'basket', name: "かご（収穫）" }
  ],

  DIRS: ['up', 'down', 'left', 'right'],
  DELTA: {
    up: { dr: -1, dc: 0 },
    down: { dr: 1, dc: 0 },
    left: { dr: 0, dc: -1 },
    right: { dr: 0, dc: 1 }
  },

  LEGEND: {
    F: 'fence',
    G: 'grass',
    S: 'soil',
    W: 'water',
    P: 'path',
    H: 'house',
    D: 'door',
    B: 'barn',
    X: 'ship',
    T: 'shop'
  },

  WALKABLE: ['grass', 'soil', 'path'],
  OBJECTS: ['door', 'shop', 'ship'],

  MAP: [
    "FFFFFFFFFFFFFFFFFFFF",
    "FGGHHHHGGGGGGFBBBGGF",
    "FGGHHHHGGGGGGFBBBGGF",
    "FGGHDHHGGGGGGFGGGGGF",
    "FGTPPPPXGGGGGFGGGGGF",
    "FGGGPGGGGGGGGFGGGGGF",
    "FGGGPGGGGGGGGFGGGGGF",
    "FGGGPGGGGGGGGFFFPFFF",
    "FGGGPGGGGGGGGGGGPGGF",
    "FGGGPGGGGGGGGGWWWWGF",
    "FGGGPGGGGGGGGGWWWWGF",
    "FGGGPGGGGGGGGGWWWWGF",
    "FGGGPGGGGGGGGGGGGGGF",
    "FGGGGGGGGGGGGGGGGGGF",
    "FFFFFFFFFFFFFFFFFFFF"
  ],

  SPAWN: { r: 4, c: 4, dir: 'down' },
  FIELD: { r0: 5, c0: 5, r1: 12, c1: 12 },
  PEN: { r0: 3, c0: 14, r1: 6, c1: 18 },

  CHICKENS: [
    { r: 4, c: 15 },
    { r: 5, c: 17 }
  ],

  START: { money: 100, seeds: { turnip: 5, potato: 0, corn: 0 }, day: 1 },

  NAMES: { title: "牧場 β", sub: "マインクラフト × 牧場物語（2D タイル）" },

  REASON_TEXT: {
    already_soil: "ここはもう耕してあります",
    has_crop: "作物があるので耕せません",
    cannot_till: "ここは耕せません（草地だけ）",
    already_wet: "もう水をやってあります",
    cannot_water: "ここには水をやれません（耕した土だけ）",
    need_soil: "先に くわ で耕してください",
    occupied: "もう植えてあります",
    no_seed: "たねがありません（店で買えます）",
    not_ripe: "まだ実っていません",
    nothing_to_harvest: "収穫するものがありません",
    nothing_to_ship: "出荷するものがありません",
    no_money: "お金が足りません",
    none: "ここには何もできません"
  },

  COLOR: {
    bg: "#15151a", stage: "#2b2b33", panel: "rgba(0,0,0,0.45)",
    grass: "#6abe4a", grassDot: "#4fa338", flower: "#ff8fb3", pebble: "#9a9a9a",
    soil: "#8b5a2b", soilWet: "#5a381a", ridge: "#6e4520",
    water: "#3f8fd6", wave: "#6fb1ea",
    path: "#d9b46a", pathDot: "#c39d55",
    fence: "#8a5a2b",
    house: "#c8a064", roof: "#b03a2e", door: "#5a3a1a", doorMark: "#e53935",
    barn: "#a0522d", barnRoof: "#7a2f2a",
    ship: "#7a4a1a", shipLid: "#a86f2f", shipFull: "#ffd54f",
    shop: "#c8a064", shopSign: "#ffd54f",
    player: "#3b6bd6", skin: "#f1c27d", legs: "#5a3a1a", face: "#222222",
    chicken: "#ffffff", comb: "#e53935", beak: "#ff9800", eye: "#222222",
    egg: "#fff6e0", eggEdge: "#999999",
    seedDot: "#3a2a1a", sprout: "#3c9d3c", leaf: "#2e8b3e",
    turnip: "#f4f4f4", turnipTop: "#3c9d3c", potato: "#b07a3a", corn: "#ffd54f", stalk: "#3c9d3c", ripe: "#ffd54f",
    target: "#ffd54f", hint: "#42a5f5",
    stamina: "#4caf50", staminaLow: "#e53935",
    select: "rgba(255,213,79,0.3)",
    band: "rgba(20,40,90,0.9)", bandEdge: "#7aa7ff",
    text: "#ffffff"
  }
};
