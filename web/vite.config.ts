import { defineConfig, type ViteDevServer, type PreviewServer } from 'vite';
import react from '@vitejs/plugin-react';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Caddy evaluates this only for trusted, built cabinet HTML. A fresh nonce is
// generated for each response and shared by the CSP and Emotion's style tags.
const noncePlaceholder = '{{ $cspNonce }}';
const templatePrefix = '{{ $cspNonce := randAlphaNum 32 -}}{{ .RespHeader.Set "Content-Security-Policy" (printf "default-src \'self\'; script-src \'self\' \'sha256-PgqzSxMpLRBzUhg2SooHKWZ2oAc0yWVxeNMrpG5YqoM=\'; style-src \'self\' \'nonce-%s\'; connect-src \'self\'; object-src \'none\'; base-uri \'none\'; form-action \'self\' https://yoomoney.ru; frame-ancestors \'none\'" $cspNonce) -}}';
function styleNonce(html: string, nonce: string) {
  return html.replace("style-src 'self'", "style-src 'self' 'nonce-" + nonce + "'")
    .replace('<meta charset="UTF-8">', '<meta charset="UTF-8"><meta property="csp-nonce" nonce="' + nonce + '">');
}

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

function previewDocuments(server: PreviewServer) {
  serveLocalConfig(server);
  const html = readFileSync(resolve(server.config.root, server.config.build.outDir, 'index.html'), 'utf8');
  server.middlewares.use((req, res, next) => {
    const path = req.url?.split('?')[0] ?? '/';
    if (!['GET', 'HEAD'].includes(req.method ?? '') || path === '/mini-app.html' || /\.[^/]+$/.test(path) && path !== '/index.html') return next();
    const nonce = randomBytes(24).toString('base64');
    const document = html.replace(templatePrefix, '').replaceAll(noncePlaceholder, nonce);
    const policy = document.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
    if (policy) res.setHeader('Content-Security-Policy', policy + "; frame-ancestors 'none'");
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(req.method === 'HEAD' ? undefined : document);
  });
}

export default defineConfig({
  build: {
    manifest: true,
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
      configurePreviewServer: previewDocuments,
      transformIndexHtml: {
        order: 'post',
        handler(html, context) {
          if (!context.server) return context.filename.endsWith('/mini-app.html') ? html : templatePrefix + styleNonce(html, noncePlaceholder);
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
