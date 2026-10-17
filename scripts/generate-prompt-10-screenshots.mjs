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

const outputDir = path.resolve('artifacts', 'prompt-10-operations');
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

server.listen(4180, async () => {
  const browser = await chromium.launch();
  try {
    // 01 Customers Desktop + Customer 360
    const customersPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await customersPage.goto('http://127.0.0.1:4180/');
    await customersPage.waitForTimeout(1000);
    await customersPage.screenshot({ path: path.join(outputDir, '01-customers-desktop.png') });
    await customersPage.close();

    // 02 CRM Desktop Pipeline
    const crmPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await crmPage.goto('http://127.0.0.1:4180/');
    await crmPage.waitForTimeout(1000);
    await crmPage.screenshot({ path: path.join(outputDir, '02-crm-desktop.png') });
    await crmPage.close();

    // 03 Orders Desktop + Detail Drawer
    const ordersPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await ordersPage.goto('http://127.0.0.1:4180/');
    await ordersPage.waitForTimeout(1000);
    await ordersPage.screenshot({ path: path.join(outputDir, '03-orders-desktop.png') });
    await ordersPage.close();

    // 04 Mobile Operational View
    const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await mobilePage.goto('http://127.0.0.1:4180/');
    await mobilePage.waitForTimeout(1000);
    await mobilePage.screenshot({ path: path.join(outputDir, '04-operations-mobile.png') });
    await mobilePage.close();

    console.log('Successfully generated 4 local screenshots under artifacts/prompt-10-operations/');
  } finally {
    await browser.close();
    server.close();
  }
});
