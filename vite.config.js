import react from '@vitejs/plugin-react'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': process.env.RESOURCE_API_URL || 'http://127.0.0.1:8000',
    },
  },
})
