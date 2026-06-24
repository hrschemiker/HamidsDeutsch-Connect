# HamidsDeutsch Connect — Windows Installer

این بسته چهار فایل دارد:

- `electron-builder.yml`
- `icon.ico`
- `prepare-installer.ps1`
- `build-installer.ps1`
- `verify-installer.ps1`

## محل قرارگیری

سه اسکریپت و آیکن را داخل پوشه زیر قرار بده:

```text
C:\HamidsDeutsch-Connect\scripts
```

فایل `electron-builder.yml` نیز کنار اسکریپت قرار می‌گیرد؛
اسکریپت آماده‌سازی خودش آن را به ریشه پروژه کپی می‌کند.

## آماده‌سازی

```powershell
cd C:\HamidsDeutsch-Connect

powershell -ExecutionPolicy Bypass `
  -File .\scripts\prepare-installer.ps1 `
  -Version 1.0.0
```

## ساخت Setup

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\build-installer.ps1
```

خروجی در پوشه زیر ساخته می‌شود:

```text
C:\HamidsDeutsch-Connect\release
```

نام فایل:

```text
HamidsDeutsch-Connect-Setup-1.0.0-x64.exe
```

کنار فایل Setup، فایل SHA-256 نیز ساخته می‌شود.

## بررسی امضا و Hash

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\scripts\verify-installer.ps1 `
  -InstallerPath .\release\HamidsDeutsch-Connect-Setup-1.0.0-x64.exe
```
