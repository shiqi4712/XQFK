import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cp } from 'node:fs/promises';
import path from 'node:path';

function copyLocalAssets() {
  return {
    name: 'copy-local-assets',
    apply: 'build',
    async closeBundle() {
      await cp(path.resolve('assets'), path.resolve('dist/assets'), { recursive: true });
    },
  };
}

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_');
  const usesExternalAssets = Boolean(environment.VITE_ASSET_BASE_URL?.trim());

  return {
    plugins: [react(), tailwindcss(), !usesExternalAssets && copyLocalAssets()].filter(Boolean),
    server: {
      watch: {
        ignored: ['**/server-data/**'],
      },
      proxy: {
        '/api': 'http://localhost:5174',
      },
    },
  };
});
