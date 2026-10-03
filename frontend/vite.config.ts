import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Listen on the LAN so phones on the same Wi-Fi can open the dev server
    host: true,
    // Forward /api calls to the Python backend so we avoid CORS headaches in dev
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
