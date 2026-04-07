param(
  [string]$RepoRoot = "",
  [switch]$Silent
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  param([string]$InputRoot)
  if ($InputRoot -and (Test-Path $InputRoot)) {
    return (Resolve-Path $InputRoot).Path
  }
  return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Run-Git {
  param(
    [string]$Repo,
    [string[]]$GitArgs
  )
  $safeArg = "safe.directory=$Repo"
  return (& git -c "core.excludesfile=" -c $safeArg -C $Repo @GitArgs 2>$null)
}

$repo = Resolve-RepoRoot -InputRoot $RepoRoot
$timestamp = Get-Date
$stampIso = $timestamp.ToString("yyyy-MM-dd HH:mm:ss")
$stampFile = $timestamp.ToString("yyyyMMdd_HHmmss")

$opsDir = Join-Path $repo "docs\ops"
$archiveDir = Join-Path $opsDir "session_archive"
$latestPath = Join-Path $opsDir "session_latest.md"
$archivePath = Join-Path $archiveDir ("session_{0}.md" -f $stampFile)

New-Item -ItemType Directory -Force $archiveDir | Out-Null

$branch = (Run-Git -Repo $repo -GitArgs @("branch", "--show-current")) -join "`n"
$statusShort = (Run-Git -Repo $repo -GitArgs @("status", "-sb")) -join "`n"
$statusPorcelainLines = @(Run-Git -Repo $repo -GitArgs @("status", "--porcelain=v1"))
$lastCommits = (Run-Git -Repo $repo -GitArgs @("log", "--oneline", "-n", "8")) -join "`n"

$modified = @()
$untracked = @()
foreach ($line in $statusPorcelainLines) {
  if ([string]::IsNullOrWhiteSpace($line)) { continue }
  if ($line.StartsWith("?? ")) {
    $untracked += $line.Substring(3)
  } else {
    $modified += $line.Substring(3)
  }
}

$qaLatest = Join-Path $repo "reports\kilo\QA_review_latest.md"
$currentState = Join-Path $repo "docs\ai\CURRENT_STATE.md"
$roadmap = Join-Path $repo "docs\ai\NEXT_SESSION_ROADMAP_2026-03-24.md"

$qaTime = if (Test-Path $qaLatest) { (Get-Item $qaLatest).LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss") } else { "N/A" }
$stateTime = if (Test-Path $currentState) { (Get-Item $currentState).LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss") } else { "N/A" }
$roadmapTime = if (Test-Path $roadmap) { (Get-Item $roadmap).LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss") } else { "N/A" }

$contentLines = @(
  "# YASA Session Checkpoint"
  ""
  "## Metadata"
  "- Timestamp: $stampIso"
  "- Repo: $repo"
  "- Branch: $branch"
  ""
  "## Working Tree"
  "- Modified/Deleted/Renamed files: $($modified.Count)"
  "- Untracked files: $($untracked.Count)"
  ""
  "### Git Status (git status -sb)"
  '```text'
  $statusShort
  '```'
  ""
  "### Last Commits"
  '```text'
  $lastCommits
  '```'
  ""
  "## Tracked Reference Docs"
  "- reports/kilo/QA_review_latest.md last updated: $qaTime"
  "- docs/ai/CURRENT_STATE.md last updated: $stateTime"
  "- docs/ai/NEXT_SESSION_ROADMAP_2026-03-24.md last updated: $roadmapTime"
  ""
  "## Modified Files"
  '```text'
  ($modified -join "`n")
  '```'
  ""
  "## Untracked Files"
  '```text'
  ($untracked -join "`n")
  '```'
)
$content = $contentLines -join "`r`n"

Set-Content -Path $latestPath -Value $content -Encoding UTF8
Set-Content -Path $archivePath -Value $content -Encoding UTF8

if (-not $Silent) {
  Write-Output "Checkpoint written:"
  Write-Output "  Latest:  $latestPath"
  Write-Output "  Archive: $archivePath"
}
