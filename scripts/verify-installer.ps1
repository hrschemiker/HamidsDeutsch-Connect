param(
  [Parameter(Mandatory)]
  [string]$InstallerPath
)

$ErrorActionPreference = 'Stop'

if (
  -not (
    Test-Path `
      -LiteralPath $InstallerPath `
      -PathType Leaf
  )
) {
  throw "Installer پیدا نشد: $InstallerPath"
}

$Signature =
  Get-AuthenticodeSignature `
    -LiteralPath $InstallerPath

$Hash =
  Get-FileHash `
    -LiteralPath $InstallerPath `
    -Algorithm SHA256

Write-Host ''
Write-Host "File: $InstallerPath"
Write-Host "SHA256: $($Hash.Hash)"
Write-Host "Signature status: $($Signature.Status)"
Write-Host ''

if (
  $Signature.Status -eq
  'NotSigned'
) {
  Write-Warning 'Installer code-signed نیست و Windows SmartScreen ممکن است هشدار نمایش دهد.'
}
