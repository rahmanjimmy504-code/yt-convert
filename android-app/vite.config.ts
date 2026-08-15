// SPDX-License-Identifier: GPL-3.0-or-later
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * The WebView loads the built assets from the APK over capacitor://, so every
 * URL has to be relative — an absolute /assets/... path resolves against the
 * scheme root and 404s on device.
 */
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    // Capacitor ships the bundle inside the APK; a source map would only bloat
    // the download for release builds.
    sourcemap: false,
    target: 'es2022',
  },
  server: { host: true, port: 5173 },
});
