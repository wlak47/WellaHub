(() => {
  const layout = document.getElementById('preview-layout');
  const frame = document.getElementById('app-preview');
  const caption = document.getElementById('phone-caption');
  const previewButtons = [...document.querySelectorAll('[data-preview]')];

  for (const button of previewButtons) {
    button.addEventListener('click', () => {
      const isPhone = button.dataset.preview === 'phone';
      for (const item of previewButtons) {
        const selected = item === button;
        item.classList.toggle('selected', selected);
        item.setAttribute('aria-pressed', String(selected));
      }
      layout?.classList.toggle('phone-mode', isPhone);
      caption?.setAttribute('aria-hidden', String(!isPhone));
      if (frame) frame.title = `Interactive Wella Hub v0.7.0 ${isPhone ? 'phone' : 'desktop'} preview`;
    });
  }

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('site-nav');
  const closeNav = () => {
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.setAttribute('aria-label', 'Open navigation');
    nav?.classList.remove('open');
  };
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    nav?.classList.toggle('open', open);
  });
  nav?.querySelectorAll('a').forEach((link) => link.addEventListener('click', closeNav));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeNav(); });
  document.addEventListener('click', (event) => {
    if (!nav?.classList.contains('open')) return;
    if (!nav.contains(event.target) && !toggle?.contains(event.target)) closeNav();
  });
})();
