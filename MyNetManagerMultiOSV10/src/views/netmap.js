// The network map panel: the topology found in the capture (domain/analysis/topology.js) drawn as
// an SVG graph. Click a node or a link to show only its packets (the map sets the display filter);
// click the empty background or "Show all" to clear it. Wheel zooms, dragging the background pans,
// dragging a node moves it (the place is kept until the layout changes).
import { escapeHtml } from '../ui/dom.js';
import { icon } from '../icons.js';
import { layoutTopology } from '../domain/analysis/topology.js';

const KIND_ICON = { router: 'netRouter', host: 'netHost', server: 'netServer', external: 'netCloud', internet: 'netCloud', multicast: 'netMulticast', printer: 'netPrinter', phone: 'netPhone', iot: 'netIot' };
const fmtBytes = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n >= 1e3 ? `${(n / 1e3).toFixed(1)} kB` : `${n} B`);

export class NetMap {
  /** app: { t, settings(), updateSettings(patch), onSelect(item | null), onRefresh(), onExport(kind) } */
  constructor(host, app) {
    this.host = host;
    this.app = app;
    this.topology = null;
    this.positions = new Map();
    this.view = { x: 0, y: 0, k: 1 };
    this.selected = null; // { type: 'node' | 'link', id }
    this.match = null; // { nodes: Set, links: Set } while a display filter is on (matchTopology)
    this.size = { width: 900, height: 640 };
    host.classList.add('net-map');
    host.innerHTML = `<header class="nm-head panel-header">${icon('paneMap')}<span class="nm-title"></span>
      <span class="nm-tools"></span><button class="icon-button pane-fold nm-fold" data-fold="map">${icon('panelRight')}</button></header>
      <div class="nm-canvas"><svg class="nm-svg" role="img"><g class="nm-world"><g class="nm-subnets"></g><g class="nm-links"></g><g class="nm-nodes"></g></g></svg>
        <div class="nm-empty" hidden></div><div class="nm-tip" hidden></div><div class="nm-legend"></div></div>
      <footer class="nm-foot"></footer>`;
    this.svg = host.querySelector('.nm-svg');
    this.world = host.querySelector('.nm-world');
    this.tip = host.querySelector('.nm-tip');
    this.canvas = host.querySelector('.nm-canvas');
    this.bind();
    this.resizeObserver = new ResizeObserver(() => this.measure());
    this.resizeObserver.observe(this.canvas);
  }

  destroy() { this.resizeObserver.disconnect(); this.host.innerHTML = ''; this.host.classList.remove('net-map'); }

  /**
   * The canvas changed size (splitter, window, panel shown again): lay the map out for the new size
   * and fit it in. Compared with the size of the last layout, not the last event — a slow splitter
   * drag moves a few pixels per event and must still redraw. Nodes the user dragged keep their places
   * (only the fit follows the new size).
   */
  measure() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    this.size = { width: rect.width, height: rect.height };
    if (!this.topology) return;
    const last = this.laidOutFor;
    if (last && Math.abs(last.width - rect.width) < 2 && Math.abs(last.height - rect.height) < 2) return;
    cancelAnimationFrame(this.measureFrame);
    this.measureFrame = requestAnimationFrame(() => {
      if (!this.userMoved) this.layout();
      else this.laidOutFor = { ...this.size };
      this.fit();
    });
  }

  /** New topology (another capture, more packets, other options). keepPlaces: nodes stay where they were. */
  setTopology(topology, { keepPlaces = false } = {}) {
    const old = this.positions;
    const oldView = { ...this.view };
    this.topology = topology;
    if (!keepPlaces) this.userMoved = false;
    this.layout();
    if (keepPlaces) for (const [id, p] of old) if (this.positions.has(id)) this.positions.set(id, p);
    if (this.selected && !this.findSelected()) this.selected = null;
    this.render();
    // A new map is fitted into the panel (it may be narrower than the layout); an update keeps the zoom.
    if (keepPlaces && old.size) { this.view = oldView; this.applyView(); } else this.fit();
  }

  layout() {
    if (!this.topology) return;
    const { width, height } = this.size;
    // A narrow panel still gets room to spread the nodes; fit() then scales the map down into it.
    this.positions = layoutTopology(this.topology, { width: Math.max(500, width), height: Math.max(400, height), mode: this.app.settings().netmapLayout });
    this.laidOutFor = { ...this.size };
    this.view = { x: 0, y: 0, k: 1 };
    this.render();
  }

  findSelected() {
    if (!this.selected || !this.topology) return null;
    const list = this.selected.type === 'node' ? this.topology.nodes : this.topology.links;
    return list.find((item) => item.id === this.selected.id) ?? null;
  }

  label(node) {
    const mode = this.app.settings().netmapLabels;
    if (node.kind === 'internet') return `${this.app.t('netmap.internet')} (+${node.count})`;
    if (mode === 'mac') return node.mac ?? node.macs?.[0] ?? node.label;
    if (mode === 'name' && node.name) return node.name;
    return node.label;
  }

  radius(node) { return Math.max(14, Math.min(30, 10 + Math.log10(Math.max(10, node.bytes)) * 2.4)); }

  render() {
    const t = this.app.t;
    const s = this.app.settings();
    const topo = this.topology;
    this.host.querySelector('.nm-title').textContent = t('netmap.title');
    this.host.querySelector('.nm-tools').innerHTML = `
      <select data-nm="layout" data-icon="netLayout" title="${escapeHtml(t('netmap.layout'))}" aria-label="${escapeHtml(t('netmap.layout'))}">${['subnet', 'force', 'radial'].map((m) => `<option value="${m}" ${s.netmapLayout === m ? 'selected' : ''}>${escapeHtml(t(`netmap.layout.${m}`))}</option>`).join('')}</select>
      <select data-nm="labels" data-icon="tag" title="${escapeHtml(t('netmap.labels'))}" aria-label="${escapeHtml(t('netmap.labels'))}">${['name', 'ip', 'mac'].map((m) => `<option value="${m}" ${s.netmapLabels === m ? 'selected' : ''}>${escapeHtml(t(`netmap.labels.${m}`))}</option>`).join('')}</select>
      <button class="icon-button ${s.netmapShowExternal ? 'active' : ''}" data-nm="external" aria-pressed="${s.netmapShowExternal}" title="${escapeHtml(t('netmap.showExternal'))}">${icon('netCloud')}</button>
      <button class="icon-button ${s.netmapShowMulticast ? 'active' : ''}" data-nm="multicast" aria-pressed="${s.netmapShowMulticast}" title="${escapeHtml(t('netmap.showMulticast'))}">${icon('netMulticast')}</button>
      <button class="icon-button" data-nm="fit" title="${escapeHtml(t('netmap.fit'))}">${icon('fitPage')}</button>
      <button class="icon-button" data-nm="refresh" title="${escapeHtml(t('netmap.refresh'))}">${icon('refresh')}</button>
      <button class="icon-button" data-nm="export" title="${escapeHtml(t('netmap.export'))}">${icon('netExportImage')}</button>`;
    const empty = this.host.querySelector('.nm-empty');
    empty.hidden = Boolean(topo?.nodes.length);
    empty.innerHTML = `${icon('paneMap')}<span>${escapeHtml(topo ? t('netmap.noHosts') : t('netmap.noCapture'))}</span>`;
    this.host.querySelector('.nm-legend').innerHTML = ['router', 'host', 'server', 'external'].map((k) => `<span>${icon(KIND_ICON[k])}${escapeHtml(t(`netmap.kind.${k}`))}</span>`).join('');
    if (!topo) { this.world.querySelector('.nm-nodes').innerHTML = ''; this.world.querySelector('.nm-links').innerHTML = ''; this.world.querySelector('.nm-subnets').innerHTML = ''; this.renderFoot(); return; }
    const sel = this.findSelected();
    const focusIds = new Set();
    if (sel && this.selected.type === 'node') { focusIds.add(sel.id); for (const l of topo.links) if (l.source === sel.id || l.target === sel.id) { focusIds.add(l.source); focusIds.add(l.target); } }
    if (sel && this.selected.type === 'link') { focusIds.add(sel.source); focusIds.add(sel.target); }
    // A display filter is on: only what its packets touch stays strong (the map's own pick included).
    const match = this.match;
    const nodeDim = (n) => (match ? !match.nodes.has(n.id) : Boolean(sel) && !focusIds.has(n.id));
    const linkDim = (l, on) => (match ? !match.links.has(l.id) : Boolean(sel) && !on && !(this.selected.type === 'node' && (l.source === sel.id || l.target === sel.id)));
    const maxBytes = Math.max(1, ...topo.links.map((l) => l.bytes));
    // Subnet hulls: a soft rounded box around each subnet's nodes.
    this.world.querySelector('.nm-subnets').innerHTML = topo.subnets.filter((sub) => sub.id !== 'external' && sub.id !== 'multicast').map((sub) => {
      const points = sub.nodes.map((id) => this.positions.get(id)).filter(Boolean);
      if (!points.length) return '';
      const pad = 46;
      const x0 = Math.min(...points.map((p) => p.x)) - pad;
      const y0 = Math.min(...points.map((p) => p.y)) - pad;
      const x1 = Math.max(...points.map((p) => p.x)) + pad;
      const y1 = Math.max(...points.map((p) => p.y)) + pad;
      const subDim = match && !sub.nodes.some((id) => match.nodes.has(id));
      return `<g class="nm-subnet ${subDim ? 'dim' : ''}" data-subnet="${escapeHtml(sub.id)}"><rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="22"/><text x="${x0 + 12}" y="${y0 + 18}">${escapeHtml(sub.id)}</text></g>`;
    }).join('');
    this.world.querySelector('.nm-links').innerHTML = topo.links.map((l) => {
      const a = this.positions.get(l.source);
      const b = this.positions.get(l.target);
      if (!a || !b) return '';
      const width = 1.2 + 5 * Math.sqrt(l.bytes / maxBytes);
      const on = this.selected?.type === 'link' && this.selected.id === l.id;
      const dim = linkDim(l, on);
      return `<g class="nm-link ${on ? 'selected' : ''} ${dim ? 'dim' : match ? 'match' : ''}" data-link="${escapeHtml(l.id)}"><line class="nm-hit" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/><line class="nm-line" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" style="stroke-width:${width.toFixed(1)}px"/></g>`;
    }).join('');
    this.world.querySelector('.nm-nodes').innerHTML = topo.nodes.map((n) => {
      const p = this.positions.get(n.id);
      if (!p) return '';
      const r = this.radius(n);
      const on = this.selected?.type === 'node' && this.selected.id === n.id;
      const dim = nodeDim(n);
      const glyph = icon(KIND_ICON[n.kind] ?? 'netHost').replace('<svg ', `<svg x="${p.x - r * 0.62}" y="${p.y - r * 0.62}" width="${r * 1.24}" height="${r * 1.24}" `);
      const label = this.label(n);
      return `<g class="nm-node kind-${n.kind} ${on ? 'selected' : ''} ${dim ? 'dim' : match ? 'match' : ''}" data-node="${escapeHtml(n.id)}" tabindex="0" role="button" aria-label="${escapeHtml(label)}">
        <circle class="nm-halo" cx="${p.x}" cy="${p.y}" r="${r + 6}"/><circle class="nm-dot" cx="${p.x}" cy="${p.y}" r="${r}"/>${glyph}
        <text class="nm-label" x="${p.x}" y="${p.y + r + 14}">${escapeHtml(label.length > 28 ? `${label.slice(0, 27)}…` : label)}</text></g>`;
    }).join('');
    this.applyView();
    this.renderFoot();
  }

  renderFoot() {
    const t = this.app.t;
    const topo = this.topology;
    const sel = this.findSelected();
    const foot = this.host.querySelector('.nm-foot');
    if (!topo) { foot.innerHTML = ''; return; }
    const stats = t('netmap.stats', { hosts: topo.stats.hosts, routers: topo.stats.routers, external: topo.stats.external, links: topo.links.length });
    foot.innerHTML = sel
      ? `<span class="nm-sel">${icon(this.selected.type === 'node' ? KIND_ICON[sel.kind] ?? 'netHost' : 'link')}<b>${escapeHtml(this.selected.type === 'node' ? this.label(sel) : `${this.labelOf(sel.source)} ↔ ${this.labelOf(sel.target)}`)}</b><span class="muted">${escapeHtml(`${sel.packets} ${t('netmap.packets')} · ${fmtBytes(sel.bytes)}`)}</span></span><span class="grow"></span><button class="small-button" data-nm="clear">${icon('filterClear')}<span>${escapeHtml(t('netmap.showAll'))}</span></button>`
      : this.match
        ? `<span class="nm-sel">${icon('filterApply')}<span class="muted">${escapeHtml(t('netmap.filterMatch', { nodes: this.match.nodes.size, links: this.match.links.size }))}</span></span><span class="grow"></span><button class="small-button" data-nm="clear">${icon('filterClear')}<span>${escapeHtml(t('netmap.showAll'))}</span></button>`
        : `<span class="muted">${escapeHtml(stats)}</span><span class="grow"></span><span class="muted">${escapeHtml(t('netmap.hint'))}</span>`;
  }

  /** The display filter's hits on the map (null: no filter, everything drawn strong). */
  setMatch(match) { this.match = match; this.render(); }

  labelOf(id) { const n = this.topology?.nodes.find((x) => x.id === id); return n ? this.label(n) : id; }

  applyView() { this.world.setAttribute('transform', `translate(${this.view.x} ${this.view.y}) scale(${this.view.k})`); }

  fit() {
    const pts = [...this.positions.values()];
    if (!pts.length) return;
    const pad = 70;
    const x0 = Math.min(...pts.map((p) => p.x)) - pad;
    const y0 = Math.min(...pts.map((p) => p.y)) - pad;
    const x1 = Math.max(...pts.map((p) => p.x)) + pad;
    const y1 = Math.max(...pts.map((p) => p.y)) + pad;
    const k = Math.min(2.5, Math.max(0.2, Math.min(this.size.width / (x1 - x0), this.size.height / (y1 - y0))));
    this.view = { k, x: (this.size.width - (x1 - x0) * k) / 2 - x0 * k, y: (this.size.height - (y1 - y0) * k) / 2 - y0 * k };
    this.applyView();
  }

  /** Selects a node or link (null clears) and tells the app, which sets the display filter. */
  choose(selection) {
    const same = selection && this.selected && selection.type === this.selected.type && selection.id === this.selected.id;
    this.selected = same ? null : selection;
    this.render();
    this.app.onSelect(this.findSelected() ? { ...this.selected, item: this.findSelected() } : null);
  }

  /** The app cleared the filter: the map shows no selection either. */
  clearSelection() { if (this.selected) { this.selected = null; this.render(); } }

  showTip(event, html) {
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    const rect = this.canvas.getBoundingClientRect();
    const x = Math.min(rect.width - this.tip.offsetWidth - 8, event.clientX - rect.left + 14);
    const y = Math.min(rect.height - this.tip.offsetHeight - 8, event.clientY - rect.top + 14);
    this.tip.style.left = `${Math.max(4, x)}px`;
    this.tip.style.top = `${Math.max(4, y)}px`;
  }

  tipFor(target) {
    const t = this.app.t;
    const nodeEl = target.closest('[data-node]');
    if (nodeEl) {
      const n = this.topology.nodes.find((x) => x.id === nodeEl.dataset.node);
      if (!n) return '';
      const rows = [
        [t('netmap.kind'), t(`netmap.kind.${n.kind}`)],
        n.name ? [t('netmap.name'), n.name] : null,
        n.ip ? ['IP', n.ip] : n.ips?.length ? ['IP', n.ips.join(', ')] : null,
        n.mac ? ['MAC', n.mac] : n.macs?.length ? ['MAC', n.macs.join(', ')] : null,
        n.vendor ? [t('netmap.vendor'), n.vendor] : null,
        n.roles?.length ? [t('netmap.roles'), n.roles.map((r) => t(`netmap.role.${r}`, null, r)).join(', ')] : null,
        [t('netmap.traffic'), `${n.packets} ${t('netmap.packets')} · ${fmtBytes(n.bytes)}`],
        n.protocols?.length ? [t('netmap.protocols'), n.protocols.map((p) => p.name).join(', ')] : null,
        n.kind === 'internet' ? [t('netmap.members'), `${n.count}`] : null,
      ].filter(Boolean);
      return `<b>${escapeHtml(this.label(n))}</b><dl>${rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`).join('')}</dl><small>${escapeHtml(t('netmap.clickTip'))}</small>`;
    }
    const linkEl = target.closest('[data-link]');
    if (linkEl) {
      const l = this.topology.links.find((x) => x.id === linkEl.dataset.link);
      if (!l) return '';
      return `<b>${escapeHtml(`${this.labelOf(l.source)} ↔ ${this.labelOf(l.target)}`)}</b><dl><dt>${escapeHtml(t('netmap.traffic'))}</dt><dd>${escapeHtml(`${l.packets} ${t('netmap.packets')} · ${fmtBytes(l.bytes)}`)}</dd><dt>${escapeHtml(t('netmap.protocols'))}</dt><dd>${escapeHtml(l.protocols.map((p) => `${p.name} (${p.count})`).join(', '))}</dd></dl><small>${escapeHtml(t('netmap.clickTip'))}</small>`;
    }
    return '';
  }

  bind() {
    const toWorld = (event) => {
      const rect = this.svg.getBoundingClientRect();
      return { x: (event.clientX - rect.left - this.view.x) / this.view.k, y: (event.clientY - rect.top - this.view.y) / this.view.k };
    };
    this.host.addEventListener('click', (event) => {
      const tool = event.target.closest('[data-nm]');
      if (!tool || tool.tagName === 'SELECT') return;
      const what = tool.dataset.nm;
      if (what === 'fit') this.fit();
      else if (what === 'refresh') this.app.onRefresh();
      else if (what === 'export') this.app.onExport();
      else if (what === 'clear') this.choose(null);
      else if (what === 'external') this.app.updateSettings({ netmapShowExternal: !this.app.settings().netmapShowExternal });
      else if (what === 'multicast') this.app.updateSettings({ netmapShowMulticast: !this.app.settings().netmapShowMulticast });
    });
    this.host.addEventListener('change', (event) => {
      const what = event.target.dataset.nm;
      if (what === 'layout') { this.app.updateSettings({ netmapLayout: event.target.value }, { quiet: true }); this.userMoved = false; this.layout(); this.fit(); }
      if (what === 'labels') { this.app.updateSettings({ netmapLabels: event.target.value }, { quiet: true }); this.render(); }
    });
    this.svg.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = this.svg.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const k = Math.min(5, Math.max(0.15, this.view.k * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
      this.view = { k, x: mx - ((mx - this.view.x) / this.view.k) * k, y: my - ((my - this.view.y) / this.view.k) * k };
      this.applyView();
    }, { passive: false });
    this.svg.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const nodeEl = event.target.closest('[data-node]');
      const linkEl = event.target.closest('[data-link]');
      const start = { x: event.clientX, y: event.clientY };
      const startView = { ...this.view };
      const id = nodeEl?.dataset.node;
      const origin = id ? { ...this.positions.get(id) } : null;
      const startWorld = toWorld(event);
      let moved = false;
      this.svg.setPointerCapture?.(event.pointerId);
      const move = (e) => {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 4) return;
        moved = true;
        this.tip.hidden = true;
        if (id) {
          const w = toWorld(e);
          this.positions.set(id, { x: origin.x + w.x - startWorld.x, y: origin.y + w.y - startWorld.y });
          this.userMoved = true;
          this.render();
        } else {
          this.view = { ...startView, x: startView.x + dx, y: startView.y + dy };
          this.applyView();
        }
      };
      const up = () => {
        this.svg.removeEventListener('pointermove', move);
        this.svg.removeEventListener('pointerup', up);
        if (moved) return;
        if (id) this.choose({ type: 'node', id });
        else if (linkEl) this.choose({ type: 'link', id: linkEl.dataset.link });
        else if (this.selected) this.choose(null);
      };
      this.svg.addEventListener('pointermove', move);
      this.svg.addEventListener('pointerup', up);
    });
    this.svg.addEventListener('pointermove', (event) => {
      if (event.buttons) return;
      const html = this.topology ? this.tipFor(event.target) : '';
      if (html) this.showTip(event, html); else this.tip.hidden = true;
    });
    this.svg.addEventListener('pointerleave', () => { this.tip.hidden = true; });
    this.svg.addEventListener('keydown', (event) => {
      const nodeEl = event.target.closest?.('[data-node]');
      if (nodeEl && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); this.choose({ type: 'node', id: nodeEl.dataset.node }); }
    });
  }

  /** The map as a standalone SVG document (export). */
  svgText(colors) {
    const clone = this.svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(Math.round(this.size.width)));
    clone.setAttribute('height', String(Math.round(this.size.height)));
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `.nm-subnet rect{fill:${colors.subnet};stroke:${colors.border};stroke-dasharray:5 4}.nm-subnet text{fill:${colors.muted};font:12px sans-serif}.nm-line{stroke:${colors.link};stroke-linecap:round}.nm-hit{stroke:transparent}.nm-halo{fill:none}.nm-dot{fill:${colors.node};stroke:${colors.accent};stroke-width:2}.nm-label{fill:${colors.text};font:12px sans-serif;text-anchor:middle}.icon{color:${colors.accent}}`;
    clone.prepend(style);
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    Object.entries({ x: 0, y: 0, width: '100%', height: '100%', fill: colors.bg }).forEach(([k, v]) => bg.setAttribute(k, String(v)));
    clone.prepend(bg);
    return new XMLSerializer().serializeToString(clone);
  }
}
