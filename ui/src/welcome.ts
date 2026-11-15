// Welcome card for the first visit (index.html #welcome). It stays closed after the
// user closes it once. If the browser does not keep data, it shows on each visit.

const KEY = 'lunarnav.welcomeClosed';

export function setupWelcome() {
  const card = document.getElementById('welcome');
  const close = document.getElementById('welcomeClose');
  if (!card || !close) return;
  let closed = false;
  try {
    closed = localStorage.getItem(KEY) === '1';
  } catch {
    /* storage not available */
  }
  card.hidden = closed;
  close.addEventListener('click', () => {
    card.hidden = true;
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* storage not available */
    }
    document.getElementById('guideLink')?.focus();
  });
}
