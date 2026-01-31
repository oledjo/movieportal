import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 3000,
    open: true
  },
  // Base path for GitHub Pages
  // If deploying to root, use: base: '/'
  base: process.env.NODE_ENV === 'production' ? '/movieportal/' : '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  }
})
