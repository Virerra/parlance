import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forwards calls to the backend proxy functions in api/ (run via
      // `vercel dev`, see package.json's "dev:api" script) so the
      // frontend can use plain relative /api/* paths in both dev and
      // production — vercel dev's own server replaces this proxy once
      // actually deployed, this is purely a local-dev convenience.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
