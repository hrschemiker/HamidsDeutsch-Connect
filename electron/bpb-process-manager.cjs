const net = require('node:net')
const fs = require('node:fs')
const path = require('node:path')
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

const LOCAL_HOST =
  '127.0.0.1'

const LOCAL_PORT =
  2081

const START_TIMEOUT_MS =
  12000

const STOP_TIMEOUT_MS =
  4000

let activeProcess = null

let state =
  createInitialState()

function createInitialState() {
  return {
    running: false,
    ready: false,
    connected: false,
    pid: null,
    startedAt: null,
    stoppedAt: null,
    localHost:
      LOCAL_HOST,
    localPort:
      LOCAL_PORT,
    profileType: null,
    nodeId: null,
    nodeName: null,
    lastError: null,
    logTail: '',
  }
}

async function startBpbProxy({
  enginePath,
  userDataPath,
  configPath,
  profileType,
  nodeId,
  nodeName,
}) {
  if (
    activeProcess &&
    state.running
  ) {
    return {
      success: true,
      ...getBpbStatus(),
      error: null,
    }
  }

  if (
    !fs.existsSync(
      enginePath,
    )
  ) {
    throw new Error(
      'فایل sing-box.exe پیدا نشد.',
    )
  }

  if (
    !fs.existsSync(
      configPath,
    )
  ) {
    throw new Error(
      'کانفیگ مستقل BPB پیدا نشد.',
    )
  }

  await backupWindowsProxyState(
    userDataPath,
  )

  await checkConfig({
    enginePath,
    configPath,
  })

  state =
    createInitialState()

  state.running = true
  state.profileType =
    profileType
  state.nodeId =
    nodeId
  state.nodeName =
    nodeName
  state.startedAt =
    new Date().toISOString()

  const child =
    spawn(
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

  activeProcess =
    child

  state.pid =
    child.pid ?? null

  if (state.pid) {
    await registerManagedProcess({
      userDataPath,
      pid:
        state.pid,
      enginePath,
      configPath,
      mode:
        'bpb-system-proxy',
    })
  }

  attachListeners(
    child,
    userDataPath,
  )

  try {
    await waitForPort(
      child,
    )

    state.ready = true

    return {
      success: true,
      ...getBpbStatus(),
      error: null,
    }
  } catch (error) {
    await stopBpbProxy({
      userDataPath,
    })

    return {
      success: false,
      ...getBpbStatus(),
      error:
        error instanceof Error
          ? error.message
          : 'راه‌اندازی اتصال BPB ناموفق بود.',
    }
  }
}

async function markBpbConnected(
  connected,
) {
  state.connected =
    connected === true

  return getBpbStatus()
}

async function stopBpbProxy({
  userDataPath,
} = {}) {
  const child =
    activeProcess

  if (child) {
    await terminateChild(
      child,
    )
  }

  activeProcess = null

  if (
    typeof userDataPath ===
      'string' &&
    userDataPath.trim()
  ) {
    try {
      await restoreWindowsProxyState(
        userDataPath,
      )
    } catch (error) {
      state.lastError =
        error instanceof Error
          ? error.message
          : 'بازگردانی Proxy ویندوز ناموفق بود.'
    }

    try {
      await clearManagedProcess({
        userDataPath,
      })
    } catch {
      // Best effort.
    }
  }

  state.running = false
  state.ready = false
  state.connected = false
  state.pid = null
  state.stoppedAt =
    new Date().toISOString()

  return {
    success: true,
    ...getBpbStatus(),
    error:
      state.lastError,
  }
}

function getBpbStatus() {
  return {
    ...state,
  }
}

function attachListeners(
  child,
  userDataPath,
) {
  child.stdout?.on(
    'data',
    (chunk) => {
      appendLog(
        chunk,
      )
    },
  )

  child.stderr?.on(
    'data',
    (chunk) => {
      appendLog(
        chunk,
      )
    },
  )

  child.once(
    'error',
    (error) => {
      state.lastError =
        error.message
    },
  )

  child.once(
    'exit',
    () => {
      if (
        activeProcess === child
      ) {
        activeProcess = null
      }

      state.running = false
      state.ready = false
      state.connected = false
      state.pid = null
      state.stoppedAt =
        new Date().toISOString()

      if (
        typeof userDataPath ===
          'string'
      ) {
        void restoreWindowsProxyState(
          userDataPath,
        ).catch(() => {})

        void clearManagedProcess({
          userDataPath,
        }).catch(() => {})
      }
    },
  )
}

function appendLog(
  chunk,
) {
  state.logTail =
    `${state.logTail}${String(
      chunk,
    )}`
      .slice(-12000)
}

async function waitForPort(
  child,
) {
  const started =
    Date.now()

  while (
    Date.now() - started <
    START_TIMEOUT_MS
  ) {
    if (
      child.exitCode !==
        null
    ) {
      throw new Error(
        state.lastError ||
        state.logTail ||
        'فرایند BPB پیش از آماده‌شدن متوقف شد.',
      )
    }

    const open =
      await isPortOpen()

    if (open) {
      return
    }

    await delay(250)
  }

  throw new Error(
    'پروکسی محلی BPB در زمان تعیین‌شده آماده نشد.',
  )
}

function isPortOpen() {
  return new Promise(
    (resolve) => {
      const socket =
        net.createConnection({
          host:
            LOCAL_HOST,
          port:
            LOCAL_PORT,
        })

      const finish =
        (value) => {
          socket.destroy()
          resolve(value)
        }

      socket.setTimeout(
        500,
      )

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
    },
  )
}

async function terminateChild(
  child,
) {
  if (
    child.exitCode !== null ||
    child.killed
  ) {
    return
  }

  try {
    if (
      process.platform ===
      'win32' &&
      child.pid
    ) {
      await execFileAsync(
        'taskkill.exe',
        [
          '/PID',
          String(child.pid),
          '/T',
          '/F',
        ],
        {
          windowsHide: true,
          timeout:
            STOP_TIMEOUT_MS,
          encoding: 'utf8',
          shell: false,
        },
      )
    } else {
      child.kill(
        'SIGTERM',
      )
    }
  } catch {
    // Process may already be stopped.
  }
}

async function checkConfig({
  enginePath,
  configPath,
}) {
  const {
    stdout,
    stderr,
  } = await execFileAsync(
    enginePath,
    [
      'check',
      '-c',
      configPath,
    ],
    {
      windowsHide: true,
      timeout: 15000,
      encoding: 'utf8',
      shell: false,
    },
  )

  const output =
    `${stdout}\n${stderr}`

  if (
    /error|fatal|panic/i.test(
      output,
    )
  ) {
    throw new Error(
      output.trim(),
    )
  }
}

function delay(
  milliseconds,
) {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      )
    },
  )
}

module.exports = {
  startBpbProxy,
  stopBpbProxy,
  getBpbStatus,
  markBpbConnected,
}
