// A custom line rule: a regular expression, its languages, type, severity and
// name (Rules › New custom rule). Shown in the page on the web build and as a
// window of its own on the desktop (views/DialogWindows.jsx).
import React, { useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Dialog, Icon } from '../components/Chrome';
import { IconSelect, Btn, BtnGroup, sevLabel, typeLabel } from './common';
import { SEV, TYPE_ICON, SEV_ICON } from './Panels';
import { useEditorDirty } from '../lib/dirty';

export function CustomRuleDialog({ onClose, onSave }) {
  useLanguage();
  const [draft, setDraft] = useState({ pattern: '', langs: ['*'], type: 'CODE_SMELL', severity: 'MAJOR', name: { ko: '', en: '' } });
  const [tried, setTried] = useState(false);
  let patternError = '';
  if (!draft.pattern.trim()) patternError = t('cr_pattern_empty');
  else {
    try {
      const re = new RegExp(draft.pattern);
      if (re.test('')) patternError = t('cr_pattern_matches_empty');
    } catch (err) { patternError = t('cr_pattern_invalid', { error: err.message }); }
  }
  const nameError = draft.name.ko.trim() ? '' : t('cr_name_empty');
  useEditorDirty('custom-rule', !!(draft.pattern || draft.name.ko), { label: t('custom_rule') });
  const submit = () => {
    setTried(true);
    if (patternError || nameError) return;
    onSave({ ...draft, key: `custom:${Date.now().toString(36)}` });
  };
  return (
    <Dialog title={t('custom_rule')} icon="plus" onClose={onClose}>
      <label className="form-row">{t('pattern')}<input className="mono" value={draft.pattern} aria-invalid={!!(patternError && (tried || draft.pattern))} onChange={(e) => setDraft({ ...draft, pattern: e.target.value })} /></label>
      {patternError && (tried || draft.pattern) && <p className="small bad" data-error="pattern">{patternError}</p>}
      <label className="form-row">{t('name')}<input value={draft.name.ko} onChange={(e) => setDraft({ ...draft, name: { ko: e.target.value, en: e.target.value } })} /></label>
      {nameError && tried && <p className="small bad" data-error="name">{nameError}</p>}
      <div className="form-row inline">
        <span className="form-label"><Icon name="layers" size={14} />{t('type')}</span>
        <IconSelect value={draft.type} onChange={(v) => setDraft({ ...draft, type: v })} width={220} ariaLabel={t('type')}
          options={['BUG', 'VULNERABILITY', 'CODE_SMELL', 'SECURITY_HOTSPOT'].map((type) => ({ value: type, label: typeLabel(type), icon: TYPE_ICON[type] }))} />
      </div>
      <div className="form-row inline">
        <span className="form-label"><Icon name="alert" size={14} />{t('severity')}</span>
        <IconSelect value={draft.severity} onChange={(v) => setDraft({ ...draft, severity: v })} width={220} ariaLabel={t('severity')}
          options={SEV.map((s) => ({ value: s, label: sevLabel(s), icon: SEV_ICON[s] }))} />
      </div>
      <div className="dialog-actions">
        <BtnGroup>
          <Btn icon="save" label={t('save')} primary onClick={submit} />
          <Btn icon="close" label={t('cancel')} onClick={onClose} />
        </BtnGroup>
      </div>
    </Dialog>
  );
}
