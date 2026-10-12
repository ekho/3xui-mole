import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'vite';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const root = await mkdtemp(join(tmpdir(), 'mole-web-dev-'));
let browser, server;
try {
  for (const path of [
    'src',
    'public',
    'scripts',
    'index.html',
    'mini-app.html',
    'vite.config.ts',
    'tsconfig.json',
    'package.json',
  ]) {
    await cp(join(workspace, path), join(root, path), { recursive: true });
  }
  await symlink(join(workspace, 'node_modules'), join(root, 'node_modules'), 'dir');
  const source = join(root, 'src/Auth.tsx');
  const original = await readFile(source, 'utf8');
  server = await createServer({ root, server: { host: '127.0.0.1', port: 0 } });
  await server.listen();
  const url = server.resolvedUrls.local[0];
  const nonce = async (path) => {
    const html = await (await fetch(new URL(path, url))).text();
    const value = html.match(/'nonce-([^']+)'/)?.[1];
    assert.ok(value, 'development CSP contains a nonce');
    assert.ok(html.includes('property="csp-nonce"'), 'Vite receives the nonce for injected styles');
    return value;
  };
  assert.notEqual(await nonce('/'), await nonce('/'), 'each document receives a fresh nonce');
  await nonce('/mini-app');

  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.route('**/api/v1/maintenance', (route) =>
    route.fulfill({ json: { enabled: false, revision: 1 } }),
  );
  await page.goto(new URL('/login?lang=en', url).href);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('margin', '0px');
  await page.locator('#email').fill('refresh@example.test');
  await page.evaluate(() => (window.__devDocument = 'original'));
  assert.ok(original.includes('<h1>'), 'the test edits the login component');
  await writeFile(source, original.replace('<h1>', '<h1 data-dev-refresh="yes">'));
  await expect(page.locator('h1')).toHaveAttribute('data-dev-refresh', 'yes');
  await expect(page.locator('#email')).toHaveValue('refresh@example.test');
  assert.equal(await page.evaluate(() => window.__devDocument), 'original');
  assert.deepEqual(errors, [], 'development loads and refreshes without CSP or runtime errors');
  console.log('Development CSP, CSS and React Fast Refresh passed.');
} finally {
  await browser?.close();
  await server?.close();
  await rm(root, { recursive: true, force: true });
}
