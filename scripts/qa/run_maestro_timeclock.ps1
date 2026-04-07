param(
  [string]$AppId = "host.exp.exponent"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$javaHome = Join-Path $repoRoot ".tools\jre17"
$maestroBat = Join-Path $env:USERPROFILE ".maestro\bin\maestro.bat"

if (-not (Test-Path $maestroBat)) {
  Write-Error "Maestro CLI not found at $maestroBat. Install Maestro first."
}

if (-not (Test-Path (Join-Path $javaHome "bin\java.exe"))) {
  Write-Error "Portable Java not found at $javaHome. Expected .tools\\jre17."
}

$env:JAVA_HOME = $javaHome
$env:PATH = "$($env:JAVA_HOME)\bin;$($env:USERPROFILE)\.maestro\bin;$($env:PATH)"
$env:APP_ID = $AppId
$env:MAESTRO_CLI_NO_ANALYTICS = "1"

Write-Host "Using APP_ID=$AppId"
Write-Host "Using JAVA_HOME=$javaHome"

Push-Location $repoRoot
try {
  & $maestroBat test ".maestro/timeclock"
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
