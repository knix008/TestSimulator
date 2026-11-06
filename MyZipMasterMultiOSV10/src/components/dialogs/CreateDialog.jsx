import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FORMATS, FORMAT_NAMES, LEVELS, SIZE_UNITS, SPLIT_PRESETS, createOptions, deleteSourcesProblem, formatSize, splitBytes, validateCreate, withFormatExt } from '../../lib/format';
import { baseName, invoke, isDesktop, pickFiles, pickFolder, pickSave } from '../../lib/host';
import { IconPack, IconX } from '../Icons';
import Stepper, { SIZE_STEP } from '../Stepper';

// Create, convert and self-extract all share this form: they are the same choices.
export default function CreateDialog({ initial, mode, canSfx, windows, onCancel, onSubmit, onAddWebFiles }) {
  const { t } = useTranslation();
  const [form, setForm] = useState(() => ({ convert: mode === 'convert', ...initial }));
  const [showPassword, setShowPassword] = useState(false);
  const spec = FORMATS[form.format];
  const patch = (p) => setForm((f) => ({ ...f, ...p }));

  const setFormat = (format) => {
    const next = FORMATS[format];
    patch({
      format,
      method: next.methods[0] ?? '',
      sfx: next.sfx ? form.sfx : false,
      output: withFormatExt(form.output, format, next.sfx && form.sfx, windows),
    });
  };
  const setSfx = (sfx) => patch({ sfx, split: sfx ? 'none' : form.split, output: withFormatExt(form.output, form.format, sfx, windows) });

  // The dialog opened for self-extraction starts that way.
  useEffect(() => {
    if (mode === 'sfx') setSfx(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [rarTool, setRarTool] = useState(null);
  useEffect(() => {
    if (isDesktop) invoke('find_rar_tool').then(setRarTool).catch(() => {});
  }, []);
  const deleteProblem = useMemo(() => deleteSourcesProblem(form), [form]);

  const problem = useMemo(() => validateCreate(form), [form]);
  const part = splitBytes(form);

  const addFiles = async () => {
    if (!isDesktop) return onAddWebFiles('files', (items) => patch({ sources: merge(form.sources, items) }));
    const paths = await pickFiles({ title: t('create.addFiles') });
    if (paths) patch({ sources: merge(form.sources, paths.map((path) => ({ path, label: baseName(path), isDir: false }))) });
    return undefined;
  };
  const addFolder = async () => {
    if (!isDesktop) return onAddWebFiles('folder', (items) => patch({ sources: merge(form.sources, items) }));
    const path = await pickFolder({ title: t('create.addFolder') });
    if (path) patch({ sources: merge(form.sources, [{ path, label: baseName(path), isDir: true }]) });
    return undefined;
  };
  const browse = async () => {
    const path = await pickSave({ title: t('create.output'), defaultPath: form.output });
    if (path) patch({ output: withFormatExt(path, form.format, form.sfx, windows) });
  };

  const title = mode === 'convert' ? t('create.convertTitle') : mode === 'sfx' ? t('create.sfxTitle') : t('create.title');
  const go = () => {
    if (!problem) onSubmit(form, createOptions(form));
  };

  return (
    <div className="modal-backdrop" data-testid="create-dialog">
      <div className="modal wide" role="dialog" aria-label={title}>
        <div className="modal-head">
          <div className="modal-title"><span className="mh-icon"><IconPack size={18} /></span><h2>{title}</h2></div>
          <button className="iconbtn" onClick={onCancel} title={t('common.close')}><IconX /></button>
        </div>
        <div className="modal-scroll">
          <div className="form-grid">
            {mode !== 'convert' && (
              <>
                <label>{t('create.sources')}</label>
                <div>
                  <div className="source-list" data-testid="sources">
                    {form.sources.map((s) => (
                      <div className="source-row" key={s.path} title={s.path}>
                        <span>{s.label ?? baseName(s.path)}</span>
                        <button className="iconbtn sm" title={t('create.remove')} onClick={() => patch({ sources: form.sources.filter((x) => x.path !== s.path) })}><IconX size={13} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="form-row" style={{ marginTop: 6 }}>
                    <button className="btn" data-testid="add-files" onClick={addFiles}>{t('create.addFiles')}</button>
                    <button className="btn" data-testid="add-folder" onClick={addFolder}>{t('create.addFolder')}</button>
                  </div>
                </div>
              </>
            )}

            <label>{t('create.output')}</label>
            <div className="form-row">
              <input className="input grow" data-testid="output" value={form.output} onChange={(e) => patch({ output: e.target.value })} />
              {isDesktop && <button className="btn" data-testid="browse-output" onClick={browse}>{t('create.browse')}</button>}
            </div>

            <label>{t('create.format')}</label>
            <div className="form-row">
              <select className="select grow" data-testid="format" value={form.format} onChange={(e) => setFormat(e.target.value)}>
                {FORMAT_NAMES.map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select>
              {spec.methods.length > 0 && (
                <select className="select grow" data-testid="method" title={t('create.method')} value={form.method || spec.methods[0]} onChange={(e) => patch({ method: e.target.value })}>
                  {spec.methods.map((m) => <option key={m} value={m}>{t(`methodName.${m}`)}</option>)}
                </select>
              )}
              {spec.versions && (
                <select className="select grow" data-testid="rar-version" title={t('create.rarVersion')} value={form.rarVersion || 'rar5'} onChange={(e) => patch({ rarVersion: e.target.value })}>
                  {spec.versions.map((v) => <option key={v} value={v}>{v.replace('rar', 'RAR ')}</option>)}
                </select>
              )}
            </div>

            <label>{t('create.level')}</label>
            <select className="select" data-testid="level" disabled={!spec.levels} value={spec.levels ? form.level : 5} onChange={(e) => patch({ level: Number(e.target.value) })}>
              {LEVELS.map((l) => <option key={l} value={l}>{t(`level.${l}`)}</option>)}
            </select>
            {!isDesktop && (form.format === 'zst' || form.format === 'tar.zst' || form.method === 'zstd') && (
              <><span /><div className="hint">{t('create.zstdHint')}</div></>
            )}

            <div className="section-title">{t('create.secSplit')}</div>
            <label>{t('create.split')}</label>
            <div className="form-row">
              <select className="select grow" data-testid="split" disabled={form.sfx} value={form.split} onChange={(e) => patch({ split: e.target.value })}>
                {SPLIT_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>{p.id === 'none' ? t('create.splitNone') : p.id === 'custom' ? t('create.splitCustom') : p.label}</option>
                ))}
              </select>
              {form.split === 'custom' && (
                <Stepper
                  id="split-text"
                  value={form.splitText}
                  step={SIZE_STEP[form.splitUnit] ?? 1}
                  min={1}
                  onChange={(v) => patch({ splitText: v })}
                  unitNode={(
                    <select className="stepper-unit-select" data-testid="split-unit" value={form.splitUnit} onChange={(e) => patch({ splitUnit: e.target.value })}>
                      {SIZE_UNITS.map((u) => <option key={u}>{u}</option>)}
                    </select>
                  )}
                />
              )}
            </div>
            {part != null && (
              <>
                <span />
                <div className="hint" data-testid="split-hint">{t('create.splitHint')} ({formatSize(part)} = {part.toLocaleString()} B)</div>
              </>
            )}
            {form.format === 'zip' && form.split !== 'none' && (
              <>
                <label>{t('create.zipStyle')}</label>
                <select className="select" data-testid="zip-style" value={form.zipStyle} onChange={(e) => patch({ zipStyle: e.target.value })}>
                  <option value="span">{t('create.zipSpan')}</option>
                  <option value="numbered">{t('create.zipNumbered')}</option>
                </select>
              </>
            )}

            {spec.password && (
              <>
                <div className="section-title">{t('create.secSecurity')}</div>
                <label>{t('create.password')}</label>
                <div className="form-row">
                  <input className="input grow" data-testid="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(e) => patch({ password: e.target.value })} />
                  <label className="check"><input type="checkbox" data-testid="show-password" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />{t('create.showPassword')}</label>
                </div>
                <label>{t('create.confirm')}</label>
                <input className={`input${form.password && form.confirm !== form.password ? ' invalid' : ''}`} data-testid="confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirm} onChange={(e) => patch({ confirm: e.target.value })} />
                {spec.cipher && (
                  <>
                    <label>{t('create.cipher')}</label>
                    <select className="select" data-testid="cipher" disabled={!form.password} value={form.cipher} onChange={(e) => patch({ cipher: e.target.value })}>
                      {['aes256', 'aes128', 'zipcrypto'].map((c) => <option key={c} value={c}>{t(`cipher.${c}`)}</option>)}
                    </select>
                  </>
                )}
                {spec.encryptNames && (
                  <>
                    <span />
                    <label className={`check${form.password ? '' : ' off'}`}><input type="checkbox" data-testid="encrypt-names" disabled={!form.password} checked={form.encryptNames} onChange={(e) => patch({ encryptNames: e.target.checked })} />{t('create.encryptNames')}</label>
                  </>
                )}
              </>
            )}

            <div className="section-title">{t('create.secOptions')}</div>
            {spec.solid && (
              <>
                <span />
                <label className="check"><input type="checkbox" data-testid="solid" checked={form.solid} onChange={(e) => patch({ solid: e.target.checked })} />{t('create.solid')}</label>
              </>
            )}
            {spec.recovery && (
              <>
                <label>{t('create.recovery')}</label>
                <div className="form-row">
                  <Stepper id="recovery" value={form.recovery} unit="%" min={0} max={99} onChange={(v) => patch({ recovery: v })} />
                  <span className="hint">{t('create.recoverySuffix')}</span>
                </div>
              </>
            )}
            {form.format === 'zip' && (
              <>
                <span />
                <label className="check"><input type="checkbox" data-testid="smart-store" checked={form.smartStore !== false} onChange={(e) => patch({ smartStore: e.target.checked })} />{t('create.smartStore')}</label>
              </>
            )}
            {spec.comment && (
              <>
                <label>{t('create.comment')}</label>
                <textarea className="textarea" data-testid="comment" value={form.comment} onChange={(e) => patch({ comment: e.target.value })} />
              </>
            )}
            <label>{t('create.rootFolder')}</label>
            <input className="input" data-testid="root-folder" placeholder={t('create.rootFolderPh')} value={form.rootFolder} onChange={(e) => patch({ rootFolder: e.target.value })} />
            {mode !== 'convert' && (
              <>
                <label>{t('create.exclude')}</label>
                <input className="input" data-testid="exclude" placeholder={t('create.excludePh')} value={form.exclude} onChange={(e) => patch({ exclude: e.target.value })} />
              </>
            )}
            {form.format === 'rar' && rarTool && (
              <>
                <span />
                <label className="check" title={rarTool}><input type="checkbox" data-testid="use-rar-tool" checked={!!form.useRarTool} onChange={(e) => patch({ useRarTool: e.target.checked })} />{t('create.useRarTool')}</label>
                {form.useRarTool && <><span /><div className="hint" data-testid="rar-tool-hint">{t('create.useRarToolHint')}</div></>}
              </>
            )}
            {isDesktop && mode !== 'convert' && (
              <>
                <span />
                <label className={`check${deleteProblem ? ' off' : ''}`}><input type="checkbox" data-testid="delete-sources" disabled={!!deleteProblem} checked={!deleteProblem && !!form.deleteSources} onChange={(e) => patch({ deleteSources: e.target.checked })} />{t('create.deleteSources')}</label>
                {deleteProblem
                  ? <><span /><div className="hint" data-testid="delete-sources-why">{t(deleteProblem)}</div></>
                  : form.deleteSources && <><span /><div className="hint">{t('create.deleteSourcesHint')}</div></>}
              </>
            )}
            {canSfx && spec.sfx && mode !== 'convert' && (
              <>
                <span />
                <label className="check"><input type="checkbox" data-testid="sfx" checked={!!form.sfx} onChange={(e) => setSfx(e.target.checked)} />{t('create.sfx')}</label>
                {form.sfx && <><span /><div className="hint">{t('create.sfxHint')}</div></>}
              </>
            )}
          </div>
        </div>
        <div className="modal-foot">
          {problem && <span className="hint warn" style={{ flex: 1, alignSelf: 'center', textAlign: 'left' }} data-testid="create-problem">{t(problem)}</span>}
          <button className="btn" onClick={onCancel}>{t('common.cancel')}</button>
          <button className="btn primary" data-testid="create-start" disabled={!!problem} onClick={go}>{mode === 'convert' ? t('create.startConvert') : t('create.start')}</button>
        </div>
      </div>
    </div>
  );
}

function merge(list, items) {
  const seen = new Set(list.map((s) => s.path));
  return [...list, ...items.filter((s) => !seen.has(s.path))];
}
