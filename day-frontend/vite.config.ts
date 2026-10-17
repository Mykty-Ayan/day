import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

const proxyTarget = (
  process.env.VITE_API_PROXY_TARGET
  || process.env.BACKEND_URL
  || (existsSync('/.dockerenv') ? 'http://backend:8000' : 'http://localhost:8000')
).replace(/\/+$/, '')

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      // guest.html: the shell nginx serves for guest pages, with no Telegram SDK.
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        guest: fileURLToPath(new URL('./guest.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: proxyTarget,
        changeOrigin: true,
      },
    },
  },
}) // коммент
