import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Ensure absolute paths for assets in production
  base: '/', 
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': {
        // Apuntar al puerto 8080 para coincidir con server.js
        target: 'http://localhost:8080',
        changeOrigin: true,
      }
    }
  }
});