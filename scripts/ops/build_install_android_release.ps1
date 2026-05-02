param(
  [string]$RepoRoot = "",
  [string]$DeviceA = "KNMVMVGY89NFHAQ4",
  [string]$DeviceB = "R5CX15JX98E"
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
$androidDir = Join-Path $repo "android"

if (-not (Test-Path $androidDir)) {
  throw "Android directory not found: $androidDir"
}

$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "C:\Users\XyZ\AppData\Local\Android\Sdk"
$env:ANDROID_SDK_ROOT = "C:\Users\XyZ\AppData\Local\Android\Sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\cmdline-tools\latest\bin;$env:PATH"

$localProps = Join-Path $androidDir "local.properties"
Set-Content -Path $localProps -Value "sdk.dir=C:\\Users\\XyZ\\AppData\\Local\\Android\\Sdk"

$adb = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
$apk = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"

Write-Output "=== YASA Android Release Build + Install ==="
Write-Output ("Repo: {0}" -f $repo)
Write-Output ("Android dir: {0}" -f $androidDir)
Write-Output ("Device A: {0}" -f $DeviceA)
Write-Output ("Device B: {0}" -f $DeviceB)
Write-Output ""

Push-Location $androidDir
try {
  Write-Output "[1/3] assembleRelease ..."
  & .\gradlew.bat assembleRelease
  if ($LASTEXITCODE -ne 0) {
    throw "Gradle build failed with exit code $LASTEXITCODE"
  }

  if (-not (Test-Path $apk)) {
    throw "APK not found: $apk"
  }

  Write-Output ""
  Write-Output "[2/3] install on Device A ..."
  & $adb -s $DeviceA install -r $apk
  if ($LASTEXITCODE -ne 0) {
    throw "Install failed on Device A ($DeviceA)"
  }

  Write-Output ""
  Write-Output "[3/3] install on Device B ..."
  & $adb -s $DeviceB install -r $apk
  if ($LASTEXITCODE -ne 0) {
    throw "Install failed on Device B ($DeviceB)"
  }

  Write-Output ""
  Write-Output "DONE: Build + install successful on both devices."
}
finally {
  Pop-Location
}
