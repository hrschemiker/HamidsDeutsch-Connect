const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  Tray,
  Menu,
  nativeImage,
  dialog,
  net,
} = require('electron')

const { autoUpdater } = require('electron-updater')

const {
  initializeDnsManager,
  enableStandaloneDoH,
  disableStandaloneDoH,
  testDnsConfig,
  getStandaloneStatus,
} = require('./doh-manager.cjs')

const { getCfrayConfigs } = require('./cfray-manager.cjs')

const path = require('node:path')
const fs = require('node:fs')
const crypto = require('node:crypto')
const {
  execFile,
  spawn,
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
  MANUAL_SUBSCRIPTION_ID,
  MANUAL_SUBSCRIPTION_NAME,
  listManualNodes,
  addManualNode,
  removeManualNode,
  clearManualNodes,
  getManualNodeUri,
} = require('./manual-node-store.cjs')

const {
  hideNode,
  unhideNode,
  getHiddenNodes,
} = require('./hidden-nodes-store.cjs')

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
  createAndCheckWarpConfig,
} = require('./sing-box-config-service.cjs')

const {
  createAndCheckXrayConfig,
  getXrayCompatibility,
} = require('./xray-config-service.cjs')

const {
  scanCloudflareIps,
} = require('./cf-scanner-service.cjs')

const {
  getCfAutoScanSettings,
  setCfAutoScanSettings,
  getCfScanCache,
  saveCfScanCache,
  isCloudflareHost,
  isCloudflareIp,
} = require('./cf-scan-store.cjs')

const {
  convertSubscription,
  getBackends: getConverterBackends,
  getTargets: getConverterTargets,
} = require('./subscription-converter-service.cjs')

const {
  getUpstreamProxy,
  setUpstreamProxy,
} = require('./upstream-proxy-store.cjs')

const {
  getUTlsSettings,
  setUTlsSettings,
} = require('./utls-settings-store.cjs')

const {
  exportSettings,
  importSettings,
} = require('./settings-backup.cjs')

const {
  listDnsProfiles,
  saveDnsProfiles,
} = require('./dns-profile-store.cjs')

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

const connectionEngines = require('./connection-engine-manager.cjs')

const {
  addConfigs: addFreeConfigs,
  setTestResult: setFreeTestResult,
  pruneDead: pruneFreeDead,
  removeServer: removeFreeServer,
  getChannelId: getFreeChannelId,
  setChannelId: setFreeChannelId,
  getPool: getFreePool,
  getAllPool: getAllFreePool,
  getPoolMeta: getFreePoolMeta,
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

const execFileAsync =
  promisify(execFile)

const isDevelopment =
  !app.isPackaged

let mainWindow = null
let bpbPanelWindow = null
let appTray = null

// Tracks the last successful subscription/free connect call so we can rebuild
// the config when the bypass list changes while connected.
let activeConnectionParams = null
let isQuitting = false
let shutdownCleanupStarted = false
let fatalCleanupStarted = false

// CF auto-scan interval
let cfScanIntervalTimer = null

function scheduleCfScanInterval(intervalHours) {
  if (cfScanIntervalTimer) {
    clearInterval(cfScanIntervalTimer)
    cfScanIntervalTimer = null
  }
  if (intervalHours > 0) {
    cfScanIntervalTimer = setInterval(async () => {
      try {
        const settings = await getCfAutoScanSettings(app.getPath('userData'))
        if (!settings.enabled) return
        const scanResult = await scanCloudflareIps({ port: 443 })
        if (scanResult.reachable > 0) {
          await saveCfScanCache(app.getPath('userData'), scanResult.results ?? [])
          await resolveSmartCloudflareDns().catch(() => {})
        }
      } catch {}
    }, intervalHours * 60 * 60 * 1000)
  }
}

// ── App settings (close-to-tray + DoH) ───────────────────────────────────────
let closeToTrayEnabled = true
let standaloneDoHServer = 'off'   // 'off' | 'cloudflare' | 'google'
let customDnsPrimary = ''
let customDnsSecondary = ''
let preferredDnsServer = 'cloudflare-smart'
let preferredDnsPrimary = ''
let preferredDnsSecondary = ''
let proxyDoHEnabled = false
let autoUpdateEnabled = true
let smartCloudflareDnsConfig = {
  primary: '1.1.1.1', secondary: '1.0.0.1', label: 'Cloudflare Smart',
  template: 'https://cloudflare-dns.com/dns-query',
}

function getAppSettingsPath() {
  return path.join(app.getPath('userData'), 'HamidsDeutsch-Connect', 'app-settings.json')
}

// kept for backwards compat alias
function getCloseToTraySettingPath() { return getAppSettingsPath() }

async function loadAppSettings() {
  try {
    const raw = await fs.promises.readFile(getAppSettingsPath(), 'utf8')
    const parsed = JSON.parse(raw)
    closeToTrayEnabled = parsed.closeToTray !== false
    standaloneDoHServer = parsed.standaloneDoHServer ?? 'off'
    customDnsPrimary = typeof parsed.customDnsPrimary === 'string' ? parsed.customDnsPrimary : ''
    customDnsSecondary = typeof parsed.customDnsSecondary === 'string' ? parsed.customDnsSecondary : ''
    preferredDnsServer = parsed.preferredDnsServer
      ?? (parsed.standaloneDoHServer && parsed.standaloneDoHServer !== 'off'
        ? parsed.standaloneDoHServer
        : 'cloudflare-smart')
    preferredDnsPrimary = typeof parsed.preferredDnsPrimary === 'string'
      ? parsed.preferredDnsPrimary
      : customDnsPrimary
    preferredDnsSecondary = typeof parsed.preferredDnsSecondary === 'string'
      ? parsed.preferredDnsSecondary
      : customDnsSecondary
    proxyDoHEnabled = parsed.proxyDoHEnabled === true
    autoUpdateEnabled = parsed.autoUpdateEnabled !== false
  } catch {
    closeToTrayEnabled = true
    standaloneDoHServer = 'off'
    customDnsPrimary = ''
    customDnsSecondary = ''
    preferredDnsServer = 'cloudflare-smart'
    preferredDnsPrimary = ''
    preferredDnsSecondary = ''
    proxyDoHEnabled = false
    autoUpdateEnabled = true
  }
}

async function saveAppSettings() {
  const settingsPath = getAppSettingsPath()
  const dir = path.dirname(settingsPath)
  await fs.promises.mkdir(dir, { recursive: true })
  await fs.promises.writeFile(settingsPath, JSON.stringify({
    closeToTray: closeToTrayEnabled,
    standaloneDoHServer,
    customDnsPrimary,
    customDnsSecondary,
    preferredDnsServer,
    preferredDnsPrimary,
    preferredDnsSecondary,
    proxyDoHEnabled,
    autoUpdateEnabled,
  }, null, 2), 'utf8')
}

const VPN_DNS_PRESETS = {
  'cloudflare-smart': { primary: '1.1.1.1', secondary: '1.0.0.1', label: 'Cloudflare Smart' },
  cloudflare: { primary: '1.1.1.1', secondary: '1.0.0.1', label: 'Cloudflare' },
  'cloudflare-family': { primary: '1.1.1.3', secondary: '1.0.0.3', label: 'Cloudflare Family' },
  google: { primary: '8.8.8.8', secondary: '8.8.4.4', label: 'Google' },
  adguard: { primary: '94.140.14.14', secondary: '94.140.15.15', label: 'AdGuard' },
  shecan: { primary: '178.22.122.100', secondary: '185.51.200.2', label: 'Shecan' },
  radar: { primary: '10.202.10.10', secondary: '10.202.10.11', label: 'Radar' },
  electro: { primary: '78.157.42.100', secondary: '78.157.42.101', label: 'Electro' },
}

function getPreferredVpnDnsConfig(engineType = 'sing-box') {
  if (preferredDnsServer === 'off') return null
  if (preferredDnsServer === 'cloudflare-smart') {
    return engineType === 'xray'
      ? { ...VPN_DNS_PRESETS.cloudflare }
      : { ...smartCloudflareDnsConfig }
  }
  if (preferredDnsServer === 'custom') {
    const primary = String(preferredDnsPrimary ?? '').trim()
    if (!primary) return null
    return {
      primary,
      secondary: String(preferredDnsSecondary ?? '').trim(),
      label: 'Custom DNS',
    }
  }
  return VPN_DNS_PRESETS[preferredDnsServer] ?? VPN_DNS_PRESETS.cloudflare
}

async function resolveSmartCloudflareDns() {
  const traditional = {
    primary: '1.1.1.1', secondary: '1.0.0.1', label: 'Cloudflare Smart',
    template: 'https://cloudflare-dns.com/dns-query',
  }
  const cache = await getCfScanCache(app.getPath('userData')).catch(() => null)
  const candidates = Array.isArray(cache?.results)
    ? cache.results.map((item) => item?.ip).filter(Boolean).slice(0, 10)
    : []
  for (const primary of candidates) {
    try {
      const tested = await testDnsConfig('custom', {
        ...traditional,
        primary,
        secondary: '1.1.1.1',
      })
      if (tested.results?.some((result) => result.address === primary && result.success)) {
        smartCloudflareDnsConfig = { ...traditional, primary, secondary: '1.1.1.1' }
        return smartCloudflareDnsConfig
      }
    } catch {}
  }
  smartCloudflareDnsConfig = traditional
  return traditional
}

// Legacy single-value save — kept so existing callers still work
async function saveCloseToTraySetting(value) {
  closeToTrayEnabled = value
  await saveAppSettings()
}

function setupTray() {
  if (appTray) return
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '../build/icon.ico')
  try {
    const icon = nativeImage.createFromPath(iconPath)
    appTray = new Tray(icon)
  } catch {
    appTray = new Tray(nativeImage.createEmpty())
  }
  appTray.setToolTip('Manfaz VPN')
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'نمایش برنامه',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    { type: 'separator' },
    {
      label: 'خروج',
      click: () => {
        isQuitting = true
        app.quit()
      },
    },
  ])
  appTray.setContextMenu(contextMenu)
  appTray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.focus()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })
}

// ── Free Config Engine (Telegram channels → geoip → test → connect) ─────────
//
// Free configs come exclusively from two curated Telegram channels. Crawling
// happens through the ACTIVE tunnel (Telegram is blocked in Iran), incrementally
// per-channel via the stored newest-post-id cursor. Configs are stored with a
// random 6-digit id + the country flag of the server IP (offline GeoIP); their
// name is never shown. Connecting to a free config is identical to a
// subscription connect. The working-test connects to each config one-by-one and
// deletes the ones that pass no real traffic.

const TELEGRAM_CHANNELS = ['best_internet_iran', 'Spotify_Porteghali']
const TELEGRAM_MAX_POSTS = 200
const CRAWL_MIN_INTERVAL_MS = 3 * 60 * 1000
const TEST_PORT = 3080
const TEST_PER_CONFIG_TIMEOUT = 5000

let crawlInFlight = false
let lastCrawlAt = 0
let testInFlight = false
let testAbort = false
let telegramCrawlTimer = null
let freeBackgroundTimer = null

// Last bandwidth sample, used to convert cumulative totals into live speed.
let lastTrafficSample = null

let freeConfigState = {
  phase: 'idle',
  nodeId: null,
  nodeName: null,
  latencyMs: null,
  error: null,
  userDisconnected: false,
  poolCount: 0,
  testing: false,
  testDone: 0,
  testTotal: 0,
}

function sendFreeProgress(text, phase) {
  if (phase) freeConfigState.phase = phase
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('free:progress', { message: text, phase: freeConfigState.phase, at: new Date().toISOString() })
  }
}

async function sendFreePoolStatus() {
  const meta = await getFreePoolMeta().catch(() => null)
  if (meta) freeConfigState.poolCount = meta.total
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('free:pool-status', {
      total: meta?.total ?? 0,
      working: meta?.working ?? 0,
      untested: meta?.untested ?? 0,
      testing: freeConfigState.testing,
      testDone: freeConfigState.testDone,
      testTotal: freeConfigState.testTotal,
      lastRefreshedAt: meta?.lastRefreshedAt ?? null,
    })
  }
}

function isAnyConnectionActive() {
  try { return connectionEngines.getSelectedStatus().running } catch { return false }
}

async function tunneledFetch(url) {
  const { net } = require('electron')
  const resp = await net.fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'en' },
  })
  return { ok: resp.ok, status: resp.status, text: () => resp.text() }
}

function parseAllProtocols(content) {
  const { parseSubscriptionNodeRecords } = require('./subscription-parser.cjs')
  return parseSubscriptionNodeRecords(content)
}

// Lift an active kill-switch block once a fresh connection is up.
async function liftKillSwitchOnConnect() {
  try {
    const ks = require('./kill-switch.cjs')
    if (ks.isKillSwitchActive()) {
      await ks.deactivateKillSwitch()
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('killswitch:deactivated', {})
    }
  } catch { /* best effort */ }
}

// Clean-IP: return the best scanned Cloudflare IP ONLY when the feature is
// enabled in settings; otherwise null so connections use the server as-is.
async function resolveCfCleanIp(userDataPath) {
  try {
    const settings = await getCfAutoScanSettings(userDataPath).catch(() => ({ enabled: true }))
    if (settings && settings.enabled === false) return null
    const cache = await getCfScanCache(userDataPath).catch(() => null)
    return cache?.bestIp ?? null
  } catch {
    return null
  }
}

async function isCloudflareBackedUri(uri) {
  try {
    const parsed = new URL(String(uri))
    const host = parsed.hostname
    if (isCloudflareHost(host)) return true
    const dns = require('node:dns').promises
    const addresses = await dns.resolve4(host)
    return addresses.length > 0 && addresses.every(isCloudflareIp)
  } catch {
    return false
  }
}

// A system-wide outbound firewall rule also blocks sing-box. Release it before
// every connection attempt so the user can recover from a dropped tunnel.
async function prepareKillSwitchReconnect() {
  try {
    const ks = require('./kill-switch.cjs')
    // A connection attempt is never protected yet. The switch is armed only
    // after the renderer verifies that traffic is genuinely going through the
    // tunnel, preventing startup/config-check exits from cutting the internet.
    ks.setKillSwitchArmed(false)
    const wasActive = await ks.refreshKillSwitchActive()
    if (!wasActive) return { success: true, wasActive: false }
    const result = await ks.deactivateKillSwitch()
    if (result.success && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('killswitch:deactivated', {})
    }
    return { ...result, wasActive }
  } catch (error) {
    return {
      success: false,
      wasActive: true,
      error: error instanceof Error ? error.message : 'Kill Switch could not be released.',
    }
  }
}

/**
 * Crawl both Telegram channels for NEW configs (since the stored post-id cursor),
 * resolve each server's country flag offline, and add them to the pool.
 * Runs only while a tunnel is up. Throttled unless force=true.
 */
async function crawlFreeConfigs({ force = false, deep = false } = {}) {
  if (crawlInFlight) return { added: 0, skipped: 'busy' }
  if (!force && Date.now() - lastCrawlAt < CRAWL_MIN_INTERVAL_MS) return { added: 0, skipped: 'throttled' }
  if (!isAnyConnectionActive()) return { added: 0, skipped: 'offline' }

  crawlInFlight = true
  try {
    const { crawlChannel } = require('./telegram-source-service.cjs')
    const geoip = require('./geoip-service.cjs')
    sendFreeProgress(deep
      ? 'بررسی کامل ۲۰۰ پست آخر هر دو کانال تلگرام...'
      : 'در حال جستجوی کانفیگ‌های جدید در تلگرام...', 'fetching')

    const collected = []
    for (const channel of TELEGRAM_CHANNELS) {
      // Deep crawl ignores the newest-post-id cursor: re-scan ALL recent posts
      // even if already seen (dedup by URI still prevents duplicates on import).
      const sinceId = deep ? 0 : await getFreeChannelId(channel).catch(() => 0)
      let res
      try {
        res = await crawlChannel({ channel, sinceId, maxPosts: TELEGRAM_MAX_POSTS, fetchImpl: tunneledFetch })
      } catch { continue }
      const records = parseAllProtocols(res.uris.join('\n'))
      for (const r of records) {
        if (!r.node.valid || !r.node.host || !r.node.port) continue
        collected.push(r)
      }
      if (res.newestId) await setFreeChannelId(channel, res.newestId).catch(() => {})
    }

    // Resolve country/flag (offline geoip; domains resolve through the tunnel).
    const seen = new Set()
    const entries = []
    for (const r of collected) {
      if (seen.has(r.uri)) continue
      seen.add(r.uri)
      const country = await geoip.countryForHost(r.node.host).catch(() => null)
      entries.push({
        uri: r.uri,
        host: r.node.host,
        port: r.node.port,
        protocol: r.node.protocol,
        security: r.node.security ?? null,
        country,
        flag: geoip.flagForCountry(country),
        source: 'telegram',
      })
    }

    const added = entries.length ? await addFreeConfigs(entries) : 0
    lastCrawlAt = Date.now()
    await sendFreePoolStatus()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('free:pool-updated', { added })
    }
    if (added > 0) console.log(`[Free] Added ${added} new configs from Telegram`)
    return { added, skipped: null }
  } catch (err) {
    console.error('[Free] crawl failed:', err?.message ?? err)
    return { added: 0, skipped: 'error' }
  } finally {
    crawlInFlight = false
  }
}

/** Probe whether the local proxy on `port` actually relays real traffic. */
function probeRelay(port, timeoutMs = TEST_PER_CONFIG_TIMEOUT) {
  const TEST_HOST = 'speed.cloudflare.com'
  return new Promise((resolve) => {
    const netmod = require('node:net')
    const tls = require('node:tls')
    let done = false
    let tlsSocket = null
    const t0 = Date.now()
    const finish = (ok) => {
      if (done) return
      done = true
      try { tlsSocket?.destroy() } catch {}
      try { socket.destroy() } catch {}
      resolve({ ok, ms: ok ? Date.now() - t0 : null })
    }
    const socket = new netmod.Socket()
    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
    socket.connect(port, '127.0.0.1', () => {
      socket.write(`CONNECT ${TEST_HOST}:443 HTTP/1.1\r\nHost: ${TEST_HOST}:443\r\n\r\n`)
    })
    let buf = ''
    let tunnelReady = false
    socket.on('data', (chunk) => {
      if (tunnelReady) return
      buf += chunk.toString('ascii', 0, Math.min(chunk.length, 512))
      if (!buf.includes('\r\n\r\n')) return
      if (!(buf.split('\r\n')[0] || '').includes('200')) { finish(false); return }
      tunnelReady = true
      socket.removeAllListeners('data')
      tlsSocket = tls.connect({ socket, servername: TEST_HOST, rejectUnauthorized: false }, () => {
        tlsSocket.write(`GET /__down?bytes=1024 HTTP/1.1\r\nHost: ${TEST_HOST}\r\nConnection: close\r\n\r\n`)
      })
      tlsSocket.setTimeout(timeoutMs)
      tlsSocket.on('timeout', () => finish(false))
      tlsSocket.on('error', () => finish(false))
      let rbuf = ''
      tlsSocket.on('data', (d) => {
        rbuf += d.toString('ascii', 0, Math.min(d.length, 512))
        const line = rbuf.split('\r\n')[0] || ''
        if (rbuf.includes('\r\n')) finish(line.includes('200') || line.includes('204'))
      })
    })
  })
}

/** Build a throwaway test config for a uri and spawn a sing-box on TEST_PORT. */
async function spawnTestEngine(uri) {
  const { createAndCheckConfig } = require('./sing-box-config-service.cjs')
  const enginePath = getEnginePath()
  const userDataPath = app.getPath('userData')
  const res = await createAndCheckConfig({
    subscriptionUrl: 'https://t.me',
    nodeId: 'test',
    nodeUri: uri,
    enginePath,
    userDataPath,
    directDomains: [],
    rescueOptions: null,
    runtimeDirectoryName: 'test-runtime',
    configFileName: 'test.json',
    localPort: TEST_PORT,
    setSystemProxy: false,
    // Isolated control port so test engines never clash with the main
    // connection's clash_api on 9090 (which would block real connects).
    clashApiPort: 9099,
  }).catch(() => ({ success: false }))
  if (!res.success) return null
  const { spawn } = require('node:child_process')
  const child = spawn(enginePath, ['run', '-c', res.configPath], { windowsHide: true, stdio: 'ignore' })
  return child
}

/**
 * Test every config one-by-one: connect, check real traffic, mark working/dead.
 * Deletes configs that relay nothing. Must run while disconnected.
 */
async function testAllFreeConfigs() {
  if (testInFlight) return { tested: 0, removed: 0, skipped: 'busy' }
  testInFlight = true
  testAbort = false
  freeConfigState.testing = true
  try {
    const all = await getAllFreePool().catch(() => [])
    freeConfigState.testTotal = all.length
    freeConfigState.testDone = 0
    await sendFreePoolStatus()
    for (const cfg of all) {
      // Stop cleanly if the user chose to connect (testing and connecting are
      // mutually exclusive so a test engine can never disrupt a real connect).
      if (testAbort) break
      freeConfigState.testDone++
      sendFreeProgress(`آزمایش کانفیگ‌ها: ${freeConfigState.testDone}/${freeConfigState.testTotal}`, 'testing')
      let child = null
      try {
        child = await spawnTestEngine(cfg.uri)
        if (!child) { await setFreeTestResult(cfg.id, false, null).catch(() => {}); continue }
        await new Promise((r) => setTimeout(r, 1200))
        const { ok, ms } = await probeRelay(TEST_PORT)
        await setFreeTestResult(cfg.id, ok, ms).catch(() => {})
      } catch {
        await setFreeTestResult(cfg.id, false, null).catch(() => {})
      } finally {
        try { child?.kill() } catch {}
        await new Promise((r) => setTimeout(r, 150))
      }
      if (freeConfigState.testDone % 10 === 0) await sendFreePoolStatus()
    }
    if (testAbort) {
      await sendFreePoolStatus()
      sendFreeProgress('آزمایش برای برقراری اتصال متوقف شد.', 'idle')
      return { tested: freeConfigState.testDone, removed: 0, skipped: 'aborted' }
    }
    const removed = await pruneFreeDead().catch(() => 0)
    await sendFreePoolStatus()
    sendFreeProgress(`آزمایش کامل شد. ${removed} کانفیگ بی‌کار حذف شد.`, 'idle')
    return { tested: all.length, removed, skipped: null }
  } finally {
    testInFlight = false
    testAbort = false
    freeConfigState.testing = false
    await sendFreePoolStatus()
  }
}

/**
 * Stop an in-flight free-config test and wait for the loop to unwind. Called
 * before any connect so testing and connecting never overlap.
 */
async function stopFreeTesting() {
  if (!testInFlight) return { stopped: true, wasTesting: false }
  testAbort = true
  const start = Date.now()
  while (testInFlight && Date.now() - start < 5000) {
    await new Promise((r) => setTimeout(r, 100))
  }
  return { stopped: !testInFlight, wasTesting: true }
}

/**
 * Re-measure latency for ONLY the configs that already passed the working test
 * and are still in the pool (working === true). Does not crawl or delete —
 * just refreshes each surviving config's ping.
 */
async function refreshWorkingPings() {
  if (testInFlight) return { tested: 0, skipped: 'busy' }
  testInFlight = true
  testAbort = false
  freeConfigState.testing = true
  try {
    const all = await getAllFreePool().catch(() => [])
    const working = all.filter((c) => c.working === true)
    freeConfigState.testTotal = working.length
    freeConfigState.testDone = 0
    await sendFreePoolStatus()
    if (working.length === 0) {
      sendFreeProgress('کانفیگ کارآمدی برای بروزرسانی پینگ وجود ندارد.', 'idle')
      return { tested: 0, skipped: null }
    }
    for (const cfg of working) {
      if (testAbort) break
      freeConfigState.testDone++
      sendFreeProgress(`بروزرسانی پینگ: ${freeConfigState.testDone}/${working.length}`, 'testing')
      let child = null
      try {
        child = await spawnTestEngine(cfg.uri)
        if (!child) continue // keep it as-is; couldn't re-measure this round
        await new Promise((r) => setTimeout(r, 1200))
        const { ok, ms } = await probeRelay(TEST_PORT)
        await setFreeTestResult(cfg.id, ok, ms).catch(() => {})
      } catch {
        // Leave the config untouched on a transient error.
      } finally {
        try { child?.kill() } catch {}
        await new Promise((r) => setTimeout(r, 150))
      }
      if (freeConfigState.testDone % 5 === 0) await sendFreePoolStatus()
    }
    await sendFreePoolStatus()
    sendFreeProgress(testAbort ? 'بروزرسانی پینگ متوقف شد.' : 'بروزرسانی پینگ کامل شد.', 'idle')
    return { tested: freeConfigState.testDone, skipped: null }
  } finally {
    testInFlight = false
    testAbort = false
    freeConfigState.testing = false
    await sendFreePoolStatus()
  }
}

/**
 * Connect to a free config EXACTLY like a subscription: build the normal runtime
 * config and start the engine. No separate free-runtime, no extra gate.
 */
async function connectFreeConfig({ nodeId, nodeUri, directDomains = [], rescueOptions = null, enginePreference = 'sing-box' }) {
  const { createAndCheckConfig } = require('./sing-box-config-service.cjs')
  // Never connect while a test is running — stop it first so a leftover test
  // engine can't disrupt the real connection.
  await stopFreeTesting()
  freeConfigState.userDisconnected = false
  const enginePath = getEnginePath()
  const userDataPath = app.getPath('userData')
  const killSwitchRelease = await prepareKillSwitchReconnect()
  if (!killSwitchRelease.success) {
    return {
      success: false,
      error: `Kill Switch مانع اتصال مجدد شد: ${killSwitchRelease.error ?? 'برنامه را با دسترسی Administrator اجرا کنید.'}`,
    }
  }

  // Resolve the uri from the pool if only an id was given.
  let uri = nodeUri
  if (!uri && nodeId) {
    const all = await getAllFreePool().catch(() => [])
    uri = all.find((s) => s.id === nodeId)?.uri
  }
  if (!uri) return { success: false, error: 'کانفیگ رایگان پیدا نشد.' }

  const requestedEngine = enginePreference === 'xray' ? 'xray' : 'sing-box'
  const compatibility = getXrayCompatibility(uri)
  if (requestedEngine === 'xray' && !compatibility.compatible) {
    return { success: false, requiresEngine: 'sing-box', protocol: compatibility.protocol, error: compatibility.reason }
  }
  connectionEngines.setSelectedEngine(requestedEngine)

  if (connectionEngines.getSelectedStatus().running) {
    expectedEngineStop = true
    try { await connectionEngines.stopSelected({ userDataPath }) } catch {}
  }

  const [upstreamProxy, utlsSettings, scannedCleanIp, cloudflareBacked] = await Promise.all([
    getUpstreamProxy(userDataPath).catch(() => null),
    getUTlsSettings(userDataPath).catch(() => null),
    resolveCfCleanIp(userDataPath),
    isCloudflareBackedUri(uri),
  ])
  const cleanIp = cloudflareBacked ? scannedCleanIp : null

  async function build(cfCleanIp) {
    const params = {
      subscriptionUrl: 'https://t.me',
      nodeId: nodeId ?? 'free',
      nodeUri: uri,
      enginePath,
      userDataPath,
      directDomains: Array.isArray(directDomains) ? directDomains : [],
      rescueOptions,
      localPort: 2080,
      setSystemProxy: true,
      proxyDoH: proxyDoHEnabled,
      vpnDns: getPreferredVpnDnsConfig(requestedEngine),
      upstreamProxy: upstreamProxy?.enabled ? upstreamProxy : null,
      utlsSettings,
      cfCleanIp,
    }
    return (requestedEngine === 'xray'
      ? createAndCheckXrayConfig({ ...params, enginePath: getXrayPath() })
      : createAndCheckConfig(params)
    ).catch((e) => ({ success: false, error: e?.message }))
  }

  await backupWindowsProxyState(userDataPath).catch(() => {})

  // Try via the clean IP first; if it doesn't relay, fall back to the server as-is.
  for (const cfCleanIp of (cleanIp ? [cleanIp, null] : [null])) {
    const configResult = await build(cfCleanIp)
    if (!configResult.success) continue
    const started = await connectionEngines.startSelected({
      singBoxPath: enginePath, xrayPath: getXrayPath(), userDataPath,
    })
    if (!started.success) continue
    if (requestedEngine === 'xray') {
      const activated = await connectionEngines.activateSelectedSystemProxy({
        singBoxPath: enginePath, xrayPath: getXrayPath(), userDataPath,
      })
      if (!activated.success) continue
    }
    if (cfCleanIp) {
      // Verify the clean-IP tunnel actually passes traffic; else retry as-is.
      const relay = await probeRelay(2080).catch(() => ({ ok: false }))
      if (!relay.ok) { expectedEngineStop = true; await connectionEngines.stopSelected({ userDataPath }).catch(() => {}); continue }
    }
    freeConfigState.phase = 'connected'
    freeConfigState.nodeId = nodeId ?? null
    expectedEngineStop = false
    await liftKillSwitchOnConnect()
    return { success: true, nodeId: nodeId ?? null, error: null }
  }
  return { success: false, error: 'اتصال به کانفیگ رایگان ناموفق بود.' }
}

// Automation: crawl for new configs shortly after any connection comes up;
// run the connectivity test automatically when disconnected (and on launch).
function startFreeAutomation() {
  freeBackgroundTimer = setInterval(() => {
    if (isAnyConnectionActive()) crawlFreeConfigs().catch(() => {})
  }, 60 * 1000)
}

// Kept for call-site compatibility with app startup.
function startFreeBackgroundRefresh() { startFreeAutomation() }
function startTelegramCrawler() { /* folded into startFreeAutomation */ }

// On disconnect, automatically run the free-config connectivity test (spec #9):
// once the tunnel is down, quietly test any untested configs in the background.
// True when the engine is being stopped on purpose (Disconnect / switching
// servers) — used so the kill switch only fires on genuine drops.
let expectedEngineStop = false

connectionEngines.setProcessExitCallback(({ code } = {}) => {
  const wasExpected = expectedEngineStop
  expectedEngineStop = false
  freeConfigState.phase = 'idle'
  if (wasExpected) {
    require('./kill-switch.cjs').setKillSwitchArmed(false)
  }

  // Kill switch: an UNEXPECTED drop (not the Disconnect button) blocks all
  // internet until the user reconnects or turns the feature off.
  if (!wasExpected && code !== 0) {
    const { getKillSwitchEnabled, isKillSwitchArmed, activateKillSwitch } = require('./kill-switch.cjs')
    if (isKillSwitchArmed()) {
      getKillSwitchEnabled(app.getPath('userData')).then(async (enabled) => {
        if (!enabled) return
        const res = await activateKillSwitch()
        if (res.success && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('killswitch:activated', { firewall: res.success })
        } else if (!res.success && !res.skipped) {
          console.error('[KillSwitch] Activation failed:', res.error)
        }
      }).catch(() => {})
    }
  }

  setTimeout(() => {
    if (isAnyConnectionActive() || testInFlight) return
    getFreePoolMeta()
      .then((meta) => { if (meta && meta.untested > 0) return testAllFreeConfigs() })
      .catch(() => {})
  }, 2500)
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


async function getEngineInfo(engineType = connectionEngines.getSelectedEngine()) {
  const normalizedEngine = engineType === 'sing-box' ? 'sing-box' : 'xray'
  const enginePath = normalizedEngine === 'xray' ? getXrayPath() : getEnginePath()

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
      engineType: normalizedEngine,
      error:
        `فایل ${normalizedEngine === 'xray' ? 'xray.exe' : 'sing-box.exe'} پیدا نشد.`,
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

    const versionMatch = output.match(
      normalizedEngine === 'xray'
        ? /Xray\s+([^\s]+)/i
        : /sing-box version\s+([^\s]+)/i,
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
        normalizedEngine === 'xray'
          ? (output.match(/windows\/([^\s)]+)/i)?.[1] ?? null)
          : (environmentMatch?.[1]?.trim() ?? null),
      engineType: normalizedEngine,
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
      engineType: normalizedEngine,
      error:
        error instanceof Error
          ? error.message
          : `اجرای ${normalizedEngine} با خطا مواجه شد.`,
    }
  }
}

function createProcessErrorResult(
  error,
) {
  return {
    success: false,
    ...connectionEngines.getSelectedStatus(),
    error:
      error instanceof Error
        ? error.message
        : 'عملیات موتور اتصال ناموفق بود.',
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
          await getEngineInfo('sing-box')

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
        const status = connectionEngines.getSelectedStatus()

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
          await getEngineInfo('sing-box')

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
      const verified = connected === true
      setVirtualLocationConnected(verified)
      require('./kill-switch.cjs').setKillSwitchArmed(verified)
      if (verified) {
        void retryAutoUpdateAfterConnection()
      }
      return { success: true }
    },
  )

  ipcMain.handle(
    'system:set-direct-domains',
    async (_event, domains) => {
      setDirectDomains(Array.isArray(domains) ? domains : [])

      // If a subscription/free proxy is currently running, hot-rebuild the config
      // so bypass list changes take effect without a full reconnect.
      const procStatus = connectionEngines.getSelectedStatus()
      if (procStatus.running && activeConnectionParams) {
        try {
          const newDomains = Array.isArray(domains) ? domains : []
          const newConfigResult = activeConnectionParams.engineType === 'xray'
            ? await createAndCheckXrayConfig({ ...activeConnectionParams, directDomains: newDomains })
            : await createAndCheckConfig({ ...activeConnectionParams, directDomains: newDomains })
          if (newConfigResult.success) {
            // Restart sing-box with the new config
            const userDataPath = app.getPath('userData')
            await backupWindowsProxyState(userDataPath).catch(() => {})
            expectedEngineStop = true
            require('./kill-switch.cjs').setKillSwitchArmed(false)
            await connectionEngines.stopSelected({ userDataPath }).catch(() => {})
            const restarted = await connectionEngines.startSelected({
              singBoxPath: getEnginePath(), xrayPath: getXrayPath(), userDataPath,
            })
            expectedEngineStop = false
            if (restarted.success) {
              activeConnectionParams = { ...activeConnectionParams, directDomains: newDomains }
            }
            if (restarted.success && mainWindow && !mainWindow.isDestroyed()) {
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
        // Pass paths as single-quoted arguments to avoid injection via special characters
        const safeSrc = extensionPath.replace(/'/g, "''")
        const safeDst = filePath.replace(/'/g, "''")
        await execFileAsync('powershell.exe', [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `& { param($src, $dst) Compress-Archive -Path (Join-Path $src '*') -DestinationPath $dst -Force } -src '${safeSrc}' -dst '${safeDst}'`,
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
    'engine:set-preference',
    async (_event, engineType) => {
      const normalized = connectionEngines.setSelectedEngine(engineType)
      return { success: true, engineType: normalized, error: null }
    },
  )

  ipcMain.handle(
    'engine:get-preference',
    async () => ({ engineType: connectionEngines.getSelectedEngine() }),
  )

  ipcMain.handle(
    'engine:get-xray-compatibility',
    async (_event, nodeUri) => getXrayCompatibility(nodeUri),
  )

  ipcMain.handle(
    'engine:start-local-proxy',
    async () => {
      try {
        await stopFreeTesting()
        const killSwitchRelease = await prepareKillSwitchReconnect()
        if (!killSwitchRelease.success) {
          return {
            success: false,
            ...connectionEngines.getSelectedStatus(),
            error: killSwitchRelease.error ?? 'برداشتن محدودیت Kill Switch ناموفق بود.',
          }
        }
        const result = await connectionEngines.startSelected({
          singBoxPath: getEnginePath(),
          xrayPath: getXrayPath(),
          userDataPath: app.getPath('userData'),
        })

        if (result.success) {
          expectedEngineStop = false // a live connection — a later drop is unexpected
          await liftKillSwitchOnConnect()
        }

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
        const privilege =
          await getWindowsPrivilegeStatus()

        if (
          !privilege.supported ||
          !privilege.isAdministrator
        ) {
          return {
            success: false,
            ...connectionEngines.getSelectedStatus(),
            error:
              'اجرای TUN به دسترسی Administrator نیاز دارد.',
          }
        }

        const killSwitchRelease = await prepareKillSwitchReconnect()
        if (!killSwitchRelease.success) {
          return {
            success: false,
            ...connectionEngines.getSelectedStatus(),
            error: killSwitchRelease.error ?? 'برداشتن محدودیت Kill Switch ناموفق بود.',
          }
        }

        const result = await connectionEngines.startTunSelected({
          singBoxPath: getEnginePath(),
          userDataPath: app.getPath('userData'),
        })

        if (result.success) {
          expectedEngineStop = false
          await liftKillSwitchOnConnect()
        }

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
        const result = await connectionEngines.activateSelectedSystemProxy({
          singBoxPath: getEnginePath(),
          xrayPath: getXrayPath(),
          userDataPath: app.getPath('userData'),
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
      expectedEngineStop = true
      try {
        const result = await connectionEngines.deactivateSelectedSystemProxy({
          singBoxPath: getEnginePath(),
          userDataPath: app.getPath('userData'),
          keepLocalProxy: Boolean(keepLocalProxy),
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
      expectedEngineStop = true // Disconnect button / server switch — not a drop.
      try {
        const result = await connectionEngines.stopSelected({
          userDataPath: app.getPath('userData'),
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
      return connectionEngines.getSelectedStatus()
    },
  )

  ipcMain.handle(
    'network:verify-ip-change',
    async () => {
      const processStatus = connectionEngines.getSelectedStatus()

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

          // ── Zeus Cloudflare auto-deploy ──────────────────────────────────────────
                                  ipcMain.handle(
    'subscriptions:list',
    async () => {
      const subs = await listSubscriptions()
      const manualNodes = await listManualNodes().catch(() => [])
      if (manualNodes.length > 0) {
        return [
          { id: MANUAL_SUBSCRIPTION_ID, name: MANUAL_SUBSCRIPTION_NAME, host: 'دستی', createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z' },
          ...subs,
        ]
      }
      return subs
    },
  )

  ipcMain.handle(
    'servers:add-manual-node',
    async (_event, uri) => {
      try {
        const { parseSubscriptionNodeRecords } = require('./subscription-parser.cjs')
        const records = parseSubscriptionNodeRecords(typeof uri === 'string' ? uri : '')
        if (records.length === 0) {
          return { success: false, error: 'لینک سرور معتبر نیست. vless://, vmess://, trojan://, ss:// پشتیبانی می‌شوند.' }
        }
        const node = await addManualNode(records[0].uri)
        replaceSubscriptionNodes(MANUAL_SUBSCRIPTION_ID, [
          ...(await listManualNodes()),
        ])
        return { success: true, node, parsedNode: records[0].node }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'خطا در افزودن سرور' }
      }
    },
  )

  ipcMain.handle(
    'servers:remove-manual-node',
    async (_event, nodeId) => {
      try {
        // The UI node id is a stable hash of the URI (parser), not the store id.
        // Map it back to the stored URI, then delete by URI (removeManualNode
        // also accepts the raw store id as a fallback).
        const { parseSubscriptionNodeRecords } = require('./subscription-parser.cjs')
        const manualNodes = await listManualNodes()
        let target = nodeId
        for (const n of manualNodes) {
          const recs = parseSubscriptionNodeRecords(n.uri)
          if (recs.some((r) => r.id === nodeId || r.node?.id === nodeId)) { target = n.uri; break }
        }
        await removeManualNode(target)
        const remaining = await listManualNodes()
        const records = parseSubscriptionNodeRecords(remaining.map((n) => n.uri).join('\n'))
        replaceSubscriptionNodes(MANUAL_SUBSCRIPTION_ID, records)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'خطا در حذف سرور' }
      }
    },
  )

  ipcMain.handle(
    'servers:hide-node',
    async (_event, compositeId) => {
      try {
        await hideNode(compositeId)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'خطا در مخفی کردن سرور' }
      }
    },
  )

  ipcMain.handle(
    'servers:unhide-node',
    async (_event, compositeId) => {
      try {
        await unhideNode(compositeId)
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : 'خطا' }
      }
    },
  )

  ipcMain.handle(
    'servers:get-hidden-nodes',
    async () => {
      return getHiddenNodes()
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
        // The "manual servers" row is a virtual subscription that isn't in the
        // subscription store — deleting it means clearing all manual nodes.
        if (subscriptionId === MANUAL_SUBSCRIPTION_ID) {
          await clearManualNodes()
          removeSubscriptionNodes(MANUAL_SUBSCRIPTION_ID)
          return { success: true, error: null }
        }

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
        // Virtual manual subscription — load from disk store, not URL
        if (subscriptionId === MANUAL_SUBSCRIPTION_ID) {
          const { parseSubscriptionNodeRecords } = require('./subscription-parser.cjs')
          const manualNodes = await listManualNodes()
          const allContent = manualNodes.map((n) => n.uri).join('\n')
          const records = parseSubscriptionNodeRecords(allContent)
          replaceSubscriptionNodes(MANUAL_SUBSCRIPTION_ID, records)
          return {
            success: true,
            checkedAt: new Date().toISOString(),
            nodes: records.map((r) => r.node),
            error: null,
          }
        }

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
          subscriptionInfo:
            result.subscriptionInfo ?? null,
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
    'servers:get-node-uri',
    async (_event, { subscriptionId, nodeId }) => {
      try {
        let uri = null
        if (subscriptionId === MANUAL_SUBSCRIPTION_ID) {
          uri = await getManualNodeUri(nodeId)
        } else {
          uri = await getSubscriptionNodeUri(subscriptionId, nodeId)
        }
        return { success: true, uri }
      } catch {
        return { success: false, uri: null }
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

        const requestedEngine = input?.enginePreference === 'xray'
          ? 'xray'
          : 'sing-box'

        const rescueOptions =
          input?.rescueOptions &&
          typeof input.rescueOptions ===
            'object'
            ? input.rescueOptions
            : null

        // Manual nodes: look up URI directly from disk store, skip URL fetch
        let subscriptionUrl = 'manual://'
        if (subscriptionId !== MANUAL_SUBSCRIPTION_ID) {
          subscriptionUrl = await getSubscriptionUrl(subscriptionId)
        }

        let cachedNodeUri =
          getSubscriptionNodeUri(
            subscriptionId,
            nodeId,
          )

        if (!cachedNodeUri && subscriptionId === MANUAL_SUBSCRIPTION_ID) {
          // Load from manual store into cache
          const uri = await getManualNodeUri(nodeId)
          if (uri) {
            replaceSubscriptionNodes(MANUAL_SUBSCRIPTION_ID, [{ id: nodeId, uri }])
            cachedNodeUri = uri
          }
        } else if (!cachedNodeUri) {
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

        const [upstreamProxy, utlsSettings, scannedCleanIp, cloudflareBacked] = await Promise.all([
          getUpstreamProxy(app.getPath('userData')).catch(() => null),
          getUTlsSettings(app.getPath('userData')).catch(() => null),
          resolveCfCleanIp(app.getPath('userData')),
          isCloudflareBackedUri(nodeUri),
        ])
        const cleanIp = cloudflareBacked ? scannedCleanIp : null

        const effectiveRescueOptions = utlsSettings?.fragmentEnabled
          ? { ...(rescueOptions ?? {}), enabled: true, recordFragment: true }
          : rescueOptions

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
          rescueOptions: effectiveRescueOptions,
          proxyDoH: proxyDoHEnabled,
          vpnDns: getPreferredVpnDnsConfig(requestedEngine),
          upstreamProxy: upstreamProxy?.enabled ? upstreamProxy : null,
          utlsSettings,
          cfCleanIp: cleanIp,
          engineType: requestedEngine,
        }
        const result = requestedEngine === 'xray'
          ? await createAndCheckXrayConfig({
              ...configParams,
              enginePath: getXrayPath(),
            })
          : await createAndCheckConfig(configParams)

        if (result.success) {
          connectionEngines.setSelectedEngine(requestedEngine)
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

        const { getApps } = require('./split-tunnel-store.cjs')
        const [directApps, upstreamProxy, utlsSettings] = await Promise.all([
          getApps(app.getPath('userData')).catch(() => []),
          getUpstreamProxy(app.getPath('userData')).catch(() => null),
          getUTlsSettings(app.getPath('userData')).catch(() => null),
        ])

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
            directApps,
            vpnDns: getPreferredVpnDnsConfig('sing-box'),
            upstreamProxy: upstreamProxy?.enabled ? upstreamProxy : null,
            utlsSettings,
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

            // ── Free Config handlers ──────────────────────────────────────────────────

  ipcMain.handle('free:get-pool', async () => {
    try {
      const [servers, meta] = await Promise.all([getFreePool(), getFreePoolMeta()])
      return { success: true, servers, meta, error: null }
    } catch (err) {
      return { success: false, servers: [], meta: null, error: err?.message ?? 'خواندن مخزن کانفیگ‌های رایگان ناموفق بود.' }
    }
  })

  ipcMain.handle('free:get-status', () => {
    return { ...freeConfigState }
  })

  // Crawl the two Telegram channels for new configs (through the active tunnel).
  ipcMain.handle('free:crawl', async () => {
    try {
      const result = await crawlFreeConfigs({ force: true })
      const [servers, meta] = await Promise.all([getFreePool(), getFreePoolMeta()])
      return { success: true, added: result.added, skipped: result.skipped, servers, meta, error: null }
    } catch (err) {
      return { success: false, added: 0, servers: [], meta: null, error: err?.message ?? 'جستجوی کانفیگ‌ها ناموفق بود.' }
    }
  })

  // Run the one-by-one working test (caller must have disconnected first).
  ipcMain.handle('free:test-start', async () => {
    try {
      const result = await testAllFreeConfigs()
      const [servers, meta] = await Promise.all([getFreePool(), getFreePoolMeta()])
      return { success: true, ...result, servers, meta, error: null }
    } catch (err) {
      return { success: false, servers: [], meta: null, error: err?.message ?? 'آزمایش کانفیگ‌ها ناموفق بود.' }
    }
  })

  // Stop an in-flight free-config test so a connection can be established.
  ipcMain.handle('free:stop-testing', async () => {
    return stopFreeTesting()
  })

  // Force a DEEP crawl: ignore throttle + cursor, re-scan the last 200 posts of
  // both channels (even already-seen) and import any new configs. One-shot.
  ipcMain.handle('free:crawl-deep', async () => {
    try {
      const result = await crawlFreeConfigs({ force: true, deep: true })
      const [servers, meta] = await Promise.all([getFreePool(), getFreePoolMeta()])
      return { success: true, added: result.added, skipped: result.skipped, servers, meta, error: null }
    } catch (err) {
      return { success: false, added: 0, servers: [], meta: null, error: err?.message ?? 'بررسی کامل کانال‌ها ناموفق بود.' }
    }
  })

  // Re-measure ping for the free configs that already passed the working test.
  ipcMain.handle('free:refresh-pings', async () => {
    try {
      const result = await refreshWorkingPings()
      const [servers, meta] = await Promise.all([getFreePool(), getFreePoolMeta()])
      return { success: true, ...result, servers, meta, error: null }
    } catch (err) {
      return { success: false, servers: [], meta: null, error: err?.message ?? 'بروزرسانی پینگ ناموفق بود.' }
    }
  })

  // Connect to a free config — identical path to a subscription connect (spec #8).
  ipcMain.handle('free:connect-specific-node', async (_event, input) => {
    const { nodeId, nodeUri, directDomains, rescueOptions, enginePreference } = input ?? {}
    return connectFreeConfig({ nodeId, nodeUri, directDomains, rescueOptions, enginePreference })
  })

  ipcMain.handle('free:remove-node', async (_event, nodeId) => {
    try {
      if (!nodeId) return { success: false, servers: [], meta: null, error: 'شناسه کانفیگ نامعتبر است.' }
      await removeFreeServer(nodeId)
      const [servers, meta] = await Promise.all([getFreePool(), getFreePoolMeta()])
      return { success: true, servers, meta, error: null }
    } catch (err) {
      return { success: false, servers: [], meta: null, error: err?.message ?? 'حذف کانفیگ ناموفق بود.' }
    }
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
      { name: 'Gemini', domain: 'gemini.google.com', path: '/' },
      { name: 'Telegram', domain: 'web.telegram.org', path: '/' },
      { name: 'X (Twitter)', domain: 'x.com', path: '/' },
      { name: 'Instagram', domain: 'instagram.com', path: '/' },
    ]
    const PROXY_PORT = 2080
    const TIMEOUT_MS = 8000

    async function testViaProxy(domain, path) {
      return new Promise((resolve) => {
        const net = require('node:net')
        const tls = require('node:tls')
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
        const onConnectData = (chunk) => {
          buffer += chunk.toString()
          if (!buffer.includes('\r\n\r\n')) return
          socket.off('data', onConnectData)
          const firstLine = buffer.split('\r\n')[0] ?? ''
          if (!/\s200\s/.test(firstLine)) {
            const m = firstLine.match(/HTTP\/\d+\.?\d*\s+(\d+)/)
            done(false, m ? parseInt(m[1]) : null)
            return
          }

          const secure = tls.connect({
            socket,
            servername: domain,
            rejectUnauthorized: true,
          }, () => {
            secure.write(
              `GET ${path} HTTP/1.1\r\nHost: ${domain}\r\nUser-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) ManfazVPN/${app.getVersion()}\r\nAccept: text/html,*/*\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`,
            )
          })
          let responseHead = ''
          secure.on('data', (data) => {
            responseHead += data.toString('latin1')
            if (!responseHead.includes('\r\n')) return
            const statusMatch = responseHead.match(/^HTTP\/\d(?:\.\d)?\s+(\d{3})/)
            if (!statusMatch) return
            const status = Number(statusMatch[1])
            // Redirects are a valid service response. 401 and 429 also prove
            // the service is reachable; 403 is the geo/exit-IP failure we need
            // to expose instead of falsely declaring the proxy healthy.
            done((status >= 200 && status < 400) || status === 401 || status === 429, status)
            secure.destroy()
          })
          secure.on('error', () => done(false, null))
          secure.setTimeout(TIMEOUT_MS, () => done(false, null))
        }
        socket.on('data', onConnectData)
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

  ipcMain.handle('system:get-close-to-tray', () => {
    return { enabled: closeToTrayEnabled, error: null }
  })

  ipcMain.handle('system:set-close-to-tray', async (_event, enabled) => {
    closeToTrayEnabled = enabled === true
    await saveCloseToTraySetting(closeToTrayEnabled)
    return { success: true, enabled: closeToTrayEnabled, error: null }
  })

  // ── DoH IPC handlers ────────────────────────────────────────────────────────

  ipcMain.handle('doh:get-settings', () => {
    const status = getStandaloneStatus()
    return {
      standaloneDoHServer,
      customDnsPrimary,
      customDnsSecondary,
      preferredDnsServer,
      preferredDnsPrimary,
      preferredDnsSecondary,
      proxyDoHEnabled,
      standaloneActive: status.active,
      activeConfig: status.config,
      error: null,
      smartCloudflare: { ...smartCloudflareDnsConfig },
    }
  })

  ipcMain.handle('doh:list-profiles', async () => ({
    success: true,
    profiles: await listDnsProfiles(app.getPath('userData')),
  }))

  ipcMain.handle('doh:save-profiles', async (_event, profiles) => {
    try {
      return { success: true, profiles: await saveDnsProfiles(app.getPath('userData'), profiles), error: null }
    } catch (error) {
      return { success: false, profiles: [], error: error?.message ?? 'Saving DNS profiles failed.' }
    }
  })

  ipcMain.handle('doh:test', async (_event, input) => {
    try {
      const server = input?.server
      const custom = server === 'cloudflare-smart'
        ? await resolveSmartCloudflareDns()
        : server === 'custom'
        ? { primary: input?.primary, secondary: input?.secondary, label: 'Custom DNS' }
        : null
      return await testDnsConfig(server === 'cloudflare-smart' ? 'custom' : server, custom)
    } catch (error) {
      return { success: false, results: [], error: error?.message ?? 'DNS test failed.' }
    }
  })

  ipcMain.handle('doh:set-preferred', async (_event, input) => {
    const server = typeof input === 'string' ? input : input?.server
    const allowed = new Set(['off', ...Object.keys(VPN_DNS_PRESETS), 'custom'])
    if (!allowed.has(server)) {
      return { success: false, error: 'DNS profile is not supported.' }
    }
    if (server === 'custom') {
      const primary = String(input?.primary ?? '').trim()
      const secondary = String(input?.secondary ?? '').trim()
      const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/
      if (!ipv4.test(primary) || (secondary && !ipv4.test(secondary))) {
        return { success: false, error: 'Custom DNS addresses must be valid IPv4 addresses.' }
      }
      preferredDnsPrimary = primary
      preferredDnsSecondary = secondary
    }
    preferredDnsServer = server
    await saveAppSettings()
    return {
      success: true,
      preferredDnsServer,
      preferredDnsPrimary,
      preferredDnsSecondary,
      error: null,
    }
  })

  ipcMain.handle('doh:set-standalone', async (_event, input) => {
    const server = typeof input === 'string' ? input : input?.server
    const custom = server === 'cloudflare-smart'
      ? await resolveSmartCloudflareDns()
      : server === 'custom'
      ? { primary: input?.primary, secondary: input?.secondary, label: 'Custom DNS' }
      : null
    const prev = standaloneDoHServer
    const prevPrimary = customDnsPrimary
    const prevSecondary = customDnsSecondary
    try {
      if (server === 'off') {
        await disableStandaloneDoH(app.getPath('userData'))
        // DNS-only disconnect is also a safe recovery boundary for a local
        // Manfaz proxy left enabled by an interrupted VPN session.
        await restoreWindowsProxyState(app.getPath('userData'))
      } else {
        try {
          await enableStandaloneDoH(server === 'cloudflare-smart' ? 'custom' : server, custom, app.getPath('userData'))
        } catch (error) {
          if (server !== 'cloudflare-smart' || custom?.primary === '1.1.1.1') throw error
          smartCloudflareDnsConfig = {
            primary: '1.1.1.1', secondary: '1.0.0.1', label: 'Cloudflare Smart',
            template: 'https://cloudflare-dns.com/dns-query',
          }
          await enableStandaloneDoH('custom', smartCloudflareDnsConfig, app.getPath('userData'))
        }
      }
      standaloneDoHServer = server
      if (server === 'custom') {
        customDnsPrimary = String(custom.primary ?? '').trim()
        customDnsSecondary = String(custom.secondary ?? '').trim()
      }
      await saveAppSettings()
      return {
        success: true,
        standaloneDoHServer,
        customDnsPrimary,
        customDnsSecondary,
        standaloneActive: server !== 'off',
        activeConfig: getStandaloneStatus().config,
        error: null,
      }
    } catch (err) {
      standaloneDoHServer = prev
      customDnsPrimary = prevPrimary
      customDnsSecondary = prevSecondary
      return {
        success: false,
        standaloneDoHServer: prev,
        customDnsPrimary: prevPrimary,
        customDnsSecondary: prevSecondary,
        standaloneActive: getStandaloneStatus().active,
        activeConfig: getStandaloneStatus().config,
        error: err?.message ?? 'Failed to change DNS server.',
      }
    }
  })

  ipcMain.handle('doh:set-proxy-doh', async (_event, enabled) => {
    proxyDoHEnabled = enabled === true
    await saveAppSettings()
    return { success: true, proxyDoHEnabled, error: null }
  })

  ipcMain.handle('app:update-get-settings', () => ({
    enabled: autoUpdateEnabled,
    currentVersion: app.getVersion(),
    state: { ...autoUpdateState },
  }))

  ipcMain.handle('app:update-set-enabled', async (_event, enabled) => {
    autoUpdateEnabled = enabled === true
    await saveAppSettings()
    if (autoUpdateEnabled) void checkForAppUpdate('manual')
    return { success: true, enabled: autoUpdateEnabled }
  })

  ipcMain.handle('app:check-for-update', async () => checkForAppUpdate('manual'))

  ipcMain.handle('app:download-update', async () => {
    if (!autoUpdateState.availableVersion) {
      return { success: false, error: 'No update is currently available.' }
    }
    try {
      autoUpdateState.phase = 'downloading'
      autoUpdateState.error = null
      sendAutoUpdateState()
      if (fallbackUpdateAsset) {
        await downloadFallbackInstaller()
      } else {
        await autoUpdater.downloadUpdate()
      }
      return { success: true, error: null }
    } catch (error) {
      autoUpdateState.phase = 'error'
      autoUpdateState.error = error instanceof Error ? error.message : 'Update download failed.'
      sendAutoUpdateState()
      return { success: false, error: autoUpdateState.error }
    }
  })

  ipcMain.handle('app:install-update', () => {
    try {
      if (autoUpdateState.phase !== 'ready') {
        return { success: false, error: 'The update has not finished downloading.' }
      }
      if (downloadedFallbackInstaller) {
        const installer = spawn(downloadedFallbackInstaller, [], {
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        })
        installer.unref()
        setTimeout(() => app.quit(), 500)
      } else {
        autoUpdater.quitAndInstall(false, true)
      }
      return { success: true, error: null }
    } catch (err) {
      console.error('[Updater] quitAndInstall error:', err?.message)
      return { success: false, error: err?.message ?? 'Could not install the update.' }
    }
  })

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
    expectedEngineStop = true
    try {
      await connectionEngines.stopSelected({ userDataPath: app.getPath('userData') })
      setVirtualLocationConnected(false)
      return { success: true, error: null }
    } catch (err) {
      return { success: false, error: err?.message ?? 'قطع اتصال سرور رایگان ناموفق بود.' }
    }
  })

  // ── Split tunneling (per-app bypass) ────────────────────────────────────────
  ipcMain.handle('apps:list', async () => {
    const { getApps } = require('./split-tunnel-store.cjs')
    return getApps(app.getPath('userData')).catch(() => [])
  })

  ipcMain.handle('apps:add', async () => {
    const { dialog } = require('electron')
    const { addApp } = require('./split-tunnel-store.cjs')
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'انتخاب برنامه',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Programs', extensions: ['exe'] }],
      defaultPath: process.env['ProgramFiles'] || undefined,
    })
    if (res.canceled || !res.filePaths?.length) return { success: false, apps: await require('./split-tunnel-store.cjs').getApps(app.getPath('userData')).catch(() => []) }
    for (const p of res.filePaths) {
      const processName = path.basename(p)
      const name = processName.replace(/\.exe$/i, '')
      let icon = null
      try {
        const img = await app.getFileIcon(p, { size: 'normal' })
        icon = img?.isEmpty?.() ? null : img.toDataURL()
      } catch {}
      await addApp(app.getPath('userData'), { name, processName, path: p, icon }).catch(() => {})
    }
    return { success: true, apps: await require('./split-tunnel-store.cjs').getApps(app.getPath('userData')).catch(() => []) }
  })

  ipcMain.handle('apps:remove', async (_event, processName) => {
    const { removeApp, getApps } = require('./split-tunnel-store.cjs')
    await removeApp(app.getPath('userData'), processName).catch(() => {})
    return { success: true, apps: await getApps(app.getPath('userData')).catch(() => []) }
  })

  // ── Kill switch ─────────────────────────────────────────────────────────────
  ipcMain.handle('killswitch:get', async () => {
    const ks = require('./kill-switch.cjs')
    return {
      enabled: await ks.getKillSwitchEnabled(app.getPath('userData')).catch(() => false),
      active: await ks.refreshKillSwitchActive().catch(() => ks.isKillSwitchActive()),
    }
  })

  ipcMain.handle('killswitch:set', async (_event, enabled) => {
    const ks = require('./kill-switch.cjs')
    return ks.setKillSwitchEnabled(app.getPath('userData'), Boolean(enabled)).catch((e) => ({ enabled: false, error: e?.message }))
  })

  // User chose to restore internet after the kill switch fired.
  ipcMain.handle('killswitch:deactivate', async () => {
    const ks = require('./kill-switch.cjs')
    const res = await ks.deactivateKillSwitch().catch((e) => ({ success: false, error: e?.message }))
    return res
  })

  // ── Network repair ──────────────────────────────────────────────────────────
  // One-click fix for a machine left in a bad state by a hard-kill: clears a
  // stuck local system proxy (127.0.0.1:2080), kills orphan sing-box engines
  // holding the ports, and removes any leftover kill-switch firewall block.
  ipcMain.handle('network:repair', async () => {
    const steps = { proxy: false, engines: false, dns: false, killswitch: false }
    try {
      // Stop our own engine first so we don't fight it.
      expectedEngineStop = true
      await connectionEngines.stopEveryEngine(app.getPath('userData')).catch(() => {})
    } catch {}
    try {
      const { forceDisableLocalManualProxy } = require('./windows-proxy-state.cjs')
      await forceDisableLocalManualProxy()
      steps.proxy = true
    } catch {}
    try {
      const { freeEnginePorts } = require('./sing-box-process-manager.cjs')
      freeEnginePorts()
      steps.engines = true
    } catch {}
    try {
      await disableStandaloneDoH(app.getPath('userData'))
      standaloneDoHServer = 'off'
      await saveAppSettings().catch(() => {})
      steps.dns = true
    } catch {}
    try {
      const result = await require('./kill-switch.cjs').deactivateKillSwitch()
      steps.killswitch = result.success
    } catch {}
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('killswitch:deactivated', {})
    return {
      success: Object.values(steps).every(Boolean),
      steps,
    }
  })

  // ── CF IP Scanner ──────────────────────────────────────────────────────────

  ipcMain.handle('tools:cf-scan', async (_event, { port } = {}) => {
    try {
      const scanResult = await scanCloudflareIps({ port: Number(port) || 443 })
      await saveCfScanCache(app.getPath('userData'), scanResult.results ?? []).catch(() => {})
      return { success: true, ...scanResult }
    } catch (err) {
      return { success: false, error: err?.message ?? 'اسکن IP ناموفق بود.' }
    }
  })

  ipcMain.handle('tools:get-cf-auto-scan', async () => {
    const settings = await getCfAutoScanSettings(app.getPath('userData')).catch(() => ({ enabled: true }))
    const cache = await getCfScanCache(app.getPath('userData')).catch(() => null)
    return { settings, cache }
  })

  ipcMain.handle('tools:set-cf-auto-scan', async (_event, { enabled, intervalHours }) => {
    const newSettings = {
      enabled: enabled !== false,
      intervalHours: typeof intervalHours === 'number' ? intervalHours : 0,
    }
    await setCfAutoScanSettings(app.getPath('userData'), newSettings)
    scheduleCfScanInterval(newSettings.intervalHours)
    return { success: true }
  })

  // ── WARP ───────────────────────────────────────────────────────────────────

          // ── Subscription Converter ─────────────────────────────────────────────────

  ipcMain.handle('tools:get-converter-backends', () => {
    return { backends: getConverterBackends(), targets: getConverterTargets() }
  })

  ipcMain.handle('tools:convert-subscription', async (_event, { subscriptionUrl, backendId, targetId }) => {
    try {
      const result = await convertSubscription({ subscriptionUrl, backendId, targetId })
      return result
    } catch (err) {
      return { success: false, error: err?.message ?? 'تبدیل اشتراک ناموفق بود.' }
    }
  })

  // ── Upstream Proxy ─────────────────────────────────────────────────────────

  ipcMain.handle('tools:get-upstream-proxy', async () => {
    try {
      const settings = await getUpstreamProxy(app.getPath('userData'))
      return { success: true, settings }
    } catch (err) {
      return { success: false, error: err?.message }
    }
  })

  ipcMain.handle('tools:set-upstream-proxy', async (_event, settings) => {
    try {
      const saved = await setUpstreamProxy(app.getPath('userData'), settings)
      return { success: true, settings: saved }
    } catch (err) {
      return { success: false, error: err?.message }
    }
  })

  // ── uTLS / ECH Settings ────────────────────────────────────────────────────

  ipcMain.handle('tools:get-utls-settings', async () => {
    try {
      const settings = await getUTlsSettings(app.getPath('userData'))
      return { success: true, settings }
    } catch (err) {
      return { success: false, error: err?.message }
    }
  })

  ipcMain.handle('tools:set-utls-settings', async (_event, settings) => {
    try {
      const saved = await setUTlsSettings(app.getPath('userData'), settings)
      return { success: true, settings: saved }
    } catch (err) {
      return { success: false, error: err?.message }
    }
  })

  // ── Settings Backup / Restore ───────────────────────────────────────────────

  ipcMain.handle('settings:export', async () => {
    try {
      const data = await exportSettings(app.getPath('userData'))
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err?.message }
    }
  })

  ipcMain.handle('settings:import', async (_event, backup) => {
    try {
      await importSettings(app.getPath('userData'), backup)
      return { success: true }
    } catch (err) {
      return { success: false, error: err?.message }
    }
  })

  // ── Bandwidth Monitor (Clash API) ───────────────────────────────────────────

  ipcMain.handle('engine:get-traffic', async () => {
    try {
      const { net } = require('electron')
      const r = await net.fetch('http://127.0.0.1:9090/connections', {
        signal: AbortSignal.timeout(1000),
      })
      if (!r.ok) { lastTrafficSample = null; return { up: 0, down: 0, connections: 0, upTotal: 0, downTotal: 0 } }
      const data = await r.json()
      const upTotal = data.uploadTotal ?? 0
      const downTotal = data.downloadTotal ?? 0
      const connections = Array.isArray(data.connections) ? data.connections.length : 0
      const now = Date.now()

      // /connections gives CUMULATIVE totals. Convert to live bytes/sec by diffing
      // against the previous sample. A reset (totals went down) restarts the baseline.
      let up = 0
      let down = 0
      if (lastTrafficSample && upTotal >= lastTrafficSample.upTotal && downTotal >= lastTrafficSample.downTotal) {
        const seconds = Math.max(0.2, (now - lastTrafficSample.at) / 1000)
        up = Math.max(0, Math.round((upTotal - lastTrafficSample.upTotal) / seconds))
        down = Math.max(0, Math.round((downTotal - lastTrafficSample.downTotal) / seconds))
      }
      lastTrafficSample = { upTotal, downTotal, at: now }

      return { up, down, connections, upTotal, downTotal }
    } catch {
      lastTrafficSample = null
      return { up: 0, down: 0, connections: 0, upTotal: 0, downTotal: 0 }
    }
  })

  // ── Zeus Panel ──────────────────────────────────────────────────────────────

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
      show: false,
      backgroundColor:
        '#090b10',
      title:
        'Manfaz VPN',
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

  mainWindow.maximize()
  mainWindow.show()

  mainWindow.on('close', (event) => {
    if (!isQuitting && closeToTrayEnabled) {
      event.preventDefault()
      mainWindow.hide()
    }
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
        connectionEngines.disposeAll({
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

  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (params.isEditable) {
      const menu = Menu.buildFromTemplate([
        { role: 'cut', label: 'برش', enabled: params.editFlags.canCut },
        { role: 'copy', label: 'کپی', enabled: params.editFlags.canCopy },
        { role: 'paste', label: 'جای‌گذاری', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { role: 'selectAll', label: 'انتخاب همه' },
      ])
      menu.popup({ window: mainWindow })
    }
  })

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



// ── Auto-Update ───────────────────────────────────────────────────────────────

const autoUpdateState = {
  phase: 'idle',
  availableVersion: null,
  percent: 0,
  error: null,
  retryAfterConnection: false,
  lastCheckedAt: null,
}

function getBundledXrayPath() {
  return isDevelopment
    ? path.join(__dirname, '..', 'resources', 'xray', 'xray.exe')
    : path.join(process.resourcesPath, 'xray', 'xray.exe')
}

function getXrayPath() {
  return getBundledXrayPath()
}
let autoUpdateCheckInFlight = null
let fallbackUpdateAsset = null
let downloadedFallbackInstaller = null

function compareVersions(left, right) {
  const a = String(left ?? '').replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  const b = String(right ?? '').replace(/^v/i, '').split('.').map((part) => Number.parseInt(part, 10) || 0)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    if ((a[index] ?? 0) > (b[index] ?? 0)) return 1
    if ((a[index] ?? 0) < (b[index] ?? 0)) return -1
  }
  return 0
}

async function checkGithubReleaseFallback(reason) {
  const response = await net.fetch(
    'https://api.github.com/repos/hrschemiker/ManfazVpn-Windows/releases/latest',
    {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `Manfaz-VPN/${app.getVersion()}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  )
  if (!response.ok) throw new Error(`GitHub update service returned HTTP ${response.status}.`)
  const release = await response.json()
  const version = String(release?.tag_name ?? release?.name ?? '').replace(/^v/i, '')
  if (!version) throw new Error('The latest GitHub release has no version.')

  autoUpdateState.lastCheckedAt = new Date().toISOString()
  autoUpdateState.retryAfterConnection = false
  autoUpdateState.error = null
  fallbackUpdateAsset = Array.isArray(release?.assets)
    ? release.assets.find((asset) => /\.exe$/i.test(asset?.name ?? '') && /setup/i.test(asset?.name ?? '')) ?? null
    : null

  if (compareVersions(version, app.getVersion()) > 0) {
    autoUpdateState.phase = 'available'
    autoUpdateState.availableVersion = version
    autoUpdateState.percent = 0
  } else {
    autoUpdateState.phase = 'idle'
    autoUpdateState.availableVersion = null
    autoUpdateState.percent = 0
  }
  sendAutoUpdateState()
  return { success: true, updateInfo: { version, releaseUrl: release?.html_url ?? null }, reason }
}

async function downloadFallbackInstaller() {
  if (!fallbackUpdateAsset?.browser_download_url) {
    throw new Error('Installer asset is not available in the GitHub release.')
  }
  const response = await net.fetch(fallbackUpdateAsset.browser_download_url, {
    headers: { 'User-Agent': `Manfaz-VPN/${app.getVersion()}` },
  })
  if (!response.ok || !response.body) {
    throw new Error(`Installer download failed with HTTP ${response.status}.`)
  }

  const safeName = path.basename(String(fallbackUpdateAsset.name ?? 'Manfaz-VPN-Update.exe'))
  const target = path.join(app.getPath('temp'), safeName)
  const file = await fs.promises.open(target, 'w')
  const reader = response.body.getReader()
  const total = Number(response.headers.get('content-length') ?? fallbackUpdateAsset.size ?? 0)
  let received = 0
  const hash = crypto.createHash('sha256')
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      await file.write(chunk)
      hash.update(chunk)
      received += chunk.length
      autoUpdateState.percent = total > 0 ? Math.min(99, Math.round((received / total) * 100)) : 0
      sendAutoUpdateState()
    }
  } finally {
    await file.close()
  }

  const actualDigest = hash.digest('hex').toLowerCase()
  const expectedDigest = String(fallbackUpdateAsset.digest ?? '').replace(/^sha256:/i, '').toLowerCase()
  if (expectedDigest && expectedDigest !== actualDigest) {
    await fs.promises.rm(target, { force: true })
    throw new Error('Downloaded installer integrity check failed.')
  }
  downloadedFallbackInstaller = target
  autoUpdateState.phase = 'ready'
  autoUpdateState.percent = 100
  autoUpdateState.error = null
  sendAutoUpdateState()
}

function sendAutoUpdateState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app:update-state', { ...autoUpdateState })
  }
}

async function checkForAppUpdate(reason = 'scheduled') {
  if (isDevelopment || !autoUpdateEnabled) {
    return { success: false, skipped: true, reason: isDevelopment ? 'development' : 'disabled' }
  }
  if (autoUpdateCheckInFlight) return autoUpdateCheckInFlight

  autoUpdateCheckInFlight = (async () => {
    autoUpdateState.phase = 'checking'
    autoUpdateState.error = null
    sendAutoUpdateState()
    try {
      const result = await autoUpdater.checkForUpdates()
      autoUpdateState.lastCheckedAt = new Date().toISOString()
      autoUpdateState.retryAfterConnection = false
      if (!result?.updateInfo || result.updateInfo.version === app.getVersion()) {
        autoUpdateState.phase = 'idle'
      }
      sendAutoUpdateState()
      return { success: true, updateInfo: result?.updateInfo ?? null, reason }
    } catch (error) {
      try {
        return await checkGithubReleaseFallback(reason)
      } catch (fallbackError) {
        autoUpdateState.phase = 'error'
        autoUpdateState.error = fallbackError instanceof Error
          ? fallbackError.message
          : error instanceof Error ? error.message : 'Update check failed.'
        autoUpdateState.retryAfterConnection = true
        sendAutoUpdateState()
        return { success: false, error: autoUpdateState.error, reason }
      }
    } finally {
      autoUpdateCheckInFlight = null
    }
  })()

  return autoUpdateCheckInFlight
}

async function retryAutoUpdateAfterConnection() {
  if (!autoUpdateEnabled || !autoUpdateState.retryAfterConnection) return
  await checkForAppUpdate('connection-restored')
}

function setupAutoUpdater() {
  if (isDevelopment) return

  // Discovery is automatic, but downloading is always an explicit user
  // decision. Once downloaded, installation is also confirmed separately.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.autoRunAppAfterInstall = true

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version)
    autoUpdateState.phase = 'available'
    autoUpdateState.availableVersion = info.version
    autoUpdateState.percent = 0
    autoUpdateState.error = null
    sendAutoUpdateState()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-available', {
        version: info.version,
        releaseNotes: info.releaseNotes ?? null,
      })
    }
  })

  autoUpdater.on('update-not-available', () => {
    autoUpdateState.phase = 'idle'
    autoUpdateState.availableVersion = null
    autoUpdateState.percent = 0
    autoUpdateState.error = null
    sendAutoUpdateState()
  })

  autoUpdater.on('download-progress', (progress) => {
    autoUpdateState.phase = 'downloading'
    autoUpdateState.percent = Math.max(0, Math.min(100, Math.round(progress.percent ?? 0)))
    sendAutoUpdateState()
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version)
    autoUpdateState.phase = 'ready'
    autoUpdateState.availableVersion = info.version
    autoUpdateState.percent = 100
    autoUpdateState.error = null
    sendAutoUpdateState()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('app:update-downloaded', {
        version: info.version,
      })
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err?.message ?? err)
    autoUpdateState.phase = 'error'
    autoUpdateState.error = err?.message ?? String(err)
    autoUpdateState.retryAfterConnection = true
    sendAutoUpdateState()
  })

  // Check quietly as soon as the window is ready. If GitHub is blocked, the
  // failed check is retried exactly when a verified VPN connection comes up.
  setTimeout(() => {
    void checkForAppUpdate('startup')
  }, 1500)
  setInterval(() => {
    void checkForAppUpdate('scheduled')
  }, 4 * 60 * 60 * 1000)
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

  // Kill switch: on a fresh launch nothing is connected yet, so a leftover
  // block-all-outbound firewall rule (from a crash / force-kill while the
  // tunnel was up) must never survive. Always clear it on startup — the switch
  // re-arms only when an actual live connection drops unexpectedly.
  try {
    const ks = require('./kill-switch.cjs')
    await ks.deactivateKillSwitch()
  } catch (error) {
    console.error(
      '[Engine] Startup kill-switch cleanup failed:',
      error instanceof Error ? error.message : 'Unknown error',
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





  registerIpcHandlers()
  loadAppSettings().then(async () => {
    const dnsStatus = await initializeDnsManager(app.getPath('userData')).catch((error) => {
      console.error('[DNS] State recovery failed:', error?.message ?? error)
      return { active: false }
    })
    if (!dnsStatus.active && standaloneDoHServer !== 'off') {
      standaloneDoHServer = 'off'
      await saveAppSettings().catch(() => {})
    }
    createMainWindow()
    setupTray()
    setupAutoUpdater()
  })

  // Initialize pool metadata from disk, then start background refresh
  getFreePoolMeta().then((meta) => {
    freeConfigState.poolCount = meta.total
    freeConfigState.poolDisplaying = meta.displaying
    freeConfigState.poolLastRefreshedAt = meta.lastRefreshedAt
  }).catch(() => {})
  startFreeBackgroundRefresh()
  startTelegramCrawler()

  // Auto CF IP scan in background (non-blocking)
  getCfAutoScanSettings(app.getPath('userData')).then(async (settings) => {
    if (!settings.enabled) return
    console.log('[CF-Scan] Starting background auto-scan...')
    try {
      const scanResult = await scanCloudflareIps({ port: 443 })
      if (scanResult.reachable > 0) {
        await saveCfScanCache(app.getPath('userData'), scanResult.results ?? [])
        await resolveSmartCloudflareDns().catch(() => {})
        console.log(`[CF-Scan] Auto-scan complete. Best IP: ${scanResult.results?.[0]?.ip} (${scanResult.results?.[0]?.latencyMs}ms)`)
      }
    } catch (err) {
      console.error('[CF-Scan] Auto-scan failed:', err?.message ?? err)
    }
    scheduleCfScanInterval(settings.intervalHours ?? 0)
  }).catch(() => {})

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
    if (shutdownCleanupStarted) {
      return
    }

    event.preventDefault()
    isQuitting = true
    shutdownCleanupStarted = true

    // Quitting is an expected engine stop — never let it look like a drop and
    // arm the kill switch. Also lift any active block so closing the app can
    // never leave the machine without internet.
    expectedEngineStop = true
    void require('./kill-switch.cjs').deactivateKillSwitch().catch(() => {})

    if (freeBackgroundTimer) { clearInterval(freeBackgroundTimer); freeBackgroundTimer = null }
    if (cfScanIntervalTimer) { clearInterval(cfScanIntervalTimer); cfScanIntervalTimer = null }
    if (telegramCrawlTimer) { clearInterval(telegramCrawlTimer); telegramCrawlTimer = null }

    void Promise.allSettled([
      connectionEngines.disposeAll({
        userDataPath:
          app.getPath(
            'userData',
          ),
      }),
      // DNS-only and VPN-specific DNS are session-scoped. Always restore the
      // exact per-adapter baseline before the application exits.
      disableStandaloneDoH(app.getPath('userData')),
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
    // When close-to-tray is enabled, windows are hidden (not closed),
    // so this event fires only when isQuitting=true or closeToTray=false.
    if (process.platform !== 'darwin') {
      app.quit()
    }
  },
)
