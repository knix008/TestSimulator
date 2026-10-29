// Analyze › Pull request analysis: issues on changed lines, the PR gate, the
// markdown summary and decoration payloads for four code hosts.
import React, { useEffect, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon } from '../components/Chrome';
import { useApi, Btn, BtnGroup, IconSelect, Tabs, Stat, ViewHeader, Empty, copyText, saveText, NoProject, SevBadge, TypeBadge, Stepper, errorText, Glossary, openCodeRow } from './common';
import { metricLabel } from './Panels';
import { FocusStat, FocusAll, useFocus } from '../components/FocusStats';
import { msg } from './Panels';

const PROVIDERS = [
  { id: 'github', label: 'GitHub', icon: 'branch', file: 'github-check-run.json' },
  { id: 'gitlab', label: 'GitLab', icon: 'branch', file: 'gl-code-quality-report.json' },
  { id: 'azure', label: 'Azure DevOps', icon: 'branch', file: 'azure-devops-threads.json' },
  { id: 'bitbucket', label: 'Bitbucket', icon: 'branch', file: 'bitbucket-code-insights.json' },
];

const PR_TYPES = ['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'];

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
  // A type tile shows the PR issues of that type alone.
  const [focus, toggleFocus, clearFocus] = useFocus('pr', pid || '', PR_TYPES);
  const focusType = (id) => { toggleFocus(id); setTab('issues'); };
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
  const prIssues = pr ? (focus ? pr.issues.filter((i) => i.type === focus) : pr.issues) : [];
  const gate = pr && pr.qualityGate;
  const payload = res && res.decorations ? JSON.stringify(res.decorations[provider], null, 2) : '';
  const copy = async (text) => setNote((await copyText(text)) ? t('pr_copied') : t('failed'));
  const repo = scm.data;

  return (
    <div className="view">
      <ViewHeader icon="branch" title={t('nav_pullrequest')} hint={t('pr_hint')}>
        <label className="field-inline"><span data-term="pr_target">{t('pr_target')}</span>
          <input value={target} onChange={(e) => setTarget(e.target.value)} list="pr-branches" style={{ width: 180 }} />
        </label>
        <label className="field-inline"><span>{t('pr_key')}</span>
          <input value={prKey} placeholder="123" onChange={(e) => setPrKey(e.target.value)} style={{ width: 90 }} />
        </label>
        <datalist id="pr-branches">{branches.map((b) => <option key={b.name} value={b.name} />)}</datalist>
        <Btn icon="play" label={busy ? t('analyzing') : t('pr_run')} primary disabled={!project || busy || !target.trim()} onClick={run} />
        <span className="spacer" />
        {repo && (repo.branch || repo.head) && <span className="small"><Icon name="branch" size={13} /> {repo.branch || ''} {repo.head ? repo.head.slice(0, 8) : ''}{repo.dirty ? <> · <span data-term="pr_dirty">{t('pr_dirty')}</span></> : ''}</span>}
      </ViewHeader>
      {!project && <NoProject />}
      {error && <Empty text={error} icon="alert" />}
      {note && <p className="small">{note}</p>}
      {project && <Glossary id="pr" terms={[
        ['PR', t('nav_pullrequest'), t('gl_pr')],
        [t('pr_target'), '', t('gl_pr_target')],
        [t('pr_base'), t('gl_pr_base_name'), t('gl_pr_base')],
        [t('pr_issues'), '', t('gl_pr_issues')],
        [t('gl_pr_gate_term'), '', t('gl_pr_gate')],
        [t('pr_summary'), '', t('gl_pr_summary')],
        [t('pr_decorations'), '', t('gl_pr_decor')],
        [t('pr_publish_title'), '', t('gl_pr_publish')],
      ]} />}
      {!pr && !error && project && <Empty text={t('pr_start')} icon="branch" />}
      {pr && (
        <>
          <div className={`banner ${gate.status === 'OK' ? 'OK' : 'ERROR'}`}>
            <div>
              <div className="k muted"><span data-term="pr_gate">{gate.name}</span> · <span data-term="pr_base">{t('pr_base')}</span> {pr.base ? pr.base.slice(0, 10) : '—'}</div>
              <strong style={{ fontSize: 20 }}><Icon name={gate.status === 'OK' ? 'check' : 'alert'} size={18} /> {gate.status === 'OK' ? t('passed') : t('failed')}</strong>
            </div>
            <div className="small banner-side"><span data-term="pr_changed">{t('pr_changed', { files: pr.changedFiles, lines: pr.changedLines })}</span></div>
          </div>
          <div className="card-grid compact">
            <Stat icon="bug" label={t('pr_issues')} value={pr.issues.length} tone={pr.issues.length ? 'bad' : 'ok'} />
            <FocusStat id="BUG" focus={focus} onToggle={focusType} kind="BUG" icon="bug" term="new_bugs" label={t('bugs')} value={pr.measures.new_bugs} sub={`${t('reliability')} ${pr.ratings.reliability}`} />
            <FocusStat id="VULNERABILITY" focus={focus} onToggle={focusType} kind="VULNERABILITY" icon="unlock" term="new_vulnerabilities" label={t('vulns')} value={pr.measures.new_vulnerabilities} sub={`${t('security')} ${pr.ratings.security}`} />
            <FocusStat id="CODE_SMELL" focus={focus} onToggle={focusType} kind="CODE_SMELL" icon="smell" term="new_code_smells" label={t('smells')} value={pr.measures.new_code_smells} sub={`${t('maintainability')} ${pr.ratings.maintainability}`} />
            <FocusStat id="SECURITY_HOTSPOT" focus={focus} onToggle={focusType} kind="SECURITY_HOTSPOT" icon="shield" term="new_security_hotspots" label={t('hotspots')} value={pr.measures.new_security_hotspots} sub={`${t('sec_review')} ${pr.ratings.securityReview}`} />
            <Stat icon="checkCircle" term="new_coverage" label={t('coverage')} value={pr.measures.new_coverage == null ? '—' : `${pr.measures.new_coverage}%`} />
            <Stat icon="copy" term="new_duplicated_lines_density" label={t('dup_density')} value={`${pr.measures.new_duplicated_lines_density}%`} />
          </div>
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: 'issues', label: t('pr_issues'), icon: 'bug', count: prIssues.length },
            { id: 'gate', label: t('conditions'), icon: 'gate', count: gate.conditions.length },
            { id: 'markdown', label: t('pr_summary'), icon: 'file' },
            { id: 'decor', label: t('pr_decorations'), icon: 'code' },
          ]} />
          {tab === 'issues' && focus && <div className="view-toolbar"><FocusAll focus={focus} onClear={clearFocus} /></div>}
          {tab === 'issues' && (
            <div className="panel tpanel">
              <div className="table-wrap">
                <table>
                  <thead><tr><th><span data-term="severity">{t('severity')}</span></th><th>{t('type')}</th><th>{t('message')}</th><th>{t('location')}</th></tr></thead>
                  <tbody>
                    {prIssues.map((i) => (
                      <tr key={i.key} className={i.file ? 'click' : ''} {...openCodeRow(i.file, i.line)}>
                        <td><SevBadge sev={i.severity} /></td>
                        <td className="nowrap"><TypeBadge type={i.type} /></td>
                        <td className="wrap">{msg(i)}<div className="small">{i.rule}</div></td>
                        <td className="small wrap">{i.file}:{i.line}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {prIssues.length === 0 && <Empty text={focus ? t('fs_no_match') : t('pr_no_issues')} icon="check" />}
              </div>
            </div>
          )}
          {tab === 'gate' && (
            <div className="panel tpanel">
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('pr_metric')}</th><th><span data-term="pr_threshold">{t('pr_threshold')}</span></th><th className="num"><span data-term="pr_actual">{t('pr_actual')}</span></th><th>{t('status')}</th></tr></thead>
                  <tbody>
                    {gate.conditions.map((c) => (
                      <tr key={c.id}>
                        <td><span data-term={c.metric}>{metricLabel(c.metric, getLanguage())}</span></td>
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
              <p className="small"><span data-term="pr_decoration">{t('pr_decorations')}</span> · {t(`pr_hint_${provider}`)}</p>
              <PublishBox project={project} branch={branch} target={target} provider={provider} head={repo && repo.head} prKey={prKey} />
              <pre className="pre selectable">{payload}</pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const PR_NUMBER_KEY = { github: 'prNumber', gitlab: 'mrIid', azure: 'pullRequestId', bitbucket: 'prNumber' };

// Posts the PR result to the code host (pr.decorate) with the ALM connection
// from Administration › Integrations; the PR number and head commit are asked here.
function PublishBox({ project, branch, target, provider, head, prKey }) {
  useLanguage();
  const [num, setNum] = useState(Number(prKey) || 1);
  const [sha, setSha] = useState(head || '');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (head && !sha) setSha(head); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [head]);
  useEffect(() => { if (Number(prKey)) setNum(Number(prKey)); }, [prKey]);
  const publish = async () => {
    setBusy(true);
    setError('');
    setRes(null);
    try {
      setRes(await call('pr.decorate', {
        projectId: project.id, branch, provider, target: target.trim() || undefined, headSha: sha.trim() || undefined,
        config: { [PR_NUMBER_KEY[provider]]: num, headSha: sha.trim() || undefined },
      }));
    } catch (err) { setError(errorText(err)); } finally { setBusy(false); }
  };
  return (
    <div className="publish-box">
      <h3 className="sub-title" style={{ marginTop: 0 }}><Icon name="upload" size={15} />{t('pr_publish_title')}</h3>
      <p className="small">{t('pr_publish_hint')}</p>
      <div className="view-toolbar">
        <Stepper label={t(`pr_number_${provider}`)} value={num} min={1} max={9999999} width={90} onChange={setNum} />
        <label className="field-inline grow"><span data-term="pr_head_sha">{t('pr_head_sha')}</span><input className="mono" value={sha} placeholder="a1b2c3d…" onChange={(e) => setSha(e.target.value)} /></label>
        <Btn icon={busy ? 'hourglass' : 'upload'} label={busy ? t('pr_publishing') : t('pr_publish')} primary disabled={busy || !project} onClick={publish} />
      </div>
      {error && <p className="small bad"><Icon name="xCircle" size={12} /> {error}</p>}
      {res && (
        <div className="note-box ok">
          <Icon name="checkCircle" size={14} />
          <div><strong>{t('pr_published')}</strong><pre className="pre small-pre selectable">{typeof res === 'string' ? res : JSON.stringify(res, null, 2)}</pre></div>
        </div>
      )}
    </div>
  );
}
