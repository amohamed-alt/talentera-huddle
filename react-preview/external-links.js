(() => {
  const PNL_URL = 'https://amohamed-alt.github.io/P-L/';

  const applyLinks = () => {
    document.querySelectorAll('a.nav').forEach(link => {
      const label = link.querySelector('span')?.textContent?.trim();
      if (label === 'P&L') {
        link.href = PNL_URL;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.dataset.externalTarget = 'pnl';
      }
    });
  };

  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-external-target="pnl"]');
    if (!link) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.open(PNL_URL, '_blank', 'noopener,noreferrer');
  }, true);

  const root = document.getElementById('root');
  if (root) new MutationObserver(applyLinks).observe(root, { childList: true, subtree: true });
  applyLinks();
})();
