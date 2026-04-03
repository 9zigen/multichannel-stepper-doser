import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import compression from 'vite-plugin-compression2';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), tailwindcss(), compression()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    manifest: true,
    rollupOptions: {
      output: {
        entryFileNames: `app.js`,
        chunkFileNames: `[name].js`,
        assetFileNames: `app.[ext]`,
      },
    },
  },
});
