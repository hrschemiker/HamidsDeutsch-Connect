param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ScriptDirectory =
  Split-Path -Parent $MyInvocation.MyCommand.Path

$ProjectRoot =
  Split-Path -Parent $ScriptDirectory

Set-Location $ProjectRoot

$Timestamp =
  Get-Date -Format 'yyyyMMdd-HHmmss'

$ReportDirectory =
  Join-Path $ProjectRoot 'release-reports'

$ReportPath =
  Join-Path $ReportDirectory "preflight-$Timestamp.txt"

New-Item `
  -ItemType Directory `
  -Path $ReportDirectory `
  -Force |
  Out-Null

$Results =
  [System.Collections.Generic.List[object]]::new()

function Add-Result {
  param(
    [Parameter(Mandatory)]
    [string]$Name,

    [Parameter(Mandatory)]
    [ValidateSet('PASS', 'WARN', 'FAIL')]
    [string]$Status,

    [Parameter(Mandatory)]
    [AllowEmptyString()]
    [string]$Details
  )

  $Results.Add(
    [PSCustomObject]@{
      Name = $Name
      Status = $Status
      Details = $Details
    }
  )
}

function Test-RequiredFile {
  param(
    [Parameter(Mandatory)]
    [string]$RelativePath
  )

  $FullPath =
    Join-Path $ProjectRoot $RelativePath

  if (Test-Path -LiteralPath $FullPath -PathType Leaf) {
    Add-Result `
      -Name "File: $RelativePath" `
      -Status PASS `
      -Details 'Found.'
  }
  else {
    Add-Result `
      -Name "File: $RelativePath" `
      -Status FAIL `
      -Details "Missing: $FullPath"
  }
}

function Invoke-CapturedCommand {
  param(
    [Parameter(Mandatory)]
    [string]$Name,

    [Parameter(Mandatory)]
    [scriptblock]$Command,

    [switch]$WarningOnly
  )

  try {
    $Output =
      & $Command 2>&1 |
      Out-String

    $ExitCode =
      $LASTEXITCODE

    if ($null -eq $ExitCode) {
      $ExitCode = 0
    }

    if ($ExitCode -eq 0) {
      $SuccessDetails =
        $Output.Trim()

      if (
        [string]::IsNullOrWhiteSpace(
          $SuccessDetails
        )
      ) {
        $SuccessDetails =
          'Command completed successfully.'
      }

      Add-Result `
        -Name $Name `
        -Status PASS `
        -Details $SuccessDetails
    }
    elseif ($WarningOnly) {
      Add-Result `
        -Name $Name `
        -Status WARN `
        -Details "Exit code $ExitCode`n$($Output.Trim())"
    }
    else {
      Add-Result `
        -Name $Name `
        -Status FAIL `
        -Details "Exit code $ExitCode`n$($Output.Trim())"
    }
  }
  catch {
    if ($WarningOnly) {
      Add-Result `
        -Name $Name `
        -Status WARN `
        -Details $_.Exception.Message
    }
    else {
      Add-Result `
        -Name $Name `
        -Status FAIL `
        -Details $_.Exception.Message
    }
  }
}

Write-Host ''
Write-Host 'HamidsDeutsch Connect — Release Preflight' -ForegroundColor Cyan
Write-Host "Project: $ProjectRoot"
Write-Host ''

$RequiredFiles = @(
  'package.json',
  'package-lock.json',
  'index.html',
  'src\App.tsx',
  'src\App.css',
  'src\electron-api.d.ts',
  'src\diagnostics\use-connection-diagnostics.ts',
  'src\settings\use-connection-settings.ts',
  'src\rescue\use-rescue-settings.ts',
  'src\servers\use-server-nodes.ts',
  'src\servers\use-server-config-check.ts',
  'electron\main.cjs',
  'electron\preload.cjs',
  'electron\engine-runtime-guard.cjs',
  'electron\sing-box-process-manager.cjs',
  'electron\sing-box-config-service.cjs',
  'electron\virtual-location-service.cjs',
  'electron\virtual-location-extension-bundle.cjs',
  'electron\windows-proxy-state.cjs',
  'electron\subscription-parser.cjs',
  'electron\subscription-inspector.cjs',
  'electron\subscription-node-cache.cjs',
  'resources\sing-box\sing-box.exe'
)

foreach ($File in $RequiredFiles) {
  Test-RequiredFile -RelativePath $File
}

Invoke-CapturedCommand `
  -Name 'Node.js version' `
  -Command { node --version }

Invoke-CapturedCommand `
  -Name 'npm version' `
  -Command { npm --version }

Invoke-CapturedCommand `
  -Name 'Git version' `
  -Command { git --version } `
  -WarningOnly

$ElectronFiles = @(
  'electron\main.cjs',
  'electron\preload.cjs',
  'electron\engine-runtime-guard.cjs',
  'electron\sing-box-process-manager.cjs',
  'electron\sing-box-config-service.cjs',
  'electron\virtual-location-service.cjs',
  'electron\virtual-location-extension-bundle.cjs',
  'electron\windows-proxy-state.cjs',
  'electron\subscription-parser.cjs',
  'electron\subscription-inspector.cjs',
  'electron\subscription-node-cache.cjs'
)

foreach ($RelativePath in $ElectronFiles) {
  $FullPath =
    Join-Path $ProjectRoot $RelativePath

  if (Test-Path -LiteralPath $FullPath -PathType Leaf) {
    Invoke-CapturedCommand `
      -Name "Syntax: $RelativePath" `
      -Command {
        node --check $FullPath
      }
  }
}

$SingBoxPath =
  Join-Path $ProjectRoot 'resources\sing-box\sing-box.exe'

if (Test-Path -LiteralPath $SingBoxPath -PathType Leaf) {
  Invoke-CapturedCommand `
    -Name 'sing-box version' `
    -Command {
      & $SingBoxPath version
    }
}

try {
  $Package =
    Get-Content `
      -LiteralPath (Join-Path $ProjectRoot 'package.json') `
      -Raw |
    ConvertFrom-Json

  $RequiredScripts = @(
    'start',
    'build',
    'dev',
    'dev:electron'
  )

  foreach ($ScriptName in $RequiredScripts) {
    $Property =
      $Package.scripts.PSObject.Properties[
        $ScriptName
      ]

    if ($null -ne $Property -and
        -not [string]::IsNullOrWhiteSpace(
          [string]$Property.Value
        )) {
      Add-Result `
        -Name "npm script: $ScriptName" `
        -Status PASS `
        -Details ([string]$Property.Value)
    }
    else {
      Add-Result `
        -Name "npm script: $ScriptName" `
        -Status FAIL `
        -Details 'Missing from package.json.'
    }
  }

  if ([string]::IsNullOrWhiteSpace([string]$Package.name)) {
    Add-Result `
      -Name 'Package name' `
      -Status FAIL `
      -Details 'package.json name is empty.'
  }
  else {
    Add-Result `
      -Name 'Package name' `
      -Status PASS `
      -Details ([string]$Package.name)
  }

  if ([string]::IsNullOrWhiteSpace([string]$Package.version)) {
    Add-Result `
      -Name 'Package version' `
      -Status FAIL `
      -Details 'package.json version is empty.'
  }
  else {
    Add-Result `
      -Name 'Package version' `
      -Status PASS `
      -Details ([string]$Package.version)
  }
}
catch {
  Add-Result `
    -Name 'package.json validation' `
    -Status FAIL `
    -Details $_.Exception.Message
}

$BundlePath =
  Join-Path $ProjectRoot 'electron\virtual-location-extension-bundle.cjs'

if (Test-Path -LiteralPath $BundlePath -PathType Leaf) {
  $BundleContent =
    Get-Content -LiteralPath $BundlePath -Raw

  foreach ($RequiredExtensionFile in @(
    'manifest.json',
    'service-worker.js',
    'content-bridge.js',
    'page-inject.js',
    'popup.html',
    'popup.js',
    'popup.css'
  )) {
    if ($BundleContent.Contains($RequiredExtensionFile)) {
      Add-Result `
        -Name "Extension bundle: $RequiredExtensionFile" `
        -Status PASS `
        -Details 'Embedded in bundle.'
    }
    else {
      Add-Result `
        -Name "Extension bundle: $RequiredExtensionFile" `
        -Status FAIL `
        -Details 'Not found in bundle.'
    }
  }
}

if (-not $SkipBuild) {
  Invoke-CapturedCommand `
    -Name 'Production build' `
    -Command {
      npm run build
    }
}
else {
  Add-Result `
    -Name 'Production build' `
    -Status WARN `
    -Details 'Skipped by -SkipBuild.'
}

$DistIndex =
  Join-Path $ProjectRoot 'dist\index.html'

if (Test-Path -LiteralPath $DistIndex -PathType Leaf) {
  Add-Result `
    -Name 'Production output' `
    -Status PASS `
    -Details "Found: $DistIndex"
}
elseif (-not $SkipBuild) {
  Add-Result `
    -Name 'Production output' `
    -Status FAIL `
    -Details 'dist\index.html was not generated.'
}
else {
  Add-Result `
    -Name 'Production output' `
    -Status WARN `
    -Details 'Not checked because build was skipped.'
}

if (Get-Command git -ErrorAction SilentlyContinue) {
  try {
    $GitRoot =
      git rev-parse --show-toplevel 2>$null

    if ($LASTEXITCODE -eq 0) {
      $GitStatus =
        git status --porcelain 2>&1 |
        Out-String

      if ([string]::IsNullOrWhiteSpace($GitStatus)) {
        Add-Result `
          -Name 'Git working tree' `
          -Status PASS `
          -Details 'Clean.'
      }
      else {
        Add-Result `
          -Name 'Git working tree' `
          -Status WARN `
          -Details "Uncommitted changes:`n$($GitStatus.Trim())"
      }
    }
    else {
      Add-Result `
        -Name 'Git repository' `
        -Status WARN `
        -Details 'Project is not inside a Git repository.'
    }
  }
  catch {
    Add-Result `
      -Name 'Git status' `
      -Status WARN `
      -Details $_.Exception.Message
  }
}

$FailCount =
  @($Results | Where-Object Status -eq FAIL).Count

$WarnCount =
  @($Results | Where-Object Status -eq WARN).Count

$PassCount =
  @($Results | Where-Object Status -eq PASS).Count

$Overall =
  if ($FailCount -gt 0) {
    'NOT READY'
  }
  elseif ($WarnCount -gt 0) {
    'READY WITH WARNINGS'
  }
  else {
    'READY'
  }

$Header = @"
HamidsDeutsch Connect — Release Preflight Report
Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss K')
Project: $ProjectRoot
Overall: $Overall
PASS: $PassCount
WARN: $WarnCount
FAIL: $FailCount
================================================================================
"@

$Lines =
  [System.Collections.Generic.List[string]]::new()

$Lines.Add($Header)

foreach ($Result in $Results) {
  $Lines.Add(
    "[$($Result.Status)] $($Result.Name)"
  )

  if (
    -not [string]::IsNullOrWhiteSpace(
      [string]$Result.Details
    )
  ) {
    $DetailText =
      [string]$Result.Details

    $DetailLines =
      $DetailText -split "`r?`n"

    foreach ($DetailLine in $DetailLines) {
      $Lines.Add(
        "    $DetailLine"
      )
    }
  }

  $Lines.Add(
    ('-' * 80)
  )
}

$Lines |
  Set-Content `
    -LiteralPath $ReportPath `
    -Encoding UTF8

Write-Host ''
$OverallColor =
  if ($FailCount -gt 0) {
    'Red'
  }
  elseif ($WarnCount -gt 0) {
    'Yellow'
  }
  else {
    'Green'
  }

Write-Host `
  "Overall: $Overall" `
  -ForegroundColor $OverallColor

Write-Host "PASS: $PassCount  WARN: $WarnCount  FAIL: $FailCount"
Write-Host "Report: $ReportPath"
Write-Host ''

$Results |
  Select-Object Status, Name, Details |
  Format-Table -AutoSize

if ($FailCount -gt 0) {
  exit 1
}

exit 0
