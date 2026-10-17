import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const rootRead = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("public web deploy tooling is isolated and does not mutate git history", () => {
  const local = rootRead("scripts/deploy-public-web.ps1");
  const remote = rootRead("scripts/deploy-public-web-remote.sh");
  const combined = `${local}\n${remote}`;

  assert.match(local, /next-public-simplification/);
  assert.match(local, /status --porcelain --untracked-files=all/);
  assert.match(remote, /npm run lint/);
  assert.match(remote, /npm run typecheck/);
  assert.match(remote, /npm run test/);
  assert.match(remote, /npm run build/);
  assert.match(remote, /pm2 startOrReload[\s\S]*--only "\$PM2_NAME"/);
  assert.match(local, /\[int\]\$PublicWebPort = 3102/);
  assert.match(local, /"PUBLIC_WEB_PORT=\$PublicWebPort"/);
  assert.match(remote, /PUBLIC_WEB_PORT="\$\{PUBLIC_WEB_PORT:-3102\}"/);
  assert.match(remote, /HEALTH_URL="http:\/\/127\.0\.0\.1:\$\{PUBLIC_WEB_PORT\}\/health"/);
  assert.doesNotMatch(combined, /git (?:add|commit|push)|deploy-live/);
});

test("private repository authentication uses a separate read-only SSH preflight", () => {
  const local = rootRead("scripts/deploy-public-web.ps1");
  const docs = rootRead("docs/public-web-production-deployment.md");

  assert.match(local, /\$localOriginUrl = \(git remote get-url origin\)\.Trim\(\)/);
  assert.match(local, /git", "fetch", "origin", \$Branch/);
  assert.doesNotMatch(local, /\$localOriginUrl\s+-notmatch/);
  assert.match(local, /\[string\]\$RemoteRepoUrl = "git@github-blackarrow:shopinqonline\/BlackArrow\.git"/);
  assert.match(local, /\$safeSshGitUrl = '\^git@/);
  assert.match(local, /git ls-remote \$RemoteRepoUrl \$expectedRef/);
  assert.match(local, /\$vpsBranchCommit -ne \$localCommit/);
  assert.match(local, /"REPO_URL=\$RemoteRepoUrl"/);
  assert.doesNotMatch(local, /"REPO_URL=\$localOriginUrl"/);
  assert.ok(local.indexOf("$preflightCommand") < local.indexOf('Run-Step "Upload reviewed public-web helper"'));
  assert.match(docs, /read-only GitHub deploy key/i);
  assert.match(docs, /Host github-blackarrow/);
  assert.doesNotMatch(`${local}\n${docs}`, /ghp_[A-Za-z0-9]+|github_pat_[A-Za-z0-9_]+|https:\/\/[^\s/@]+:[^\s/@]+@/i);
});

test("PM2 and nginx keep public, dashboard, API, and asset ownership separate", () => {
  const pm2 = rootRead("infra/pm2/public-web.ecosystem.config.cjs");
  const nginx = rootRead("infra/nginx/public-web-production.conf.example");

  assert.match(pm2, /name: "blackarrow-public-web"/);
  assert.match(pm2, /process\.env\.PUBLIC_WEB_PORT \|\| "3102"/);
  assert.match(pm2, /127\.0\.0\.1 --port \$\{publicWebPort\}/);
  assert.doesNotMatch(pm2, /name: "blackarrow"/);
  assert.match(nginx, /location \^~ \/api\//);
  assert.match(nginx, /location \^~ \/socket\.io\//);
  assert.match(nginx, /location \^~ \/_next\/static\//);
  assert.match(nginx, /location \^~ \/assets\//);
  assert.match(nginx, /location = \/health/);
  assert.match(nginx, /server 127\.0\.0\.1:3102/);
  assert.match(nginx, /location \/ \{[\s\S]*blackarrow_dashboard_backend/);
});
