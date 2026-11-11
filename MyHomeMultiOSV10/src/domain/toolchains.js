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
