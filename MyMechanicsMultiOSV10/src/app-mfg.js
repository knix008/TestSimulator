// Manufacturing add-ins of the main window — CAM (app-cam.js), injection moulding flow (app-plastics.js) and
// inspection (app-inspection.js) — chained onto app-more.js's hook object `more` (app.js calls those hooks):
// a mode of ours answers first, everything else goes on to the hooks that were there. Each add-in has its own
// CommandManager tab (TABS), its PropertyManager page and its test hooks (`api`, window.__mymechanics.mfg).
import './styles-mfg.css';
import { createCamTools } from './app-cam.js';
import { createPlasticsTools } from './app-plastics.js';
import { createInspectionTools } from './app-inspection.js';

export function attachMfgTools(more, ctx) {
  const cam = createCamTools(ctx);
  const plastics = createPlasticsTools(ctx);
  const inspection = createInspectionTools(ctx);
  const all = [cam, plastics, inspection];
  const o = { ...more };
  const mine = (e = ctx.state.editing) => all.find((x) => x.owns(e)) ?? null;
  more.owns = (e) => Boolean(mine(e)) || o.owns(e);
  more.pm = (e) => (mine(e) ? mine(e).pm(e) : o.pm(e));
  more.pick = (hit, ev) => (mine() ? mine().pick(hit, ev) : o.pick(hit, ev));
  more.field = (k, raw, v) => (mine() ? mine().field(k, raw, v) : o.field(k, raw, v));
  more.set = (k, v) => (mine() ? mine().set(k, v) : o.set(k, v));
  more.select = (k, v) => (mine() ? mine().select(k, v) : o.select?.(k, v));
  more.toggle = (k, c) => (mine() ? mine().toggle(k, c) : o.toggle(k, c));
  more.accept = () => (mine() ? mine().accept() : o.accept());
  more.subject = (e) => (mine(e) ? mine(e).subject(e) : o.subject(e));
  more.handles = (name) => all.some((x) => x.handles(name)) || o.handles(name);
  more.command = (name, arg) => {
    if (name === 'clear') return mine() ? mine().command(name, arg) : o.command(name, arg);
    const tool = all.find((x) => x.handles(name));
    return tool ? tool.command(name, arg) : o.command(name, arg);
  };
  more.colours = (p, entry) => plastics.colours(p, entry) ?? o.colours(p, entry);
  more.decorate = (kind) => { o.decorate?.(kind); cam.decorate(kind); plastics.decorate(kind); };
  more.svg = (d, opts = {}) => inspection.svg(d, opts, o.svg);
  const commands = { ...cam.commands, ...plastics.commands, ...inspection.commands };
  const TABS = { cam: cam.TAB, plastics: plastics.TAB, inspection: inspection.TAB };
  /** Adds the add-ins to the Tools menu. */
  function extendMenus(SUBMENUS, MENUS) {
    SUBMENUS.mfgCam = { icon: 'camManager', items: ['camManager', 'camRecognize', 'camPlan', '-', 'camGenerate', 'camSimulate', 'camPost', 'camSetupSheet'] };
    SUBMENUS.mfgPlastics = { icon: 'plasticsStudy', items: ['plasticsStudy', 'plGate', 'plRun', 'plReport'] };
    SUBMENUS.mfgInspection = { icon: 'inspTable', items: ['inspBalloon', 'inspTable', 'inspImport', 'inspCsv', 'inspExcel', 'inspReport'] };
    MENUS.tools?.push('-', { sub: 'mfgCam' }, { sub: 'mfgPlastics' }, { sub: 'mfgInspection' });
  }
  return { commands, TABS, extendMenus, api: { cam: cam.api, plastics: plastics.api, inspection: inspection.api } };
}
