import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatedBackground } from '../lib/background';
import { fitLayout, heldLayout, movedBy, resizedBy, settleMove, settleResize } from '../lib/startLayout';
import BackgroundCards, { themeColors } from './BackgroundCards';
import { SliderStepper } from './Stepper';
import { baseName, dirName, isDesktop } from '../lib/host';
import { fileIconFor } from '../lib/format';
import { FILE_FACES } from '../lib/fileFaces';
import buildInfo from '../build-info.json';
import { IconFolderOpen, IconFolderPlus, IconPack, IconFilePlus, IconArchive, IconHelp, IconSelectAll } from './Icons';

const Action = ({ id, icon: Icon, title, hint, onClick }) => (
  <button className="start-action" data-testid={id} onClick={onClick}>
    <span className="start-action-icon"><Icon size={26} /></span>
    <span className="start-action-title">{title}</span>
    <span className="start-action-hint">{hint}</span>
  </button>
);

// What the program opens with, unless it was started on a file. The title with the guide and the
// bottom line stay where they are; the two cards between them move and change size, by the same
// handles MyDiagram's start page has: the heading or its dots to move, the triangle of dots to resize
// (twice quickly, or the arrange button: back to the default arrangement), Alt+arrows and
// Alt+Shift+arrows on the handle. Whatever is done to one card, the two end up arranged again.
export default function StartScreen({ recent, onNew, onOpen, onBrowse, onRecent, onPickFiles, onPickFolder, onGuide, showAtStart, onShowAtStart, background, onBackground, layout, onLayout }) {
  const { t } = useTranslation();
  const canvas = useRef(null);
  const engine = useRef(null);
  const speed = useRef(1);
  speed.current = Math.max(0, Number(background.speed) || 0) / 100;

  useEffect(() => {
    const bg = new AnimatedBackground(canvas.current, { colors: themeColors, speed: () => speed.current, kind: background.kind, vivid: true });
    engine.current = bg;
    canvas.current.__zmBackground = bg;
    bg.resize();
    bg.start();
    return () => bg.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    engine.current?.setKind(background.kind);
  }, [background.kind]);

  // ── The board ─────────────────────────────────────────────────────────────────────────────────
  const board = useRef(null);
  const [size, setSize] = useState({ w: 900, h: 400 });
  const [live, setLive] = useState(null);
  const lastGrip = useRef(0);
  // The cards glide only into the place a person just gave them: never when the window appears
  // or changes size, when they would be moving under the pointer.
  const [gliding, setGliding] = useState(false);
  const glideTimer = useRef(0);
  const arrange = (next) => {
    setGliding(true);
    clearTimeout(glideTimer.current);
    glideTimer.current = setTimeout(() => setGliding(false), 260);
    onLayout(next);
  };
  useEffect(() => () => clearTimeout(glideTimer.current), []);
  // Before the first paint, so the cards do not glide in from a guessed size.
  useLayoutEffect(() => {
    const measure = () => {
      if (board.current) setSize({ w: board.current.clientWidth, h: board.current.clientHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(board.current);
    return () => ro.disconnect();
  }, []);
  const shown = live ? heldLayout(live.layout, live.id, size.w) : fitLayout(layout, size.w, size.h);

  const startDrag = (event, id, change, settle) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const { pointerId, clientX, clientY } = event;
    const from = shown;
    let current = from;
    const place = (e) => {
      current = { ...from, [id]: change(from[id], e.clientX - clientX, e.clientY - clientY) };
    };
    const move = (e) => {
      if (e.pointerId !== pointerId) return;
      place(e);
      setLive({ id, layout: current });
    };
    // On the window, so a scroll bar appearing under the pointer cannot lose the release; and the
    // release counts as a move, because the browser may merge the last move into it.
    const up = (e) => {
      if (e.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (e.type === 'pointerup') place(e);
      setLive(null);
      if (current !== from) arrange(settle(current, id, size.w));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };
  const onGripDown = (event, id) => {
    const now = Date.now();
    if (now - lastGrip.current < 350) {
      lastGrip.current = 0;
      event.preventDefault();
      arrange(null);
      return;
    }
    lastGrip.current = now;
    startDrag(event, id, resizedBy, settleResize);
  };
  const onHandleKey = (event, id) => {
    const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!event.altKey || !direction) return;
    event.preventDefault();
    // With Shift a step of size; without, far enough to take the other card's place.
    if (event.shiftKey) {
      arrange(settleResize({ ...shown, [id]: resizedBy(shown[id], direction[0] * 16, direction[1] * 16) }, id, size.w));
    } else {
      const far = shown[id].h + shown.main.h + shown.background.h;
      arrange(settleMove({ ...shown, [id]: movedBy(shown[id], direction[0] * size.w, direction[1] * far) }, id, size.w));
    }
  };

  const card = (id, title, body) => {
    const c = shown[id];
    return (
      <section
        className={`start-card${live?.id === id ? ' moving' : ''}`}
        data-testid={`start-card-${id}`}
        style={{ transform: `translate(${c.x}px, ${c.y}px)`, width: c.w, height: c.h }}
      >
        <header className="start-card-head" data-card-head={id} onPointerDown={(e) => startDrag(e, id, movedBy, settleMove)}>
          <button type="button" className="start-card-handle" data-card-handle={id} title={t('start.moveCard')} aria-label={t('start.moveCard')} onKeyDown={(e) => onHandleKey(e, id)}>⠿</button>
          <span className="start-section">{title}</span>
        </header>
        <div className="start-card-body">{body}</div>
        <span className="start-card-grip" data-card-grip={id} title={t('start.resizeCard')} onPointerDown={(e) => onGripDown(e, id)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><g fill="currentColor"><circle cx="10.5" cy="1.5" r="1.1" /><circle cx="6" cy="6" r="1.1" /><circle cx="10.5" cy="6" r="1.1" /><circle cx="1.5" cy="10.5" r="1.1" /><circle cx="6" cy="10.5" r="1.1" /><circle cx="10.5" cy="10.5" r="1.1" /></g></svg>
        </span>
      </section>
    );
  };

  return (
    <div className="start" data-testid="start-screen">
      <canvas ref={canvas} className="start-canvas" data-testid="start-canvas" style={{ opacity: 1 - Math.min(100, Math.max(0, Number(background.transparency) || 0)) / 100 }} />
      <section className="start-sec-title" data-testid="start-sec-title">
        <div className="start-head">
          <img className="start-logo" src="./icon.svg" alt="" />
          <div className="start-head-text">
            <h1 className="start-name">MyZipMaster <span className="start-version">v{buildInfo.version}</span></h1>
            <p className="start-desc">{t('app.desc')}</p>
          </div>
        </div>
        <button className="btn start-guide-btn" data-testid="start-arrange" title={t('start.arrangeHint')} onClick={() => arrange(null)}><IconSelectAll size={18} />{t('start.arrange')}</button>
        <button className="btn start-guide-btn" data-testid="start-guide" title={t('start.guideHint')} onClick={onGuide}><IconHelp size={18} />{t('start.guide')}</button>
      </section>

      <div className={`start-board${gliding ? ' gliding' : ''}`} ref={board} data-testid="start-board">
        {card('main', t('start.secActions'), (
          <>
            <div className="start-actions">
              {isDesktop ? (
                <>
                  <Action id="start-new" icon={IconPack} title={t('start.new')} hint={t('start.newHint')} onClick={onNew} />
                  <Action id="start-open" icon={IconArchive} title={t('start.open')} hint={t('start.openHint')} onClick={onOpen} />
                  <Action id="start-browse" icon={IconFolderOpen} title={t('start.browse')} hint={t('start.browseHint')} onClick={onBrowse} />
                </>
              ) : (
                <>
                  <Action id="start-files" icon={IconFilePlus} title={t('start.files')} hint={t('start.filesHint')} onClick={onPickFiles} />
                  <Action id="start-folder" icon={IconFolderPlus} title={t('start.folder')} hint={t('start.folderHint')} onClick={onPickFolder} />
                </>
              )}
            </div>
            {isDesktop && recent.length > 0 && (
              <div className="start-recent" data-testid="start-recent">
                <div className="start-section">{t('toolbar.recent')}</div>
                {recent.slice(0, 6).map((p) => (
                  <button key={p} className="start-recent-row" data-start-recent={p} title={p} onClick={() => onRecent(p)}>
                    <span className="file-icon">{fileIconFor(p) ? <img src={`./file-icons/${fileIconFor(p)}.svg`} alt="" /> : <IconArchive size={16} />}</span>
                    <span className="start-recent-name">{baseName(p)}</span>
                    <span className="start-recent-dir">{dirName(p)}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="start-section">{t('start.secFormats')}</div>
            <div className="start-formats">
              {FILE_FACES.map((name) => <img key={name} className="start-format" src={`./file-icons/${name}.svg`} alt={name} title={name.toUpperCase()} />)}
            </div>
            {!isDesktop && <p className="hint">{t('welcome.bodyWeb')}<br />{t('welcome.webLimit')}</p>}
          </>
        ))}
        {card('background', t('start.background'), (
          <>
            <BackgroundCards value={background.kind} onChange={(kind) => onBackground({ startBg: kind })} />
            <div className="start-bg-controls" data-testid="start-bg-controls">
              <SliderStepper id="start-transparency" label={t('start.transparency')} value={background.transparency} unit="%" step={5} min={0} max={95} onChange={(v) => onBackground({ startBgTransparency: v })} />
              <SliderStepper id="start-speed" label={t('start.speed')} value={background.speed} unit="%" step={10} min={0} max={300} onChange={(v) => onBackground({ startBgSpeed: v })} />
            </div>
          </>
        ))}
      </div>

      <footer className="start-footer" data-testid="start-footer">
        {isDesktop ? (
          <label className="check start-option">
            <input type="checkbox" data-testid="start-option" checked={showAtStart} onChange={(e) => onShowAtStart(e.target.checked)} />
            {t('start.showAtStart')}
          </label>
        ) : <span />}
        <span className="start-author" data-testid="start-author">{t('start.author')} : SHKWON(knix008@naver.com)</span>
      </footer>
    </div>
  );
}
