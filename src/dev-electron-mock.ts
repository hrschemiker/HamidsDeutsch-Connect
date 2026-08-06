type ApiValue = Record<string, unknown> | unknown[]

const noop = () => {}

const idleProcess = {
  engineType: 'sing-box',
  running: false,
  ready: false,
  systemProxyEnabled: false,
  tunEnabled: false,
  connectionMode: null,
  pid: null,
  startedAt: null,
  stoppedAt: null,
  localHost: '127.0.0.1',
  localPort: 2080,
  lastExitCode: null,
  lastSignal: null,
  lastError: null,
  logTail: '',
}

function resultFor(path: string): ApiValue {
  const exact: Record<string, ApiValue> = {
    'engine.getInfo': {
      engineType: 'sing-box',
      installed: true,
      healthy: true,
      path: 'development-preview',
      version: 'preview',
      architecture: 'x64',
      error: null,
    },
    'engine.getProcessStatus': idleProcess,
    'engine.getTraffic': { up: 0, down: 0, connections: 0 },
    'network.getCurrentIp': {
      success: true,
      checkedAt: new Date().toISOString(),
      ip: null,
      durationMs: null,
      service: null,
      error: null,
    },
    'subscriptions.list': [],
    'servers.getHiddenNodes': [],
    'free.getStatus': {
      running: false,
      testing: false,
      connected: false,
      nodeId: null,
      nodeName: null,
      error: null,
    },
    'free.getPool': {
      success: true,
      servers: [],
      meta: { total: 0, working: 0, untested: 0, lastRefreshedAt: null },
      error: null,
    },
    'killswitch.get': { enabled: false, active: false },
    'history.get': { success: true, entries: [] },
    'startup.getLoginItem': { enabled: false, error: null },
    'startup.getCloseToTray': { enabled: true, error: null },
    'doh.getSettings': {
      standaloneDoHServer: 'off',
      customDnsPrimary: '',
      customDnsSecondary: '',
      preferredDnsServer: 'cloudflare',
      preferredDnsPrimary: '',
      preferredDnsSecondary: '',
      proxyDoHEnabled: false,
      standaloneActive: false,
      activeConfig: null,
      error: null,
    },
    'system.getPrivilegeStatus': {
      isWindows: true,
      isElevated: false,
      canElevate: true,
      error: null,
    },
    'apps.list': [],
    'tools.getCfAutoScan': {
      settings: { enabled: false, intervalHours: 24 },
      cache: null,
    },
    'tools.getConverterBackends': { backends: [], targets: [] },
    'tools.getUpstreamProxy': {
      success: true,
      settings: { enabled: false, type: 'socks5', host: '127.0.0.1', port: 1080 },
    },
    'tools.getUTlsSettings': {
      success: true,
      settings: { globalFingerprint: 'auto', echEnabled: false, fragmentEnabled: false },
    },
  }
  return exact[path] ?? { success: true, error: null }
}

function apiProxy(path = ''): unknown {
  return new Proxy(noop, {
    get(_target, property) {
      if (property === 'then') return undefined
      const key = path ? `${path}.${String(property)}` : String(property)
      if (key === 'appName') return 'Manfaz VPN'
      if (key === 'platform') return 'win32'
      return apiProxy(key)
    },
    apply() {
      if (path.split('.').pop()?.startsWith('on')) return noop
      return Promise.resolve(resultFor(path))
    },
  })
}

export function installDevelopmentElectronMock() {
  if (!window.hamidsDeutsch) {
    window.hamidsDeutsch = apiProxy() as Window['hamidsDeutsch']
  }
}
