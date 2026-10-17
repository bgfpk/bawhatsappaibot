param(
  [string]$Remote = "contabo",
  [string]$Branch = "main",
  [string]$RemoteRepoUrl = "git@github-blackarrow:shopinqonline/BlackArrow.git",
  [int]$PublicWebPort = 3102,
  [string]$PublicWebRoot = "/root/blackarrow-public-web",
  [string]$RemoteScript = "/tmp/blackarrow-deploy-public-web.sh"
)

# Reference for fallback branch: next-public-simplification
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot
$env:GIT_TERMINAL_PROMPT = "0"
$env:GCM_INTERACTIVE = "Never"

function Run-Step {
  param([string]$Title, [string[]]$Command)
  Write-Host "`n==> $Title" -ForegroundColor Cyan
  $executable = $Command[0]
  $arguments = @()
  if ($Command.Count -gt 1) {
    $arguments = $Command[1..($Command.Count - 1)]
  }
  & $executable @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Title failed with exit code $LASTEXITCODE."
  }
}

foreach ($command in @("git", "ssh", "scp")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$command was not found on PATH."
  }
}

Write-Host "==> Validating repository state and parameters" -ForegroundColor Cyan

$currentBranch = (git branch --show-current).Trim()
if ($currentBranch -ne $Branch) {
  throw "Refusing deployment from '$currentBranch'; expected '$Branch'."
}

$status = @(git status --porcelain --untracked-files=all)
if ($status.Count -gt 0) {
  throw "Refusing deployment from a dirty local worktree.`n$($status -join [Environment]::NewLine)"
}

Run-Step "Fetch approved public-web branch" @("git", "fetch", "origin", $Branch)
$localCommit = (git rev-parse HEAD).Trim()
$remoteCommit = (git rev-parse "origin/$Branch").Trim()
if ($localCommit -ne $remoteCommit) {
  throw "Local HEAD $localCommit does not match origin/$Branch $remoteCommit. Push separately, review, then retry."
}

$localOriginUrl = (git remote get-url origin).Trim()
if (-not $localOriginUrl) {
  throw "Local origin URL could not be resolved."
}

$safeSshGitUrl = '^git@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?:[A-Za-z0-9._-]+/[A-Za-z0-9._-]+\.git$'
if ($RemoteRepoUrl -notmatch $safeSshGitUrl -or
    $Remote -notmatch '^[A-Za-z0-9._-]+$' -or
    $Branch -notmatch '^[A-Za-z0-9._/-]+$' -or
    $PublicWebPort -lt 1024 -or $PublicWebPort -gt 65535 -or
    $PublicWebRoot -notmatch '^/[A-Za-z0-9._/-]+$' -or
    $RemoteScript -notmatch '^/[A-Za-z0-9._/-]+$' -or
    $localCommit -notmatch '^[0-9a-f]{40}$') {
  throw "Deployment parameters contain unsupported shell characters."
}

$helper = Join-Path $PSScriptRoot "deploy-public-web-remote.sh"
if (-not (Test-Path -LiteralPath $helper)) {
  throw "Remote deployment helper is missing: $helper"
}

Write-Host "`n==> Verify VPS read-only GitHub access" -ForegroundColor Cyan
$expectedRef = "refs/heads/$Branch"
$preflightCommand = "git ls-remote $RemoteRepoUrl $expectedRef"
$preflightOutput = @(& ssh $Remote $preflightCommand)
if ($LASTEXITCODE -ne 0) {
  throw "VPS GitHub access preflight failed with exit code $LASTEXITCODE."
}

$preflightMatches = @($preflightOutput | Where-Object { $_ -match "^([0-9a-f]{40})\s+$([regex]::Escape($expectedRef))$" })
if ($preflightMatches.Count -ne 1) {
  throw "VPS GitHub access preflight did not return exactly one SHA for $expectedRef."
}
$vpsBranchCommit = ($preflightMatches[0] -split '\s+')[0].ToLowerInvariant()
if ($vpsBranchCommit -ne $localCommit) {
  throw "VPS GitHub branch SHA $vpsBranchCommit does not match expected commit $localCommit."
}
Write-Host "Verified VPS branch commit: $vpsBranchCommit" -ForegroundColor DarkGray

Run-Step "Upload reviewed public-web helper" @("scp", $helper, "${Remote}:${RemoteScript}")
$environment = @(
  "REPO_URL=$RemoteRepoUrl",
  "BRANCH=$Branch",
  "PUBLIC_WEB_PORT=$PublicWebPort",
  "PUBLIC_WEB_ROOT=$PublicWebRoot",
  "EXPECTED_COMMIT=$localCommit"
) -join " "
$remoteCommand = "chmod 700 $RemoteScript && $environment bash $RemoteScript"
Run-Step "Deploy only blackarrow-public-web" @("ssh", $Remote, $remoteCommand)

Write-Host "`nPublic web deployment to VPS completed successfully." -ForegroundColor Green
