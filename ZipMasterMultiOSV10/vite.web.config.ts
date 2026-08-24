import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

// 빌드 시각 기반 빌드 번호(YYYYMMDDHHmm) — About 에 표시.
const pad = (n: number) => String(n).padStart(2, '0')
const now = new Date()
const APP_BUILD = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`

// 순수 웹(브라우저) 빌드 설정. 데스크톱 빌드는 electron.vite.config.ts 를 사용한다.
export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: './',
  define: {
    __APP_BUILD__: JSON.stringify(APP_BUILD)
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@ui': resolve(__dirname, 'src/ui'),
      // tar-stream 이 의존하는 Node 'events' 를 브라우저 호환 구현으로 대체
      events: require.resolve('events/')
    }
  },
  build: {
    outDir: resolve(__dirname, 'dist-web'),
    emptyOutDir: true,
    target: 'es2021'
  },
  // libarchive.js 워커/wasm 은 최적화 대상에서 제외 (사전 번들 시 wasm 경로 문제 방지)
  optimizeDeps: {
    exclude: ['libarchive.js']
  },
  server: {
    port: 5273,
    // libarchive.js WASM 워커가 SharedArrayBuffer 를 쓰지 않도록 기본 모드 사용
    fs: { allow: ['..'] }
  }
})
