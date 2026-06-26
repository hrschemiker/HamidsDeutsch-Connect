const path = require('node:path')
const fsp = require('node:fs/promises')

const MANIFEST = {
  manifest_version: 3,
  name: 'HamidsDeutsch Virtual Location',
  version: '1.2.0',
  description: 'Automatically aligns browser HTML5 geolocation with HamidsDeutsch Connect. Respects the direct-domain list — direct-domain sites always show the real location.',
  permissions: ['storage', 'alarms', 'tabs'],
  host_permissions: [
    'http://127.0.0.1:47891/*',
    'https://ipwho.is/*',
  ],
  background: {
    service_worker: 'service-worker.js',
    type: 'module',
  },
  action: {
    default_title: 'HamidsDeutsch Virtual Location',
    default_popup: 'popup.html',
  },
  content_scripts: [
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['page-inject.js'],
      run_at: 'document_start',
      all_frames: true,
      world: 'MAIN',
    },
    {
      matches: ['http://*/*', 'https://*/*'],
      js: ['content-bridge.js'],
      run_at: 'document_start',
      all_frames: true,
    },
  ],
}

const SERVICE_WORKER = `
const STATUS_URL = 'http://127.0.0.1:47891/status'
const LOCATION_URL = 'https://ipwho.is/'
const ALARM_NAME = 'hamidsdeutsch-virtual-location-poll'

const DEFAULT_STATE = {
  appConnected: false,
  enabled: false,
  location: null,
  directDomains: [],
  lastError: null,
  updatedAt: null,
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarm()
  await refreshState()
})

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm()
  await refreshState()
})

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await refreshState()
  }
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'get-state') {
    getState()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          ...DEFAULT_STATE,
          lastError: error instanceof Error ? error.message : 'خواندن وضعیت مکان مجازی ناموفق بود.',
        })
      })
    return true
  }

  if (message?.type === 'refresh-state') {
    refreshState()
      .then(sendResponse)
      .catch((error) => {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : 'به‌روزرسانی وضعیت ناموفق بود.',
        })
      })
    return true
  }

  return false
})

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME)
  if (!existing) {
    chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 })
  }
}

async function getState() {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_STATE))
  return { ...DEFAULT_STATE, ...stored }
}

async function refreshState() {
  const appState = await getAppConnectionState()

  if (!appState.connected) {
    const state = {
      appConnected: false,
      enabled: false,
      location: null,
      directDomains: appState.directDomains,
      lastError: null,
      updatedAt: new Date().toISOString(),
    }
    await chrome.storage.local.set(state)
    await broadcastState(state)
    return { success: true, state }
  }

  try {
    const response = await fetch(LOCATION_URL, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
    })

    if (!response.ok) throw new Error('HTTP ' + response.status)

    const payload = await response.json()

    if (
      payload?.success === false ||
      !Number.isFinite(payload?.latitude) ||
      !Number.isFinite(payload?.longitude)
    ) {
      throw new Error(payload?.message || 'پاسخ موقعیت IP معتبر نبود.')
    }

    const state = {
      appConnected: true,
      enabled: true,
      location: {
        latitude: payload.latitude,
        longitude: payload.longitude,
        accuracy: 25000,
        city: typeof payload.city === 'string' ? payload.city : '',
        region: typeof payload.region === 'string' ? payload.region : '',
        country: typeof payload.country === 'string' ? payload.country : '',
        countryCode: typeof payload.country_code === 'string' ? payload.country_code : '',
      },
      directDomains: appState.directDomains,
      lastError: null,
      updatedAt: new Date().toISOString(),
    }

    await chrome.storage.local.set(state)
    await broadcastState(state)
    return { success: true, state }
  } catch (error) {
    const state = {
      appConnected: true,
      enabled: false,
      location: null,
      directDomains: appState.directDomains,
      lastError: error instanceof Error ? error.message : 'دریافت موقعیت IP ناموفق بود.',
      updatedAt: new Date().toISOString(),
    }
    await chrome.storage.local.set(state)
    await broadcastState(state)
    return { success: false, state, error: state.lastError }
  }
}

async function getAppConnectionState() {
  try {
    const response = await fetch(STATUS_URL, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      signal: AbortSignal.timeout(1200),
    })

    if (!response.ok) return { connected: false, directDomains: [] }

    const payload = await response.json()
    return {
      connected: payload?.connected === true,
      directDomains: Array.isArray(payload?.directDomains) ? payload.directDomains : [],
    }
  } catch {
    return { connected: false, directDomains: [] }
  }
}

function isDirectDomain(hostname, domains) {
  const h = hostname.replace(/^www\\./, '')
  return domains.some((d) => h === d || h.endsWith('.' + d))
}

async function broadcastState(state) {
  const tabs = await chrome.tabs.query({})
  const domains = Array.isArray(state?.directDomains) ? state.directDomains : []

  await Promise.allSettled(
    tabs.map((tab) => {
      if (!tab.id || !/^https?:/i.test(tab.url || '')) return Promise.resolve()

      let enabled = state?.enabled ?? false
      if (enabled && domains.length > 0) {
        try {
          const host = new URL(tab.url).hostname
          if (isDirectDomain(host, domains)) enabled = false
        } catch {
          enabled = false
        }
      }

      const tabState =
        enabled === (state?.enabled ?? false)
          ? state
          : Object.assign({}, state, { enabled })

      return chrome.tabs.sendMessage(tab.id, {
        type: 'virtual-location-state',
        state: tabState,
      })
    }),
  )
}
`.trimStart()

const CONTENT_BRIDGE = `
const EVENT_NAME = '__HAMIDSDEUTSCH_VIRTUAL_LOCATION__'

void syncState()

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'virtual-location-state') {
    // Service worker already computed per-tab enabled state
    publishState(message.state)
  }
})

chrome.storage.onChanged.addListener((_changes, areaName) => {
  if (areaName === 'local') {
    void syncState()
  }
})

async function syncState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'get-state' })
    publishState(applyDirectDomainFilter(state))
  } catch {
    publishState({ enabled: false, location: null, updatedAt: null })
  }
}

function applyDirectDomainFilter(state) {
  if (!state?.enabled) return state
  const domains = Array.isArray(state?.directDomains) ? state.directDomains : []
  if (domains.length === 0) return state
  try {
    const host = location.hostname.replace(/^www\\./, '')
    const isDirect = domains.some((d) => host === d || host.endsWith('.' + d))
    if (isDirect) return Object.assign({}, state, { enabled: false })
  } catch {}
  return state
}

function publishState(state) {
  window.dispatchEvent(
    new CustomEvent(EVENT_NAME, {
      detail: {
        enabled: state?.enabled === true,
        location: normalizeLocation(state?.location),
        updatedAt: typeof state?.updatedAt === 'string' ? state.updatedAt : null,
      },
    }),
  )
}

function normalizeLocation(location) {
  if (!Number.isFinite(location?.latitude) || !Number.isFinite(location?.longitude)) {
    return null
  }
  return {
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: Number.isFinite(location.accuracy) ? location.accuracy : 25000,
  }
}
`.trimStart()

const PAGE_INJECT = `
(() => {
  const EVENT_NAME = '__HAMIDSDEUTSCH_VIRTUAL_LOCATION__'

  const original = navigator.geolocation
  if (!original) return

  const originalGet = original.getCurrentPosition.bind(original)
  const originalWatch = original.watchPosition.bind(original)
  const originalClear = original.clearWatch.bind(original)

  let enabled = false
  let location = null
  let nextWatchId = 1000000
  const virtualWatches = new Map()

  window.addEventListener(EVENT_NAME, (event) => {
    enabled = Boolean(event?.detail?.enabled)
    location = normalizeLocation(event?.detail?.location)
    if (enabled && location) notifyVirtualWatches()
  })

  function createPosition() {
    const now = Date.now()
    return {
      coords: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: now,
      toJSON() { return { coords: this.coords, timestamp: this.timestamp } },
    }
  }

  function getCurrentPosition(success, error, options) {
    if (!enabled || !location) return originalGet(success, error, options)
    queueMicrotask(() => { if (typeof success === 'function') success(createPosition()) })
  }

  function watchPosition(success, error, options) {
    if (!enabled || !location) return originalWatch(success, error, options)
    const id = nextWatchId++
    virtualWatches.set(id, { success })
    queueMicrotask(() => {
      if (virtualWatches.has(id) && typeof success === 'function') success(createPosition())
    })
    return id
  }

  function clearWatch(id) {
    if (virtualWatches.delete(id)) return
    originalClear(id)
  }

  function notifyVirtualWatches() {
    const position = createPosition()
    for (const { success } of virtualWatches.values()) {
      if (typeof success === 'function') queueMicrotask(() => success(position))
    }
  }

  function normalizeLocation(value) {
    if (!Number.isFinite(value?.latitude) || !Number.isFinite(value?.longitude)) return null
    return {
      latitude: value.latitude,
      longitude: value.longitude,
      accuracy: Number.isFinite(value.accuracy) ? value.accuracy : 25000,
    }
  }

  try {
    Object.defineProperties(navigator.geolocation, {
      getCurrentPosition: { configurable: true, value: getCurrentPosition },
      watchPosition: { configurable: true, value: watchPosition },
      clearWatch: { configurable: true, value: clearWatch },
    })
  } catch {
    try {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: { getCurrentPosition, watchPosition, clearWatch },
      })
    } catch {
      // Browser prevented geolocation override.
    }
  }
})()
`.trimStart()

const POPUP_HTML = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>HamidsDeutsch Virtual Location</title>
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <main>
    <header>
      <span class="brand-dot"></span>
      <div>
        <strong>HamidsDeutsch</strong>
        <span>Virtual Location</span>
      </div>
    </header>

    <section class="status-card">
      <span class="label">وضعیت خودکار</span>
      <strong id="status">در حال بررسی...</strong>
      <span id="location"></span>
      <span id="updated"></span>
    </section>

    <p id="error" class="error" hidden></p>

    <button id="refresh" type="button">بررسی دوباره</button>

    <p class="hint">
      افزونه فقط هنگام اتصال تأییدشده HamidsDeutsch فعال است.
      سایت‌های موجود در فهرست دسترسی مستقیم همیشه موقعیت واقعی را نشان می‌دهند.
    </p>
  </main>

  <script src="popup.js"></script>
</body>
</html>
`

const POPUP_JS = `
const statusText = document.querySelector('#status')
const locationText = document.querySelector('#location')
const updatedText = document.querySelector('#updated')
const errorText = document.querySelector('#error')
const refreshButton = document.querySelector('#refresh')

void renderState()

refreshButton.addEventListener('click', async () => {
  refreshButton.disabled = true
  refreshButton.textContent = 'در حال بررسی...'
  await chrome.runtime.sendMessage({ type: 'refresh-state' })
  await renderState()
  refreshButton.disabled = false
  refreshButton.textContent = 'بررسی دوباره'
})

async function renderState() {
  const result = await chrome.runtime.sendMessage({ type: 'refresh-state' })
  const state = result?.state ?? await chrome.runtime.sendMessage({ type: 'get-state' })

  if (state?.appConnected && state?.enabled) {
    statusText.textContent = 'فعال — متصل به HamidsDeutsch'
  } else if (state?.appConnected) {
    statusText.textContent = 'اتصال برنامه فعال است؛ موقعیت هنوز آماده نیست'
  } else {
    statusText.textContent = 'غیرفعال — برنامه متصل نیست'
  }

  const location = state?.location
  if (location) {
    const parts = [location.city, location.region, location.country].filter(Boolean)
    locationText.textContent = parts.join('، ') || 'مختصات IP دریافت شد'
  } else {
    locationText.textContent = ''
  }

  updatedText.textContent = state?.updatedAt
    ? 'آخرین بررسی: ' + new Date(state.updatedAt).toLocaleString('fa-IR')
    : ''

  if (state?.lastError) {
    errorText.hidden = false
    errorText.textContent = state.lastError
  } else {
    errorText.hidden = true
    errorText.textContent = ''
  }
}
`.trimStart()

const POPUP_CSS = `* { box-sizing: border-box; }
body {
  margin: 0;
  min-width: 340px;
  background: #0b1120;
  color: #f8fafc;
  font-family: Tahoma, Arial, sans-serif;
}
main { padding: 18px; }
header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
header > div, .status-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
header span, .status-card span, .hint {
  color: #94a3b8;
  font-size: 12px;
  line-height: 1.7;
}
.brand-dot {
  width: 11px;
  height: 11px;
  background: #facc15;
  border-radius: 50%;
}
.status-card {
  border: 1px solid #263244;
  background: #111827;
  padding: 14px;
}
.status-card strong { line-height: 1.7; }
button {
  width: 100%;
  min-height: 42px;
  margin-top: 14px;
  border: 0;
  background: #facc15;
  color: #111827;
  font-weight: 700;
  cursor: pointer;
}
button:disabled { opacity: 0.6; cursor: default; }
.error { color: #fca5a5; font-size: 12px; line-height: 1.7; }
.hint { margin: 10px 0 0; }
`

const EXTENSION_FILES = {
  'manifest.json': JSON.stringify(MANIFEST, null, 2),
  'service-worker.js': SERVICE_WORKER,
  'content-bridge.js': CONTENT_BRIDGE,
  'page-inject.js': PAGE_INJECT,
  'popup.html': POPUP_HTML,
  'popup.js': POPUP_JS,
  'popup.css': POPUP_CSS,
}

async function ensureVirtualLocationExtension(userDataPath) {
  const extensionPath = path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    'browser-extension',
  )

  await fsp.mkdir(extensionPath, { recursive: true })

  for (const [name, content] of Object.entries(EXTENSION_FILES)) {
    await fsp.writeFile(path.join(extensionPath, name), content, 'utf8')
  }

  return extensionPath
}

async function buildExtensionZip(userDataPath) {
  const extensionPath = await ensureVirtualLocationExtension(userDataPath)
  return extensionPath
}

module.exports = {
  ensureVirtualLocationExtension,
  buildExtensionZip,
}
