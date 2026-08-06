const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const {
  execFile,
} = require('node:child_process')
const {
  promisify,
} = require('node:util')

const execFileAsync =
  promisify(execFile)

const BACKUP_FILE_NAME =
  'windows-proxy-backup.json'

const POWERSHELL_TIMEOUT_MS =
  15000

const REGISTRY_VALUE_NAMES = [
  'ProxyEnable',
  'ProxyServer',
  'ProxyOverride',
  'AutoConfigURL',
  'AutoDetect',
]

function getBackupPath(
  userDataPath,
) {
  return path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    'runtime',
    BACKUP_FILE_NAME,
  )
}

async function backupWindowsProxyState(
  userDataPath,
) {
  validateUserDataPath(
    userDataPath,
  )

  const backupPath =
    getBackupPath(
      userDataPath,
    )

  if (fs.existsSync(backupPath)) {
    return readBackupFile(
      backupPath,
    )
  }

  const state =
    await readWindowsProxyState()

  await fsp.mkdir(
    path.dirname(backupPath),
    {
      recursive: true,
    },
  )

  const temporaryPath =
    `${backupPath}.tmp`

  await fsp.writeFile(
    temporaryPath,
    JSON.stringify(
      {
        version: 1,
        createdAt:
          new Date().toISOString(),
        values:
          state.values,
      },
      null,
      2,
    ),
    'utf8',
  )

  await fsp.rm(
    backupPath,
    {
      force: true,
    },
  )

  await fsp.rename(
    temporaryPath,
    backupPath,
  )

  return {
    values:
      state.values,
  }
}

async function restoreWindowsProxyState(
  userDataPath,
) {
  validateUserDataPath(
    userDataPath,
  )

  const backupPath =
    getBackupPath(
      userDataPath,
    )

  if (!fs.existsSync(backupPath)) {
    await forceDisableLocalManualProxy()
    return {
      restored: false,
      usedFallback: true,
    }
  }

  const backup =
    await readBackupFile(
      backupPath,
    )

  await writeWindowsProxyState(
    backup.values,
  )

  // A stale backup from an interrupted older session may itself contain our
  // local 127.0.0.1:2080 proxy. Never restore that dead endpoint after the
  // engine has stopped; genuine user-configured proxies remain untouched.
  await forceDisableLocalManualProxy()

  await fsp.rm(
    backupPath,
    {
      force: true,
    },
  )

  return {
    restored: true,
    usedFallback: false,
  }
}

async function recoverStaleWindowsProxyState(
  userDataPath,
) {
  validateUserDataPath(
    userDataPath,
  )

  const backupPath =
    getBackupPath(
      userDataPath,
    )

  if (!fs.existsSync(backupPath)) {
    // No backup to restore — but a previous hard-kill (crash, Task Manager, an
    // unclean quit) may have left OUR local proxy (127.0.0.1:2080) enabled
    // system-wide. That silently breaks EVERY app fetch — subscription server
    // lists, IP checks — while other VPNs (TUN-based) keep working, which is
    // exactly the "only Manfaz is broken" symptom. Surgically clear it; this
    // touches the proxy only when it still points at our port.
    await forceDisableLocalManualProxy().catch(() => {})
    return {
      recovered: true,
    }
  }

  await restoreWindowsProxyState(
    userDataPath,
  )

  return {
    recovered: true,
  }
}

async function discardWindowsProxyBackup(
  userDataPath,
) {
  validateUserDataPath(
    userDataPath,
  )

  await fsp.rm(
    getBackupPath(
      userDataPath,
    ),
    {
      force: true,
    },
  )
}

async function readWindowsProxyState() {
  const namesJson =
    JSON.stringify(
      REGISTRY_VALUE_NAMES,
    )

  const script = `
$ErrorActionPreference = 'Stop'
$path = 'Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
$key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($path, $false)
if ($null -eq $key) {
  throw 'Internet Settings registry key was not found.'
}
$names = ConvertFrom-Json @'
${namesJson}
'@
$result = @{}
foreach ($name in $names) {
  $exists = $false
  $value = $null
  $kind = $null
  try {
    $value = $key.GetValue(
      $name,
      $null,
      [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
    )
    if ($null -ne $value) {
      $exists = $true
      $kind = $key.GetValueKind($name).ToString()
    }
  } catch {
    $exists = $false
  }

  if ($value -is [byte[]]) {
    $value = [Convert]::ToBase64String($value)
  }

  $result[$name] = @{
    exists = $exists
    kind = $kind
    value = $value
  }
}
$key.Close()
$result | ConvertTo-Json -Depth 6 -Compress
`

  const stdout =
    await runPowerShell(
      script,
    )

  let parsed

  try {
    parsed =
      JSON.parse(stdout)
  } catch {
    throw new Error(
      'خواندن تنظیمات فعلی Proxy ویندوز ناموفق بود.',
    )
  }

  return {
    values:
      normalizeValues(
        parsed,
      ),
  }
}

async function writeWindowsProxyState(
  values,
) {
  const normalizedValues =
    normalizeValues(
      values,
    )

  const payload =
    Buffer.from(
      JSON.stringify(
        normalizedValues,
      ),
      'utf8',
    ).toString('base64')

  const script = `
$ErrorActionPreference = 'Stop'
$WarningPreference = 'SilentlyContinue'
$path = 'Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($path)
$json = [Text.Encoding]::UTF8.GetString(
  [Convert]::FromBase64String('${payload}')
)
$values = ConvertFrom-Json $json

foreach ($property in $values.PSObject.Properties) {
  $name = $property.Name
  $entry = $property.Value

  if (-not [bool]$entry.exists) {
    try {
      $key.DeleteValue($name, $false)
    } catch {}
    continue
  }

  $kind = [Microsoft.Win32.RegistryValueKind]::$($entry.kind)
  $value = $entry.value

  switch ($entry.kind) {
    'DWord' {
      $value = [int]$value
    }
    'QWord' {
      $value = [long]$value
    }
    'Binary' {
      $value = [Convert]::FromBase64String([string]$value)
    }
    'MultiString' {
      $value = [string[]]$value
    }
    default {
      if ($null -eq $value) {
        $value = ''
      }
    }
  }

  $key.SetValue(
    $name,
    $value,
    $kind
  )
}

$key.Close()

try {
  if (-not ([System.Management.Automation.PSTypeName]'WinInetRefresh').Type) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WinInetRefresh {
  [DllImport("wininet.dll", SetLastError = true)]
  public static extern bool InternetSetOption(
    IntPtr hInternet,
    int dwOption,
    IntPtr lpBuffer,
    int dwBufferLength
  );
}
'@ -WarningAction SilentlyContinue
  }
  [WinInetRefresh]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
  [WinInetRefresh]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
} catch {}
`

  await runPowerShell(
    script,
  )
}

async function forceDisableLocalManualProxy() {
  const script = `
$ErrorActionPreference = 'Stop'
$WarningPreference = 'SilentlyContinue'
$path = 'Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($path)

$currentServer = [string]$key.GetValue('ProxyServer', '')
$isLocalHamidsProxy =
  $currentServer -match '(^|[=;])(?:https?://)?127\\.0\\.0\\.1:2080(?:/)?($|;)' -or
  $currentServer -match '(^|[=;])(?:https?://)?localhost:2080(?:/)?($|;)'

if ($isLocalHamidsProxy) {
  $key.SetValue(
    'ProxyEnable',
    0,
    [Microsoft.Win32.RegistryValueKind]::DWord
  )
  try {
    $key.DeleteValue('ProxyServer', $false)
  } catch {}
  try {
    $key.DeleteValue('ProxyOverride', $false)
  } catch {}
}

$key.Close()

try {
  if (-not ([System.Management.Automation.PSTypeName]'WinInetRefresh').Type) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WinInetRefresh {
  [DllImport("wininet.dll", SetLastError = true)]
  public static extern bool InternetSetOption(
    IntPtr hInternet,
    int dwOption,
    IntPtr lpBuffer,
    int dwBufferLength
  );
}
'@ -WarningAction SilentlyContinue
  }
  [WinInetRefresh]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
  [WinInetRefresh]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
} catch {}
`

  await runPowerShell(
    script,
  )
}

async function enableLocalManualProxy(port = 2080) {
  const normalizedPort = Number(port)
  if (!Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535) {
    throw new Error('پورت پروکسی محلی معتبر نیست.')
  }

  const script = `
$ErrorActionPreference = 'Stop'
$WarningPreference = 'SilentlyContinue'
$path = 'Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'
$key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($path)
$key.SetValue('ProxyEnable', 1, [Microsoft.Win32.RegistryValueKind]::DWord)
$key.SetValue('ProxyServer', 'http://127.0.0.1:${normalizedPort}', [Microsoft.Win32.RegistryValueKind]::String)
$key.SetValue('ProxyOverride', 'localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.20.*;172.21.*;172.22.*;172.23.*;172.24.*;172.25.*;172.26.*;172.27.*;172.28.*;172.29.*;172.30.*;172.31.*;192.168.*', [Microsoft.Win32.RegistryValueKind]::String)
$key.Close()
try {
  if (-not ([System.Management.Automation.PSTypeName]'WinInetRefresh').Type) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class WinInetRefresh {
  [DllImport("wininet.dll", SetLastError = true)]
  public static extern bool InternetSetOption(IntPtr hInternet, int dwOption, IntPtr lpBuffer, int dwBufferLength);
}
'@ -WarningAction SilentlyContinue
  }
  [WinInetRefresh]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
  [WinInetRefresh]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
} catch {}
`
  await runPowerShell(script)
}

async function readBackupFile(
  backupPath,
) {
  try {
    const content =
      await fsp.readFile(
        backupPath,
        'utf8',
      )

    const parsed =
      JSON.parse(content)

    return {
      values:
        normalizeValues(
          parsed?.values,
        ),
    }
  } catch {
    throw new Error(
      'فایل پشتیبان تنظیمات Proxy ویندوز معتبر نیست.',
    )
  }
}

function normalizeValues(
  values,
) {
  const normalized = {}

  for (
    const name of
      REGISTRY_VALUE_NAMES
  ) {
    const source =
      values?.[name]

    normalized[name] = {
      exists:
        Boolean(
          source?.exists,
        ),
      kind:
        typeof source?.kind ===
          'string'
          ? source.kind
          : null,
      value:
        source?.value ?? null,
    }
  }

  return normalized
}

async function runPowerShell(
  script,
) {
  try {
    const {
      stdout,
      stderr,
    } = await execFileAsync(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        script,
      ],
      {
        windowsHide: true,
        timeout:
          POWERSHELL_TIMEOUT_MS,
        encoding: 'utf8',
        maxBuffer:
          512 * 1024,
        shell: false,
      },
    )

    return String(
      stdout ?? '',
    ).trim()
  } catch (error) {
    const message =
      String(
        error?.stderr ??
        error?.message ??
        'PowerShell failed.',
      )
        .trim()
        .slice(0, 2000)

    throw new Error(
      `بازگردانی تنظیمات Proxy ویندوز ناموفق بود: ${message}`,
    )
  }
}

function validateUserDataPath(
  userDataPath,
) {
  if (
    typeof userDataPath !==
      'string' ||
    !userDataPath.trim()
  ) {
    throw new Error(
      'مسیر داده برنامه معتبر نیست.',
    )
  }
}

module.exports = {
  backupWindowsProxyState,
  restoreWindowsProxyState,
  recoverStaleWindowsProxyState,
  discardWindowsProxyBackup,
  forceDisableLocalManualProxy,
  enableLocalManualProxy,
}
