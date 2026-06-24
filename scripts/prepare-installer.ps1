param(
  [string]$Version = '1.0.0'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptDirectory =
  Split-Path -Parent $MyInvocation.MyCommand.Path

$ProjectRoot =
  Split-Path -Parent $ScriptDirectory

Set-Location $ProjectRoot

$PackagePath =
  Join-Path $ProjectRoot 'package.json'

if (
  -not (
    Test-Path `
      -LiteralPath $PackagePath `
      -PathType Leaf
  )
) {
  throw "package.json پیدا نشد: $PackagePath"
}

$Package =
  Get-Content `
    -LiteralPath $PackagePath `
    -Raw |
  ConvertFrom-Json

$Package.name =
  'hamidsdeutsch-connect'

$Package |
  Add-Member `
    -NotePropertyName productName `
    -NotePropertyValue 'HamidsDeutsch Connect' `
    -Force

$Package |
  Add-Member `
    -NotePropertyName description `
    -NotePropertyValue 'Secure Windows VPN client powered by sing-box.' `
    -Force

$Package |
  Add-Member `
    -NotePropertyName author `
    -NotePropertyValue 'HamidsDeutsch' `
    -Force

$Package |
  Add-Member `
    -NotePropertyName main `
    -NotePropertyValue 'electron/main.cjs' `
    -Force

if (
  [string]::IsNullOrWhiteSpace(
    [string]$Package.version
  ) -or
  [string]$Package.version -eq '0.0.0'
) {
  $Package.version =
    $Version
}

if ($null -eq $Package.scripts) {
  $Package |
    Add-Member `
      -NotePropertyName scripts `
      -NotePropertyValue ([PSCustomObject]@{}) `
      -Force
}

$Package.scripts |
  Add-Member `
    -NotePropertyName 'dist:win' `
    -NotePropertyValue 'npm run build && electron-builder --config electron-builder.yml --win nsis --x64' `
    -Force

$Package.scripts |
  Add-Member `
    -NotePropertyName 'pack:win' `
    -NotePropertyValue 'npm run build && electron-builder --config electron-builder.yml --win dir --x64' `
    -Force

$Package.scripts |
  Add-Member `
    -NotePropertyName 'release:check' `
    -NotePropertyValue 'powershell -ExecutionPolicy Bypass -File .\scripts\release-preflight.ps1' `
    -Force

$Package |
  ConvertTo-Json -Depth 100 |
  Set-Content `
    -LiteralPath $PackagePath `
    -Encoding UTF8

$BuildDirectory =
  Join-Path $ProjectRoot 'build'

New-Item `
  -ItemType Directory `
  -Path $BuildDirectory `
  -Force |
Out-Null

$SourceIcon =
  Join-Path $ScriptDirectory 'icon.ico'

$TargetIcon =
  Join-Path $BuildDirectory 'icon.ico'

if (
  -not (
    Test-Path `
      -LiteralPath $SourceIcon `
      -PathType Leaf
  )
) {
  throw "فایل icon.ico کنار اسکریپت آماده‌سازی پیدا نشد."
}

Copy-Item `
  -LiteralPath $SourceIcon `
  -Destination $TargetIcon `
  -Force

$BuilderConfigSource =
  Join-Path $ScriptDirectory 'electron-builder.yml'

$BuilderConfigTarget =
  Join-Path $ProjectRoot 'electron-builder.yml'

Copy-Item `
  -LiteralPath $BuilderConfigSource `
  -Destination $BuilderConfigTarget `
  -Force

$SingBoxPath =
  Join-Path $ProjectRoot 'resources\sing-box\sing-box.exe'

if (
  -not (
    Test-Path `
      -LiteralPath $SingBoxPath `
      -PathType Leaf
  )
) {
  throw "sing-box.exe پیدا نشد: $SingBoxPath"
}

Write-Host ''
Write-Host 'Installing electron-builder...' -ForegroundColor Cyan

npm install `
  --save-dev `
  electron-builder

if ($LASTEXITCODE -ne 0) {
  throw 'نصب electron-builder ناموفق بود.'
}

Write-Host ''
Write-Host 'Installer preparation completed.' -ForegroundColor Green
Write-Host "Version: $($Package.version)"
Write-Host "Config: $BuilderConfigTarget"
Write-Host "Icon: $TargetIcon"
Write-Host ''
Write-Host 'Next command:'
Write-Host 'powershell -ExecutionPolicy Bypass -File .\scripts\build-installer.ps1'
