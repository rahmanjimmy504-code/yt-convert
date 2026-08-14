import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The Capacitor WebView loads the built assets from the APK over
// https://localhost, so every asset reference must be relative ("./").
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    // Capacitor ships the bundle inside the APK; sourcemaps stay out of it.
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Arena/e2b preview proxies serve the dev server under a *.e2b.app host.
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
  },
});
