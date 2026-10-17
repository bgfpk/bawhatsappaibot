import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import http from 'http';

function startServer(port = 4173) {
  const harnessDistDir = path.resolve('tests', '.harness-dist');
  const server = http.createServer((req, res) => {
    let filePath = path.join(harnessDistDir, req.url === '/' ? 'tests/design-system-harness.html' : req.url);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.json': 'application/json',
    };
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    fs.createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

async function captureScreenshots() {
  const server = await startServer(4173);
  const artifactsDir = path.resolve('artifacts', 'prompt-06-shell');
  if (!fs.existsSync(artifactsDir)) {
    fs.mkdirSync(artifactsDir, { recursive: true });
  }

  const browser = await chromium.launch();

  // 1. Desktop Expanded Mode
  const pageDesktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  pageDesktop.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  pageDesktop.on('pageerror', (err) => console.error('PAGE ERROR:', err));
  await pageDesktop.goto('http://localhost:4173/tests/design-system-harness.html', { waitUntil: 'networkidle' });
  await pageDesktop.waitForSelector('.dashboard-shell');
  await pageDesktop.screenshot({ path: path.join(artifactsDir, 'desktop-expanded.png') });
  console.log('Saved desktop-expanded.png');

  // 2. Desktop Collapsed Mode
  const collapseBtn = pageDesktop.locator('button[aria-label="Collapse sidebar navigation"]');
  if (await collapseBtn.isVisible()) {
    await collapseBtn.click();
    await pageDesktop.waitForTimeout(300);
    await pageDesktop.screenshot({ path: path.join(artifactsDir, 'desktop-collapsed.png') });
    console.log('Saved desktop-collapsed.png');
  }

  // 3. User Menu Popover
  const userMenuBtn = pageDesktop.locator('button[aria-label^="User menu for"]');
  if (await userMenuBtn.isVisible()) {
    await userMenuBtn.click();
    await pageDesktop.waitForTimeout(300);
    await pageDesktop.screenshot({ path: path.join(artifactsDir, 'user-menu-popover.png') });
    console.log('Saved user-menu-popover.png');
  }

  // 4. Mobile Navigation Drawer
  const pageMobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await pageMobile.goto('http://localhost:4173/tests/design-system-harness.html');
  await pageMobile.waitForSelector('.dashboard-shell');
  const mobileMenuBtn = pageMobile.locator('button[aria-label="Open Navigation Menu"]');
  if (await mobileMenuBtn.isVisible()) {
    await mobileMenuBtn.click();
    await pageMobile.waitForTimeout(300);
    await pageMobile.screenshot({ path: path.join(artifactsDir, 'mobile-drawer.png') });
    console.log('Saved mobile-drawer.png');
  }

  await browser.close();
  server.close();
  console.log('Screenshots capture finished!');
}

captureScreenshots().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
