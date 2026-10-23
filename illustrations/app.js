(() => {
  "use strict";
  const BASE = "/illustrations/";
  const $ = (id) => document.getElementById(id);
  const root = document.querySelector(".cx");
  const els = {
    faces: $("cx-faces"), bg: document.querySelector(".cx-bg img"),
    stageImg: $("cx-stage-img"), stageCap: $("cx-stage-cap"), stageOpen: document.querySelector(".cx-stage-open"),
    romaji: $("cx-romaji"), name: $("cx-name"), intro: $("cx-intro"),
    works: $("cx-works"), profile: $("cx-profile"),
    lightbox: $("lightbox")
  };
  const tabs = [...document.querySelectorAll('.cx-tabs [role="tab"]')];
  let chars = [], works = [], current = null, currentWork = null;

  const byOrder = (a, b) => (Number(a.order) || 0) - (Number(b.order) || 0);
  const slugFromPath = () => {
    const m = location.pathname.match(/^\/illustrations\/([a-z0-9-]+)\/?$/i);
    return m ? m[1].toLowerCase() : null;
  };

  function el(tag, attrs = {}, text) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text != null) n.textContent = text;
    return n;
  }

  function buildFaces() {
    els.faces.textContent = "";
    chars.forEach((c) => {
      const li = el("li");
      const a = el("a", { href: `${BASE}${c.id}/`, "data-id": c.id, style: `--c:${c.color}`, "aria-label": c.name });
      const img = el("img", { src: c.face || c.portrait, alt: "", width: "96", height: "96" });
      a.append(img, el("span", { class: "cx-face-name" }, c.name));
      a.addEventListener("click", (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        if (current && current.id === c.id) return;
        select(c.id, true);
      });
      li.append(a);
      els.faces.append(li);
    });
  }

  function swap(nodes, fn) {
    // 0.3s cubic-bezier(0.215,0.61,0.355,1)（かなめ案・ぶいすぽ実測値）
    nodes.forEach((n) => n.classList.add("is-out"));
    const delay = matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 150;
    setTimeout(() => {
      fn();
      requestAnimationFrame(() => nodes.forEach((n) => n.classList.remove("is-out")));
    }, delay);
  }

  function showWork(w) {
    currentWork = w;
    const src = w ? w.image : current.portrait;
    els.stageImg.src = src;
    els.stageImg.alt = w ? (w.alt || w.title) : current.name;
    els.stageCap.textContent = w ? w.title : "";
    [...els.works.querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.src === src)));
  }

  function render(c) {
    root.style.setProperty("--c", c.color);
    document.documentElement.style.setProperty("--c", c.color);
    els.romaji.textContent = c.romaji || "";
    els.name.textContent = c.name;
    els.intro.textContent = c.intro || "";
    els.bg.src = c.portrait;

    const list = works.filter((w) => w.characterId === c.id).sort(byOrder);
    els.works.textContent = "";
    if (!list.length) els.works.append(el("li", { class: "cx-empty" }, "掲載中のイラストはまだありません。"));
    list.forEach((w) => {
      const li = el("li");
      const b = el("button", { type: "button", "data-src": w.image, "aria-pressed": "false", "aria-label": `${w.title}を表示` });
      b.append(el("span", { class: "cx-thumb" }), el("span", { class: "cx-work-title" }, w.title));
      b.firstChild.append(el("img", { src: w.image, alt: "", loading: "lazy" }));
      b.addEventListener("click", () => swap([els.stageImg, els.stageCap], () => showWork(w)));
      li.append(b);
      els.works.append(li);
    });
    // 代表絵は「プロフィール用の絵」。作品に同じ画像があればそれを選択状態にする
    showWork(list.find((w) => w.image === c.portrait) || null);

    els.profile.textContent = "";
    const rows = [["名前", c.name], ["ローマ字", c.romaji], ["紹介", c.intro], ["掲載イラスト", `${list.length}点`]];
    rows.forEach(([k, v]) => { if (v) els.profile.append(el("dt", {}, k), el("dd", {}, v)); });

    [...els.faces.querySelectorAll("a")].forEach((a) => {
      if (a.dataset.id === c.id) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.title = `${c.name} — イラスト — Magis`;
  }

  function select(id, push) {
    const i = Math.max(0, chars.findIndex((c) => c.id === id));
    const c = chars[i];
    const first = !current;
    current = c;
    if (push) history.pushState({ id: c.id }, "", `${BASE}${c.id}/`);
    if (first) render(c);
    else swap([els.stageImg, els.stageCap, els.name, els.romaji, els.intro, els.bg], () => render(c));
  }

  function setTab(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !on;
    });
    root.dataset.tab = tab.id.replace("tab-", "");
    if (focus) tab.focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => setTab(t));
    t.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { e.preventDefault(); setTab(tabs[(i + d + tabs.length) % tabs.length], true); }
    });
  });

  els.stageOpen.addEventListener("click", () => {
    if (!els.lightbox.showModal) return;
    els.lightbox.querySelector("img").src = els.stageImg.src;
    els.lightbox.querySelector("img").alt = els.stageImg.alt;
    $("lightbox-title").textContent = currentWork ? currentWork.title : current.name;
    els.lightbox.showModal();
  });
  els.lightbox.querySelector(".lightbox-close").addEventListener("click", () => els.lightbox.close());
  els.lightbox.addEventListener("click", (e) => { if (e.target === els.lightbox) els.lightbox.close(); });

  window.addEventListener("popstate", () => {
    const id = slugFromPath() || (chars[0] && chars[0].id);
    if (id && (!current || current.id !== id)) select(id, false);
  });

  Promise.all([
    fetch("/data/characters.json").then((r) => r.json()),
    fetch("/data/works.json").then((r) => r.json())
  ]).then(([cj, wj]) => {
    chars = (cj.characters || []).filter((c) => c && c.id && c.name).sort(byOrder);
    works = (wj.works || []).filter((w) => w && w.image);
    if (!chars.length) throw new Error("no characters");
    buildFaces();
    const slug = slugFromPath();
    const known = slug && chars.some((c) => c.id === slug);
    if (slug && !known) history.replaceState(null, "", BASE);
    select(known ? slug : chars[0].id, false);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.documentElement.classList.remove("cx-init");
      root.classList.add("is-ready");
    }));
  }).catch(() => {
    els.name.textContent = "読み込みに失敗しました";
    els.intro.textContent = "時間をおいて再読み込みしてください。";
  });
})();
