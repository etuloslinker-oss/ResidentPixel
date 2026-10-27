import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

function standaloneHtmlPlugin(): Plugin {
  return {
    name: 'standalone-html-bundle',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const distDir = path.resolve(__dirname, 'dist');
      const indexPath = path.join(distDir, 'index.html');
      if (!fs.existsSync(indexPath)) return;

      let html = fs.readFileSync(indexPath, 'utf8');

      // Inline stylesheet links (<link rel="stylesheet" ... href="./assets/...">)
      html = html.replace(
        /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
        (fullMatch, href: string) => {
          const cleanRel = href.replace(/^\.?\//, '');
          const cssPath = path.join(distDir, cleanRel);
          if (fs.existsSync(cssPath)) {
            const cssContent = fs.readFileSync(cssPath, 'utf8');
            return `<style>${cssContent}</style>`;
          }
          return fullMatch;
        }
      );

      // Inline module scripts (<script type="module" crossorigin src="./assets/..."></script>)
      html = html.replace(
        /<script\b[^>]*src=["']([^"']+)["'][^>]*>\s*<\/script>/gi,
        (fullMatch, src: string) => {
          const cleanRel = src.replace(/^\.?\//, '');
          const jsPath = path.join(distDir, cleanRel);
          if (fs.existsSync(jsPath)) {
            const jsContent = fs
              .readFileSync(jsPath, 'utf8')
              .replace(/<\/script>/gi, '<\\/script>');
            return `<script type="module">${jsContent}</script>`;
          }
          return fullMatch;
        }
      );

      fs.writeFileSync(indexPath, html, 'utf8');

      // Also save a copy in public/ so the user can download the standalone index.html from the UI
      const publicDir = path.resolve(__dirname, 'public');
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, {recursive: true});
      }
      fs.writeFileSync(path.join(publicDir, 'blackwood-manor-standalone.html'), html, 'utf8');
    },
  };
}

export default defineConfig(() => {
  return {
    base: './',
    plugins: [react(), tailwindcss(), standaloneHtmlPlugin()],
    build: {
      outDir: 'dist',
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
