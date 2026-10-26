// View › Dependencies: software composition analysis (dependencies,
// vulnerabilities, licenses), SBOM export, OSV database and OSV.dev lookup.
import React, { useMemo, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { call, pickFolder, isDesktop } from '../lib/backend';
import { Icon, Dialog } from '../components/Chrome';
import { useApi, ApiState, Btn, BtnGroup, IconSelect, Toggle, Tabs, Stat, ViewHeader, Empty, Confirm, saveText, NoProject } from './common';

const SEV_ORDER = { CRITICAL: 0, HIGH: 1, MODERATE: 2, MEDIUM: 2, LOW: 3 };
const VERDICT_ICON = { allowed: 'check', review: 'eye', denied: 'alert', unknown: 'info', missing: 'info' };
const CATEGORY_ICON = { permissive: 'check', 'weak-copyleft': 'scale', 'strong-copyleft': 'scale', 'network-copyleft': 'globe', proprietary: 'lock', unknown: 'info' };

function ver(d) { return d.version || d.matchVersion || d.versionSpec || '?'; }

export function ScaView({ project, stamp }) {
  useLanguage();
  const [tab, setTab] = useState('deps');
  const [includeDev, setIncludeDev] = useState(true);
  const [layout, setLayout] = useState('tree');
  const [q, setQ] = useState('');
  const [sbom, setSbom] = useState('cyclonedx');
  const [dialog, setDialog] = useState(null);
  const [osvPath, setOsvPath] = useState('');
  const [note, setNote] = useState('');
  const [online, setOnline] = useState(null);
  const [busy, setBusy] = useState(false);
  const pid = project && project.id;
  const state = useApi('sca.scan', { projectId: pid, includeDev }, [pid, includeDev, stamp], !!project);
  const data = state.data;

  const byId = useMemo(() => new Map(((data && data.dependencies) || []).map((d) => [d.id, d])), [data]);
  const vulnCount = useMemo(() => {
    const m = new Map();
    for (const v of (data && data.vulnerabilities) || []) m.set(v.dependency, (m.get(v.dependency) || 0) + 1);
    return m;
  }, [data]);
  const licenseOf = useMemo(() => new Map(((data && data.licenses) || []).map((l) => [l.dependency, l])), [data]);

  const exportSbom = async () => {
    try {
      const res = await call('sca.sbom', { projectId: pid, format: sbom });
      saveText(res.fileName, res.body, res.type);
    } catch (err) { setNote(err.message); }
  };
  const loadOsv = async () => {
    setBusy(true);
    try {
      const res = await call('sca.setOsvSource', { source: osvPath.trim() });
      setNote(res.source ? t('sca_osv_loaded', { n: res.advisories == null ? '?' : res.advisories, source: res.source }) : t('sca_osv_cleared'));
      setDialog(null);
      state.reload();
    } catch (err) { setNote(err.message); } finally { setBusy(false); }
  };
  const queryOnline = async () => {
    setDialog(null);
    setBusy(true);
    setNote(t('sca_online_running'));
    try {
      const res = await call('sca.queryOsv', { projectId: pid });
      setOnline(res);
      setNote(res.ok ? t('sca_online_done', { n: (res.ids || []).length }) : res.error || '');
    } catch (err) { setNote(err.message); } finally { setBusy(false); }
  };

  const sbomOptions = [
    { value: 'cyclonedx', label: 'CycloneDX 1.5 JSON', icon: 'package' },
    { value: 'spdx', label: 'SPDX 2.3 JSON', icon: 'file' },
    { value: 'spdx-tv', label: 'SPDX 2.3 tag-value', icon: 'file' },
  ];
  const s = data && data.summary;
  return (
    <div className="view">
      <ViewHeader icon="package" title={t('nav_dependencies')} hint={t('sca_hint')}>
        <Toggle checked={includeDev} onChange={setIncludeDev} label={t('sca_include_dev')} icon="code" />
        <span className="spacer" />
        <IconSelect value={sbom} options={sbomOptions} onChange={setSbom} title={t('sca_sbom_format')} width={200} />
        <BtnGroup>
          <Btn icon="download" label={t('sca_export_sbom')} disabled={!data} onClick={exportSbom} />
          <Btn icon="upload" label={t('sca_load_osv')} disabled={!project} onClick={() => setDialog('osv')} />
          <Btn icon="globe" label={t('sca_check_online')} disabled={!data || busy} onClick={() => setDialog('online')} />
        </BtnGroup>
      </ViewHeader>
      {note && <p className="small">{note}</p>}
      {!project && <NoProject />}
      <ApiState state={state} />
      {data && (
        <>
          <div className="card-grid">
            <Stat icon="package" label={t('sca_dependencies')} value={s.dependencies} sub={`${t('sca_direct')} ${s.direct} · ${t('sca_transitive')} ${s.transitive}`} />
            <Stat icon="alert" label={t('sca_vulnerable')} value={s.vulnerable} tone={s.vulnerable ? 'bad' : 'ok'} />
            <Stat icon="unlock" label={t('sca_vulnerabilities')} value={s.vulnerabilities} sub={Object.entries(s.bySeverity || {}).map(([k, n]) => `${k} ${n}`).join(' · ')} />
            <Stat icon="globe" label={t('sca_ecosystems')} value={(s.ecosystems || []).length} sub={(s.ecosystems || []).join(', ')} />
            <Stat icon="report" label={t('sca_advisories')} value={s.advisoryCount} />
          </div>
          {(data.errors || []).length > 0 && <p className="small bad">{data.errors.map((e) => (typeof e === 'string' ? e : `${e.file || ''} ${e.message || ''}`)).join(' · ')}</p>}
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'deps', label: t('sca_dependencies'), icon: 'tree', count: data.dependencies.length },
            { id: 'vulns', label: t('sca_vulnerabilities'), icon: 'alert', count: data.vulnerabilities.length },
            { id: 'licenses', label: t('sca_licenses'), icon: 'scale', count: data.licenses.length },
            ...(online ? [{ id: 'online', label: t('sca_online'), icon: 'globe', count: (online.ids || []).length }] : []),
          ]} />
          {tab === 'deps' && (
            <>
              <div className="view-toolbar">
                <input className="search" placeholder={t('search')} value={q} onChange={(e) => setQ(e.target.value)} />
                <IconSelect value={layout} onChange={setLayout} title={t('sca_layout')} width={150} options={[
                  { value: 'tree', label: t('sca_tree'), icon: 'tree' },
                  { value: 'flat', label: t('sca_flat'), icon: 'list' },
                ]} />
              </div>
              <DepTable deps={data.dependencies} byId={byId} vulnCount={vulnCount} licenseOf={licenseOf} layout={q ? 'flat' : layout} q={q} />
            </>
          )}
          {tab === 'vulns' && <VulnTable vulns={data.vulnerabilities} byId={byId} />}
          {tab === 'licenses' && <LicenseTable licenses={data.licenses} />}
          {tab === 'online' && online && <OnlineResult online={online} />}
          {(data.manifests || []).length > 0 && (
            <p className="small">{t('sca_manifests')}: {data.manifests.map((m) => `${m.file} (${m.ecosystem}, ${m.count})`).join(' · ')}</p>
          )}
        </>
      )}
      {dialog === 'online' && (
        <Confirm title={t('sca_check_online')} body={t('sca_online_confirm')} okLabel={t('sca_send')} onOk={queryOnline} onCancel={() => setDialog(null)} />
      )}
      {dialog === 'osv' && (
        <Dialog title={t('sca_load_osv')} onClose={() => setDialog(null)}>
          <p className="small">{t('sca_osv_hint')}</p>
          <div className="input-row">
            <input value={osvPath} placeholder={isDesktop ? 'C:\\osv\\all.zip' : '/data/osv'} onChange={(e) => setOsvPath(e.target.value)} autoFocus />
            {isDesktop && <Btn icon="folder" label={t('sca_browse')} onClick={async () => { const p = await pickFolder(); if (p) setOsvPath(p); }} />}
          </div>
          <div className="dialog-actions">
            <BtnGroup>
              <Btn icon="upload" label={osvPath.trim() ? t('sca_load') : t('sca_clear_source')} primary disabled={busy} onClick={loadOsv} />
              <Btn icon="close" label={t('cancel')} onClick={() => setDialog(null)} />
            </BtnGroup>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function DepTable({ deps, byId, vulnCount, licenseOf, layout, q }) {
  useLanguage();
  const [open, setOpen] = useState(() => new Set());
  const rows = useMemo(() => {
    if (layout === 'flat') {
      const needle = q.toLowerCase();
      return deps.filter((d) => !needle || `${d.name} ${ver(d)} ${d.license || ''}`.toLowerCase().includes(needle)).map((d) => ({ d, depth: 0 }));
    }
    const out = [];
    const walk = (d, depth, seen) => {
      out.push({ d, depth, hasKids: (d.dependencies || []).length > 0, cycle: seen.has(d.id) });
      if (seen.has(d.id) || !open.has(`${depth}:${d.id}`)) return;
      const next = new Set(seen).add(d.id);
      for (const id of d.dependencies || []) { const c = byId.get(id); if (c) walk(c, depth + 1, next); }
    };
    const roots = deps.filter((d) => d.direct);
    for (const d of (roots.length ? roots : deps)) walk(d, 0, new Set());
    return out;
  }, [deps, byId, layout, q, open]);
  const toggle = (key) => { const n = new Set(open); if (n.has(key)) n.delete(key); else n.add(key); setOpen(n); };
  return (
    <div className="panel tpanel">
      <div className="table-wrap">
        <table>
          <thead><tr>
            <th>{t('sca_package')}</th><th>{t('sca_version')}</th><th>{t('sca_kind')}</th><th>{t('sca_scope')}</th>
            <th>{t('sca_license')}</th><th className="num">{t('sca_vulns_short')}</th><th>{t('location')}</th>
          </tr></thead>
          <tbody>
            {rows.map(({ d, depth, hasKids, cycle }, i) => {
              const key = `${depth}:${d.id}`;
              const lic = licenseOf.get(d.id);
              const n = vulnCount.get(d.id) || 0;
              return (
                <tr key={`${key}-${i}`}>
                  <td className="wrap">
                    <span className="tree-cell" style={{ paddingLeft: depth * 18 }}>
                      {layout === 'tree' && hasKids && !cycle
                        ? <button type="button" className={`tree-toggle ${open.has(key) ? 'open' : ''}`} aria-expanded={open.has(key)} aria-label={d.name} onClick={() => toggle(key)}><Icon name="chevronDown" size={12} /></button>
                        : <span className="tree-toggle-sp" />}
                      <Icon name="package" size={13} />
                      <strong>{d.name}</strong>
                      <span className="pill">{d.ecosystem}</span>
                    </span>
                  </td>
                  <td className="nowrap">{ver(d)}{d.versionSpec && d.version && d.versionSpec !== d.version ? <div className="small">{d.versionSpec}</div> : null}</td>
                  <td>{d.direct ? t('sca_direct') : t('sca_transitive')}</td>
                  <td>{d.scope}</td>
                  <td className="small">{d.license || (lic && lic.expression) || '—'}{lic && <div className={`lic ${lic.verdict}`}>{t(`sca_verdict_${lic.verdict}`)}</div>}</td>
                  <td className={`num ${n ? 'bad' : ''}`}>{n}</td>
                  <td className="small nowrap">{d.manifestFile || d.file}{d.manifestLine || d.line ? `:${d.manifestLine || d.line}` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty text={t('empty')} />}
      </div>
    </div>
  );
}

function VulnTable({ vulns, byId }) {
  useLanguage();
  const [cur, setCur] = useState(null);
  const sorted = [...vulns].sort((a, b) => (SEV_ORDER[String(a.severity).toUpperCase()] ?? 9) - (SEV_ORDER[String(b.severity).toUpperCase()] ?? 9) || (b.score || 0) - (a.score || 0));
  const sel = sorted.find((v) => `${v.id}|${v.dependency}` === cur);
  return (
    <div className="split">
      <div className="panel tpanel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>CVE / GHSA</th><th>{t('severity')}</th><th>{t('sca_package')}</th><th>{t('sca_installed_fixed')}</th><th>{t('sca_upgrade')}</th></tr></thead>
            <tbody>
              {sorted.map((v) => {
                const key = `${v.id}|${v.dependency}`;
                const dep = byId.get(v.dependency);
                return (
                  <tr key={key} className={`click ${cur === key ? 'sel' : ''}`} onClick={() => setCur(key)}>
                    <td className="nowrap"><strong>{v.id}</strong></td>
                    <td className="small wrap">{[...(v.cve || []), ...(v.ghsa || [])].filter((x) => x !== v.id).join(', ') || '—'}</td>
                    <td className="nowrap"><span className={`cvss ${String(v.severity).toUpperCase()}`}>{v.severity || '—'}</span>{v.score != null && <div className="small">CVSS {v.score}{v.approximateScore ? '≈' : ''}</div>}</td>
                    <td className="wrap">{v.package}{dep && <div className="small">{dep.direct ? t('sca_direct') : t('sca_transitive')}</div>}</td>
                    <td className="nowrap">{v.version || '?'} → {v.fixedIn || '—'}</td>
                    <td className="nowrap">{v.suggestedUpgrade ? <span className="ok">{v.suggestedUpgrade}</span> : <span className="muted">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sorted.length === 0 && <Empty text={t('sca_no_vulns')} icon="check" />}
        </div>
      </div>
      <aside className="panel drawer">
        {!sel && <p className="small">{t('sca_pick_vuln')}</p>}
        {sel && (
          <>
            <h3>{sel.summary || sel.id}</h3>
            <p className="small">{sel.id} · {(sel.aliases || []).join(', ')}</p>
            <p className="small">{sel.vector || ''}</p>
            {sel.cwes && sel.cwes.length > 0 && <div className="chips">{sel.cwes.map((c) => <span key={c} className="chip cwe">{c}</span>)}</div>}
            <p className="small wrap">{sel.details}</p>
            {(() => { const d = byId.get(sel.dependency); return d && d.path && d.path.length > 1 ? <p className="small">{t('sca_path')}: {d.path.map((id) => (byId.get(id) ? byId.get(id).name : id)).join(' › ')}</p> : null; })()}
            {(sel.references || []).length > 0 && <ul className="refs">{sel.references.map((r) => <li key={r} className="small wrap">{r}</li>)}</ul>}
          </>
        )}
      </aside>
    </div>
  );
}

function LicenseTable({ licenses }) {
  useLanguage();
  const groups = useMemo(() => {
    const m = new Map();
    for (const l of licenses) {
      const g = m.get(l.category) || { category: l.category, items: [], verdicts: {} };
      g.items.push(l);
      g.verdicts[l.verdict] = (g.verdicts[l.verdict] || 0) + 1;
      m.set(l.category, g);
    }
    return [...m.values()];
  }, [licenses]);
  return (
    <>
      <div className="card-grid">
        {groups.map((g) => (
          <div key={g.category} className="card">
            <div className="k"><Icon name={CATEGORY_ICON[g.category] || 'info'} size={13} /> {t(`sca_cat_${g.category.replace(/-/g, '_')}`)}</div>
            <div className="v">{g.items.length}</div>
            <div className="small">{Object.entries(g.verdicts).map(([v, n]) => `${t(`sca_verdict_${v}`)} ${n}`).join(' · ')}</div>
          </div>
        ))}
      </div>
      <div className="panel tpanel">
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t('sca_package')}</th><th>{t('sca_version')}</th><th>{t('sca_license')}</th><th>{t('sca_category')}</th><th>{t('sca_policy')}</th><th>{t('sca_scope')}</th></tr></thead>
            <tbody>
              {licenses.map((l) => (
                <tr key={l.dependency}>
                  <td className="wrap"><strong>{l.name}</strong> <span className="pill">{l.ecosystem}</span></td>
                  <td className="nowrap">{l.version || '—'}</td>
                  <td className="small wrap">{l.expression || l.declared || '—'}{l.source ? <div>{l.source}</div> : null}</td>
                  <td>{t(`sca_cat_${String(l.category).replace(/-/g, '_')}`)}</td>
                  <td className={`lic ${l.verdict}`}><Icon name={VERDICT_ICON[l.verdict] || 'info'} size={13} /> {t(`sca_verdict_${l.verdict}`)}</td>
                  <td>{l.scope}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {licenses.length === 0 && <Empty text={t('empty')} />}
        </div>
      </div>
    </>
  );
}

function OnlineResult({ online }) {
  useLanguage();
  const vulns = online.vulns || [];
  return (
    <div className="panel tpanel">
      {!online.ok && <Empty text={online.error || t('failed')} icon="alert" />}
      <div className="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>{t('sca_aliases')}</th><th>{t('message')}</th><th>{t('sca_modified')}</th></tr></thead>
          <tbody>
            {vulns.map((v) => (
              <tr key={v.id}>
                <td className="nowrap"><strong>{v.id}</strong></td>
                <td className="small wrap">{(v.aliases || []).join(', ')}</td>
                <td className="wrap">{v.summary || ''}</td>
                <td className="small nowrap">{(v.modified || '').slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {online.ok && vulns.length === 0 && <Empty text={t('sca_no_vulns')} icon="check" />}
      </div>
    </div>
  );
}
