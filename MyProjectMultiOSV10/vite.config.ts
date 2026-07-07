import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const webClientRoot = path.resolve(projectRoot, '../MyProjectWebV10/client/src');
const desktopClientPath = path.resolve(projectRoot, 'renderer/src/api/desktopClient.ts');
const desktopAuthContextPath = path.resolve(projectRoot, 'renderer/src/context/DesktopAuthContext.tsx');

function desktopWebClientAlias(): Plugin {
  const webApiClientSuffix = `${path.sep}api${path.sep}client`;
  const webAuthContextSuffix = `${path.sep}context${path.sep}AuthContext`;

  return {
    name: 'desktop-web-client-alias',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer) return null;

      const isWebClientImport =
        importer.includes('MyProjectWebV10') ||
        importer.includes(`${path.sep}MyProjectWebV10${path.sep}`);

      if (!isWebClientImport) return null;

      const normalizedSource = source.replace(/\\/g, '/');
      if (
        source === '../api/client' ||
        normalizedSource.endsWith('/api/client') ||
        normalizedSource.endsWith('/api/client.ts')
      ) {
        return desktopClientPath;
      }

      if (source.endsWith(webApiClientSuffix) || source.endsWith(`${webApiClientSuffix}.ts`)) {
        return desktopClientPath;
      }

      if (
        source === '../context/AuthContext' ||
        normalizedSource.endsWith('/context/AuthContext') ||
        normalizedSource.endsWith('/context/AuthContext.tsx')
      ) {
        return desktopAuthContextPath;
      }

      if (
        source.endsWith(webAuthContextSuffix) ||
        source.endsWith(`${webAuthContextSuffix}.tsx`)
      ) {
        return desktopAuthContextPath;
      }

      return null;
    },
  };
}

export default defineConfig({
  root: path.resolve(projectRoot, 'renderer'),
  plugins: [react(), desktopWebClientAlias()],
  resolve: {
    alias: [
      { find: '@web', replacement: webClientRoot },
      {
        find: path.resolve(webClientRoot, 'context/AuthContext'),
        replacement: desktopAuthContextPath,
      },
      {
        find: path.resolve(webClientRoot, 'context/AuthContext.tsx'),
        replacement: desktopAuthContextPath,
      },
      {
        find: path.resolve(webClientRoot, 'api/client'),
        replacement: desktopClientPath,
      },
      {
        find: path.resolve(webClientRoot, 'api/client.ts'),
        replacement: desktopClientPath,
      },
      {
        find: 'html2canvas',
        replacement: path.resolve(projectRoot, 'node_modules/html2canvas/dist/html2canvas.esm.js'),
      },
    ],
  },
  define: {
    'import.meta.env.VITE_APP_NAME': JSON.stringify('MyProject'),
  },
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  build: {
    outDir: path.resolve(projectRoot, 'dist-renderer'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          if (id.includes('html2canvas')) {
            return 'vendor-html2canvas';
          }
          if (id.includes('frappe-gantt')) {
            return 'vendor-gantt';
          }
          if (id.includes('react-dom') || id.includes('/react/') || id.includes('\\react\\')) {
            return 'vendor-react';
          }

          return undefined;
        },
      },
    },
  },
});
