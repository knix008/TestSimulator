import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    publicDir: resolve('src/renderer/public'),
    assetsInclude: ['**/*.wasm', '**/ort/*.mjs'],
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        // Renderer must use onnxruntime-web, not the Node binding.
        'onnxruntime-node': resolve('src/renderer/stubs/empty.js')
      }
    },
    optimizeDeps: {
      exclude: ['@huggingface/transformers', 'onnxruntime-web']
    },
    worker: {
      format: 'es'
    }
  }
})
