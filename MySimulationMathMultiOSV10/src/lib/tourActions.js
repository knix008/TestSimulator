// window.__msm.action(id): what the guided tour (components/Tutorial.jsx)
// asks the main window to do. App.jsx passes its functions every render
// (useTourActions(ctx)); the latest ones are used.
//
//   showStart / hideStart       the start page on / off
//   tab:<ribbon>                pick a ribbon tab
//   pane:<folder|workspace|history|cmd>   make a pane visible
//   newScript:<code key>        a new script with TOUR_CODE[key] (remembered as the tour's)
//   newModel                    a new model (the tour's)
//   ensureScript:<key> / ensureModel / ensurePlot:<key>   the tour's script / model / a figure, made when missing
//   cmd:<code key>              run TOUR_CODE[key] in the Command Window
//   runDoc                      run the active editor's text in the Command Window
//   figures                     show the Figures tab
//   var:<name> / open:<path>    open a variable in the Variable Editor / a file
//   closeDocs                   close the documents the tour itself opened (without asking)
import { useEffect, useRef } from 'react';
import { TOUR_CODE, tourCode } from './tutorialSteps';
import { getLanguage } from './i18n';
import { getSettings, patchSettings } from './settings';

export function useTourActions(ctx) {
  const ref = useRef(ctx);
  ref.current = ctx;
  const mine = useRef(new Set());
  useEffect(() => {
    const api = window.__msm || (window.__msm = {});
    const action = async (raw) => {
      const c = ref.current;
      const id = String(raw);
      const i = id.indexOf(':');
      const name = i < 0 ? id : id.slice(0, i);
      const arg = i < 0 ? '' : id.slice(i + 1);
      const before = new Set(c.docs().map((d) => d.id));
      const remember = () => setTimeout(() => { for (const d of c.docs()) if (!before.has(d.id) && d.id !== 'figures') mine.current.add(d.id); }, 0);
      switch (name) {
        case 'showStart': c.setStartOn(true); break;
        case 'hideStart': c.setStartOn(false); break;
        case 'tab': c.setTab(arg); break;
        case 'pane': {
          // the panes of the current screen (panels.js): show it there, else on the home screen
          if (c.showPane) { c.showPane(arg); break; }
          const lay = getSettings().layout || {};
          const cur = lay[arg] || {};
          if (cur.on === false || cur.collapsed) patchSettings({ layout: { [arg]: { ...cur, on: true, collapsed: false } } });
          if ((arg === 'workspace' || arg === 'history') && lay.rightCollapsed) patchSettings({ layout: { rightCollapsed: false } });
          break;
        }
        case 'newScript': c.newScript(tourCode(arg, getLanguage()) || ''); remember(); break;
        case 'newModel': c.newModel(); remember(); break;
        // A step reached directly (chapter list, ◀): open what it talks about when it is missing.
        case 'ensureScript': {
          const d = c.docs().find((x) => mine.current.has(x.id) && x.kind === 'file');
          if (d) c.activate(d.id); else { c.newScript(tourCode(arg, getLanguage()) || ''); remember(); }
          break;
        }
        case 'ensureModel': {
          const d = c.docs().find((x) => mine.current.has(x.id) && x.kind === 'model');
          if (d) c.activate(d.id); else { c.newModel(); remember(); }
          break;
        }
        case 'ensurePlot': {
          const ctl = window.__msmFigures;
          if (!ctl || ctl.active == null) await c.runCode(tourCode(arg, getLanguage()) || TOUR_CODE.plot, { echo: false });
          break;
        }
        case 'cmd': await c.runCode(tourCode(arg, getLanguage()) || arg); break;
        case 'runDoc': {
          const ed = c.activeEditor();
          const text = ed && ed.editor && ed.editor.getText ? ed.editor.getText() : '';
          if (text.trim()) await c.runCode(text, { echo: false });
          break;
        }
        case 'figures': c.showFigures({ force: true }); break;
        case 'var': if (c.openVariable) c.openVariable(arg); break;
        case 'open': if (c.openFile) c.openFile(arg); break;
        case 'closeDocs': {
          const ids = [...mine.current].filter((x) => c.docs().some((d) => d.id === x));
          mine.current.clear();
          if (ids.length) c.dropDocs(ids);
          break;
        }
        default: break;
      }
    };
    api.action = action;
    return () => { if (api.action === action) delete api.action; };
  }, []);
}
