var FD = (typeof window !== 'undefined') ? (window.FD = window.FD || {}) : (global.FD = global.FD || {});

// FD.CONFIG — 交換パーツ（数値・色・銘柄・業種・ニュース文・文言）はここだけに置く。
// 他の js ファイルに数値・文字列を直書きしない（SPEC.md §1・§10.6）。
FD.CONFIG = {
  STAGE_W: 1280,
  STAGE_H: 720,

  START_CASH: 10000000,
  DAYS: 30,
  WARMUP: 19,
  CHART_DAYS: 20,

  FEE_PER_MILLE: 1,      // 手数料 = 代金の 1‰ = 0.1%
  MAX_MOVE_BP: 1500,     // 1 日の値動きの上限 ±15%
  MIN_PRICE: 1,

  PCT_MIN: 10,
  PCT_MAX: 90,
  PCT_STEP: 10,
  PCT_DEFAULT: 10,

  LOG_MAX: 40,
  LOG_SHOW: 8,
  TICK_MS: 500,
  RECOVER_LIMIT: 3,

  SECTOR_ORDER: ['tech', 'food', 'energy'],

  SECTORS: {
    tech:   { name: "IT",       drift: 15, vol: 400 },
    food:   { name: "食品",     drift: 5,  vol: 150 },
    energy: { name: "エネルギー", drift: 0,  vol: 300 }
  },

  // price は 20 日前の値（1 日目の値は warm-up 後。SPEC.md §1・§3.4）
  STOCKS: [
    { id: 'nova', ticker: "NOVA", name: "ノヴァ電子",   sector: 'tech',   price: 2400 },
    { id: 'qbit', ticker: "QBIT", name: "キュービット", sector: 'tech',   price: 1200 },
    { id: 'mogu', ticker: "MOGU", name: "もぐもぐ食品", sector: 'food',   price: 800 },
    { id: 'haru', ticker: "HARU", name: "はるか製菓",   sector: 'food',   price: 500 },
    { id: 'solr', ticker: "SOLR", name: "ソラリス電力", sector: 'energy', price: 1500 },
    { id: 'petr', ticker: "PETR", name: "ペトラ石油",   sector: 'energy', price: 3000 }
  ],

  NEWS_TYPES: ['boom', 'bust', 'rumor', 'macro', 'calm'],

  // 合計 100（SPEC.md §5.2）
  NEWS_WEIGHTS: [['boom', 25], ['bust', 25], ['rumor', 20], ['macro', 15], ['calm', 15]],

  NEWS_BP: { boom: 600, bust: 600, rumor: 300, macro: 200, calm: 0 },

  // type → sector（または up/down/calm）で引く（SPEC.md §5.4）
  NEWS_TEXT: {
    boom: {
      tech:   "IT 各社が好決算を発表。半導体の需要が急増している。",
      food:   "猛暑で飲料と菓子の売上が急伸。食品各社が上方修正。",
      energy: "原油価格が急騰。電力・石油の収益改善が見込まれる。"
    },
    bust: {
      tech:   "大手 IT で大規模なシステム障害。IT 株に売りが広がる。",
      food:   "原材料費が高騰。食品各社の利益が圧迫される見通し。",
      energy: "エネルギー需要が急減。電力・石油に売りが出ている。"
    },
    rumor: {
      tech:   "IT 業界で大型再編のうわさ。真偽は不明。",
      food:   "食品大手に買収のうわさ。真偽は不明。",
      energy: "新油田が見つかったといううわさ。真偽は不明。"
    },
    macro: {
      up:   "景気指標が改善。市場全体に買いが広がる見込み。",
      down: "景気後退の懸念。市場全体に売りが広がる見込み。"
    },
    calm: {
      calm: "特に材料なし。市場は様子見。"
    }
  },

  EFFECT_TEXT: {
    boom: "上がりやすい（大）",
    bust: "下がりやすい（大）",
    rumor: "上下どちらか（中）",
    macro_up: "全銘柄が上がりやすい（小）",
    macro_down: "全銘柄が下がりやすい（小）",
    calm: "影響なし"
  },

  TYPE_NAME: { boom: "好材料", bust: "悪材料", rumor: "うわさ", macro: "景気", calm: "材料なし" },

  TUTORIAL: { SEED: 7, FIRST_NEWS: { type: 'boom', sector: 'tech', dir: 1 } },

  NAMES: { title: "投資ファンド β", sub: "株を売買してファンドを増やす（30 日・1 日 1 ターン）" },

  REASON_TEXT: {
    no_cash: "現金が足りません（この割合では 1 株も買えません）",
    no_shares: "この銘柄は持っていません",
    finished: "30 日が終わっています",
    none: "できません"
  },

  COLOR: {
    bg: "#101318", stage: "#1a1f27", panel: "rgba(255,255,255,0.05)", panelEdge: "#2c3440",
    text: "#e8ecf1", dim: "#8a94a3", up: "#3ddc84", down: "#ff5c5c", flat: "#c0c6cf",
    select: "rgba(255,213,79,0.22)", cursor: "#ffd54f", hint: "#42a5f5",
    band: "rgba(20,40,90,0.92)", bandEdge: "#7aa7ff",
    chartLine: "#7aa7ff", chartDot: "#ffd54f", chartGrid: "#2c3440",
    newsBoom: "#3ddc84", newsBust: "#ff5c5c", newsRumor: "#ffb74d", newsMacro: "#64b5f6", newsCalm: "#8a94a3",
    button: "#2f3a4a", buttonEdge: "#4a5a70", next: "#2e7d32", overlay: "rgba(0,0,0,0.75)",
    sectorTech: "#64b5f6", sectorFood: "#ffb74d", sectorEnergy: "#ba68c8"
  }
};
