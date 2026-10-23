import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  server: { proxy: { '/api/office': 'http://127.0.0.1:8790', '/api': 'http://127.0.0.1:8787' } },
  build: { chunkSizeWarningLimit: 900, rollupOptions: { output: { manualChunks(id) { if (id.replace(/\\/g, '/').includes('/node_modules/three/')) return 'office-three'; } } } },
});
