import { build as viteBuild } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

async function main() {
  console.log('Building harness bundle...');
  await viteBuild({
    configFile: false,
    root: path.resolve('.'),
    plugins: [react(), tailwindcss()],
    build: {
      outDir: path.resolve('tests/.harness-dist'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          harness: path.resolve('tests/design-system-harness.html'),
        },
      },
    },
  });
  console.log('Harness build finished!');
}

main().catch(console.error);
