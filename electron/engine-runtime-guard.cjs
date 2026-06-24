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

const OWNER_FILE_NAME =
  'engine-owner.json'

const COMMAND_TIMEOUT_MS =
  15000

function getOwnerFilePath(
  userDataPath,
) {
  return path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    'runtime',
    OWNER_FILE_NAME,
  )
}

async function registerManagedProcess({
  userDataPath,
  pid,
  enginePath,
  configPath,
  mode,
}) {
  validateUserDataPath(
    userDataPath,
  )

  if (
    !Number.isInteger(pid) ||
    pid <= 0
  ) {
    throw new Error(
      'PID فرایند sing-box معتبر نیست.',
    )
  }

  validatePath(
    enginePath,
    'مسیر sing-box معتبر نیست.',
  )

  validatePath(
    configPath,
    'مسیر کانفیگ معتبر نیست.',
  )

  const ownerPath =
    getOwnerFilePath(
      userDataPath,
    )

  await fsp.mkdir(
    path.dirname(ownerPath),
    {
      recursive: true,
    },
  )

  const payload = {
    version: 1,
    pid,
    enginePath:
      path.resolve(
        enginePath,
      ),
    configPath:
      path.resolve(
        configPath,
      ),
    mode:
      typeof mode === 'string'
        ? mode
        : null,
    startedAt:
      new Date().toISOString(),
  }

  const temporaryPath =
    `${ownerPath}.tmp`

  await fsp.writeFile(
    temporaryPath,
    JSON.stringify(
      payload,
      null,
      2,
    ),
    'utf8',
  )

  await fsp.rm(
    ownerPath,
    {
      force: true,
    },
  )

  await fsp.rename(
    temporaryPath,
    ownerPath,
  )

  return payload
}

async function clearManagedProcess({
  userDataPath,
  pid,
} = {}) {
  if (
    typeof userDataPath !==
      'string' ||
    !userDataPath.trim()
  ) {
    return
  }

  const ownerPath =
    getOwnerFilePath(
      userDataPath,
    )

  if (
    Number.isInteger(pid) &&
    pid > 0 &&
    fs.existsSync(ownerPath)
  ) {
    try {
      const owner =
        await readOwnerFile(
          ownerPath,
        )

      if (
        owner.pid !== pid
      ) {
        return
      }
    } catch {
      // فایل خراب نیز باید پاک شود.
    }
  }

  await fsp.rm(
    ownerPath,
    {
      force: true,
    },
  )
}

async function recoverStaleManagedProcess({
  userDataPath,
  expectedEnginePath,
}) {
  validateUserDataPath(
    userDataPath,
  )

  validatePath(
    expectedEnginePath,
    'مسیر مورد انتظار sing-box معتبر نیست.',
  )

  const ownerPath =
    getOwnerFilePath(
      userDataPath,
    )

  if (!fs.existsSync(ownerPath)) {
    return {
      found: false,
      terminated: false,
      pid: null,
      reason: null,
    }
  }

  let owner

  try {
    owner =
      await readOwnerFile(
        ownerPath,
      )
  } catch (error) {
    await fsp.rm(
      ownerPath,
      {
        force: true,
      },
    )

    return {
      found: true,
      terminated: false,
      pid: null,
      reason:
        error instanceof Error
          ? error.message
          : 'فایل مالکیت فرایند نامعتبر بود.',
    }
  }

  const expectedPath =
    normalizeWindowsPath(
      expectedEnginePath,
    )

  const recordedPath =
    normalizeWindowsPath(
      owner.enginePath,
    )

  if (
    expectedPath !==
    recordedPath
  ) {
    await fsp.rm(
      ownerPath,
      {
        force: true,
      },
    )

    return {
      found: true,
      terminated: false,
      pid: owner.pid,
      reason:
        'مسیر ثبت‌شده با sing-box فعلی برنامه تطبیق نداشت؛ فقط Marker پاک شد.',
    }
  }

  const processInfo =
    await getWindowsProcessInfo(
      owner.pid,
    )

  if (!processInfo.exists) {
    await fsp.rm(
      ownerPath,
      {
        force: true,
      },
    )

    return {
      found: true,
      terminated: false,
      pid: owner.pid,
      reason:
        'فرایند ثبت‌شده دیگر در حال اجرا نبود.',
    }
  }

  if (
    normalizeWindowsPath(
      processInfo.executablePath,
    ) !== expectedPath
  ) {
    await fsp.rm(
      ownerPath,
      {
        force: true,
      },
    )

    return {
      found: true,
      terminated: false,
      pid: owner.pid,
      reason:
        'PID به فرایند دیگری تعلق داشت؛ برای ایمنی بسته نشد.',
    }
  }

  await terminateProcessTree(
    owner.pid,
  )

  await fsp.rm(
    ownerPath,
    {
      force: true,
    },
  )

  return {
    found: true,
    terminated: true,
    pid: owner.pid,
    reason:
      'فرایند sing-box باقی‌مانده از اجرای قبلی بسته شد.',
  }
}

async function readOwnerFile(
  ownerPath,
) {
  const content =
    await fsp.readFile(
      ownerPath,
      'utf8',
    )

  const parsed =
    JSON.parse(content)

  if (
    !Number.isInteger(
      parsed?.pid,
    ) ||
    parsed.pid <= 0 ||
    typeof parsed?.enginePath !==
      'string' ||
    !parsed.enginePath.trim()
  ) {
    throw new Error(
      'فایل مالکیت فرایند معتبر نیست.',
    )
  }

  return {
    pid:
      parsed.pid,
    enginePath:
      parsed.enginePath,
    configPath:
      typeof parsed.configPath ===
        'string'
        ? parsed.configPath
        : '',
    mode:
      typeof parsed.mode ===
        'string'
        ? parsed.mode
        : null,
    startedAt:
      typeof parsed.startedAt ===
        'string'
        ? parsed.startedAt
        : null,
  }
}

async function getWindowsProcessInfo(
  pid,
) {
  if (process.platform !== 'win32') {
    return {
      exists: false,
      executablePath: null,
    }
  }

  const script = `
$process = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue
if ($null -eq $process) {
  Write-Output '{"exists":false,"executablePath":null}'
} else {
  @{
    exists = $true
    executablePath = $process.ExecutablePath
  } | ConvertTo-Json -Compress
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
        timeout:
          COMMAND_TIMEOUT_MS,
        encoding: 'utf8',
        shell: false,
      },
    )

    const parsed =
      JSON.parse(
        String(stdout).trim(),
      )

    return {
      exists:
        Boolean(
          parsed?.exists,
        ),
      executablePath:
        typeof parsed?.executablePath ===
          'string'
          ? parsed.executablePath
          : null,
    }
  } catch {
    return {
      exists: false,
      executablePath: null,
    }
  }
}

async function terminateProcessTree(
  pid,
) {
  if (
    process.platform !== 'win32'
  ) {
    try {
      process.kill(
        pid,
        'SIGTERM',
      )
    } catch {
      // فرایند ممکن است قبلاً بسته شده باشد.
    }

    return
  }

  try {
    await execFileAsync(
      'taskkill.exe',
      [
        '/PID',
        String(pid),
        '/T',
        '/F',
      ],
      {
        windowsHide: true,
        timeout:
          COMMAND_TIMEOUT_MS,
        encoding: 'utf8',
        shell: false,
      },
    )
  } catch (error) {
    const message =
      String(
        error?.stderr ??
        error?.message ??
        '',
      )

    if (
      /not found|no running instance|128/i.test(
        message,
      )
    ) {
      return
    }

    throw new Error(
      `بستن فرایند باقی‌مانده sing-box ناموفق بود: ${
        message.trim() ||
        'خطای نامشخص'
      }`,
    )
  }
}

function normalizeWindowsPath(
  value,
) {
  if (
    typeof value !== 'string'
  ) {
    return ''
  }

  return path
    .resolve(value)
    .replace(/\//g, '\\')
    .toLowerCase()
}

function validateUserDataPath(
  userDataPath,
) {
  validatePath(
    userDataPath,
    'مسیر داده برنامه معتبر نیست.',
  )
}

function validatePath(
  value,
  message,
) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    throw new Error(message)
  }
}

module.exports = {
  registerManagedProcess,
  clearManagedProcess,
  recoverStaleManagedProcess,
}
