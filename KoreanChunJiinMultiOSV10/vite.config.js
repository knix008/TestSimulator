import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * Electron 은 file:// 로 dist/index.html 을 읽으므로 상대 경로로 빌드한다.
 * 같은 dist 를 정적 웹 서버에 그대로 올려도 동작한다.
 */
export default defineConfig({
  base: './',
  plugins: [react()],
  define: {
    __BUILD_STAMP__: JSON.stringify(new Date().toISOString().slice(0, 16).replace('T', ' ')),
  },
  server: { port: 5173, strictPort: false },   // 포트가 차 있으면 빈 포트를 잡는다
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
});
