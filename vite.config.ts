import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({mode}) => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.BLACKARROW_STAGE': JSON.stringify(process.env.BLACKARROW_STAGE === '1'),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      chunkSizeWarningLimit: 2500,
    },
    server: {
      allowedHosts: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: [
          '**/auth_info_baileys*/**',
          '**/bot_config_*.json',
          '**/local_store*.json',
          '**/baileys_store_*.json',
          '**/backups/**',
          '**/*.log',
          '**/*.db',
          '**/*.db-*',
        ],
      },
    },
  };
});
