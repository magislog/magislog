// Keep the current header behavior without requiring any particular home-content markup.
const toggle = document.querySelector('.menu-toggle');
const nav = document.querySelector('#main-nav');
const moreInfo = document.querySelector('#more-info');
const requestForm = document.querySelector('#request-form');

function closeMenu() {
  if (!toggle || !nav) return;
  toggle.setAttribute('aria-expanded', 'false');
  nav.classList.remove('open');
  const symbol = toggle.querySelector('span:last-child');
  if (symbol) symbol.textContent = '＋';
}

if (toggle && nav) {
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
    const symbol = toggle.querySelector('span:last-child');
    if (symbol) symbol.textContent = open ? '−' : '＋';
  });
  nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && nav.classList.contains('open')) {
      closeMenu();
      toggle.focus();
    }
  });
}

if (requestForm) requestForm.addEventListener('submit', (event) => event.preventDefault());

// Preserve legacy section links and open the compact disclosure for its targets.
function revealTarget(hash) {
  if (moreInfo && ['#about', '#members', '#request'].includes(hash)) moreInfo.open = true;
}

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const link = target.closest('a[href^="#"]');
  if (link) revealTarget(link.getAttribute('href'));
});
window.addEventListener('hashchange', () => revealTarget(window.location.hash));
revealTarget(window.location.hash);

// #contents and #featured remain HTML-owned legacy navigation targets.
// The new guidance_sources cards are static HTML; no runtime catalog/filter is needed.
