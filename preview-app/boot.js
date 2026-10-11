// Opening animation: exactly 3 seconds to 100%, then it slides away into the app. Plays only at start-up.
// The bar, the dial and the failsafe are driven by CSS; this file only writes the % / step text and starts the exit.
(function () {
  const el = document.getElementById('splash');
  const go = () => { document.body.classList.remove('boot'); document.body.classList.add('intro'); };
  if (!el || /nosplash/.test(location.search)) { if (el) el.remove(); go(); return; }
  const bar = document.getElementById('spBar'), pct = document.getElementById('spPct'), txt = document.getElementById('spText');
  const DUR = 3000, t0 = Date.now();
  let done = false;
  const steps = [[0, 'Starting engine\u2026'], [.3, 'Loading accounts\u2026'], [.62, 'Syncing\u2026'], [.92, 'Ready']];
  window.__splashReady = () => {};
  const finish = () => {
    if (done) return; done = true; clearInterval(timer);
    pct.textContent = '100%'; txt.textContent = 'Ready';
    el.classList.add('done'); go();
    try { const a = document.querySelector('.tab.active'), i = document.querySelector('.tabs .ind'); if (a && i) { i.style.left = a.offsetLeft + 'px'; i.style.width = a.offsetWidth + 'px'; } } catch {}
    setTimeout(() => el.remove(), 1000);
  };
  const timer = setInterval(() => {
    let p = 0;
    try { p = new DOMMatrix(getComputedStyle(bar).transform).a; } catch { p = Math.min(1, (Date.now() - t0) / DUR); }
    if (!(p >= 0)) p = Math.min(1, (Date.now() - t0) / DUR);
    pct.textContent = Math.round(Math.min(1, p) * 100) + '%';
    const s = [...steps].reverse().find((a) => p >= a[0])[1];
    if (txt.textContent !== s) txt.textContent = s;
  }, 40);
  setTimeout(finish, DUR + 150);
  const sk = document.getElementById('spSkip');
  if (sk) sk.addEventListener('click', finish);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Enter') finish(); });
})();
