import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        popup: path.resolve(__dirname, 'src/popup.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    viteStaticCopy({
      targets: [
        { src: 'src/manifest.json', dest: '.' },
        { src: 'src/icons', dest: '.' }
      ],
    }),
  ],
});