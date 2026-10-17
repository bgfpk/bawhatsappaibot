param(
  [string]$Message = "deploy: sync local changes before VPS deploy",
  [string]$Remote = "contabo",
  [string]$Branch = "main",
  [string]$RemoteAppDir = "/root/blackarrow",
  [string]$RemoteDeployScript = "/tmp/blackarrow-deploy.sh",
  [switch]$SkipLocalChecks,
  [switch]$DryRun,
  [switch]$StopBeforePush
)

$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$GitInstallDirs = @(
  "C:\Program Files\Git\cmd",
  "C:\Program Files\Git\bin"
)

foreach ($GitInstallDir in $GitInstallDirs) {
  if ((Test-Path $GitInstallDir) -and (-not (($env:PATH -split ';') -contains $GitInstallDir))) {
    $env:PATH = "$GitInstallDir;$env:PATH"
  }
}

$GitCommand = Get-Command git -ErrorAction SilentlyContinue
if (-not $GitCommand) {
  throw "git was not found on PATH. Install Git for Windows or add it to PATH first."
}

$env:GIT_TERMINAL_PROMPT = "0"
$env:GCM_INTERACTIVE = "Never"

# OneDrive can briefly lock .git object files on Windows.
# For this deploy run, disable Git auto maintenance so commit/push does not trigger
# interactive object cleanup prompts such as "Deletion of directory '.git/objects/00' failed".
$GitConfigArgs = @("-c", "gc.auto=0", "-c", "maintenance.auto=false")

$NodeInstallDirs = @(
  "C:\Program Files\nodejs",
  "C:\Program Files (x86)\nodejs"
)

foreach ($NodeInstallDir in $NodeInstallDirs) {
  if ((Test-Path $NodeInstallDir) -and (-not (($env:PATH -split ';') -contains $NodeInstallDir))) {
    $env:PATH = "$NodeInstallDir;$env:PATH"
  }
}

$BundledNodeDir = Join-Path $env:USERPROFILE ".codex-tools\node-v24.14.0-win-x64"
$BundledNode = Join-Path $BundledNodeDir "node.exe"
$BundledNpm = Join-Path $BundledNodeDir "npm.cmd"

function Resolve-UsableCommand {
  param(
    [string]$Name,
    [string[]]$CandidatePaths
  )

  foreach ($CandidatePath in $CandidatePaths) {
    if (-not $CandidatePath) {
      continue
    }

    if (Test-Path $CandidatePath) {
      return $CandidatePath
    }
  }

  $Command = Get-Command $Name -ErrorAction SilentlyContinue
  if ($Command -and $Command.Source) {
    return $Command.Source
  }

  return $null
}

$NodeCommand = Resolve-UsableCommand -Name "node" -CandidatePaths @(
  "C:\Program Files\nodejs\node.exe",
  "C:\Program Files (x86)\nodejs\node.exe",
  $BundledNode
)

if (-not $NodeCommand) {
  throw "node was not found. Checked common Node.js install paths and bundled node at $BundledNode."
}

if ($NodeCommand -eq $BundledNode -and (Test-Path $BundledNodeDir)) {
  $env:PATH = "$BundledNodeDir;$env:PATH"
}

$NpmCommand = Resolve-UsableCommand -Name "npm" -CandidatePaths @(
  "C:\Program Files\nodejs\npm.cmd",
  "C:\Program Files (x86)\nodejs\npm.cmd",
  $BundledNpm
)

if (-not $NpmCommand) {
  $NpmCommand = "(not found)"
}

function Format-Command {
  param([string[]]$Command)

  return ($Command | ForEach-Object {
    if ($_ -match '\s') {
      '"' + ($_.Replace('"', '\"')) + '"'
    } else {
      $_
    }
  }) -join " "
}

function Get-GitCommand {
  param([string[]]$GitArgs)

  return @("git") + $GitConfigArgs + $GitArgs
}

function Invoke-GitCapture {
  param([string[]]$GitArgs)

  $output = & git @GitConfigArgs @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed with exit code $LASTEXITCODE."
  }
  return $output
}

function Run-Step {
  param(
    [string]$Title,
    [string[]]$Command,
    [switch]$CaptureOutput
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  Write-Host (Format-Command $Command) -ForegroundColor DarkGray

  if (-not $DryRun) {
    $exe = $Command[0]
    $args = @()
    if ($Command.Count -gt 1) {
      $args = $Command[1..($Command.Count - 1)]
    }
    if ($CaptureOutput) {
      $stdoutFile = [System.IO.Path]::GetTempFileName()
      $stderrFile = [System.IO.Path]::GetTempFileName()
      try {
        $process = Start-Process -FilePath $exe -ArgumentList $args -WorkingDirectory $RepoRoot -NoNewWindow -Wait -PassThru -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile
        $stdoutText = if (Test-Path $stdoutFile) { Get-Content -LiteralPath $stdoutFile -Raw } else { "" }
        $stderrText = if (Test-Path $stderrFile) { Get-Content -LiteralPath $stderrFile -Raw } else { "" }
        $output = @()
        if ($stdoutText) {
          $output += ($stdoutText -split "`r?`n")
        }
        if ($stderrText) {
          $output += ($stderrText -split "`r?`n")
        }
        $output = $output | Where-Object { $_ -ne "" }
        if ($process.ExitCode -ne 0) {
          throw "$Title failed with exit code $($process.ExitCode).`n$($output -join [Environment]::NewLine)"
        }
        return $output
      } finally {
        Remove-Item $stdoutFile, $stderrFile -ErrorAction SilentlyContinue
      }
    }

    & $exe @args
    if ($LASTEXITCODE -ne 0) {
      throw "$Title failed with exit code $LASTEXITCODE."
    }
  }
}

function New-LfNormalizedTempFile {
  param(
    [string]$SourcePath,
    [string]$Label
  )

  if (-not (Test-Path $SourcePath)) {
    throw "$Label was not found at $SourcePath."
  }

  $content = [System.IO.File]::ReadAllText($SourcePath)
  $normalized = $content -replace "`r`n", "`n"
  $normalized = $normalized -replace "`r", "`n"
  $tempPath = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
  [System.IO.File]::WriteAllText($tempPath, $normalized, [System.Text.UTF8Encoding]::new($false))
  return $tempPath
}

function Ensure-Remote {
  param(
    [string]$Name,
    [string]$Url
  )

  $existingUrl = ""
  try {
    $existingUrl = ((Invoke-GitCapture -GitArgs @("remote", "get-url", $Name)) | Out-String).Trim()
  } catch {
    $existingUrl = ""
  }

  if (-not $existingUrl) {
    Run-Step "Add git remote $Name" (Get-GitCommand @("remote", "add", $Name, $Url))
    return
  }

  if ($existingUrl -ne $Url) {
    Run-Step "Update git remote $Name" (Get-GitCommand @("remote", "set-url", $Name, $Url))
  }
}

$EnvFile = Join-Path $RepoRoot ".env"
if (-not (Test-Path $EnvFile)) {
  throw "Local .env file was not found at $EnvFile."
}
$RemoteScriptLocalPath = Join-Path $RepoRoot "scripts\deploy-live-remote.sh"
if (-not (Test-Path $RemoteScriptLocalPath)) {
  throw "Remote deploy script was not found at $RemoteScriptLocalPath."
}

$CurrentBranch = ((Invoke-GitCapture -GitArgs @("branch", "--show-current")) | Out-String).Trim()
if ($CurrentBranch -ne $Branch) {
  throw "You are on '$CurrentBranch', but live deploy pulls '$Branch'. Switch to '$Branch' first, or pass -Branch $CurrentBranch intentionally."
}

Write-Host ""
Write-Host "==> Toolchain" -ForegroundColor Cyan
Write-Host ("Node command: " + $NodeCommand) -ForegroundColor DarkGray
Write-Host ("npm command:  " + $NpmCommand) -ForegroundColor DarkGray
Write-Host "Git deploy safety: auto gc disabled for this run with 'git -c gc.auto=0 -c maintenance.auto=false ...'" -ForegroundColor DarkGray
Write-Host "OneDrive note: Git object files can be locked under OneDrive on Windows. This deploy run avoids auto cleanup prompts, but moving the repo outside OneDrive later is still recommended." -ForegroundColor Yellow

$TypeCheckCommand = @($NodeCommand, ".\node_modules\typescript\bin\tsc", "--noEmit")
$BuildCommand = @($NodeCommand, ".\scripts\build.mjs")

if (-not $SkipLocalChecks) {
  Run-Step "Type-check locally" $TypeCheckCommand
  Run-Step "Build locally" $BuildCommand
}

Run-Step "Git status" (Get-GitCommand @("status", "--short", "--branch"))
Run-Step "Local commit" (Get-GitCommand @("log", "-1", "--oneline"))

if ($StopBeforePush) {
  Write-Host ""
  Write-Host "==> StopBeforePush set. Stopping before staging, commit, push, and VPS deploy." -ForegroundColor Yellow
  exit 0
}

$StatusLines = @(Invoke-GitCapture -GitArgs @("status", "--porcelain"))
$HasChanges = $StatusLines.Count -gt 0
if ($HasChanges) {
  Run-Step "Stage changes" (Get-GitCommand @("add", "-A"))
  & git @GitConfigArgs diff --cached --quiet
  $HasStagedChanges = $LASTEXITCODE -ne 0
  if ($HasStagedChanges) {
    Run-Step "Commit changes" (Get-GitCommand @("commit", "-m", $Message))
  } else {
    Write-Host ""
    Write-Host "==> Local changes normalized to no staged diff. Skipping local commit and continuing to push/deploy checks." -ForegroundColor Cyan
  }
} else {
  Write-Host ""
  Write-Host "==> No local changes to commit. Skipping local commit and continuing to push/deploy checks." -ForegroundColor Cyan
}

$BridgeRemoteName = "contabo-deploy"
$BridgeRemoteUrl = "${Remote}:/root/blackarrow.git"
$PushedViaBridge = $false

try {
  Run-Step "Push to origin/$Branch" (Get-GitCommand @("push", "origin", "HEAD:$Branch"))
} catch {
  Write-Host ""
  Write-Host "==> Direct push to origin failed. Falling back to VPS bridge remote." -ForegroundColor Yellow
  Write-Host $_.Exception.Message -ForegroundColor DarkYellow

  Ensure-Remote -Name $BridgeRemoteName -Url $BridgeRemoteUrl
  Run-Step "Push to $BridgeRemoteName/$Branch" (Get-GitCommand @("push", $BridgeRemoteName, "HEAD:$Branch"))

  $RemoteGitSyncCommand = "cd '$RemoteAppDir' && git fetch '/root/blackarrow.git' 'refs/heads/$Branch' && git push origin FETCH_HEAD:refs/heads/$Branch"
  Run-Step "Sync VPS bridge commit to origin/$Branch" @("ssh", $Remote, $RemoteGitSyncCommand)
  $PushedViaBridge = $true
}

if ($PushedViaBridge) {
  Write-Host ""
  Write-Host "==> GitHub sync completed through VPS bridge" -ForegroundColor Cyan
}
Run-Step "Upload .env to VPS" @("scp", $EnvFile, "${Remote}:${RemoteAppDir}/.env")
$LocalCommit = ((Invoke-GitCapture -GitArgs @("rev-parse", "HEAD")) | Out-String).Trim()
$NormalizedRemoteScript = New-LfNormalizedTempFile -SourcePath $RemoteScriptLocalPath -Label "Remote deploy script"
try {
  Run-Step "Upload LF-normalized remote deploy script" @("scp", $NormalizedRemoteScript, "${Remote}:${RemoteDeployScript}")
} finally {
  Remove-Item -LiteralPath $NormalizedRemoteScript -ErrorAction SilentlyContinue
}
$RemoteCommand = "command -v bash >/dev/null 2>&1 || { echo 'DEPLOY_BLOCKED=bash_not_found'; echo 'Install bash on the VPS before running deploy.'; exit 127; }; chmod +x '$RemoteDeployScript' && bash -n '$RemoteDeployScript' || { echo 'DEPLOY_BLOCKED=remote_script_invalid'; echo 'Remote deploy script failed bash syntax check. Check LF line endings and script syntax.'; exit 126; }; APP_DIR='$RemoteAppDir' PM2_NAME='blackarrow' BRANCH='$Branch' DOMAIN='https://blackarrow-source.offline.invalid' EXPECTED_COMMIT='$LocalCommit' bash '$RemoteDeployScript'"
$RemoteOutput = Run-Step "Deploy on VPS" @("ssh", $Remote, $RemoteCommand) -CaptureOutput

Write-Host ""
Write-Host "==> Remote verification summary" -ForegroundColor Cyan
($RemoteOutput | Where-Object { $_ -match '^(REMOTE_HEAD_BEFORE|REMOTE_BRANCH_HEAD|REMOTE_HEAD_AFTER_PULL|PM2_EXEC_CWD|PM2_EXEC_PATH|PM2_ARGS|LOCAL_ASSET_JS|LOCAL_ASSET_CSS|LOCAL_ASSET_JS_SHA256|SERVED_ASSET_PATH)=' }) | ForEach-Object {
  Write-Host $_ -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "Live deploy finished: https://blackarrow-source.offline.invalid" -ForegroundColor Green
