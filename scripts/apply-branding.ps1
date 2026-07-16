<#
    apply-branding.ps1 — install the Manfaz VPN logo + banner into the app.

    Usage (from the project root):
        pwsh ./scripts/apply-branding.ps1 -Logo "C:\path\to\manfaz-logo.png" -Banner "C:\path\to\manfaz-banner.png"

    It copies:
      - <Logo>   -> public/logo.png         (in-app logo, shown in the header and orbit)
      - <Logo>   -> build/icon.ico (256px)  (Windows app / installer icon)
      - <Banner> -> public/banner.png       (home-screen promo banner)

    After running it, rebuild:  npm run dist:win
#>
param(
    [Parameter(Mandatory = $true)][string]$Logo,
    [Parameter(Mandatory = $true)][string]$Banner
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if (-not (Test-Path $Logo))   { throw "Logo not found: $Logo" }
if (-not (Test-Path $Banner)) { throw "Banner not found: $Banner" }

# In-app logo (kept as-is, transparent PNG expected)
Copy-Item $Logo (Join-Path $root 'public/logo.png') -Force
Write-Host "-> public/logo.png"

# Home promo banner
Copy-Item $Banner (Join-Path $root 'public/banner.png') -Force
Write-Host "-> public/banner.png"

# Windows icon: proper multi-size ICO with 32-bit BMP/DIB frames (the format
# electron-builder and Windows accept natively — no network/tool needed).
$src = [System.Drawing.Image]::FromFile($Logo)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = @()
foreach ($s in $sizes) {
    $bmp = New-Object System.Drawing.Bitmap $s, $s
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($src, 0, 0, $s, $s); $g.Dispose()
    $rect = New-Object System.Drawing.Rectangle 0, 0, $s, $s
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $data.Stride; $buf = New-Object byte[] ($stride * $s)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $buf.Length)
    $bmp.UnlockBits($data); $bmp.Dispose()
    $xor = New-Object byte[] ($s * $s * 4)
    for ($y = 0; $y -lt $s; $y++) { [Array]::Copy($buf, ($s - 1 - $y) * $stride, $xor, $y * $s * 4, $s * 4) }
    $andRow = [int][Math]::Floor((($s + 31) / 32)) * 4
    $and = New-Object byte[] ($andRow * $s)
    $frames += , @{ size = $s; xor = $xor; and = $and }
}
$src.Dispose()
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$frames.Count)
$offset = 6 + 16 * $frames.Count
foreach ($f in $frames) {
    $dib = 40 + $f.xor.Length + $f.and.Length
    $w = if ($f.size -ge 256) { 0 } else { $f.size }
    $bw.Write([Byte]$w); $bw.Write([Byte]$w); $bw.Write([Byte]0); $bw.Write([Byte]0)
    $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]$dib); $bw.Write([UInt32]$offset)
    $offset += $dib
}
foreach ($f in $frames) {
    $bw.Write([UInt32]40); $bw.Write([Int32]$f.size); $bw.Write([Int32]($f.size * 2))
    $bw.Write([UInt16]1); $bw.Write([UInt16]32); $bw.Write([UInt32]0)
    $bw.Write([UInt32]($f.xor.Length + $f.and.Length))
    $bw.Write([UInt32]0); $bw.Write([UInt32]0); $bw.Write([UInt32]0); $bw.Write([UInt32]0)
    $bw.Write($f.xor); $bw.Write($f.and)
}
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $root 'build/icon.ico'), $ms.ToArray())
$ms.Dispose()
Write-Host "-> build/icon.ico (multi-size)"

Write-Host ""
Write-Host "Branding applied. Now run:  npm run dist:win" -ForegroundColor Green
