import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite dev server for the MDT-generated SPA. API calls are proxied to the
// local Node agent service so the browser never talks cross-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8790',
        changeOrigin: true,
      },
    },
  },
})
