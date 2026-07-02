const crypto = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs/promises')

const {
  validateToken,
  repoExists,
  createRepo,
  pushDevcontainerFiles,
  createCodespace,
  getCodespace,
  startCodespace,
  stopCodespace,
  deleteCodespace,
  setPortPublic,
  listCodespacesForRepo,
  buildSingboxOutbound,
  buildVlessHost,
  buildVlessUri,
} = require('./github-codespace-service.cjs')

const {
  loadCodespaceSettings,
  saveCodespaceSettings,
} = require('./github-codespace-store.cjs')

// Shared with rest of app via require at call site
let _startLocalProxy = null
let _stopLocalProxy = null
let _verifyIpChange = null
let _getEngineInfo = null

function injectEngineApis({ startLocalProxy, stopLocalProxy, verifyIpChange, getEngineInfo }) {
  _startLocalProxy = startLocalProxy
  _stopLocalProxy = stopLocalProxy
  _verifyIpChange = verifyIpChange
  _getEngineInfo = getEngineInfo
}

// ── Progress reporting ────────────────────────────────────────────────────────

let _progressListener = null

function setCodespaceProgressListener(fn) {
  _progressListener = fn
}

function emitProgress(step, message) {
  if (_progressListener) {
    _progressListener({ step, message })
  }
}

// ── Polling helpers ───────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const AVAILABLE_STATES = new Set(['Available'])
const TERMINAL_STATES = new Set(['Failed', 'Deleted', 'Unavailable'])
const POLL_INTERVAL_MS = 8000
const POLL_TIMEOUT_MS = 8 * 60 * 1000 // 8 minutes

async function waitForCodespaceAvailable(token, name) {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    const cs = await getCodespace(token, name)

    if (!cs) throw new Error('Codespace یافت نشد.')

    if (AVAILABLE_STATES.has(cs.state)) return cs

    if (TERMINAL_STATES.has(cs.state)) {
      throw new Error(`Codespace در وضعیت ${cs.state} قرار گرفت و قابل استفاده نیست.`)
    }

    await sleep(POLL_INTERVAL_MS)
  }

  throw new Error('زمان راه‌اندازی Codespace بیش از ۸ دقیقه شد.')
}

// ── Sing-box config writer ────────────────────────────────────────────────────

async function writeSingboxConfig(outbound, userDataPath, directDomains, proxyDoH = false) {
  const rules = []
  if (Array.isArray(directDomains) && directDomains.length > 0) {
    rules.push({
      domain_suffix: directDomains,
      action: 'route',
      outbound: 'direct',
    })
  }

  const config = {
    log: { level: 'warn', timestamp: true },
    inbounds: [{
      type: 'mixed',
      tag: 'mixed-in',
      listen: '127.0.0.1',
      listen_port: 2080,
      set_system_proxy: false,
    }],
    outbounds: [
      outbound,
      { type: 'direct', tag: 'direct' },
    ],
    route: {
      rules,
      final: 'proxy',
      auto_detect_interface: true,
    },
  }

  if (proxyDoH) {
    config.dns = {
      servers: [
        { tag: 'dns-proxy', type: 'tls', server: '1.1.1.1', detour: 'proxy' },
        { tag: 'dns-direct', type: 'local' },
      ],
      final: 'dns-proxy',
      independent_cache: true,
    }
    // Both outbounds need domain_resolver to break the circular DNS dependency:
    // proxy uses local DNS to reach its server; app DNS goes through the tunnel.
    for (const out of config.outbounds) {
      out.domain_resolver = 'dns-direct'
    }
  }

  const runtimeDir = path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    'runtime',
  )

  await fs.mkdir(runtimeDir, { recursive: true })

  const configPath = path.join(runtimeDir, 'codespace-config.json')
  const tmpPath = `${configPath}.tmp`

  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), 'utf8')
  await fs.rm(configPath, { force: true })
  await fs.rename(tmpPath, configPath)

  return configPath
}

// ── Setup (called from Settings) ─────────────────────────────────────────────

async function setupGitHub(userDataPath, token) {
  emitProgress('validate', 'در حال تأیید توکن GitHub...')
  const user = await validateToken(token)

  const settings = {
    token,
    username: user.username,
    repoName: null,
    repoCreated: false,
    lastCodespaceName: null,
    lastCodespaceState: null,
    lastConnectedUuid: null,
  }

  emitProgress('repo', 'در حال بررسی مخزن اختصاصی...')
  const exists = await repoExists(token, user.username)

  if (!exists) {
    emitProgress('repo', 'در حال ساخت مخزن اختصاصی...')
    await createRepo(token)
  }

  settings.repoCreated = true

  await saveCodespaceSettings(userDataPath, settings)

  return { success: true, username: user.username, error: null }
}

// ── Connect ───────────────────────────────────────────────────────────────────

async function connectViaCodespace(userDataPath, directDomains, proxyDoH = false) {
  const { settings } = await loadCodespaceSettings(userDataPath)

  if (!settings.token) {
    return { success: false, error: 'توکن GitHub ذخیره نشده. ابتدا از بخش تنظیمات اتصال به GitHub را راه‌اندازی کن.' }
  }

  if (!settings.repoCreated) {
    return { success: false, error: 'مخزن اختصاصی هنوز ساخته نشده. ابتدا راه‌اندازی GitHub را انجام بده.' }
  }

  try {
    const result = await attemptConnect(userDataPath, settings, directDomains, false)

    if (result.success) return result

    // First attempt failed — retry with a fresh codespace
    emitProgress('retry', 'اتصال ناموفق بود؛ در حال ساخت Codespace جدید...')

    if (settings.lastCodespaceName) {
      await deleteCodespace(settings.token, settings.lastCodespaceName).catch(() => {})
      await saveCodespaceSettings(userDataPath, {
        ...settings,
        lastCodespaceName: null,
        lastCodespaceState: null,
        lastConnectedUuid: null,
      })
    }

    const retryResult = await attemptConnect(userDataPath, settings, directDomains, true)
    return retryResult
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'خطای ناشناخته در اتصال Codespace',
    }
  }
}

async function attemptConnect(userDataPath, settings, directDomains, forceNew) {
  const { token, username } = settings

  let codespaceName = settings.lastCodespaceName
  let uuid = settings.lastConnectedUuid

  // Check if existing codespace is reusable
  let existingCs = codespaceName ? await getCodespace(token, codespaceName) : null

  const isReusable =
    existingCs &&
    !forceNew &&
    !TERMINAL_STATES.has(existingCs.state) &&
    existingCs.state !== 'Deleted'

  if (!isReusable || forceNew) {
    // Generate a new UUID and push fresh devcontainer files
    uuid = crypto.randomUUID()

    emitProgress('push', 'در حال آماده‌سازی فایل‌های Codespace...')
    await pushDevcontainerFiles(token, username, uuid)

    emitProgress('create', 'در حال ساخت Codespace (۲–۴ دقیقه)...')
    const created = await createCodespace(token, username)
    codespaceName = created.name

    await saveCodespaceSettings(userDataPath, {
      ...settings,
      lastCodespaceName: codespaceName,
      lastCodespaceState: 'Provisioning',
      lastConnectedUuid: uuid,
    })
  } else if (existingCs.state !== 'Available') {
    // Restart a stopped/shutdown codespace
    emitProgress('start', 'در حال راه‌اندازی مجدد Codespace...')
    await startCodespace(token, codespaceName)
  } else {
    emitProgress('ready', 'Codespace قبلی موجود است...')
  }

  // Wait for Available
  emitProgress('wait', 'در حال انتظار برای آماده‌شدن Codespace...')
  await waitForCodespaceAvailable(token, codespaceName)

  // Make port 443 public
  emitProgress('port', 'در حال عمومی‌کردن پورت ۴۴۳...')
  await setPortPublic(token, codespaceName, 443)

  // Wait for xray startup (postStartCommand runs after Available)
  emitProgress('xray', 'در حال انتظار برای راه‌اندازی پروکسی...')
  await sleep(20000)

  // Save state
  await saveCodespaceSettings(userDataPath, {
    ...settings,
    lastCodespaceName: codespaceName,
    lastCodespaceState: 'Available',
    lastConnectedUuid: uuid,
  })

  // Build sing-box outbound
  const outbound = buildSingboxOutbound(uuid, codespaceName)

  // Write sing-box config
  const configPath = await writeSingboxConfig(outbound, userDataPath, directDomains, proxyDoH)

  const host = buildVlessHost(codespaceName)
  const uri = buildVlessUri(uuid, codespaceName)

  return {
    success: true,
    codespaceName,
    uuid,
    host,
    configPath,
    uri,
    error: null,
  }
}

// ── Disconnect ────────────────────────────────────────────────────────────────

async function disconnectCodespace(userDataPath) {
  const { settings } = await loadCodespaceSettings(userDataPath)

  if (!settings.token || !settings.lastCodespaceName) return { success: true }

  try {
    await stopCodespace(settings.token, settings.lastCodespaceName)

    await saveCodespaceSettings(userDataPath, {
      ...settings,
      lastCodespaceState: 'Shutdown',
    })
  } catch {
    // Best-effort; don't block disconnect
  }

  return { success: true }
}

// ── Status ────────────────────────────────────────────────────────────────────

async function getCodespaceStatus(userDataPath) {
  const { settings } = await loadCodespaceSettings(userDataPath)

  return {
    hasToken: Boolean(settings.token),
    username: settings.username,
    repoCreated: settings.repoCreated,
    lastCodespaceName: settings.lastCodespaceName,
    lastCodespaceState: settings.lastCodespaceState,
    lastConnectedUuid: settings.lastConnectedUuid,
  }
}

module.exports = {
  injectEngineApis,
  setCodespaceProgressListener,
  setupGitHub,
  connectViaCodespace,
  disconnectCodespace,
  getCodespaceStatus,
}
