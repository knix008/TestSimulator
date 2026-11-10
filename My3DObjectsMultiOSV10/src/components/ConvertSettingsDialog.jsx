import React from 'react';
import { useTranslation } from 'react-i18next';
import Modal from './Modal.jsx';
import { Section } from './Form.jsx';
import { IconSliders, IconRefresh, IconWand, IconImage, IconCube } from './Icons.jsx';
import {
  OptionField, groupOptions, optionValues, valueOf, changedFromDefault,
} from './ConvertOptions.jsx';

// Every conversion parameter of the chosen model in one window, in three
// groups: the input image, the model itself and the surface clean-up. The
// values are the same ones the right panel's Convert tab shows (settings.
// convertOptions, per model); changes apply at once. "Recommended values"
// puts back the model's defaults, for one group or for all of them. The
// surface group can be applied to the result on screen without converting
// again (the engine keeps the model's raw mesh).
export default function ConvertSettingsDialog({
  open, onClose, settings, onSettings, models, health, onConvert, canConvert, onRefine, canRefine, refining,
}) {
  const { t } = useTranslation();
  if (!open) return null;

  const model = models.find((m) => m.id === settings.model);
  const groups = groupOptions(model);
  const values = optionValues(settings, settings.model);
  // Remeshing needs optional libraries; known once the model is loaded.
  const remeshOk = health?.loaded !== settings.model || health?.capabilities?.remesh;
  const stability = settings.backend === 'stability';

  const setOpt = (key, value) => onSettings((s) => ({
    ...s,
    convertOptions: { ...s.convertOptions, [s.model]: { ...(s.convertOptions?.[s.model] || {}), [key]: value } },
  }));
  // Back to the recommended values: of the options given, or all.
  const reset = (opts) => onSettings((s) => {
    const cur = { ...(s.convertOptions?.[s.model] || {}) };
    if (opts) for (const o of opts) delete cur[o.key];
    return { ...s, convertOptions: { ...s.convertOptions, [s.model]: opts ? cur : {} } };
  });

  const section = (id, icon, opts, extra = null) => {
    const Icon = icon;
    const changed = changedFromDefault(values, opts);
    return (
      <Section
        title={(
          <span className="convert-group-title"><Icon size={14} /> {t(`convertSettings.group.${id}`)}</span>
        )}
        actions={(
          <button
            className="icon-btn"
            disabled={!changed}
            onClick={() => reset(opts)}
            title={t('convertSettings.resetGroup')}
            aria-label={t('convertSettings.resetGroup')}
          >
            <IconRefresh size={14} />
          </button>
        )}
      >
        <p className="panel-note">{t(`convertSettings.groupNote.${id}`)}</p>
        {opts.length ? opts.map((o) => (
          <OptionField
            key={o.key}
            o={o}
            t={t}
            value={valueOf(values, o)}
            disabled={o.needs === 'remesh' && !remeshOk}
            onChange={(v) => setOpt(o.key, v)}
          />
        )) : <p className="panel-note">{t('convertSettings.noOptions')}</p>}
        {extra}
      </Section>
    );
  };

  const all = [...groups.input, ...groups.model, ...groups.surface];

  return (
    <Modal
      open
      title={t('convertSettings.title', { model: model?.name || settings.model })}
      icon={IconSliders}
      onClose={onClose}
      width={900}
      className="convert-settings-modal"
      windowName="convert"
      closeLabel={t('settings.close')}
      footer={(
        <>
          <button
            className="btn"
            onClick={() => reset(null)}
            disabled={!Object.keys(values).length}
            title={t('convertSettings.resetAllTip')}
          >
            <IconRefresh size={14} /> {t('convertSettings.resetAll')}
          </button>
          <span className="spacer" />
          <button
            className="btn"
            onClick={onRefine}
            disabled={!canRefine || refining}
            title={canRefine ? t('convertSettings.refineTip') : t('convertSettings.refineUnavailable')}
          >
            <IconWand size={14} /> {refining ? t('convertSettings.refining') : t('convertSettings.refine')}
          </button>
          <button className="btn" onClick={onConvert} disabled={!canConvert} title={t('tip.convert')}>
            <IconWand size={14} /> {t('toolbar.convert')}
          </button>
          <button className="btn primary" onClick={onClose} data-autofocus>{t('settings.close')}</button>
        </>
      )}
    >
      {stability ? <p className="panel-note warn">{t('right.stabilityActive')}</p> : null}
      {changedFromDefault(values, all) ? <p className="panel-note">{t('convertSettings.changed')}</p> : null}
      <div className="convert-settings-grid">
        {section('input', IconImage, groups.input)}
        {section('model', IconCube, groups.model)}
        {section('surface', IconWand, groups.surface)}
      </div>
    </Modal>
  );
}
