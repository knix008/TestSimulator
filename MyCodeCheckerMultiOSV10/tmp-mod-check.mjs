import esbuild from 'esbuild';
const text = await (await fetch('http://127.0.0.1:5210/src/lib/tutorialSteps.js')).text();
try {
  esbuild.transformSync(text, { loader: 'js' });
  console.log('esbuild ok', text.length);
} catch (e) {
  console.log(String(e.message).slice(0, 1500));
  const m = /:(\d+):(\d+)/.exec(e.message);
  if (m) {
    const line = Number(m[1]);
    const lines = text.split(/\n/);
    for (let i = Math.max(0, line - 4); i < Math.min(lines.length, line + 3); i++) {
      console.log(String(i + 1).padStart(5) + ' ' + lines[i].slice(0, 300));
    }
  }
}
process.exit(0);
