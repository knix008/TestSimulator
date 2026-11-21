//@step {"name": "pm: helpers (feature fixtures loaded through Vite, the PropertyManager exerciser)", "expect": "^ok$"}
return (async () => {
  const m = window.__mymechanics;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const fx = await import('/test/fixtures/feature-fixtures.js');
  const { FEATURE_TYPES } = await import('/src/cad/features.js');
  window.__fx = fx;
  window.__featureTypes = FEATURE_TYPES;
  const pane = () => document.querySelector('#left-panel');
  const q = (sel) => pane()?.querySelector(sel);
  const qa = (sel) => [...(pane()?.querySelectorAll(sel) ?? [])];
  const css = (v) => CSS.escape(v);
  const json = (v) => JSON.stringify(v);
  const fsum = (arr) => { if (!arr) return 0; let s = 0; const n = arr.length; const stride = Math.max(1, Math.floor(n / 4000)); for (let i = 0; i < n; i += stride) s += arr[i] * ((i % 7) + 1) + arr[i] * arr[i] * 0.01; return Math.round(s * 1000) / 1000; };
  /** What the preview shows: the body mesh, the surfaces and curves of the rebuild. */
  const geom = () => {
    const en = m.state.partEntry;
    if (!en) return 'none';
    const ex = en.extras ?? {};
    // Plus what the edited feature reports as plain data (a plane's frame, an axis, a point, copies …).
    const data = JSON.stringify(m.state.previewResult ?? null, (k, v) => (v && typeof v === 'object' && 'wrapped' in v ? undefined : k === 'body' || k === 'tool' ? undefined : typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v));
    return json([en.mesh?.vertices?.length ?? 0, fsum(en.mesh?.vertices), (ex.surfaces ?? []).map((s) => [s.mesh?.vertices?.length, fsum(s.mesh?.vertices)]), (ex.curves ?? []).map((c) => fsum(c.segments)), data]);
  };
  const feature = () => m.state.editing?.feature;
  const preview = () => m.state.previewResult;
  const settle = async () => { await sleep(60); for (let i = 0; i < 40 && document.querySelector('.busy, [data-busy]'); i++) await sleep(50); };

  /** Opens the feature `type` (built on its fixture's base part) in the PropertyManager. */
  window.__pmOpen = async (type) => {
    await m.actions.ensureKernel();
    if (m.state.editing) m.actions.cancelEditing({ quiet: true });
    await m.actions.closeProject({ force: true });
    await m.actions.newDocument('part');
    const part = m.active();
    const fixture = fx.fixtureOf(type);
    const tmp = { ...fx.newPart(part.id), name: part.name };
    const extra = fixture.project ? fixture.project().parts : [];
    const f = fixture.make(tmp, {});
    tmp.features.push(f);
    m.actions.change('op.addFeature', (p) => { for (const x of extra) if (!p.parts.some((y) => y.id === x.id)) p.parts.push({ ...x, name: x.name ?? x.id }); part.features = tmp.features; });
    await sleep(60);
    const stored = m.active().features.find((x) => x.id === f.id);
    m.actions.editFeature(stored.id);
    await settle();
    return { f: stored, fixture };
  };

  /**
   * Every control of the open PropertyManager: number fields (− / + and a typed value), check boxes,
   * segmented buttons, drop-downs and selection boxes. Each must change the edited feature (or the editor's
   * pick mode) and the preview must be rebuilt without an error; number fields must also change the
   * preview's geometry unless the fixture lists the setting as legitimately without effect.
   */
  window.__pmExercise = async (type, fixture, phase = 'all') => {
    const fails = []; const seen = { num: [], toggle: [], seg: [], select: [], pick: [] };
    const spec = (key) => fx.specOf(fixture.num?.[key] ?? fixture.bool?.[key]);
    const errs0 = window.__ctlErrors.length;
    const expectRebuilt = (what, g0, needGeom) => {
      const r = preview();
      if (r && r.ok === false) fails.push(`${what}: preview failed (${r.error})`);
      if (needGeom && geom() === g0) fails.push(`${what}: the preview geometry did not change`);
    };
    // Number fields.
    const numKeys = phase === 'opts' ? [] : [...new Set(qa('[data-pm-field]').map((x) => x.dataset.pmField))].filter((k) => !k.startsWith('pt3:') || true);
    for (const key of numKeys) {
      if (!q(`[data-pm-field="${css(key)}"]`)) continue;
      seen.num.push(key);
      const val = () => { const f = feature(); if (key.startsWith('pt3:')) { const [, i, j] = key.split(':').map(Number); return f.points?.[i]?.[j]; } return Number(f[key]); };
      // Settings that rightly leave the shown model alone: skipped in the fixture, used only by the flat
      // pattern, or matched by the fixture's pmSkip list (number fields of the PropertyManager only).
      const pmSkip = (fixture.pmSkip ?? []).find(([re]) => re.test(key));
      const needGeom = !spec(key).skip && !spec(key).with?.__flat && !pmSkip;
      const start = val();
      // + then − (at a limit one of them may not move; both not moving is a failure).
      const btn = (d) => q(`[data-pm-step="${css(key)}"][data-delta="${d}"]`);
      if (btn(1) && btn(-1)) {
        let g0 = geom(); const v0 = val();
        btn(1).click(); await settle();
        const up = val();
        if (up > v0) expectRebuilt(`${key} +`, g0, needGeom);
        g0 = geom();
        btn(-1).click(); await settle();
        const down = val();
        if (down < up) expectRebuilt(`${key} −`, g0, needGeom);
        if (!(up > v0) && !(down < up)) fails.push(`${key}: neither + nor − changed it (${v0} → ${up} → ${down})`);
        if (!(up > v0) && down < up) { g0 = geom(); btn(1).click(); await settle(); if (!(val() > down)) fails.push(`${key}: + did nothing (${down} → ${val()})`); }
      } else if (!key.startsWith('pt3:')) fails.push(`${key}: no − / + buttons`);
      // A typed value.
      const input = q(`[data-pm-field="${css(key)}"]`);
      if (input) {
        const cur = val();
        const unit = input.dataset.unit;
        let target = unit === 'count' ? Math.round(cur) + 2 : cur > 0 ? Math.round((cur * 1.5 + 1) * 100) / 100 : cur + 3;
        const g0 = geom();
        input.value = String(target); input.dispatchEvent(new Event('change', { bubbles: true }));
        await settle();
        const got = val();
        if (!(got > cur)) {
          // At its upper limit: a smaller typed value must be taken instead.
          const lower = unit === 'count' ? Math.max(1, Math.round(cur) - 1) : Math.round(cur * 0.6 * 100) / 100;
          const i2 = q(`[data-pm-field="${css(key)}"]`);
          if (i2 && lower !== cur) { i2.value = String(lower); i2.dispatchEvent(new Event('change', { bubbles: true })); await settle(); }
          if (!(val() < cur)) fails.push(`${key}: typing ${target} gave ${got}, typing ${lower} gave ${val()} (was ${cur})`);
          else expectRebuilt(`${key} typed`, g0, needGeom);
        } else { if (Math.abs(got - target) > 1e-6) seen.num.push(`${key}(clamped ${target}→${got})`); expectRebuilt(`${key} typed`, g0, needGeom); }
        // Back to the start value, so the next field is checked on the fixture as it was built.
        const back = q(`[data-pm-field="${css(key)}"]`);
        if (back && val() !== start) { back.value = String(start); back.dispatchEvent(new Event('change', { bubbles: true })); await settle(); }
      }
    }
    // Check boxes: each flips its setting (and the preview is rebuilt); flipped back afterwards.
    if (phase !== 'num') for (const key of [...new Set(qa('[data-pm-toggle]').map((x) => x.dataset.pmToggle))]) {
      const box = q(`[data-pm-toggle="${css(key)}"]`);
      if (!box || box.disabled) continue;
      seen.toggle.push(key);
      const f0 = json(feature()); const g0 = geom(); const was = box.checked;
      box.click(); await settle();
      if (json(feature()) === f0) fails.push(`toggle ${key}: the feature did not change`);
      // (A list box such as "loft:<sketch id>" takes an input out: the preview may then rightly fail — e.g. a knit no longer closed.)
      else if (!key.includes(":")) expectRebuilt(`toggle ${key}`, g0, false);
      const again = q(`[data-pm-toggle="${css(key)}"]`);
      if (again) { again.click(); await settle(); }
      if (q(`[data-pm-toggle="${css(key)}"]`) && q(`[data-pm-toggle="${css(key)}"]`).checked !== was) fails.push(`toggle ${key}: clicking again did not turn it back`);
    }
    // Segmented buttons: every option that is not active changes the feature or the editor (pick / plane).
    const segKeys = phase === 'num' ? [] : [...new Set(qa('[data-pm-set]').map((x) => x.dataset.pmSet))];
    for (const key of segKeys) {
      const opts = qa(`[data-pm-set="${css(key)}"]`).map((b) => b.dataset.value);
      const activeVal = q(`[data-pm-set="${css(key)}"].active`)?.dataset.value;
      for (const v of opts) {
        if (v === activeVal) continue;
        const b = q(`[data-pm-set="${css(key)}"][data-value="${css(v)}"]`);
        if (!b || b.disabled) continue;
        seen.seg.push(`${key}=${v}`);
        const s0 = json([feature(), m.state.editing?.pick, m.state.editing?.drawPlane]);
        b.click(); await settle();
        if (json([feature(), m.state.editing?.pick, m.state.editing?.drawPlane]) === s0) fails.push(`segment ${key}=${v}: nothing changed`);
        else if (!q(`[data-pm-set="${css(key)}"][data-value="${css(v)}"]`)?.classList.contains('active') && q(`[data-pm-set="${css(key)}"]`)) fails.push(`segment ${key}=${v}: not shown as active`);
      }
      const back = q(`[data-pm-set="${css(key)}"][data-value="${css(activeVal ?? '')}"]`);
      if (back && !back.classList.contains('active')) { back.click(); await settle(); }
    }
    // Drop-downs: each shows the feature's current value, and every other option changes the feature.
    if (phase !== 'num') for (const key of [...new Set(qa('select[data-pm-select]').map((x) => x.dataset.pmSelect))]) {
      const sel = q(`select[data-pm-select="${css(key)}"]`);
      if (!sel || sel.disabled) continue;
      const cur = feature()?.[key];
      if ((typeof cur === 'string' && cur) || typeof cur === 'number') { if (sel.value !== String(cur)) fails.push(`select ${key}: shows "${sel.value || '(none)'}" but the feature uses ${cur}`); }
      const start = sel.value;
      for (const v of [...sel.options].map((o) => o.value)) {
        if (v === start) continue;
        const s = q(`select[data-pm-select="${css(key)}"]`);
        if (!s) break;
        seen.select.push(`${key}=${v || '∅'}`);
        const f0 = json(feature());
        s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); await settle();
        if (json(feature()) === f0) fails.push(`select ${key}=${v || '(none)'}: the feature did not change`);
      }
      const s = q(`select[data-pm-select="${css(key)}"]`);
      if (s) { s.value = start; s.dispatchEvent(new Event('change', { bubbles: true })); await settle(); }
    }
    // Selection boxes: clicking one makes it the box that takes picks from the graphics area.
    if (phase !== 'num') for (const key of [...new Set(qa('[data-pm-pick]').map((x) => x.dataset.pmPick))]) {
      const box = q(`[data-pm-pick="${css(key)}"]`);
      if (!box) continue;
      seen.pick.push(key);
      box.click(); await settle();
      if (m.state.editing?.pick !== key || !q(`[data-pm-pick="${css(key)}"]`)?.classList.contains('active')) fails.push(`pick box ${key}: not active after a click (pick = ${m.state.editing?.pick})`);
    }
    const errors = window.__ctlErrors.slice(errs0);
    if (errors.length) fails.push(...errors.map((e) => `error: ${e}`));
    return { fails, seen };
  };

  /** OK stores the edited values: a typed value in the first number field survives OK and the rebuild. */
  window.__pmOk = async (fid) => {
    const input = q('[data-pm-field]:not([data-pm-field^="pt3:"])');
    let key = null; let want = null;
    if (input) {
      key = input.dataset.pmField;
      const cur = Number(feature()[key]);
      want = input.dataset.unit === 'count' ? Math.round(cur) + 1 : Math.round((cur * 1.2 + 0.5) * 100) / 100;
      input.value = String(want); input.dispatchEvent(new Event('change', { bubbles: true })); await settle();
      want = Number(feature()[key]);
    }
    if (preview()?.ok === false) { m.actions.cancelEditing({ quiet: true }); return `preview failed before OK: ${preview()?.error}`; }
    q('[data-pm="ok"]')?.click(); await settle();
    if (m.state.editing) return 'OK did not close the PropertyManager';
    const stored = m.active().features.find((x) => x.id === fid);
    if (!stored) return 'the feature is gone after OK';
    if (key && Math.abs(Number(stored[key]) - want) > 1e-9) return `OK did not store ${key}: ${stored[key]} (wanted ${want})`;
    const bad = [...m.actions.buildPart(m.active()).result.results.entries()].filter(([, r]) => r.ok === false).map(([id, r]) => `${id}: ${r.error}`);
    return bad.length ? `rebuild after OK failed: ${bad.join(', ')}` : 'ok';
  };

  /** phase 'num': opens the feature and checks its number fields; 'opts': the other controls, then OK. */
  window.__pmCheck = async (type, phase = 'all') => {
    let opened = window.__pmOpened;
    const reuse = phase === 'opts' && opened?.type === type && m.state.editing?.feature?.type === type;
    if (!reuse) {
      try { opened = { type, ...(await window.__pmOpen(type)) }; } catch (e) { return `${type}: could not open (${e.message})`; }
      window.__pmOpened = opened;
    }
    // A sketch opens the sketch editor; an imported body has no settings (it says so).
    if (type === 'sketch') { const ok = m.state.editing?.mode === 'sketch' && m.state.editing.feature?.id === opened.f.id; m.actions.cancelEditing({ quiet: true }); window.__pmOpened = null; return ok ? 'sketch ok — Edit opens the sketch editor on it' : `sketch: Edit did not open the sketch editor (${m.state.editing?.mode})`; }
    if (type === 'import') { const ok = !m.state.editing && /./.test(m.state.notice?.text ?? ''); window.__pmOpened = null; return ok ? 'import ok — not editable, a message says so' : 'import: no message and no editor'; }
    if (m.state.editing?.mode !== 'feature' || feature()?.type !== type) return `${type}: the PropertyManager did not open (editing = ${m.state.editing?.mode})`;
    if (!q('.pm-head')) return `${type}: no PropertyManager in the left pane`;
    if (preview()?.ok === false) return `${type}: the fixture preview fails (${preview().error})`;
    const { fails, seen } = await window.__pmExercise(type, opened.fixture, phase);
    if (phase !== 'num') {
      // OK is checked on the stored feature reopened (the options above may have left it without a valid input).
      m.actions.cancelEditing({ quiet: true }); m.actions.editFeature(opened.f.id); await settle();
      const ok = await window.__pmOk(opened.f.id); if (ok !== 'ok') fails.push(ok); window.__pmOpened = null;
    }
    const n = seen.num.length + seen.toggle.length + seen.seg.length + seen.select.length + seen.pick.length;
    return fails.length ? `${type} FAIL: ${fails.join(' ; ')}` : `${type} ok ${n} controls: ${json(seen)}`;
  };
  return 'ok';
})()
