// The figure area (src/graphics) and the model editor (src/sim) are built by
// other parts of the project. They are found with import.meta.glob so the app
// still builds and runs while either is missing; the pane then says so.
import React, { useEffect, useState } from 'react';
import { t, useLanguage } from '../lib/i18n';
import { Icon } from '../components/Chrome';
import { setModelExts } from '../lib/files';

const graphicsMods = import.meta.glob('../graphics/index.js');
const simMods = import.meta.glob('../sim/index.js');

let graphicsPromise = null;
let simPromise = null;
export function loadGraphics() {
  const load = graphicsMods['../graphics/index.js'];
  if (!load) return Promise.resolve(null);
  if (!graphicsPromise) graphicsPromise = load().catch((e) => ({ __error: e }));
  return graphicsPromise;
}
export function loadSim() {
  const load = simMods['../sim/index.js'];
  if (!load) return Promise.resolve(null);
  if (!simPromise) {
    simPromise = load().then((m) => { if (m && m.MODEL_EXT) setModelExts(m.MODEL_EXT); return m; }).catch((e) => ({ __error: e }));
  }
  return simPromise;
}
export const hasGraphics = () => !!graphicsMods['../graphics/index.js'];
export const hasSim = () => !!simMods['../sim/index.js'];

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <Missing icon="alert" text={`${this.props.what}: ${this.state.error.message}`} />;
    return this.props.children;
  }
}

function Missing({ icon, text, hint }) {
  return (
    <div className="empty empty-big pane-missing">
      <span className="empty-icon"><Icon name={icon} size={26} /></span>
      <strong>{text}</strong>
      {hint && <span className="small">{hint}</span>}
    </div>
  );
}

function useModule(loader, pick) {
  const [state, setState] = useState({ Comp: null, missing: false, error: '' });
  useEffect(() => {
    let alive = true;
    loader().then((m) => {
      if (!alive) return;
      if (!m) setState({ Comp: null, missing: true, error: '' });
      else if (m.__error) setState({ Comp: null, missing: false, error: m.__error.message || String(m.__error) });
      else if (!m[pick]) setState({ Comp: null, missing: true, error: '' });
      else setState({ Comp: m[pick], missing: false, error: '' });
    });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return state;
}

export function FigureAreaGuard(props) {
  useLanguage();
  const { Comp, missing, error } = useModule(loadGraphics, 'FigureArea');
  if (error) return <Missing icon="alert" text={t('fig_failed', { error })} />;
  if (missing) return <Missing icon="figure" text={t('fig_missing')} hint={t('fig_missing_hint')} />;
  if (!Comp) return <Missing icon="hourglass" text={t('loading')} />;
  return <Boundary what={t('fig_title')}><Comp {...props} /></Boundary>;
}

/** A side pane of the simulation screen (src/sim/SidePanes.jsx), loaded with the editor. which: its export name. */
export function SimPaneGuard({ which, ...props }) {
  useLanguage();
  const { Comp, missing, error } = useModule(loadSim, which);
  if (error) return <Missing icon="alert" text={t('mdl_failed', { error })} />;
  if (missing) return <Missing icon="model" text={t('mdl_missing')} />;
  if (!Comp) return <Missing icon="hourglass" text={t('loading')} />;
  return <Boundary what={t('mdl_title')}><Comp {...props} /></Boundary>;
}

export function ModelEditorGuard(props) {
  useLanguage();
  const { Comp, missing, error } = useModule(loadSim, 'ModelEditor');
  if (error) return <Missing icon="alert" text={t('mdl_failed', { error })} />;
  if (missing) return <Missing icon="model" text={t('mdl_missing')} hint={props.path || t('mdl_missing_hint')} />;
  if (!Comp) return <Missing icon="hourglass" text={t('loading')} />;
  return <Boundary what={t('mdl_title')}><Comp {...props} /></Boundary>;
}
