import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3001',
      '/analytics': 'http://localhost:3001',
      '/photos': 'http://localhost:3001',
    },
    watch: {
      ignored: ['**/data/**', '**/*.lmdb/**'],
    },
  },
  build: {
    // sourcemap: 'inline',
  },
})
