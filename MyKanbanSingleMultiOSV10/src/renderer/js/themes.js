/* ── Theme catalog: 20 light, 20 dark, plus user-defined themes ─────────── */
const Themes = (() => {
  const COLOR_KEYS = ['primary', 'bg', 'bgCard', 'bgHeader', 'text', 'border', 'danger', 'success', 'warning'];
  const LIGHT_SEED = {
    primary: '#6366F1', bg: '#F1F5F9', bgCard: '#FFFFFF', bgHeader: '#1E293B',
    text: '#1E293B', border: '#CBD5E1', danger: '#EF4444', success: '#22C55E', warning: '#F59E0B',
  };
  const DARK_SEED = {
    primary: '#818CF8', bg: '#0F172A', bgCard: '#1E293B', bgHeader: '#0B1120',
    text: '#E2E8F0', border: '#334155', danger: '#F87171', success: '#22C55E', warning: '#F59E0B',
  };

  function hexToRgb(hex) {
    const h = String(hex).replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function rgbToHex(r, g, b) {
    const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
  }
  function mix(a, b, t) {
    const A = hexToRgb(a);
    const B = hexToRgb(b);
    return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function makeTheme(def) {
    const { id, ko, en, mode, primary, bg, header } = def;
    const dark = mode === 'dark';
    const card = def.card || (dark ? mix(bg, '#FFFFFF', 0.08) : '#FFFFFF');
    const col = def.col || (dark ? mix(bg, primary, 0.2) : mix('#E2E8F0', primary, 0.12));
    const border = def.border || (dark ? mix(bg, '#FFFFFF', 0.18) : mix('#CBD5E1', primary, 0.22));
    return {
      id, ko, en, mode, custom: false,
      vars: {
        '--primary': primary,
        '--primary-dark': mix(primary, '#000000', dark ? 0.22 : 0.16),
        '--primary-light': dark ? mix(bg, primary, 0.32) : mix('#FFFFFF', primary, 0.14),
        '--danger': dark ? '#F87171' : '#EF4444',
        '--danger-light': dark ? mix(bg, '#7F1D1D', 0.55) : '#FEF2F2',
        '--success': '#22C55E',
        '--success-pastel': dark ? mix(bg, '#14532D', 0.72) : '#D4F4DD',
        '--success-pastel-text': dark ? '#86EFAC' : '#166534',
        '--error-pastel': dark ? mix(bg, '#7F1D1D', 0.62) : '#FDE0E0',
        '--error-pastel-text': dark ? '#FCA5A5' : '#B91C1C',
        '--warning': '#F59E0B',
        '--bg': bg,
        '--bg-card': card,
        '--bg-col': col,
        '--bg-header': header,
        '--text': dark ? '#E2E8F0' : '#1E293B',
        '--text-muted': dark ? '#94A3B8' : '#64748B',
        '--text-light': dark ? '#64748B' : '#94A3B8',
        '--border': border,
        '--icon-menubar': dark ? '#E2E8F0' : '#64748B',
        '--icon-toolbar': dark ? '#E2E8F0' : '#475569',
      },
    };
  }

  const LIGHT = [
    ['light-01', '인디고', 'Indigo', '#6366F1', '#F1F5F9', '#1E293B'],
    ['light-02', '바다', 'Ocean', '#0284C7', '#F0F9FF', '#0C4A6E'],
    ['light-03', '숲', 'Forest', '#16A34A', '#F0FDF4', '#14532D'],
    ['light-04', '에메랄드', 'Emerald', '#059669', '#ECFDF5', '#064E3B'],
    ['light-05', '청록', 'Teal', '#0D9488', '#F0FDFA', '#134E4A'],
    ['light-06', '시안', 'Cyan', '#0891B2', '#ECFEFF', '#164E63'],
    ['light-07', '하늘', 'Sky', '#0EA5E9', '#F0F9FF', '#075985'],
    ['light-08', '파랑', 'Blue', '#2563EB', '#EFF6FF', '#1E3A8A'],
    ['light-09', '남색', 'Navy', '#1D4ED8', '#EFF6FF', '#172554'],
    ['light-10', '보라', 'Violet', '#7C3AED', '#F5F3FF', '#4C1D95'],
    ['light-11', '자주', 'Purple', '#9333EA', '#FAF5FF', '#581C87'],
    ['light-12', '자홍', 'Fuchsia', '#C026D3', '#FDF4FF', '#701A75'],
    ['light-13', '분홍', 'Pink', '#DB2777', '#FDF2F8', '#831843'],
    ['light-14', '장미', 'Rose', '#E11D48', '#FFF1F2', '#881337'],
    ['light-15', '빨강', 'Red', '#DC2626', '#FEF2F2', '#7F1D1D'],
    ['light-16', '주황', 'Orange', '#EA580C', '#FFF7ED', '#7C2D12'],
    ['light-17', '호박', 'Amber', '#D97706', '#FFFBEB', '#78350F'],
    ['light-18', '라임', 'Lime', '#65A30D', '#F7FEE7', '#365314'],
    ['light-19', '슬레이트', 'Slate', '#475569', '#F8FAFC', '#0F172A'],
    ['light-20', '모래', 'Sand', '#A16207', '#FAFAF9', '#292524'],
  ].map(([id, ko, en, primary, bg, header]) => makeTheme({ id, ko, en, mode: 'light', primary, bg, header }));

  const DARK = [
    ['dark-01', '한밤', 'Midnight', '#818CF8', '#0F172A', '#0B1120'],
    ['dark-02', '심해', 'Abyss', '#38BDF8', '#020617', '#01040F'],
    ['dark-03', '남색 밤', 'Navy Night', '#60A5FA', '#0B1F3A', '#071526'],
    ['dark-04', '숲의 밤', 'Forest Night', '#4ADE80', '#052E16', '#03190C'],
    ['dark-05', '에메랄드 밤', 'Emerald Night', '#34D399', '#022C22', '#011812'],
    ['dark-06', '청록 밤', 'Teal Night', '#2DD4BF', '#042F2E', '#021C1B'],
    ['dark-07', '흑요', 'Obsidian', '#A78BFA', '#111827', '#0A0F1A'],
    ['dark-08', '흑연', 'Graphite', '#94A3B8', '#18181B', '#0C0C0E'],
    ['dark-09', '보랏빛 밤', 'Violet Night', '#C4B5FD', '#1E1B4B', '#120F33'],
    ['dark-10', '자수정', 'Amethyst', '#D8B4FE', '#2E1065', '#1A0A3C'],
    ['dark-11', '자홍 밤', 'Magenta Night', '#F0ABFC', '#3B0764', '#24033D'],
    ['dark-12', '장미 밤', 'Rose Night', '#FB7185', '#4C0519', '#2A020E'],
    ['dark-13', '와인', 'Wine', '#FDA4AF', '#450A0A', '#2A0505'],
    ['dark-14', '진홍', 'Crimson', '#F87171', '#3F0D12', '#26060A'],
    ['dark-15', '호박 밤', 'Amber Night', '#FBBF24', '#431407', '#2A0C04'],
    ['dark-16', '커피', 'Coffee', '#FDBA74', '#292524', '#1C1917'],
    ['dark-17', '올리브', 'Olive', '#A3E635', '#1A2E05', '#0F1C03'],
    ['dark-18', '강철', 'Steel', '#7DD3FC', '#0C1929', '#071018'],
    ['dark-19', '오로라', 'Aurora', '#67E8F9', '#083344', '#041E29'],
    ['dark-20', '은하', 'Galaxy', '#E879F9', '#1A1033', '#100A22'],
  ].map(([id, ko, en, primary, bg, header]) => makeTheme({ id, ko, en, mode: 'dark', primary, bg, header }));

  LIGHT[0].vars = {
    ...LIGHT[0].vars,
    '--primary': '#6366F1', '--primary-dark': '#4F52CC', '--primary-light': '#EEF2FF',
    '--danger': '#EF4444', '--danger-light': '#FEF2F2', '--success': '#22C55E',
    '--success-pastel': '#D4F4DD', '--success-pastel-text': '#166534',
    '--error-pastel': '#FDE0E0', '--error-pastel-text': '#B91C1C', '--warning': '#F59E0B',
    '--bg': '#F1F5F9', '--bg-card': '#FFFFFF', '--bg-col': '#E2E8F0', '--bg-header': '#1E293B',
    '--text': '#1E293B', '--text-muted': '#64748B', '--text-light': '#94A3B8', '--border': '#CBD5E1',
    '--icon-menubar': '#64748B', '--icon-toolbar': '#475569',
  };
  DARK[0].vars = {
    ...DARK[0].vars,
    '--primary': '#818CF8', '--primary-dark': '#6366F1', '--primary-light': '#1E1B4B',
    '--danger': '#F87171', '--danger-light': '#2D1B1B', '--success': '#22C55E',
    '--success-pastel': '#1A3D2E', '--success-pastel-text': '#86EFAC',
    '--error-pastel': '#3D2020', '--error-pastel-text': '#FCA5A5', '--warning': '#F59E0B',
    '--bg': '#0F172A', '--bg-card': '#1E293B', '--bg-col': '#1A2744', '--bg-header': '#0B1120',
    '--text': '#E2E8F0', '--text-muted': '#94A3B8', '--text-light': '#64748B', '--border': '#334155',
    '--icon-menubar': '#E2E8F0', '--icon-toolbar': '#E2E8F0',
  };

  let custom = [];
  let currentId = 'light-01';
  let settingsTab = null;
  let editingId = null;

  function presets() { return [...LIGHT, ...DARK]; }

  function fromCustom(item) {
    const base = makeTheme({
      id: item.id,
      ko: item.name,
      en: item.name,
      mode: item.mode === 'dark' ? 'dark' : 'light',
      primary: item.primary,
      bg: item.bg,
      header: item.bgHeader,
      card: item.bgCard,
      border: item.border,
    });
    base.custom = true;
    base.vars['--text'] = item.text;
    base.vars['--danger'] = item.danger;
    base.vars['--success'] = item.success;
    base.vars['--warning'] = item.warning;
    base.vars['--bg-card'] = item.bgCard;
    base.vars['--bg-header'] = item.bgHeader;
    base.source = item;
    return base;
  }

  function customThemes() {
    return custom.map(fromCustom);
  }

  function resolve(id) {
    return presets().find((t) => t.id === id) || customThemes().find((t) => t.id === id) || null;
  }

  function labelOf(theme) {
    if (!theme) return '';
    return (typeof I18n !== 'undefined' && I18n.getLang() === 'en') ? theme.en : theme.ko;
  }

  function apply(id, opts = {}) {
    const theme = resolve(id) || LIGHT[0];
    currentId = theme.id;
    const root = document.documentElement;
    if (theme.mode === 'dark') root.dataset.theme = 'dark';
    else delete root.dataset.theme;
    root.dataset.themeId = theme.id;
    Object.entries(theme.vars).forEach(([key, value]) => root.style.setProperty(key, value));
    try {
      localStorage.setItem('kanban-theme-id', theme.id);
      localStorage.setItem('kanban-theme', theme.mode);
      localStorage.setItem('kanban-custom-themes', JSON.stringify(custom));
    } catch {}
    markSelected();
    try { if (opts.persist !== false && App.persistAppSettings) App.persistAppSettings(); } catch {}
    try { if (App.updateThemeBtn) App.updateThemeBtn(); } catch {}
    if (typeof BoardView !== 'undefined' && BoardView.refreshBurndownChartTheme) BoardView.refreshBurndownChartTheme();
    return theme;
  }

  function boot() {
    try {
      const raw = localStorage.getItem('kanban-custom-themes');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) custom = parsed.map(normalizeCustom).filter(Boolean);
      }
      const savedId = localStorage.getItem('kanban-theme-id');
      const savedMode = localStorage.getItem('kanban-theme');
      const id = (savedId && resolve(savedId)) ? savedId : (savedMode === 'dark' ? 'dark-01' : 'light-01');
      apply(id, { persist: false });
    } catch {
      apply('light-01', { persist: false });
    }
  }

  function normalizeCustom(item) {
    if (!item || typeof item !== 'object') return null;
    const id = String(item.id || '');
    if (!/^custom-[a-z0-9]{4,24}$/.test(id)) return null;
    const name = String(item.name || '').trim().slice(0, 40);
    if (!name) return null;
    const next = { id, name, mode: item.mode === 'dark' ? 'dark' : 'light' };
    for (const key of COLOR_KEYS) {
      if (!/^#[0-9A-Fa-f]{6}$/.test(item[key] || '')) return null;
      next[key] = item[key].toUpperCase();
    }
    return next;
  }

  function importState(saved) {
    const incoming = Array.isArray(saved?.customThemes)
      ? saved.customThemes.map(normalizeCustom).filter(Boolean)
      : [];
    if (incoming.length || !custom.length) custom = incoming;
    const serverId = saved?.themeId && resolve(saved.themeId) ? saved.themeId : null;
    const id = serverId || (resolve(currentId) ? currentId : (saved?.theme === 'dark' ? 'dark-01' : 'light-01'));
    apply(id, { persist: false });
  }

  function persistPayload(lang) {
    const theme = resolve(currentId) || LIGHT[0];
    return {
      theme: theme.mode,
      themeId: theme.id,
      lang,
      customThemes: custom.map((item) => ({ ...item })),
    };
  }

  function allSelectable() {
    return [...presets(), ...customThemes()];
  }

  function random() {
    closeMenu();
    if (typeof AppMenu !== 'undefined') AppMenu.close();
    const all = allSelectable();
    if (!all.length) return;
    let index = Math.floor(Math.random() * all.length);
    if (all.length > 1 && all[index].id === currentId) index = (index + 1) % all.length;
    const theme = apply(all[index].id);
    if (typeof showToast === 'function') showToast(labelOf(theme));
  }

  function pick(id) {
    const theme = apply(id);
    closeMenu();
    if (typeof showToast === 'function' && theme) showToast(labelOf(theme));
  }

  function swatch(theme) {
    const v = theme.vars;
    return `<i style="background:${v['--bg-header']}"></i><i style="background:${v['--primary']}"></i><i style="background:${v['--bg']}"></i>`;
  }

  function chip(theme) {
    const on = theme.id === currentId ? ' is-on' : '';
    return `<button type="button" class="theme-chip${on}" data-theme-id="${esc(theme.id)}" title="${esc(labelOf(theme))}" onclick="Themes.pick('${esc(theme.id)}')">${swatch(theme)}</button>`;
  }

  function menuGroup(title, tab, themes) {
    return `
      <button type="button" class="theme-menu-label" onclick="Themes.openSettings('${tab}')">${esc(title)}</button>
      <div class="theme-grid">${themes.map(chip).join('')}</div>`;
  }

  function menuHtml() {
    const customList = customThemes();
    const customBody = customList.length
      ? `<div class="theme-grid">${customList.map(chip).join('')}</div>`
      : `<div class="theme-menu-empty">${esc(I18n.t('themeNoneCustom'))}</div>`;
    return `
      ${menuGroup(I18n.t('themeDark'), 'dark', DARK)}
      ${menuGroup(I18n.t('themeLight'), 'light', LIGHT)}
      <button type="button" class="theme-menu-label" onclick="Themes.openSettings('custom')">${esc(I18n.t('themeCustom'))}</button>
      ${customBody}`;
  }

  function toggleMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('theme-menu');
    if (!menu) return;
    const open = menu.classList.contains('hidden');
    if (!open) {
      menu.classList.add('hidden');
      return;
    }
    menu.innerHTML = menuHtml();
    menu.classList.remove('hidden');
  }

  function closeMenu() {
    document.getElementById('theme-menu')?.classList.add('hidden');
  }

  function openSettings(tab) {
    settingsTab = tab || settingsTab;
    closeMenu();
    if (typeof App !== 'undefined') App.showSettings();
  }

  function activeTab() {
    if (settingsTab === 'dark' || settingsTab === 'light' || settingsTab === 'custom') return settingsTab;
    const theme = resolve(currentId);
    if (theme?.custom) return 'custom';
    return theme?.mode === 'dark' ? 'dark' : 'light';
  }

  function setTab(tab) {
    settingsTab = tab;
    editingId = null;
    const el = document.getElementById('theme-settings');
    if (el) el.outerHTML = settingsSection();
  }

  function markSelected() {
    document.querySelectorAll('[data-theme-id]').forEach((el) => {
      el.classList.toggle('is-on', el.dataset.themeId === currentId);
    });
    const nameEl = document.getElementById('theme-current-name');
    const theme = resolve(currentId);
    if (nameEl && theme) nameEl.textContent = labelOf(theme);
  }

  function presetCard(theme) {
    const on = theme.id === currentId ? ' is-on' : '';
    return `<button type="button" class="theme-pick${on}" data-theme-id="${esc(theme.id)}" onclick="Themes.pick('${esc(theme.id)}')">
      <span class="theme-pick-swatch">${swatch(theme)}</span>
      <span class="theme-pick-name">${esc(labelOf(theme))}</span>
    </button>`;
  }

  function colorField(key, label, value) {
    return `<label class="theme-color-field"><span>${esc(label)}</span><input type="color" id="tc-${key}" value="${esc(String(value).toLowerCase())}"></label>`;
  }

  function customFormHtml() {
    const editing = custom.find((item) => item.id === editingId);
    const seed = editing || { ...(activeDraftMode() === 'dark' ? DARK_SEED : LIGHT_SEED), name: '', mode: activeDraftMode() };
    const mode = editing ? editing.mode : (seed.mode || 'light');
    return `
      <form id="theme-custom-form" class="theme-custom-form" data-fresh="${editing ? '0' : '1'}" onsubmit="return false;">
        <label class="theme-color-field theme-name-field"><span>${esc(I18n.t('themeName'))}</span>
          <input id="theme-custom-name" class="form-control" maxlength="40" value="${esc(editing ? editing.name : '')}" placeholder="${esc(I18n.t('themeCustom'))}">
        </label>
        <label class="theme-color-field"><span>${esc(I18n.t('themeMode'))}</span>
          <select id="theme-custom-mode" class="form-control" onchange="Themes.onCustomModeChange()">
            <option value="light"${mode === 'light' ? ' selected' : ''}>Light</option>
            <option value="dark"${mode === 'dark' ? ' selected' : ''}>Dark</option>
          </select>
        </label>
        ${colorField('primary', I18n.t('themePrimary'), editing?.primary || seed.primary)}
        ${colorField('bg', I18n.t('themeBg'), editing?.bg || seed.bg)}
        ${colorField('bgCard', I18n.t('themeCard'), editing?.bgCard || seed.bgCard)}
        ${colorField('bgHeader', I18n.t('themeHeader'), editing?.bgHeader || seed.bgHeader)}
        ${colorField('text', I18n.t('themeText'), editing?.text || seed.text)}
        ${colorField('border', I18n.t('themeBorder'), editing?.border || seed.border)}
        ${colorField('danger', I18n.t('themeDanger'), editing?.danger || seed.danger)}
        ${colorField('success', I18n.t('themeSuccess'), editing?.success || seed.success)}
        ${colorField('warning', I18n.t('themeWarning'), editing?.warning || seed.warning)}
        <div class="theme-form-actions">
          <button type="button" class="btn btn-primary btn-sm" onclick="Themes.saveCustomForm()">${esc(I18n.t('themeSave'))}</button>
          ${editing ? `<button type="button" class="btn btn-danger btn-sm" onclick="Themes.removeCustom('${esc(editing.id)}')">${esc(I18n.t('themeDelete'))}</button>` : ''}
        </div>
      </form>`;
  }

  function activeDraftMode() {
    const sel = document.getElementById('theme-custom-mode');
    return sel?.value === 'dark' ? 'dark' : 'light';
  }

  function settingsSection() {
    const tab = activeTab();
    const tabs = [
      ['dark', I18n.t('themeDark')],
      ['light', I18n.t('themeLight')],
      ['custom', I18n.t('themeCustom')],
    ];
    const theme = resolve(currentId);
    let body = '';
    if (tab === 'custom') {
      const cards = customThemes().map((item) => `
        <button type="button" class="theme-pick${item.id === currentId ? ' is-on' : ''}" data-theme-id="${esc(item.id)}" onclick="Themes.editCustom('${esc(item.id)}')">
          <span class="theme-pick-swatch">${swatch(item)}</span>
          <span class="theme-pick-name">${esc(item.ko)}</span>
        </button>`).join('');
      body = `
        <div class="theme-custom-toolbar">
          <button type="button" class="btn btn-secondary btn-sm" onclick="Themes.beginCustom()">${esc(I18n.t('themeAdd'))}</button>
        </div>
        ${cards ? `<div class="theme-pick-grid">${cards}</div>` : `<div class="theme-menu-empty">${esc(I18n.t('themeNoneCustom'))}</div>`}
        ${customFormHtml()}`;
    } else {
      const list = tab === 'dark' ? DARK : LIGHT;
      body = `<div class="theme-pick-grid">${list.map(presetCard).join('')}</div>`;
    }
    return `
      <div class="settings-section" id="theme-settings">
        <div class="settings-section-title">${esc(I18n.t('themeSettings'))}</div>
        <div class="settings-section-desc">${esc(I18n.t('themeSettingsHint'))} <strong id="theme-current-name">${esc(theme ? labelOf(theme) : '')}</strong></div>
        <div class="settings-tabs">
          ${tabs.map(([id, text]) => `<button type="button" class="settings-tab${id === tab ? ' is-on' : ''}" onclick="Themes.setTab('${id}')">${esc(text)}</button>`).join('')}
        </div>
        ${body}
      </div>`;
  }

  function beginCustom() {
    editingId = null;
    const form = document.getElementById('theme-custom-form');
    if (!form) {
      settingsTab = 'custom';
      refreshSettings();
      return;
    }
    form.dataset.fresh = '1';
    const name = document.getElementById('theme-custom-name');
    if (name) name.value = '';
    const mode = document.getElementById('theme-custom-mode');
    if (mode) mode.value = 'light';
    fillSeed(LIGHT_SEED);
    name?.focus();
  }

  function fillSeed(seed) {
    COLOR_KEYS.forEach((key) => {
      const el = document.getElementById(key === 'bgCard' ? 'tc-bgCard' : key === 'bgHeader' ? 'tc-bgHeader' : `tc-${key}`);
      if (el && seed[key]) el.value = String(seed[key]).toLowerCase();
    });
  }

  function editCustom(id) {
    editingId = id;
    settingsTab = 'custom';
    if (!resolve(id)) return;
    apply(id);
    refreshSettings();
  }

  function onCustomModeChange() {
    const form = document.getElementById('theme-custom-form');
    if (!form || form.dataset.fresh !== '1') return;
    const mode = document.getElementById('theme-custom-mode')?.value;
    fillSeed(mode === 'dark' ? DARK_SEED : LIGHT_SEED);
  }

  function readForm() {
    const name = document.getElementById('theme-custom-name')?.value.trim() || '';
    const mode = document.getElementById('theme-custom-mode')?.value === 'dark' ? 'dark' : 'light';
    const item = { id: editingId || (`custom-${Math.random().toString(36).slice(2, 10)}`), name, mode };
    for (const key of COLOR_KEYS) {
      const el = document.getElementById(`tc-${key}`);
      item[key] = (el?.value || '').toUpperCase();
    }
    return normalizeCustom(item);
  }

  function saveCustomForm() {
    const item = readForm();
    if (!item) {
      if (typeof showToast === 'function') showToast(I18n.t('themeNameRequired'), 'error');
      return;
    }
    const index = custom.findIndex((row) => row.id === item.id);
    if (index >= 0) custom[index] = item;
    else custom.push(item);
    editingId = item.id;
    settingsTab = 'custom';
    apply(item.id);
    refreshSettings();
  }

  async function removeCustom(id) {
    const ok = await Modal.confirm({
      title: I18n.t('themeDelete'),
      message: I18n.t('themeDeleteConfirm'),
      confirmLabel: I18n.t('themeDelete'),
      danger: true,
    });
    if (!ok) return;
    custom = custom.filter((item) => item.id !== id);
    if (editingId === id) editingId = null;
    if (currentId === id) apply(custom[0]?.id || 'light-01', { persist: false });
    try { if (App.persistAppSettings) App.persistAppSettings(); } catch {}
    settingsTab = 'custom';
    refreshSettings();
  }

  function refreshSettings() {
    const el = document.getElementById('theme-settings');
    if (el) el.outerHTML = settingsSection();
  }

  document.addEventListener('click', (event) => {
    const menu = document.getElementById('theme-menu');
    if (!menu || menu.classList.contains('hidden')) return;
    if (event.target.closest && event.target.closest('#theme-control')) return;
    closeMenu();
  });

  document.addEventListener('input', (event) => {
    if (!event.target.closest || !event.target.closest('#theme-custom-form')) return;
    if (event.target.id === 'theme-custom-mode' || event.target.id === 'theme-custom-name') return;
    const form = document.getElementById('theme-custom-form');
    if (form) form.dataset.fresh = '0';
  });

  return {
    boot, apply, importState, persistPayload, random, pick, toggleMenu, closeMenu,
    openSettings, setTab, settingsSection, beginCustom, editCustom, onCustomModeChange,
    saveCustomForm, removeCustom,
    current() { return resolve(currentId) || LIGHT[0]; },
  };
})();
