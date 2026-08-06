const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { spawn, execFile } = require('node:child_process')
const { promisify } = require('node:util')
const {
  backupWindowsProxyState,
  restoreWindowsProxyState,
  enableLocalManualProxy,
} = require('./windows-proxy-state.cjs')
const { registerManagedProcess, clearManagedProcess } = require('./engine-runtime-guard.cjs')

const execFileAsync = promisify(execFile)
const HOST = '127.0.0.1'
const PORT = 2080
let activeProcess = null
let activeUserDataPath = null
let state = initialState()
let processExitCallback = null

function setXrayProcessExitCallback(callback) {
  processExitCallback = typeof callback === 'function' ? callback : null
}

function initialState() {
  return {
    running: false, ready: false, systemProxyEnabled: false, tunEnabled: false,
    connectionMode: null, engineType: 'xray', pid: null, startedAt: null,
    stoppedAt: null, localHost: HOST, localPort: PORT, lastExitCode: null,
    lastSignal: null, lastError: null, logTail: '',
  }
}

function getConfigPath(userDataPath) {
  return path.join(userDataPath, 'HamidsDeutsch-Connect', 'runtime', 'xray-config.json')
}

async function startXray({ enginePath, userDataPath }) {
  if (activeProcess && state.running) return { success: true, ...getXrayStatus(), error: null }
  const configPath = getConfigPath(userDataPath)
  if (!fs.existsSync(enginePath)) throw new Error('فایل xray.exe پیدا نشد.')
  if (!fs.existsSync(configPath)) throw new Error('کانفیگ تأییدشده Xray پیدا نشد.')
  await validate(enginePath, configPath)
  await freePort(PORT)

  const child = spawn(enginePath, ['run', '-c', configPath], {
    windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
  })
  activeProcess = child
  activeUserDataPath = userDataPath
  state = { ...initialState(), running: true, connectionMode: 'local-proxy', pid: child.pid ?? null, startedAt: new Date().toISOString() }
  if (child.pid) await registerManagedProcess({ userDataPath, pid: child.pid, enginePath, configPath, mode: 'xray-local-proxy' })
  attach(child, userDataPath)

  try {
    await waitForPort(child)
    state.ready = true
    return { success: true, ...getXrayStatus(), error: null }
  } catch (error) {
    await stopChild(child)
    state.lastError = safeMessage(error)
    return { success: false, ...getXrayStatus(), error: state.lastError }
  }
}

async function activateXraySystemProxy({ enginePath, userDataPath }) {
  await backupWindowsProxyState(userDataPath)
  const started = await startXray({ enginePath, userDataPath })
  if (!started.success || !started.ready) {
    await restoreWindowsProxyState(userDataPath).catch(() => {})
    return started
  }
  try {
    await enableLocalManualProxy(PORT)
    state.systemProxyEnabled = true
    state.connectionMode = 'system-proxy'
    return { success: true, ...getXrayStatus(), error: null }
  } catch (error) {
    await stopXray({ userDataPath })
    return { success: false, ...getXrayStatus(), error: safeMessage(error) }
  }
}

async function deactivateXraySystemProxy({ userDataPath, keepLocalProxy = false }) {
  state.systemProxyEnabled = false
  await restoreWindowsProxyState(userDataPath)
  if (!keepLocalProxy) return stopXray({ userDataPath })
  state.connectionMode = 'local-proxy'
  return { success: true, ...getXrayStatus(), error: null }
}

async function stopXray({ userDataPath } = {}) {
  const child = activeProcess
  state.systemProxyEnabled = false
  if (child) await stopChild(child).catch(() => {})
  activeProcess = null
  const effectivePath = userDataPath || activeUserDataPath
  activeUserDataPath = null
  if (effectivePath) {
    await clearManagedProcess({ userDataPath: effectivePath }).catch(() => {})
    await restoreWindowsProxyState(effectivePath).catch(() => {})
  }
  state = { ...initialState(), stoppedAt: new Date().toISOString() }
  return { success: true, ...getXrayStatus(), error: null }
}

function getXrayStatus() {
  return { ...state }
}

async function disposeXray({ userDataPath } = {}) {
  await stopXray({ userDataPath }).catch(() => {})
}

function attach(child, userDataPath) {
  const append = (chunk) => { state.logTail = `${state.logTail}\n${String(chunk)}`.trim().slice(-16000) }
  child.stdout?.on('data', append)
  child.stderr?.on('data', append)
  child.once('error', (error) => { state.lastError = safeMessage(error) })
  child.once('exit', (code, signal) => {
    if (activeProcess !== child) return
    const wasSystemProxy = state.systemProxyEnabled
    activeProcess = null
    activeUserDataPath = null
    state.running = false
    state.ready = false
    state.systemProxyEnabled = false
    state.connectionMode = null
    state.pid = null
    state.stoppedAt = new Date().toISOString()
    state.lastExitCode = typeof code === 'number' ? code : null
    state.lastSignal = typeof signal === 'string' ? signal : null
    void clearManagedProcess({ userDataPath, pid: child.pid }).catch(() => {})
    if (wasSystemProxy) void restoreWindowsProxyState(userDataPath).catch(() => {})
    if (processExitCallback) {
      try { processExitCallback({ code, signal, engineType: 'xray' }) } catch {}
    }
  })
}

async function validate(enginePath, configPath) {
  try {
    await execFileAsync(enginePath, ['run', '-test', '-c', configPath], { windowsHide: true, timeout: 15000 })
  } catch (error) {
    throw new Error(String(error?.stderr || error?.message || 'کانفیگ Xray معتبر نیست.').slice(0, 3000))
  }
}

function waitForPort(child) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 12000
    const attempt = () => {
      if (child.exitCode !== null) return reject(new Error('Xray پیش از آماده‌شدن متوقف شد.'))
      const socket = net.createConnection({ host: HOST, port: PORT })
      socket.setTimeout(500)
      socket.once('connect', () => { socket.destroy(); resolve() })
      const retry = () => { socket.destroy(); Date.now() >= deadline ? reject(new Error('Xray در زمان مقرر آماده نشد.')) : setTimeout(attempt, 180) }
      socket.once('error', retry)
      socket.once('timeout', retry)
    }
    attempt()
  })
}

async function stopChild(child) {
  if (!child || child.exitCode !== null) return
  child.kill()
  await new Promise((resolve) => {
    const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {}; resolve() }, 3000)
    child.once('exit', () => { clearTimeout(timer); resolve() })
  })
}

async function freePort(port) {
  if (process.platform !== 'win32') return
  try {
    const { stdout } = await execFileAsync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8', timeout: 5000 })
    const pids = new Set()
    for (const line of stdout.split(/\r?\n/)) {
      const match = line.match(/^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/)
      if (match && Number(match[1]) === port) pids.add(match[2])
    }
    for (const pid of pids) await execFileAsync('taskkill', ['/F', '/PID', pid], { windowsHide: true, timeout: 5000 }).catch(() => {})
  } catch {}
}

function safeMessage(error) {
  return String(error instanceof Error ? error.message : error || 'عملیات Xray ناموفق بود.').replace(/[A-Za-z0-9+/=_-]{32,}/g, '[hidden]').slice(0, 3000)
}

module.exports = {
  startXray, activateXraySystemProxy, deactivateXraySystemProxy,
  stopXray, getXrayStatus, disposeXray,
  setXrayProcessExitCallback,
}
