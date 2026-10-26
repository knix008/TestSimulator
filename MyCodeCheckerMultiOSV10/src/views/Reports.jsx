// File › Reports…: executive, security, MISRA, Defect Analysis integrity / security,
// Security Weakness rule set and SBOM reports, previewed in a sandboxed frame.
import React, { useEffect, useRef, useState } from 'react';
import { t, useLanguage, getLanguage } from '../lib/i18n';
import { call } from '../lib/backend';
import { Icon, CloseButton } from '../components/Chrome';
import { useApi, Btn, BtnGroup, IconSelect, Toggle, ViewHeader, Empty, saveText, saveBase64, warningText, errorText, NoProject } from './common';
import { SECURITY_STANDARDS, MISRA_STANDARDS } from './Compliance';

const KIND_ICON = { executive: 'chart', security: 'lock', misra: 'shield', integrity: 'alert', 'defect-security': 'alert', weakness: 'list', sbom: 'package' };

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

const REG_KINDS = ['executive', 'security', 'integrity', 'weakness', 'sbom'];
const kindName = (k) => (t(`rp_kind_${k}`) === `rp_kind_${k}` ? k : t(`rp_kind_${k}`));

export function ReportsView({ project, branch, stamp }) {
  useLanguage();
  const kinds = useApi('report.kinds', {}, [], true);
  const [kind, setKind] = useState('executive');
  const [standard, setStandard] = useState('owasp2021');
  const [misra, setMisra] = useState('misraC2012');
  const [ruleSet, setRuleSet] = useState('all');
  const [lang, setLang] = useState(getLanguage());
  // Regulatory ZIP: the standard and the reports it holds (report.regulatory standard / kinds).
  const [regStd, setRegStd] = useState('mois2021');
  const [regKinds, setRegKinds] = useState(REG_KINDS);
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const frame = useRef(null);

  const argsFor = (format) => ({
    projectId: project && project.id, branch, kind, format, lang,
    standard: kind === 'security' ? standard.split(':')[0] : kind === 'misra' ? misra : undefined,
    ruleSet: kind === 'weakness' ? ruleSet : undefined,
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
  const [warnings, setWarnings] = useState([]);
  const [exporting, setExporting] = useState('');
  const saveBinary = async (format) => {
    setExporting(format);
    setError('');
    try {
      const res = format === 'zip'
        ? await call('report.regulatory', { projectId: project.id, branch, lang, standard: regStd, kinds: regKinds })
        : await call('report.export', argsFor(format));
      saveBase64(res.fileName, res.base64, res.type);
      setWarnings((res.warnings || []).map(warningText).filter(Boolean));
    } catch (err) { setError(errorText(err)); } finally { setExporting(''); }
  };
  const [dbResult, setDbResult] = useState(null);
  const exportDb = async () => {
    setExporting('db');
    setError('');
    setDbResult(null);
    try { setDbResult(await call('db.export', { projectId: project.id, branch })); } catch (err) { setError(err.code === 'DB_NOT_CONFIGURED' ? t('rp_db_not_configured') : errorText(err)); } finally { setExporting(''); }
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
        {kind === 'weakness' && <IconSelect value={ruleSet} options={ruleSetOptions} onChange={setRuleSet} title={t('rp_rule_set')} width={200} />}
        <IconSelect value={lang} options={langOptions} onChange={setLang} title={t('language')} width={130} />
        <span className="spacer" />
        <BtnGroup>
          <Btn icon="refresh" label={t('pf_refresh')} disabled={!project || busy} onClick={build} />
          <Btn icon="save" label={t('rp_save_html')} disabled={!out} onClick={() => saveText(out.fileName, out.body, out.type)} />
          <Btn icon="download" label={t('rp_save_csv')} disabled={!out} onClick={saveCsv} />
          <Btn icon="print" label={t('rp_print')} disabled={!out} onClick={print} />
        </BtnGroup>
      </ViewHeader>
      {project && (
        <div className="view-toolbar export-row" data-tour="report-formats">
          <span className="tb-label"><Icon name="download" size={14} /> {t('rp_download_as')}</span>
          <BtnGroup>
            <Btn icon="file" label={exporting === 'docx' ? t('rp_exporting') : 'Word'} disabled={!out || !!exporting} onClick={() => saveBinary('docx')} title={t('rp_docx_tip')} />
            <Btn icon="grid" label={exporting === 'xlsx' ? t('rp_exporting') : 'Excel'} disabled={!out || !!exporting} onClick={() => saveBinary('xlsx')} title={t('rp_xlsx_tip')} />
            <Btn icon="report" label={exporting === 'pdf' ? t('rp_exporting') : 'PDF'} disabled={!out || !!exporting} onClick={() => saveBinary('pdf')} title={t('rp_pdf_tip')} />
          </BtnGroup>
          <Btn icon="archive" label={exporting === 'zip' ? t('rp_exporting') : t('rp_regulatory')} primary disabled={!out || !!exporting || regKinds.length === 0} onClick={() => saveBinary('zip')} title={t('rp_regulatory_tip')} />
          <Btn icon="database" label={exporting === 'db' ? t('rp_exporting') : t('rp_db_export')} disabled={!!exporting} onClick={exportDb} title={t('rp_db_export_tip')} />
        </div>
      )}
      {project && (
        <div className="view-toolbar reg-options" data-tour="report-regulatory">
          <span className="tb-label"><Icon name="archive" size={14} /> {t('rp_reg_options')}</span>
          <IconSelect value={regStd} width={260} ariaLabel={t('rp_reg_standard')} title={t('rp_reg_standard')} onChange={setRegStd}
            options={SECURITY_STANDARDS.filter((x) => x.value === 'mois2021' || x.value === 'kisaWeb')} />
          {REG_KINDS.map((k) => (
            <Toggle key={k} icon="report" label={kindName(k)} checked={regKinds.includes(k)}
              onChange={(on) => setRegKinds((cur) => (on ? REG_KINDS.filter((x) => x === k || cur.includes(x)) : cur.filter((x) => x !== k)))} />
          ))}
          {regKinds.length === 0 && <span className="small bad">{t('rp_reg_none')}</span>}
        </div>
      )}
      {dbResult && (
        <div className="note-box ok">
          <Icon name="database" size={14} />
          <div><strong>{t('rp_db_done')}</strong><span className="small">{t('rp_db_detail', { id: dbResult.analysisId ?? '—', issues: dbResult.issues ?? 0, measures: dbResult.measures ?? 0 })}</span></div>
          <CloseButton title={t('close')} aria-label={t('close')} onClick={() => setDbResult(null)} size={13} />
        </div>
      )}
      {warnings.length > 0 && (
        <div className="note-box warn">
          <Icon name="alert" size={14} />
          <div><strong>{t('rp_warnings')}</strong>{warnings.map((w, i) => <div key={i} className="small">{w}</div>)}</div>
          <CloseButton title={t('close')} aria-label={t('close')} onClick={() => setWarnings([])} size={13} />
        </div>
      )}
      {!project && <NoProject />}
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
