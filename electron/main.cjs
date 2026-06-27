const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
} = require('electron')

const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const {
  execFile,
} = require('node:child_process')
const {
  promisify,
} = require('node:util')

const {
  addSubscription,
  getSubscriptionUrl,
  listSubscriptions,
  removeSubscription,
} = require('./subscription-store.cjs')

const {
  inspectSubscriptionUrl,
  loadSubscriptionNodeRecords,
} = require('./subscription-inspector.cjs')

const {
  testServerBatch,
} = require('./server-latency.cjs')

const {
  createAndCheckConfig,
  createAndCheckTunConfig,
} = require('./sing-box-config-service.cjs')

const {
  startLocalProxy,
  startTunMode,
  activateSystemProxy,
  deactivateSystemProxy,
  stopLocalProxy,
  getProcessStatus,
  disposeProcessManager,
  emergencyDispose,
  setProcessExitCallback,
} = require('./sing-box-process-manager.cjs')

const {
  mergeServers: mergeFreeServers,
  revalidatePool: revalidateFreePool,
  updatePoolMeta: updateFreePoolMeta,
  markSuccess: markFreeSuccess,
  getPool: getFreePool,
  getPoolMeta: getFreePoolMeta,
  getAllPool: getAllFreePool,
  PING_THRESHOLD_MS,
} = require('./free-config-store.cjs')

const {
  verifyIpChange,
  getCurrentIpSnapshot,
} = require('./ip-verification-service.cjs')

const {
  replaceSubscriptionNodes,
  getSubscriptionNodeUri,
  removeSubscriptionNodes,
  clearSubscriptionNodeCache,
} = require('./subscription-node-cache.cjs')

const {
  recoverStaleWindowsProxyState,
  backupWindowsProxyState,
} = require('./windows-proxy-state.cjs')

const {
  recoverStaleManagedProcess,
} = require('./engine-runtime-guard.cjs')

const {
  getWindowsPrivilegeStatus,
} = require('./windows-privilege.cjs')

const {
  relaunchAsAdministrator,
} = require('./windows-elevation.cjs')

const {
  ensureVirtualLocationExtension,
  buildExtensionZip,
} = require('./virtual-location-extension-bundle.cjs')

const {
  startVirtualLocationService,
  stopVirtualLocationService,
  setVirtualLocationConnected,
  setDirectDomains,
} = require('./virtual-location-service.cjs')

const {
  checkLatestStable,
  updateToLatestStable,
  getUserEngineDirectory,
  getUserEnginePath,
} = require('./sing-box-updater.cjs')

const {
  loadBpbProfile,
  saveBpbProfile,
} = require('./bpb-profile-store.cjs')

const {
  startBpbProxy,
  stopBpbProxy,
  getBpbStatus,
  markBpbConnected,
} = require('./bpb-process-manager.cjs')

const {
  inspectBpbSource,
  importBpbJsonConfig,
} = require('./bpb-source-service.cjs')

const {
  discoverBpbPanel,
} = require('./bpb-panel-controller.cjs')

const {
  scanCloudflareEndpoints,
  getOptimizerState,
  setOptimizerEnabled,
  clearOptimizerState,
  getPreferredEndpoint,
  applyPreferredEndpointToUri,
  setOptimizerProgressListener,
} = require('./bpb-cloudflare-optimizer.cjs')

const {
  loginCloudflare,
  deployBpbPanel,
  updateBpbPanel,
  getCloudflareBpbStatus,
  setCloudflareBpbProgressListener,
} = require('./cloudflare-bpb-manager.cjs')

const {
  setupGitHub,
  connectViaCodespace,
  disconnectCodespace,
  getCodespaceStatus,
  setCodespaceProgressListener,
} = require('./github-codespace-manager.cjs')

const {
  loadCodespaceSettings,
  saveCodespaceSettings,
} = require('./github-codespace-store.cjs')

const execFileAsync =
  promisify(execFile)

const isDevelopment =
  !app.isPackaged

let mainWindow = null
let bpbPanelWindow = null

// Tracks the last successful subscription/free connect call so we can rebuild
// the config when the bypass list changes while connected.
let activeConnectionParams = null
let isQuitting = false
let fatalCleanupStarted = false

// ── Free Config State ──────────────────────────────────────────────────────

const FREE_CONFIG_SOURCES = [
  'https://raw.githubusercontent.com/MohammadBahemmat/V2ray-Collector/main/all_servers.txt',
  'https://raw.githubusercontent.com/0xRadikal/Free-v2ray-Configs/main/all/configs.txt',
  'https://raw.githubusercontent.com/yebekhe/TelegramV2rayCollector/main/sub/mix',
  'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
]
const FREE_TEST_TIMEOUT = 3500
const FREE_CONNECT_ATTEMPTS = 5
const FREE_BACKGROUND_INTERVAL_MS = 15 * 60 * 1000

let freePoolRefreshing = false
let freeBackgroundTimer = null

let freeConfigState = {
  phase: 'idle',
  nodeId: null,
  nodeName: null,
  latencyMs: null,
  error: null,
  userDisconnected: false,
  poolCount: 0,
  poolDisplaying: 0,
  poolLastRefreshedAt: null,
  poolRefreshing: false,
}

function sendFreeProgress(text, phase) {
  if (phase) freeConfigState.phase = phase
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('free:progress', { text, phase: freeConfigState.phase })
  }
}

async function fetchOneSource(url) {
  const { net } = require('electron')
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 20000)
  try {
    const res = await net.fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': 'HamidsDeutsch-Connect/1.0' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

async function fetchAllFreeSources() {
  const results = await Promise.allSettled(
    FREE_CONFIG_SOURCES.map((url) => fetchOneSource(url)),
  )
  const texts = results
    .filter((r) => r.status === 'fulfilled' && r.value)
    .map((r) => r.value)
  return { texts, sourceCount: texts.length }
}

function parseAllProtocols(content) {
  const { parseSubscriptionNodeRecords } = require('./subscription-parser.cjs')
  return parseSubscriptionNodeRecords(content)
}

async function testFreeNodes(records) {
  const { testServerBatch } = require('./server-latency.cjs')
  const inputs = records
    .filter((r) => r.node.valid && r.node.host && r.node.port)
    .map((r) => ({ id: r.id, host: r.node.host, port: r.node.port }))
  if (inputs.length === 0) return []
  const result = await testServerBatch(inputs)
  return result.results
}

async function testProxyConnectivity(port = 2080, timeoutMs = 10000) {
  // Full-stack check: CONNECT tunnel + TLS handshake + actual HTTP response bytes.
  // A server that only accepts CONNECT but can't relay TLS traffic will fail here.
  const TEST_HOST = 'speed.cloudflare.com'
  const TEST_PATH = '/__down?bytes=1024' // 1 KB — enough to prove real data flows

  return new Promise((resolve) => {
    const net = require('node:net')
    const tls = require('node:tls')
    let resolved = false
    let tlsSocket = null

    const done = (ok) => {
      if (!resolved) {
        resolved = true
        try { tlsSocket?.destroy() } catch {}
        try { socket.destroy() } catch {}
        resolve(ok)
      }
    }

    const socket = new net.Socket()
    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => done(false))
    socket.on('error', () => done(false))

    socket.connect(port, '127.0.0.1', () => {
      socket.write(`CONNECT ${TEST_HOST}:443 HTTP/1.1\r\nHost: ${TEST_HOST}:443\r\n\r\n`)
    })

    let connectBuf = ''
    let tunnelReady = false

    socket.on('data', (chunk) => {
      if (tunnelReady) return // TLS layer takes over after this
      connectBuf += chunk.toString('ascii', 0, Math.min(chunk.length, 512))
      if (!connectBuf.includes('\r\n\r\n')) return

      const firstLine = connectBuf.split('\r\n')[0] ?? ''
      if (!firstLine.includes('200')) { done(false); return }

      tunnelReady = true
      socket.removeAllListeners('data')

      tlsSocket = tls.connect({ socket, servername: TEST_HOST, rejectUnauthorized: false }, () => {
        tlsSocket.write(
          `GET ${TEST_PATH} HTTP/1.1\r\nHost: ${TEST_HOST}\r\nConnection: close\r\n\r\n`
        )
      })

      tlsSocket.on('error', () => done(false))
      tlsSocket.setTimeout(timeoutMs)
      tlsSocket.on('timeout', () => done(false))

      let responseBuf = ''
      let headersDone = false
      let dataBytes = 0

      tlsSocket.on('data', (d) => {
        if (!headersDone) {
          responseBuf += d.toString('ascii', 0, Math.min(d.length, 1024))
          const sep = responseBuf.indexOf('\r\n\r\n')
          if (sep === -1) return
          const status = responseBuf.split('\r\n')[0] ?? ''
          if (!status.includes('200')) { done(false); return }
          headersDone = true
          dataBytes += Math.max(0, d.length - (sep + 4 - (responseBuf.length - d.length)))
        } else {
          dataBytes += d.length
        }
        if (dataBytes >= 512) done(true) // got real payload bytes — proxy is working
      })

      tlsSocket.on('end', () => done(dataBytes >= 512))
    })
  })
}

async function backgroundRefreshFreePool() {
  if (freePoolRefreshing) return
  freePoolRefreshing = true
  freeConfigState.poolRefreshing = true
  sendFreePoolStatus()

  try {
    // 1. Fetch all sources
    const { texts, sourceCount } = await fetchAllFreeSources()
    if (texts.length === 0) return

    // 2. Parse all protocols from combined content
    const combined = texts.join('\n')
    const records = parseAllProtocols(combined)
    if (records.length === 0) return

    // 3. Deduplicate by id (stable hash of uri)
    const seen = new Set()
    const unique = records.filter((r) => {
      if (!r.node.valid || !r.node.host || !r.node.port) return false
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })

    // 4. Re-validate existing pool first (remove dead servers)
    const { testServerBatch } = require('./server-latency.cjs')
    await revalidateFreePool(async (inputs) => testServerBatch(inputs)).catch(() => {})

    // 5. Ping-test new candidates in chunks to avoid overwhelming the network
    const CHUNK = 80
    const now = new Date().toISOString()
    let totalMerged = 0

    for (let i = 0; i < unique.length; i += CHUNK) {
      if (freeConfigState.userDisconnected === false && freePoolRefreshing === false) break
      const chunk = unique.slice(i, i + CHUNK)
      const inputs = chunk.map((r) => ({ id: r.id, host: r.node.host, port: r.node.port }))
      const result = await testServerBatch(inputs)
      const latencyMap = new Map(result.results.map((r) => [r.id, r]))

      const toStore = chunk
        .filter((r) => {
          const lr = latencyMap.get(r.id)
          return lr && lr.reachable && typeof lr.latencyMs === 'number' && lr.latencyMs < PING_THRESHOLD_MS
        })
        .map((r) => ({
          id: r.id,
          uri: r.uri,
          name: r.node.name ?? r.node.protocol,
          protocol: r.node.protocol,
          host: r.node.host,
          port: r.node.port,
          latencyMs: latencyMap.get(r.id)?.latencyMs ?? null,
          lastTestedAt: now,
          addedAt: now,
        }))

      if (toStore.length > 0) {
        await mergeFreeServers(toStore).catch(() => {})
        totalMerged += toStore.length
      }
    }

    const refreshedAt = new Date().toISOString()
    await updateFreePoolMeta({ lastRefreshedAt: refreshedAt, sourceCount }).catch(() => {})
    freeConfigState.poolLastRefreshedAt = refreshedAt

    const meta = await getFreePoolMeta().catch(() => null)
    if (meta) {
      freeConfigState.poolCount = meta.total
      freeConfigState.poolDisplaying = meta.displaying
    }

    sendFreePoolStatus()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('free:pool-updated', {
        count: meta?.total ?? 0,
        displaying: meta?.displaying ?? 0,
        refreshedAt,
      })
    }
  } catch {
    // Best-effort background refresh; do not surface errors.
  } finally {
    freePoolRefreshing = false
    freeConfigState.poolRefreshing = false
    sendFreePoolStatus()
  }
}

function sendFreePoolStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('free:pool-status', {
      poolCount: freeConfigState.poolCount,
      poolDisplaying: freeConfigState.poolDisplaying,
      poolLastRefreshedAt: freeConfigState.poolLastRefreshedAt,
      poolRefreshing: freeConfigState.poolRefreshing,
    })
  }
}

function startFreeBackgroundRefresh() {
  backgroundRefreshFreePool().catch(() => {})
  freeBackgroundTimer = setInterval(() => {
    backgroundRefreshFreePool().catch(() => {})
  }, FREE_BACKGROUND_INTERVAL_MS)
}

async function tryConnectFreeNode(record, directDomains, rescueOptions) {
  const enginePath = getEnginePath()
  const userDataPath = app.getPath('userData')

  async function attempt(options) {
    try {
      const configResult = await createAndCheckConfig({
        subscriptionUrl: FREE_CONFIG_SOURCES[0],
        nodeId: record.id,
        nodeUri: record.uri,
        enginePath,
        userDataPath,
        directDomains: directDomains ?? [],
        rescueOptions: options,
        runtimeDirectoryName: 'free-runtime',
        configFileName: 'free-config.json',
        localPort: 2080,
        setSystemProxy: true,
      })
      if (!configResult.success) return null

      await backupWindowsProxyState(userDataPath).catch(() => {})

      const started = await startLocalProxy({ enginePath, userDataPath, configPath: configResult.configPath })
      if (!started.success) return null

      const proxyWorks = await testProxyConnectivity(2080)
      if (!proxyWorks) {
        await stopLocalProxy({ userDataPath }).catch(() => {})
        return null
      }

      return configResult.configPath
    } catch {
      return null
    }
  }

  // First attempt: with current rescue options (or none)
  const firstResult = await attempt(rescueOptions ?? null)
  if (firstResult) return firstResult

  // Auto DPI bypass retry: if dpiBypassAuto is enabled and rescue is not already forcing dpiBypass
  const dpiBypassAuto = rescueOptions?.dpiBypassAuto !== false
  const alreadyUsingDpi = rescueOptions?.dpiBypass === true
  if (dpiBypassAuto && !alreadyUsingDpi) {
    sendFreeProgress('تلاش مجدد با DPI Bypass...', 'connecting')
    const dpiOptions = {
      ...(rescueOptions ?? {}),
      enabled: true,
      recordFragment: true,
      dpiBypass: true,
    }
    return attempt(dpiOptions)
  }

  return null
}

async function testFreeNodes(records) {
  const { testServerBatch } = require('./server-latency.cjs')
  const inputs = records
    .filter((r) => r.node.valid && r.node.host && r.node.port)
    .map((r) => ({ id: r.id, host: r.node.host, port: r.node.port }))
  if (inputs.length === 0) return []
  const result = await testServerBatch(inputs)
  return result.results
}

async function runFreeConnect({ directDomains, rescueOptions, fetchFresh }) {
  freeConfigState.userDisconnected = false

  try {
    assertBpbInactive()
  } catch (err) {
    return { success: false, nodeId: null, nodeName: null, latencyMs: null, error: err.message }
  }

  const mainStatus = getProcessStatus()
  if (mainStatus.running) {
    try {
      await stopLocalProxy({ userDataPath: app.getPath('userData') })
    } catch {
      // Best-effort stop.
    }
  }

  // First: try from stored pool (fast path — already tested, below threshold)
  const storedPool = await getAllFreePool().catch(() => [])
  if (storedPool.length > 0) {
    sendFreeProgress('در حال اتصال از مخزن سرورهای ذخیره‌شده...', 'connecting')
    // REALITY priority: sort REALITY servers first, then by latency
    const REALITY_POOL_PROTOCOLS = new Set(['vless', 'vmess', 'trojan'])
    const sortedPool = [...storedPool].sort((a, b) => {
      const aIsReality = REALITY_POOL_PROTOCOLS.has((a.protocol || '').toLowerCase()) && (a.security || '').toLowerCase() === 'reality'
      const bIsReality = REALITY_POOL_PROTOCOLS.has((b.protocol || '').toLowerCase()) && (b.security || '').toLowerCase() === 'reality'
      if (aIsReality !== bIsReality) return aIsReality ? -1 : 1
      return (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999)
    })
    for (const stored of sortedPool.slice(0, FREE_CONNECT_ATTEMPTS)) {
      const record = {
        id: stored.id,
        uri: stored.uri,
        node: { valid: true, host: stored.host, port: stored.port, name: stored.name, protocol: stored.protocol, transport: null, tls: false, security: null },
      }
      sendFreeProgress(`اتصال به ${stored.name} (${stored.latencyMs ?? '?'} ms)...`, 'connecting')
      const configPath = await tryConnectFreeNode(record, directDomains, rescueOptions)
      if (configPath) {
        freeConfigState.phase = 'connected'
        freeConfigState.nodeId = stored.id
        freeConfigState.nodeName = stored.name
        freeConfigState.latencyMs = stored.latencyMs
        freeConfigState.error = null
        await markFreeSuccess(stored.id).catch(() => {})
        setVirtualLocationConnected(true)
        sendFreeProgress(`متصل شد: ${stored.name}`, 'connected')
        return { success: true, nodeId: stored.id, nodeName: stored.name, latencyMs: stored.latencyMs, error: null }
      }
    }
  }

  // Fallback: fetch fresh from all sources
  sendFreeProgress(`در حال دریافت سرورها از ${FREE_CONFIG_SOURCES.length} منبع...`, 'fetching')
  let records = []
  try {
    const { texts } = await fetchAllFreeSources()
    const combined = texts.join('\n')
    records = parseAllProtocols(combined)
  } catch {
    // Nothing fetched — pool already tried above
  }

  if (records.length === 0) {
    freeConfigState.phase = 'error'
    freeConfigState.error = 'هیچ سرور رایگانی در دسترس نیست. اتصال به اینترنت را بررسی کنید.'
    sendFreeProgress(freeConfigState.error, 'error')
    return { success: false, nodeId: null, nodeName: null, latencyMs: null, error: freeConfigState.error }
  }

  sendFreeProgress(`در حال بررسی پینگ ${records.length} سرور...`, 'testing')
  const latencyResults = await testFreeNodes(records)
  const latencyMap = new Map(latencyResults.map((r) => [r.id, r]))

  const reachable = records
    .filter((r) => {
      const lr = latencyMap.get(r.id)
      return lr && lr.reachable && typeof lr.latencyMs === 'number' && lr.latencyMs < PING_THRESHOLD_MS
    })
    .sort((a, b) => {
      const la = latencyMap.get(a.id)?.latencyMs ?? 999999
      const lb = latencyMap.get(b.id)?.latencyMs ?? 999999
      return la - lb
    })

  if (reachable.length > 0) {
    const now = new Date().toISOString()
    const toStore = reachable.map((r) => ({
      id: r.id,
      uri: r.uri,
      name: r.node.name ?? r.node.protocol,
      protocol: r.node.protocol,
      host: r.node.host,
      port: r.node.port,
      latencyMs: latencyMap.get(r.id)?.latencyMs ?? null,
      lastTestedAt: now,
      addedAt: now,
    }))
    await mergeFreeServers(toStore).catch(() => {})
    const meta = await getFreePoolMeta().catch(() => null)
    if (meta) {
      freeConfigState.poolCount = meta.total
      freeConfigState.poolDisplaying = meta.displaying
      freeConfigState.poolLastRefreshedAt = meta.lastRefreshedAt
    }
    sendFreePoolStatus()
  }

  if (reachable.length === 0) {
    freeConfigState.phase = 'error'
    freeConfigState.error = 'هیچ سروری با پینگ زیر ۴۰۰ میلی‌ثانیه پیدا نشد.'
    sendFreeProgress(freeConfigState.error, 'error')
    return { success: false, nodeId: null, nodeName: null, latencyMs: null, error: freeConfigState.error }
  }

  const candidates = reachable.slice(0, FREE_CONNECT_ATTEMPTS)
  sendFreeProgress('در حال اتصال به سریع‌ترین سرور...', 'connecting')

  for (const record of candidates) {
    const lr = latencyMap.get(record.id)
    sendFreeProgress(`اتصال به ${record.node.name ?? record.id} (${lr?.latencyMs ?? '?'} ms)...`, 'connecting')

    const configPath = await tryConnectFreeNode(record, directDomains, rescueOptions)
    if (configPath) {
      const nodeName = record.node.name ?? record.node.protocol
      const latencyMs = lr?.latencyMs ?? null

      freeConfigState.phase = 'connected'
      freeConfigState.nodeId = record.id
      freeConfigState.nodeName = nodeName
      freeConfigState.latencyMs = latencyMs
      freeConfigState.error = null

      await markFreeSuccess(record.id).catch(() => {})
      setVirtualLocationConnected(true)

      sendFreeProgress(`متصل شد: ${nodeName}`, 'connected')

      return { success: true, nodeId: record.id, nodeName, latencyMs, error: null }
    }
  }

  freeConfigState.phase = 'error'
  freeConfigState.error = 'هیچ‌کدام از سرورهای آزمایش‌شده قابل اتصال نبودند.'
  sendFreeProgress(freeConfigState.error, 'error')
  return { success: false, nodeId: null, nodeName: null, latencyMs: null, error: freeConfigState.error }
}

// Register auto-reconnect on unexpected engine exit
setProcessExitCallback(({ code }) => {
  if (freeConfigState.userDisconnected) return
  if (freeConfigState.phase !== 'connected') return
  if (code === 0) return

  freeConfigState.phase = 'reconnecting'
  sendFreeProgress('اتصال قطع شد. جستجوی خودکار سرور جایگزین...', 'reconnecting')

  setTimeout(() => {
    runFreeConnect({
      directDomains: [],
      rescueOptions: null,
      fetchFresh: false,
    }).catch(() => {
      freeConfigState.phase = 'error'
      freeConfigState.error = 'اتصال مجدد ناموفق بود.'
      sendFreeProgress('اتصال مجدد ناموفق بود.', 'error')
    })
  }, 1500)
})

function getProductionLogPath() {
  return path.join(
    app.getPath(
      'userData',
    ),
    'production-renderer.log',
  )
}

function appendProductionLog(
  message,
) {
  try {
    const line =
      `[${new Date().toISOString()}] ${message}\n`

    fs.appendFileSync(
      getProductionLogPath(),
      line,
      'utf8',
    )
  } catch {
    // Logging must never crash the application.
  }
}

function createProductionErrorHtml(
  title,
  details,
) {
  const safeTitle =
    String(title)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  const safeDetails =
    String(details)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta
    name="viewport"
    content="width=device-width,initial-scale=1"
  >
  <title>${safeTitle}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0b1120;
      color: #f8fafc;
      font-family: Tahoma, Arial, sans-serif;
    }

    main {
      width: min(720px, calc(100% - 40px));
      border: 1px solid #334155;
      background: #111827;
      padding: 28px;
    }

    h1 {
      margin: 0 0 14px;
      font-size: 22px;
    }

    p {
      color: #cbd5e1;
      line-height: 1.9;
    }

    pre {
      direction: ltr;
      text-align: left;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      background: #020617;
      border: 1px solid #1e293b;
      padding: 14px;
      color: #fca5a5;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <main>
    <h1>${safeTitle}</h1>
    <p>
      رابط برنامه بارگیری نشد. متن زیر را برای
      بررسی نگه دار:
    </p>
    <pre>${safeDetails}</pre>
  </main>
</body>
</html>`
}

async function handleFatalProcessError(
  label,
  error,
) {
  console.error(
    `[Electron] ${label}:`,
    error instanceof Error
      ? error.stack ||
        error.message
      : error,
  )

  if (fatalCleanupStarted) {
    return
  }

  fatalCleanupStarted = true

  try {
    await emergencyDispose()
  } catch {
    // Fatal cleanup is best effort.
  }

  clearSubscriptionNodeCache()

  if (app.isReady()) {
    app.exit(1)
  } else {
    process.exitCode = 1
  }
}

console.log(
  '[Electron] Main process started',
)

console.log(
  '[Electron] Development mode:',
  isDevelopment,
)

function getBundledEnginePath() {
  if (isDevelopment) {
    return path.join(
      __dirname,
      '..',
      'resources',
      'sing-box',
      'sing-box.exe',
    )
  }

  return path.join(
    process.resourcesPath,
    'sing-box',
    'sing-box.exe',
  )
}

function getEnginePath() {
  if (app.isReady()) {
    const userEnginePath =
      getUserEnginePath(
        app.getPath(
          'userData',
        ),
      )

    if (
      fs.existsSync(
        userEnginePath,
      )
    ) {
      return userEnginePath
    }
  }

  return getBundledEnginePath()
}


async function getEngineInfo() {
  const enginePath =
    getEnginePath()

  console.log(
    '[Engine] Checking path:',
    enginePath,
  )

  const exists =
    fs.existsSync(enginePath)

  console.log(
    '[Engine] File exists:',
    exists,
  )

  if (!exists) {
    return {
      installed: false,
      healthy: false,
      path: enginePath,
      version: null,
      architecture: null,
      error:
        'فایل sing-box.exe پیدا نشد.',
    }
  }

  try {
    const {
      stdout,
      stderr,
    } = await execFileAsync(
      enginePath,
      ['version'],
      {
        windowsHide: true,
        timeout: 10000,
        encoding: 'utf8',
      },
    )

    const output =
      `${stdout}\n${stderr}`.trim()

    const versionMatch =
      output.match(
        /sing-box version\s+([^\s]+)/i,
      )

    const environmentMatch =
      output.match(
        /Environment:\s+[^\s]+\s+([^\r\n]+)/i,
      )

    return {
      installed: true,
      healthy: true,
      path: enginePath,
      version:
        versionMatch?.[1] ??
        'نامشخص',
      architecture:
        environmentMatch?.[1]
          ?.trim() ?? null,
      error: null,
    }
  } catch (error) {
    console.error(
      '[Engine] Version check failed:',
      error,
    )

    return {
      installed: true,
      healthy: false,
      path: enginePath,
      version: null,
      architecture: null,
      error:
        error instanceof Error
          ? error.message
          : 'اجرای sing-box با خطا مواجه شد.',
    }
  }
}

function createProcessErrorResult(
  error,
) {
  return {
    success: false,
    ...getProcessStatus(),
    error:
      error instanceof Error
        ? error.message
        : 'عملیات sing-box ناموفق بود.',
  }
}

async function getVirtualLocationExtensionPath() {
  return ensureVirtualLocationExtension(
    app.getPath(
      'userData',
    ),
  )
}


function getBpbUrlByType(
  profile,
  type,
) {
  const mapping = {
    normal:
      profile?.normalUrl,
    fragment:
      profile?.fragmentUrl,
    raw:
      profile?.rawUrl,
    warp:
      profile?.warpUrl,
  }

  const url =
    mapping[type]

  if (
    typeof url !==
      'string' ||
    !url.trim()
  ) {
    throw new Error(
      'لینک اشتراک انتخاب‌شده BPB ثبت نشده است.',
    )
  }

  return url.trim()
}

function assertBpbInactive() {
  const status =
    getBpbStatus()

  if (
    status.running ||
    status.ready ||
    status.connected
  ) {
    throw new Error(
      'ابتدا اتصال مستقل BPB را قطع کن.',
    )
  }
}



function normalizeBpbPanelUrl(
  value,
) {
  try {
    const url =
      new URL(
        String(value),
      )

    if (
      url.protocol !== 'https:'
    ) {
      throw new Error(
        'پنل BPB باید با HTTPS باز شود.',
      )
    }

    if (
      !/(\.pages\.dev|\.workers\.dev)$/i.test(
        url.hostname,
      )
    ) {
      throw new Error(
        'دامنه پنل BPB معتبر نیست.',
      )
    }

    if (
      !url.pathname ||
      url.pathname === '/'
    ) {
      url.pathname =
        '/panel'
    }

    return url.toString()
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : 'آدرس پنل BPB معتبر نیست.',
    )
  }
}

function openBpbPanelWindow(
  rawUrl,
) {
  const panelUrl =
    normalizeBpbPanelUrl(
      rawUrl,
    )

  if (
    bpbPanelWindow &&
    !bpbPanelWindow.isDestroyed()
  ) {
    void bpbPanelWindow.loadURL(
      panelUrl,
    )
    bpbPanelWindow.show()
    bpbPanelWindow.focus()
    return panelUrl
  }

  bpbPanelWindow =
    new BrowserWindow({
      width: 1180,
      height: 820,
      minWidth: 860,
      minHeight: 620,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#0b1120',
      title:
        'BPB Panel — HamidsDeutsch Connect',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent:
          false,
      },
    })

  bpbPanelWindow.webContents.setWindowOpenHandler(
    ({ url }) => {
      try {
        const parsed =
          new URL(url)

        if (
          parsed.protocol === 'https:' ||
          parsed.protocol === 'http:'
        ) {
          void shell.openExternal(url)
        }
      } catch {
        // Ignore invalid URLs.
      }

      return {
        action: 'deny',
      }
    },
  )

  bpbPanelWindow.webContents.on(
    'will-navigate',
    (event, url) => {
      try {
        const parsed =
          new URL(url)

        if (
          parsed.protocol !== 'https:'
        ) {
          event.preventDefault()
        }
      } catch {
        event.preventDefault()
      }
    },
  )

  bpbPanelWindow.once(
    'ready-to-show',
    () => {
      bpbPanelWindow?.show()
    },
  )

  bpbPanelWindow.on(
    'closed',
    () => {
      bpbPanelWindow = null
    },
  )

  void bpbPanelWindow.loadURL(
    panelUrl,
  )

  return panelUrl
}



async function connectBpbAutomatically({
  panelUrl,
  directDomains = [],
  rescueOptions = null,
}) {
  const mainStatus =
    getProcessStatus()

  if (
    mainStatus.running ||
    mainStatus.ready
  ) {
    throw new Error(
      'ابتدا اتصال اصلی برنامه را قطع کن.',
    )
  }

  const currentBpbStatus =
    getBpbStatus()

  if (
    currentBpbStatus.running
  ) {
    await stopBpbProxy({
      userDataPath:
        app.getPath(
          'userData',
        ),
    })
  }

  const profileResult =
    await loadBpbProfile(
      app.getPath(
        'userData',
      ),
    )

  const currentProfile =
    profileResult.success
      ? profileResult.profile
      : {
          id: '',
          name:
            'BPB شخصی',
          normalUrl: '',
          fragmentUrl: '',
          rawUrl: '',
          panelUrl: '',
          activeType:
            'normal',
          updatedAt: null,
        }

  const wizardStatus =
    await getWizardStatus()

  const effectivePanelUrl =
    typeof panelUrl ===
      'string' &&
    panelUrl.trim()
      ? panelUrl.trim()
      : (
          currentProfile.panelUrl ||
          wizardStatus.panelUrl ||
          ''
        )

  if (!effectivePanelUrl) {
    throw new Error(
      'آدرس پنل BPB هنوز ثبت نشده است. ابتدا پنل را با Wizard بساز.',
    )
  }

  let normalUrl =
    currentProfile.normalUrl

  let fragmentUrl =
    currentProfile.fragmentUrl

  let rawUrl =
    currentProfile.rawUrl

  if (!normalUrl) {
    const discovered =
      await discoverBpbPanel({
        panelUrl:
          effectivePanelUrl,
      })

    normalUrl =
      discovered.normalUrl

    fragmentUrl =
      discovered.fragmentUrl

    rawUrl =
      discovered.rawUrl

    const saved =
      await saveBpbProfile(
        app.getPath(
          'userData',
        ),
        {
          ...currentProfile,
          ...discovered,
          panelUrl:
            discovered.panelUrl,
          normalUrl,
          fragmentUrl,
          rawUrl,
          warpUrl:
            discovered.warpUrl,
          activeType:
            rawUrl
              ? 'raw'
              : normalUrl
                ? 'normal'
                : fragmentUrl
                  ? 'fragment'
                  : 'warp',
        },
      )

    if (!saved.success) {
      throw new Error(
        saved.error ||
        'ذخیره خودکار لینک‌های BPB ناموفق بود.',
      )
    }
  }

  const type =
    normalUrl
      ? 'normal'
      : fragmentUrl
        ? 'fragment'
        : rawUrl
          ? 'raw'
          : null

  const url =
    type === 'normal'
      ? normalUrl
      : type === 'fragment'
        ? fragmentUrl
        : rawUrl

  if (
    !type ||
    !url
  ) {
    throw new Error(
      'هیچ اشتراک قابل اتصال BPB پیدا نشد.',
    )
  }

  const source =
    await inspectBpbSource(
      url,
    )

  const preferredEndpoint =
    type === 'warp'
      ? null
      : await getPreferredEndpoint({
          userDataPath:
            app.getPath(
              'userData',
            ),
        })

  let configPath
  let selectedNodeId = null
  let selectedNodeName =
    `BPB ${type.toUpperCase()} Best Ping`

  if (
    source.mode ===
      'sing-box-json'
  ) {
    const imported =
      await importBpbJsonConfig({
        url,
        enginePath:
          getEnginePath(),
        userDataPath:
          app.getPath(
            'userData',
          ),
        type,
        localPort: 2081,
        preferredEndpoint,
      })

    configPath =
      imported.configPath
  } else {
    const loaded =
      await loadSubscriptionNodeRecords(
        url,
      )

    if (
      !loaded.success ||
      !Array.isArray(
        loaded.nodes,
      ) ||
      loaded.nodes.length ===
        0
    ) {
      throw new Error(
        loaded.error ||
        'اشتراک BPB هیچ سرور معتبری ندارد.',
      )
    }

    const latencyResult =
      await testServerBatch(
        loaded.nodes,
      )

    const fastestId =
      latencyResult.fastestServerId

    const node =
      loaded.nodes.find(
        (item) =>
          item.id ===
          fastestId,
      ) ??
      loaded.nodes[0]

    const record =
      loaded.records.find(
        (item) =>
          item.id ===
          node.id,
      )

    if (
      !record ||
      !node
    ) {
      throw new Error(
        'سریع‌ترین سرور BPB در اشتراک پیدا نشد.',
      )
    }

    const configResult =
      await createAndCheckConfig({
        subscriptionUrl:
          url,
        nodeId:
          record.id,
        nodeUri:
          applyPreferredEndpointToUri(
            record.uri,
            preferredEndpoint,
          ),
        enginePath:
          getEnginePath(),
        userDataPath:
          app.getPath(
            'userData',
          ),
        directDomains:
          Array.isArray(
            directDomains,
          )
            ? directDomains
            : [],
        rescueOptions:
          rescueOptions &&
          typeof rescueOptions ===
            'object'
            ? rescueOptions
            : null,
        runtimeDirectoryName:
          'bpb-runtime',
        configFileName:
          'bpb-auto-config.json',
        localPort: 2081,
        setSystemProxy: true,
      })

    if (
      !configResult.success
    ) {
      throw new Error(
        configResult.error ||
        'ساخت کانفیگ سریع BPB ناموفق بود.',
      )
    }

    configPath =
      configResult.configPath
    selectedNodeId =
      node.id
    selectedNodeName =
      node.name
  }

  const started =
    await startBpbProxy({
      enginePath:
        getEnginePath(),
      userDataPath:
        app.getPath(
          'userData',
        ),
      configPath,
      profileType:
        type,
      nodeId:
        selectedNodeId,
      nodeName:
        selectedNodeName,
    })

  if (
    !started.success ||
    !started.ready
  ) {
    throw new Error(
      started.error ||
      'پروکسی سریع BPB آماده نشد.',
    )
  }

  const verification =
    await verifyIpChange({
      proxyHost:
        '127.0.0.1',
      proxyPort: 2081,
    })

  if (
    !verification.success ||
    !verification.changed
  ) {
    await stopBpbProxy({
      userDataPath:
        app.getPath(
          'userData',
        ),
    })

    throw new Error(
      verification.error ||
      'IP خروجی BPB تغییر نکرد.',
    )
  }

  await markBpbConnected(
    true,
  )

  setVirtualLocationConnected(
    true,
  )

  return {
    success: true,
    status:
      getBpbStatus(),
    verification,
    configPath,
    selectedType:
      type,
    selectedNodeId,
    selectedNodeName,
    error: null,
  }
}


function registerIpcHandlers() {
  console.log('[IPC] Registering application handlers...')
  ipcMain.handle(
    'engine:get-info',
    async () => {
      return getEngineInfo()
    },
  )

  console.log('[IPC] Registering engine:check-for-update')

  ipcMain.removeHandler(
    'engine:check-for-update',
  )

  ipcMain.handle(
    'engine:check-for-update',
    async () => {
      try {
        const info =
          await getEngineInfo()

        return await checkLatestStable({
          currentVersion:
            info.version,
        })
      } catch (error) {
        return {
          success: false,
          currentVersion: null,
          latestVersion: null,
          updateAvailable: false,
          publishedAt: null,
          releaseUrl: null,
          assetName: null,
          assetUrl: null,
          assetDigest: null,
          error:
            error instanceof Error
              ? error.message
              : 'بررسی نسخه sing-box ناموفق بود.',
        }
      }
    },
  )

  console.log('[IPC] Registering engine:update-to-latest')

  ipcMain.removeHandler(
    'engine:update-to-latest',
  )

  ipcMain.handle(
    'engine:update-to-latest',
    async () => {
      try {
        const status =
          getProcessStatus()

        if (status.running) {
          return {
            success: false,
            updated: false,
            currentVersion: null,
            latestVersion: null,
            installedVersion: null,
            message: null,
            error:
              'پیش از به‌روزرسانی sing-box اتصال را قطع کن.',
          }
        }

        const info =
          await getEngineInfo()

        const result =
          await updateToLatestStable({
            currentVersion:
              info.version,
            targetDirectory:
              getUserEngineDirectory(
                app.getPath(
                  'userData',
                ),
              ),
          })

        return {
          success: true,
          error: null,
          ...result,
        }
      } catch (error) {
        return {
          success: false,
          updated: false,
          currentVersion: null,
          latestVersion: null,
          installedVersion: null,
          message: null,
          error:
            error instanceof Error
              ? error.message
              : 'به‌روزرسانی sing-box ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'system:get-privilege-status',
    async () => {
      return getWindowsPrivilegeStatus()
    },
  )

  ipcMain.handle(
    'system:open-virtual-location-extension',
    async () => {
      const extensionPath =
        await getVirtualLocationExtensionPath()

      if (!fs.existsSync(extensionPath)) {
        return {
          success: false,
          path:
            extensionPath,
          error:
            'پوشه افزونه مکان مجازی پیدا نشد.',
        }
      }

      const errorMessage =
        await shell.openPath(
          extensionPath,
        )

      if (errorMessage) {
        return {
          success: false,
          path:
            extensionPath,
          error:
            errorMessage,
        }
      }

      return {
        success: true,
        path:
          extensionPath,
        error: null,
      }
    },
  )

  ipcMain.handle(
    'system:set-virtual-location-connected',
    async (_event, connected) => {
      setVirtualLocationConnected(connected === true)
      return { success: true }
    },
  )

  ipcMain.handle(
    'system:set-direct-domains',
    async (_event, domains) => {
      setDirectDomains(Array.isArray(domains) ? domains : [])

      // If a subscription/free proxy is currently running, hot-rebuild the config
      // so bypass list changes take effect without a full reconnect.
      const procStatus = getProcessStatus()
      if (procStatus.running && activeConnectionParams) {
        try {
          const newDomains = Array.isArray(domains) ? domains : []
          const newConfigResult = await createAndCheckConfig({
            ...activeConnectionParams,
            directDomains: newDomains,
          })
          if (newConfigResult.success) {
            // Restart sing-box with the new config
            const enginePath = getEnginePath()
            const userDataPath = app.getPath('userData')
            await stopLocalProxy({ userDataPath }).catch(() => {})
            await backupWindowsProxyState(userDataPath).catch(() => {})
            await startLocalProxy({ enginePath, userDataPath, configPath: newConfigResult.configPath })
            activeConnectionParams = { ...activeConnectionParams, directDomains: newDomains }
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('bypass:reloaded', { domainCount: newDomains.length })
            }
          }
        } catch {
          // Best-effort — don't interrupt the user if hot-reload fails
        }
      }

      return { success: true }
    },
  )

  ipcMain.handle(
    'system:download-extension-zip',
    async () => {
      const { dialog } = require('electron')
      const archiver = null // no archiver dep — use PowerShell

      try {
        const extensionPath = await buildExtensionZip(app.getPath('userData'))

        const { filePath } = await dialog.showSaveDialog({
          title: 'ذخیره افزونه مرورگر',
          defaultPath: 'HamidsDeutsch-VirtualLocation.zip',
          filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        })

        if (!filePath) {
          return { success: false, error: 'لغو شد.' }
        }

        // Use PowerShell Compress-Archive to create ZIP
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Compress-Archive -Path "${extensionPath}\\*" -DestinationPath "${filePath}" -Force`,
        ])

        return { success: true, path: filePath, error: null }
      } catch (err) {
        return { success: false, error: err?.message ?? 'ساخت ZIP ناموفق بود.' }
      }
    },
  )

  ipcMain.handle(
    'system:relaunch-as-administrator',
    async () => {
      const privilege =
        await getWindowsPrivilegeStatus()

      if (
        privilege.supported &&
        privilege.isAdministrator
      ) {
        return {
          success: true,
          launched: false,
          alreadyAdministrator: true,
          error: null,
        }
      }

      try {
        const result =
          await relaunchAsAdministrator({
            isDevelopment,
            appPath:
              app.getAppPath(),
            executablePath:
              process.execPath,
          })

        if (
          result.success &&
          result.launched
        ) {
          setTimeout(() => {
            app.quit()
          }, 700)
        }

        return {
          ...result,
          alreadyAdministrator: false,
        }
      } catch (error) {
        return {
          success: false,
          launched: false,
          alreadyAdministrator: false,
          error:
            error instanceof Error
              ? error.message
              : 'اجرای مجدد با دسترسی Administrator ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'engine:start-local-proxy',
    async () => {
      try {
        assertBpbInactive()
        const result =
          await startLocalProxy({
            enginePath:
              getEnginePath(),
            userDataPath:
              app.getPath(
                'userData',
              ),
          })

        console.log(
          '[Engine] Local proxy start:',
          result.success,
          result.ready,
        )

        return result
      } catch (error) {
        console.error(
          '[Engine] Local proxy start failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return createProcessErrorResult(
          error,
        )
      }
    },
  )

  ipcMain.handle(
    'engine:start-tun',
    async () => {
      try {
        assertBpbInactive()
        const privilege =
          await getWindowsPrivilegeStatus()

        if (
          !privilege.supported ||
          !privilege.isAdministrator
        ) {
          return {
            success: false,
            ...getProcessStatus(),
            error:
              'اجرای TUN به دسترسی Administrator نیاز دارد.',
          }
        }

        const result =
          await startTunMode({
            enginePath:
              getEnginePath(),
            userDataPath:
              app.getPath(
                'userData',
              ),
          })

        console.log(
          '[Engine] TUN start:',
          result.success,
          result.ready,
        )

        return result
      } catch (error) {
        console.error(
          '[Engine] TUN start failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return createProcessErrorResult(
          error,
        )
      }
    },
  )

  ipcMain.handle(
    'engine:activate-system-proxy',
    async () => {
      try {
        assertBpbInactive()
        const result =
          await activateSystemProxy({
            enginePath:
              getEnginePath(),
            userDataPath:
              app.getPath(
                'userData',
              ),
          })

        console.log(
          '[Engine] System proxy activation:',
          result.success,
          result.systemProxyEnabled,
        )

        return result
      } catch (error) {
        console.error(
          '[Engine] System proxy activation failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return createProcessErrorResult(
          error,
        )
      }
    },
  )

  ipcMain.handle(
    'engine:deactivate-system-proxy',
    async (
      _event,
      keepLocalProxy,
    ) => {
      try {
        const result =
          await deactivateSystemProxy({
            enginePath:
              getEnginePath(),
            userDataPath:
              app.getPath(
                'userData',
              ),
            keepLocalProxy:
              Boolean(
                keepLocalProxy,
              ),
          })

        console.log(
          '[Engine] System proxy deactivation:',
          result.success,
        )

        return result
      } catch (error) {
        console.error(
          '[Engine] System proxy deactivation failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return createProcessErrorResult(
          error,
        )
      }
    },
  )

  ipcMain.handle(
    'engine:stop-local-proxy',
    async () => {
      activeConnectionParams = null
      try {
        const result =
          await stopLocalProxy({
            userDataPath:
              app.getPath(
                'userData',
              ),
          })

        console.log(
          '[Engine] Local proxy stop:',
          result.success,
        )

        return result
      } catch (error) {
        console.error(
          '[Engine] Local proxy stop failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return createProcessErrorResult(
          error,
        )
      }
    },
  )

  ipcMain.handle(
    'engine:get-process-status',
    async () => {
      return getProcessStatus()
    },
  )

  ipcMain.handle(
    'network:verify-ip-change',
    async () => {
      const processStatus =
        getProcessStatus()

      if (
        !processStatus.running ||
        !processStatus.ready
      ) {
        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          directIp: null,
          proxyIp: null,
          changed: false,
          directDurationMs: null,
          proxyDurationMs: null,
          service:
            'api.ipify.org',
          error:
            'پروکسی محلی هنوز آماده نیست.',
        }
      }

      try {
        const result =
          await verifyIpChange({
            proxyHost:
              processStatus.localHost,
            proxyPort:
              processStatus.localPort,
          })

        console.log(
          '[Network] IP verification:',
          result.changed,
          result.directIp,
          result.proxyIp,
        )

        return result
      } catch (error) {
        console.error(
          '[Network] IP verification failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          directIp: null,
          proxyIp: null,
          changed: false,
          directDurationMs: null,
          proxyDurationMs: null,
          service:
            'api.ipify.org',
          error:
            error instanceof Error
              ? error.message
              : 'بررسی تغییر IP ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'network:get-current-ip',
    async () => {
      try {
        return await getCurrentIpSnapshot()
      } catch (error) {
        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          ip: null,
          durationMs: null,
          service: null,
          error:
            error instanceof Error
              ? error.message
              : 'دریافت IP فعلی ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'bpb-cloudflare:get-status',
    async () => getCloudflareBpbStatus({ userDataPath: app.getPath('userData') }),
  )

  ipcMain.handle(
    'bpb-cloudflare:login',
    async () => {
      try {
        return await loginCloudflare({ userDataPath: app.getPath('userData') })
      } catch (error) {
        return { success: false, accountId: null, accountName: null, error: error instanceof Error ? error.message : 'اتصال حساب Cloudflare ناموفق بود.' }
      }
    },
  )

  ipcMain.handle(
    'bpb-cloudflare:deploy',
    async () => {
      try {
        const deployed = await deployBpbPanel({ userDataPath: app.getPath('userData') })
        if (!deployed.success) return deployed
        const current = await loadBpbProfile(app.getPath('userData'))
        const saved = await saveBpbProfile(app.getPath('userData'), { ...current.profile, ...deployed.profile })
        return { ...deployed, profile: saved.profile }
      } catch (error) {
        return { success: false, profile: null, deployment: null, error: error instanceof Error ? error.message : 'ساخت پنل BPB ناموفق بود.' }
      }
    },
  )

  ipcMain.handle(
    'bpb-cloudflare:update-panel',
    async () => {
      try {
        return await updateBpbPanel({ userDataPath: app.getPath('userData') })
      } catch (error) {
        return { success: false, panelUrl: null, error: error instanceof Error ? error.message : 'به‌روزرسانی پنل BPB ناموفق بود.' }
      }
    },
  )

  ipcMain.handle(
    'bpb-optimizer:get-state',
    async () => {
      return getOptimizerState({
        userDataPath:
          app.getPath(
            'userData',
          ),
      })
    },
  )

  ipcMain.handle(
    'bpb-optimizer:scan',
    async (
      _event,
      input,
    ) => {
      try {
        const profileResult =
          await loadBpbProfile(
            app.getPath(
              'userData',
            ),
          )

        const panelUrl =
          typeof input?.panelUrl ===
            'string' &&
          input.panelUrl.trim()
            ? input.panelUrl.trim()
            : profileResult
                .profile
                .panelUrl

        if (!panelUrl) {
          throw new Error(
            'ابتدا پنل BPB را بساز یا شناسایی کن.',
          )
        }

        return await scanCloudflareEndpoints({
          userDataPath:
            app.getPath(
              'userData',
            ),
          panelUrl,
          sampleCount:
            input?.sampleCount,
        })
      } catch (error) {
        return {
          success: false,
          state:
            await getOptimizerState({
              userDataPath:
                app.getPath(
                  'userData',
                ),
            }),
          error:
            error instanceof Error
              ? error.message
              : 'اسکن Cloudflare ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'bpb-optimizer:set-enabled',
    async (
      _event,
      enabled,
    ) => {
      try {
        const state =
          await setOptimizerEnabled({
            userDataPath:
              app.getPath(
                'userData',
              ),
            enabled:
              enabled === true,
          })

        const profileResult =
          await loadBpbProfile(
            app.getPath(
              'userData',
            ),
          )

        if (
          profileResult.success
        ) {
          await saveBpbProfile(
            app.getPath(
              'userData',
            ),
            {
              ...profileResult.profile,
              optimizerEnabled:
                enabled === true,
            },
          )
        }

        return {
          success: true,
          state,
          error: null,
        }
      } catch (error) {
        return {
          success: false,
          state:
            await getOptimizerState({
              userDataPath:
                app.getPath(
                  'userData',
                ),
            }),
          error:
            error instanceof Error
              ? error.message
              : 'تغییر وضعیت بهینه‌ساز ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'bpb-optimizer:clear',
    async () => {
      try {
        return {
          success: true,
          state:
            await clearOptimizerState({
              userDataPath:
                app.getPath(
                  'userData',
                ),
            }),
          error: null,
        }
      } catch (error) {
        return {
          success: false,
          state:
            await getOptimizerState({
              userDataPath:
                app.getPath(
                  'userData',
                ),
            }),
          error:
            error instanceof Error
              ? error.message
              : 'پاک‌کردن نتایج بهینه‌ساز ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'bpb:auto-discover',
    async (
      _event,
      panelUrl,
    ) => {
      try {
        const profileResult =
          await loadBpbProfile(
            app.getPath(
              'userData',
            ),
          )

        const effectivePanelUrl =
          typeof panelUrl ===
            'string' &&
          panelUrl.trim()
            ? panelUrl.trim()
            : profileResult
                .profile
                .panelUrl

        const discovered =
          await discoverBpbPanel({
            panelUrl:
              effectivePanelUrl,
          })

        const activeType =
          discovered.rawUrl
            ? 'raw'
            : discovered.normalUrl
              ? 'normal'
              : discovered.fragmentUrl
                ? 'fragment'
                : 'warp'

        const saved =
          await saveBpbProfile(
            app.getPath(
              'userData',
            ),
            {
              ...profileResult.profile,
              ...discovered,
              activeType,
            },
          )

        return {
          ...discovered,
          profile:
            saved.profile,
        }
      } catch (error) {
        return {
          success: false,
          panelUrl: null,
          subPath: null,
          panelVersion: null,
          chainEnabled: false,
          normalUrl: '',
          fragmentUrl: '',
          rawUrl: '',
          warpUrl: '',
          normalMode: null,
          fragmentMode: null,
          rawMode: null,
          warpMode: null,
          profile: null,
          error:
            error instanceof Error
              ? error.message
              : 'خواندن مستقیم تنظیمات پنل BPB ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'bpb:quick-connect',
    async (
      _event,
      input,
    ) => {
      try {
        return await connectBpbAutomatically({
          panelUrl:
            input?.panelUrl,
          directDomains:
            input?.directDomains,
          rescueOptions:
            input?.rescueOptions,
        })
      } catch (error) {
        try {
          await stopBpbProxy({
            userDataPath:
              app.getPath(
                'userData',
              ),
          })
        } catch {
          // Best effort cleanup.
        }

        setVirtualLocationConnected(
          false,
        )

        return {
          success: false,
          status:
            getBpbStatus(),
          verification: null,
          configPath: null,
          selectedType: null,
          selectedNodeId: null,
          selectedNodeName: null,
          error:
            error instanceof Error
              ? error.message
              : 'اتصال سریع BPB ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'bpb:get-profile',
    async () => {
      return loadBpbProfile(
        app.getPath(
          'userData',
        ),
      )
    },
  )

  ipcMain.handle(
    'bpb:save-profile',
    async (
      _event,
      input,
    ) => {
      try {
        return await saveBpbProfile(
          app.getPath(
            'userData',
          ),
          input,
        )
      } catch (error) {
        return {
          success: false,
          profile: null,
          error:
            error instanceof Error
              ? error.message
              : 'ذخیره تنظیمات BPB ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'bpb:load-nodes',
    async (
      _event,
      input,
    ) => {
      try {
        const profileResult =
          await loadBpbProfile(
            app.getPath(
              'userData',
            ),
          )

        if (
          !profileResult.success
        ) {
          throw new Error(
            profileResult.error ||
            'خواندن پروفایل BPB ناموفق بود.',
          )
        }

        const type =
          [
            'normal',
            'fragment',
            'raw',
            'warp',
          ].includes(
            input?.type,
          )
            ? input.type
            : profileResult
                .profile
                .activeType

        const url =
          getBpbUrlByType(
            profileResult.profile,
            type,
          )

        const source =
          await inspectBpbSource(
            url,
          )

        if (
          source.mode ===
            'sing-box-json'
        ) {
          return {
            success: true,
            checkedAt:
              new Date().toISOString(),
            type,
            mode:
              'sing-box-json',
            nodes: [],
            error: null,
          }
        }

        const result =
          await loadSubscriptionNodeRecords(
            url,
          )

        return {
          success:
            result.success,
          checkedAt:
            result.checkedAt,
          type,
          mode:
            'uri-list',
          nodes:
            result.nodes.map(
              (node) => ({
                ...node,
                uri: result.records.find(
                  (record) => record.id === node.id,
                )?.uri ?? '',
              }),
            ),
          error:
            result.error,
        }
      } catch (error) {
        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          type:
            typeof input?.type ===
              'string'
              ? input.type
              : 'normal',
          mode: null,
          nodes: [],
          error:
            error instanceof Error
              ? error.message
              : 'بارگیری سرورهای BPB ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'bpb:connect',
    async (
      _event,
      input,
    ) => {
      try {
        const mainStatus =
          getProcessStatus()

        if (
          mainStatus.running ||
          mainStatus.ready
        ) {
          throw new Error(
            'ابتدا اتصال اصلی برنامه را قطع کن.',
          )
        }

        const currentBpbStatus =
          getBpbStatus()

        if (
          currentBpbStatus.running
        ) {
          await stopBpbProxy({
            userDataPath:
              app.getPath(
                'userData',
              ),
          })
        }

        const profileResult =
          await loadBpbProfile(
            app.getPath(
              'userData',
            ),
          )

        if (
          !profileResult.success
        ) {
          throw new Error(
            profileResult.error ||
            'خواندن پروفایل BPB ناموفق بود.',
          )
        }

        const type =
          [
            'normal',
            'fragment',
            'raw',
            'warp',
          ].includes(
            input?.type,
          )
            ? input.type
            : profileResult
                .profile
                .activeType

        const url =
          getBpbUrlByType(
            profileResult.profile,
            type,
          )

        const source =
          await inspectBpbSource(
            url,
          )

        const preferredEndpoint =
          type === 'warp'
            ? null
            : await getPreferredEndpoint({
                userDataPath:
                  app.getPath(
                    'userData',
                  ),
              })

        let configPath
        let selectedNodeId = null
        let selectedNodeName =
          type === 'warp' ? 'BPB Warp Best Ping' : `${type.toUpperCase()} BPB`

        if (
          source.mode ===
            'sing-box-json'
        ) {
          const imported =
            await importBpbJsonConfig({
              url,
              enginePath:
                getEnginePath(),
              userDataPath:
                app.getPath(
                  'userData',
                ),
              type,
              localPort: 2081,
              runtimeDirectoryName:
                type === 'warp'
                  ? 'bpb-warp-runtime'
                  : 'bpb-runtime',
              preferredEndpoint,
            })

          configPath =
            imported.configPath
        } else {
          let record = null
          let node = null

          if (typeof input?.nodeUri === 'string' && input.nodeUri.trim()) {
            record = { id: input?.nodeId || crypto.randomUUID(), uri: input.nodeUri.trim() }
            node = { id: record.id, name: input?.nodeName || 'BPB Server' }
          } else {
            const loaded = await loadSubscriptionNodeRecords(url)
            if (!loaded.success) {
              throw new Error(loaded.error || 'دریافت اشتراک BPB ناموفق بود.')
            }
            record = loaded.records.find((item) => item.id === input?.nodeId)
            node = loaded.nodes.find((item) => item.id === input?.nodeId)
          }

          if (!record || !node) {
            throw new Error('کانفیگ ذخیره‌شده این سرور پیدا نشد؛ دکمه به‌روزرسانی کانفیگ‌ها را بزن.')
          }

          const configResult =
            await createAndCheckConfig({
              subscriptionUrl:
                url,
              nodeId:
                record.id,
              nodeUri:
                applyPreferredEndpointToUri(
                  record.uri,
                  preferredEndpoint,
                ),
              enginePath:
                getEnginePath(),
              userDataPath:
                app.getPath(
                  'userData',
                ),
              directDomains:
                Array.isArray(
                  input?.directDomains,
                )
                  ? input.directDomains
                  : [],
              rescueOptions:
                input?.rescueOptions &&
                typeof input.rescueOptions ===
                  'object'
                  ? input.rescueOptions
                  : null,
              runtimeDirectoryName:
                'bpb-runtime',
              configFileName:
                'bpb-config.json',
              localPort: 2081,
              setSystemProxy: true,
            })

          if (
            !configResult.success
          ) {
            throw new Error(
              configResult.error ||
              'کانفیگ BPB معتبر نبود.',
            )
          }

          configPath =
            configResult.configPath
          selectedNodeId =
            node.id
          selectedNodeName =
            node.name
        }

        const started =
          await startBpbProxy({
            enginePath:
              getEnginePath(),
            userDataPath:
              app.getPath(
                'userData',
              ),
            configPath,
            profileType:
              type,
            nodeId:
              selectedNodeId,
            nodeName:
              selectedNodeName,
          })

        if (
          !started.success ||
          !started.ready
        ) {
          throw new Error(
            started.error ||
            'پروکسی BPB آماده نشد.',
          )
        }

        const verification =
          await verifyIpChange({
            proxyHost:
              '127.0.0.1',
            proxyPort: 2081,
          })

        if (
          !verification.success ||
          !verification.changed
        ) {
          await stopBpbProxy({
            userDataPath:
              app.getPath(
                'userData',
              ),
          })

          throw new Error(
            verification.error ||
            'IP خروجی BPB تغییر نکرد.',
          )
        }

        await markBpbConnected(
          true,
        )

        setVirtualLocationConnected(
          true,
        )

        if (
          selectedNodeId
        ) {
          try {
            await saveBpbProfile(
              app.getPath(
                'userData',
              ),
              {
                ...profileResult.profile,
                activeType:
                  type,
                lastSuccessfulNodeId:
                  selectedNodeId,
                lastSuccessfulNodeName:
                  selectedNodeName,
                lastSuccessfulType:
                  type,
              },
            )
          } catch {
            // Connection success must not depend on history persistence.
          }
        }

        return {
          success: true,
          status:
            getBpbStatus(),
          verification,
          configPath,
          error: null,
        }
      } catch (error) {
        try {
          await stopBpbProxy({
            userDataPath:
              app.getPath(
                'userData',
              ),
          })
        } catch {
          // Best effort cleanup.
        }

        setVirtualLocationConnected(
          false,
        )

        return {
          success: false,
          status:
            getBpbStatus(),
          verification: null,
          configPath: null,
          error:
            error instanceof Error
              ? error.message
              : 'اتصال BPB ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'bpb:disconnect',
    async () => {
      try {
        const result =
          await stopBpbProxy({
            userDataPath:
              app.getPath(
                'userData',
              ),
          })

        setVirtualLocationConnected(
          false,
        )

        return {
          success: true,
          status:
            result,
          error: null,
        }
      } catch (error) {
        return {
          success: false,
          status:
            getBpbStatus(),
          error:
            error instanceof Error
              ? error.message
              : 'قطع اتصال BPB ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'bpb:get-status',
    async () => {
      return getBpbStatus()
    },
  )

  ipcMain.handle(
    'subscriptions:list',
    async () => {
      return listSubscriptions()
    },
  )

  ipcMain.handle(
    'subscriptions:add',
    async (_event, input) => {
      try {
        const subscription =
          await addSubscription(
            input,
          )

        return {
          success: true,
          subscription,
          error: null,
        }
      } catch (error) {
        console.error(
          '[Subscriptions] Add failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          subscription: null,
          error:
            error instanceof Error
              ? error.message
              : 'ثبت اشتراک با خطا مواجه شد.',
        }
      }
    },
  )

  ipcMain.handle(
    'subscriptions:remove',
    async (
      _event,
      subscriptionId,
    ) => {
      try {
        await removeSubscription(
          subscriptionId,
        )

        removeSubscriptionNodes(
          subscriptionId,
        )

        return {
          success: true,
          error: null,
        }
      } catch (error) {
        console.error(
          '[Subscriptions] Remove failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'حذف اشتراک با خطا مواجه شد.',
        }
      }
    },
  )

  ipcMain.handle(
    'subscriptions:inspect',
    async (
      _event,
      subscriptionId,
    ) => {
      try {
        const subscriptionUrl =
          await getSubscriptionUrl(
            subscriptionId,
          )

        const inspection =
          await inspectSubscriptionUrl(
            subscriptionUrl,
          )

        console.log(
          '[Subscriptions] Inspection completed:',
          subscriptionId,
          inspection.success,
        )

        return inspection
      } catch (error) {
        console.error(
          '[Subscriptions] Inspection failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          httpStatus: null,
          httpStatusText: null,
          contentType: null,
          responseSize: null,
          format:
            'internal-error',
          configCount: 0,
          error:
            error instanceof Error
              ? error.message
              : 'بررسی اشتراک با خطا مواجه شد.',
        }
      }
    },
  )

  ipcMain.handle(
    'subscriptions:load-nodes',
    async (
      _event,
      subscriptionId,
    ) => {
      try {
        const subscriptionUrl =
          await getSubscriptionUrl(
            subscriptionId,
          )

        const result =
          await loadSubscriptionNodeRecords(
            subscriptionUrl,
          )

        if (result.success) {
          replaceSubscriptionNodes(
            subscriptionId,
            result.records,
          )
        }

        console.log(
          '[Subscriptions] Safe nodes loaded:',
          subscriptionId,
          result.nodes.length,
        )

        return {
          success:
            result.success,
          checkedAt:
            result.checkedAt,
          nodes:
            result.nodes,
          error:
            result.error,
        }
      } catch (error) {
        console.error(
          '[Subscriptions] Loading nodes failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          nodes: [],
          error:
            error instanceof Error
              ? error.message
              : 'دریافت سرورها با خطا مواجه شد.',
        }
      }
    },
  )

  ipcMain.handle(
    'servers:test-latency',
    async (
      _event,
      servers,
    ) => {
      try {
        const result =
          await testServerBatch(
            servers,
          )

        console.log(
          '[Servers] Latency test completed:',
          result.total,
          result.reachable,
        )

        return {
          success: true,
          ...result,
          error: null,
        }
      } catch (error) {
        console.error(
          '[Servers] Latency test failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          total: 0,
          reachable: 0,
          unreachable: 0,
          fastestServerId: null,
          fastestLatencyMs: null,
          results: [],
          error:
            error instanceof Error
              ? error.message
              : 'بررسی تأخیر سرورها ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'servers:check-config',
    async (_event, input) => {
      try {
        const subscriptionId =
          input?.subscriptionId

        const nodeId =
          input?.nodeId

        const directDomains =
          Array.isArray(
            input?.directDomains,
          )
            ? input.directDomains
            : []

        const rescueOptions =
          input?.rescueOptions &&
          typeof input.rescueOptions ===
            'object'
            ? input.rescueOptions
            : null

        const subscriptionUrl =
          await getSubscriptionUrl(
            subscriptionId,
          )

        const cachedNodeUri =
          getSubscriptionNodeUri(
            subscriptionId,
            nodeId,
          )

        if (!cachedNodeUri) {
          const refreshed =
            await loadSubscriptionNodeRecords(
              subscriptionUrl,
            )

          if (refreshed.success) {
            replaceSubscriptionNodes(
              subscriptionId,
              refreshed.records,
            )
          }
        }

        const nodeUri =
          getSubscriptionNodeUri(
            subscriptionId,
            nodeId,
          )

        if (!nodeUri) {
          throw new Error(
            'سرور انتخاب‌شده دیگر در حافظه امن اشتراک وجود ندارد. فهرست سرورها را یک‌بار تازه‌سازی کن.',
          )
        }

        const configParams = {
          subscriptionUrl,
          nodeId,
          nodeUri,
          enginePath:
            getEnginePath(),
          userDataPath:
            app.getPath(
              'userData',
            ),
          directDomains,
          rescueOptions,
        }
        const result =
          await createAndCheckConfig(configParams)

        if (result.success) {
          activeConnectionParams = configParams
        }

        console.log(
          '[Servers] Config check completed:',
          nodeId,
          result.success,
        )

        return result
      } catch (error) {
        console.error(
          '[Servers] Config check failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          nodeId:
            typeof input?.nodeId ===
            'string'
              ? input.nodeId
              : null,
          protocol: null,
          server: null,
          serverPort: null,
          configPath: null,
          directDomainCount: 0,
          stdout: '',
          error:
            error instanceof Error
              ? error.message
              : 'اعتبارسنجی کانفیگ ناموفق بود.',
        }
      }
    },

  ipcMain.handle(
    'servers:check-tun-config',
    async (_event, input) => {
      try {
        const subscriptionId =
          input?.subscriptionId

        const nodeId =
          input?.nodeId

        const directDomains =
          Array.isArray(
            input?.directDomains,
          )
            ? input.directDomains
            : []

        const rescueOptions =
          input?.rescueOptions &&
          typeof input.rescueOptions ===
            'object'
            ? input.rescueOptions
            : null

        const subscriptionUrl =
          await getSubscriptionUrl(
            subscriptionId,
          )

        const cachedNodeUri =
          getSubscriptionNodeUri(
            subscriptionId,
            nodeId,
          )

        if (!cachedNodeUri) {
          const refreshed =
            await loadSubscriptionNodeRecords(
              subscriptionUrl,
            )

          if (refreshed.success) {
            replaceSubscriptionNodes(
              subscriptionId,
              refreshed.records,
            )
          }
        }

        const nodeUri =
          getSubscriptionNodeUri(
            subscriptionId,
            nodeId,
          )

        if (!nodeUri) {
          throw new Error(
            'سرور انتخاب‌شده دیگر در حافظه امن اشتراک وجود ندارد. فهرست سرورها را یک‌بار تازه‌سازی کن.',
          )
        }

        const result =
          await createAndCheckTunConfig({
            subscriptionUrl,
            nodeId,
            nodeUri,
            enginePath:
              getEnginePath(),
            userDataPath:
              app.getPath(
                'userData',
              ),
            directDomains,
            rescueOptions,
          })

        console.log(
          '[Servers] TUN config check completed:',
          nodeId,
          result.success,
        )

        return result
      } catch (error) {
        console.error(
          '[Servers] TUN config check failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          mode: 'tun',
          nodeId:
            typeof input?.nodeId ===
            'string'
              ? input.nodeId
              : null,
          protocol: null,
          server: null,
          serverPort: null,
          configPath: null,
          interfaceName:
            'HamidsDeutsch',
          directDomainCount: 0,
          stdout: '',
          error:
            error instanceof Error
              ? error.message
              : 'اعتبارسنجی کانفیگ TUN ناموفق بود.',
        }
      }
    },
  )

  )

  // ── GitHub Codespace handlers ────────────────────────────────────────────

  ipcMain.handle('codespace:get-status', async () => {
    try {
      return await getCodespaceStatus(app.getPath('userData'))
    } catch (error) {
      return {
        hasToken: false,
        username: null,
        repoCreated: false,
        lastCodespaceName: null,
        lastCodespaceState: null,
        lastConnectedUuid: null,
      }
    }
  })

  ipcMain.handle('codespace:setup', async (_event, token) => {
    if (typeof token !== 'string' || !token.trim()) {
      return { success: false, error: 'توکن GitHub خالی است.' }
    }
    try {
      return await setupGitHub(app.getPath('userData'), token.trim())
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'راه‌اندازی GitHub ناموفق بود.',
      }
    }
  })

  ipcMain.handle('codespace:clear-token', async () => {
    try {
      const { settings } = await loadCodespaceSettings(app.getPath('userData'))
      await saveCodespaceSettings(app.getPath('userData'), {
        ...settings,
        token: null,
        username: null,
        repoCreated: false,
        lastCodespaceName: null,
        lastCodespaceState: null,
        lastConnectedUuid: null,
      })
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'خطا' }
    }
  })

  ipcMain.handle('codespace:connect', async (_event, directDomains) => {
    try {
      const connectResult = await connectViaCodespace(
        app.getPath('userData'),
        directDomains ?? [],
      )

      if (!connectResult.success) {
        return connectResult
      }

      const startResult = await startLocalProxy({
        userDataPath: app.getPath('userData'),
        enginePath: getEnginePath(),
        configPath: connectResult.configPath,
      })

      if (!startResult.success) {
        return { success: false, error: startResult.error ?? 'راه‌اندازی sing-box ناموفق بود.' }
      }

      return {
        success: true,
        codespaceName: connectResult.codespaceName,
        host: connectResult.host,
        error: null,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'اتصال Codespace ناموفق بود.',
      }
    }
  })

  ipcMain.handle('codespace:disconnect', async () => {
    try {
      const stopResult = await stopLocalProxy({
        userDataPath: app.getPath('userData'),
      })

      void disconnectCodespace(app.getPath('userData')).catch(() => {})

      return { success: stopResult?.success ?? true, error: stopResult?.error ?? null }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'قطع اتصال Codespace ناموفق بود.',
      }
    }
  })

  // ── Free Config handlers ──────────────────────────────────────────────────

  ipcMain.handle('free:get-pool', async () => {
    try {
      const [servers, meta] = await Promise.all([getFreePool(), getFreePoolMeta()])
      return { success: true, servers, meta, error: null }
    } catch (err) {
      return { success: false, servers: [], meta: null, error: err?.message ?? 'خواندن مخزن سرورهای رایگان ناموفق بود.' }
    }
  })

  ipcMain.handle('free:get-pool-meta', async () => {
    try {
      return { success: true, ...(await getFreePoolMeta()), poolRefreshing: freePoolRefreshing, error: null }
    } catch (err) {
      return { success: false, error: err?.message ?? 'خطا' }
    }
  })

  ipcMain.handle('free:get-status', () => {
    return { ...freeConfigState }
  })

  ipcMain.handle('free:fetch-and-connect', async (_event, input) => {
    return runFreeConnect({
      directDomains: Array.isArray(input?.directDomains) ? input.directDomains : [],
      rescueOptions: input?.rescueOptions ?? null,
      fetchFresh: true,
    })
  })

  ipcMain.handle('free:connect-from-pool', async (_event, input) => {
    return runFreeConnect({
      directDomains: Array.isArray(input?.directDomains) ? input.directDomains : [],
      rescueOptions: input?.rescueOptions ?? null,
      fetchFresh: false,
    })
  })

  // ── Geo-block test ──────────────────────────────────────────────────────────

  // ── Speed test ───────────────────────────────────────────────────────────

  ipcMain.handle('speedtest:run', async () => {
    const PROXY_PORT = 2080
    const TEST_HOST = 'speed.cloudflare.com'
    const TEST_PATH = '/__down?bytes=5000000' // 5 MB
    const TIMEOUT_MS = 20000

    return new Promise((resolve) => {
      const net = require('node:net')
      const tls = require('node:tls')
      let resolved = false

      function done(result) {
        if (!resolved) { resolved = true; resolve(result) }
      }

      const socket = new net.Socket()
      socket.setTimeout(TIMEOUT_MS)
      socket.connect(PROXY_PORT, '127.0.0.1', () => {
        socket.write(`CONNECT ${TEST_HOST}:443 HTTP/1.1\r\nHost: ${TEST_HOST}:443\r\n\r\n`)
      })

      let buffer = ''
      let tunnelEstablished = false
      let tlsSocket = null
      let bytesReceived = 0
      let startTime = 0
      let headersDone = false

      socket.on('data', (chunk) => {
        if (!tunnelEstablished) {
          buffer += chunk.toString('ascii', 0, Math.min(chunk.length, 512))
          const headerEnd = buffer.indexOf('\r\n\r\n')
          if (headerEnd === -1) return
          const firstLine = buffer.split('\r\n')[0] ?? ''
          if (!firstLine.includes('200')) {
            done({ success: false, mbps: null, error: 'پروکسی تانل برقرار نکرد' })
            socket.destroy()
            return
          }
          tunnelEstablished = true

          tlsSocket = tls.connect({
            socket,
            servername: TEST_HOST,
            rejectUnauthorized: false,
          }, () => {
            startTime = Date.now()
            tlsSocket.write(
              `GET ${TEST_PATH} HTTP/1.1\r\nHost: ${TEST_HOST}\r\nConnection: close\r\n\r\n`
            )
          })

          tlsSocket.on('data', (tlsChunk) => {
            if (!headersDone) {
              const str = tlsChunk.toString('ascii', 0, Math.min(tlsChunk.length, 2048))
              const hEnd = str.indexOf('\r\n\r\n')
              if (hEnd !== -1) {
                headersDone = true
                bytesReceived += tlsChunk.length - hEnd - 4
              }
            } else {
              bytesReceived += tlsChunk.length
            }
          })

          tlsSocket.on('end', () => {
            const elapsedSec = (Date.now() - startTime) / 1000
            const mbps = elapsedSec > 0 ? (bytesReceived * 8) / (elapsedSec * 1_000_000) : 0
            done({ success: true, mbps: Math.round(mbps * 10) / 10, bytes: bytesReceived, elapsedSec: Math.round(elapsedSec * 10) / 10, error: null })
            socket.destroy()
          })

          tlsSocket.on('error', (err) => {
            done({ success: false, mbps: null, error: err.message })
            socket.destroy()
          })

          tlsSocket.setTimeout(TIMEOUT_MS)
          tlsSocket.on('timeout', () => {
            if (bytesReceived > 0 && startTime > 0) {
              const elapsedSec = (Date.now() - startTime) / 1000
              const mbps = elapsedSec > 0 ? (bytesReceived * 8) / (elapsedSec * 1_000_000) : 0
              done({ success: true, mbps: Math.round(mbps * 10) / 10, bytes: bytesReceived, elapsedSec: Math.round(elapsedSec * 10) / 10, error: null })
            } else {
              done({ success: false, mbps: null, error: 'تایم‌اوت' })
            }
            socket.destroy()
          })
        }
      })

      socket.on('timeout', () => {
        done({ success: false, mbps: null, error: 'تایم‌اوت اتصال پروکسی' })
        socket.destroy()
      })

      socket.on('error', (err) => {
        done({ success: false, mbps: null, error: err.message })
      })
    })
  })

  ipcMain.handle('geoblock:test', async () => {
    const GEO_TARGETS = [
      { name: 'X (Twitter)', domain: 'x.com', path: '/' },
      { name: 'Instagram', domain: 'instagram.com', path: '/' },
      { name: 'Facebook', domain: 'facebook.com', path: '/' },
    ]
    const PROXY_PORT = 2080
    const TIMEOUT_MS = 8000

    async function testViaProxy(domain, path) {
      return new Promise((resolve) => {
        const net = require('node:net')
        const socket = new net.Socket()
        let resolved = false
        let buffer = ''
        const done = (ok, status) => {
          if (!resolved) { resolved = true; socket.destroy(); resolve({ ok, status }) }
        }
        socket.setTimeout(TIMEOUT_MS)
        socket.connect(PROXY_PORT, '127.0.0.1', () => {
          socket.write(`CONNECT ${domain}:443 HTTP/1.1\r\nHost: ${domain}:443\r\n\r\n`)
        })
        socket.on('data', (chunk) => {
          buffer += chunk.toString()
          const firstLine = buffer.split('\r\n')[0] ?? ''
          if (firstLine.includes('200')) {
            done(true, 200)
          } else {
            const m = firstLine.match(/HTTP\/\d+\.?\d*\s+(\d+)/)
            done(false, m ? parseInt(m[1]) : null)
          }
        })
        socket.on('timeout', () => done(false, null))
        socket.on('error', () => done(false, null))
      })
    }

    const results = await Promise.all(
      GEO_TARGETS.map(async ({ name, domain }) => {
        try {
          const { ok, status } = await testViaProxy(domain, '/')
          return { name, domain, accessible: ok, status, error: null }
        } catch (err) {
          return { name, domain, accessible: false, status: null, error: err?.message ?? 'خطا' }
        }
      }),
    )

    return { results, testedAt: new Date().toISOString() }
  })

  // ── Connection history ────────────────────────────────────────────────────

  ipcMain.handle('history:get', async () => {
    try {
      const histPath = path.join(app.getPath('userData'), 'HamidsDeutsch-Connect', 'connection-history.json')
      const raw = await fsp.readFile(histPath, 'utf8').catch(() => '[]')
      return { success: true, entries: JSON.parse(raw) }
    } catch {
      return { success: true, entries: [] }
    }
  })

  ipcMain.handle('history:append', async (_event, entry) => {
    try {
      const histPath = path.join(app.getPath('userData'), 'HamidsDeutsch-Connect', 'connection-history.json')
      await fsp.mkdir(path.dirname(histPath), { recursive: true })
      const raw = await fsp.readFile(histPath, 'utf8').catch(() => '[]')
      const entries = JSON.parse(raw)
      entries.unshift({ ...entry, id: Date.now().toString() })
      const trimmed = entries.slice(0, 200)
      await fsp.writeFile(histPath, JSON.stringify(trimmed, null, 2), 'utf8')
      return { success: true }
    } catch (err) {
      return { success: false, error: err?.message }
    }
  })

  ipcMain.handle('history:clear', async () => {
    try {
      const histPath = path.join(app.getPath('userData'), 'HamidsDeutsch-Connect', 'connection-history.json')
      await fsp.writeFile(histPath, '[]', 'utf8')
      return { success: true }
    } catch (err) {
      return { success: false, error: err?.message }
    }
  })

  // ── Startup on boot ───────────────────────────────────────────────────────

  ipcMain.handle('system:get-login-item', () => {
    try {
      const settings = app.getLoginItemSettings()
      return { enabled: settings.openAtLogin, error: null }
    } catch (err) {
      return { enabled: false, error: err?.message }
    }
  })

  ipcMain.handle('system:set-login-item', (_event, enabled) => {
    try {
      app.setLoginItemSettings({ openAtLogin: enabled === true, openAsHidden: true })
      return { success: true, enabled: enabled === true, error: null }
    } catch (err) {
      return { success: false, enabled: false, error: err?.message }
    }
  })

  ipcMain.handle('free:disconnect', async () => {
    freeConfigState.userDisconnected = true
    freeConfigState.phase = 'idle'
    freeConfigState.nodeId = null
    freeConfigState.nodeName = null
    freeConfigState.latencyMs = null
    freeConfigState.error = null
    try {
      await stopLocalProxy({ userDataPath: app.getPath('userData') })
      setVirtualLocationConnected(false)
      return { success: true, error: null }
    } catch (err) {
      return { success: false, error: err?.message ?? 'قطع اتصال سرور رایگان ناموفق بود.' }
    }
  })
}

function createMainWindow() {
  console.log(
    '[Electron] Creating main window...',
  )

  mainWindow =
    new BrowserWindow({
      width: 1180,
      height: 760,
      minWidth: 960,
      minHeight: 640,
      show: true,
      backgroundColor:
        '#090b10',
      title:
        'HamidsDeutsch Connect',
      autoHideMenuBar: true,

      webPreferences: {
        preload: path.join(
          __dirname,
          'preload.cjs',
        ),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    })

  mainWindow.webContents.on(
    'did-finish-load',
    () => {
      console.log(
        '[Electron] Page loaded successfully',
      )
    },
  )

  mainWindow.webContents.on(
    'did-fail-load',
    (
      _event,
      errorCode,
      errorDescription,
      validatedURL,
    ) => {
      console.error(
        '[Electron] Page failed to load',
      )

      console.error(
        'Error code:',
        errorCode,
      )

      console.error(
        'Description:',
        errorDescription,
      )

      console.error(
        'URL:',
        validatedURL,
      )
    },
  )

  mainWindow.webContents.on(
    'render-process-gone',
    (_event, details) => {
      console.error(
        '[Electron] Renderer process stopped:',
        details,
      )

      void Promise.allSettled([
        disposeProcessManager({
          userDataPath:
            app.getPath(
              'userData',
            ),
        }),
        stopBpbProxy({
          userDataPath:
            app.getPath(
              'userData',
            ),
        }),
      ]).catch((error) => {
        console.error(
          '[Engine] Renderer crash cleanup failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )
      })
    },
  )

  mainWindow.webContents.on(
    'console-message',
    (
      _event,
      level,
      message,
      line,
      sourceId,
    ) => {
      const entry =
        `[Renderer:${level}] ${message} (${sourceId}:${line})`

      console.log(entry)

      if (!isDevelopment) {
        appendProductionLog(
          entry,
        )
      }
    },
  )

  mainWindow.webContents.on(
    'did-fail-load',
    (
      _event,
      errorCode,
      errorDescription,
      validatedURL,
      isMainFrame,
    ) => {
      if (!isMainFrame) {
        return
      }

      const details = [
        `Code: ${errorCode}`,
        `Description: ${errorDescription}`,
        `URL: ${validatedURL}`,
      ].join('\n')

      console.error(
        '[Electron] Production page failed to load:',
        details,
      )

      appendProductionLog(
        `did-fail-load\n${details}`,
      )

      const html =
        createProductionErrorHtml(
          'خطا در بارگیری رابط برنامه',
          details,
        )

      void mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          html,
        )}`,
      )
    },
  )

  mainWindow.webContents.on(
    'did-finish-load',
    () => {
      console.log(
        '[Electron] Renderer finished loading',
      )

      if (!isDevelopment) {
        appendProductionLog(
          'Renderer finished loading.',
        )
      }
    },
  )

  mainWindow.webContents
    .setWindowOpenHandler(
      ({ url }) => {
        if (
          url.startsWith(
            'https://',
          )
        ) {
          void shell.openExternal(
            url,
          )
        }

        return {
          action: 'deny',
        }
      },
    )

  mainWindow.webContents.on(
    'will-navigate',
    (event, url) => {
      const developmentUrl =
        'http://localhost:5173'

      if (
        isDevelopment &&
        url.startsWith(
          developmentUrl,
        )
      ) {
        return
      }

      event.preventDefault()
    },
  )

  if (isDevelopment) {
    const developmentUrl =
      process.env.ELECTRON_START_URL ||
      'http://localhost:5173'

    console.log(
      '[Electron] Loading:',
      developmentUrl,
    )

    void mainWindow
      .loadURL(
        developmentUrl,
      )
      .catch((error) => {
        console.error(
          '[Electron] Development page failed:',
          error,
        )
      })
  } else {
    const productionFile =
      path.join(
        app.getAppPath(),
        'dist',
        'index.html',
      )

    console.log(
      '[Electron] Loading production file:',
      productionFile,
    )

    appendProductionLog(
      `App path: ${app.getAppPath()}`,
    )

    appendProductionLog(
      `Production file: ${productionFile}`,
    )

    appendProductionLog(
      `Production file exists: ${fs.existsSync(
        productionFile,
      )}`,
    )

    if (
      !fs.existsSync(
        productionFile,
      )
    ) {
      const details =
        `dist/index.html پیدا نشد:\n${productionFile}`

      appendProductionLog(
        details,
      )

      const html =
        createProductionErrorHtml(
          'فایل رابط برنامه پیدا نشد',
          details,
        )

      void mainWindow.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          html,
        )}`,
      )
    } else {
      void mainWindow
        .loadFile(
          productionFile,
        )
        .catch((error) => {
          const details =
            error instanceof Error
              ? error.stack ||
                error.message
              : String(error)

          appendProductionLog(
            `loadFile rejected:\n${details}`,
          )

          const html =
            createProductionErrorHtml(
              'خطا در اجرای رابط برنامه',
              details,
            )

          void mainWindow.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(
              html,
            )}`,
          )
        })
    }
  }

  mainWindow.on(
    'closed',
    () => {
      mainWindow = null
    },
  )
}

process.on(
  'uncaughtException',
  (error) => {
    void handleFatalProcessError(
      'Uncaught exception',
      error,
    )
  },
)

process.on(
  'unhandledRejection',
  (reason) => {
    void handleFatalProcessError(
      'Unhandled rejection',
      reason,
    )
  },
)

for (
  const signal of
    ['SIGINT', 'SIGTERM']
) {
  process.once(
    signal,
    () => {
      if (fatalCleanupStarted) {
        return
      }

      fatalCleanupStarted = true

      void emergencyDispose()
        .catch(() => {
          // Signal cleanup is best effort.
        })
        .finally(() => {
          clearSubscriptionNodeCache()
          app.exit(0)
        })
    },
  )
}



app.whenReady().then(async () => {
  console.log(
    '[Electron] Application is ready',
  )

  try {
    const engineRecovery =
      await recoverStaleManagedProcess({
        userDataPath:
          app.getPath(
            'userData',
          ),
        expectedEnginePath:
          getEnginePath(),
      })

    if (engineRecovery.found) {
      console.log(
        '[Engine] Previous managed process recovery:',
        engineRecovery,
      )
    }
  } catch (error) {
    console.error(
      '[Engine] Startup process recovery failed:',
      error instanceof Error
        ? error.message
        : 'Unknown error',
    )
  }

  try {
    const recovery =
      await recoverStaleWindowsProxyState(
        app.getPath(
          'userData',
        ),
      )

    if (recovery.recovered) {
      console.log(
        '[Engine] Previous Windows proxy settings restored on startup',
      )
    }
  } catch (error) {
    console.error(
      '[Engine] Startup proxy recovery failed:',
      error instanceof Error
        ? error.message
        : 'Unknown error',
    )
  }

  try {
    await ensureVirtualLocationExtension(
      app.getPath(
        'userData',
      ),
    )

    await startVirtualLocationService()
  } catch (error) {
    console.error(
      '[VirtualLocation] Startup failed:',
      error instanceof Error
        ? error.message
        : 'Unknown error',
    )
  }

  setOptimizerProgressListener(
    (progress) => {
      if (
        mainWindow &&
        !mainWindow.isDestroyed()
      ) {
        mainWindow.webContents.send(
          'bpb-optimizer:progress',
          progress,
        )
      }
    },
  )

  setCloudflareBpbProgressListener(
    (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bpb-cloudflare:progress', progress)
      }
    },
  )

  setCodespaceProgressListener(
    (progress) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('codespace:progress', progress)
      }
    },
  )

  registerIpcHandlers()
  createMainWindow()

  // Initialize pool metadata from disk, then start background refresh
  getFreePoolMeta().then((meta) => {
    freeConfigState.poolCount = meta.total
    freeConfigState.poolDisplaying = meta.displaying
    freeConfigState.poolLastRefreshedAt = meta.lastRefreshedAt
  }).catch(() => {})
  startFreeBackgroundRefresh()

  app.on(
    'activate',
    () => {
      if (
        BrowserWindow
          .getAllWindows()
          .length === 0
      ) {
        createMainWindow()
      }
    },
  )
})

app.on(
  'before-quit',
  (event) => {
    if (isQuitting) {
      return
    }

    event.preventDefault()
    isQuitting = true

    void Promise.allSettled([
      disposeProcessManager({
        userDataPath:
          app.getPath(
            'userData',
          ),
      }),
      stopBpbProxy({
        userDataPath:
          app.getPath(
            'userData',
          ),
      }),
    ]).finally(() => {
      void stopVirtualLocationService()
        .catch(() => {
          // Best effort during shutdown.
        })
        .finally(() => {
          clearSubscriptionNodeCache()
          app.quit()
        })
    })
  },
)

app.on(
  'window-all-closed',
  () => {
    if (
      process.platform !==
      'darwin'
    ) {
      app.quit()
    }
  },
)
