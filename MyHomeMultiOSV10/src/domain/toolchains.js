// Languages a published board server is run with. The editor does not carry them: Node.js, Go,
// Rust and Python are installed on the computer that runs the server. The desktop app can start
// the installer; the web app opens the download page.

export const TOOLCHAINS = [
  { id: 'node', winget: 'OpenJS.NodeJS.LTS', url: 'https://nodejs.org/en/download' },
  { id: 'go', winget: 'GoLang.Go', url: 'https://go.dev/dl/' },
  { id: 'rust', winget: 'Rustlang.Rustup', url: 'https://www.rust-lang.org/tools/install' },
  { id: 'python', winget: 'Python.Python.3.13', url: 'https://www.python.org/downloads/' },
];

export const toolchainById = (id) => TOOLCHAINS.find((tool) => tool.id === id) ?? null;

/** The version for display: "v22.18.0" from "v22.18.0", "1.23.2" from "go version go1.23.2 windows/amd64",
 * "1.96.0" from "rustc 1.96.0 (ac68faa20 2026-05-25)", "3.12.6" from "Python 3.12.6". The raw text if none. */
export function shortVersion(text) {
  const raw = String(text ?? '').trim();
  const match = /(v?)(\d+\.\d+(?:\.\d+)?)/.exec(raw);
  return match ? `${match[1]}${match[2]}` : raw;
}

/**
 * The language to install on its own: the board server's language, when "install automatically" is on, it is
 * known to be missing (a check came back) and it was not started already in this session. Null otherwise.
 */
export function autoInstallTarget(settings, tools, started = new Set()) {
  if (!settings?.autoInstallServerTool || !Array.isArray(tools) || !tools.length) return null;
  const id = settings.boardBackend || 'node';
  const info = tools.find((tool) => tool.id === id);
  if (!info || info.found || started.has(id) || !toolchainById(id)) return null;
  return id;
}
