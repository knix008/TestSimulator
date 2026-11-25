// The start screen (MyUMLMaker style): a moving background behind a board of translucent cards
// that can be moved (handle) and resized (corner): what to do, recent designs, designs to start
// from, the theme and the background. ui layout: startboard.js / startlayout.js.
import React, { useEffect, useMemo, useRef } from 'react';
import { getLanguage, t } from '../i18n.js';
import { isDesktop } from '../lib/platform.js';
import { ANIMATIONS } from '../lib/settings.js';
import { DARK_THEMES, LIGHT_THEMES, customTheme, themeById } from '../lib/themes.js';
import { serializeSvg } from '../lib/iconCanvas.js';
import { TEMPLATES } from '../lib/templates.js';
import { EXAMPLES } from '../lib/examples.js';
import { Btn, Icon, Toggle } from '../components/controls.jsx';
import { APP_NAME, APP_VERSION } from '../components/Chrome.jsx';
import { AnimatedBackground } from './background.js';
import { startBoard } from './startboard.js';
import appIcon from '../../assets/icon.svg';

const GRIP = (
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="20" cy="20" r="2" /><circle cx="14" cy="20" r="2" /><circle cx="20" cy="14" r="2" /><circle cx="8" cy="20" r="2" /><circle cx="14" cy="14" r="2" /><circle cx="20" cy="8" r="2" /></svg>
);

const ANIMATION_ICONS = {
  aurora: 'sparkles', waves: 'refresh', particles: 'blur', constellation: 'shape:star', bubbles: 'gloss', gridflow: 'grid', flowchart: 'arrange', starfield: 'shape:star4', rain: 'shape:drop',
  snow: 'shape:star6', fireflies: 'glow', ripples: 'shape:ring', coderain: 'font', hexagons: 'shape:hexagon', orbits: 'shape:ring', lava: 'shape:flame', spiral: 'refresh',
  confetti: 'shape:sparkle', nodes: 'poly', ribbons: 'shape:banner',
};

function Card({ id, icon, title, extra, bare = false, className = '', children }) {
  return (
    <section className={`start-card start-card-${id} ${bare ? 'bare' : ''} ${className}`} data-card={id} aria-label={title || undefined}>
      {bare
        ? <span className="card-handle-float"><button type="button" className="card-handle" data-card-handle={id} title={t('start.moveCard')} aria-label={t('start.moveCard')}><Icon name="moveHandle" size={15} /></button></span>
        : (
          <h2>
            <button type="button" className="card-handle" data-card-handle={id} title={t('start.moveCard')} aria-label={t('start.moveCard')}><Icon name="moveHandle" size={15} /></button>
            <Icon name={icon} size={18} /><span className="start-card-title">{title}</span><span className="grow" />{extra}
          </h2>
        )}
      <div className="card-body">{children}</div>
      <span className="card-resize" data-card-resize={id} title={t('start.resizeCard')}>{GRIP}</span>
    </section>
  );
}

function Tile({ icon, label, tip, onClick, testId, children }) {
  return (
    <button type="button" className="start-tile" title={tip} onClick={onClick} data-testid={testId}>
      {children ?? <Icon name={icon} size={24} />}
      <span className="tile-text"><b>{label}</b>{tip && <small>{tip}</small>}</span>
    </button>
  );
}

export default function StartScreen({ settings, setSettings, hasSession, onCommand, onTemplate, onExample, userExamples = [], onRemoveExample, onOpenRecent, onRemoveRecent, onClearRecent, onTheme, onLanguage }) {
  const L = getLanguage();
  const boardRef = useRef(null);
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const templateThumbs = useMemo(() => Object.fromEntries(TEMPLATES.map((tpl) => [tpl.id, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializeSvg(tpl.build(), 64))}`])), []);
  const exampleThumbs = useMemo(() => Object.fromEntries(EXAMPLES.map((ex) => [ex.id, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializeSvg(ex.build(), 96))}`])), []);
  const recent = settings.recent ?? [];
  const showRecent = isDesktop();
  const cardIds = ['hero', 'actions', ...(showRecent ? ['recent'] : []), 'templates', 'examples', 'theme', 'background'].join(',');

  // The moving background follows the theme's colours and the chosen speed.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const colors = () => {
      const th = themeById(settingsRef.current.theme, settingsRef.current.customTheme);
      return { bg: th.vars.bg, accent: th.vars.accent, text: th.vars.text, dark: th.dark };
    };
    const anim = new AnimatedBackground(canvas, { colors, speed: () => (settingsRef.current.animationSpeed ?? 100) / 100, kind: settingsRef.current.animation, vivid: true });
    animRef.current = anim;
    // Always moving (as in MyUMLMaker); speed 0 % keeps it still.
    anim.start();
    globalThis.__myicomakerStartAnimation = anim;
    return () => { anim.destroy(); animRef.current = null; };
  }, []);
  useEffect(() => { animRef.current?.setKind(settings.animation); }, [settings.animation]);
  useEffect(() => { animRef.current?.draw(); }, [settings.theme, settings.customTheme]);

  // The card board: moved and resized cards are saved in the settings.
  useEffect(() => {
    const host = boardRef.current;
    if (!host) return undefined;
    const board = startBoard(host, { reduced: Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches), saved: settingsRef.current.startLayout, onSave: (layout) => setSettings({ startLayout: layout }) });
    globalThis.__myicomakerStartBoard = board;
    return () => board.destroy();
  }, [cardIds, setSettings]);

  const themeTile = (th) => (
    <button key={th.id} type="button" role="radio" aria-checked={settings.theme === th.id} className={`theme-tile ${settings.theme === th.id ? 'on' : ''}`} title={th.name[L]} onClick={() => onTheme(th.id)}>
      <span className="theme-chip" aria-hidden="true" style={{ background: th.swatch[0], borderColor: th.swatch[2] }}><i style={{ background: th.swatch[1] }} /><i style={{ background: th.swatch[2] }} /></span>
      <Icon name={th.dark ? 'moon' : 'sun'} size={14} /><span>{th.name[L]}</span>
    </button>
  );

  return (
    <div className="start-page" data-testid="start-screen">
      <canvas ref={canvasRef} className="start-bg" aria-hidden="true" />
      <div className="start-scroll">
        <div className="start-inner" style={{ '--start-card-alpha': `${settings.startCardOpacity}%` }}>
          <div className="start-tools">
            <Toggle icon="startup" label={t('start.showAtStartup')} checked={settings.showStartScreen} onChange={(v) => setSettings({ showStartScreen: v })} />
            <Btn icon="arrange" label={t('start.arrange')} title={t('start.arrangeTip')} onClick={() => globalThis.__myicomakerStartBoard?.arrange()} />
          </div>
          <div className="start-board" ref={boardRef} key={cardIds}>
            <Card id="hero" bare className="start-hero">
              <img src={appIcon} alt="" className="start-icon" draggable={false} />
              <div className="start-hero-text">
                <h1><span>{APP_NAME}</span> <small>v{APP_VERSION}</small></h1>
                <p>{t('app.tagline')}</p>
              </div>
              <div className="start-hero-actions">
                <Btn icon="guide" label={t('action.guide')} title={t('tip.guide')} onClick={() => onCommand('guide')} className="big" />
                <Btn icon="open" label={t('action.open')} onClick={() => onCommand('open')} className="big" />
                <Btn icon="newFile" label={t('action.newDesign')} primary onClick={() => onCommand('new')} className="big" data-testid="start-new" />
              </div>
            </Card>

            <Card id="actions" icon="launcher" title={t('start.actions')}>
              <div className="start-actions">
                <Tile icon="newFile" label={t('action.newDesign')} tip={t('start.tipNew')} onClick={() => onCommand('new')} />
                <Tile icon="open" label={t('action.open')} tip={t('start.tipOpen')} onClick={() => onCommand('open')} />
                <Tile icon="importImage" label={t('start.fromImage')} tip={t('start.tipImage')} onClick={() => onCommand('newFromImage')} />
                {hasSession && <Tile icon="continue" label={t('start.continue')} tip={t('start.tipContinue')} onClick={() => onCommand('continue')} testId="start-continue" />}
                <Tile icon="guide" label={t('action.guide')} tip={t('tip.guide')} onClick={() => onCommand('guide')} />
                <Tile icon={L === 'ko' ? 'langEn' : 'langKo'} label={L === 'ko' ? 'English' : '한국어'} tip={t('start.tipLanguage')} onClick={() => onLanguage(L === 'ko' ? 'en' : 'ko')} />
                <Tile icon="about" label={t('action.about')} tip={t('start.tipAbout')} onClick={() => onCommand('about')} />
                {isDesktop() && <Tile icon="exit" label={t('action.exit')} tip={t('start.tipExit')} onClick={() => onCommand('exit')} />}
              </div>
            </Card>

            {showRecent && (
              <Card id="recent" icon="recent" title={t('start.recent')}
                extra={recent.length ? <Btn icon="trash" label={t('start.clearRecent')} className="small danger" onClick={onClearRecent} /> : null}>
                <div className="start-list">
                  {!recent.length && <div className="start-empty"><Icon name="info" size={16} /><span>{t('start.noRecent')}</span></div>}
                  {recent.map((item) => (
                    <div key={item.path} className="start-row" title={item.path}>
                      <button type="button" className="start-link" onClick={() => onOpenRecent(item.path)}>
                        {item.thumb ? <img src={item.thumb} alt="" width="28" height="28" className="recent-thumb" /> : <Icon name="design" size={24} />}
                        <span className="name">{item.name}</span>
                        <span className="path">{item.path}</span>
                      </button>
                      <button type="button" className="mini" title={t('start.removeRecent')} aria-label={t('start.removeRecent')} onClick={() => onRemoveRecent(item.path)}><Icon name="close" size={14} /></button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card id="templates" icon="template" title={t('start.templates')} extra={<span className="start-card-note">{TEMPLATES.length}</span>}>
              <div className="template-grid">
                {TEMPLATES.map((tpl) => (
                  <Tile key={tpl.id} label={t(`template.${tpl.id}`)} tip={t(`template.${tpl.id}.desc`)} onClick={() => onTemplate(tpl.id)} testId={`template-${tpl.id}`}>
                    <span className="tpl-thumb"><img src={templateThumbs[tpl.id]} alt="" width="40" height="40" draggable={false} /><Icon name={tpl.icon} size={16} className="tpl-badge" /></span>
                  </Tile>
                ))}
              </div>
            </Card>

            <Card id="examples" icon="emoji:1f3a8" title={t('start.examples')} extra={<span className="start-card-note">{EXAMPLES.length + userExamples.length}</span>}>
              <div className="example-grid">
                {EXAMPLES.map((ex) => (
                  <button key={ex.id} type="button" className="example-tile" title={`${ex[L === 'en' ? 'en' : 'ko']} — ${t('start.exampleTip')}`} onClick={() => onExample(ex.id)} data-testid={`example-${ex.id}`}>
                    <img src={exampleThumbs[ex.id]} alt="" width="64" height="64" draggable={false} />
                    <span className="example-name"><Icon name="design" size={14} /><span>{ex[L === 'en' ? 'en' : 'ko']}</span></span>
                  </button>
                ))}
                {userExamples.map((ex) => (
                  <span key={ex.id} className="example-mine" data-user-example={ex.id}>
                    <button type="button" className="example-tile mine" title={`${ex.name} — ${t('library.myExample')}`} onClick={() => onExample(ex.id)}>
                      {ex.thumb ? <img src={ex.thumb} alt="" width="64" height="64" draggable={false} /> : <Icon name="design" size={40} />}
                      <span className="example-name"><Icon name="shape:star" size={14} /><span>{ex.name}</span></span>
                    </button>
                    <button type="button" className="user-emoji-remove" title={t('library.removeExampleTitle')} aria-label={t('library.removeExampleTitle')} onClick={() => onRemoveExample(ex)}><Icon name="close" size={11} /></button>
                  </span>
                ))}
              </div>
              <p className="example-hint"><Icon name="info" size={14} /><span>{t('library.exampleHint')}</span></p>
            </Card>

            <Card id="theme" icon="palette" title={t('start.theme')}>
              <div className="theme-groups">
                <section><h3><Icon name="moon" size={16} /><span>{t('start.themeDark')}</span></h3><div className="theme-tiles" role="radiogroup">{DARK_THEMES.map(themeTile)}</div></section>
                <section><h3><Icon name="sun" size={16} /><span>{t('start.themeLight')}</span></h3><div className="theme-tiles" role="radiogroup">{LIGHT_THEMES.map(themeTile)}</div></section>
                <section className="custom-theme-row"><h3><Icon name="palette" size={16} /><span>{t('theme.custom')}</span></h3><div className="theme-tiles">{themeTile(customTheme(settings.customTheme))}<Btn icon="palette" label={t('theme.customize')} onClick={() => onCommand('themeSettings')} data-testid="start-custom-theme" /></div></section>
              </div>
            </Card>

            <Card id="background" icon="sparkles" title={t('start.background')}>
              <div className="anim-chips" role="radiogroup">
                {ANIMATIONS.map((kind) => (
                  <button key={kind} type="button" role="radio" aria-checked={settings.animation === kind} className={`anim-chip ${settings.animation === kind ? 'on' : ''}`} title={t(`animation.${kind}`)}
                    onClick={() => setSettings({ animation: kind })}>
                    <Icon name={ANIMATION_ICONS[kind] ?? 'sparkles'} size={14} /><span>{t(`animation.${kind}`)}</span>
                  </button>
                ))}
              </div>
              <div className="start-controls">
                <Btn icon="dice" label={t('start.shuffle')} onClick={() => setSettings({ animation: animRef.current?.shuffle() ?? settings.animation })} />
                <label className="start-range"><Icon name="speed" size={16} /><span>{t('start.speed')}</span>
                  <input type="range" min="0" max="300" step="10" value={settings.animationSpeed} onChange={(e) => setSettings({ animationSpeed: Number(e.target.value) })} /><output>{settings.animationSpeed}%</output></label>
                <label className="start-range"><Icon name="opacity" size={16} /><span>{t('start.cardOpacity')}</span>
                  <input type="range" min="20" max="100" step="5" value={settings.startCardOpacity} onChange={(e) => setSettings({ startCardOpacity: Number(e.target.value) })} /><output>{settings.startCardOpacity}%</output></label>
              </div>
            </Card>
          </div>
          <footer className="start-foot">
            <Icon name="info" size={16} /><span className="grow">{APP_NAME} v{APP_VERSION} — {t('start.footer')}</span>
            <span className="muted">© 2026 SHKWON (knix008@naver.com)</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
