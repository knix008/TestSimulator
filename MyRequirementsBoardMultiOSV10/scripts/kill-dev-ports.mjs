import { execSync } from 'node:child_process';

const PORTS = [3847, 3848, 5175];

function killPortWindows(port) {
  const pids = new Set();

  try {
    const ps = `
      Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess
    `;
    const output = execSync(`powershell -NoProfile -Command "${ps.replace(/\s+/g, ' ')}"`, { encoding: 'utf8' });
    for (const line of output.split(/\r?\n/)) {
      const pid = Number(line.trim());
      if (pid > 0) pids.add(pid);
    }
  } catch {
    // fallback to netstat
    try {
      const output = execSync('netstat -ano', { encoding: 'utf8' });
      const re = new RegExp(`:${port}\\s`);
      for (const line of output.split(/\r?\n/)) {
        if (!line.includes('LISTENING') || !re.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts.at(-1));
        if (pid > 0) pids.add(pid);
      }
    } catch {
      return;
    }
  }

  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
      console.log(`[kill-dev-ports] 포트 ${port} — PID ${pid} 종료`);
    } catch {
      // already gone
    }
  }
}

function killPortUnix(port) {
  try {
    const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' })
      .split(/\r?\n/)
      .map((v) => Number(v.trim()))
      .filter((v) => v > 0);
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM');
        console.log(`[kill-dev-ports] 포트 ${port} — PID ${pid} 종료`);
      } catch {
        // already gone
      }
    }
  } catch {
    // no process
  }
}

const killPort = process.platform === 'win32' ? killPortWindows : killPortUnix;

for (const port of PORTS) {
  killPort(port);
}
