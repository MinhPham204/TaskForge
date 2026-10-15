import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium, expect } from '@playwright/test';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const screenshots = resolve(frontendRoot, '../output/landing');
const vite = await createServer({
  root: frontendRoot,
  configFile: resolve(frontendRoot, 'vite.config.js'),
  envFile: false,
  define: { 'import.meta.env.DEV': 'false' },
  server: { host: '127.0.0.1', port: 0 },
  logLevel: 'error',
});
let browser;
try {
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  const launch = { headless: true };
  try { await access(chromium.executablePath()); } catch {
    if (process.platform === 'win32') launch.channel = 'chrome';
  }
  browser = await chromium.launch(launch);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' });
  // Landing checks do not need a running API or external font services.
  await context.route('**/*', route => {
    if (route.request().url().startsWith(origin + '/')) return route.continue();
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Workspaces built for clarity. Cross-functional project execution.');
  await expect(page).toHaveURL(origin + '/');
  await expect(page).toHaveTitle('TaskForge — Project & Workspace Platform');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await page.goto(origin);

  const invalidLinks = await page.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')).filter(href =>
    !href || href === '#' || (href.startsWith('#') && !document.getElementById(href.slice(1)))
  ));
  assert.deepEqual(invalidLinks, [], 'Every landing link must have an existing section or real route');
  const overview = page.getByRole('img', { name: 'Unified Cross-Team Operating Architecture' });
  await overview.scrollIntoViewIfNeeded();
  await expect.poll(() => overview.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);

  const strictQuestion = page.locator('#faq details').nth(1);
  await strictQuestion.locator('summary').click();
  await expect(strictQuestion).toHaveAttribute('open', '');
  await strictQuestion.locator('summary').click();
  await expect(strictQuestion).not.toHaveAttribute('open');

  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await mkdir(screenshots, { recursive: true });
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: resolve(screenshots, 'desktop-dark-hero.png') });
  await page.screenshot({ path: resolve(screenshots, 'desktop-dark.png'), fullPage: true });
  await page.getByRole('button', { name: 'Toggle color theme' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: resolve(screenshots, 'desktop-light-hero.png') });
  await page.screenshot({ path: resolve(screenshots, 'desktop-light.png'), fullPage: true });

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 0));
    const overflow = await page.locator('.landing-page').evaluate(root => [...root.querySelectorAll('*')].filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1) && !el.classList.contains('landing-skip-link');
    }).map(el => `${el.tagName}.${el.className}`));
    assert.deepEqual(overflow, [], `No clipped content at ${width}px`);
    const nav = page.getByRole('navigation', { name: width < 768 ? 'Mobile navigation' : 'Main navigation', exact: true });
    await expect(nav).toBeVisible();
    if (width === 390) {
      await page.screenshot({ path: resolve(screenshots, 'mobile-light-hero.png') });
      await page.screenshot({ path: resolve(screenshots, 'mobile-light.png'), fullPage: true });
    }
    await nav.getByRole('link', { name: 'Features', exact: true }).click();
    await expect(page).toHaveURL(origin + '/#features');
    assert.ok(await page.locator('#features').evaluate(el => el.getBoundingClientRect().top >= 55), 'Sticky header must not cover anchor heading');
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('a[href="/signup"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^(Log in|Account Login|Sign in to existing account)$/ })).toHaveCount(0);
  for (const cta of [
    page.locator('header').getByRole('link', { name: 'Get Started', exact: true }),
    page.getByRole('link', { name: 'Start using TaskForge', exact: true }),
    page.locator('#get-started').getByRole('link', { name: 'Get Started', exact: true }),
    page.locator('footer').getByRole('link', { name: 'Get Started', exact: true }),
  ]) {
    await page.goto(origin);
    await cta.click();
    await expect(page).toHaveURL(origin + '/login');
  }
  await page.goto(origin);
  await page.locator('#get-started').getByRole('link', { name: 'Explore features', exact: true }).click();
  await expect(page).toHaveURL(origin + '/#features');
  await page.goto(origin + '/projects');
  await expect(page).toHaveURL(/\/login\?from=%2Fprojects$/);
  assert.deepEqual(errors, [], 'No uncaught browser errors');

  // A valid stored session still enters the app instead of the public landing.
  const signedIn = await browser.newContext();
  await signedIn.addInitScript(() => {
    localStorage.setItem('token', 'landing-test-token');
    localStorage.setItem('authUser', JSON.stringify({ id: 'landing-test', name: 'Landing test', email: 'landing@example.test' }));
  });
  await signedIn.route('**/*', route => {
    const url = route.request().url();
    if (url.includes('/api/auth/me')) return route.fulfill({ json: { id: 'landing-test', name: 'Landing test', email: 'landing@example.test' } });
    if (url.includes('/api/auth/my-organizations')) return route.fulfill({ json: [] });
    if (url.includes('/api/')) return route.fulfill({ json: {} });
    if (url.startsWith(origin + '/')) return route.continue();
    return route.abort();
  });
  const signedInPage = await signedIn.newPage();
  await signedInPage.goto(origin);
  await expect(signedInPage).toHaveURL(origin + '/dashboard');
  console.log('Landing browser PASS: responsive 320/390/768/1440px, assets, FAQ, theme persistence, CTA routes, protected routes, authenticated root redirect.');
  console.log(`Screenshots: ${screenshots}`);
} finally {
  await browser?.close();
  await vite.close();
}
