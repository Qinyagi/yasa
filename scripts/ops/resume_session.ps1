param(
  [string]$RepoRoot = ""
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
$latestPath = Join-Path $repo "docs\ops\session_latest.md"
$archiveDir = Join-Path $repo "docs\ops\session_archive"

Write-Output "=== YASA Resume ==="
Write-Output ("Repo: {0}" -f $repo)
Write-Output ("Branch: {0}" -f ((Run-Git -Repo $repo -GitArgs @("branch", "--show-current")) -join " "))
Write-Output ""
Write-Output "Git status:"
Write-Output ((Run-Git -Repo $repo -GitArgs @("status", "-sb")) -join "`n")

if (Test-Path $latestPath) {
  Write-Output ""
  Write-Output ("Latest checkpoint: {0}" -f $latestPath)
  Write-Output ("LastWriteTime: {0}" -f (Get-Item $latestPath).LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"))
}

if (Test-Path $archiveDir) {
  $lastArchive = Get-ChildItem -File $archiveDir | Sort-Object LastWriteTime -Descending | Select-Object -First 3
  if ($lastArchive) {
    Write-Output ""
    Write-Output "Recent archives:"
    $lastArchive | ForEach-Object {
      Write-Output ("- {0} ({1})" -f $_.Name, $_.LastWriteTime.ToString("yyyy-MM-dd HH:mm:ss"))
    }
  }
}
