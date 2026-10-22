// File › Reports…: executive, security, MISRA, Coverity integrity / security,
// Sparrow rule set and SBOM reports, previewed in a sandboxed frame.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { useApi, Btn, BtnGroup, IconSelect, ViewHeader, Empty, saveText } from './common';
import { SECURITY_STANDARDS, MISRA_STANDARDS } from './Compliance';

const KIND_ICON = { executive: 'chart', security: 'lock', misra: 'shield', integrity: 'alert', 'coverity-security': 'alert', sparrow: 'list', sbom: 'package' };

const RULE_SETS = [
  { value: 'all', icon: 'layers' },
  { value: 'security', icon: 'lock' },
  { value: 'cwe', icon: 'alert' },
  { value: 'cweTop25', icon: 'alert' },
  { value: 'owasp2021', icon: 'lock' },
  { value: 'cert', icon: 'shield' },
  { value: 'misraC2012', icon: 'shield' },
  { value: 'misraC2023', icon: 'shield' },
  { value: 'misraCpp2023', icon: 'shield' },
];

export function ReportsView({ project, branch, stamp }) {
  useLanguage();
  const kinds = useApi('report.kinds', {}, [], true);
  const [kind, setKind] = useState('executive');
  const [standard, setStandard] = useState('owasp2021');
  const [misra, setMisra] = useState('misraC2012');
  const [ruleSet, setRuleSet] = useState('all');
  const [lang, setLang] = useState(getLanguage());
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const frame = useRef(null);

  const argsFor = (format) => ({
    projectId: project && project.id, branch, kind, format, lang,
    standard: kind === 'security' ? standard.split(':')[0] : kind === 'misra' ? misra : undefined,
    ruleSet: kind === 'sparrow' ? ruleSet : undefined,
  });

  const build = async () => {
    if (!project) return;
    setBusy(true);
    setError('');
    try {
      setOut(await call('report.export', argsFor('html')));
    } catch (err) {
      setOut(null);
      setError(err.code === 'NOT_FOUND' ? t('pf_no_analysis') : err.message);
    } finally { setBusy(false); }
  };

  useEffect(() => { build(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [project && project.id, branch, kind, standard, misra, ruleSet, lang, stamp]);

  const saveCsv = async () => {
    try {
      const res = await call('report.export', argsFor('csv'));
      saveText(res.fileName, res.body, res.type);
    } catch (err) { setError(err.message); }
  };
  const print = () => {
    const win = frame.current && frame.current.contentWindow;
    if (!win) return;
    try { win.focus(); win.print(); } catch (err) { setError(err.message); }
  };

  const kindOptions = ((kinds.data || ['executive']).map((k) => ({ value: k, label: t(`rp_kind_${k.replace(/-/g, '_')}`), icon: KIND_ICON[k] || 'report' })));
  const securityStd = SECURITY_STANDARDS.filter((s) => !s.value.includes(':') || s.value === 'asvs4:1').map((s) => (s.value === 'asvs4:1' ? { ...s, value: 'asvs4', label: 'OWASP ASVS 4.0' } : s));
  const langOptions = [{ value: 'ko', label: '한국어', icon: 'globe' }, { value: 'en', label: 'English', icon: 'globe' }];
  const ruleSetOptions = RULE_SETS.map((r) => ({ ...r, label: t(`rp_set_${r.value}`) }));

  return (
    <div className="view view-fill">
      <ViewHeader icon="report" title={t('nav_reports')} hint={t('rp_hint')}>
        <IconSelect value={kind} options={kindOptions} onChange={setKind} title={t('rp_kind')} width={250} />
        {kind === 'security' && <IconSelect value={standard} options={securityStd} onChange={setStandard} title={t('cp_standard')} width={220} />}
        {kind === 'misra' && <IconSelect value={misra} options={MISRA_STANDARDS} onChange={setMisra} title={t('cp_standard')} width={180} />}
        {kind === 'sparrow' && <IconSelect value={ruleSet} options={ruleSetOptions} onChange={setRuleSet} title={t('rp_rule_set')} width={200} />}
        <IconSelect value={lang} options={langOptions} onChange={setLang} title={t('language')} width={130} />
        <span className="spacer" />
        <BtnGroup>
          <Btn icon="refresh" label={t('pf_refresh')} disabled={!project || busy} onClick={build} />
          <Btn icon="save" label={t('rp_save_html')} disabled={!out} onClick={() => saveText(out.fileName, out.body, out.type)} />
          <Btn icon="download" label={t('rp_save_csv')} disabled={!out} onClick={saveCsv} />
          <Btn icon="print" label={t('rp_print')} disabled={!out} onClick={print} />
        </BtnGroup>
      </ViewHeader>
      {!project && <Empty text={t('no_project')} />}
      {error && <Empty text={error} icon="alert" />}
      {busy && !out && <Empty text={t('loading')} icon="clock" />}
      {out && (
        <div className="report-frame">
          <iframe ref={frame} title={out.fileName} sandbox="allow-same-origin allow-modals" srcDoc={out.body} />
        </div>
      )}
    </div>
  );
}
