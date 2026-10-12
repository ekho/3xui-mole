import { defineConfig, type ViteDevServer, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fixture = readFileSync(
  new URL('./scripts/local-public-config.json', import.meta.url),
  'utf8',
);

function serveLocalConfig(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((req, _res, next) => {
    const path = req.url?.split('?')[0];
    if (path === '/mini-app' || path?.startsWith('/mini-app/')) {
      req.url = '/mini-app.html' + (req.url?.includes('?') ? '?' + req.url.split('?')[1] : '');
    }
    next();
  });
  server.middlewares.use('/config.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(fixture);
  });
}

export default defineConfig({
  build: {
    sourcemap: false,
    rolldownOptions: {
      input: {
        web: fileURLToPath(new URL('./index.html', import.meta.url)),
        mini: fileURLToPath(new URL('./mini-app.html', import.meta.url)),
      },
    },
  },
  plugins: [
    react(),
    {
      name: 'local-public-config',
      configureServer: serveLocalConfig,
      configurePreviewServer: serveLocalConfig,
      transformIndexHtml: {
        order: 'post',
        handler(html, context) {
          if (!context.server) return html;
          // Vite's injected styles and Fast Refresh need a nonce only during development.
          const nonce = randomBytes(18).toString('base64');
          return {
            html: html
              .replace(/(script-src|style-src) 'self'/g, "$& 'nonce-" + nonce + "'")
              .replace(/<script(?=[\s>])/g, '<script nonce="' + nonce + '"'),
            tags: [{ tag: 'meta', attrs: { property: 'csp-nonce', nonce }, injectTo: 'head' }],
          };
        },
      },
    },
  ],
});
