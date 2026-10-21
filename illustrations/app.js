const cards = [...document.querySelectorAll(".gallery-card")];
const openButtons = [...document.querySelectorAll(".gallery-open")];
const filters = [...document.querySelectorAll("[data-filter]")];
const countLabel = document.querySelector("#gallery-count");
const dialog = document.querySelector("#lightbox");
const image = dialog.querySelector(".lightbox-image");
const title = dialog.querySelector("#lightbox-title");
const sourceLabel = dialog.querySelector(".lightbox-source");
const count = dialog.querySelector(".lightbox-count");
let activeIndex = 0;
let visibleButtons = openButtons;
let returnFocus = null;

function updateFilter(category) {
  cards.forEach(card => { card.hidden = category !== "all" && card.dataset.category !== category; });
  const visibleCount = cards.filter(card => !card.hidden).length;
  countLabel.textContent = `${visibleCount}件`;
  filters.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.filter === category)));
  visibleButtons = cards.filter(card => !card.hidden).map(card => card.querySelector(".gallery-open"));
}

function show(index) {
  activeIndex = (index + visibleButtons.length) % visibleButtons.length;
  const button = visibleButtons[activeIndex];
  const card = button.closest(".gallery-card");
  const sourceImage = button.querySelector("img");
  image.src = sourceImage.src;
  image.alt = sourceImage.alt;
  title.textContent = card.querySelector(".gallery-caption h2").textContent;
  sourceLabel.textContent = card.querySelector(".gallery-source").textContent;
  count.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(visibleButtons.length).padStart(2, "0")}`;
}

filters.forEach(button => button.addEventListener("click", () => updateFilter(button.dataset.filter)));
openButtons.forEach(button => button.addEventListener("click", () => {
  returnFocus = button;
  show(visibleButtons.indexOf(button));
  dialog.showModal();
  dialog.querySelector(".lightbox-close").focus();
}));
dialog.querySelector(".lightbox-close").addEventListener("click", () => dialog.close());
dialog.querySelector(".lightbox-prev").addEventListener("click", () => show(activeIndex - 1));
dialog.querySelector(".lightbox-next").addEventListener("click", () => show(activeIndex + 1));
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener("keydown", event => {
  if (event.key !== "Tab") return;
  const controls = [dialog.querySelector(".lightbox-close"), dialog.querySelector(".lightbox-prev"), dialog.querySelector(".lightbox-next")];
  const current = controls.indexOf(document.activeElement);
  if (event.shiftKey && current === 0) { event.preventDefault(); controls.at(-1).focus(); }
  if (!event.shiftKey && current === controls.length - 1) { event.preventDefault(); controls[0].focus(); }
});
dialog.addEventListener("close", () => { if (returnFocus) returnFocus.focus({ preventScroll: true }); });
document.addEventListener("keydown", event => {
  if (!dialog.open) return;
  if (event.key === "ArrowLeft") { event.preventDefault(); show(activeIndex - 1); }
  if (event.key === "ArrowRight") { event.preventDefault(); show(activeIndex + 1); }
});
updateFilter("all");
