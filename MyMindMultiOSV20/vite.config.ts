import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const commit = () => {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return ''
  }
}

const pad = (value: number) => String(value).padStart(2, '0')
const now = new Date()
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react()],
  base: './',
  clearScreen: false,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_INFO__: JSON.stringify({
      date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
      commit: commit(),
    }),
  },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022', chunkSizeWarningLimit: 2000 },
  // The folder also holds every build's output: left to itself the dev server looks through and
  // watches src-tauri/target before it serves the page, which takes tens of seconds.
  optimizeDeps: { entries: ['index.html'] },
  server: {
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/dist/**', '**/test-results/**', '**/template/**', '**/.git/**'] },
  },
})
