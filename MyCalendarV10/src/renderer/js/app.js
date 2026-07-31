(() => {
  const IS_ELECTRON = !!window.IS_ELECTRON;
  const $ = (s) => document.querySelector(s);
  const pad = CalendarView.pad;

  const state = {
    currentDate: new Date(),
    view: 'month',
    weekStart: 0,
    theme: 'dark',
    language: 'ko',
    bgOpacity: 100,
    events: [],
    calendars: [],
    calMap: {},
    editingId: null,
  };

  const root = $('#calendarView');
  const T = (k) => I18N.t(k);

  // ---------- appearance ----------
  function applyTheme(theme) {
    state.theme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', state.theme);
  }
  function applyLanguage(lang) {
    state.language = lang === 'en' ? 'en' : 'ko';
    I18N.setLang(state.language);
    I18N.applyDom(document);
  }
  function applyOpacity(pct) {
    state.bgOpacity = Math.min(100, Math.max(40, parseInt(pct, 10) || 100));
    const alpha = state.bgOpacity / 100;
    // Electron: real OS-level window transparency (reliable). Web: CSS fallback.
    if (IS_ELECTRON && window.electron.setWindowOpacity) {
      window.electron.setWindowOpacity(alpha);
    } else {
      document.documentElement.style.setProperty('--app-bg-alpha', alpha.toFixed(2));
    }
    const label = $('#bgOpacityVal');
    if (label) label.textContent = state.bgOpacity + '%';
  }

  // ---------- data ----------
  async function loadCalendars() {
    state.calendars = await API.listCalendars();
    state.calMap = {};
    state.calendars.forEach(c => { state.calMap[c.id] = { color: c.color, visible: !!c.visible }; });
    renderCalList();
    fillCalendarSelect();
  }

  async function loadEvents() {
    const { from, to } = CalendarView.rangeFor(state);
    state.events = await API.listEvents(from.toISOString(), to.toISOString());
  }

  async function refresh() {
    await loadEvents();
    render();
  }

  function render() {
    $('#periodLabel').textContent = CalendarView.periodLabel(state);
    CalendarView.render(root, state, handlers);
    renderMiniCal();
    updateStatusBar();
    updateToggleButtons();
  }

  // ---------- status bar ----------
  function updateStatusBar() {
    $('#sbView').textContent = T('view_' + state.view);
    const n = state.events.length;
    $('#sbCount').textContent = I18N.getLang() === 'en' ? `${n} ${T('sb_events')}` : `${n}${T('sb_events')}`;
    try {
      $('#sbSelected').textContent = new Intl.DateTimeFormat(I18N.locale(), { dateStyle: 'full' }).format(state.currentDate);
    } catch { $('#sbSelected').textContent = ''; }
  }

  async function refreshGoogleStatusBar() {
    const el = $('#sbGoogle');
    try {
      const st = await API.googleStatus();
      if (st.connected) {
        const time = st.lastSync
          ? ' · ' + new Date(st.lastSync).toLocaleTimeString(I18N.locale(), { hour: '2-digit', minute: '2-digit' })
          : '';
        el.innerHTML = `<span class="sb-dot on"></span>${escapeHtml(st.email || T('g_connected'))}${time}`;
      } else {
        el.innerHTML = `<span class="sb-dot off"></span>${T('g_notConnected')}`;
      }
    } catch { el.innerHTML = `<span class="sb-dot off"></span>—`; }
  }
  $('#sbGoogle').addEventListener('click', openGoogleModal);

  // ---------- calendar handlers ----------
  const handlers = {
    // single click selects the day (stays in the current view)
    onDayClick: (d) => { state.currentDate = d; refresh(); },
    // clicking the date number jumps to the day view
    onDayNumClick: (d) => { state.currentDate = d; state.view = 'day'; syncViewButtons(); refresh(); },
    onDayDblClick: (d) => openEventEditor(null, d),
    onSlotClick: (d) => openEventEditor(null, d),
    onEventClick: (id) => { const ev = state.events.find(e => e.id === id); if (ev) openEventEditor(ev); },
    onMore: (d) => { state.currentDate = d; state.view = 'day'; syncViewButtons(); refresh(); },
  };

  // ---------- toolbar ----------
  function step(dir) {
    const d = state.currentDate;
    if (state.view === 'month') state.currentDate = new Date(d.getFullYear(), d.getMonth() + dir, 1);
    else if (state.view === 'week') state.currentDate = CalendarView.addDays(d, 7 * dir);
    else if (state.view === 'day') state.currentDate = CalendarView.addDays(d, dir);
    else state.currentDate = CalendarView.addDays(d, 30 * dir);
    refresh();
  }

  function syncViewButtons() {
    document.querySelectorAll('#viewSwitch button').forEach(b =>
      b.classList.toggle('active', b.dataset.view === state.view));
  }

  $('#btnToday').addEventListener('click', () => { state.currentDate = new Date(); refresh(); });
  $('#btnPrev').addEventListener('click', () => step(-1));
  $('#btnNext').addEventListener('click', () => step(1));
  document.querySelectorAll('#viewSwitch button').forEach(b =>
    b.addEventListener('click', () => { state.view = b.dataset.view; syncViewButtons(); refresh(); }));

  // sidebar collapse/expand (persisted in localStorage)
  const appEl = document.getElementById('app');
  $('#btnToggleSidebar').addEventListener('click', () => {
    const collapsed = !appEl.classList.contains('sidebar-collapsed');
    appEl.classList.toggle('sidebar-collapsed', collapsed);
    try { localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0'); } catch {}
  });
  try { if (localStorage.getItem('sidebarCollapsed') === '1') appEl.classList.add('sidebar-collapsed'); } catch {}

  // frameless window controls (Electron only)
  if (IS_ELECTRON && window.electron.windowControls) {
    const wc = window.electron.windowControls;
    $('#winControls').style.display = 'flex';
    const updateMax = async () => {
      const m = await wc.isMaximized();
      $('#winMax').innerHTML = m ? '&#x2750;' : '&#x25A1;';
      $('#winMax').title = m ? '이전 크기로' : '최대화';
    };
    $('#winMin').addEventListener('click', () => wc.minimize());
    $('#winMax').addEventListener('click', async () => { await wc.maximizeToggle(); updateMax(); });
    $('#winClose').addEventListener('click', () => wc.close());
    // double-clicking the empty toolbar toggles maximize (standard title-bar behavior)
    document.querySelector('.toolbar').addEventListener('dblclick', async (e) => {
      if (e.target.closest('button') || e.target.closest('.view-switch')) return;
      await wc.maximizeToggle(); updateMax();
    });
    updateMax();
  }

  // language & theme quick-toggle buttons — show the TARGET to switch to
  function updateToggleButtons() {
    // in Korean → offer English; in English → offer 한국어
    const l = $('#langLabel'); if (l) l.textContent = state.language === 'ko' ? 'English' : '한국어';
    // in Dark → offer Light; in Light → offer Dark
    const t = $('#themeLabel'); if (t) t.textContent = T(state.theme === 'dark' ? 'theme_light' : 'theme_dark');
    const i = $('#themeIco'); if (i) i.textContent = state.theme === 'dark' ? '☀️' : '🌙';
  }
  $('#btnLang').addEventListener('click', async () => {
    const next = state.language === 'ko' ? 'en' : 'ko';
    applyLanguage(next); render();
    try { await API.saveSettings({ language: next }); } catch {}
  });
  $('#btnTheme').addEventListener('click', async () => {
    const next = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next); updateToggleButtons();
    try { await API.saveSettings({ theme: next }); } catch {}
  });

  // ---------- right-click context menu (icon + label) ----------
  const ctxMenu = $('#contextMenu');
  function hideContextMenu() { ctxMenu.classList.add('hidden'); }
  function showContextMenu(x, y, items) {
    ctxMenu.innerHTML = items.map((it, i) => it.separator
      ? '<div class="ctx-sep"></div>'
      : `<div class="ctx-item ${it.danger ? 'danger' : ''}" data-i="${i}">
           <span class="ctx-ico">${it.icon}</span><span class="ctx-label">${escapeHtml(it.label)}</span></div>`).join('');
    ctxMenu.style.left = x + 'px';
    ctxMenu.style.top = y + 'px';
    ctxMenu.classList.remove('hidden');
    // keep the menu on screen
    const r = ctxMenu.getBoundingClientRect();
    if (r.right > window.innerWidth) ctxMenu.style.left = Math.max(4, x - r.width) + 'px';
    if (r.bottom > window.innerHeight) ctxMenu.style.top = Math.max(4, y - r.height) + 'px';
    ctxMenu.querySelectorAll('.ctx-item').forEach(el =>
      el.addEventListener('click', () => {
        const it = items[parseInt(el.dataset.i, 10)];
        hideContextMenu();
        if (it && it.action) it.action();
      }));
  }

  root.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const evEl = e.target.closest('[data-ev]');
    const dayEl = e.target.closest('.day-cell, .tg-day-col');
    let items;
    if (evEl) {
      const id = parseInt(evEl.dataset.ev, 10);
      const ev = state.events.find(x => x.id === id);
      items = [
        { icon: '✏️', label: T('ctx_edit'), action: () => ev && openEventEditor(ev) },
        { icon: '📄', label: T('ctx_duplicate'), action: () => ev && duplicateEvent(ev) },
        { separator: true },
        { icon: '🗑️', label: T('ctx_delete'), danger: true, action: () => quickDelete(id) },
      ];
    } else {
      const presetDate = dayEl && dayEl.dataset.date ? new Date(dayEl.dataset.date) : null;
      items = [
        { icon: '➕', label: T('ctx_newEvent'), action: () => openEventEditor(null, presetDate) },
        { icon: '📅', label: T('ctx_today'), action: () => { state.currentDate = new Date(); refresh(); } },
        { separator: true },
        { icon: '🔄', label: T('ctx_sync'), action: doSync },
        { icon: '⚙️', label: T('ctx_settings'), action: () => $('#btnSettings').click() },
      ];
    }
    showContextMenu(e.clientX, e.clientY, items);
  });

  document.addEventListener('click', hideContextMenu);
  document.addEventListener('scroll', hideContextMenu, true);
  window.addEventListener('blur', hideContextMenu);
  window.addEventListener('resize', hideContextMenu);

  async function duplicateEvent(ev) {
    try {
      await API.createEvent({
        title: `${ev.title} (${T('copySuffix')})`,
        calendarId: ev.calendarId, location: ev.location, description: ev.description,
        start: ev.start, end: ev.end, allDay: ev.allDay, reminderMinutes: ev.reminderMinutes,
      });
      await refresh();
      toast(T('t_saved'));
    } catch (err) { toast(err.message, true); }
  }
  async function quickDelete(id) {
    if (!confirm(T('c_confirmDelete'))) return;
    try { await API.deleteEvent(id); await refresh(); toast(T('t_deleted')); }
    catch (err) { toast(err.message, true); }
  }

  // ---------- mini calendar ----------
  function renderMiniCal() {
    const el = $('#miniCal');
    const base = state.currentDate;
    const first = new Date(base.getFullYear(), base.getMonth(), 1);
    const start = CalendarView.weekStartOf(first, state.weekStart);
    let html = `<div class="mini-cal-head"><button id="miniPrev">‹</button>
      <span>${base.getFullYear()}.${pad(base.getMonth() + 1)}</span>
      <button id="miniNext">›</button></div><div class="mini-grid">`;
    const dowNames = CalendarView.dowNames();
    for (let i = 0; i < 7; i++) html += `<div class="dow">${dowNames[(state.weekStart + i) % 7]}</div>`;
    for (let i = 0; i < 42; i++) {
      const d = CalendarView.addDays(start, i);
      const cls = ['cell'];
      if (d.getMonth() !== base.getMonth()) cls.push('other');
      if (CalendarView.isToday(d)) cls.push('today');
      if (CalendarView.sameDay(d, state.currentDate)) cls.push('sel');
      if (d.getDay() === 0) cls.push('sun'); else if (d.getDay() === 6) cls.push('sat');
      html += `<div class="${cls.join(' ')}" data-d="${d.toISOString()}">${d.getDate()}</div>`;
    }
    html += '</div>';
    el.innerHTML = html;
    $('#miniPrev').addEventListener('click', () => { state.currentDate = new Date(base.getFullYear(), base.getMonth() - 1, 1); render(); });
    $('#miniNext').addEventListener('click', () => { state.currentDate = new Date(base.getFullYear(), base.getMonth() + 1, 1); render(); });
    el.querySelectorAll('.cell').forEach(c =>
      c.addEventListener('click', () => { state.currentDate = new Date(c.dataset.d); refresh(); }));
  }

  // ---------- calendar list ----------
  function renderCalList() {
    const ul = $('#calList');
    ul.innerHTML = '';
    state.calendars.forEach(c => {
      const li = document.createElement('li');
      if (!c.visible) li.classList.add('hidden-cal');
      li.innerHTML = `<span class="cal-dot" style="background:${c.color}"></span>
        <span class="cal-name">${escapeHtml(c.name)}</span>
        <button class="icon-btn cal-edit" title="${T('editCalendar')}">✎</button>`;
      // click the row (dot/name) toggles visibility
      li.addEventListener('click', async (e) => {
        if (e.target.closest('.cal-edit')) return;
        await API.updateCalendar(c.id, { visible: c.visible ? 0 : 1 });
        await loadCalendars(); render();
      });
      // edit button opens the edit modal
      li.querySelector('.cal-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        openCalendarModal(c);
      });
      ul.appendChild(li);
    });
  }

  // ---------- calendar add / edit modal ----------
  const CAL_PALETTE = ['#6366f1', '#3b82f6', '#22d3ee', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#a855f7', '#14b8a6', '#64748b'];
  let editingCalId = null;
  let selectedCalColor = CAL_PALETTE[0];

  function renderSwatches() {
    $('#calSwatches').innerHTML = CAL_PALETTE.map(col =>
      `<span class="swatch ${col === selectedCalColor ? 'selected' : ''}" data-col="${col}" style="background:${col}"></span>`).join('');
    $('#calSwatches').querySelectorAll('.swatch').forEach(s =>
      s.addEventListener('click', () => { selectedCalColor = s.dataset.col; renderSwatches(); }));
  }

  function openCalendarModal(cal) {
    editingCalId = cal ? cal.id : null;
    $('#calendarModalTitle').textContent = cal ? T('editCalendar') : T('addCalendar');
    $('#calName').value = cal ? cal.name : '';
    selectedCalColor = cal ? cal.color : CAL_PALETTE[0];
    renderSwatches();
    // default calendar cannot be deleted; hide delete for "add"
    $('#btnDeleteCalendar').style.display = (cal && !cal.is_default) ? 'inline-block' : 'none';
    showModal('#calendarModal');
    setTimeout(() => $('#calName').focus(), 50);
  }

  $('#btnSaveCalendar').addEventListener('click', async () => {
    const name = $('#calName').value.trim();
    if (!name) return toast(T('t_needTitle'), true);
    try {
      if (editingCalId) await API.updateCalendar(editingCalId, { name, color: selectedCalColor });
      else await API.createCalendar({ name, color: selectedCalColor });
      hideModal('#calendarModal');
      await loadCalendars(); render();
      toast(T('t_saved'));
    } catch (err) { toast(err.message, true); }
  });

  $('#btnDeleteCalendar').addEventListener('click', async () => {
    if (!editingCalId || !confirm(T('c_confirmDeleteCal'))) return;
    try {
      await API.deleteCalendar(editingCalId);
      hideModal('#calendarModal');
      await loadCalendars(); await refresh();
      toast(T('t_deleted'));
    } catch (err) { toast(err.message, true); }
  });

  function fillCalendarSelect() {
    const sel = $('#evCalendar');
    sel.innerHTML = state.calendars.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  $('#btnAddCal').addEventListener('click', () => openCalendarModal(null));

  // ---------- event editor ----------
  function toLocalInput(dateStr) {
    const d = new Date(dateStr);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function fromLocalInput(v) { return new Date(v).toISOString(); }

  // ---- custom date-time controls (date + hour/min: dropdown + typing + ‹ › steppers) ----
  function clampInt(v, min, max) { v = parseInt(v, 10); if (isNaN(v)) return min; return Math.max(min, Math.min(max, v)); }
  function setDT(prefix, iso) {
    const d = new Date(iso);
    $('#ev' + prefix + 'Date').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    $('#ev' + prefix + 'Hour').value = pad(d.getHours());
    $('#ev' + prefix + 'Min').value = pad(d.getMinutes());
  }
  function readDT(prefix) {
    const date = $('#ev' + prefix + 'Date').value;
    if (!date) return null;
    return { date, h: pad(clampInt($('#ev' + prefix + 'Hour').value, 0, 23)), m: pad(clampInt($('#ev' + prefix + 'Min').value, 0, 59)) };
  }
  (function setupDateTimeControls() {
    const hrs = $('#dlHours'), mins = $('#dlMins');
    if (hrs) hrs.innerHTML = Array.from({ length: 24 }, (_, i) => `<option value="${pad(i)}">`).join('');
    if (mins) mins.innerHTML = Array.from({ length: 12 }, (_, i) => `<option value="${pad(i * 5)}">`).join('');
    document.querySelectorAll('.dt-btn').forEach(btn => btn.addEventListener('click', () => {
      const inp = document.getElementById(btn.dataset.inp);
      const max = btn.dataset.part === 'h' ? 23 : 59;
      let v = clampInt(inp.value, 0, max);
      v = (v + parseInt(btn.dataset.dir, 10) + (max + 1)) % (max + 1);
      inp.value = pad(v);
    }));
    [['evStartHour', 23], ['evEndHour', 23], ['evStartMin', 59], ['evEndMin', 59]].forEach(([id, max]) => {
      const el = $('#' + id);
      if (el) el.addEventListener('blur', () => { el.value = pad(clampInt(el.value, 0, max)); });
    });
  })();

  // 20 pastel presets + a "default (calendar color)" option + custom picker
  const EVENT_PALETTE = [
    '#FFADAD', '#FFC09F', '#FFD6A5', '#FDFFB6', '#E4F1AB', '#CAFFBF', '#B9FBC0', '#98F5E1',
    '#8EECF5', '#9BF6FF', '#A0C4FF', '#A3C4F3', '#BDB2FF', '#CFBAF0', '#E0AAFF', '#FFC6FF',
    '#F1C0E8', '#FBB1BD', '#FDE4CF', '#FBF8CC',
  ];
  let selectedEventColor = null; // null = inherit calendar color

  function renderEventColorSwatches() {
    const box = $('#evColorSwatches');
    let html = `<span class="ev-swatch default ${selectedEventColor === null ? 'selected' : ''}" data-col="" title="${T('color_default')}"></span>`;
    html += EVENT_PALETTE.map(c =>
      `<span class="ev-swatch ${selectedEventColor && selectedEventColor.toUpperCase() === c ? 'selected' : ''}" data-col="${c}" style="background:${c}"></span>`).join('');
    const isCustom = selectedEventColor && !EVENT_PALETTE.includes(selectedEventColor.toUpperCase());
    html += `<label class="ev-swatch custom ${isCustom ? 'selected' : ''}" title="${T('color_custom')}"
      style="${isCustom ? `background:${selectedEventColor}` : ''}">${isCustom ? '' : '+'}
      <input type="color" id="evCustomColor" value="${selectedEventColor || '#6366f1'}" /></label>`;
    box.innerHTML = html;
    box.querySelectorAll('.ev-swatch[data-col]').forEach(s =>
      s.addEventListener('click', () => { selectedEventColor = s.dataset.col || null; renderEventColorSwatches(); }));
    $('#evCustomColor').addEventListener('input', (e) => { selectedEventColor = e.target.value; renderEventColorSwatches(); });
  }

  function openEventEditor(ev, presetDate) {
    state.editingId = ev ? ev.id : null;
    $('#eventModalTitle').textContent = ev ? T('title_edit') : T('title_new');
    $('#btnDeleteEvent').style.display = ev ? 'inline-block' : 'none';

    let start, end, allDay;
    if (ev) {
      start = ev.start; end = ev.end; allDay = ev.allDay;
      $('#evTitle').value = ev.title || '';
      $('#evLocation').value = ev.location || '';
      $('#evDescription').value = ev.description || '';
      $('#evCalendar').value = ev.calendarId || '';
      $('#evReminder').value = ev.reminderMinutes != null ? String(ev.reminderMinutes) : '';
      selectedEventColor = ev.color || null;
    } else {
      const base = presetDate || new Date();
      const s = new Date(base);
      if (s.getHours() === 0 && s.getMinutes() === 0 && !presetDate) s.setHours(9);
      const e = new Date(s); e.setHours(s.getHours() + 1);
      start = s.toISOString(); end = e.toISOString(); allDay = false;
      $('#evTitle').value = ''; $('#evLocation').value = ''; $('#evDescription').value = '';
      $('#evReminder').value = '';
      selectedEventColor = null;
      const def = state.calendars.find(c => c.is_default) || state.calendars[0];
      if (def) $('#evCalendar').value = def.id;
    }
    $('#evAllDay').checked = !!allDay;
    setDT('Start', start);
    setDT('End', end);
    renderEventColorSwatches();
    toggleAllDayInputs();
    showModal('#eventModal');
    setTimeout(() => $('#evTitle').focus(), 50);
  }

  function toggleAllDayInputs() {
    const allDay = $('#evAllDay').checked;
    $('#evStartTime').style.display = allDay ? 'none' : 'inline-flex';
    $('#evEndTime').style.display = allDay ? 'none' : 'inline-flex';
  }
  $('#evAllDay').addEventListener('change', toggleAllDayInputs);

  $('#btnSaveEvent').addEventListener('click', async () => {
    const allDay = $('#evAllDay').checked;
    const title = $('#evTitle').value.trim();
    if (!title) return toast(T('t_needTitle'), true);

    const s = readDT('Start'), e = readDT('End');
    if (!s || !e) return toast(T('t_endAfterStart'), true);
    let start, end;
    if (allDay) {
      start = new Date(s.date + 'T00:00:00').toISOString();
      // Google all-day end is exclusive → next day
      const ed = new Date((e.date || s.date) + 'T00:00:00'); ed.setDate(ed.getDate() + 1);
      end = ed.toISOString();
    } else {
      start = new Date(`${s.date}T${s.h}:${s.m}:00`).toISOString();
      end = new Date(`${e.date}T${e.h}:${e.m}:00`).toISOString();
      if (new Date(end) <= new Date(start)) return toast(T('t_endAfterStart'), true);
    }

    const payload = {
      title,
      calendarId: parseInt($('#evCalendar').value, 10) || null,
      location: $('#evLocation').value.trim() || null,
      description: $('#evDescription').value.trim() || null,
      start, end, allDay,
      color: selectedEventColor,
      reminderMinutes: $('#evReminder').value === '' ? null : parseInt($('#evReminder').value, 10),
    };
    try {
      if (state.editingId) await API.updateEvent(state.editingId, payload);
      else await API.createEvent(payload);
      hideModal('#eventModal');
      await refresh();
      toast(T('t_saved'));
    } catch (err) { toast(err.message, true); }
  });

  $('#btnDeleteEvent').addEventListener('click', async () => {
    if (!state.editingId || !confirm(T('c_confirmDelete'))) return;
    try {
      await API.deleteEvent(state.editingId);
      hideModal('#eventModal');
      await refresh();
      toast(T('t_deleted'));
    } catch (err) { toast(err.message, true); }
  });

  $('#btnNewEvent').addEventListener('click', () => openEventEditor(null));

  // ---------- Google modal ----------
  $('#btnGoogle').addEventListener('click', openGoogleModal);
  async function openGoogleModal() {
    showModal('#googleModal');
    await renderGoogleBody();
  }

  async function renderGoogleBody() {
    const body = $('#googleBody');
    body.innerHTML = `<p class="muted">${T('g_loading')}</p>`;
    let st;
    try { st = await API.googleStatus(); } catch (e) { body.innerHTML = `<p class="muted">${e.message}</p>`; return; }

    if (st.connected) {
      body.innerHTML = `
        <div class="g-status ok"><strong>${T('g_connected')}</strong><br>${escapeHtml(st.email || '')}
        ${st.lastSync ? `<br><span class="muted">${T('g_lastSync')}: ${new Date(st.lastSync).toLocaleString(I18N.locale())}</span>` : ''}</div>
        <button id="gSync" class="btn btn-primary" style="width:100%;margin-bottom:8px">${T('g_syncNow')}</button>
        <button id="gDisconnect" class="btn btn-outline" style="width:100%">${T('g_disconnect')}</button>`;
      $('#gSync').addEventListener('click', doSync);
      $('#gDisconnect').addEventListener('click', async () => {
        await API.googleDisconnect(); await renderGoogleBody(); refreshGoogleStatusBar(); toast(T('t_disconnected'));
      });
      return;
    }

    // Credentials available (developer-embedded or previously saved) →
    // the user only needs to sign in and consent in the browser.
    if (st.hasCredentials) {
      body.innerHTML = `
        <div class="g-status no">${T('g_notConnected')}</div>
        <p class="help">${T('g_signinHelp')}</p>
        <button id="gSignin" class="btn btn-primary" style="width:100%">${T('g_signin')}</button>`;
      $('#gSignin').addEventListener('click', startGoogleSignin);
      return;
    }

    // No credentials anywhere → fall back to manual entry (developer setup)
    body.innerHTML = `
      <div class="g-status no">${T('g_notConnected')}</div>
      <div class="help">
        <strong>${T('g_step1')}</strong>
        <ol>
          <li><a href="#" id="gcLink">Google Cloud Console</a>${T('g_s1')}</li>
          <li>${T('g_s2')}</li>
          <li>${T('g_s3')}</li>
        </ol>
      </div>
      <input type="text" id="gClientId" class="input" placeholder="${T('g_clientId')}" style="margin-bottom:8px" />
      <input type="password" id="gClientSecret" class="input" placeholder="${T('g_clientSecret')}" style="margin-bottom:12px" />
      <button id="gConnect" class="btn btn-primary" style="width:100%">${T('g_connect')}</button>`;

    $('#gcLink').addEventListener('click', (e) => { e.preventDefault(); openExternal('https://console.cloud.google.com/apis/credentials'); });
    $('#gConnect').addEventListener('click', async () => {
      const clientId = $('#gClientId').value.trim(), clientSecret = $('#gClientSecret').value.trim();
      if (!clientId || !clientSecret) return toast(T('t_needCreds'), true);
      try {
        await API.googleSaveCreds({ clientId, clientSecret });
        const { url } = await API.googleAuthUrl();
        openExternal(url);
        body.innerHTML = `<div class="g-status">${T('g_afterLogin')}</div>
          <button id="gDone" class="btn btn-primary" style="width:100%">${T('g_checkStatus')}</button>`;
        $('#gDone').addEventListener('click', renderGoogleBody);
      } catch (err) { toast(err.message, true); }
    });
  }

  // Launch the Google consent flow (used when credentials are already available).
  async function startGoogleSignin() {
    try {
      const { url } = await API.googleAuthUrl();
      openExternal(url);
      $('#googleBody').innerHTML = `<div class="g-status">${T('g_afterLogin')}</div>
        <button id="gDone" class="btn btn-primary" style="width:100%">${T('g_checkStatus')}</button>`;
      $('#gDone').addEventListener('click', renderGoogleBody);
    } catch (err) { toast(err.message, true); }
  }

  async function doSync() {
    const btn = $('#btnSync');
    const lbl = btn.querySelector('.lbl');
    if (lbl) lbl.textContent = T('syncing');
    btn.disabled = true;
    try {
      const st = await API.googleStatus();
      if (!st.connected) { openGoogleModal(); return; }
      const r = await API.googleSync();
      const s = r.summary;
      await refresh();
      refreshGoogleStatusBar();
      if ($('#googleModal').classList.contains('hidden') === false) await renderGoogleBody();
      toast(`${T('t_syncDone')} · ↑${s.pushedCreated + s.pushedUpdated + s.pushedDeleted} ↓${s.pulledCreated + s.pulledUpdated + s.pulledDeleted}`);
    } catch (err) { toast(T('t_syncFail') + ': ' + err.message, true); }
    finally { if (lbl) lbl.textContent = T('sync_label'); btn.disabled = false; }
  }
  $('#btnSync').addEventListener('click', doSync);

  // ---------- settings ----------
  let settingsSnapshot = null;
  $('#btnSettings').addEventListener('click', async () => {
    settingsSnapshot = { theme: state.theme, language: state.language, bgOpacity: state.bgOpacity };
    $('#setWeekStart').value = String(state.weekStart);
    $('#setDefaultView').value = state.view;
    $('#setLanguage').value = state.language;
    $('#setTheme').value = state.theme;
    $('#setBgOpacity').value = String(state.bgOpacity);
    $('#bgOpacityVal').textContent = state.bgOpacity + '%';
    try { const info = await API.appInfo(); $('#aboutLine').textContent = `${info.name} v${info.version} · ${info.author}`; } catch {}
    renderSubscriptions();
    showModal('#settingsModal');
  });

  // live preview while the settings modal is open
  $('#setTheme').addEventListener('change', (e) => applyTheme(e.target.value));
  $('#setLanguage').addEventListener('change', (e) => { applyLanguage(e.target.value); render(); });
  $('#setBgOpacity').addEventListener('input', (e) => applyOpacity(e.target.value));

  // restore preview if the user cancels
  document.querySelectorAll('#settingsModal [data-close]').forEach(b =>
    b.addEventListener('click', () => {
      if (!settingsSnapshot) return;
      applyTheme(settingsSnapshot.theme);
      applyLanguage(settingsSnapshot.language);
      applyOpacity(settingsSnapshot.bgOpacity);
      render();
    }));

  $('#btnSaveSettings').addEventListener('click', async () => {
    state.weekStart = parseInt($('#setWeekStart').value, 10);
    const defaultView = $('#setDefaultView').value;
    applyTheme($('#setTheme').value);
    applyLanguage($('#setLanguage').value);
    applyOpacity($('#setBgOpacity').value);
    try {
      await API.saveSettings({
        weekStartsOn: state.weekStart, defaultView,
        theme: state.theme, language: state.language, bgOpacity: state.bgOpacity,
      });
    } catch {}
    settingsSnapshot = null;
    hideModal('#settingsModal');
    render();
    toast(T('t_settingsSaved'));
  });

  // ---------- About ----------
  $('#btnAbout').addEventListener('click', async () => {
    let info = { name: 'MyCalendar', version: '', description: '', author: 'SHKWON(knix008@naver.com)' };
    try { info = await API.appInfo(); } catch {}
    $('#aboutName').textContent = info.name;
    $('#aboutVersion').textContent = info.version ? `v${info.version}` : '';
    $('#aboutDesc').textContent = info.description || '';
    $('#aboutCopyright').textContent = `Copyright © 2026 ${info.author}`;
    showModal('#aboutModal');
  });

  $('#btnExportIcs').addEventListener('click', exportIcs);
  async function exportIcs() {
    const { from, to } = { from: new Date(2000, 0, 1), to: new Date(2100, 0, 1) };
    const all = await API.listEvents(from.toISOString(), to.toISOString());
    const ics = buildIcs(all);
    if (IS_ELECTRON && window.electron.saveIcs) {
      const r = await window.electron.saveIcs('mycalendar', ics);
      if (r.ok) toast(T('t_exported') + ': ' + r.filePath);
    } else {
      const blob = new Blob([ics], { type: 'text/calendar' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'mycalendar.ics'; a.click();
      URL.revokeObjectURL(a.href);
    }
  }
  function buildIcs(events) {
    const dt = (s) => new Date(s).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    let out = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//MyCalendar//KO\r\n';
    events.forEach(e => {
      out += 'BEGIN:VEVENT\r\n';
      out += `UID:${e.uid}\r\n`;
      out += `SUMMARY:${(e.title || '').replace(/\n/g, ' ')}\r\n`;
      if (e.location) out += `LOCATION:${e.location}\r\n`;
      if (e.description) out += `DESCRIPTION:${e.description.replace(/\n/g, '\\n')}\r\n`;
      out += `DTSTART:${dt(e.start)}\r\nDTEND:${dt(e.end)}\r\nEND:VEVENT\r\n`;
    });
    out += 'END:VCALENDAR\r\n';
    return out;
  }

  // ---------- .ics import (Outlook / Google / any iCalendar) ----------
  $('#btnImportIcs').addEventListener('click', () => $('#icsFileInput').click());
  $('#icsFileInput').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    try {
      const text = await file.text();
      const events = parseIcs(text);
      if (!events.length) return toast(T('t_importEmpty'), true);
      let ok = 0;
      for (const ev of events) {
        try { await API.createEvent(ev); ok++; } catch {}
      }
      await refresh();
      const msg = I18N.getLang() === 'en' ? `${ok}${T('t_imported')}` : `${ok}${T('t_imported')}`;
      toast(msg);
    } catch (err) {
      toast(T('t_importFail') + ': ' + err.message, true);
    }
  });

  function parseIcs(text) {
    // unfold folded lines (RFC 5545: continuation lines start with space/tab)
    const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
    const lines = unfolded.split(/\r\n|\n|\r/);
    const events = [];
    let cur = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
      if (line === 'END:VEVENT') {
        if (cur && cur.start && cur.end) {
          events.push({
            title: cur.summary || '(제목 없음)',
            description: cur.description || null,
            location: cur.location || null,
            start: cur.start, end: cur.end, allDay: !!cur.allDay,
          });
        }
        cur = null; continue;
      }
      if (!cur) continue;
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const left = line.slice(0, idx);
      const value = line.slice(idx + 1);
      const [name, ...paramParts] = left.split(';');
      const params = paramParts.join(';');
      switch (name.toUpperCase()) {
        case 'SUMMARY': cur.summary = unescapeIcs(value); break;
        case 'DESCRIPTION': cur.description = unescapeIcs(value); break;
        case 'LOCATION': cur.location = unescapeIcs(value); break;
        case 'DTSTART': { const d = parseIcsDate(value, params); if (d) { cur.start = d.iso; cur.allDay = d.allDay; } break; }
        case 'DTEND': { const d = parseIcsDate(value, params); if (d) cur.end = d.iso; break; }
      }
    }
    // fall back to a 1h/1day end if DTEND missing
    events.forEach(ev => {
      if (!ev.end) {
        const s = new Date(ev.start);
        s.setHours(s.getHours() + (ev.allDay ? 24 : 1));
        ev.end = s.toISOString();
      }
    });
    return events;
  }

  function parseIcsDate(val, params) {
    const isDate = /VALUE=DATE(?!-)/i.test(params || '') || /^\d{8}$/.test(val);
    if (isDate) {
      const y = val.slice(0, 4), m = val.slice(4, 6), d = val.slice(6, 8);
      return { iso: `${y}-${m}-${d}T00:00:00`, allDay: true };
    }
    const m = val.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (!m) return null;
    const [, y, mo, d, h, mi, s, z] = m;
    const dt = z
      ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
      : new Date(+y, +mo - 1, +d, +h, +mi, +s); // floating/TZID → treat as local
    return { iso: dt.toISOString(), allDay: false };
  }

  function unescapeIcs(s) {
    return String(s).replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  }

  // ---------- ICS subscriptions ----------
  async function renderSubscriptions() {
    const ul = $('#subList');
    ul.innerHTML = '';
    let subs = [];
    try { subs = await API.listSubscriptions(); } catch { return; }
    if (!subs.length) {
      ul.innerHTML = `<li class="muted" style="justify-content:center">${T('sub_none')}</li>`;
      return;
    }
    subs.forEach(s => {
      const li = document.createElement('li');
      const last = s.last_fetched ? new Date(s.last_fetched).toLocaleString(I18N.locale()) : T('sub_never');
      const status = s.last_status === 'error' ? `<span class="err">${T('sub_error')}</span> · ` : '';
      li.innerHTML = `<div class="sub-info">
          <div class="sub-name">${escapeHtml(s.name)}</div>
          <div class="sub-meta">${status}${s.eventCount || 0} · ${T('sub_last')}: ${escapeHtml(last)}</div>
        </div>
        <div class="sub-actions">
          <button class="icon-btn" data-refresh="${s.id}" title="${T('sub_refresh')}">↻</button>
          <button class="icon-btn" data-del="${s.id}" title="${T('btn_delete')}">🗑️</button>
        </div>`;
      li.querySelector('[data-refresh]').addEventListener('click', async () => {
        try { await API.refreshSubscription(s.id); await renderSubscriptions(); await refresh(); toast(T('t_subRefreshed')); }
        catch (err) { toast(err.message, true); }
      });
      li.querySelector('[data-del]').addEventListener('click', async () => {
        if (!confirm(T('c_confirmDeleteSub'))) return;
        try { await API.deleteSubscription(s.id); await renderSubscriptions(); await loadCalendars(); await refresh(); toast(T('t_subDeleted')); }
        catch (err) { toast(err.message, true); }
      });
      ul.appendChild(li);
    });
  }

  $('#btnAddSub').addEventListener('click', async () => {
    const url = $('#subUrl').value.trim();
    const name = $('#subName').value.trim();
    if (!url) return toast(T('t_subNeedUrl'), true);
    const btn = $('#btnAddSub'); btn.disabled = true;
    try {
      const r = await API.addSubscription({ url, name });
      $('#subUrl').value = ''; $('#subName').value = '';
      await renderSubscriptions(); await loadCalendars(); await refresh();
      if (r.error) toast(T('t_importFail') + ': ' + r.error, true);
      else toast(T('t_subAdded'));
    } catch (err) { toast(err.message, true); }
    finally { btn.disabled = false; }
  });

  // ---------- modal utils ----------
  function showModal(sel) { $(sel).classList.remove('hidden'); }
  function hideModal(sel) { $(sel).classList.add('hidden'); }
  document.querySelectorAll('[data-close]').forEach(b =>
    b.addEventListener('click', (e) => e.target.closest('.modal').classList.add('hidden')));
  document.querySelectorAll('.modal').forEach(m =>
    m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));

  function openExternal(url) {
    if (IS_ELECTRON && window.electron.openExternal) window.electron.openExternal(url);
    else window.open(url, '_blank');
  }

  // ---------- toast ----------
  let toastTimer;
  function toast(msg, isErr) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 3000);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- keyboard ----------
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
  });
  if (IS_ELECTRON && window.electron.onNewEventShortcut) window.electron.onNewEventShortcut(() => openEventEditor(null));

  // ---------- init ----------
  (async function init() {
    let s = {};
    try { s = (await API.getSettings()) || {}; } catch {}
    // language & theme & opacity first so the initial paint is correct
    applyLanguage(s.language || 'ko');
    applyTheme(s.theme || 'dark');
    applyOpacity(s.bgOpacity != null ? s.bgOpacity : 100);
    if (s.weekStartsOn != null) state.weekStart = parseInt(s.weekStartsOn, 10) || 0;
    if (s.defaultView) state.view = s.defaultView;
    syncViewButtons();
    await loadCalendars();
    await refresh();
    refreshGoogleStatusBar();
    try { const info = await API.appInfo(); $('#sbVersion').textContent = 'v' + info.version; } catch {}
  })();

  // keep the status-bar Google indicator fresh when the connect/sign-in modal closes
  document.querySelectorAll('#googleModal [data-close]').forEach(b =>
    b.addEventListener('click', () => refreshGoogleStatusBar()));
})();
