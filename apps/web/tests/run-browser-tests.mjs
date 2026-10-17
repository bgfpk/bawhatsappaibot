import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, "..");
const nextCli = path.resolve(webDir, "node_modules", "next", "dist", "bin", "next");
const pwCli = path.resolve(webDir, "node_modules", "playwright", "cli.js");

const PORT = 3009;

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // Retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Server at ${url} failed to respond within ${timeoutMs}ms`);
}

async function run() {
  console.log("=== BlackArrow M2.2 Self-Contained Portable Browser Test Runner ===");

  // 1. Verify / Install Playwright Chromium Browser Binary
  console.log("Verifying Playwright Chromium browser installation...");
  const pwInstall = spawn(process.execPath, [pwCli, "install", "chromium"], {
    cwd: webDir,
    stdio: "inherit",
  });
  const pwCode = await new Promise((resolve) => pwInstall.on("close", (code) => resolve(code ?? 1)));
  if (pwCode !== 0) {
    console.error(`Playwright Chromium installation failed with exit code ${pwCode}`);
    process.exit(1);
  }

  // 2. Autonomously Build Next.js Production App
  console.log("Running production Next.js build...");
  const buildProc = spawn(process.execPath, [nextCli, "build", "--webpack"], {
    cwd: webDir,
    stdio: "inherit",
  });
  const buildCode = await new Promise((resolve) => buildProc.on("close", (code) => resolve(code ?? 1)));
  if (buildCode !== 0) {
    console.error(`Production build failed with exit code ${buildCode}`);
    process.exit(1);
  }

  // 3. Start Next.js Production Server on Dedicated Test Port
  console.log(`Starting Next.js production server on port ${PORT}...`);
  const serverProc = spawn(process.execPath, [nextCli, "start", "-p", String(PORT)], {
    cwd: webDir,
    stdio: "inherit",
  });

  let testExitCode = 0;

  try {
    console.log(`Waiting for health endpoint http://localhost:${PORT}/health...`);
    await waitForServer(`http://localhost:${PORT}/health`);
    console.log("Server is ready! Running committed browser test suite...");

    const specPath1 = path.resolve(__dirname, "m2-2-homepage-prototype.browser.spec.mjs");
    const specPath2 = path.resolve(__dirname, "m3-1-technical-seo.browser.spec.mjs");
    const specPath3 = path.resolve(__dirname, "blog-light-theme.browser.spec.mjs");
    const specPath4 = path.resolve(__dirname, "public-light-theme.browser.spec.mjs");
    const testProc = spawn(process.execPath, ["--test", specPath1, specPath2, specPath3, specPath4], {
      cwd: webDir,
      stdio: "inherit",
      env: { ...process.env, TEST_PORT: String(PORT) },
    });

    testExitCode = await new Promise((resolve) => testProc.on("close", (code) => resolve(code ?? 1)));
  } catch (err) {
    console.error("Browser test execution error:", err);
    testExitCode = 1;
  } finally {
    console.log(`Terminating production server on port ${PORT}...`);
    serverProc.kill("SIGTERM");
    if (serverProc.pid) {
      try {
        process.kill(serverProc.pid, "SIGKILL");
      } catch {}
    }
  }

  process.exit(testExitCode);
}

run();
