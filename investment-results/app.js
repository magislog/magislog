(() => {
  "use strict";
  const DATA_URL = "data/data.json";
  const labels = {
    assets: "評価額", total_assets: "評価額", cash: "現金", cash_yen: "現金", position_value: "保有評価額",
    holdings_status: "保有状態", positions: "保有", holdings: "保有", display: "表示", summary: "本人判断",
    code: "銘柄コード", request_id: "依頼ID", as_of: "判断基準日", effective_from: "有効日", processed_through: "評価データ最終日",
    period: "対象期間", status: "状態", orders: "注文", cancellations: "取消", cancels: "取消", fund_plan: "投信計画", fund_moves: "投信移動", fund_actions: "投信操作", source_sha256: "原票SHA-256", display_copy_sha256: "表示用コピーSHA-256",
    source_artifact_id: "出典ID", raw_artifact_id: "原票ID", buy_line: "買いライン", take_profit_sell_line: "利確売りライン",
    withdrawal: "撤退方針", position_limits: "最大保有量・上限", averaging_down: "ナンピン", news_scenarios: "ニュースシナリオ",
    overall_review: "総合判断", reevaluation: "再評価条件", realtime_items: "時点確認項目", data_missing: "不足情報",
    confidence: "確信度", stance_consistency: "判断の一貫性", judgment_id: "判断ID", persona: "本人", role: "役割",
    stock: "対象銘柄", id: "識別子", name: "表示名", kind: "区分", request: "依頼", findings: "所見", note: "本人回答",
    case_a: "A：未保有", case_b: "B：仮保有", decision: "判断", portfolio: "口座", valuation_source: "評価出典",
    source_artifact: "出典", sha256: "SHA-256", label: "資料", kind: "種別", date: "日付", quantity: "数量",
    shares: "株数", max_shares: "最大株数", price: "価格", price_yen: "価格", action: "方針", reason: "理由",
    evidence: "根拠", conclusion: "結論", rationale: "理由・根拠", trigger: "条件", target: "対象", value: "値",
    status_message: "状態の説明", answer_status: "回答状態", source: "出典",
    holding: "保有状態", initial_shares: "初期保有株数", initial_amount_yen: "初期保有額",
    order_condition: "注文条件", mode: "方式", persona_rule_basis: "本人ルールの根拠",
    hypothetical: "仮保有条件", acquisition_price_yen: "取得価格", acquisition_date: "取得日",
    continuation_conditions: "継続条件", add_limit_shares: "追加上限株数", condition: "条件",
    na_reason: "該当なし理由", sell_line: "売りライン", acquisition: "取得内容",
    initial_amount: "初期保有額", max_amount_yen: "最大投資額", maximum_shares: "最大株数",
    expected_return: "想定リターン", current_loss_yen: "現在の損失額", current_value_yen: "現在評価額",
    comparison_summary: "比較上の所見", hypothetical_position: "仮想保有", paper_test_only: "仮想試験のみ",
    persona_decision: "本人判断", sell_shares: "売却株数", add_shares: "追加株数",
    purchase_price_yen: "購入価格", purchase_date: "購入日", order_status: "注文状態",
    scenario: "シナリオ", scenario_assumptions: "シナリオ前提", trigger: "発動条件",
    max_loss_yen: "最大損失額", max_position_shares: "最大保有株数", source_period: "出典期間",
    action_case_a: "Aの対応", action_case_b: "Bの対応", source_hash: "出典SHA-256",
    unconfirmed_reason: "未確認の理由", thesis_based: "判断の前提", current_action: "現在の対応",
    current_order_state: "現在の注文状態", search_details: "検索内容", searched: "検索実施状況",
    valuation_method: "評価方法", valuation_status: "評価状態", price_status: "価格状態",
    price_type: "価格種別", quantity_shares: "株数", target_shares: "目標株数",
    lower_yen: "下限額", upper_yen: "上限額", rate_pct: "比率", date_checked: "確認日",
    limit_price_yen: "指値価格", first_order_expiry: "初回注文期限", calculated_max_shares_at_100_yen: "100円基準の計算上限株数",
    case_a_max_shares: "Aケース最大株数", dividend_status: "配当状況", event_triggers: "イベント発動条件",
    first_order_limit_price_yen: "初回指値価格", max_buy_shares: "最大購入株数", max_shares_at_100_yen: "100円基準の最大株数",
    buy_price_yen: "買付価格", sell_price_yen: "売却価格", expiry: "期限", expires_at: "有効期限",
    entry_price_yen: "購入価格", additional_buy_limit: "追加購入上限", trigger_conditions: "発動条件", order_expiry: "注文期限"
  };
  const missingStatuses = new Set(["not_answered_or_unstructured", "not_answered", "not_structured", "missing"]);
  const explicitNaStatuses = new Set(["explicit_na", "not_applicable", "persona_explicit_na"]);
  const roleTag = role => ({decision_ai:"判断AI",benchmark_only:"比較役",comparison_only:"比較役",benchmark:"比較役",persona_judgment_trial:"本人判断試験"}[role] || role || "区分未確認");
  const exactOriginal = artifact => Boolean(artifact && artifact.copy_mode === "exact_bytes" && artifact.source_sha256 && artifact.display_copy_sha256 && artifact.source_sha256.toLowerCase() === artifact.display_copy_sha256.toLowerCase());
  function copyEvidence(artifact) {
    if (!artifact) return "出典コピー未確認";
    if (exactOriginal(artifact)) return "原文（同一バイト・SHA-256一致）";
    if (artifact.copy_mode === "sanitized_display_copy") return artifact.source_sha256 && artifact.display_copy_sha256 && artifact.source_sha256 !== artifact.display_copy_sha256 ? "パス等を除いた表示用コピー（原本と別SHA-256）" : "パス等を除いた表示用コピー";
    if (artifact.source_sha256 && artifact.display_copy_sha256 && artifact.source_sha256.toLowerCase() !== artifact.display_copy_sha256.toLowerCase()) return "表示用コピー（原本と別SHA-256）";
    return "表示用コピー（原本同一性未確認）";
  }
  const esc = (value) => String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
  const formatLabel = key => labels[key] || key.replace(/_/g," ");
  const statusLabel = value => ({preview_unclosed:"月次未確定",closed:"確定",open:"月次未確定"}[value] || value || "状態未確認");
  function longTextNode(value, excerptLength = 140) {
    const text = String(value);
    if (text.length <= excerptLength) return make("div", "field-text", text);
    const wrap = make("div", "long-text");
    wrap.append(make("p", "text-excerpt", text.slice(0, excerptLength) + "…"));
    const details = make("details", "text-details");
    details.append(make("summary", "", "全文を表示（原文）"), make("pre", "text-full", text));
    wrap.append(details);
    return wrap;
  }
  const pretty = value => {
    if (value === null || value === undefined || value === "") return "";
    if (typeof value === "boolean") return value ? "はい" : "いいえ";
    if (typeof value === "number") return new Intl.NumberFormat("ja-JP").format(value);
    if (typeof value === "string") {
      if (missingStatuses.has(value)) return "未回答／未構造化";
      if (explicitNaStatuses.has(value)) return "対象外（本人明示）";
      return value;
    }
    return JSON.stringify(value, null, 2);
  };
  const set = (id, text) => { const node = document.getElementById(id); if (node) node.textContent = text; };
  const make = (tag, className, text) => { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; };
  const sourceLine = (sha, artifactId) => [sha ? `SHA-256 ${sha}` : "", artifactId ? `出典ID ${artifactId}` : ""].filter(Boolean).join(" · ");
  function valueNode(value, status) {
    const el = make("div", "field-value");
    if (missingStatuses.has(status) || value === null || value === undefined || value === "") {
      el.classList.add("missing");
      el.textContent = "未回答／未構造化";
      return el;
    }
    if (value && typeof value === "object" && !Array.isArray(value) && missingStatuses.has(value.status)) {
      el.classList.add("missing");
      el.textContent = "未回答／未構造化";
      return el;
    }
    if (value && typeof value === "object" && !Array.isArray(value) && explicitNaStatuses.has(value.status)) {
      el.textContent = "対象外（本人明示）";
      const rest = { ...value };
      delete rest.status;
      if (Object.keys(rest).length) el.append(renderFields(rest));
      return el;
    }
    if (Array.isArray(value)) {
      if (!value.length) { el.textContent = "回答内に項目なし"; return el; }
      const list = make("ol", "scenario-list");
      value.forEach(item => {
        const li = make("li");
        if (item && typeof item === "object") li.append(renderFields(item));
        else if (typeof item === "string" && item.length > 360) li.append(longTextNode(item));
        else li.textContent = pretty(item);
        list.append(li);
      });
      el.append(list); return el;
    }
    if (typeof value === "object") { el.append(renderFields(value)); return el; }
    if (typeof value === "string" && value.length > 360) el.append(longTextNode(value));
    else el.textContent = pretty(value); return el;
  }
  function renderFields(obj, statusObj = {}) {
    const list = make("div", "field-list");
    const known = [];
    const additional = [];
    Object.entries(obj || {}).forEach(([key, value]) => {
      if (["source_path", "path", "absolute_path", "private_path"].includes(key)) return;
      const row = make("div", "field");
      row.append(make("div", "field-label", labels[key] || key));
      row.append(valueNode(value, statusObj[key]));
      (Object.prototype.hasOwnProperty.call(labels,key) ? known : additional).push(row);
    });
    known.forEach(row => list.append(row));
    if (additional.length) {
      const details = make("details", "additional-fields");
      details.append(make("summary", "", "追加情報（原文キー・未解釈）"));
      const extra = make("div", "field-list"); additional.forEach(row => extra.append(row));
      details.append(extra); list.append(details);
    }
    if (!list.childElementCount) list.append(make("p", "empty-state", "該当項目はありません。"));
    return list;
  }
  function addSourceDisclosure(container, label, lines) {
    const visible = lines.filter(Boolean);
    if (!visible.length) return;
    const details = make("details", "source-hash-details");
    details.append(make("summary", "", label), make("p", "raw-meta mono", visible.join(" · ")));
    container.append(details);
  }
  function renderPortfolio(p) {
    const card = make("article", "portfolio-card");
    const top = make("div", "card-top");
    const title = make("h3", "card-name", p.name || p.id || "名称未確認");
    const isBenchmark = String(p.role || "").includes("benchmark");
    const role = make("span", `role-tag${isBenchmark ? " benchmark" : ""}`, roleTag(p.role));
    top.append(title, role); card.append(top);
    const metrics = make("div", "portfolio-metrics");
    const totalValue = p.assets ?? p.value;
    [["評価額", totalValue], ["現金", p.cash], ...(p.units !== undefined ? [["保有口数", p.units]] : [])].forEach(([label, val]) => {
      const box = make("div", "metric"); box.append(make("span", "metric-label", label));
      const isYen = label === "評価額" || label === "現金";
      box.append(make("span", "metric-value", val === null || val === undefined ? "未記録" : `${pretty(val)}${isYen && typeof val === "number" ? "円" : ""}`)); metrics.append(box);
    });
    card.append(metrics);
    const foot = make("div", "portfolio-foot");
    const holdingStatus = p.holdings_status === "no_current_stock_or_fund_holding_in_report" ? "report上、株式・投信の保有なし" : p.holdings_status || "未記録";
    foot.append(make("p", "", `保有状態：${holdingStatus}`));
    if (p.nav_reference_date || p.nav_value) foot.append(make("p", "", `NAV基準日：${p.nav_reference_date || "未確認"} · NAV ${p.nav_value ? `${pretty(p.nav_value)}円` : "未確認"}`));
    if (p.settled_through) foot.append(make("p", "", `約定反映日：${p.settled_through}`));
    if (p.decision) {
      const d = p.decision;
      if (d.code || d.as_of || d.effective_from) foot.append(make("p", "", `直近判断：${d.code || "銘柄未確認"} · 判断 ${d.as_of || "未確認"} · 有効 ${d.effective_from || "未確認"}`));
      const judgment = d.decision || d;
      if (judgment.note || d.summary) {
        const note = judgment.note || d.summary;
        const summary = make("div", "portfolio-judgment");
        summary.append(make("span", "metric-label", "本人判断"), longTextNode(note, 72));
        foot.append(summary);
      }
      const source = sourceLine(d.source_sha256, d.source_artifact_id);
      if (source) addSourceDisclosure(card, "本人判断の出典", [source]);
    }
    card.append(foot);
    if (p.positions !== undefined && p.positions !== null) {
      const details = make("details", "compact-details"); details.append(make("summary", "", "保有の記録"));
      details.append(renderFields({positions:p.positions})); card.append(details);
    }
    if (p.open_orders !== undefined && p.open_orders !== null) {
      const details = make("details", "compact-details"); details.append(make("summary", "", "未約定注文の記録"));
      details.append(renderFields({open_orders:p.open_orders})); card.append(details);
    }
    const portfolioSource = sourceLine(p.source_sha256, p.source_artifact_id);
    if (portfolioSource) addSourceDisclosure(card, "口座データの出典", [portfolioSource]);
    return card;
  }
  async function renderHistory(row, artifacts) {
    const card = make("article", "history-card");
    const head = make("div", "history-head");
    const left = make("div");
    const code = row.code ? `銘柄 ${row.code}` : "銘柄未確認";
    left.append(make("h3", "history-title", `${row.name || row.ai_id || "本人名未確認"} · ${code}`));
    const meta = make("div", "history-meta");
    [["判断基準日",row.as_of],["注文有効日",row.effective_from]].forEach(([k,v])=>{ if(v) meta.append(make("span","",`${k}: ${v}`)); });
    left.append(meta); head.append(left);
    const status = ({imported_answer:"本人回答受領"}[row.status] || row.status || "本人回答");
    head.append(make("span", "state-tag", status)); card.append(head);
    if (row.decision) {
      if (row.decision.note || row.decision.summary) { const summary=make("div","history-summary"); summary.append(longTextNode(row.decision.note || row.decision.summary)); card.append(summary); }
      const other = {...row.decision}; delete other.note; delete other.summary; delete other.code; delete other.as_of; delete other.effective_from; delete other.request_id;
      if (Object.keys(other).length) { const details=make("details","compact-details");details.append(make("summary","","判断・注文の記録"),renderFields(other));card.append(details); }
    }
    const artifact = artifacts.get(row.source_artifact_id);
    addSourceDisclosure(card, "依頼ID・SHA-256", [row.request_id ? `依頼ID ${row.request_id}` : "", row.request_sha256 ? `依頼SHA-256 ${row.request_sha256}` : ""]);
    await addRawDetails(card, row.source_artifact_id, artifacts);
    return card;
  }
  function artifactMap(data) { return new Map((data.artifacts || []).map(a => [a.id, a])); }
  async function addRawDetails(container, artifactId, artifacts, labelOverride) {
    if (!artifactId) return;
    const artifact = artifacts.get(artifactId);
    if (!artifact || typeof artifact.path !== "string" || !artifact.path.startsWith("source/") || artifact.path.includes("..")) return;
    const block = make("div", "raw-block");
    const details = make("details", "raw-details");
    const rawLabel = labelOverride || (exactOriginal(artifact) ? "本人回答の原文を開く" : artifact.copy_mode === "sanitized_display_copy" ? "パス等を除いた表示用コピーを開く" : "表示用コピーを開く");
    details.append(make("summary", "", `${rawLabel}${artifact.path.toLowerCase().endsWith(".json") ? "（JSON）" : ""}`));
    const transforms = (artifact.transformations || []).map(value => value === "local_absolute_path_redaction" ? "ローカル絶対パス除去" : "表示内容の変換").join("、");
    const meta = [copyEvidence(artifact), artifact.display_copy_sha256 ? `表示コピーSHA-256 ${artifact.display_copy_sha256}` : "", artifact.id ? `出典ID ${artifact.id}` : "", transforms].filter(Boolean).join(" · ");
    if (meta) details.append(make("p", "raw-meta mono", meta));
    const pre = make("pre", "raw-answer", "表示コピーを読み込んでいます…"); details.append(pre);
    details.addEventListener("toggle", async () => {
      if (!details.open || details.dataset.loaded) return;
      details.dataset.loaded = "1";
      try {
        const response = await fetch(new URL(`data/${artifact.path}`, location.href), {cache:"no-store"});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const bytes = await response.arrayBuffer();
        if (artifact.display_copy_sha256 && crypto.subtle) {
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
          if (actual.toLowerCase() !== artifact.display_copy_sha256.toLowerCase()) throw new Error("表示用コピーSHA-256が一致しません");
        }
        pre.textContent = new TextDecoder("utf-8").decode(bytes);
      } catch (error) { pre.textContent = `表示コピーを取得できませんでした（${error.message}）。`; }
    });
    block.append(details);
    if (artifact.source_sha256) {
      const sourceHash = make("details", "source-hash-details");
      sourceHash.append(make("summary", "", "原本SHA-256を確認"), make("p", "raw-meta mono", artifact.source_sha256));
      block.append(sourceHash);
    }
    container.append(block);
  }
  async function renderBenchmarkComparison(benchmark, artifacts) {
    const comparison = benchmark && benchmark.current_comparison;
    if (!comparison) return null;
    const card = make("article", "history-card benchmark-comparison");
    const code = comparison.stock_code || comparison.code || "2694";
    card.append(make("h3", "history-title", `${benchmark.person || "るか"} · ${code} 現在比較`));
    card.append(make("p", "history-meta", "比較役の所見 · 日次判断や口座保有と区別"));
    if (typeof comparison.text === "string" && comparison.text) card.append(longTextNode(comparison.text));
    const artifactId = comparison.source_artifact_id || comparison.artifact_id;
    if (comparison.as_of) card.append(make("p", "raw-meta", `基準日 ${comparison.as_of}`));
    await addRawDetails(card, artifactId, artifacts, "比較役の比較所見を開く");
    return card;
  }
  async function renderCase(person, artifacts) {
    const judgment = person.judgment || {};
    const name = person.person || judgment.persona || "本人名未確認";
    const card = make("article", "case-person");
    const header=make("div","case-person-head"); const title=make("div");
    title.append(make("h3","",name));
    title.append(make("p","",`${roleTag(person.role)} · 2338 ${person.period || "試験"}`)); header.append(title);
    card.append(header);
    const body=make("div","case-body");
    [["case_a","A：未保有","未保有ケース"],["case_b","B：仮保有","仮保有ケース"]].forEach(([key,label,sub])=>{
      const box=make("section","case-card"); const h=make("h4","",label); h.append(make("span","",sub)); box.append(h);
      const value=person[key];
      if (value && typeof value === "object") box.append(renderFields(value, person.field_status || {}));
      else box.append(valueNode(value, person.field_status && person.field_status[key]));
      body.append(box);
    });
    card.append(body);
    const priorityKeys = ["buy_line", "sell_line", "take_profit_sell_line", "position_limits", "averaging_down", "withdrawal", "news_scenarios"];
    const priority = {};
    priorityKeys.forEach(k => { if (Object.prototype.hasOwnProperty.call(judgment,k)) priority[k]=judgment[k]; });
    if (Object.keys(priority).length) {
      const section=make("section","case-common-priority");
      section.append(make("h4","","売買ライン・保有上限・撤退・シナリオ"),renderFields(priority,person.field_status||{}));
      card.append(section);
    }
    const common = {...judgment};
    ["case_a","case_b","schema","judgment_id","persona","role","stock","as_of"].forEach(k=>delete common[k]);
    priorityKeys.forEach(k=>delete common[k]);
    if (Object.keys(common).length) {
      const details=make("details","raw-details");
      details.append(make("summary","","本人回答の共通項目（回答にある値）"),renderFields(common,person.field_status||{})); card.append(details);
    }
    await addRawDetails(card, person.raw_artifact_id, artifacts);
    return card;
  }
  async function renderSupplement(item, artifacts) {
    const card = make("article", "history-card");
    card.append(make("h3", "history-title", `${item.person || "本人名未確認"} · 追補資料`));
    const artifact=artifacts.get(item.raw_artifact_id);
    card.append(make("p", "history-meta", `${item.kind || "種別未確認"} · ${item.period || "時点未確認"} · ${artifact ? copyEvidence(artifact) : item.raw_status || "出典コピー未確認"}`));
    await addRawDetails(card, item.raw_artifact_id, artifacts);
    return card;
  }
  function dateChip(label, value) { const el=make("div","date-chip");el.append(make("b","",label),document.createTextNode(value || "未確認"));return el; }
  async function init() {
    try {
      const response=await fetch(DATA_URL,{cache:"no-store"});
      if(!response.ok) throw new Error(`資料を読み込めません（HTTP ${response.status}）`);
      const data=await response.json();
      if(data.schema!=="investment_page_data_v1") throw new Error("表示データのschemaが想定と異なります。");
      set("load-status","仮想運用の記録を表示中");
      if(data.notice) document.querySelector(".notice").textContent=data.notice;
      const report=data.report||{};
      set("portfolio-dates",`レポート日 ${report.as_of||"未確認"} · 評価・日次反映 ${report.processed_through||"未確認"} · ${statusLabel(report.status)}`);
      const grid=document.getElementById("portfolio-grid");grid.replaceChildren();
      const portfolios=[...(data.portfolios||[])];
      portfolios.forEach(p=>grid.append(renderPortfolio(p)));
      if(!portfolios.length) grid.append(make("p","empty-state","口座情報は未着です。"));
      const dates=document.createElement("div");dates.className="date-pair";
      const latestByCode = code => (data.history || []).find(item => String(item.code) === String(code));
      const h2694 = latestByCode("2694"), h8267 = latestByCode("8267");
      dates.append(dateChip("レポート日 / 評価・日次反映",`${report.as_of||"未確認"} / ${report.processed_through||"未確認"}`),dateChip("2694 判断 / 有効", `${h2694?.as_of||"未確認"} / ${h2694?.effective_from||"未確認"}`),dateChip("8267 判断 / 有効", `${h8267?.as_of||"未確認"} / ${h8267?.effective_from||"未確認"}`));
      document.getElementById("history-list").before(dates);
      const artifacts=artifactMap(data);
      const benchmarkCard=await renderBenchmarkComparison(data.benchmark,artifacts);
      if (benchmarkCard) grid.append(benchmarkCard);
      const history=document.getElementById("history-list");history.replaceChildren();
      for(const item of data.history||[]) history.append(await renderHistory(item,artifacts));
      if(!history.childElementCount) history.append(make("p","empty-state","日次判断履歴は未着です。"));
      const cases=document.getElementById("case-list");cases.replaceChildren();
      for(const person of data.judgments_2338||[]) cases.append(await renderCase(person,artifacts));
      if(!cases.childElementCount) cases.append(make("p","empty-state","2338本人回答は未着です。"));
      const supplements=document.getElementById("supplement-list");supplements.replaceChildren();
      for(const item of data.supplements_2338||[]) supplements.append(await renderSupplement(item,artifacts));
      if(!supplements.childElementCount) supplements.append(make("p","empty-state","追補資料は未着です。"));
      if(report.source_artifact_id || report.source_sha256) addSourceDisclosure(document.querySelector(".page-footer"), "月次レポートの出典", [sourceLine(report.source_sha256,report.source_artifact_id)]);
    } catch(error) {
      set("load-status","候補データを読み込めません");
      const box=document.getElementById("load-error");box.hidden=false;box.textContent=`${error.message} data/data.json の提供後に表示されます。`;
      ["portfolio-grid","history-list","case-list","supplement-list"].forEach(id=>document.getElementById(id).replaceChildren(make("p","empty-state","データ未着")));
    }
  }
  function initNavigation() {
    const toggle = document.querySelector(".menu-toggle");
    const nav = document.getElementById("main-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", () => {
      const expanded = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!expanded));
      nav.classList.toggle("open", !expanded);
    });
    nav.querySelectorAll("a").forEach(link => link.addEventListener("click", () => {
      toggle.setAttribute("aria-expanded", "false");
      nav.classList.remove("open");
    }));
  }
  document.addEventListener("DOMContentLoaded", () => { initNavigation(); init(); });
})();



