import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getSystemFonts } from '../lib/fonts';
import { THEMES } from '../lib/themes';

const ALIGNS = ['left', 'center', 'right'];
const POS_ROWS = ['top', 'bottom'];

// The settings form body (no window chrome). Shared by the separate settings
// window (SettingsPage).
export default function SettingsForm({ settings, onChange, theme, onTheme, lang, onLang }) {
  const { t } = useTranslation();
  const [fonts, setFonts] = useState(null);

  useEffect(() => {
    let alive = true;
    getSystemFonts().then((list) => { if (alive) setFonts(list); });
    return () => { alive = false; };
  }, []);

  const s = settings;
  const set = (patch) => onChange(patch);

  // Free-text line-spacing field: keep the raw string locally so partial input
  // (e.g. "1.") is not snapped back to 1 mid-typing; commit only valid numbers.
  const [lhText, setLhText] = useState(String(s.lineHeight ?? 1));
  useEffect(() => { setLhText(String(s.lineHeight ?? 1)); }, [s.lineHeight]);
  const onLineHeightInput = (raw) => {
    setLhText(raw);
    const n = parseFloat(raw);
    if (Number.isFinite(n) && n > 0) set({ lineHeight: n });
  };
  const onLineHeightBlur = () => {
    const n = parseFloat(lhText);
    if (!Number.isFinite(n) || n <= 0) setLhText(String(s.lineHeight ?? 1));
  };
  const stepLineHeight = (delta) => {
    const cur = Number.isFinite(parseFloat(lhText)) ? parseFloat(lhText) : (Number(s.lineHeight) || 1);
    let n = Math.round((cur + delta) * 100) / 100;
    if (n < 0.5) n = 0.5;
    if (n > 5) n = 5;
    set({ lineHeight: n });
  };

  return (
    <div className="settings-form">
      {/* ── General ── */}
      <div className="form-section">
        <h3>{t('settings.general')}</h3>
        <div className="field">
          <label>{t('settings.language')}</label>
          <div className="control">
            <div className="segmented lang-seg">
              <button className={lang === 'ko' ? 'on' : ''} onClick={() => onLang('ko')}>한국어</button>
              <button className={lang === 'en' ? 'on' : ''} onClick={() => onLang('en')}>English</button>
            </div>
          </div>
        </div>
        <div className="field">
          <label>{t('settings.theme')}</label>
          <div className="control">
            <div className="theme-grid">
              {THEMES.map((th) => (
                <button
                  key={th.id}
                  className={`theme-swatch${theme === th.id ? ' on' : ''}`}
                  onClick={() => onTheme(th.id)}
                  title={t(`theme.${th.id}`)}
                >
                  <span className="bars">{th.bars.map((c, i) => <span key={i} style={{ background: c }} />)}</span>
                  <span className="name">{t(`theme.${th.id}`)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Export typography ── */}
      <div className="form-section">
        <h3>{t('settings.exportType')}</h3>
        <div className="field">
          <label>{t('settings.font')}</label>
          <div className="control">
            <select
              className="font-select"
              value={s.fontFamily}
              style={s.fontFamily ? { fontFamily: `"${s.fontFamily}"` } : undefined}
              onChange={(e) => set({ fontFamily: e.target.value })}
            >
              <option value="">System Default</option>
              {(fonts || []).map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            {fonts === null && <span className="suffix">{t('settings.loadingFonts')}</span>}
          </div>
        </div>
        <div className="field">
          <label>{t('settings.fontSize')}</label>
          <div className="control">
            <input type="number" min="6" max="48" step="0.5" value={s.fontSizePt}
              onChange={(e) => set({ fontSizePt: Number(e.target.value) || 11 })} />
            <span className="suffix">pt</span>
            {fonts === null && <span className="suffix">· {t('settings.loadingFonts')}</span>}
          </div>
        </div>
        <div className="field">
          <label>{t('settings.lineSpacing')}</label>
          <div className="control">
            <button type="button" className="step-btn" title="-0.5" onClick={() => stepLineHeight(-0.5)}>−</button>
            <input type="number" min="0.5" max="5" step="0.05" value={lhText}
              onChange={(e) => onLineHeightInput(e.target.value)} onBlur={onLineHeightBlur} />
            <button type="button" className="step-btn" title="+0.5" onClick={() => stepLineHeight(0.5)}>+</button>
          </div>
        </div>
      </div>

      {/* ── Pages (cover / index) ── */}
      <div className="form-section">
        <h3>{t('settings.pages')}</h3>
        <div className="field">
          <label>{t('settings.coverPage')}</label>
          <div className="control">
            <label className="field-check">
              <input type="checkbox" checked={s.coverPage} onChange={(e) => set({ coverPage: e.target.checked })} />
              {t('settings.coverPageDesc')}
            </label>
          </div>
        </div>
        {s.coverPage && (
          <>
            <div className="field">
              <label>{t('settings.coverTitle')}</label>
              <div className="control">
                <input type="text" value={s.coverTitle} placeholder={t('settings.coverTitlePh')}
                  onChange={(e) => set({ coverTitle: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>{t('settings.coverVersion')}</label>
              <div className="control">
                <input type="checkbox" className="show-toggle" title={t('settings.showOnCover')}
                  checked={s.coverShowVersion} onChange={(e) => set({ coverShowVersion: e.target.checked })} />
                <input type="text" value={s.coverVersion} placeholder={t('settings.coverVersionPh')}
                  disabled={!s.coverShowVersion} onChange={(e) => set({ coverVersion: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>{t('settings.coverAuthor')}</label>
              <div className="control">
                <input type="checkbox" className="show-toggle" title={t('settings.showOnCover')}
                  checked={s.coverShowAuthor} onChange={(e) => set({ coverShowAuthor: e.target.checked })} />
                <input type="text" value={s.coverAuthor} placeholder={t('settings.coverAuthorPh')}
                  disabled={!s.coverShowAuthor} onChange={(e) => set({ coverAuthor: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>{t('settings.coverDate')}</label>
              <div className="control">
                <input type="checkbox" className="show-toggle" title={t('settings.showOnCover')}
                  checked={s.coverShowDate} onChange={(e) => set({ coverShowDate: e.target.checked })} />
                <input type="text" value={s.coverDate} placeholder={t('settings.coverDatePh')}
                  disabled={!s.coverShowDate} onChange={(e) => set({ coverDate: e.target.value })} />
              </div>
            </div>
          </>
        )}
        <div className="field">
          <label>{t('settings.tocPage')}</label>
          <div className="control">
            <label className="field-check">
              <input type="checkbox" checked={s.tocPage} onChange={(e) => set({ tocPage: e.target.checked })} />
              {t('settings.tocPageDesc')}
            </label>
          </div>
        </div>
      </div>

      {/* ── Header / Footer / Page number ── */}
      <div className="form-section">
        <h3>{t('settings.headerFooter')}</h3>
        <div className="field">
          <label>{t('settings.header')}</label>
          <div className="control">
            <input type="text" value={s.headerText} placeholder={t('settings.headerPh')}
              onChange={(e) => set({ headerText: e.target.value })} />
            <AlignPicker value={s.headerAlign} onChange={(v) => set({ headerAlign: v })} />
          </div>
        </div>
        <div className="field">
          <label>{t('settings.footer')}</label>
          <div className="control">
            <input type="text" value={s.footerText} placeholder={t('settings.footerPh')}
              onChange={(e) => set({ footerText: e.target.value })} />
            <AlignPicker value={s.footerAlign} onChange={(v) => set({ footerAlign: v })} />
          </div>
        </div>
        <div className="field">
          <label>{t('settings.pageNumber')}</label>
          <div className="control">
            <label className="field-check">
              <input type="checkbox" checked={s.showPageNumber}
                onChange={(e) => set({ showPageNumber: e.target.checked })} />
              {t('settings.showPageNumber')}
            </label>
          </div>
        </div>
        {s.showPageNumber && (
          <div className="field">
            <label>{t('settings.pageNumberPos')}</label>
            <div className="control">
              <div className="posgrid">
                {POS_ROWS.map((row) => ALIGNS.map((col) => {
                  const id = `${row}-${col}`;
                  return (
                    <button key={id} className={s.pageNumberPos === id ? 'on' : ''}
                      title={id} onClick={() => set({ pageNumberPos: id })}>●</button>
                  );
                }))}
              </div>
            </div>
          </div>
        )}
        {s.showPageNumber && s.coverPage && (
          <div className="field">
            <label>{t('settings.pageNumberOnCover')}</label>
            <div className="control">
              <label className="field-check">
                <input type="checkbox" checked={s.pageNumberOnCover}
                  onChange={(e) => set({ pageNumberOnCover: e.target.checked })} />
                {t('settings.pageNumberOnCoverDesc')}
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AlignPicker({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="segmented">
      {ALIGNS.map((a) => (
        <button key={a} className={value === a ? 'on' : ''} onClick={() => onChange(a)} title={t(`align.${a}`)}>
          {t(`align.${a}`)}
        </button>
      ))}
    </div>
  );
}
