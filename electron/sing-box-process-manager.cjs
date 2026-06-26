const net = require('node:net')
const path = require('node:path')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const {
  spawn,
  execFile,
} = require('node:child_process')
const {
  promisify,
} = require('node:util')

const execFileAsync =
  promisify(execFile)

const {
  backupWindowsProxyState,
  restoreWindowsProxyState,
} = require('./windows-proxy-state.cjs')

const {
  registerManagedProcess,
  clearManagedProcess,
} = require('./engine-runtime-guard.cjs')

const LOCAL_PROXY_HOST =
  '127.0.0.1'

const LOCAL_PROXY_PORT = 2080
const START_TIMEOUT_MS = 12000
const STOP_TIMEOUT_MS = 3500
const CHECK_TIMEOUT_MS = 15000
const MAX_LOG_LENGTH = 16000

let activeProcess = null
let activeUserDataPath = null
let activeEnginePath = null
let activeConfigPath = null
let processState = createInitialState()

let processExitCallback = null

function setProcessExitCallback(fn) {
  processExitCallback = typeof fn === 'function' ? fn : null
}

function createInitialState() {
  return {
    running: false,
    ready: false,
    systemProxyEnabled: false,
    tunEnabled: false,
    connectionMode: null,
    pid: null,
    startedAt: null,
    stoppedAt: null,
    localHost:
      LOCAL_PROXY_HOST,
    localPort:
      LOCAL_PROXY_PORT,
    lastExitCode: null,
    lastSignal: null,
    lastError: null,
    logTail: '',
  }
}

function getFixedConfigPath(
  userDataPath,
) {
  return path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    'runtime',
    'config.json',
  )
}

function getTunConfigPath(
  userDataPath,
) {
  return path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    'runtime',
    'tun-config.json',
  )
}

async function startLocalProxy({
  enginePath,
  userDataPath,
  configPath: overrideConfigPath,
}) {
  if (
    activeProcess &&
    processState.running
  ) {
    return {
      success: true,
      ...getProcessStatus(),
      error: null,
    }
  }

  validatePath(
    enginePath,
    'مسیر sing-box معتبر نیست.',
  )

  validatePath(
    userDataPath,
    'مسیر داده برنامه معتبر نیست.',
  )

  if (!fs.existsSync(enginePath)) {
    throw new Error(
      'فایل sing-box.exe پیدا نشد.',
    )
  }

  const configPath =
    overrideConfigPath ??
    getFixedConfigPath(userDataPath)

  if (!fs.existsSync(configPath)) {
    throw new Error(
      'کانفیگ تأییدشده‌ای برای اجرا وجود ندارد. ابتدا کانفیگ سرور را بررسی کن.',
    )
  }

  const systemProxyEnabled =
    await readSystemProxyFlag(
      configPath,
    )

  await validateConfigAgain({
    enginePath,
    configPath,
  })

  resetForStart(
    systemProxyEnabled,
    systemProxyEnabled
      ? 'system-proxy'
      : 'local-proxy',
  )

  const child = spawn(
    enginePath,
    [
      'run',
      '-c',
      configPath,
    ],
    {
      windowsHide: true,
      shell: false,
      stdio: [
        'ignore',
        'pipe',
        'pipe',
      ],
    },
  )

  activeProcess = child
  activeUserDataPath =
    userDataPath
  activeEnginePath =
    enginePath
  activeConfigPath =
    configPath

  processState.running = true
  processState.pid =
    child.pid ?? null

  processState.startedAt =
    new Date().toISOString()

  if (processState.pid) {
    await registerManagedProcess({
      userDataPath,
      pid:
        processState.pid,
      enginePath,
      configPath,
      mode:
        processState.connectionMode,
    })
  }

  attachProcessListeners(
    child,
    userDataPath,
  )

  try {
    await waitForLocalProxy(
      child,
    )

    if (
      activeProcess !== child ||
      !processState.running
    ) {
      throw new Error(
        processState.lastError ||
        'فرایند sing-box پیش از آماده‌شدن متوقف شد.',
      )
    }

    processState.ready = true

    return {
      success: true,
      ...getProcessStatus(),
      error: null,
    }
  } catch (error) {
    await stopSpecificProcess(
      child,
    )

    const message =
      error instanceof Error
        ? error.message
        : 'راه‌اندازی پروکسی محلی ناموفق بود.'

    processState.lastError =
      sanitizeLog(message)

    return {
      success: false,
      ...getProcessStatus(),
      error:
        processState.lastError,
    }
  }
}


async function startTunMode({
  enginePath,
  userDataPath,
}) {
  validatePath(
    enginePath,
    'مسیر sing-box معتبر نیست.',
  )

  validatePath(
    userDataPath,
    'مسیر داده برنامه معتبر نیست.',
  )

  if (!fs.existsSync(enginePath)) {
    throw new Error(
      'فایل sing-box.exe پیدا نشد.',
    )
  }

  const configPath =
    getTunConfigPath(
      userDataPath,
    )

  if (!fs.existsSync(configPath)) {
    throw new Error(
      'کانفیگ معتبر TUN وجود ندارد.',
    )
  }

  if (
    activeProcess &&
    processState.running
  ) {
    await stopLocalProxy({
      userDataPath,
    })
  }

  await validateConfigAgain({
    enginePath,
    configPath,
  })

  resetForStart(
    false,
    'tun',
  )

  const child = spawn(
    enginePath,
    [
      'run',
      '-c',
      configPath,
    ],
    {
      windowsHide: true,
      shell: false,
      stdio: [
        'ignore',
        'pipe',
        'pipe',
      ],
    },
  )

  activeProcess = child
  activeUserDataPath =
    userDataPath
  activeEnginePath =
    enginePath
  activeConfigPath =
    configPath

  processState.running = true
  processState.tunEnabled = true
  processState.connectionMode = 'tun'
  processState.pid =
    child.pid ?? null
  processState.startedAt =
    new Date().toISOString()

  if (processState.pid) {
    await registerManagedProcess({
      userDataPath,
      pid:
        processState.pid,
      enginePath,
      configPath,
      mode: 'tun',
    })
  }

  attachProcessListeners(
    child,
    userDataPath,
  )

  try {
    await waitForLocalProxy(
      child,
    )

    if (
      activeProcess !== child ||
      !processState.running
    ) {
      throw new Error(
        processState.lastError ||
        'فرایند TUN پیش از آماده‌شدن متوقف شد.',
      )
    }

    processState.ready = true

    return {
      success: true,
      ...getProcessStatus(),
      error: null,
    }
  } catch (error) {
    await stopSpecificProcess(
      child,
    )

    const message =
      error instanceof Error
        ? error.message
        : 'راه‌اندازی TUN ناموفق بود.'

    processState.lastError =
      sanitizeLog(message)

    return {
      success: false,
      ...getProcessStatus(),
      error:
        processState.lastError,
    }
  }
}

async function activateSystemProxy({
  enginePath,
  userDataPath,
}) {
  validatePath(
    enginePath,
    'مسیر sing-box معتبر نیست.',
  )

  validatePath(
    userDataPath,
    'مسیر داده برنامه معتبر نیست.',
  )

  const configPath =
    getFixedConfigPath(
      userDataPath,
    )

  if (!fs.existsSync(configPath)) {
    throw new Error(
      'کانفیگ تأییدشده‌ای برای فعال‌سازی System Proxy وجود ندارد.',
    )
  }

  await backupWindowsProxyState(
    userDataPath,
  )

  await setSystemProxyFlag(
    configPath,
    true,
  )

  await validateConfigAgain({
    enginePath,
    configPath,
  })

  if (
    activeProcess &&
    processState.running
  ) {
    await stopLocalProxy({
      userDataPath,
    })
  }

  const result =
    await startLocalProxy({
      enginePath,
      userDataPath,
    })

  if (
    !result.success ||
    !result.ready
  ) {
    await setSystemProxyFlag(
      configPath,
      false,
    )

    try {
      await restoreWindowsProxyState(
        userDataPath,
      )
    } catch (restoreError) {
      const restoreMessage =
        restoreError instanceof Error
          ? restoreError.message
          : 'بازگردانی تنظیمات Proxy ویندوز ناموفق بود.'

      return {
        ...result,
        systemProxyEnabled: false,
        error:
          `${result.error ?? 'فعال‌سازی System Proxy ناموفق بود.'} ${restoreMessage}`,
      }
    }

    return {
      ...result,
      systemProxyEnabled: false,
      error:
        result.error ||
        'فعال‌سازی System Proxy ناموفق بود.',
    }
  }

  processState.systemProxyEnabled =
    true
  processState.tunEnabled =
    false
  processState.connectionMode =
    'system-proxy'

  return {
    ...getProcessStatus(),
    success: true,
    error: null,
  }
}

async function deactivateSystemProxy({
  enginePath,
  userDataPath,
  keepLocalProxy = false,
}) {
  validatePath(
    userDataPath,
    'مسیر داده برنامه معتبر نیست.',
  )

  const configPath =
    getFixedConfigPath(
      userDataPath,
    )

  if (
    activeProcess &&
    processState.running
  ) {
    await stopLocalProxy()
  }

  if (fs.existsSync(configPath)) {
    await setSystemProxyFlag(
      configPath,
      false,
    )
  }

  await restoreWindowsProxyState(
    userDataPath,
  )

  processState.systemProxyEnabled =
    false

  if (!keepLocalProxy) {
    return {
      success: true,
      ...getProcessStatus(),
      error: null,
    }
  }

  return startLocalProxy({
    enginePath,
    userDataPath,
  })
}

async function stopLocalProxy({
  userDataPath,
} = {}) {
  const child =
    activeProcess

  const shouldRestoreWindowsProxy =
    typeof userDataPath === 'string' &&
    userDataPath.trim()

  if (
    !child ||
    !processState.running
  ) {
    processState.running = false
    processState.ready = false
    processState.systemProxyEnabled =
      false
    processState.tunEnabled =
      false
    processState.connectionMode =
      null
    processState.pid = null

    if (
      typeof userDataPath ===
        'string' &&
      userDataPath.trim()
    ) {
      await clearManagedProcess({
        userDataPath,
      })
    }

    activeUserDataPath = null
    activeEnginePath = null
    activeConfigPath = null

    if (shouldRestoreWindowsProxy) {
      await restoreWindowsProxyState(
        userDataPath,
      )
    }

    return {
      success: true,
      ...getProcessStatus(),
      error: null,
    }
  }

  try {
    const stoppedPid =
      child.pid ?? null

    // Clear before stopping so the exit handler won't double-restore.
    processState.systemProxyEnabled = false

    await stopSpecificProcess(
      child,
    )

    if (
      typeof userDataPath ===
        'string' &&
      userDataPath.trim()
    ) {
      await clearManagedProcess({
        userDataPath,
        pid:
          stoppedPid,
      })
    }

    activeUserDataPath = null
    activeEnginePath = null
    activeConfigPath = null

    if (shouldRestoreWindowsProxy) {
      await restoreWindowsProxyState(
        userDataPath,
      )
    }

    processState.systemProxyEnabled =
      false
    processState.tunEnabled =
      false
    processState.connectionMode =
      null

    return {
      success: true,
      ...getProcessStatus(),
      error: null,
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'توقف sing-box ناموفق بود.'

    processState.lastError =
      sanitizeLog(message)

    return {
      success: false,
      ...getProcessStatus(),
      error:
        processState.lastError,
    }
  }
}

function getProcessStatus() {
  return {
    running:
      processState.running,
    ready:
      processState.ready,
    systemProxyEnabled:
      processState.systemProxyEnabled,
    tunEnabled:
      processState.tunEnabled,
    connectionMode:
      processState.connectionMode,
    pid:
      processState.pid,
    startedAt:
      processState.startedAt,
    stoppedAt:
      processState.stoppedAt,
    localHost:
      processState.localHost,
    localPort:
      processState.localPort,
    lastExitCode:
      processState.lastExitCode,
    lastSignal:
      processState.lastSignal,
    lastError:
      processState.lastError,
    logTail:
      processState.logTail,
  }
}

async function disposeProcessManager({
  userDataPath,
} = {}) {
  try {
    await stopLocalProxy({
      userDataPath,
    })
  } catch {
    // برنامه در هر صورت باید بتواند بسته شود.
  }

  if (
    typeof userDataPath === 'string' &&
    userDataPath.trim()
  ) {
    const configPath =
      getFixedConfigPath(
        userDataPath,
      )

    if (fs.existsSync(configPath)) {
      try {
        await setSystemProxyFlag(
          configPath,
          false,
        )
      } catch {
        // پاک‌سازی فایل کانفیگ نباید خروج برنامه را متوقف کند.
      }
    }

    try {
      await restoreWindowsProxyState(
        userDataPath,
      )
    } catch {
      // خروج برنامه نباید به‌خاطر خطای بازیابی متوقف شود.
    }

    try {
      await clearManagedProcess({
        userDataPath,
      })
    } catch {
      // Marker خراب نباید خروج برنامه را متوقف کند.
    }
  }

  activeUserDataPath = null
  activeEnginePath = null
  activeConfigPath = null
}

function resetForStart(
  systemProxyEnabled,
  connectionMode = 'local-proxy',
) {
  processState = {
    ...createInitialState(),
    running: true,
    systemProxyEnabled,
    tunEnabled:
      connectionMode === 'tun',
    connectionMode,
    startedAt:
      new Date().toISOString(),
  }
}

function attachProcessListeners(
  child,
  userDataPath,
) {
  child.stdout?.on(
    'data',
    (chunk) => {
      appendLog(chunk)
    },
  )

  child.stderr?.on(
    'data',
    (chunk) => {
      appendLog(chunk)
    },
  )

  child.once(
    'error',
    (error) => {
      processState.lastError =
        sanitizeLog(
          error instanceof Error
            ? error.message
            : 'اجرای sing-box با خطا مواجه شد.',
        )
    },
  )

  child.once(
    'exit',
    (code, signal) => {
      if (
        activeProcess === child
      ) {
        activeProcess = null
      }

      const exitedPid =
        child.pid ?? null

      if (
        typeof userDataPath ===
          'string' &&
        userDataPath.trim()
      ) {
        void clearManagedProcess({
          userDataPath,
          pid:
            exitedPid,
        })
      }

      const wasSystemProxy =
        processState.systemProxyEnabled

      activeUserDataPath = null
      activeEnginePath = null
      activeConfigPath = null

      processState.running = false
      processState.ready = false
      processState.systemProxyEnabled =
        false
      processState.tunEnabled =
        false
      processState.connectionMode =
        null
      processState.pid = null
      processState.stoppedAt =
        new Date().toISOString()

      processState.lastExitCode =
        typeof code === 'number'
          ? code
          : null

      processState.lastSignal =
        typeof signal === 'string'
          ? signal
          : null

      if (
        code !== 0 &&
        code !== null &&
        !processState.lastError
      ) {
        processState.lastError =
          `sing-box با کد ${code} متوقف شد.`
      }

      if (
        wasSystemProxy &&
        typeof userDataPath === 'string' &&
        userDataPath.trim()
      ) {
        void restoreWindowsProxyState(userDataPath).catch(() => {})
      }

      if (typeof processExitCallback === 'function') {
        try {
          processExitCallback({ code, signal })
        } catch {
          // Exit callbacks must never crash the process manager.
        }
      }
    },
  )
}

async function readSystemProxyFlag(
  configPath,
) {
  const config =
    await readConfig(
      configPath,
    )

  const inbound =
    findMixedInbound(config)

  return Boolean(
    inbound.set_system_proxy,
  )
}

async function setSystemProxyFlag(
  configPath,
  enabled,
) {
  const config =
    await readConfig(
      configPath,
    )

  const inbound =
    findMixedInbound(config)

  inbound.set_system_proxy =
    Boolean(enabled)

  await writeConfigAtomically(
    configPath,
    config,
  )
}

async function readConfig(
  configPath,
) {
  try {
    const content =
      await fsp.readFile(
        configPath,
        'utf8',
      )

    const config =
      JSON.parse(content)

    if (
      !config ||
      typeof config !== 'object'
    ) {
      throw new Error()
    }

    return config
  } catch {
    throw new Error(
      'خواندن فایل کانفیگ sing-box ناموفق بود.',
    )
  }
}

function findMixedInbound(config) {
  if (!Array.isArray(config.inbounds)) {
    throw new Error(
      'فهرست inboundهای کانفیگ معتبر نیست.',
    )
  }

  const inbound =
    config.inbounds.find(
      (item) =>
        item &&
        item.type === 'mixed' &&
        item.listen ===
          LOCAL_PROXY_HOST &&
        item.listen_port ===
          LOCAL_PROXY_PORT,
    )

  if (!inbound) {
    throw new Error(
      'ورودی mixed محلی در کانفیگ پیدا نشد.',
    )
  }

  return inbound
}

async function writeConfigAtomically(
  configPath,
  config,
) {
  const temporaryPath =
    `${configPath}.tmp`

  await fsp.writeFile(
    temporaryPath,
    JSON.stringify(
      config,
      null,
      2,
    ),
    'utf8',
  )

  await fsp.rm(
    configPath,
    {
      force: true,
    },
  )

  await fsp.rename(
    temporaryPath,
    configPath,
  )
}

async function validateConfigAgain({
  enginePath,
  configPath,
}) {
  try {
    await execFileAsync(
      enginePath,
      [
        'check',
        '-c',
        configPath,
      ],
      {
        windowsHide: true,
        timeout:
          CHECK_TIMEOUT_MS,
        encoding: 'utf8',
      },
    )
  } catch (error) {
    const stderr =
      typeof error?.stderr ===
      'string'
        ? error.stderr
        : ''

    const stdout =
      typeof error?.stdout ===
      'string'
        ? error.stdout
        : ''

    const message =
      `${stdout}\n${stderr}`
        .trim() ||
      (error instanceof Error
        ? error.message
        : 'اعتبارسنجی دوباره کانفیگ ناموفق بود.')

    throw new Error(
      sanitizeLog(message),
    )
  }
}

function waitForLocalProxy(child) {
  return new Promise(
    (resolve, reject) => {
      const startedAt =
        Date.now()

      let settled = false
      let timer = null

      function cleanup() {
        if (timer) {
          clearTimeout(timer)
        }

        child.off(
          'exit',
          handleEarlyExit,
        )

        child.off(
          'error',
          handleEarlyError,
        )
      }

      function finishSuccess() {
        if (settled) {
          return
        }

        settled = true
        cleanup()
        resolve()
      }

      function finishError(error) {
        if (settled) {
          return
        }

        settled = true
        cleanup()
        reject(error)
      }

      function handleEarlyExit(
        code,
      ) {
        finishError(
          new Error(
            processState.lastError ||
            `sing-box پیش از آماده‌شدن با کد ${code ?? 'نامشخص'} متوقف شد.`,
          ),
        )
      }

      function handleEarlyError(
        error,
      ) {
        finishError(error)
      }

      child.once(
        'exit',
        handleEarlyExit,
      )

      child.once(
        'error',
        handleEarlyError,
      )

      async function attempt() {
        if (
          Date.now() -
            startedAt >
          START_TIMEOUT_MS
        ) {
          finishError(
            new Error(
              'پروکسی محلی در زمان تعیین‌شده آماده نشد.',
            ),
          )

          return
        }

        const reachable =
          await canConnectToLocalPort()

        if (reachable) {
          finishSuccess()
          return
        }

        timer = setTimeout(
          attempt,
          250,
        )
      }

      void attempt()
    },
  )
}

function canConnectToLocalPort() {
  return new Promise(
    (resolve) => {
      const socket =
        new net.Socket()

      let completed = false

      function finish(value) {
        if (completed) {
          return
        }

        completed = true
        socket.destroy()
        resolve(value)
      }

      socket.setTimeout(450)

      socket.once(
        'connect',
        () => finish(true),
      )

      socket.once(
        'timeout',
        () => finish(false),
      )

      socket.once(
        'error',
        () => finish(false),
      )

      try {
        socket.connect({
          host:
            LOCAL_PROXY_HOST,
          port:
            LOCAL_PROXY_PORT,
        })
      } catch {
        finish(false)
      }
    },
  )
}

async function stopSpecificProcess(
  child,
) {
  if (!child) {
    return
  }

  if (
    child.exitCode !== null ||
    child.killed
  ) {
    if (
      activeProcess === child
    ) {
      activeProcess = null
    }

    processState.running = false
    processState.ready = false
    processState.systemProxyEnabled =
      false
    processState.tunEnabled =
      false
    processState.connectionMode =
      null
    processState.pid = null
    processState.stoppedAt =
      new Date().toISOString()

    return
  }

  const pid = child.pid

  const exitPromise =
    waitForExit(
      child,
      STOP_TIMEOUT_MS,
    )

  try {
    child.kill('SIGTERM')
  } catch {
    // در ویندوز ممکن است نیاز به taskkill باشد.
  }

  const exited =
    await exitPromise

  if (
    !exited &&
    typeof pid === 'number'
  ) {
    try {
      await execFileAsync(
        'taskkill',
        [
          '/PID',
          String(pid),
          '/T',
          '/F',
        ],
        {
          windowsHide: true,
          timeout: 5000,
          encoding: 'utf8',
        },
      )
    } catch {
      // ممکن است فرایند پیش از taskkill بسته شده باشد.
    }

    await waitForExit(
      child,
      1500,
    )
  }

  if (
    activeProcess === child
  ) {
    activeProcess = null
  }

  processState.running = false
  processState.ready = false
  processState.systemProxyEnabled =
    false
  processState.pid = null
  processState.stoppedAt =
    new Date().toISOString()
}

function waitForExit(
  child,
  timeoutMs,
) {
  return new Promise(
    (resolve) => {
      if (
        child.exitCode !== null
      ) {
        resolve(true)
        return
      }

      let settled = false

      function finish(value) {
        if (settled) {
          return
        }

        settled = true
        clearTimeout(timer)

        child.off(
          'exit',
          handleExit,
        )

        resolve(value)
      }

      function handleExit() {
        finish(true)
      }

      const timer = setTimeout(
        () => finish(false),
        timeoutMs,
      )

      child.once(
        'exit',
        handleExit,
      )
    },
  )
}

function appendLog(chunk) {
  const text =
    sanitizeLog(
      Buffer.isBuffer(chunk)
        ? chunk.toString('utf8')
        : String(chunk),
    )

  if (!text) {
    return
  }

  processState.logTail =
    `${processState.logTail}\n${text}`
      .trim()
      .slice(-MAX_LOG_LENGTH)
}

function sanitizeLog(value) {
  return String(value ?? '')
    .replace(
      /[A-Za-z0-9+/=_-]{32,}/g,
      '[hidden]',
    )
    .replace(
      /(?:uuid|password|passwd|token|secret)\s*[:=]\s*[^\s,]+/gi,
      '$1=[hidden]',
    )
    .trim()
    .slice(-MAX_LOG_LENGTH)
}

function validatePath(
  value,
  errorMessage,
) {
  if (
    typeof value !== 'string' ||
    !value.trim()
  ) {
    throw new Error(
      errorMessage,
    )
  }
}

async function emergencyDispose() {
  const userDataPath =
    activeUserDataPath

  const child =
    activeProcess

  try {
    if (child) {
      await stopSpecificProcess(
        child,
      )
    }
  } catch {
    // Crash cleanup best effort.
  }

  if (
    typeof userDataPath ===
      'string' &&
    userDataPath.trim()
  ) {
    try {
      await restoreWindowsProxyState(
        userDataPath,
      )
    } catch {
      // Crash cleanup best effort.
    }

    try {
      await clearManagedProcess({
        userDataPath,
      })
    } catch {
      // Crash cleanup best effort.
    }
  }

  activeProcess = null
  activeUserDataPath = null
  activeEnginePath = null
  activeConfigPath = null
}


module.exports = {
  startLocalProxy,
  startTunMode,
  activateSystemProxy,
  deactivateSystemProxy,
  stopLocalProxy,
  getProcessStatus,
  disposeProcessManager,
  emergencyDispose,
  setProcessExitCallback,
}
