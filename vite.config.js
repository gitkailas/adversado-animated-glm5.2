import { defineConfig } from 'vite';

// Vite configuration for the Adversado hero.
// - `public/` is served at root, so processed WebP frames live at /frames-all/...
// - We bump the dev chunk size warning threshold because the frame list is large.
// - A 120s dev server timeout avoids HMRsprite churn mid-load while frames decode.
export default defineConfig({
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    chunkSizeWarningLimit: 1200,
  },
});
