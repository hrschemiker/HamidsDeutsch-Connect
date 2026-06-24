const {
  execFile,
} = require('node:child_process')
const {
  promisify,
} = require('node:util')

const execFileAsync =
  promisify(execFile)

async function getWindowsPrivilegeStatus() {
  if (process.platform !== 'win32') {
    return {
      supported: false,
      isAdministrator: false,
      platform:
        process.platform,
      error:
        'بررسی Administrator فقط برای Windows فعال است.',
    }
  }

  const script = `
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
$isAdmin = $principal.IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if ($isAdmin) {
  Write-Output 'true'
} else {
  Write-Output 'false'
}
`

  try {
    const {
      stdout,
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
        timeout: 10000,
        encoding: 'utf8',
        shell: false,
      },
    )

    return {
      supported: true,
      isAdministrator:
        String(stdout)
          .trim()
          .toLowerCase() ===
        'true',
      platform:
        process.platform,
      error: null,
    }
  } catch (error) {
    return {
      supported: true,
      isAdministrator: false,
      platform:
        process.platform,
      error:
        error instanceof Error
          ? error.message
          : 'بررسی سطح دسترسی Windows ناموفق بود.',
    }
  }
}

module.exports = {
  getWindowsPrivilegeStatus,
}
