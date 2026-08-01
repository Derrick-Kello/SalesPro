import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Lets the app show which build it is running — the quickest way to tell a
  // stale cached service worker from a genuinely missing feature.
  define: {
    __APP_BUILD__: JSON.stringify(
      new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    ),
  },
  plugins: [
    react(),
    VitePWA({
      // A till must never reload itself mid-sale — the cashier accepts updates.
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'SalesPro POS',
        short_name: 'SalesPro',
        description: 'Point of sale, inventory and reporting for SalesPro outlets.',
        theme_color: '#0066CC',
        background_color: '#0066CC',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['business', 'productivity'],
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // The main bundle is ~2.7 MB; the default 2 MiB cap would skip it.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // SPA deep links resolve offline, but never swallow API calls.
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Deliberately network-only: offline reads and writes are handled in
            // app code (IndexedDB) where staleness is tracked and shown to the
            // cashier. A silent SW cache would serve stale stock as if it were live.
            urlPattern: ({ url }) => url.pathname.startsWith('/api'),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        // Lets the offline paths be exercised with `npm run dev`.
        enabled: true,
        type: 'module',
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      // Forward all /api calls to the Express backend
      '/api': 'http://localhost:3000'
    }
  }
})
