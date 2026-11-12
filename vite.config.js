import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// BASE_PATH est fourni par la mise en ligne GitHub Pages (ex. /app-potes/)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const name = env.VITE_APP_NAME || 'Chaud'
  const manifest = {
    name, short_name: name, lang: 'fr', start_url: './', scope: './', display: 'standalone',
    background_color: '#FAFBFD', theme_color: '#1F3A68',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
  return {
    base: process.env.BASE_PATH || '/',
    plugins: [
      react(),
      {
        name: 'manifest',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (!req.url.endsWith('/manifest.webmanifest')) return next()
            res.setHeader('Content-Type', 'application/manifest+json')
            res.end(JSON.stringify(manifest))
          })
        },
        generateBundle() {
          this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 2) })
        },
      },
    ],
  }
})
