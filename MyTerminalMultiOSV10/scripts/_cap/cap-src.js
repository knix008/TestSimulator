import { Terminal } from '@xterm/xterm';
import { CanvasAddon } from '@xterm/addon-canvas';
import { WebglAddon } from '@xterm/addon-webgl';
const E = '\x1b';
const params = new URLSearchParams(location.search);
const renderer = params.get('r') || 'webgl';
const term = new Terminal({
  cols: 16, rows: 5,
  fontFamily: 'Consolas, "Courier New", monospace',
  fontSize: 48,
  allowProposedApi: true,
  allowTransparency: true,
  customGlyphs: true,
  lineHeight: 1,
  letterSpacing: 0,
  minimumContrastRatio: 1,
  theme: { background: 'rgba(0,0,0,0)' },
});
const host = document.getElementById('t');
term.open(host);
try {
  if (renderer === 'webgl') term.loadAddon(new WebglAddon());
  else term.loadAddon(new CanvasAddon());
} catch (e) { document.title = 'ERR ' + e.message; }
const lines = [
  E+'[41m'+E+'[37m main x '+E+'[49;31m'+E+'[0m',
  E+'[45m'+E+'[37m main '  +E+'[49;35m'+E+'[0m',
  E+'[42m'+E+'[30m main '  +E+'[49;32m'+E+'[0m',
];
term.write('\r\n' + lines.join('\r\n') + '\r\n', () => {
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__ready = true; }));
});
