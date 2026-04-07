param(
  [string]$RepoRoot = "",
  [string]$TaskName = "YASA-Session-AutoCheckpoint",
  [int]$Minutes = 15
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  param([string]$InputRoot)
  if ($InputRoot -and (Test-Path $InputRoot)) {
    return (Resolve-Path $InputRoot).Path
  }
  return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$repo = Resolve-RepoRoot -InputRoot $RepoRoot
$checkpointScript = Join-Path $repo "scripts\ops\save_session_checkpoint.ps1"
$shellExe = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"

if (-not (Test-Path $shellExe)) {
  throw "Windows PowerShell nicht gefunden unter '$shellExe'."
}
if (-not (Test-Path $checkpointScript)) {
  throw "Checkpoint-Script nicht gefunden: $checkpointScript"
}

$taskCmd = $shellExe + " -NoProfile -ExecutionPolicy Bypass -File " + $checkpointScript + " -Silent"

function Invoke-SchtasksCreate {
  param(
    [string]$Name,
    [string[]]$ExtraArgs
  )
  $extra = ($ExtraArgs -join " ")
  $cmd = "schtasks /Create /TN `"$Name`" /TR `"$taskCmd`" $extra /F"
  cmd.exe /c $cmd | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "schtasks /Create failed for '$Name' with exit code $LASTEXITCODE."
  }
}

# Interval trigger (every N minutes)
Invoke-SchtasksCreate -Name $TaskName -ExtraArgs @("/SC", "MINUTE", "/MO", "$Minutes")

# Additional logon trigger as separate task for immediate safety after reboot/login
$logonTaskName = "$TaskName-Logon"
$logonInstalled = $true
try {
  Invoke-SchtasksCreate -Name $logonTaskName -ExtraArgs @("/SC", "ONLOGON")
} catch {
  $logonInstalled = $false
}

Write-Output "Scheduled task installed:"
Write-Output ("- Task: {0}" -f $TaskName)
if ($logonInstalled) {
  Write-Output ("- Logon task: {0}" -f $logonTaskName)
} else {
  Write-Output ("- Logon task: not installed (access denied on this host)")
}
Write-Output ("- Interval: every {0} minutes + at logon" -f $Minutes)
Write-Output ("- Script: {0}" -f $checkpointScript)
