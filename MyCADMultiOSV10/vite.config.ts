import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

const threeEntry = path.resolve('node_modules/three/build/three.module.js')
const csgEntry = path.resolve('node_modules/three-bvh-csg/src/index.js')
const bvhEntry = path.resolve('node_modules/three-mesh-bvh/src/index.js')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^three$/, replacement: threeEntry },
      { find: /^three-bvh-csg$/, replacement: csgEntry },
      { find: /^three-mesh-bvh$/, replacement: bvhEntry }
    ],
    dedupe: ['three']
  },
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
    __AUTHOR__: JSON.stringify('shkwon(knix008@naver.com)')
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // The 3D kernel is one library and cannot be split further, so it gets its
    // own chunk: the app and React stay small and cacheable, and a window that
    // never draws (the settings window) never downloads it.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: (id: string) => {
          if (id.includes('three-mesh-bvh') || id.includes('three-bvh-csg') || /[\\/]three[\\/]/.test(id)) return 'three'
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react'
          return undefined
        }
      }
    }
  }
})
