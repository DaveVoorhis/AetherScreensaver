import { defineConfig } from 'vite';

/**
 * Ensures the production build in `dist/` works everywhere:
 * - HTTP(S) at domain root (`npm run preview`, root hosting)
 * - HTTP(S) under a subpath (IDE preview server, GitHub Pages, etc.)
 * - Opened directly from disk via `file://` (where browsers block
 *   `type="module"` and `crossorigin` requests with CORS errors)
 */
function portableBuildPlugin() {
  return {
    name: 'portable-build',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(/<script\b([^>]*?)>/g, (tag, attrs) => {
            if (!/\btype=["']module["']/.test(attrs)) return tag;
            const cleaned = attrs
              .replace(/\s*\btype=["']module["']/g, '')
              .replace(/\s*\bcrossorigin(?:=["'][^"']*["'])?/g, '')
              .trim();
            return `<script defer ${cleaned}>`;
          })
          .replace(/<link\b([^>]*?)>/g, (tag, attrs) => {
            if (!/\bcrossorigin\b/.test(attrs)) return tag;
            const cleaned = attrs
              .replace(/\s*\bcrossorigin(?:=["'][^"']*["'])?/g, '')
              .trim();
            return `<link ${cleaned}>`;
          });
      },
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [portableBuildPlugin()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    modulePreload: false,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
