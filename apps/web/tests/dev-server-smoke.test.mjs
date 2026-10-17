import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, "..");

test("M1.2 Website Proof - Development Server Smoke Test", { timeout: 90000 }, async () => {
  const nextBin = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");
  const port = 3054;
  const devUrl = `http://127.0.0.1:${port}/design-system-preview`;

  // 1. Spawn website development server
  const server = spawn("node", [nextBin, "dev", "--webpack", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: webRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let serverOutput = "";
  server.stdout.on("data", (d) => { serverOutput += d.toString(); });
  server.stderr.on("data", (d) => { serverOutput += d.toString(); });

  const cleanup = () => {
    try {
      server.kill("SIGTERM");
    } catch {
      // ignore kill errors
    }
  };

  try {
    // Wait for server readiness (max 60 seconds)
    let ready = false;
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(devUrl);
        if (res.status === 200) {
          ready = true;
          break;
        }
      } catch {
        // server not ready yet
      }
    }

    assert.ok(ready, "Next.js dev server failed to respond with HTTP 200 on port " + port + "\nServer log:\n" + serverOutput);

    // 2. Fetch page HTML
    const res = await fetch(devUrl);
    assert.equal(res.status, 200, "Response status must be HTTP 200");

    const html = await res.text();

    // 3. Confirm expected title text is present on design-system-preview
    assert.ok(
      html.includes("BlackArrow Website Design System Proof"),
      "Page HTML must contain title 'BlackArrow Website Design System Proof'"
    );

    // 4. Confirm NO build or parsing error strings exist
    const forbiddenErrors = [
      "Build Error",
      "Module not found",
      "Can't resolve",
      "Application error",
      "Parsing CSS source code failed",
      "Unhandled Runtime Error",
    ];

    for (const errStr of forbiddenErrors) {
      assert.ok(
        !html.includes(errStr),
        `Rendered preview page must NOT contain error string: '${errStr}'`
      );
    }

    // 5. Fetch and verify production homepage (/)
    const homepageUrl = `http://127.0.0.1:${port}/`;
    const homeRes = await fetch(homepageUrl);
    assert.equal(homeRes.status, 200, "Production homepage status must be HTTP 200");

    const homeHtml = await homeRes.text();
    assert.ok(
      homeHtml.includes("BlackArrow") || homeHtml.includes("WhatsApp"),
      "Homepage HTML must contain expected product brand/hero text"
    );

    for (const errStr of forbiddenErrors) {
      assert.ok(
        !homeHtml.includes(errStr),
        `Rendered production homepage must NOT contain error string: '${errStr}'`
      );
    }
  } finally {
    cleanup();
  }
});
