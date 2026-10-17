import { execSync } from "child_process";
import { build as buildServer } from "esbuild";
import { build as buildFrontend } from "vite";

// Run deployment disk preflight guard when building on Linux/VPS
if (process.platform === "linux") {
  try {
    const dfOutput = execSync("df -BG / | tail -1", { encoding: "utf8" });
    const parts = dfOutput.trim().split(/\s+/);
    const availGb = parseInt(parts[3]?.replace("G", "") || "0", 10);
    const usedPct = parseInt(parts[4]?.replace("%", "") || "0", 10);
    const freePct = 100 - usedPct;

    if (availGb < 10 || freePct < 15) {
      console.error(`[BUILD PREFLIGHT BLOCKED] Insufficient disk space: ${availGb} GB available (${freePct}% free). Threshold is >= 10 GB and >= 15% free.`);
      process.exit(15);
    }
  } catch (err) {
    console.warn("[BUILD PREFLIGHT WARNING] Could not verify disk capacity:", err.message);
  }
}

await buildFrontend();

await buildServer({
  entryPoints: ["server.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  packages: "external",
  sourcemap: true,
  outfile: "dist/server.cjs",
});
