import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'imagery/*'],
      manifest: {
        id: '/',
        name: 'Orbital Traffic',
        short_name: 'Orbital',
        description:
          'Real-time 3D tracker for every satellite, station, and near-Earth object — computed on your device.',
        start_url: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#05060b',
        theme_color: '#38bdf8',
        categories: ['navigation', 'education', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2}'],
        navigateFallback: 'index.html',
        // Cache the data/imagery snapshots at runtime so the app keeps working
        // offline after the first visit without bloating the precache manifest.
        runtimeCaching: [
          {
            urlPattern: /\/data\/.*\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'orbital-data',
              expiration: { maxEntries: 20, maxAgeSeconds: 7 * 86400 },
            },
          },
          {
            urlPattern: /\/imagery\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'orbital-imagery',
              expiration: { maxEntries: 40, maxAgeSeconds: 30 * 86400 },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.includes('workers.dev'),
            handler: 'NetworkFirst',
            options: { cacheName: 'orbital-live', networkTimeoutSeconds: 5 },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  worker: {
    format: 'es',
  },
});
