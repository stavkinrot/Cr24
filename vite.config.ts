import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      closeBundle() {
        // Copy manifest.json to dist
        copyFileSync('manifest.json', 'dist/manifest.json');

        // Copy sandbox.html to dist
        if (existsSync('public/sandbox.html')) {
          copyFileSync('public/sandbox.html', 'dist/sandbox.html');
        }

        // Copy icons folder to dist
        if (!existsSync('dist/icons')) {
          mkdirSync('dist/icons', { recursive: true });
        }

        // Copy icon files if they exist
        const iconSizes = ['16', '48', '128'];
        iconSizes.forEach(size => {
          const pngPath = `icons/icon${size}.png`;
          const svgPath = 'icons/icon.svg';

          try {
            if (existsSync(pngPath)) {
              copyFileSync(pngPath, `dist/icons/icon${size}.png`);
            } else if (existsSync(svgPath)) {
              // Copy SVG as fallback
              copyFileSync(svgPath, `dist/icons/icon${size}.svg`);
            }
          } catch (e) {
            console.warn(`Could not copy icon${size}`);
          }
        });
      }
    }
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
