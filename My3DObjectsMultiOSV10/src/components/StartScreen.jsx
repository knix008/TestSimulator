import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconImage, IconCube, IconGuide, IconRecent, IconClose, IconWand, IconLayers, IconChip, IconExport,
  IconSparkles, IconGrid, IconHelp, IconTrash,
} from './Icons.jsx';
import EngineCard from './EngineCard.jsx';
import StartBackground from './StartBackground.jsx';
import BackgroundPicker from './BackgroundPicker.jsx';
import { nextStartBg } from '../lib/startbg.js';
import {
  START_CARDS, normalizeStartLayout, measureLayout, clampLayout, moveCard, resizeCard, boardHeight,
  snapLayout, placeCard, columnStep, GRID_ROW,
} from '../lib/startlayout.js';
import { IMPORT_FORMATS, EXPORT_FORMATS, IMAGE_EXTENSIONS } from '../lib/formats.js';
import buildInfo from '../build-info.json';
import { SAMPLE_GROUPS, sampleLabel } from '../lib/samples.js';
import { groupFamilies, shownVersion } from '../lib/modelFamilies.js';

// The start screen (V20's layout): a title card with the main actions, then
// cards for getting started, recent files, the engine and the models, the
// supported formats and the moving background behind it all (21 kinds,
// opacity, speed, automatic change — the same picker as in Settings). It
// covers the whole work area, side and log panels included, until a file is
// opened or the Home button is pressed again.
//
// Every card can be moved (the ⠿ handle) and resized (the bottom-right
// corner); "Auto arrange" puts them back in the automatic grid.
export default function StartScreen({
  settings, onSettings, health, connection, models, onOpenImage, onOpenModel, onOpenRecent, onRemoveRecent, onClearRecent, samples, onOpenSample,
  onGuide, onTutorial, onRetry, onToken, onShowLog, onPickModel, onClose,
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language?.startsWith('en') ? 'en' : 'ko';
  const recent = settings.recentFiles.slice(0, 8);
  const patch = (p) => onSettings((s) => ({ ...s, ...p }));

  // Change the background by itself every few seconds, if asked to.
  useEffect(() => {
    const secs = Number(settings.startBgInterval) || 0;
    if (!secs) return undefined;
    const id = setInterval(() => {
      onSettings((s) => ({ ...s, startBg: nextStartBg(s.startBg, { random: !!s.startBgRandom }) }));
    }, secs * 1000);
    return () => clearInterval(id);
  }, [settings.startBgInterval, onSettings]);

  // ── Cards the user can move and resize ──
  // The automatic grid until a card is first moved or resized; from then on
  // every card has its own box, saved in settings.startLayout, until
  // "Auto arrange" clears it.
  // Cards sit on a grid (startlayout.js). While a grip is held the card
  // follows the pointer, a silhouette shows the grid spot it will take, and
  // the cards in the way slide down out of it; let go, it drops into place.
  const boardRef = useRef(null);
  const [boardWidth, setBoardWidth] = useState(0);
  // While a grip is held: { layout (where every card lands), id, box (the held card under the pointer) }.
  const [live, setLive] = useState(null);
  const [front, setFront] = useState(null);    // the card last touched sits on top
  const saved = useMemo(() => normalizeStartLayout(settings.startLayout), [settings.startLayout]);
  const layout = clampLayout(live?.layout || saved, boardWidth || Infinity);

  useEffect(() => {
    const board = boardRef.current;
    if (!board || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setBoardWidth(board.clientWidth));
    ro.observe(board);
    setBoardWidth(board.clientWidth);
    return () => ro.disconnect();
  }, []);

  const startGrip = (e, id, kind) => {
    if (e.button !== 0) return;
    const board = boardRef.current;
    if (!board) return;
    e.preventDefault();
    e.stopPropagation();
    let base = live?.layout || saved;
    if (!base) {
      const rects = {};
      for (const cid of START_CARDS) {
        const el = board.querySelector(`[data-card="${cid}"]`);
        if (el) rects[cid] = el.getBoundingClientRect();
      }
      base = measureLayout(board.getBoundingClientRect(), rects);
      if (!base) return;
    }
    const width = board.clientWidth;
    base = snapLayout(clampLayout(base, width), width);
    const x0 = e.clientX;
    const y0 = e.clientY;
    const grip = e.currentTarget;
    let last = base;
    setFront(id);
    setLive({ layout: base, id, box: base[id] });
    try { grip.setPointerCapture?.(e.pointerId); } catch { /* a synthetic event has no pointer to capture */ }
    const onMove = (ev) => {
      const dx = ev.clientX - x0;
      const dy = ev.clientY - y0;
      const free = kind === 'move' ? moveCard(base, id, dx, dy, width) : resizeCard(base, id, dx, dy, width);
      last = placeCard(base, id, free[id], width);
      setLive({ layout: last, id, box: free[id] });
    };
    const onUp = () => {
      grip.removeEventListener('pointermove', onMove);
      grip.removeEventListener('pointerup', onUp);
      grip.removeEventListener('pointercancel', onUp);
      setLive(null);
      patch({ startLayout: last });
    };
    grip.addEventListener('pointermove', onMove);
    grip.addEventListener('pointerup', onUp);
    grip.addEventListener('pointercancel', onUp);
  };

  const held = live ? live.id : null;
  const boxOf = (id) => (held === id ? live.box : layout[id]);
  const cardStyle = (id) => (layout ? {
    position: 'absolute',
    left: boxOf(id).x,
    top: boxOf(id).y,
    width: boxOf(id).w,
    height: boxOf(id).h,
    zIndex: front === id ? 3 : 1,
  } : undefined);
  const boardStyle = layout ? {
    height: Math.max(boardHeight(layout), live ? live.box.y + live.box.h + 16 : 0),
    // The grid drawn under the cards while one is moved.
    '--grid-col': `${columnStep(boardWidth || 1)}px`,
    '--grid-row': `${GRID_ROW}px`,
  } : undefined;

  // The move handle sits at the start of a card's title line (the title card,
  // which has none, carries it in its top-left corner); the resize grip is the
  // bottom-right corner of every card.
  const moveHandle = (id) => (
    <button
      type="button"
      className="card-handle"
      title={t('start.moveCard')}
      aria-label={t('start.moveCard')}
      onPointerDown={(e) => startGrip(e, id, 'move')}
      data-card-move={id}
    >
      ⠿
    </button>
  );
  const resizeGrip = (id) => (
    <span
      className="card-resize"
      title={t('start.resizeCard')}
      aria-hidden="true"
      onPointerDown={(e) => startGrip(e, id, 'resize')}
      data-card-resize={id}
    />
  );
  const card = (id, className, children) => (
    <section className={`start-card ${className || ''}${held === id ? ' held' : ''}`} data-card={id} style={cardStyle(id)}>
      {resizeGrip(id)}
      {children}
    </section>
  );

  return (
    <div className="start" data-start>
      <StartBackground scene={settings.startBg} opacity={settings.startBgOpacity} speed={settings.startBgSpeed} />
      <div className="start-scroll">
        <div className="start-inner">
          <div className="start-tools">
            <button
              type="button"
              className="btn small"
              onClick={() => patch({ startLayout: null })}
              title={t('start.autoArrangeTip')}
              data-start-arrange
            >
              <IconGrid size={14} /> {t('start.autoArrange')}
            </button>
          </div>

          <div className={`start-board${layout ? ' free' : ''}${live ? ' arranging' : ''}`} ref={boardRef} style={boardStyle}>
            {live ? (
              <div
                className="card-ghost"
                data-card-ghost
                style={{ left: layout[held].x, top: layout[held].y, width: layout[held].w, height: layout[held].h }}
              />
            ) : null}
            {card('hero', 'start-hero', (
              <>
                <span className="card-handle-float">{moveHandle('hero')}</span>
                <img className="start-icon" src="./icon.svg" alt="" />
                <div className="start-hero-text">
                  <h1>My3DObjects <small>v{buildInfo.version}</small></h1>
                  <p>{t('start.tagline')}</p>
                </div>
                <div className="start-hero-actions">
                  <button className="btn primary" onClick={onOpenImage}><IconImage size={16} /> {t('toolbar.openImage')}</button>
                  <button className="btn" onClick={onOpenModel}><IconCube size={16} /> {t('toolbar.openModel')}</button>
                  {onTutorial ? <button className="btn" onClick={onTutorial} data-start-tutorial><IconHelp size={16} /> {t('tutorial.title')}</button> : null}
                  <button className="btn" onClick={onGuide}><IconGuide size={16} /> {t('start.guide')}</button>
                </div>
              </>
            ))}

            <div className="start-grid start-rows">
              {card('how', '', (
                <>
                  <h2>{moveHandle('how')}<IconSparkles size={16} /> {t('start.howTitle')}</h2>
                  <ol className="start-steps">
                    <li><strong>{t('start.step1')}</strong><span>{t('start.step1Text')}</span></li>
                    <li><strong>{t('start.step2')}</strong><span>{t('start.step2Text')}</span></li>
                    <li><strong>{t('start.step3')}</strong><span>{t('start.step3Text')}</span></li>
                    <li><strong>{t('start.step4')}</strong><span>{t('start.step4Text')}</span></li>
                  </ol>
                  <label className="check start-check">
                    <input type="checkbox" checked={settings.showStartPage} onChange={(e) => patch({ showStartPage: e.target.checked })} />
                    <span>{t('start.showAtStart')}</span>
                  </label>
                </>
              ))}

              {card('recent', '', (
                <>
                  <h2>
                    {moveHandle('recent')}<IconRecent size={16} /> {t('recent.title')}
                    {recent.length ? (
                      <button className="clear-all" onClick={onClearRecent} title={t('recent.clear')}>
                        <IconTrash size={13} /> {t('recent.clear')}
                      </button>
                    ) : null}
                  </h2>
                  {recent.length === 0 ? <p className="start-empty">{t('recent.empty')}</p> : (
                    <div className="start-list start-hlist">
                      {recent.map((f) => (
                        <div className="start-row" key={f.path || f.name}>
                          <button className="start-link" onClick={() => onOpenRecent(f)} title={f.path || f.name}>
                            {f.kind === 'model' ? <IconCube size={15} /> : <IconImage size={15} />}
                            <span className="name">{f.name}</span>
                            <span className="path">{f.dir || ''}</span>
                          </button>
                          <button className="icon-btn" onClick={() => onRemoveRecent(f.path || f.name)} title={t('recent.remove')}><IconClose size={13} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ))}

              {card('samples', '', (
                <>
                  <h2>{moveHandle('samples')}<IconSparkles size={16} /> {t('samples.title')}</h2>
                  {samples ? (
                    <div className="start-samples">
                      {SAMPLE_GROUPS.filter((g) => samples[g].length).map((g) => (
                        <div className="start-sample-group" key={g}>
                          <p className="start-formats-title">
                            {g === 'images' ? <IconImage size={13} /> : g === 'results' ? <IconWand size={13} /> : <IconCube size={13} />} {t(`samples.${g}`)}
                          </p>
                          <div className="start-list start-hlist">
                            {samples[g].map((e) => (
                              <button key={e.file} className="start-link" onClick={() => onOpenSample(e)} title={e.file} data-sample={e.file}>
                                {g === 'images' ? <IconImage size={15} /> : g === 'results' ? <IconWand size={15} /> : <IconCube size={15} />}
                                <span className="name">{sampleLabel(e, lang)}</span>
                                <span className="path">{e.file.split('/').pop()}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="start-empty">{t('model.noEngine')}</p>}
                </>
              ))}

              {card('engine', '', (
                <>
                  <div className="start-cols start-cols-engine">
                  <div>
                  <h2>{moveHandle('engine')}<IconChip size={16} /> {t('start.engine')}</h2>
                  <EngineCard health={health} connection={connection} onRetry={onRetry} onToken={onToken} onShowLog={onShowLog} onUseModel={onPickModel} compact />
                  </div>
                  <div>
                  <h2><IconLayers size={16} /> {t('start.models')}</h2>
                  <div className="start-list start-hlist">
                    {groupFamilies(models).map((fam) => {
                      const m = shownVersion(fam, settings.model, settings.modelVersions);
                      return (
                        <button
                          key={fam.family}
                          className={`start-link model-link${fam.versions.some((x) => x.id === settings.model) ? ' on' : ''}`}
                          onClick={() => onPickModel(m.id)}
                          title={m.summary?.[lang] || m.name}
                        >
                          <IconWand size={15} />
                          <span className="name">{m.name}</span>
                          <span className="path">{t(`model.status.${m.status}`, m.status)} · {m.license}</span>
                        </button>
                      );
                    })}
                    {models.length === 0 ? <p className="start-empty">{t('model.noEngine')}</p> : null}
                  </div>
                  </div>
                  </div>
                </>
              ))}

              {card('formats', '', (
                <>
                  <h2>{moveHandle('formats')}<IconCube size={16} /> {t('start.formats')}</h2>
                  <div className="start-cols">
                    <div>
                      <p className="start-formats-title"><IconCube size={13} /> {t('start.canOpen')}</p>
                      <p className="start-formats">{IMPORT_FORMATS.map((f) => f.ext.map((e) => `.${e}`).join(' ')).join('  ')}</p>
                    </div>
                    <div>
                      <p className="start-formats-title"><IconExport size={13} /> {t('start.canSave')}</p>
                      <p className="start-formats">{[...new Set(EXPORT_FORMATS.map((f) => `.${f.ext}`))].join('  ')}</p>
                    </div>
                    <div>
                      <p className="start-formats-title"><IconImage size={13} /> {t('start.images')}</p>
                      <p className="start-formats">{IMAGE_EXTENSIONS.map((e) => `.${e}`).join(' ')}</p>
                    </div>
                  </div>
                </>
              ))}
            </div>

            {card('bg', 'start-bgcard', (
              <>
                <h2>{moveHandle('bg')}<IconSparkles size={16} /> {t('start.background')}</h2>
                <BackgroundPicker settings={settings} onChange={patch} compact />
              </>
            ))}
          </div>

          <div className="start-foot">
            <span>{t('start.poweredBy')}</span>
            <button className="linkish" onClick={onClose}>{t('start.close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
