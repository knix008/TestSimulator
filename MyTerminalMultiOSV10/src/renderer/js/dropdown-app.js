(function () {
  const api = window.myTerminal;
  const menu = document.getElementById('menu');
  if (!api || !menu) return;

  function applyColors(colors = {}) {
    const root = document.documentElement;
    const map = {
      '--toolbar-bg': colors.toolbarBg,
      '--toolbar-fg': colors.toolbarFg,
      '--border': colors.border,
      '--button-hover': colors.buttonHover,
      '--accent': colors.accent,
    };
    for (const [key, value] of Object.entries(map)) {
      if (value) root.style.setProperty(key, value);
    }
    if (colors.toolbarBg) {
      document.body.style.background = colors.toolbarBg;
    }
  }

  async function fit() {
    const width = Math.ceil(Math.max(menu.scrollWidth, menu.getBoundingClientRect().width, 160));
    const height = Math.ceil(Math.max(menu.scrollHeight, menu.getBoundingClientRect().height, 40));
    await api.fitDropdown?.({ width, height });
  }

  api.onDropdownInit?.((payload = {}) => {
    applyColors(payload.colors || {});
    menu.innerHTML = payload.html || '';
    requestAnimationFrame(() => {
      requestAnimationFrame(fit);
    });
  });

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest(
      'button[data-theme], button[data-prompt], button[data-font], button[data-bg-fit], button[data-shell]'
    );
    if (!btn) return;
    api.pickDropdown?.({ dataset: { ...btn.dataset } });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      api.closeDropdown?.();
    }
  });
})();
