const cards = [...document.querySelectorAll(".art-card")];
const dialog = document.querySelector("#lightbox");
const image = dialog.querySelector(".lightbox-image");
const title = dialog.querySelector("#lightbox-title");
const sourceLabel = dialog.querySelector(".lightbox-source");
const count = dialog.querySelector(".lightbox-count");
let activeIndex = 0;
let returnFocus = null;

function show(index) {
  activeIndex = (index + cards.length) % cards.length;
  const card = cards[activeIndex];
  const sourceImage = card.querySelector("img");
  const caption = card.querySelector(".art-title").textContent;
  const source = card.querySelector(".art-source").textContent;

  image.src = sourceImage.src;
  image.alt = sourceImage.alt;
  title.textContent = caption;
  sourceLabel.textContent = source;
  count.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(cards.length).padStart(2, "0")}`;
}

cards.forEach((card, index) => card.addEventListener("click", () => {
  returnFocus = card;
  show(index);
  dialog.showModal();
  dialog.querySelector(".lightbox-close").focus();
}));

dialog.querySelector(".lightbox-close").addEventListener("click", () => dialog.close());
dialog.querySelector(".lightbox-prev").addEventListener("click", () => show(activeIndex - 1));
dialog.querySelector(".lightbox-next").addEventListener("click", () => show(activeIndex + 1));
dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener("close", () => { if (returnFocus) returnFocus.focus({ preventScroll: true }); });
document.addEventListener("keydown", event => {
  if (!dialog.open) return;
  if (event.key === "ArrowLeft") { event.preventDefault(); show(activeIndex - 1); }
  if (event.key === "ArrowRight") { event.preventDefault(); show(activeIndex + 1); }
});