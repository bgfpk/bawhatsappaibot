import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const harnessDistDir = path.resolve('tests', '.harness-dist');
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const outputDir = path.resolve('artifacts', 'prompt-09-inbox');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  let filePath = path.join(harnessDistDir, urlPath.replace(/^\//, ''));
  if (urlPath === '/' || urlPath === '/harness') {
    filePath = path.join(harnessDistDir, 'tests', 'design-system-harness.html');
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(4179, async () => {
  const browser = await chromium.launch();
  try {
    // 01 Desktop Inbox
    const desktopPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await desktopPage.goto('http://127.0.0.1:4179/');
    await desktopPage.waitForTimeout(1000);
    await desktopPage.screenshot({ path: path.join(outputDir, '01-inbox-desktop.png') });
    await desktopPage.close();

    // 02 Tablet Inbox
    const tabletPage = await browser.newPage({ viewport: { width: 834, height: 1194 } });
    await tabletPage.goto('http://127.0.0.1:4179/');
    await tabletPage.waitForTimeout(1000);
    await tabletPage.screenshot({ path: path.join(outputDir, '02-inbox-tablet.png') });
    await tabletPage.close();

    // 03 Mobile Inbox
    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobilePage.goto('http://127.0.0.1:4179/');
    await mobilePage.waitForTimeout(1000);
    await mobilePage.screenshot({ path: path.join(outputDir, '03-inbox-mobile.png') });
    await mobilePage.close();

    // 04 AI Controls
    const controlsPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await controlsPage.goto('http://127.0.0.1:4179/');
    await controlsPage.waitForTimeout(1000);
    await controlsPage.screenshot({ path: path.join(outputDir, '04-inbox-ai-controls.png') });
    await controlsPage.close();

    console.log('Successfully generated 4 local screenshots under artifacts/prompt-09-inbox/');
  } finally {
    await browser.close();
    server.close();
  }
});
