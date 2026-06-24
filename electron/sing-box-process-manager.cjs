const net = require('node:net')
const path = require('node:path')
const fs = require('node:fs')
const {
  spawn,
  execFile,
} = require('node:child_process')
const {
  promisify,
} = require('node:util')

const execFileAsync =
  promisify(execFile)

const LOCAL_PROXY_HOST =
  '127.0.0.1'

const LOCAL_PROXY_PORT = 2080
const START_TIMEOUT_MS = 12000
const STOP_TIMEOUT_MS = 3500
const CHECK_TIMEOUT_MS = 15000
const MAX_LOG_LENGTH = 16000

let activeProcess = null
let processState = createInitialState()

function createInitialState() {
  return {
    running: false,
    ready: false,
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

async function startLocalProxy({
  enginePath,
  userDataPath,
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
    getFixedConfigPath(
      userDataPath,
    )

  if (!fs.existsSync(configPath)) {
    throw new Error(
      'کانفیگ تأییدشده‌ای برای اجرا وجود ندارد. ابتدا کانفیگ سرور را بررسی کن.',
    )
  }

  await validateConfigAgain({
    enginePath,
    configPath,
  })

  resetForStart()

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

  processState.running = true
  processState.pid =
    child.pid ?? null

  processState.startedAt =
    new Date().toISOString()

  attachProcessListeners(child)

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

async function stopLocalProxy() {
  const child =
    activeProcess

  if (
    !child ||
    !processState.running
  ) {
    processState.running = false
    processState.ready = false
    processState.pid = null

    return {
      success: true,
      ...getProcessStatus(),
      error: null,
    }
  }

  try {
    await stopSpecificProcess(
      child,
    )

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

async function disposeProcessManager() {
  try {
    await stopLocalProxy()
  } catch {
    // برنامه در هر صورت باید بتواند بسته شود.
  }
}

function resetForStart() {
  processState = {
    ...createInitialState(),
    running: true,
    startedAt:
      new Date().toISOString(),
  }
}

function attachProcessListeners(
  child,
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

      processState.running = false
      processState.ready = false
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
    },
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

module.exports = {
  startLocalProxy,
  stopLocalProxy,
  getProcessStatus,
  disposeProcessManager,
}
