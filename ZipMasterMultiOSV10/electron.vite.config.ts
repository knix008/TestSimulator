import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// 빌드 시각 기반 빌드 번호(YYYYMMDDHHmm) — About 에 표시.
const pad = (n: number) => String(n).padStart(2, '0')
const now = new Date()
const APP_BUILD = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`

// 데스크톱(Electron) 빌드: main / preload / renderer 3개 타깃을 함께 빌드한다.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@core': resolve(__dirname, 'src/core'),
        '@ui': resolve(__dirname, 'src/ui')
      }
    },
    build: {
      outDir: 'out/main',
      lib: { entry: resolve(__dirname, 'src/desktop/main.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@core': resolve(__dirname, 'src/core'),
        '@ui': resolve(__dirname, 'src/ui')
      }
    },
    build: {
      outDir: 'out/preload',
      lib: { entry: resolve(__dirname, 'src/desktop/preload.ts') }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/desktop'),
    plugins: [react()],
    define: {
      __APP_BUILD__: JSON.stringify(APP_BUILD)
    },
    resolve: {
      alias: {
        '@core': resolve(__dirname, 'src/core'),
        '@ui': resolve(__dirname, 'src/ui')
      }
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: resolve(__dirname, 'src/desktop/index.html')
      }
    }
  }
})
