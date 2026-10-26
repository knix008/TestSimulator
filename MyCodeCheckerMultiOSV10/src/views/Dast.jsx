// Analyze › Web scan (DAST): scan a running web application you own or are
// authorized to test, with live progress, results and HTML / SARIF reports.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, textOf, useLanguage, getLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from '../components/Chrome';
import { useApi, Btn, BtnGroup, IconSelect, Stepper, ViewHeader, Empty, Confirm, Stat, saveText, fmtDate, linesToList, SevBadge } from './common';

const SEV = ['BLOCKER', 'CRITICAL', 'MAJOR', 'MINOR', 'INFO'];

export function DastView() {
  useLanguage();
  const [target, setTarget] = useState('http://127.0.0.1:8080');
  const [mode, setMode] = useState('passive');
  const [confirmActive, setConfirmActive] = useState(false);
  const [rateLimit, setRateLimit] = useState(5);
  const [maxRequests, setMaxRequests] = useState(500);
  const [maxPages, setMaxPages] = useState(100);
  const [maxDepth, setMaxDepth] = useState(5);
  const [showAuth, setShowAuth] = useState(false);
  const [auth, setAuth] = useState({ cookie: '', bearer: '', headers: '', loginUrl: '', loginFields: '' });
  const [seeds, setSeeds] = useState('');
  const [openapi, setOpenapi] = useState('');
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [currentId, setCurrentId] = useState(null);
  const [result, setResult] = useState(null);
  const [sel, setSel] = useState(null);
  const [sevFilter, setSevFilter] = useState('');
  const results = useApi('dast.results', {}, [], true);
  const timer = useRef(null);

  useEffect(() => () => clearInterval(timer.current), []);
  // Pick up a scan that is still running (for example after switching views).
  useEffect(() => {
    call('dast.progress').then((p) => { if (p && p.running) { setRunning(true); setProgress(p.progress); poll(); } }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!currentId) { setResult(null); return; }
    call('dast.result', { id: currentId }).then((r) => { setResult(r); setSel(null); }).catch((err) => setError(err.message));
  }, [currentId]);
  useEffect(() => {
    if (!currentId && results.data && results.data.length) setCurrentId(results.data[0].id);
  }, [results.data, currentId]);

  function poll() {
    clearInterval(timer.current);
    timer.current = setInterval(async () => {
      try {
        const p = await call('dast.progress');
        if (p.running) setProgress(p.progress);
        else { clearInterval(timer.current); setRunning(false); results.reload(); }
      } catch { /* keep polling */ }
    }, 500);
  }

  const parseHeaders = (text) => {
    const out = {};
    for (const line of String(text).split(/\r?\n/)) {
      const i = line.indexOf(':');
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    return out;
  };
  const start = async () => {
    setError('');
    setRunning(true);
    setProgress(null);
    const a = {};
    if (auth.cookie.trim()) a.cookie = auth.cookie.trim();
    if (auth.bearer.trim()) a.bearer = auth.bearer.trim();
    const headers = parseHeaders(auth.headers);
    if (Object.keys(headers).length) a.headers = headers;
    if (auth.loginUrl.trim()) {
      const fields = {};
      for (const pair of linesToList(auth.loginFields.replace(/&/g, '\n'))) { const i = pair.indexOf('='); if (i > 0) fields[pair.slice(0, i)] = pair.slice(i + 1); }
      a.login = { url: auth.loginUrl.trim(), method: 'POST', fields };
    }
    let spec;
    if (openapi.trim()) {
      try { spec = JSON.parse(openapi); } catch { spec = openapi.trim(); }
    }
    poll();
    try {
      const rec = await call('dast.start', {
        target: target.trim(), mode, rateLimit, maxRequests, maxPages, maxDepth,
        seeds: linesToList(seeds), openapi: spec, auth: Object.keys(a).length ? a : undefined,
      });
      setCurrentId(rec.id);
      setResult(rec);
      setSel(null);
    } catch (err) {
      setError(err.message);
    } finally {
      clearInterval(timer.current);
      setRunning(false);
      results.reload();
    }
  };
  const cancel = () => call('dast.cancel').catch(() => {});
  const save = async (format) => {
    if (!result) return;
    try {
      const res = await call('dast.report', { id: result.id, format, lang: getLanguage() });
      saveText(res.fileName, res.body, res.type);
    } catch (err) { setError(err.message); }
  };

  const findings = useMemo(() => ((result && result.findings) || []).filter((f) => !sevFilter || f.severity === sevFilter), [result, sevFilter]);
  const finding = sel != null ? findings[sel] : null;
  const list = results.data || [];
  const modeOptions = [
    { value: 'passive', label: t('da_passive'), icon: 'eye' },
    { value: 'active', label: t('da_active'), icon: 'alert' },
  ];
  const sevOptions = [{ value: '', label: t('ib_any_severity'), icon: 'list' }, ...SEV.map((s) => ({ value: s, label: s, icon: s === 'INFO' ? 'info' : 'alert' }))];

  return (
    <div className="view">
      <ViewHeader icon="globe" title={t('nav_dast')} hint={t('da_hint')}>
        <label className="field-inline grow"><span>{t('da_target')}</span>
          <input value={target} disabled={running} onChange={(e) => setTarget(e.target.value)} placeholder="https://app.example.test" />
        </label>
        <IconSelect value={mode} options={modeOptions} width={230} title={t('da_mode')}
          onChange={(v) => { if (v === 'active' && mode !== 'active') setConfirmActive(true); else setMode(v); }} />
        <BtnGroup>
          <Btn icon="play" label={running ? t('da_running') : t('da_start')} primary disabled={running || !/^https?:\/\//i.test(target.trim())} onClick={start} />
          <Btn icon="stop" label={t('da_cancel')} disabled={!running} onClick={cancel} />
        </BtnGroup>
      </ViewHeader>
      <div className="panel">
        <div className="limits-row">
          <Stepper label={t('da_rate')} value={rateLimit} min={1} max={50} onChange={setRateLimit} width={56} />
          <Stepper label={t('da_max_requests')} value={maxRequests} min={10} max={20000} step={50} onChange={setMaxRequests} />
          <Stepper label={t('da_max_pages')} value={maxPages} min={1} max={5000} step={10} onChange={setMaxPages} />
          <Stepper label={t('da_max_depth')} value={maxDepth} min={0} max={20} onChange={setMaxDepth} width={48} />
          <span className="spacer" />
          <Btn icon={showAuth ? 'chevronDown' : 'lock'} label={t('da_auth_more')} active={showAuth} onClick={() => setShowAuth(!showAuth)} />
        </div>
        {showAuth && (
          <div className="form-grid" style={{ marginTop: 10 }}>
            <label>{t('da_cookie')}<input value={auth.cookie} placeholder="sid=…" onChange={(e) => setAuth({ ...auth, cookie: e.target.value })} /></label>
            <label>{t('da_bearer')}<input type="password" value={auth.bearer} onChange={(e) => setAuth({ ...auth, bearer: e.target.value })} /></label>
            <label>{t('da_login_url')}<input value={auth.loginUrl} placeholder="https://app.example.test/login" onChange={(e) => setAuth({ ...auth, loginUrl: e.target.value })} /></label>
            <label>{t('da_login_fields')}<input value={auth.loginFields} placeholder="user=alice&pass=…" onChange={(e) => setAuth({ ...auth, loginFields: e.target.value })} /></label>
            <label>{t('da_headers')}<textarea value={auth.headers} placeholder="x-api-key: …" onChange={(e) => setAuth({ ...auth, headers: e.target.value })} /></label>
            <label>{t('da_seeds')}<textarea value={seeds} placeholder="https://app.example.test/admin" onChange={(e) => setSeeds(e.target.value)} /></label>
            <label className="span2">{t('da_openapi')}<textarea value={openapi} placeholder='https://app.example.test/openapi.json  /  { "openapi": "3.0.0", … }' onChange={(e) => setOpenapi(e.target.value)} /></label>
          </div>
        )}
        <p className="small" style={{ margin: '8px 0 0' }}><Icon name="info" size={12} /> {mode === 'active' ? t('da_active_note') : t('da_passive_note')}</p>
      </div>
      {running && (
        <div className="progress-box">
          <div className="progress-bar"><span style={{ width: `${progress && maxRequests ? Math.min(100, (progress.requests / maxRequests) * 100) : 3}%` }} /></div>
          <span className="small">{progress ? t('da_progress', { phase: progress.phase || '…', requests: progress.requests || 0, pages: progress.pages || 0, findings: progress.findings || 0 }) : t('da_starting')}</span>
        </div>
      )}
      {error && <Empty text={error} icon="alert" />}
      <div className="split-2">
        <div className="panel tpanel">
          <h3 className="sub-title pad">{t('da_results')}</h3>
          <div className="table-wrap short">
            <table>
              <thead><tr><th>{t('when')}</th><th>{t('da_target')}</th><th>{t('da_mode')}</th><th className="num">{t('da_findings')}</th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id} className={`click ${currentId === r.id ? 'sel' : ''}`} onClick={() => setCurrentId(r.id)}>
                    <td className="small nowrap">{fmtDate(r.startedAt)}</td>
                    <td className="small wrap">{[].concat(r.target || []).join(', ')}{r.cancelled ? ` · ${t('da_cancelled')}` : ''}</td>
                    <td className="small">{r.mode === 'active' ? t('da_active') : t('da_passive')}</td>
                    <td className="num">{r.findingCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list.length === 0 && <Empty text={t('da_no_results')} />}
          </div>
        </div>
        <div>
          {result && (
            <>
              <div className="card-grid compact">
                <Stat icon="alert" label={t('da_findings')} value={(result.findings || []).length} tone={(result.findings || []).length ? 'bad' : 'ok'} />
                <Stat icon="globe" label={t('da_requests')} value={result.requests} />
                <Stat icon="file" label={t('da_pages')} value={(result.pages || []).length} />
                <Stat icon="ban" label={t('da_out_of_scope')} value={(result.outOfScopeSkipped || []).length} />
              </div>
              <div className="view-toolbar">
                <IconSelect value={sevFilter} options={sevOptions} onChange={(v) => { setSevFilter(v); setSel(null); }} title={t('severity')} width={170} />
                <span className="spacer" />
                <BtnGroup>
                  <Btn icon="save" label={t('rp_save_html')} onClick={() => save('html')} />
                  <Btn icon="download" label={t('da_save_sarif')} onClick={() => save('sarif')} />
                </BtnGroup>
              </div>
            </>
          )}
        </div>
      </div>
      {result && (
        <div className="split">
          <div className="panel tpanel">
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('rule')}</th><th>{t('severity')}</th><th>URL</th><th>{t('da_param')}</th><th>{t('da_evidence')}</th></tr></thead>
                <tbody>
                  {findings.map((f, i) => (
                    <tr key={`${f.rule}-${f.url}-${f.param}-${i}`} className={`click ${sel === i ? 'sel' : ''}`} onClick={() => setSel(i)}>
                      <td className="wrap"><strong>{f.rule}</strong><div className="small">{textOf(f.message)}</div></td>
                      <td><SevBadge sev={f.severity} /><div className="small">{f.type === 'SECURITY_HOTSPOT' ? t('hotspots') : t('vulns')}</div></td>
                      <td className="small wrap">{f.method} {f.url}</td>
                      <td className="small">{f.param || '—'}</td>
                      <td className="small wrap mono">{String(f.evidence || '').slice(0, 120)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {findings.length === 0 && <Empty text={t('da_no_findings')} icon="check" />}
            </div>
          </div>
          <aside className="panel drawer">
            {!finding && <p className="small">{t('da_pick')}</p>}
            {finding && (
              <>
                <h3>{textOf(finding.message)}</h3>
                <p className="small">{finding.rule} · {finding.cwe}{(finding.owasp2021 || []).length ? ` · OWASP ${finding.owasp2021.join(', ')}` : ''}</p>
                <p className="small wrap">{finding.method} {finding.url}{finding.param ? ` · ${finding.param}` : ''}</p>
                {finding.evidence && <><h3>{t('da_evidence')}</h3><pre className="pre small-pre selectable">{finding.evidence}</pre></>}
                {finding.request && <><h3>{t('da_request')}</h3><pre className="pre small-pre selectable">{finding.request}</pre></>}
                {finding.response && <><h3>{t('da_response')}</h3><pre className="pre small-pre selectable">{finding.response}</pre></>}
              </>
            )}
          </aside>
        </div>
      )}
      {confirmActive && (
        <Confirm title={t('da_active')} body={t('da_active_confirm')} okLabel={t('da_i_am_authorized')} danger
          onOk={() => { setMode('active'); setConfirmActive(false); }} onCancel={() => setConfirmActive(false)} />
      )}
    </div>
  );
}
