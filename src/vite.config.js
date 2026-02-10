import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // Ensure base path is correct
  base: '/',
  
  // For deployment to subdirectory (like GitHub Pages):
  // base: '/your-repo-name/',
  
  build: {
    // These are defaults but good to verify
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      // Optional: if you have specific chunking needs
      output: {
        manualChunks: undefined
      }
    }
  }
})