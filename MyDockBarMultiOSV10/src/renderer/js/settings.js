/* Settings window controller.
 *
 * The window is a fixed size and never scrolls, so the two unbounded lists
 * (dock items and installed applications) are paged rather than scrolled, and
 * the item editor takes the list's place instead of growing below it. */
(function () {
  'use strict';

  const api = window.dockApi;
  const Glyphs = window.DockGlyphs;
  const I18n = window.DockI18n;
  const $ = (id) => document.getElementById(id);

  let t = I18n.make('en');

  /**
   * The glyph each tab shows, from the same set the native menus draw from so
   * an idea never has two different pictures.
   */
  const TAB_ICONS = {
    general: 'settings',
    themes: 'theme',
    appearance: 'app',
    zoom: 'zoom',
    position: 'pos-bottom',
    behaviour: 'toggle-on',
    items: 'dock',
    apps: 'apps',
  };

  function decorateTabs() {
    for (const tab of document.querySelectorAll('.tab')) {
      const glyph = TAB_ICONS[tab.dataset.tab];
      if (!glyph || tab.querySelector('img')) continue;

      const img = document.createElement('img');
      img.src = `../../build/menu/${glyph}.png`;
      img.alt = '';
      // A missing glyph must not leave a broken-image box in the tab strip.
      img.addEventListener('error', () => img.remove(), { once: true });
      tab.prepend(img);
    }
  }

  /** Re-label every element carrying a data-i18n key. */
  function applyTranslations() {
    for (const node of document.querySelectorAll('[data-i18n]')) {
      node.textContent = t(node.dataset.i18n);
    }
    $('app-filter').placeholder = t('m.filterApps');
    document.title = `MyDockBar — ${t('tab.general')}`;
  }

  const ITEMS_PER_PAGE = 8;
  const APPS_PER_PAGE = 8;

  const state = {
    cfg: null,
    items: [],
    apps: [],
    editingId: null,
    applying: false,
    itemPage: 0,
    appPage: 0,
    displays: [],
  };

  /* ------------------------------ plumbing ------------------------------ */

  function toast(message) {
    const node = $('toast');
    node.textContent = message;
    node.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove('show'), 2200);
  }

  const patchDock = (partial) => api.config.patch({ dock: partial });

  /** Items are locked: adding, removing and reordering are all refused. */
  const locked = () => !!(state.cfg && state.cfg.dock.lockItems);

  /**
   * Bind a range input to a dock setting. The slider is wrapped in a row with a
   * step-down button, a step-up button and the current value, so every numeric
   * setting can be nudged exactly one step without dragging.
   */
  function bindRange(id, format) {
    const input = $(id);
    const readout = $(`v-${id}`);
    const show = () => { if (readout) readout.textContent = format(Number(input.value)); };

    const commit = () => {
      show();
      if (state.applying) return;
      state.cfg.dock[id] = Number(input.value);
      renderZoomPreview();
      patchDock({ [id]: Number(input.value) });
    };

    const wrap = document.createElement('div');
    wrap.className = 'num';
    input.parentNode.insertBefore(wrap, input);

    const step = (direction) => {
      const size = Number(input.step) || 1;
      const min = Number(input.min);
      const max = Number(input.max);
      const next = Number(input.value) + direction * size;
      // Re-round to the step grid so repeated float steps cannot drift.
      const snapped = Math.round(next / size) * size;
      input.value = String(Math.min(max, Math.max(min, Number(snapped.toFixed(6)))));
      commit();
    };

    const button = (label, direction, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'step ghost';
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', () => step(direction));
      return b;
    };

    wrap.append(button('−', -1, `Decrease ${id}`), input, button('+', 1, `Increase ${id}`));
    if (readout) wrap.appendChild(readout);

    input.addEventListener('input', commit);
    return { input, show };
  }

  function bindSelect(id, apply) {
    const input = $(id);
    input.addEventListener('change', () => {
      if (state.applying) return;
      state.cfg.dock[id] = input.value;
      renderZoomPreview();
      renderMonitorMap();
      (apply || patchDock)({ [id]: input.value });
    });
    return input;
  }

  function bindCheck(id, apply) {
    const input = $(id);
    input.addEventListener('change', () => {
      if (!state.applying) (apply || patchDock)({ [id]: input.checked });
    });
    return input;
  }

  const ranges = {};
  const px = (v) => t('u.px', { n: v });

  function setupBindings() {
    ranges.iconSize = bindRange('iconSize', px);
    ranges.spacing = bindRange('spacing', px);
    ranges.padding = bindRange('padding', px);
    ranges.opacity = bindRange('opacity', (v) => `${Math.round(v * 100)}%`);
    ranges.plateOpacity = bindRange('plateOpacity', (v) => `${Math.round(v * 100)}%`);
    ranges.maxZoom = bindRange('maxZoom', (v) => `${v.toFixed(2)}x`);
    ranges.zoomRange = bindRange('zoomRange', (v) => t('u.icons', { n: v.toFixed(1) }));
    ranges.edgeOffset = bindRange('edgeOffset', px);
    ranges.autoShowDelay = bindRange('autoShowDelay', (v) => t('u.ms', { n: v }));
    ranges.autoHideDelay = bindRange('autoHideDelay', (v) => t('u.ms', { n: v }));
    ranges.autoHidePeek = bindRange('autoHidePeek', px);
    ranges.autoHideAnimation = bindRange('autoHideAnimation', (v) => (v === 0 ? t('o.instant') : t('u.ms', { n: v })));
    ranges.plateThickness = bindRange('plateThickness', (v) => (v === 0 ? t('o.auto') : t('u.px', { n: v })));

    bindSelect('animation');
    bindSelect('clickEffect');
    bindSelect('clickEffectDirection');
    bindSelect('removeEffect').addEventListener('change', playRemovePreview);
    $('remove-preview-play').addEventListener('click', playRemovePreview);
    bindSelect('position', (patch) => {
      syncAlignChoices();
      patchDock(patch);
    });
    bindSelect('align', (patch) => {
      const place = DockPlacement.resolve(state.cfg.dock.position);
      // A corner already picked its end. Choosing another end here means the
      // plain edge plus that choice, so the two controls never disagree.
      if (place.corner) {
        state.cfg.dock.position = place.edge;
        $('position').value = place.edge;
        patchDock({ position: place.edge, align: patch.align });
      } else {
        patchDock(patch);
      }
      syncAlignChoices();
      renderMonitorMap();
    });
    bindSelect('display');
    bindSelect('stackingLevel');

    // Locale lives at the top level of the config, not under `dock`.
    $('locale').addEventListener('change', () => {
      if (state.applying) return;
      api.config.patch({ locale: $('locale').value });
    });

    for (const id of ['showLabels', 'showReflection', 'showRunningIndicator',
      'showRunningApps', 'focusRunningWindow', 'autoHide',
      'showOnAllWorkspaces', 'showInTaskbar', 'lockItems']) {
      bindCheck(id);
    }

    bindCheck('startWithOS', (partial) => api.config.patch(partial));
  }

  /* ------------------------------- tabs -------------------------------- */

  function setupTabs() {
    for (const tab of document.querySelectorAll('.tab')) {
      tab.addEventListener('click', () => {
        for (const other of document.querySelectorAll('.tab')) other.classList.toggle('active', other === tab);
        for (const panel of document.querySelectorAll('.panel')) {
          panel.classList.toggle('active', panel.id === `tab-${tab.dataset.tab}`);
        }
        if (tab.dataset.tab === 'apps' && !state.apps.length) loadApps();
        if (tab.dataset.tab === 'zoom') { renderZoomPreview(); drawRemoveSample(); }
        if (tab.dataset.tab === 'position') renderMonitorMap();
      });
    }
  }

  function showTab(name) {
    const tab = document.querySelector(`.tab[data-tab="${name}"]`);
    if (tab) tab.click();
  }

  /* ------------------------------ paging ------------------------------- */

  /** Render a Prev / "n of m" / Next control, or nothing when it all fits. */
  function renderPager(node, page, pageCount, onChange) {
    node.textContent = '';
    if (pageCount <= 1) return;

    const prev = document.createElement('button');
    prev.className = 'icon-btn ghost';
    prev.textContent = t('b.prev');
    prev.disabled = page === 0;
    prev.addEventListener('click', () => onChange(page - 1));

    const label = document.createElement('span');
    label.className = 'page-label';
    label.textContent = `${page + 1} / ${pageCount}`;

    const next = document.createElement('button');
    next.className = 'icon-btn ghost';
    next.textContent = t('b.next');
    next.disabled = page >= pageCount - 1;
    next.addEventListener('click', () => onChange(page + 1));

    node.append(prev, label, next);
  }

  /* ------------------------------ themes ------------------------------- */

  async function renderThemes() {
    const themes = await api.themes.list();
    const dark = themes.filter((t) => t.dark !== false);
    const light = themes.filter((t) => t.dark === false);

    fillThemeGrid($('theme-grid-dark'), dark);
    fillThemeGrid($('theme-grid-light'), light);

    $('dark-count').textContent = `(${dark.length})`;
    $('light-count').textContent = `(${light.length})`;
    $('theme-count').textContent = t('m.themesAvailable', { n: themes.length });
  }

  function fillThemeGrid(grid, themes) {
    grid.textContent = '';
    for (const theme of themes) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `theme-card${theme.id === state.cfg.themeId ? ' selected' : ''}`;
      card.dataset.id = theme.id;
      card.title = theme.description || theme.name;

      const preview = document.createElement('div');
      preview.className = `theme-preview${theme.dark === false ? ' light-bg' : ''}`;
      const plate = document.createElement('div');
      plate.className = 'mini-plate';
      for (let i = 0; i < 3; i += 1) {
        const slot = document.createElement('i');
        slot.appendChild(document.createElement('b'));
        plate.appendChild(slot);
      }
      preview.appendChild(plate);

      const accent = document.createElement('div');
      accent.className = 'theme-accent';

      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = theme.name;

      card.append(preview, accent, name);
      card.addEventListener('click', async () => {
        await api.config.patch({ theme: theme.id });
        toast(`Theme: ${theme.name}`);
      });
      grid.appendChild(card);
      applyPreviewStyle(card, theme.id);
    }
  }

/**
   * Paint each card with that theme's own colours: the plate uses the real
   * plate variables, and the backdrop behind it is built from the theme's
   * palette so translucent themes show what they actually look like and no
   * two cards read the same at a glance.
   */
  async function applyPreviewStyle(card, themeId) {
    const theme = await previewVariables(themeId);
    if (!theme) return;

    const vars = theme.variables || {};
    const ui = theme.ui || {};
    const plate = card.querySelector('.mini-plate');
    const preview = card.querySelector('.theme-preview');
    const accent = ui['--accent'] || vars['--indicator-color'] || '#8fa8c8';

    plate.style.background = vars['--plate-bg'] || '';
    plate.style.border = vars['--plate-border'] || '';
    plate.style.boxShadow = vars['--plate-shadow'] || '';

    // Shape, shown rather than described: the same radius and clip the real
    // bar uses, scaled down. A px radius is divided so a 999px pill still
    // reads as a pill at thumbnail size instead of a rectangle.
    plate.style.borderRadius = miniRadius(vars['--plate-radius']);
    plate.style.clipPath = vars['--plate-clip'] && vars['--plate-clip'] !== 'none'
      ? vars['--plate-clip']
      : 'none';

    // Per-icon tiles, for the shapes that have them.
    for (const slot of plate.querySelectorAll('i')) {
      slot.style.background = vars['--item-bg'] || 'transparent';
      slot.style.border = vars['--item-border'] && vars['--item-border'] !== 'none'
        ? vars['--item-border']
        : 'none';
      slot.style.borderRadius = miniRadius(vars['--item-radius'] || '0px');
      slot.style.boxShadow = vars['--item-shadow'] || 'none';
    }

    // A desktop-like backdrop drawn from the theme's own palette.
    const far = ui['--bg-sunken'] || (theme.dark === false ? '#c9d4e2' : '#0e1118');
    preview.style.background = `linear-gradient(135deg, ${accent} -40%, ${far} 78%)`;

    // The accent stripe is what makes neighbouring cards tell apart fastest.
    card.style.setProperty('--card-accent', accent);
    for (const dot of plate.querySelectorAll('i')) {
      dot.style.background = theme.dark === false ? 'rgba(30,40,55,.72)' : 'rgba(255,255,255,.88)';
    }
  }

  /**
   * Scale a CSS radius down for the thumbnail. Each px value is divided by
   * three so the proportions survive; percentages and keywords pass through.
   */
  function miniRadius(value) {
    if (!value) return '0px';
    return String(value).replace(/(\d*\.?\d+)px/g, (_m, n) => `${Math.max(1, Math.round(Number(n) / 3))}px`);
  }

  const previewCache = new Map();
  async function previewVariables(themeId) {
    if (!previewCache.has(themeId)) {
      previewCache.set(themeId, await api.themes.variables(themeId));
    }
    return previewCache.get(themeId);
  }

  /* ------------------------------- items ------------------------------- */

  function renderItems() {
    const list = $('item-list');
    list.textContent = '';

    const pageCount = Math.max(1, Math.ceil(state.items.length / ITEMS_PER_PAGE));
    state.itemPage = Math.min(Math.max(0, state.itemPage), pageCount - 1);

    if (!state.items.length) {
      list.appendChild(emptyRow(t('m.dockEmpty')));
      renderPager($('item-pager'), 0, 1, () => {});
      return;
    }

    const start = state.itemPage * ITEMS_PER_PAGE;
    state.items.slice(start, start + ITEMS_PER_PAGE).forEach((item, offset) => {
      const index = start + offset;
      const row = document.createElement('li');
      row.dataset.id = item.id;
      row.dataset.index = String(index);
      row.draggable = true;
      if (item.type === 'separator') row.classList.add('separator-row');

      const grip = document.createElement('span');
      grip.className = 'grip';
      grip.textContent = '⣿';
      grip.title = t('m.dragHint');

      const img = document.createElement('img');
      img.src = Glyphs.forItem(item);
      img.alt = '';
      if (item.type === 'separator') img.style.visibility = 'hidden';

      const meta = document.createElement('div');
      meta.className = 'meta';
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = item.type === 'separator' ? t('menu.separator') : (item.label || t('menu.unnamed'));
      const target = document.createElement('div');
      target.className = 'target';
      target.textContent = item.path || '';
      meta.append(label, target);

      const edit = document.createElement('button');
      edit.className = 'icon-btn ghost';
      edit.textContent = t('b.edit');
      edit.addEventListener('click', () => openEditor(item.id));

      const remove = document.createElement('button');
      remove.className = 'icon-btn danger';
      remove.textContent = t('b.remove');
      if (item.protected) {
        remove.disabled = true;
        remove.title = t('m.builtIn');
        row.classList.add('built-in');
      }
      remove.addEventListener('click', async () => {
        if (item.protected) return;
        state.items = await api.items.remove(item.id);
        if (state.editingId === item.id) closeEditor();
        renderItems();
      });

      row.append(grip, img, meta, edit, remove);
      list.appendChild(row);
    });

    renderPager($('item-pager'), state.itemPage, pageCount, (page) => {
      state.itemPage = page;
      renderItems();
    });

    applyLockState();
  }

  /**
   * Reflect the lock in the UI. The main process refuses the same operations
   * regardless; this is so the buttons do not lie about what will happen.
   */
  function applyLockState() {
    const isLocked = locked();
    for (const id of ['add-app', 'add-folder', 'add-separator', 'add-url']) {
      $(id).disabled = isLocked;
    }
    for (const row of $('item-list').querySelectorAll('li')) {
      const builtIn = row.classList.contains('built-in');
      for (const button of row.querySelectorAll('button.danger')) {
        button.disabled = isLocked || builtIn;
      }
      row.draggable = !isLocked && !!row.dataset.index;
    }
    for (const button of $('app-list').querySelectorAll('button.primary')) {
      button.disabled = isLocked;
    }
    $('item-hint').textContent = isLocked ? t('m.lockedHint') : t('m.dragHint');
  }

  function emptyRow(text) {
    const row = document.createElement('li');
    row.className = 'empty';
    row.textContent = text;
    return row;
  }

  /**
   * Dropping files anywhere on the Dock Items tab adds them, the same way
   * dropping onto the dock itself does.
   */
  function setupItemDrop() {
    const panel = $('tab-items');
    let depth = 0;

    const carriesFiles = (event) =>
      !!event.dataTransfer && Array.from(event.dataTransfer.types).includes('Files');

    panel.addEventListener('dragenter', (event) => {
      if (!carriesFiles(event)) return;
      depth += 1;
      if (!locked()) panel.classList.add('dropping');
    });

    panel.addEventListener('dragover', (event) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = locked() ? 'none' : 'copy';
    });

    panel.addEventListener('dragleave', () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) panel.classList.remove('dropping');
    });

    panel.addEventListener('drop', async (event) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      depth = 0;
      panel.classList.remove('dropping');

      if (locked()) { toast(t('m.locked')); return; }

      const paths = Array.from(event.dataTransfer.files || [])
        .map((file) => api.pathForFile(file))
        .filter(Boolean);
      if (!paths.length) return;

      state.items = await api.items.addPaths(paths);
      state.itemPage = Math.floor(Math.max(0, state.items.length - 1) / ITEMS_PER_PAGE);
      renderItems();
    });
  }

  function setupItemDrag() {
    const list = $('item-list');
    let from = -1;

    list.addEventListener('dragstart', (event) => {
      const row = event.target.closest('li');
      if (!row || !row.dataset.index || locked()) { event.preventDefault(); return; }
      from = Number(row.dataset.index);
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', String(from));
    });

    list.addEventListener('dragover', (event) => {
      event.preventDefault();
      const row = event.target.closest('li');
      for (const other of list.children) other.classList.remove('drag-over');
      if (row) row.classList.add('drag-over');
    });

    list.addEventListener('dragleave', (event) => {
      const row = event.target.closest('li');
      if (row) row.classList.remove('drag-over');
    });

    list.addEventListener('drop', async (event) => {
      event.preventDefault();
      const row = event.target.closest('li');
      for (const other of list.children) other.classList.remove('drag-over');
      if (!row || from < 0 || !row.dataset.index) return;
      const to = Number(row.dataset.index);
      if (to === from) return;
      state.items = await api.items.move(from, to);
      from = -1;
      renderItems();
    });
  }

  /* ------------------------------ editor ------------------------------- */

  function openEditor(id) {
    const item = state.items.find((it) => it.id === id);
    if (!item) return;
    state.editingId = id;

    // The editor replaces the list rather than stacking under it, so the
    // panel's height never changes and the window never needs to scroll.
    $('item-list').style.display = 'none';
    const editor = $('item-editor');
    editor.classList.remove('hidden');
    editor.textContent = '';

    const title = document.createElement('h2');
    title.textContent = item.type === 'separator'
      ? t('menu.separator')
      : t('m.editing', { name: item.label || '' });
    editor.appendChild(title);

    if (item.type !== 'separator') {
      editor.appendChild(textField(t('m.label'), item.label || '', (value) => save({ label: value })));

      const targetRow = textField(t('m.target'), item.path || '', (value) => save({ path: value }));
      const browse = document.createElement('button');
      browse.className = 'icon-btn ghost';
      browse.textContent = t('b.browse');
      browse.addEventListener('click', async () => {
        const picked = await api.dialog.pickTarget();
        if (picked) { await save({ path: picked }); openEditor(id); }
      });
      targetRow.appendChild(browse);
      editor.appendChild(targetRow);

      editor.appendChild(textField(t('m.arguments'), item.args || '', (value) => save({ args: value })));

      const iconRow = document.createElement('label');
      iconRow.className = 'field';
      const iconLabel = document.createElement('span');
      iconLabel.textContent = t('m.customIcon');
      const iconActions = document.createElement('div');
      iconActions.className = 'row';

      const preview = document.createElement('img');
      preview.src = Glyphs.forItem(item);
      preview.alt = '';
      preview.style.cssText = 'width:26px;height:26px;object-fit:contain';
      iconActions.appendChild(preview);

      const choose = document.createElement('button');
      choose.className = 'icon-btn ghost';
      choose.textContent = t('b.pickIcon');
      choose.addEventListener('click', () => openIconPicker(item));
      iconActions.appendChild(choose);

      if (item.icon) {
        const clear = document.createElement('button');
        clear.className = 'icon-btn ghost';
        clear.textContent = t('b.useDefault');
        clear.addEventListener('click', async () => { await save({ icon: '' }); openEditor(id); });
        iconActions.appendChild(clear);
      }
      iconRow.append(iconLabel, iconActions);
      editor.appendChild(iconRow);
    }

    const done = document.createElement('button');
    done.className = 'ghost';
    done.textContent = t('b.back');
    done.addEventListener('click', closeEditor);
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginTop = '14px';
    row.appendChild(done);
    editor.appendChild(row);

    async function save(patch) {
      state.items = await api.items.update(id, patch);
      renderItems();
    }
  }

  /* --------------------------- icon picker ---------------------------- */

  const PROGRAM_FILE = /\.(exe|dll|ico|ocx|cpl|mun)$/i;

  /**
   * RocketDock-style icon chooser: the automatic icon, every icon stored
   * inside the item's own program file, a built-in glyph, or any image on
   * disk. Program files routinely carry dozens of icons that the shell's
   * default extraction never surfaces, which is what makes an icon look
   * wrong or missing in the first place.
   */
  function openIconPicker(item) {
    const modal = $('icon-picker');
    modal.textContent = '';
    modal.classList.remove('hidden');

    const sheet = document.createElement('div');
    sheet.className = 'sheet';

    const header = document.createElement('header');
    header.textContent = t('m.iconPickTitle', { name: item.label || '' });

    const body = document.createElement('div');
    body.className = 'body';

    const sourceRow = document.createElement('div');
    sourceRow.className = 'row';

    const status = document.createElement('span');
    status.className = 'hint';
    status.style.margin = '0';

    const grid = document.createElement('div');
    grid.className = 'icon-grid';

    const footer = document.createElement('footer');
    const cancel = document.createElement('button');
    cancel.className = 'ghost';
    cancel.textContent = t('b.back');
    cancel.addEventListener('click', closeIconPicker);

    const apply = document.createElement('button');
    apply.className = 'primary';
    apply.textContent = t('b.ok');
    apply.disabled = true;
    apply.addEventListener('click', () => commit());
    footer.append(cancel, apply);

    let chosen = null;

    function select(button, value) {
      for (const other of grid.querySelectorAll('button')) other.classList.remove('selected');
      button.classList.add('selected');
      chosen = value;
      apply.disabled = false;
    }

    function addTile(src, value, title) {
      const button = document.createElement('button');
      button.type = 'button';
      button.title = title || '';
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.addEventListener('error', () => button.remove(), { once: true });
      button.appendChild(img);
      button.addEventListener('click', () => select(button, value));
      button.addEventListener('dblclick', () => { select(button, value); commit(); });
      grid.appendChild(button);
      return button;
    }

    function showBuiltIn() {
      grid.textContent = '';
      chosen = null;
      apply.disabled = true;
      addTile(Glyphs.forItem({ ...item, icon: '' }), { icon: '' }, t('m.iconAuto'));
      for (const [name, url] of Object.entries(Glyphs.all)) addTile(url, { icon: url }, name);
      status.textContent = t('m.iconBuiltIn');
    }

    async function showFromProgram(target) {
      grid.textContent = '';
      chosen = null;
      apply.disabled = true;
      status.textContent = t('m.iconExtracting');
      let found = [];
      try {
        found = await api.icons.fromProgram(target);
      } catch (err) {
        console.error('[settings] icon extraction failed:', err);
      }
      if (!found.length) {
        status.textContent = t('m.iconNoneFound');
        return;
      }
      for (const entry of found) addTile(entry.url, { file: entry.file }, `${entry.size}px`);
      status.textContent = `${found.length} — ${target}`;
    }

    function sourceButton(labelKey, handler) {
      const b = document.createElement('button');
      b.className = 'icon-btn ghost';
      b.textContent = t(labelKey);
      b.addEventListener('click', handler);
      return b;
    }

    sourceRow.append(
      sourceButton('m.iconBuiltIn', showBuiltIn),
      sourceButton('m.iconFromExe', async () => {
        const target = item.path && PROGRAM_FILE.test(item.path)
          ? item.path
          : await api.icons.pickProgram();
        if (target) showFromProgram(target);
      }),
      sourceButton('m.iconFromFile', async () => {
        const picked = await api.dialog.pickIcon();
        if (picked) commitIcon(picked);
      }),
    );

    async function commitIcon(iconPath) {
      state.items = await api.items.update(item.id, { icon: iconPath });
      closeIconPicker();
      renderItems();
      openEditor(item.id);
    }

    async function commit() {
      if (!chosen) return;
      if (chosen.file) commitIcon(await api.icons.useFile(chosen.file));
      else commitIcon(chosen.icon);
    }

    body.append(sourceRow, grid, status);
    sheet.append(header, body, footer);
    modal.appendChild(sheet);

    // Open on the item's own program file when it has one - that is where the
    // icon the user expected almost always lives.
    if (item.path && PROGRAM_FILE.test(item.path)) showFromProgram(item.path);
    else showBuiltIn();
  }

  function closeIconPicker() {
    const modal = $('icon-picker');
    modal.classList.add('hidden');
    modal.textContent = '';
  }

  function closeEditor() {
    state.editingId = null;
    $('item-editor').classList.add('hidden');
    $('item-list').style.display = '';
  }

  function textField(labelText, value, onCommit) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const span = document.createElement('span');
    span.textContent = labelText;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    let last = value;
    const commit = () => {
      if (input.value === last) return;
      last = input.value;
      onCommit(input.value);
    };
    input.addEventListener('change', commit);
    input.addEventListener('blur', commit);
    wrap.append(span, input);
    return wrap;
  }

  /* --------------------------- installed apps --------------------------- */

  async function loadApps(force) {
    $('apps-status').textContent = t('m.scanning');
    state.apps = await api.apps.scan({ force: !!force });
    state.appPage = 0;
    renderApps();
  }

  function filteredApps() {
    const filter = $('app-filter').value.trim().toLowerCase();
    return filter
      ? state.apps.filter((entry) => entry.label.toLowerCase().includes(filter))
      : state.apps;
  }

  function renderApps() {
    const list = $('app-list');
    list.textContent = '';

    const visible = filteredApps();
    const pageCount = Math.max(1, Math.ceil(visible.length / APPS_PER_PAGE));
    state.appPage = Math.min(Math.max(0, state.appPage), pageCount - 1);

    $('apps-status').textContent = t('m.appCount', { shown: visible.length, total: state.apps.length });

    if (!visible.length) {
      list.appendChild(emptyRow(t('m.noMatch')));
      renderPager($('app-pager'), 0, 1, () => {});
      return;
    }

    const start = state.appPage * APPS_PER_PAGE;
    for (const entry of visible.slice(start, start + APPS_PER_PAGE)) {
      const row = document.createElement('li');

      const img = document.createElement('img');
      img.src = entry.iconUrl || Glyphs.get('unknown');
      img.alt = '';
      img.addEventListener('error', () => { img.src = Glyphs.get('unknown'); }, { once: true });

      const meta = document.createElement('div');
      meta.className = 'meta';
      const label = document.createElement('div');
      label.className = 'label';
      label.textContent = entry.label;
      const target = document.createElement('div');
      target.className = 'target';
      target.textContent = entry.path;
      meta.append(label, target);

      const add = document.createElement('button');
      add.className = 'icon-btn primary';
      add.textContent = t('b.add');
      add.addEventListener('click', async () => {
        state.items = await api.items.add({
          type: 'app', label: entry.label, path: entry.path, args: entry.args || '', icon: entry.icon || '',
        });
        renderItems();
        toast(`Added ${entry.label}`);
      });

      row.append(img, meta, add);
      list.appendChild(row);
    }

    renderPager($('app-pager'), state.appPage, pageCount, (page) => {
      state.appPage = page;
      renderApps();
    });

    applyLockState();
  }

  /* ------------------------------ previews ------------------------------ */

  /**
   * The drag-off sample. It borrows the dock's own classes from
   * css/effects.css, so choosing an effect here shows the animation the dock
   * will really play rather than an impression of it.
   */
  const REMOVE_EFFECTS = {
    poof: 520, shrink: 380, fade: 260, drop: 460, suck: 440, shatter: 460, none: 0,
  };

  let removeDemoTimer = null;

  /** The sample icon, sitting still. */
  function drawRemoveSample() {
    const node = $('remove-preview');
    if (!node || !state.cfg) return null;

    clearTimeout(removeDemoTimer);
    node.textContent = '';
    node.className = 'remove-preview';

    const inner = document.createElement('div');
    inner.className = 'icon-inner';
    const img = document.createElement('img');
    img.src = Glyphs.get('folder');
    img.alt = '';
    inner.appendChild(img);
    node.appendChild(inner);
    return { node, inner, img };
  }

  function playRemovePreview() {
    const drawn = drawRemoveSample();
    if (!drawn) return;
    const { node, inner, img } = drawn;

    const name = state.cfg.dock.removeEffect;
    const effect = Object.prototype.hasOwnProperty.call(REMOVE_EFFECTS, name) ? name : 'poof';
    const ms = REMOVE_EFFECTS[effect];
    if (!ms) return;

    // A frame's grace, so the animation starts from the icon actually drawn.
    requestAnimationFrame(() => {
      node.classList.add('vanishing', `vanish-${effect}`);
      if (effect === 'poof') node.appendChild(removePuff());
      if (effect === 'shatter') node.appendChild(removeShards(img.src));
      // Put the icon back afterwards, so the sample can be played again.
      removeDemoTimer = setTimeout(() => {
        node.className = 'remove-preview';
        node.textContent = '';
        node.appendChild(inner);
        inner.removeAttribute('style');
      }, ms + 120);
    });
  }

  function removePuff() {
    const wrap = document.createElement('div');
    wrap.className = 'puff';
    for (let i = 0; i < 6; i += 1) {
      const angle = ((Math.PI * 2 * i) / 6) - Math.PI / 2;
      const reach = 105 + (i % 2) * 45;
      const cloud = document.createElement('i');
      cloud.style.setProperty('--px', `${Math.round(Math.cos(angle) * reach)}%`);
      cloud.style.setProperty('--py', `${Math.round(Math.sin(angle) * reach)}%`);
      cloud.style.animationDelay = `${i * 20}ms`;
      wrap.appendChild(cloud);
    }
    return wrap;
  }

  function removeShards(src) {
    const wrap = document.createElement('div');
    wrap.className = 'shards';
    const grid = 3;
    const step = 100 / grid;
    for (let row = 0; row < grid; row += 1) {
      for (let col = 0; col < grid; col += 1) {
        const piece = document.createElement('i');
        piece.style.left = `${col * step}%`;
        piece.style.top = `${row * step}%`;
        piece.style.width = `${step}%`;
        piece.style.height = `${step}%`;
        piece.style.backgroundImage = `url("${src}")`;
        piece.style.backgroundSize = `${grid * 100}% ${grid * 100}%`;
        piece.style.backgroundPosition = `${(col * 100) / (grid - 1)}% ${(row * 100) / (grid - 1)}%`;
        const dx = col - (grid - 1) / 2;
        const dy = row - (grid - 1) / 2;
        piece.style.setProperty('--px', `${Math.round(dx * 130)}%`);
        piece.style.setProperty('--py', `${Math.round(dy * 130 + 90)}%`);
        piece.style.setProperty('--spin', `${Math.round((dx + dy) * 60)}deg`);
        wrap.appendChild(piece);
      }
    }
    return wrap;
  }

  /** A live sketch of the magnification curve using the current settings. */
  function renderZoomPreview() {
    const node = $('zoom-preview');
    if (!node || !state.cfg) return;
    const dock = state.cfg.dock;
    node.textContent = '';

    const count = 11;
    const centre = (count - 1) / 2;
    const base = 16;

    for (let i = 0; i < count; i += 1) {
      const t = (i - centre) / Math.max(0.01, dock.zoomRange);
      const scale = 1 + Math.max(0, dock.maxZoom - 1) * kernel(t, dock.animation);
      const bar = document.createElement('i');
      bar.style.height = `${Math.round(base * scale)}px`;
      bar.style.width = `${Math.round(16 * Math.min(scale, 2.2))}px`;
      node.appendChild(bar);
    }
  }

  /**
   * The second choice runs along the edge. A dock on the top or bottom offers
   * left and right; one on the left or right offers top and bottom.
   */
  function syncAlignChoices() {
    const select = $('align');
    const label = $('align-label');
    if (!select || !label || !state.cfg) return;
    const place = DockPlacement.resolve(state.cfg.dock.position, state.cfg.dock.align);
    const sides = place.vertical
      ? [['start', 'pos.top'], ['center', 'o.center'], ['end', 'pos.bottom']]
      : [['start', 'pos.left'], ['center', 'o.center'], ['end', 'pos.right']];
    label.dataset.i18n = place.vertical ? 'f.alignEnds' : 'f.alignSides';
    label.textContent = t(label.dataset.i18n);
    sides.forEach(([value, key], index) => {
      const option = select.options[index];
      option.value = value;
      option.dataset.i18n = key;
      option.textContent = t(key);
    });
    select.value = place.align;
    select.disabled = false;
  }

  /** Draw the dock on the monitor sketch, including a bar tucked into a corner. */
  function paintMonitorBar(bar, position, align) {
    const place = DockPlacement.resolve(position, align);
    bar.style[place.edge] = '3px';
    if (place.vertical) {
      bar.style.width = '5px';
      if (place.align === 'center') {
        bar.style.top = '18%';
        bar.style.bottom = '18%';
      } else {
        bar.style.height = '28%';
        bar.style[place.align === 'start' ? 'top' : 'bottom'] = '8%';
      }
      return;
    }
    bar.style.height = '5px';
    if (place.align === 'center') {
      bar.style.left = '18%';
      bar.style.right = '18%';
      return;
    }
    bar.style.width = '28%';
    bar.style[place.align === 'start' ? 'left' : 'right'] = '8%';
  }

  /** Mirrors the falloff curve used by the dock itself. */
  function kernel(t, mode) {
    const a = Math.abs(t);
    if (mode === 'none' || a >= 1) return 0;
    if (mode === 'linear') return 1 - a;
    if (mode === 'cosine') return Math.cos((a * Math.PI) / 2);
    return 1 - a * a;
  }

  /** A scaled sketch of the desktop showing which edge the dock sits on. */
  function renderMonitorMap() {
    const node = $('monitor-map');
    if (!node || !state.cfg || !state.displays.length) return;
    node.textContent = '';

    const minX = Math.min(...state.displays.map((d) => d.bounds.x));
    const minY = Math.min(...state.displays.map((d) => d.bounds.y));
    const maxX = Math.max(...state.displays.map((d) => d.bounds.x + d.bounds.width));
    const maxY = Math.max(...state.displays.map((d) => d.bounds.y + d.bounds.height));

    const pad = 8;
    const box = node.getBoundingClientRect();
    if (!box.width) return;

    const scale = Math.min(
      (box.width - pad * 2) / Math.max(1, maxX - minX),
      (box.height - pad * 2) / Math.max(1, maxY - minY),
    );
    const offsetX = pad + ((box.width - pad * 2) - (maxX - minX) * scale) / 2;
    const offsetY = pad + ((box.height - pad * 2) - (maxY - minY) * scale) / 2;

    const chosen = String(state.cfg.dock.display);
    for (const display of state.displays) {
      const active = chosen === display.id
        || (chosen === 'primary' && display.primary)
        || chosen === 'cursor';

      const screen = document.createElement('div');
      screen.className = `screen${active ? ' active' : ''}`;
      screen.style.left = `${offsetX + (display.bounds.x - minX) * scale}px`;
      screen.style.top = `${offsetY + (display.bounds.y - minY) * scale}px`;
      screen.style.width = `${display.bounds.width * scale}px`;
      screen.style.height = `${display.bounds.height * scale}px`;
      screen.textContent = display.primary ? 'Primary' : '';

      if (active) {
        const bar = document.createElement('div');
        bar.className = 'bar';
        paintMonitorBar(bar, state.cfg.dock.position, state.cfg.dock.align);
        screen.appendChild(bar);
      }
      node.appendChild(screen);
    }
  }

  /* ------------------------------ displays ------------------------------ */

  async function renderDisplays() {
    const select = $('display');
    state.displays = await api.system.displays();
    select.textContent = '';

    const primary = document.createElement('option');
    primary.value = 'primary';
    primary.textContent = 'Primary monitor';
    select.appendChild(primary);

    const cursor = document.createElement('option');
    cursor.value = 'cursor';
    cursor.textContent = 'Monitor with the pointer';
    select.appendChild(cursor);

    for (const display of state.displays) {
      const option = document.createElement('option');
      option.value = display.id;
      option.textContent = `${display.label} (${display.bounds.width}×${display.bounds.height})`;
      select.appendChild(option);
    }
    select.value = String(state.cfg.dock.display);
  }

  /* ------------------------------ actions ------------------------------- */

  function setupActions() {
    $('open-theme-folder').addEventListener('click', () => api.themes.openFolder());

    $('add-app').addEventListener('click', async () => {
      if (locked()) { toast(t('m.locked')); return; }
      await api.dialog.addApp();
      state.items = await api.items.get();
      renderItems();
    });

    $('add-folder').addEventListener('click', async () => {
      if (locked()) { toast(t('m.locked')); return; }
      await api.dialog.addFolder();
      state.items = await api.items.get();
      renderItems();
    });

    $('add-separator').addEventListener('click', async () => {
      if (locked()) { toast(t('m.locked')); return; }
      state.items = await api.items.add({ type: 'separator', label: '', path: '' });
      state.itemPage = Math.floor((state.items.length - 1) / ITEMS_PER_PAGE);
      renderItems();
    });

    $('add-url').addEventListener('click', async () => {
      if (locked()) { toast(t('m.locked')); return; }
      state.items = await api.items.add({ type: 'url', label: 'New link', path: 'https://example.com' });
      state.itemPage = Math.floor((state.items.length - 1) / ITEMS_PER_PAGE);
      renderItems();
      openEditor(state.items[state.items.length - 1].id);
    });

    $('rescan').addEventListener('click', () => loadApps(true));
    $('app-filter').addEventListener('input', () => { state.appPage = 0; renderApps(); });

    $('cfg-export').addEventListener('click', async () => {
      const result = await api.config.export();
      if (result.ok) toast('Settings exported.');
    });

    $('cfg-import').addEventListener('click', async () => {
      const result = await api.config.import();
      if (result.ok) toast('Settings imported.');
      else if (result.error) toast(`Import failed: ${result.error}`);
    });

    $('cache-clear').addEventListener('click', async () => {
      await api.system.clearIconCache();
      toast('Icon cache cleared.');
    });

    $('cfg-reset').addEventListener('click', async () => {
      await api.config.reset();
      toast('Settings reset to defaults.');
    });

    $('cfg-ok').addEventListener('click', () => api.settings.ok());
    $('quit-app').addEventListener('click', () => api.app.quit());

    // Escape closes the icon picker first, then the window.
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!$('icon-picker').classList.contains('hidden')) closeIconPicker();
      else api.settings.ok();
    });

    api.settings.onFocusItem((id) => {
      const index = state.items.findIndex((it) => it.id === id);
      if (index >= 0) state.itemPage = Math.floor(index / ITEMS_PER_PAGE);
      showTab('items');
      renderItems();
      openEditor(id);
    });
  }

  /* ------------------------------- apply -------------------------------- */

  function applySnapshot(snapshot) {
    state.cfg = snapshot;
    state.applying = true;

    if (t.locale !== snapshot.resolvedLocale) {
      t = I18n.make(snapshot.resolvedLocale);
      applyTranslations();
      for (const entry of Object.values(ranges)) entry.show();
    }

    const dock = snapshot.dock;
    for (const [id, entry] of Object.entries(ranges)) {
      entry.input.value = String(dock[id]);
      entry.show();
    }

    $('animation').value = dock.animation;
    $('clickEffect').value = dock.clickEffect;
    $('clickEffectDirection').value = dock.clickEffectDirection;
    $('removeEffect').value = dock.removeEffect;
    $('position').value = dock.position;
    syncAlignChoices();
    $('stackingLevel').value = dock.stackingLevel;
    $('locale').value = snapshot.locale;
    if ($('display').options.length) $('display').value = String(dock.display);

    for (const id of ['showLabels', 'showReflection', 'showRunningIndicator',
      'showRunningApps', 'focusRunningWindow', 'autoHide',
      'showOnAllWorkspaces', 'showInTaskbar', 'lockItems']) {
      $(id).checked = !!dock[id];
    }
    $('startWithOS').checked = !!snapshot.startWithOS;

    $('about-version').textContent = `v${snapshot.version}`;
    const platform = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' }[snapshot.platform]
      || snapshot.platform;
    $('about-platform').textContent = t('m.runningOn', { platform });

    applyChrome(snapshot.theme);

    state.applying = false;

    for (const card of document.querySelectorAll('.theme-card')) {
      card.classList.toggle('selected', card.dataset.id === snapshot.themeId);
    }
    renderZoomPreview();
    renderMonitorMap();
    drawRemoveSample();
    applyLockState();
  }

  /**
   * Repaint the settings window with the palette the active theme ships, so
   * choosing a dock theme re-skins the whole application. Themes without a
   * `ui` block fall back to the stylesheet's own light/dark defaults.
   */
  function applyChrome(theme) {
    const root = document.documentElement;
    for (const name of Array.from(root.style)) {
      if (name.startsWith('--')) root.style.removeProperty(name);
    }
    root.dataset.theme = theme && theme.dark === false ? 'light' : 'dark';
    if (!theme || !theme.ui) return;
    for (const [key, value] of Object.entries(theme.ui)) {
      root.style.setProperty(key.startsWith('--') ? key : `--${key}`, String(value));
    }
  }

  async function boot() {
    decorateTabs();
    setupBindings();
    setupTabs();
    setupActions();
    setupItemDrag();
    setupItemDrop();

    const snapshot = await api.config.get();
    applySnapshot(snapshot);
    await renderDisplays();
    await renderThemes();

    state.items = await api.items.get();
    renderItems();
    applySnapshot(snapshot);

    api.config.onChange(async (next) => {
      const localeChanged = next.resolvedLocale !== state.cfg.resolvedLocale;
      applySnapshot(next);
      state.items = await api.items.get();
      renderItems();
      if (localeChanged) await renderThemes();
    });
  }

  window.addEventListener('error', (event) => {
    api.app.reportError(event.error || event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    api.app.reportError(event.reason);
  });

  boot().catch((err) => {
    api.app.reportError(err);
    toast(`Failed to load settings: ${err.message}`);
  });
})();
