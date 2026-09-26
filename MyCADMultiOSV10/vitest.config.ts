import path from 'path'
import { defineConfig } from 'vitest/config'
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
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_NAME__: JSON.stringify(pkg.productName),
    __BUILD_DATE__: JSON.stringify('2026-09-25T00:00:00.000Z'),
    __AUTHOR__: JSON.stringify('SHKWON(knix008@naver.com)')
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    reporters: ['default', './tests/summary-reporter.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    server: {
      deps: {
        inline: ['three-bvh-csg', 'three-mesh-bvh']
      }
    }
  }
})
