import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    rollupOptions: {
      // Two pages: the main application, and the standalone SIGNAL VEIL demonstration.
      input: {
        main: 'index.html',
        signalVeil: 'signal-veil.html',
      },
    },
  },
})
