import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: resolve('src/renderer'),
  base: './',
  publicDir: resolve('src/renderer/public'),
  resolve: {
    alias: {
      '@': resolve('src/renderer'),
      'onnxruntime-node': resolve('src/renderer/stubs/empty.js')
    }
  },
  assetsInclude: ['**/*.wasm', '**/ort/*.mjs'],
  optimizeDeps: {
    exclude: ['@huggingface/transformers', 'onnxruntime-web']
  },
  build: {
    outDir: resolve('dist/web'),
    emptyOutDir: true
  }
})
