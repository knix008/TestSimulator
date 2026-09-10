// Build-time smoke test.
//
// Loads the packaged renderer with the REAL main-process IPC handlers, drives
// the UI, and runs a full analysis over this project's own `src/` tree — so it
// exercises the wiring the unit tests cannot reach: adapter → IPC → worker →
// views → export.
//
//   npm run smoke        (see scripts/smoke.mjs)

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { registerIpcHandlers, MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT } = require('../electron/ipc');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'result.json');

// Prefer the C# project this app was ported from: ~55K lines of real code, big
// enough that the analysis and the heavy views actually take long enough to
// exercise the progress windows. Falls back to this project's own source when
// the sibling checkout is not present.
const REFERENCE = path.join(ROOT, '..', 'CodeFactoryWinV10', 'CodeAnalyzer');
const TARGET = fs.existsSync(REFERENCE) ? REFERENCE : path.join(ROOT, 'src');
const TARGET_IS_LARGE = TARGET === REFERENCE;

const errors = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Electron quits by itself once the last window closes. The final check closes
// the app window on purpose, so hold the process open long enough to write the
// result file.
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  registerIpcHandlers();

  // The folder picker must not block on a dialog; hand back the fixed target.
  ipcMain.removeHandler('dialog:pickDirectory');
  ipcMain.handle('dialog:pickDirectory', () => TARGET);

  // Settings are not persisted by the smoke run.
  ipcMain.removeHandler('settings:load');
  ipcMain.handle('settings:load', () => null);
  ipcMain.removeHandler('settings:save');
  ipcMain.handle('settings:save', () => '(smoke test)');

  const win = new BrowserWindow({
    show: false,
    width: 1500,
    height: 950,
    // The same floor the real window has, so "minimum width" means the same
    // thing here as it does in the app.
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    frame: false,
    webPreferences: {
      preload: path.join(ROOT, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message);
  });
  win.webContents.on('render-process-gone', (_e, details) => errors.push('render gone: ' + JSON.stringify(details)));

  const write = (data) => fs.writeFileSync(OUT, JSON.stringify(data, null, 2));

  // A checkpoint per phase: if the run hangs, the last one written says where.
  let stage = 'start';
  const mark = (name) => {
    stage = name;
    write({ ok: false, incomplete: true, stage, errors });
  };
  // A renderer stuck in a long synchronous render never answers, and an
  // un-timed executeJavaScript would hang the whole run with no clue where.
  const run = (code, timeoutMs = 30000) =>
    Promise.race([
      win.webContents.executeJavaScript(code),
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('renderer did not answer within ' + timeoutMs + 'ms at stage ' + stage)), timeoutMs),
      ),
    ]);

  /**
   * Polls until `probe` is truthy. `probe` is either JS to evaluate in the
   * renderer, or a Node-side function (used to wait for a window to appear).
   */
  const until = async (probe, timeoutMs = 30000, stepMs = 250) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const value = typeof probe === 'function' ? probe() : await run(probe);
      if (value) return value;
      if (Date.now() > deadline) return null;
      await wait(stepMs);
    }
  };

  /**
   * Switches views and waits for the new one to be on screen. A fixed delay is
   * not good enough on a large project: an expensive view is committed a few
   * frames late (see requestView) and its render itself takes real time.
   */
  const switchView = async (id) => {
    await run(`(() => {
      const select = document.querySelector('.toolbar select');
      select.value = ${JSON.stringify(id)};
      select.dispatchEvent(new Event('change', { bubbles: true }));
      return null;
    })()`);
    return until(`(() => {
      if (document.querySelector('.progress-window')) return false;
      const body = document.querySelector('.view-body');
      if (!body) return false;
      const ready = body.querySelector('.diagram-canvas svg, table.grid tbody tr, .empty-state, .panel');
      return ready ? true : false;
    })()`);
  };

  /**
   * Audits the currently displayed view for a broken layout: a crashed tree, an
   * empty body, content forced outside the window, or a diagram with degenerate
   * geometry. Returns a list of complaints — empty means the view is sound.
   */
  const auditLayout = (viewId) =>
    run(`(() => {
      const problems = [];
      const body = document.querySelector('.view-body');

      if (document.querySelector('.crash-screen')) problems.push('crashed');
      if (!document.querySelector('.toolbar')) problems.push('shell gone');
      if (!body || body.children.length === 0) problems.push('empty view body');

      // Nothing may push the page itself sideways or down.
      const doc = document.documentElement;
      if (doc.scrollWidth > window.innerWidth + 1) problems.push('page scrolls horizontally (' + doc.scrollWidth + ' > ' + window.innerWidth + ')');
      if (doc.scrollHeight > window.innerHeight + 1) problems.push('page scrolls vertically (' + doc.scrollHeight + ' > ' + window.innerHeight + ')');

      // The toolbar must stay a single row and never clip its own content.
      const toolbar = document.querySelector('.toolbar');
      if (toolbar) {
        const centres = new Set([...toolbar.querySelectorAll('button')].map((b) => {
          const r = b.getBoundingClientRect();
          return Math.round((r.top + r.bottom) / 2);
        }));
        if (centres.size > 1) problems.push('toolbar wrapped to ' + centres.size + ' rows');
        if (toolbar.scrollWidth > toolbar.clientWidth + 1) problems.push('toolbar overflows');
      }

      // Every visible box must have finite, sane geometry.
      const suspects = [...document.querySelectorAll('.view-body *')].slice(0, 4000);
      for (const el of suspects) {
        const r = el.getBoundingClientRect();
        if (!Number.isFinite(r.width) || !Number.isFinite(r.height)) {
          problems.push('non-finite box on ' + el.tagName.toLowerCase());
          break;
        }
      }

      // A diagram must have a real viewBox and be visible in its canvas.
      // NOTE: no backslashes anywhere in this probe. It is sent as a template
      // literal, where \s and \d silently lose their backslash — a regex
      // written here would quietly never match.
      const svg = document.querySelector('.diagram-canvas svg');
      if (svg) {
        const viewBox = svg.getAttribute('viewBox') || '';
        const parts = viewBox.trim().split(' ').filter(Boolean).map(Number);
        if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
          problems.push('bad viewBox: ' + viewBox);
        } else if (parts[0] !== 0 || parts[1] !== 0 || !(parts[2] > 0) || !(parts[3] > 0)) {
          problems.push('degenerate diagram size ' + parts.slice(2).join('x'));
        }

        const transform = svg.style.transform || '';
        if (transform.includes('NaN') || transform.includes('Infinity')) problems.push('bad transform: ' + transform);

        // The canvas legitimately holds content larger than itself — that is
        // what panning is for. What must not happen is the drawing sitting
        // entirely outside the visible area.
        const canvas = document.querySelector('.diagram-canvas');
        if (canvas) {
          const c = canvas.getBoundingClientRect();
          const d = svg.getBoundingClientRect();
          const overlaps = d.right > c.left && d.left < c.right && d.bottom > c.top && d.top < c.bottom;
          if (!overlaps) problems.push('diagram drawn outside the canvas');
          if (getComputedStyle(canvas).overflow !== 'hidden') problems.push('canvas does not clip its content');
        }
      }

      // A grid must line its header up with its body.
      const grid = document.querySelector('table.grid');
      if (grid) {
        const headerCells = grid.querySelectorAll('thead th').length;
        const firstRow = grid.querySelector('tbody tr');
        if (firstRow && firstRow.children.length !== headerCells) {
          problems.push('grid row width ' + firstRow.children.length + ' != header ' + headerCells);
        }
      }

      // Panels and cards must not be squeezed to nothing.
      for (const el of document.querySelectorAll('.view-body .panel, .view-body .card')) {
        const r = el.getBoundingClientRect();
        if (r.width < 40 || r.height < 12) {
          problems.push('collapsed panel/card ' + Math.round(r.width) + 'x' + Math.round(r.height));
          break;
        }
      }

      return problems;
    })()`);

  try {
    await win.loadFile(path.join(ROOT, 'dist', 'index.html'));
    await wait(2000);

    // A progress window can live for only a couple of frames, so polling would
    // miss it. Watch the DOM instead and keep a log of every appearance.
    await run(`(() => {
      window.__progressSeen = [];
      const record = () => {
        for (const node of document.querySelectorAll('.progress-window')) {
          const title = (node.querySelector('.title-label') || {}).textContent || '';
          const last = window.__progressSeen[window.__progressSeen.length - 1];
          if (!last || last.title !== title) {
            window.__progressSeen.push({
              title,
              indeterminate: !!node.querySelector('.progress-fill.indeterminate'),
            });
          }
        }
      };
      new MutationObserver(record).observe(document.body, { childList: true, subtree: true });
      record();
      return null;
    })()`);

    /* ------------------------------------------------------------- shell */

    mark('shell');

    const shell = await run(`(() => {
      const q = (sel) => [...document.querySelectorAll(sel)];
      const toolbar = document.querySelector('.toolbar');
      const buttons = q('.toolbar button');
      // One visual row means one shared vertical centre — buttons of different
      // heights legitimately have different tops inside the same flex row.
      const centres = new Set(buttons.map((b) => {
        const r = b.getBoundingClientRect();
        return Math.round((r.top + r.bottom) / 2);
      }));
      return {
        mounted: !!document.getElementById('root').children.length,
        theme: document.documentElement.getAttribute('data-theme'),
        menuButtons: q('.toolbar .menu-button').map((b) => ({
          label: b.textContent.trim(),
          hasIcon: !!b.querySelector('svg'),
        })),
        menuButtonsInTitleBar: q('.menubar .menu-button').length,
        // The right-hand group, read left to right off the actual geometry.
        rightGroup: q('.toolbar [data-action]')
          .map((el) => ({ action: el.dataset.action, x: Math.round(el.getBoundingClientRect().left) }))
          .sort((a, b) => a.x - b.x)
          .map((entry) => entry.action),
        languageButton: (() => {
          const btn = document.querySelector('.toolbar [data-action="language"]');
          if (!btn) return null;
          const svg = btn.querySelector('svg');
          return {
            hasIcon: !!svg,
            // The glyph inside the icon, not text in the button itself.
            glyph: svg ? (svg.querySelector('text') || {}).textContent || '' : '',
            text: [...btn.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(''),
            title: btn.title,
          };
        })(),
        runButton: (() => {
          const run = document.querySelector('.toolbar .run-button');
          return run ? { label: run.textContent.trim(), title: run.title, inToolbar: true } : { inToolbar: false };
        })(),
        runButtonInSidebar: q('.sidebar button').some((b) => /분석 실행|Run analysis/.test(b.textContent)),
        // The settings window must be opened by a button showing the same icon.
        settingsButtonIcon: (() => {
          const btn = document.querySelector('.toolbar [data-action="settings"] svg');
          return btn ? btn.innerHTML : null;
        })(),
        toolbarButtonCount: buttons.length,
        toolbarButtonsWithTooltip: buttons.filter((b) => b.title).length,
        toolbarRowCount: centres.size,
        toolbarOverflows: toolbar.scrollWidth > toolbar.clientWidth + 1,
        windowControlsInTitleBar: q('.menubar .window-controls .win-btn').map((b) => b.title),
        infoButtonInTitleBar: !!q('.menubar .win-btn').find((b) => /프로그램 정보|program information/i.test(b.title || '')),
        windowControlsInToolbar: q('.toolbar .window-controls').length,
        themeControlInToolbar: q('.toolbar .theme-control .btn').length,
        viewOptions: q('.toolbar select option').length,
        viewLabel: (() => {
          const label = document.querySelector('.toolbar .view-label');
          return { hasIcon: !!(label && label.querySelector('svg')), text: label ? label.textContent.trim() : '' };
        })(),
        // The dropdown replaced the menu; both listing all 15 views was noise.
        viewMenuGone: !q('.toolbar .menu-button').some((b) => /^뷰$|^View$/.test(b.textContent.trim())),
        hasWindowApi: !!(window.electronAPI && window.electronAPI.win),
      };
    })()`);

    /* --------------------------------------------------------- menu icons */

    await run(`document.querySelectorAll('.toolbar .menu-button')[0].click(); null`);
    await wait(200);
    const menuItems = await run(`(() => {
      const items = [...document.querySelectorAll('.menu-popup .menu-item')];
      return { count: items.length, withIcon: items.filter((i) => i.querySelector('.menu-item-icon svg')).length };
    })()`);
    await run(`document.body.click(); null`);
    await wait(150);

    /* ------------------------------------------------------ real analysis */

    mark('analysis');

    await run(`(() => {
      const btn = [...document.querySelectorAll('.sidebar button')].find((b) => /찾아보기|Browse/.test(b.textContent));
      if (btn) btn.click();
      return null;
    })()`);
    await until(`document.querySelectorAll('.sidebar .tree-node').length > 0`, 60000);
    await wait(400);

    const scope = await run(`(() => {
      const root = document.querySelector('.sidebar .mono');
      const languageRows = [...document.querySelectorAll('.sidebar .checkbox-list .checkbox-row')].map((row) => ({
        name: (row.querySelector('span') || {}).textContent || '',
        checked: !!(row.querySelector('input') || {}).checked,
        count: (row.querySelector('.count') || {}).textContent || '',
        absent: row.classList.contains('absent'),
      }));
      const browse = [...document.querySelectorAll('.sidebar button')].find((b) => /찾아보기|Browse/.test(b.textContent));
      const languageButtons = [...document.querySelectorAll('.sidebar section:nth-of-type(2) h3 button')].map((b) => b.textContent.trim());
      return {
        rootShown: root ? root.textContent : '',
        directories: document.querySelectorAll('.sidebar .tree-node').length,
        checked: [...document.querySelectorAll('.sidebar .tree input[type=checkbox]')].filter((c) => c.checked).length,
        runEnabled: !(document.querySelector('.toolbar .run-button') || {}).disabled,
        languageRows,
        languageButtons,
        browseIsDistinct: !!browse && browse.classList.contains('browse'),
        browseColor: browse ? getComputedStyle(browse).backgroundColor : null,
        plainButtonColor: (() => {
          const plain = [...document.querySelectorAll('.sidebar button')].find((b) => !b.classList.contains('browse'));
          return plain ? getComputedStyle(plain).backgroundColor : null;
        })(),
      };
    })()`);

    // Unticking a directory must take its languages with it, and re-ticking it
    // must bring them back — detection follows the directory selection.
    const languageFollowsDirs = await run(`(() => {
      const rows = () => [...document.querySelectorAll('.sidebar .checkbox-list .checkbox-row')];
      const checkedLanguages = () => rows().filter((r) => r.querySelector('input').checked).length;
      const withCounts = () => rows().filter((r) => (r.querySelector('.count') || {}).textContent).length;
      return { checkedLanguages: checkedLanguages(), withCounts: withCounts() };
    })()`);

    // Untick every directory, then look again.
    await run(`(() => {
      const none = [...document.querySelectorAll('.sidebar h3 button')].find((b) => /전체 해제|Select none/.test(b.textContent));
      const heading = [...document.querySelectorAll('.sidebar h3')].find((h) => /하위 디렉터리|Subdirectories/.test(h.textContent));
      const btn = heading ? [...heading.querySelectorAll('button')].find((b) => /전체 해제|Select none/.test(b.textContent)) : none;
      if (btn) btn.click();
      return null;
    })()`);
    await wait(600);
    languageFollowsDirs.countsWithNoDirs = await run(
      `[...document.querySelectorAll('.sidebar .checkbox-list .checkbox-row')].filter((r) => (r.querySelector('.count') || {}).textContent).length`,
    );

    // Re-tick everything.
    await run(`(() => {
      const heading = [...document.querySelectorAll('.sidebar h3')].find((h) => /하위 디렉터리|Subdirectories/.test(h.textContent));
      const btn = heading ? [...heading.querySelectorAll('button')].find((b) => /전체 선택|Select all/.test(b.textContent)) : null;
      if (btn) btn.click();
      return null;
    })()`);
    await wait(800);
    languageFollowsDirs.countsRestored = await run(
      `[...document.querySelectorAll('.sidebar .checkbox-list .checkbox-row')].filter((r) => (r.querySelector('.count') || {}).textContent).length`,
    );

    // Select-all / select-none for programming languages.
    const clickLanguageButton = (pattern) =>
      run(`(() => {
        const heading = [...document.querySelectorAll('.sidebar h3')].find((h) => /프로그래밍 언어|Programming languages/.test(h.textContent));
        const btn = heading ? [...heading.querySelectorAll('button')].find((b) => ${pattern}.test(b.textContent)) : null;
        if (btn) btn.click();
        return !!btn;
      })()`);
    const countChecked = () =>
      run(`[...document.querySelectorAll('.sidebar .checkbox-list input[type=checkbox]')].filter((c) => c.checked).length`);
    const countBoxes = () => run(`document.querySelectorAll('.sidebar .checkbox-list input[type=checkbox]').length`);

    const languageBulk = { total: await countBoxes() };
    await clickLanguageButton('/전체 해제|Select none/');
    await wait(400);
    languageBulk.afterNone = await countChecked();
    languageBulk.runDisabledWithNoLanguage = await run(`!!(document.querySelector('.toolbar .run-button') || {}).disabled`);

    await clickLanguageButton('/전체 선택|Select all/');
    await wait(400);
    languageBulk.afterAll = await countChecked();

    await clickLanguageButton('/자동 감지|Auto-detected/');
    await wait(400);
    languageBulk.afterAuto = await countChecked();

    await run(`(() => {
      const btn = document.querySelector('.toolbar .run-button');
      if (btn) btn.click();
      return null;
    })()`);

    // Poll for completion rather than guessing a fixed delay.
    let analysis = null;
    for (let i = 0; i < 180; i++) {
      await wait(1000);
      analysis = await run(`(() => {
        const bar = document.querySelector('.statusbar');
        const done = /files/.test(bar.textContent);
        return {
          done,
          status: bar.textContent,
          summaryCards: document.querySelectorAll('.card').length,
        };
      })()`);
      if (analysis.done) break;
    }

    const result = await run(`(() => {
      const cards = [...document.querySelectorAll('.card')].map((c) => ({
        label: c.querySelector('h4').textContent,
        value: c.querySelector('.value').textContent,
      }));
      const grade = document.querySelector('.score-ring .grade');
      return {
        cards,
        grade: grade ? grade.textContent : null,
        healthBars: document.querySelectorAll('.score-ring .bar-row').length,
        priorityActions: document.querySelectorAll('.action-item').length,
      };
    })()`);

    /* ------------------------------------------------- views and diagrams */

    mark('views');

    const views = {};
    for (const id of ['callGraph', 'classDiagram', 'inheritance', 'sequence', 'dataFlow', 'fileRelations', 'directoryRelations', 'metrics', 'duplicates', 'globals', 'erd', 'tableAccess', 'bugRisk', 'security']) {
      await switchView(id);
      await wait(200);
      views[id] = await run(`(() => {
        const svg = document.querySelector('.diagram-canvas svg');
        return {
          svgNodes: svg ? svg.querySelectorAll('[data-node]').length : 0,
          tableRows: document.querySelectorAll('table.grid tbody tr').length,
          empty: !!document.querySelector('.view-body .empty-state'),
        };
      })()`);
    }

    /* -------------------------------------------- progress window sightings */

    const progressSeen = await run(`window.__progressSeen`);

    /* -------------------------- every view must survive both window widths -- */

    const ALL_VIEWS = [
      'summary', 'callGraph', 'classDiagram', 'inheritance', 'sequence', 'dataFlow',
      'fileRelations', 'directoryRelations', 'metrics', 'duplicates', 'globals',
      'erd', 'tableAccess', 'bugRisk', 'security',
    ];

    const layout = {};
    for (const [label, size] of [['wide', [1500, 950]], ['minimum', [MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT]]]) {
      win.setSize(size[0], size[1]);
      await wait(500);
      for (const id of ALL_VIEWS) {
        mark('layout:' + label + ':' + id);
        await switchView(id);
        await wait(300);
        const problems = await auditLayout(id);
        if (problems && problems.length > 0) layout[label + ':' + id] = problems;
      }
    }
    win.setSize(1500, 950);
    await wait(400);

    /* ------------------------------- dragging the canvas must not crash ---- */

    mark('drag');

    // Panning used to read the drag state inside a React state updater, which
    // React can run after pointerup has cleared it — the throw unmounted the
    // whole tree and left a white window. Drag hard, then check the app is
    // still there and the view actually moved.
    await switchView('callGraph');
    await wait(500);

    const dragPan = await run(`(async () => {
      const canvas = document.querySelector('.diagram-canvas');
      const svg = () => document.querySelector('.diagram-canvas svg');
      const before = svg() ? svg().style.transform : '';

      const send = (type, x, y, extra) =>
        canvas.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse',
          button: type === 'pointerup' ? 0 : 0, buttons: type === 'pointerup' ? 0 : 1,
          clientX: x, clientY: y, ...extra,
        }));

      const rect = canvas.getBoundingClientRect();
      const startX = Math.round(rect.left + rect.width / 2);
      const startY = Math.round(rect.top + rect.height / 2);

      // Several drags in a row, each ending with moves dispatched *after*
      // pointerup — the exact ordering that produced the crash.
      for (let round = 0; round < 4; round++) {
        send('pointerdown', startX, startY);
        for (let i = 1; i <= 12; i++) send('pointermove', startX - i * 7, startY + i * 5);
        send('pointerup', startX - 84, startY + 60);
        send('pointermove', startX - 120, startY + 90);
        send('pointermove', startX - 140, startY + 110);
        await new Promise((r) => setTimeout(r, 60));
      }

      await new Promise((r) => setTimeout(r, 250));
      return {
        before,
        after: svg() ? svg().style.transform : '',
        stillMounted: !!document.querySelector('.toolbar'),
        crashScreen: !!document.querySelector('.crash-screen'),
      };
    })()`);

    /* --------------------------------------- zoom survives expand/collapse */

    await switchView('callGraph');
    await wait(300);

    await run(`(() => {
      // Zoom in three times, then read the transform back.
      const plus = [...document.querySelectorAll('.diagram-toolbar button')].find((b) => b.textContent === '+');
      if (!plus) return 'no zoom button';
      plus.click(); plus.click(); plus.click();
      return 'ok';
    })()`);
    await wait(400);
    const beforeTransform = await run(`(document.querySelector('.diagram-canvas svg') || {}).style?.transform || ''`);

    await run(`(() => {
      const collapse = [...document.querySelectorAll('button')].find((b) => /모두 접기|Collapse all/.test(b.textContent));
      if (collapse) collapse.click();
      return null;
    })()`);
    await wait(900);
    const afterCollapse = await run(`(document.querySelector('.diagram-canvas svg') || {}).style?.transform || ''`);

    await run(`(() => {
      const expand = [...document.querySelectorAll('button')].find((b) => /모두 펼치기|Expand all/.test(b.textContent));
      if (expand) expand.click();
      return null;
    })()`);
    await wait(1500);
    const afterExpand = await run(`(document.querySelector('.diagram-canvas svg') || {}).style?.transform || ''`);

    const scaleOf = (transform) => {
      const m = /scale\(([\d.]+)\)/.exec(transform || '');
      return m ? Number(m[1]) : null;
    };

    const zoom = {
      before: scaleOf(beforeTransform),
      afterCollapse: scaleOf(afterCollapse),
      afterExpand: scaleOf(afterExpand),
    };

    /* ------------------------------ the call graph opens fully expanded ---- */

    mark('callTree');
    await switchView('callGraph');
    await wait(1200);

    const callTree = await run(`(() => {
      const rows = document.querySelectorAll('.calltree .calltree-row').length;
      const nested = document.querySelectorAll('.calltree .calltree-children').length;
      const depth = (() => {
        let max = 0;
        for (const row of document.querySelectorAll('.calltree .calltree-row')) {
          let d = 0;
          let el = row.parentElement;
          while (el) {
            if (el.classList && el.classList.contains('calltree-children')) d++;
            el = el.parentElement;
          }
          if (d > max) max = d;
        }
        return max;
      })();
      const guide = document.querySelector('.calltree .calltree-children');
      const guideStyle = guide ? getComputedStyle(guide, '::before') : null;
      const toolbarButtons = [...document.querySelectorAll('.diagram-toolbar button')].map((b) => b.title || b.textContent.trim());
      return {
        rows,
        nested,
        depth,
        hasGuideLine: !!guideStyle && guideStyle.borderLeftWidth !== '0px' && guideStyle.content !== 'none',
        toolbarButtons,
        collapsedTwistiesVisible: [...document.querySelectorAll('.calltree .twisty')].filter((b) => b.textContent === '\u25b8').length,
      };
    })()`);

    // Collapse all, then expand all again, from the view's own toolbar.
    await run(`(() => {
      const btn = [...document.querySelectorAll('.diagram-toolbar button')].find((b) => /모두 접기|Collapse all/.test(b.title || ''));
      if (btn) btn.click();
      return null;
    })()`);
    await wait(700);
    const afterCollapseAll = await run(`document.querySelectorAll('.calltree .calltree-row').length`);

    await run(`(() => {
      const btn = [...document.querySelectorAll('.diagram-toolbar button')].find((b) => /모두 펼치기|Expand all/.test(b.title || ''));
      if (btn) btn.click();
      return null;
    })()`);
    await wait(1000);
    const afterExpandAll = await run(`document.querySelectorAll('.calltree .calltree-row').length`);
    callTree.afterCollapseAll = afterCollapseAll;
    callTree.afterExpandAll = afterExpandAll;

    /* ------------------------- a fresh view is fitted against the top ------ */

    mark('topAligned');

    // Every diagram view, seen for the first time, must start at the top of the
    // canvas rather than vertically centred.
    const topAligned = {};
    for (const id of ['classDiagram', 'sequence', 'dataFlow', 'fileRelations', 'directoryRelations', 'erd']) {
      await switchView(id);
      await wait(500);
      // Return the raw transform and parse it here: a regex written into a
      // template literal is one escaping layer away from silently never matching.
      const transform = await run(`(document.querySelector('.diagram-canvas svg') || {}).style?.transform || ''`);
      const offset = /translate\(\s*[-\d.]+px,\s*([-\d.]+)px\s*\)/.exec(transform);
      topAligned[id] = offset ? Number(offset[1]) : transform || null;
    }

    /* ------------------------------- zoom is remembered per view ---------- */

    mark('zoomMemory');

    // Leave the (zoomed-in) call graph for another view and come back: the
    // scale and position must be exactly where they were left.
    await switchView('erd');
    await wait(400);
    const erdTransform = await run(`(document.querySelector('.diagram-canvas svg') || {}).style?.transform || ''`);

    await switchView('callGraph');
    await wait(500);
    const returnedTransform = await run(`(document.querySelector('.diagram-canvas svg') || {}).style?.transform || ''`);

    // And a second round trip, after zooming the ERD to a different scale.
    await switchView('erd');
    await wait(400);
    await run(`(() => {
      const minus = [...document.querySelectorAll('.diagram-toolbar button')].find((b) => b.textContent === '−');
      if (minus) { minus.click(); minus.click(); }
      return null;
    })()`);
    await wait(400);
    const erdZoomed = await run(`(document.querySelector('.diagram-canvas svg') || {}).style?.transform || ''`);

    await switchView('callGraph');
    await wait(400);
    await switchView('erd');
    await wait(500);
    const erdReturned = await run(`(document.querySelector('.diagram-canvas svg') || {}).style?.transform || ''`);

    const perViewZoom = {
      callGraphBefore: afterExpand,
      erdFirst: erdTransform,
      callGraphReturned: returnedTransform,
      erdZoomed,
      erdReturned,
    };

    /* --------------------------------- settings opens as its own OS window */

    mark('settingsWindow');

    const mainBounds = win.getBounds();
    const otherWindows = () => BrowserWindow.getAllWindows().filter((w) => w !== win && !w.isDestroyed());

    await run(`document.querySelector('.toolbar [data-action="settings"]').click(); null`);
    await until(() => otherWindows().length > 0, 8000);

    let settings = { open: false };
    const settingsWin = otherWindows()[0];
    if (settingsWin) {
      await wait(1200); // let the second renderer mount and read its payload
      const probe = (code) => settingsWin.webContents.executeJavaScript(code);

      settings = await probe(`(() => {
        const w = document.querySelector('.app-window');
        if (!w) return { open: false };
        const body = w.querySelector('.app-window-body');
        const title = w.querySelector('.app-window-title');
        const icon = title.querySelector('.title-icon svg');
        return {
          open: true,
          standalone: w.classList.contains('standalone'),
          titleHasIcon: !!icon,
          titleLabel: (title.querySelector('.title-label') || {}).textContent,
          titleIconMarkup: icon ? icon.innerHTML : null,
          bodyOverflow: Math.max(0, body.scrollHeight - body.clientHeight),
          columns: getComputedStyle(w.querySelector('.settings-columns')).gridTemplateColumns.split(' ').length,
          checkboxes: w.querySelectorAll('input[type=checkbox]').length,
          tabs: w.querySelectorAll('.tab').length,
          themeSwatches: w.querySelectorAll('.theme-swatch').length,
          languageChips: w.querySelectorAll('.inline-list .chip').length,
          theme: document.documentElement.getAttribute('data-theme'),
        };
      })()`);

      // Prove it is a real window: a non-modal child that can be moved clear of
      // the application window's bounds.
      settings.isChildOfApp = settingsWin.getParentWindow() === win;
      settings.isModal = settingsWin.isModal();

      settingsWin.setBounds({ x: mainBounds.x + mainBounds.width + 80, y: mainBounds.y + 60, width: 900, height: 700 });
      await wait(400);
      settings.movedOutsideApp = settingsWin.getBounds().x >= mainBounds.x + mainBounds.width;

      // Toggle one inspection and apply; the opener must receive the result.
      await probe(`(() => {
        const box = document.querySelector('.app-window input[type=checkbox]');
        if (box) box.click();
        const apply = [...document.querySelectorAll('.app-window-footer button')].find((b) => /Apply|적용/.test(b.textContent));
        if (apply) apply.click();
        return null;
      })()`);
      await wait(1000);
      settings.closedAfterApply = settingsWin.isDestroyed();
    }

    /* ------------------------------ the info button opens About directly ---- */

    await run(`document.querySelector('.toolbar [data-action="about"]').click(); null`);
    await until(() => otherWindows().length > 0, 8000);
    let about = { open: false };
    const aboutWin = otherWindows()[0];
    if (aboutWin) {
      await wait(1200);
      about = await aboutWin.webContents.executeJavaScript(`(() => {
        const w = document.querySelector('.app-window');
        if (!w) return { open: false };
        const title = w.querySelector('.app-window-title');
        return {
          open: true,
          standalone: w.classList.contains('standalone'),
          titleHasIcon: !!title.querySelector('.title-icon svg'),
          titleLabel: (title.querySelector('.title-label') || {}).textContent,
          hasAuthor: document.body.textContent.includes('knix008@naver.com'),
          theme: document.documentElement.getAttribute('data-theme'),
        };
      })()`);
      aboutWin.close();
      await wait(400);
    }

    /* --------------------------- the language toggle lives on the toolbar --- */

    await run(`document.querySelector('.toolbar [data-action="language"]').click(); null`);
    await wait(800);
    const afterLanguage = await run(`(() => ({
      menuLabels: [...document.querySelectorAll('.toolbar .menu-button')].map((b) => b.textContent.trim()),
      iconGlyph: (() => {
        const svg = document.querySelector('.toolbar [data-action="language"] svg');
        return svg ? (svg.querySelector('text') || {}).textContent || '' : '';
      })(),
      // The tooltip names the language it would switch to next, so after one
      // press it must be offering Korean again.
      nextOffered: (document.querySelector('.toolbar [data-action="language"]') || {}).title || '',
    }))()`);

    /* ------------------------------------------- theme applies on each press */

    // One press per turn, with a wait between: React commits the state change
    // and only then does the effect write the new tokens onto :root, so reading
    // straight after `click()` in the same tick would report the old theme.
    const readTheme = `(() => ({
      id: document.documentElement.getAttribute('data-theme'),
      bg: getComputedStyle(document.body).backgroundColor,
    }))()`;
    const pressCycle = `(() => { document.querySelector('.toolbar .theme-control .theme-cycle').click(); return null; })()`;

    const themeCycle = [await run(readTheme)];
    for (let i = 0; i < 3; i++) {
      await run(pressCycle);
      await wait(250);
      themeCycle.push(await run(readTheme));
    }

    // And the caret opens a picker whose entries apply immediately too.
    await run(`(() => {
      document.querySelector('.toolbar .theme-control .theme-pick').click();
      return null;
    })()`);
    await wait(300);
    const themePicker = await run(`(() => {
      const menu = document.querySelector('.context-menu');
      if (!menu) return { open: false };
      const items = [...menu.querySelectorAll('.menu-item')];
      const before = document.documentElement.getAttribute('data-theme');
      // Pick an entry that is not the current one (the current one is ticked).
      const target = items.find((i) => !i.textContent.includes('✓'));
      if (target) target.click();
      return {
        open: true,
        count: items.length,
        withSwatch: items.filter((i) => i.querySelector('.menu-item-icon svg')).length,
        before,
      };
    })()`);
    await wait(400);
    const themeAfterPick = await run(`document.documentElement.getAttribute('data-theme')`);

    /* ---------------------------------- toolbar holds one row at min width */

    mark('narrow');

    // What the toolbar actually needs: every item at its natural width, with the
    // two flexible children (search box, spacer) at their minimum.
    const toolbarNeeds = await run(`(() => {
      const toolbar = document.querySelector('.toolbar');
      const style = getComputedStyle(toolbar);
      const gap = parseFloat(style.columnGap || style.gap || '0') || 0;
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      let total = padding;
      const children = [...toolbar.children];
      children.forEach((child, index) => {
        if (index > 0) total += gap;
        if (child.classList.contains('toolbar-spacer')) total += 4;
        else if (child.classList.contains('search-field')) total += 150;
        else total += child.getBoundingClientRect().width;
      });
      return Math.ceil(total);
    })()`);

    // Shrink to the smallest size the window allows and check nothing is lost.
    const [minWidth] = win.getMinimumSize();
    win.setSize(minWidth, 700);
    await wait(700);
    const narrow = await run(`(() => {
      const toolbar = document.querySelector('.toolbar');
      const buttons = [...toolbar.querySelectorAll('button')];
      const centres = new Set(buttons.map((b) => {
        const r = b.getBoundingClientRect();
        return Math.round((r.top + r.bottom) / 2);
      }));
      // A label that has been display:none-d, or clipped to nothing, counts as
      // hidden — the whole point is that every button stays readable.
      const hiddenLabels = buttons
        .filter((b) => b.textContent.trim().length > 0)
        .filter((b) => {
          const span = b.querySelector('span');
          if (!span) return false;
          const r = span.getBoundingClientRect();
          return getComputedStyle(span).display === 'none' || r.width < 1;
        })
        .map((b) => b.title || b.textContent.trim());

      return {
        windowWidth: window.innerWidth,
        rows: centres.size,
        overflows: toolbar.scrollWidth > toolbar.clientWidth + 1,
        runVisible: !!toolbar.querySelector('.run-button'),
        hiddenLabels,
        buttonsOffscreen: buttons.filter((b) => b.getBoundingClientRect().right > window.innerWidth + 1).length,
      };
    })()`);
    narrow.toolbarNeeds = toolbarNeeds;
    narrow.minWidth = minWidth;

    win.setSize(1500, 950);
    await wait(500);

    /* ------------------------------------------------------ context menu */

    mark('contextMenu');

    await run(`(() => {
      document.querySelector('.content').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, clientX: 600, clientY: 400 }),
      );
      return null;
    })()`);
    await wait(300);
    const contextMenu = await run(`(() => {
      const menu = document.querySelector('.context-menu');
      if (!menu) return { open: false };
      const items = [...menu.querySelectorAll('.menu-item')];
      return { open: true, count: items.length, withIcon: items.filter((i) => i.querySelector('.menu-item-icon svg')).length };
    })()`);
    await run(`document.body.click(); null`);

    /* ---------------- the browse button stays readable in every theme ------ */

    mark('browseContrast');

    // WCAG relative luminance, computed here in Node so no escaping-sensitive
    // code has to be shipped into the renderer.
    const luminance = (rgb) => {
      const c = rgb.map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const contrast = (a, b) => {
      const la = luminance(a);
      const lb = luminance(b);
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };
    const parseColour = (value) => {
      const nums = String(value || '').match(/[\d.]+/g);
      return nums && nums.length >= 3 ? nums.slice(0, 3).map(Number) : null;
    };

    // Open the picker, wait for React to render it, then read — the menu does
    // not exist in the same tick as the click that opens it.
    await run(`document.querySelector('.toolbar .theme-control .theme-pick').click(); null`);
    await wait(400);
    const themeIds = await run(`[...document.querySelectorAll('.context-menu .menu-item')].map((i) => i.textContent.trim())`);
    await run(`document.body.click(); null`);
    await wait(300);

    const browseContrast = {};
    for (let i = 0; i < themeIds.length; i++) {
      // Step through every theme with the cycle button.
      const tokens = await run(`(() => {
        const root = getComputedStyle(document.documentElement);
        const browse = [...document.querySelectorAll('.sidebar button')].find((b) => b.classList.contains('browse'));
        return {
          theme: document.documentElement.getAttribute('data-theme'),
          base: root.getPropertyValue('--accent-alt').trim(),
          hover: root.getPropertyValue('--accent-alt-hover').trim(),
          text: root.getPropertyValue('--accent-alt-text').trim(),
          // The rendered values, so a missing token shows up as a real failure.
          renderedBg: browse ? getComputedStyle(browse).backgroundColor : null,
          renderedText: browse ? getComputedStyle(browse).color : null,
          usesFilter: browse ? getComputedStyle(browse).filter !== 'none' : false,
        };
      })()`);

      const hex = (value) => {
        const m = /^#([0-9a-f]{6})$/i.exec(value || '');
        return m ? [0, 2, 4].map((k) => parseInt(m[1].slice(k, k + 2), 16)) : null;
      };

      const textRgb = parseColour(tokens.renderedText) || hex(tokens.text);
      const baseRgb = parseColour(tokens.renderedBg) || hex(tokens.base);
      const hoverRgb = hex(tokens.hover);

      browseContrast[tokens.theme] = {
        base: baseRgb && textRgb ? Number(contrast(baseRgb, textRgb).toFixed(2)) : null,
        hover: hoverRgb && textRgb ? Number(contrast(hoverRgb, textRgb).toFixed(2)) : null,
        usesFilter: tokens.usesFilter,
        hoverToken: tokens.hover,
      };

      await run(`document.querySelector('.toolbar .theme-control .theme-cycle').click(); null`);
      await wait(300);
    }

    /* ------------------------- dialogs close with the application window --- */

    mark('closeWithApp');

    await run(`document.querySelector('.toolbar [data-action="settings"]').click(); null`);
    await until(() => otherWindows().length > 0, 8000);
    const dialogsBeforeClose = otherWindows().length;

    // Close the app window the way the user would, then see what is left.
    win.close();
    await wait(1200);
    const dialogsAfterClose = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed()).length;

    /* ------------------------------------------------------------ verdict */

    const diagramViews = ['callGraph', 'classDiagram', 'sequence', 'dataFlow', 'fileRelations', 'directoryRelations'];
    const tableViews = ['metrics', 'globals', 'bugRisk'];

    const checks = {
      mounted: shell.mounted,
      menusHaveIcons: shell.menuButtons.length === 1 && shell.menuButtons.every((b) => b.hasIcon),
      viewDropdownIsLabelled: shell.viewLabel.hasIcon && /뷰|View/.test(shell.viewLabel.text) && shell.viewMenuGone,
      menusOnToolbar: shell.menuButtonsInTitleBar === 0,
      rightGroupInOrder: JSON.stringify(shell.rightGroup) === JSON.stringify(['settings', 'language', 'about']),
      languageToggleIsAnIcon:
        !!shell.languageButton && shell.languageButton.hasIcon && shell.languageButton.text === '' && !!shell.languageButton.title,
      // Korean is on at the start, so the icon must say so; after the switch it
      // must say EN instead.
      languageIconShowsTheLanguage:
        shell.languageButton.glyph === '한' && afterLanguage.iconGlyph === 'EN',
      runButtonOnToolbar: shell.runButton.inToolbar && !shell.runButtonInSidebar,
      allToolbarButtonsHaveTooltips: shell.toolbarButtonsWithTooltip === shell.toolbarButtonCount,
      toolbarIsOneRow: shell.toolbarRowCount === 1 && !shell.toolbarOverflows,
      windowControlsInTitleBar: shell.windowControlsInTitleBar.length === 3 && shell.windowControlsInToolbar === 0,
      infoButtonLeftOfWindowControls: shell.infoButtonInTitleBar,
      themeControlOnToolbar: shell.themeControlInToolbar === 2,
      menuItemsHaveIcons: menuItems.count > 0 && menuItems.withIcon === menuItems.count,

      directoryScanFoundFolders: scope.directories > 0 && scope.checked > 0,

      // The scanned folder is C#, so picking it must select C# and only the
      // languages actually present — without the user touching anything.
      languagesAutoDetected: (() => {
        const withCounts = scope.languageRows.filter((row) => row.count !== '');
        const checked = scope.languageRows.filter((row) => row.checked);
        return (
          withCounts.length > 0 &&
          checked.length > 0 &&
          checked.length === withCounts.length &&
          checked.every((row) => row.count !== '') &&
          scope.languageRows.some((row) => /C#/.test(row.name) && row.checked)
        );
      })(),
      absentLanguagesMarked: scope.languageRows.some((row) => row.absent && row.count === ''),
      languagesFollowDirectorySelection:
        languageFollowsDirs.withCounts > 0 &&
        languageFollowsDirs.countsWithNoDirs === 0 &&
        languageFollowsDirs.countsRestored === languageFollowsDirs.withCounts,
      languageSelectAllAndNone:
        languageBulk.afterNone === 0 &&
        languageBulk.afterAll === languageBulk.total &&
        languageBulk.afterAuto > 0 &&
        languageBulk.afterAuto < languageBulk.total,
      // Selecting no language must stop the run, not silently mean "all".
      noLanguageBlocksTheRun: languageBulk.runDisabledWithNoLanguage === true,
      browseButtonHasItsOwnColour:
        scope.browseIsDistinct && !!scope.browseColor && scope.browseColor !== scope.plainButtonColor,

      callTreeOpensExpanded: callTree.rows > 1 && callTree.nested > 0 && callTree.depth >= 2,
      callTreeHasGuideLines: callTree.hasGuideLine === true,
      callTreeToolbarHasExpandCollapse:
        callTree.toolbarButtons.some((title) => /모두 펼치기|Expand all/.test(title)) &&
        callTree.toolbarButtons.some((title) => /모두 접기|Collapse all/.test(title)),
      callTreeExpandCollapseWork:
        callTree.afterCollapseAll < callTree.rows && callTree.afterExpandAll === callTree.rows,
      analysisCompleted: !!(analysis && analysis.done),
      summaryRendered: result.cards.length >= 8 && !!result.grade,
      diagramsRendered: diagramViews.every((id) => views[id] && views[id].svgNodes > 0),
      tablesRendered: tableViews.every((id) => views[id] && views[id].tableRows > 0),

      diagramsStartAtTop: Object.values(topAligned).every((y) => y !== null && y === 20),
      everyViewLaysOutCleanly: Object.keys(layout).length === 0,
      dragPansWithoutCrashing:
        dragPan.stillMounted === true && dragPan.crashScreen === false && dragPan.after !== dragPan.before,
      zoomedIn: zoom.before !== null && zoom.before > 1.05,
      // Each view keeps its own transform across a round trip, and the two
      // views do not share one.
      zoomRestoredOnReturn: perViewZoom.callGraphReturned === perViewZoom.callGraphBefore,
      viewsKeepSeparateZoom: perViewZoom.erdFirst !== perViewZoom.callGraphBefore,
      zoomRestoredAfterSecondTrip:
        perViewZoom.erdReturned === perViewZoom.erdZoomed && perViewZoom.erdZoomed !== perViewZoom.erdFirst,
      zoomSurvivesCollapse: zoom.before === zoom.afterCollapse,
      zoomSurvivesExpand: zoom.before === zoom.afterExpand,

      settingsHasIconTitle: settings.open && settings.titleHasIcon && !!settings.titleLabel,
      settingsIconMatchesButton:
        !!shell.settingsButtonIcon && settings.titleIconMarkup === shell.settingsButtonIcon,
      settingsIsSeparateWindow: settings.standalone === true && settings.isChildOfApp === true && settings.isModal === false,
      settingsMovableOutsideApp: settings.movedOutsideApp === true,
      settingsFitsWithoutScroll: settings.bodyOverflow === 0,
      settingsHasNoAppearanceTab: settings.tabs === 0 && settings.themeSwatches === 0 && settings.languageChips === 0,
      settingsClosesOnApply: settings.closedAfterApply === true,
      settingsInheritsTheme: settings.theme === shell.theme,

      aboutOpensDirectly: about.open === true && about.standalone === true && about.titleHasIcon === true && about.hasAuthor === true,

      languageApplied: afterLanguage.menuLabels.includes('File') && /한국어/.test(afterLanguage.nextOffered),
      // Every press must land on a different theme, with no Apply step.
      themeChangesOnEveryPress:
        new Set(themeCycle.map((entry) => entry.id)).size === themeCycle.length &&
        new Set(themeCycle.map((entry) => entry.bg)).size === themeCycle.length,
      themePickerApplies: themePicker.open && themePicker.withSwatch === themePicker.count && themeAfterPick !== themePicker.before,

      contextMenuWorks: contextMenu.open && contextMenu.withIcon === contextMenu.count,
      toolbarFitsAtMinimumWidth:
        narrow.rows === 1 &&
        !narrow.overflows &&
        narrow.runVisible &&
        narrow.hiddenLabels.length === 0 &&
        narrow.buttonsOffscreen === 0 &&
        narrow.minWidth >= narrow.toolbarNeeds,
      // AA for normal text is 4.5:1 — below that the label starts disappearing
      // into the button, which is exactly the bug this guards against.
      browseReadableInEveryTheme: (() => {
        const entries = Object.values(browseContrast);
        return (
          entries.length >= 6 &&
          entries.every((e) => e.base !== null && e.hover !== null && e.base >= 4.5 && e.hover >= 4.5 && !e.usesFilter)
        );
      })(),
      dialogsCloseWithApp: dialogsBeforeClose > 0 && dialogsAfterClose === 0,
      noConsoleErrors: errors.length === 0,
    };

    // The progress windows only exist when the work is actually slow, so they
    // can only be asserted against a target large enough to be slow.
    if (TARGET_IS_LARGE) {
      checks.analysisProgressWindowShown = progressSeen.some((entry) => /분석 진행 중|Analyzing/.test(entry.title));
      checks.viewProgressWindowShown = progressSeen.some((entry) => entry.indeterminate);
    }

    // NOTE: `win` is destroyed by the close check above — read nothing from the
    // renderer past this point.
    write({
      ok: Object.values(checks).every(Boolean),
      failed: Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name),
      checks,
      shell,
      menuItems,
      scope,
      languageFollowsDirs,
      languageBulk,
      callTree,
      analysis,
      result,
      views,
      layout,
      browseContrast,
      topAligned,
      dragPan,
      dialogsBeforeClose,
      dialogsAfterClose,
      zoom,
      perViewZoom,
      settings,
      about,
      afterLanguage,
      target: TARGET,
      targetIsLarge: TARGET_IS_LARGE,
      progressSeen,
      narrow,
      themeCycle,
      themePicker,
      themeAfterPick,
      contextMenu,
      errors,
    });
  } catch (err) {
    write({ ok: false, error: err.message, stack: err.stack, errors });
  } finally {
    app.exit(0);
  }
});
