import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The web UI (web/): built to dist/web, which the server serves at /app/. In development, Vite serves it on :5173 and
// passes API and sign-in requests to the server on :3000 (DEVELOPMENT.md).
const server = 'http://localhost:3000'

export default defineConfig({
  root: 'web',
  base: '/app/',
  plugins: [react()],
  build: { outDir: '../dist/web', emptyOutDir: true },
  server: {
    port: 5173,
    strictPort: true,
    proxy: { '/api': server, '/oauth': server, '/.well-known': server },
  },
})
