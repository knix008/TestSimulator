import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { execSync } = require('child_process');
const port = Number(process.argv[2] || 5210);
try {
  if (process.platform === 'win32') {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const pid = line.trim().split(/\s+/).pop();
      if (pid && pid !== '0') pids.add(pid);
    }
    for (const pid of pids) {
      try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch { /* already gone */ }
    }
  }
} catch { /* nothing is listening */ }
