import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.js'),
          depthChild: resolve('src/main/depthChild.js')
        }
      }
    }
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
        // Renderer no longer runs ORT; keep stub in case of leftover imports.
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
