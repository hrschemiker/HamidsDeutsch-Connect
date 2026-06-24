param(
  [switch]$SkipPreflight
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptDirectory =
  Split-Path -Parent $MyInvocation.MyCommand.Path

$ProjectRoot =
  Split-Path -Parent $ScriptDirectory

Set-Location $ProjectRoot

if (-not $SkipPreflight) {
  Write-Host ''
  Write-Host 'Running release preflight...' -ForegroundColor Cyan

  powershell `
    -ExecutionPolicy Bypass `
    -File .\scripts\release-preflight.ps1

  if ($LASTEXITCODE -ne 0) {
    throw 'Preflight failed. Installer build was cancelled.'
  }
}

Write-Host ''
Write-Host 'Building Windows x64 installer...' -ForegroundColor Cyan

npm run dist:win

if ($LASTEXITCODE -ne 0) {
  throw 'ساخت فایل نصبی ناموفق بود.'
}

$ReleaseDirectory =
  Join-Path $ProjectRoot 'release'

$Installer =
  Get-ChildItem `
    -LiteralPath $ReleaseDirectory `
    -Filter 'HamidsDeutsch-Connect-Setup-*-x64.exe' `
    -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($null -eq $Installer) {
  throw 'فایل Setup در پوشه release پیدا نشد.'
}

$Hash =
  Get-FileHash `
    -LiteralPath $Installer.FullName `
    -Algorithm SHA256

$HashFile =
  "$($Installer.FullName).sha256.txt"

@(
  "File: $($Installer.Name)"
  "SHA256: $($Hash.Hash)"
  "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')"
) |
  Set-Content `
    -LiteralPath $HashFile `
    -Encoding UTF8

Write-Host ''
Write-Host 'Installer build completed.' -ForegroundColor Green
Write-Host "Setup: $($Installer.FullName)"
Write-Host "SHA256: $($Hash.Hash)"
Write-Host "Hash file: $HashFile"
Write-Host ''
