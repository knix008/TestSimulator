// Calendar rendering: month / week / day / agenda views.
const CalendarView = (() => {
  const MS_DAY = 86400000;
  const DOW = () => (typeof I18N !== 'undefined' ? I18N.dow() : ['일', '월', '화', '수', '목', '금', '토']);
  const T = (k) => (typeof I18N !== 'undefined' ? I18N.t(k) : k);
  const weekendClass = (wd) => (wd === 0 ? 'sun' : wd === 6 ? 'sat' : '');

  // ---- date helpers ----
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const isToday = (d) => sameDay(d, new Date());
  const pad = (n) => String(n).padStart(2, '0');
  const fmtTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  function weekStartOf(date, weekStart) {
    const d = startOfDay(date);
    const diff = (d.getDay() - weekStart + 7) % 7;
    return addDays(d, -diff);
  }
  function monthMatrixStart(date, weekStart) {
    return weekStartOf(new Date(date.getFullYear(), date.getMonth(), 1), weekStart);
  }

  function colorFor(ev, state) {
    if (ev.color) return ev.color;
    const cal = state.calMap[ev.calendarId];
    return (cal && cal.color) || '#6366f1';
  }
  function visibleEvents(state) {
    return state.events.filter(e => {
      const cal = state.calMap[e.calendarId];
      return !cal || cal.visible;
    });
  }

  // ---- period label ----
  function periodLabel(state) {
    const d = state.currentDate;
    const loc = typeof I18N !== 'undefined' ? I18N.locale() : 'ko-KR';
    const monthLabel = new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long' }).format(d);
    if (state.view === 'month') return monthLabel;
    if (state.view === 'day') return new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(d);
    if (state.view === 'week') {
      const s = weekStartOf(d, state.weekStart), e = addDays(s, 6);
      const fmt = new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric' });
      return `${fmt.format(s)} – ${fmt.format(e)}`;
    }
    return monthLabel;
  }

  // ---- range for data fetch ----
  function rangeFor(state) {
    if (state.view === 'month') {
      const s = monthMatrixStart(state.currentDate, state.weekStart);
      return { from: s, to: addDays(s, 42) };
    }
    if (state.view === 'week') {
      const s = weekStartOf(state.currentDate, state.weekStart);
      return { from: s, to: addDays(s, 7) };
    }
    if (state.view === 'day') {
      const s = startOfDay(state.currentDate);
      return { from: s, to: addDays(s, 1) };
    }
    const s = startOfDay(state.currentDate);
    return { from: s, to: addDays(s, 30) };
  }

  // ---- month ----
  function renderMonth(root, state, h) {
    const start = monthMatrixStart(state.currentDate, state.weekStart);
    const evs = visibleEvents(state);

    const dowNames = DOW();
    const BAR_H = 20, HEAD_H = 24, MAX_LANES = 4;
    let dow = '<div class="month-dow">';
    for (let i = 0; i < 7; i++) { const wd = (state.weekStart + i) % 7; dow += `<div class="${weekendClass(wd)}">${dowNames[wd]}</div>`; }
    dow += '</div>';

    // inclusive last day of an event; "bar" = all-day or spans >1 day
    const inclEnd = (e) => { const ee = startOfDay(new Date(e.end)); return e.allDay ? addDays(ee, -1) : ee; };
    const isBar = (e) => { const es = startOfDay(new Date(e.start)); return e.allDay || inclEnd(e).getTime() !== es.getTime(); };

    let weeksHtml = '';
    for (let w = 0; w < 6; w++) {
      const weekStart = addDays(start, w * 7);
      const weekEnd = addDays(weekStart, 6);
      const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

      // continuous bars overlapping this week
      const bars = evs.filter(e => {
        if (!isBar(e)) return false;
        const es = startOfDay(new Date(e.start)), ee = inclEnd(e);
        return ee >= weekStart && es <= weekEnd;
      }).map(e => {
        const es = startOfDay(new Date(e.start)), ee = inclEnd(e);
        const segS = es < weekStart ? weekStart : es;
        const segE = ee > weekEnd ? weekEnd : ee;
        return {
          e,
          colStart: Math.round((segS - weekStart) / MS_DAY),
          colEnd: Math.round((segE - weekStart) / MS_DAY),
          contL: es < weekStart, contR: ee > weekEnd,
        };
      }).sort((a, b) => a.colStart - b.colStart || (b.colEnd - b.colStart) - (a.colEnd - a.colStart));

      // greedy lane packing so bars don't overlap
      const laneOcc = [];
      bars.forEach(b => {
        let lane = 0;
        while (laneOcc[lane] && laneOcc[lane].some(o => !(b.colEnd < o.colStart || b.colStart > o.colEnd))) lane++;
        (laneOcc[lane] = laneOcc[lane] || []).push(b);
        b.lane = lane;
      });
      const laneCount = Math.min(laneOcc.length, MAX_LANES);

      // day cells (with timed single-day chips below the bar area)
      let cells = '';
      days.forEach(day => {
        const inMonth = day.getMonth() === state.currentDate.getMonth();
        const cls = ['day-cell'];
        if (!inMonth) cls.push('other');
        if (isToday(day)) cls.push('today');
        if (sameDay(day, state.currentDate)) cls.push('sel');

        const timed = evs.filter(e => !isBar(e) && sameDay(startOfDay(new Date(e.start)), day))
          .sort((a, b) => new Date(a.start) - new Date(b.start));
        let chips = '';
        timed.slice(0, 2).forEach(e => {
          const c = colorFor(e, state);
          chips += `<div class="chip" style="background:${c}" data-ev="${e.id}" title="${escapeHtml(e.title)}"><span class="dot"></span>${fmtTime(new Date(e.start))} ${escapeHtml(e.title)}</div>`;
        });
        const extra = timed.length - Math.min(timed.length, 2);
        if (extra > 0) chips += `<div class="more-link" data-day="${day.toISOString()}">+${extra} ${T('more')}</div>`;

        cells += `<div class="${cls.join(' ')}" data-date="${day.toISOString()}">
          <span class="day-num ${weekendClass(day.getDay())}">${day.getDate()}</span>
          <div class="cell-chips" style="margin-top:${laneCount * BAR_H}px">${chips}</div></div>`;
      });

      // spanning bars overlay
      let barsHtml = '';
      bars.filter(b => b.lane < MAX_LANES).forEach(b => {
        const left = (b.colStart / 7) * 100, width = ((b.colEnd - b.colStart + 1) / 7) * 100;
        const c = colorFor(b.e, state);
        const label = b.e.allDay ? b.e.title : `${fmtTime(new Date(b.e.start))} ${b.e.title}`;
        const cont = `${b.contL ? 'l-open' : ''} ${b.contR ? 'r-open' : ''}`;
        barsHtml += `<div class="mbar ${cont}" style="left:calc(${left}% + 2px); width:calc(${width}% - 4px); top:${b.lane * BAR_H}px; background:${c}" data-ev="${b.e.id}" title="${escapeHtml(b.e.title)}">${b.contL ? '‹ ' : ''}${escapeHtml(label)}${b.contR ? ' ›' : ''}</div>`;
      });

      weeksHtml += `<div class="mweek">
        <div class="mweek-grid">${cells}</div>
        <div class="mweek-bars" style="top:${HEAD_H}px">${barsHtml}</div>
      </div>`;
    }

    root.innerHTML = `<div class="month-grid">${dow}<div class="month-weeks">${weeksHtml}</div></div>`;
    root.querySelectorAll('.day-cell').forEach(cell => {
      cell.addEventListener('click', (e) => {
        if (e.target.closest('.chip') || e.target.closest('.more-link') || e.target.closest('.mbar')) return;
        if (e.target.closest('.day-num')) { h.onDayNumClick(new Date(cell.dataset.date)); return; }
        h.onDayClick(new Date(cell.dataset.date));
      });
      cell.addEventListener('dblclick', () => h.onDayDblClick(new Date(cell.dataset.date)));
    });
    bindChips(root, h);
    root.querySelectorAll('.more-link').forEach(m =>
      m.addEventListener('click', () => h.onMore(new Date(m.dataset.day))));
  }

  // ---- week / day (time grid) ----
  function renderTimeGrid(root, state, h, days) {
    const evs = visibleEvents(state);
    const dowNames = DOW();
    let head = '<div class="tg-head" style="grid-template-columns:56px repeat(' + days.length + ',1fr)"><div></div>';
    days.forEach(d => {
      head += `<div class="tg-day-head ${isToday(d) ? 'today' : ''} ${weekendClass(d.getDay())}">
        <small>${dowNames[d.getDay()]}</small><span class="dnum">${d.getDate()}</span></div>`;
    });
    head += '</div>';

    let times = '<div class="time-col">';
    for (let hr = 0; hr < 24; hr++) times += `<div class="time-slot">${pad(hr)}:00</div>`;
    times += '</div>';

    let cols = '';
    days.forEach(d => {
      let lines = '';
      for (let hr = 0; hr < 24; hr++) lines += '<div class="hour-line"></div>';
      const dayStart = startOfDay(d);
      const dayEvs = evs.filter(e => !e.allDay && new Date(e.end) > dayStart && new Date(e.start) < addDays(dayStart, 1));
      let blocks = '';
      dayEvs.forEach(e => {
        const s = new Date(e.start), en = new Date(e.end);
        const top = Math.max(0, (s - dayStart) / MS_DAY) * (24 * 48);
        const height = Math.max(18, ((Math.min(en, addDays(dayStart, 1)) - Math.max(s, dayStart)) / MS_DAY) * (24 * 48));
        const c = colorFor(e, state);
        blocks += `<div class="tg-event" style="top:${top}px;height:${height}px;background:${c}" data-ev="${e.id}">
          <span class="t">${fmtTime(s)}</span> ${escapeHtml(e.title)}</div>`;
      });
      cols += `<div class="tg-day-col" data-date="${d.toISOString()}">${lines}${blocks}</div>`;
    });

    root.innerHTML = `${head}
      <div class="time-grid">
        ${times}<div class="tg-body" style="grid-template-columns:repeat(${days.length},1fr)">${cols}</div>
      </div>`;

    bindChips(root, h);
    root.querySelectorAll('.tg-day-col').forEach(col => {
      col.addEventListener('click', (e) => {
        if (e.target.closest('.tg-event')) return;
        const rect = col.getBoundingClientRect();
        const y = e.clientY - rect.top;
        const hour = Math.floor(y / 48);
        const d = new Date(col.dataset.date); d.setHours(hour, 0, 0, 0);
        h.onSlotClick(d);
      });
    });
  }

  // ---- agenda ----
  function renderAgenda(root, state, h) {
    const evs = visibleEvents(state).slice().sort((a, b) => new Date(a.start) - new Date(b.start));
    if (!evs.length) { root.innerHTML = `<div class="agenda-empty">${T('noEvents')}</div>`; return; }
    const dowNames = DOW();
    const groups = {};
    evs.forEach(e => {
      const key = startOfDay(new Date(e.start)).toISOString();
      (groups[key] = groups[key] || []).push(e);
    });
    let html = '<div class="agenda">';
    Object.keys(groups).sort().forEach(k => {
      const d = new Date(k);
      html += `<div class="agenda-day"><div class="agenda-date ${weekendClass(d.getDay())}">${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} (${dowNames[d.getDay()]})</div>`;
      groups[k].forEach(e => {
        const c = colorFor(e, state);
        const time = e.allDay ? T('allDay') : `${fmtTime(new Date(e.start))} – ${fmtTime(new Date(e.end))}`;
        html += `<div class="agenda-item" data-ev="${e.id}">
          <span class="agenda-time">${time}</span>
          <span class="agenda-dot" style="background:${c}"></span>
          <span>${escapeHtml(e.title)}</span></div>`;
      });
      html += '</div>';
    });
    html += '</div>';
    root.innerHTML = html;
    bindChips(root, h);
  }

  function bindChips(root, h) {
    root.querySelectorAll('[data-ev]').forEach(el =>
      el.addEventListener('click', (e) => { e.stopPropagation(); h.onEventClick(parseInt(el.dataset.ev, 10)); }));
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render(root, state, h) {
    if (state.view === 'month') renderMonth(root, state, h);
    else if (state.view === 'week') renderTimeGrid(root, state, h, Array.from({ length: 7 }, (_, i) => addDays(weekStartOf(state.currentDate, state.weekStart), i)));
    else if (state.view === 'day') renderTimeGrid(root, state, h, [startOfDay(state.currentDate)]);
    else renderAgenda(root, state, h);
  }

  return { render, periodLabel, rangeFor, weekStartOf, addDays, startOfDay, sameDay, isToday, dowNames: DOW, pad };
})();
