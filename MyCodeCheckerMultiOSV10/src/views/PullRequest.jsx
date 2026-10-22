// Analyze › Pull request analysis: issues on changed lines, the PR gate, the
// markdown summary and decoration payloads for four code hosts.
import React, { useEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from '../components/Chrome';
import { useApi, Btn, BtnGroup, IconSelect, Tabs, Stat, ViewHeader, Empty, copyText, saveText } from './common';
import { msg } from './Panels';

const PROVIDERS = [
  { id: 'github', label: 'GitHub', icon: 'branch', file: 'github-check-run.json' },
  { id: 'gitlab', label: 'GitLab', icon: 'branch', file: 'gl-code-quality-report.json' },
  { id: 'azure', label: 'Azure DevOps', icon: 'branch', file: 'azure-devops-threads.json' },
  { id: 'bitbucket', label: 'Bitbucket', icon: 'branch', file: 'bitbucket-code-insights.json' },
];

export function PullRequestView({ project, branch, stamp }) {
  useLanguage();
  const pid = project && project.id;
  const scm = useApi('scm.info', { projectId: pid }, [pid], !!project);
  const [target, setTarget] = useState('');
  const [prKey, setPrKey] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('issues');
  const [provider, setProvider] = useState('github');
  const [note, setNote] = useState('');

  const branches = (scm.data && scm.data.branches) || [];
  useEffect(() => {
    if (target) return;
    const main = branches.find((b) => b.name === 'main' || b.name === 'master');
    setTarget((main && main.name) || (project && project.mainBranch) || 'main');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scm.data, project && project.id]);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      setRes(await call('pr.analyze', { projectId: pid, branch, target: target.trim(), key: prKey.trim() || undefined, lang: getLanguage() }));
    } catch (err) {
      setRes(null);
      setError(err.code === 'NOT_FOUND' ? t('pf_no_analysis') : err.message);
    } finally { setBusy(false); }
  };
  useEffect(() => { setRes(null); }, [pid, branch, stamp]);

  const pr = res && res.pr;
  const gate = pr && pr.qualityGate;
  const payload = res && res.decorations ? JSON.stringify(res.decorations[provider], null, 2) : '';
  const copy = async (text) => setNote((await copyText(text)) ? t('pr_copied') : t('failed'));
  const repo = scm.data;

  return (
    <div className="view">
      <ViewHeader icon="branch" title={t('nav_pullrequest')} hint={t('pr_hint')}>
        <label className="field-inline"><span>{t('pr_target')}</span>
          <input value={target} onChange={(e) => setTarget(e.target.value)} list="pr-branches" style={{ width: 180 }} />
        </label>
        <label className="field-inline"><span>{t('pr_key')}</span>
          <input value={prKey} placeholder="123" onChange={(e) => setPrKey(e.target.value)} style={{ width: 90 }} />
        </label>
        <datalist id="pr-branches">{branches.map((b) => <option key={b.name} value={b.name} />)}</datalist>
        <Btn icon="play" label={busy ? t('analyzing') : t('pr_run')} primary disabled={!project || busy || !target.trim()} onClick={run} />
        <span className="spacer" />
        {repo && (repo.branch || repo.head) && <span className="small"><Icon name="branch" size={13} /> {repo.branch || ''} {repo.head ? repo.head.slice(0, 8) : ''}{repo.dirty ? ` · ${t('pr_dirty')}` : ''}</span>}
      </ViewHeader>
      {!project && <Empty text={t('no_project')} />}
      {error && <Empty text={error} icon="alert" />}
      {note && <p className="small">{note}</p>}
      {!pr && !error && project && <Empty text={t('pr_start')} icon="branch" />}
      {pr && (
        <>
          <div className={`banner ${gate.status === 'OK' ? 'OK' : 'ERROR'}`}>
            <div>
              <div className="k muted">{gate.name} · {t('pr_base')} {pr.base ? pr.base.slice(0, 10) : '—'}</div>
              <strong style={{ fontSize: 20 }}><Icon name={gate.status === 'OK' ? 'check' : 'alert'} size={18} /> {gate.status === 'OK' ? t('passed') : t('failed')}</strong>
            </div>
            <div className="small banner-side">{t('pr_changed', { files: pr.changedFiles, lines: pr.changedLines })}</div>
          </div>
          <div className="card-grid compact">
            <Stat label={t('pr_issues')} value={pr.issues.length} tone={pr.issues.length ? 'bad' : 'ok'} />
            <Stat label={t('bugs')} value={pr.measures.new_bugs} sub={`${t('reliability')} ${pr.ratings.reliability}`} />
            <Stat label={t('vulns')} value={pr.measures.new_vulnerabilities} sub={`${t('security')} ${pr.ratings.security}`} />
            <Stat label={t('smells')} value={pr.measures.new_code_smells} sub={`${t('maintainability')} ${pr.ratings.maintainability}`} />
            <Stat label={t('hotspots')} value={pr.measures.new_security_hotspots} sub={`${t('sec_review')} ${pr.ratings.securityReview}`} />
            <Stat label={t('coverage')} value={pr.measures.new_coverage == null ? '—' : `${pr.measures.new_coverage}%`} />
            <Stat label={t('dup_density')} value={`${pr.measures.new_duplicated_lines_density}%`} />
          </div>
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'issues', label: t('pr_issues'), icon: 'bug', count: pr.issues.length },
            { id: 'gate', label: t('conditions'), icon: 'gate', count: gate.conditions.length },
            { id: 'markdown', label: t('pr_summary'), icon: 'file' },
            { id: 'decor', label: t('pr_decorations'), icon: 'code' },
          ]} />
          {tab === 'issues' && (
            <div className="panel tpanel">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('severity')}</th><th>{t('type')}</th><th>{t('message')}</th><th>{t('location')}</th></tr></thead>
                  <tbody>
                    {pr.issues.map((i) => (
                      <tr key={i.key}>
                        <td><span className={`sev ${i.severity}`}>{i.severity}</span></td>
                        <td className="small">{i.type}</td>
                        <td className="wrap">{msg(i)}<div className="small">{i.rule}</div></td>
                        <td className="small wrap">{i.file}:{i.line}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {pr.issues.length === 0 && <Empty text={t('pr_no_issues')} icon="check" />}
              </div>
            </div>
          )}
          {tab === 'gate' && (
            <div className="panel tpanel">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('pr_metric')}</th><th>{t('pr_threshold')}</th><th className="num">{t('pr_actual')}</th><th>{t('status')}</th></tr></thead>
                  <tbody>
                    {gate.conditions.map((c) => (
                      <tr key={c.id}>
                        <td>{c.metric}</td>
                        <td className="small">{c.op} {c.threshold}</td>
                        <td className="num">{c.actual == null ? '—' : c.actual}</td>
                        <td className={c.status === 'ERROR' ? 'bad' : c.status === 'OK' ? 'ok' : 'muted'}>{c.status === 'NO_DATA' ? t('no_data') : c.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === 'markdown' && (
            <div className="panel">
              <div className="view-toolbar">
                <BtnGroup>
                  <Btn icon="copy" label={t('pr_copy')} onClick={() => copy(res.markdown)} />
                  <Btn icon="save" label={t('save')} onClick={() => saveText('pull-request-summary.md', res.markdown, 'text/markdown')} />
                </BtnGroup>
              </div>
              <pre className="pre selectable">{res.markdown}</pre>
            </div>
          )}
          {tab === 'decor' && (
            <div className="panel">
              <div className="view-toolbar">
                <IconSelect value={provider} options={PROVIDERS.map((p) => ({ value: p.id, label: p.label, icon: p.icon }))} onChange={setProvider} title={t('pr_provider')} width={190} />
                <BtnGroup>
                  <Btn icon="copy" label={t('pr_copy')} onClick={() => copy(payload)} />
                  <Btn icon="save" label={t('save')} onClick={() => saveText(PROVIDERS.find((p) => p.id === provider).file, payload, 'application/json')} />
                </BtnGroup>
              </div>
              <p className="small">{t(`pr_hint_${provider}`)}</p>
              <pre className="pre selectable">{payload}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}
