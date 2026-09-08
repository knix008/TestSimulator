/*
 * dev.mjs - 개발용 실행기 (npm start)
 *
 * Vite 개발 서버와 Electron 을 한 프로세스가 함께 쥔다.
 *
 * 예전에는 `concurrently "vite" "wait-on && cross-env electron"` 이었는데
 * Windows 에서 두 가지 문제가 있었다.
 *
 *   - 사슬 중간이 깨지면 Electron 이 0xC0000409 로 죽으며 창이 안 뜬다
 *   - 끝내도 Vite 가 남아 5173 포트를 계속 물고 있다
 *
 * 그래서 Vite 를 Node API 로 이 프로세스 안에서 띄우고, Electron 은 자식으로
 * 둔다. 어느 쪽이 끝나든 · Ctrl+C 를 누르든 반드시 둘 다 정리하고 나간다.
 * 포트가 이미 쓰이고 있으면 Vite 가 빈 포트를 잡고, 그 주소를 Electron 에 넘긴다.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';
import { createServer } from 'vite';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let server = null;
let child = null;
let closing = false;

/* 무슨 일이 있어도 한 번만, 반드시 둘 다 내린다 */
async function shutdown(code) {
  if (closing) return;
  closing = true;

  if (child && child.exitCode === null) {
    child.kill();
    /* 얌전히 안 죽으면 잠깐 뒤에 확실히 끝낸다 */
    await new Promise((r) => {
      const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* 이미 죽음 */ } r(); }, 1500);
      child.once('exit', () => { clearTimeout(t); r(); });
    });
  }

  if (server) {
    try {
      await server.close();          /* 여기서 5173 포트가 풀린다 */
      console.log('\n개발 서버를 닫았습니다. 포트를 풀었습니다.');
    } catch (e) {
      console.error(`개발 서버를 닫지 못했습니다: ${e.message}`);
    }
  }
  process.exit(code);
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => { shutdown(0); });
}
process.on('uncaughtException', (e) => {
  console.error(`실행기 오류: ${e.stack || e.message}`);
  shutdown(1);
});

/* ------------------------------------------------------------------ */

try {
  server = await createServer({
    root,
    /*
     * 포트가 이미 쓰이고 있으면 빈 포트를 잡는다.
     * 어느 포트를 잡았는지는 아래에서 실제 주소로 확인해 Electron 에 넘긴다.
     */
    server: { port: 5173, strictPort: false },
  });
  await server.listen();
} catch (e) {
  console.error(`Vite 개발 서버를 띄우지 못했습니다: ${e.message}`);
  process.exit(1);
}

const url = server.resolvedUrls?.local?.[0];
if (!url) {
  console.error('개발 서버 주소를 알 수 없습니다.');
  await shutdown(1);
}

server.printUrls();
console.log(`\nElectron 을 띄웁니다 -> ${url}`);

/*
 * ELECTRON_RUN_AS_NODE 가 남아 있으면 Electron 이 창을 띄우지 않고
 * 그냥 Node 로만 돌아서 app 이 undefined 가 된다. 넘기기 전에 지운다.
 */
const env = { ...process.env, VITE_DEV_SERVER_URL: url };
delete env.ELECTRON_RUN_AS_NODE;

child = spawn(electronPath, [root], { stdio: 'inherit', env });

child.on('error', (e) => {
  console.error(`Electron 을 실행하지 못했습니다: ${e.message}`);
  shutdown(1);
});

/* 창을 닫으면 개발 서버도 같이 내린다 */
child.on('exit', (code) => shutdown(code ?? 0));
