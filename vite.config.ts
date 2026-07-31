import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * `npm run build`        → dist/, a normal static bundle to host anywhere.
 * `npm run build:single` → dist-single/index.html, one self-contained file you can
 *                          open straight off disk or email to yourself.
 */
const single = process.env.SINGLE_FILE === '1';

export default defineConfig({
  base: './',
  plugins: [react(), ...(single ? [viteSingleFile()] : [])],
  build: {
    outDir: single ? 'dist-single' : 'dist',
    sourcemap: !single,
    assetsInlineLimit: single ? 100_000_000 : 4096,
  },
});
