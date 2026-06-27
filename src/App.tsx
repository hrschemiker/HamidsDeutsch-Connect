import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { type Lang, LangCtx, TR, useT } from './i18n'
import { useDirectDomains } from './domain/use-direct-domains'
import { useEngineInfo } from './engine/use-engine-info'
import { useEngineProcess } from './engine/use-engine-process'
import { useSubscriptions } from './subscriptions/use-subscriptions'
import {
  useServerNodes,
  type SafeServerNode,
} from './servers/use-server-nodes'
import { useSelectedServer } from './servers/use-selected-server'
import { useServerLatency } from './servers/use-server-latency'
import { useServerConfigCheck } from './servers/use-server-config-check'
import { useIpVerification } from './network/use-ip-verification'
import { useWindowsPrivilege } from './system/use-windows-privilege'
import { useWindowsElevation } from './system/use-windows-elevation'
import { useRescueSettings } from './rescue/use-rescue-settings'
import { useConnectionSettings } from './settings/use-connection-settings'
import { useConnectionDiagnostics } from './diagnostics/use-connection-diagnostics'
import { BpbPage } from './bpb/BpbPage'
import './App.css'

// ── Free Config types ────────────────────────────────────────────────────────

type FreeConfigPhase =
  | 'idle'
  | 'fetching'
  | 'testing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

type FreePoolServer = {
  id: string
  uri: string
  name: string
  protocol: string
  host: string | null
  port: number | null
  latencyMs: number | null
  failCount: number
  lastTestedAt: string | null
  addedAt: string
}

// ── Theme ────────────────────────────────────────────────────────────────────

type Theme = 'dark' | 'light'

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: 'dark',
  setTheme: () => {},
})

// ── ConfirmDialog ─────────────────────────────────────────────────────────────

function ConfirmDialog({
  title,
  message,
  confirmLabel = 'تأیید',
  cancelLabel = 'انصراف',
  onConfirm,
  onCancel,
}: {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-title">{title}</p>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel-btn" type="button" onClick={onCancel}>{cancelLabel}</button>
          <button className="confirm-ok-btn" type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

// ── InfoButton — hides description by default, shown on click ────────────────

function InfoButton({ fa, en }: { fa: string; en: string }) {
  const { lang } = useContext(LangCtx)
  const [open, setOpen] = useState(false)
  const text = lang === 'fa' ? fa : en
  return (
    <span className="info-btn-wrap">
      <button
        className="info-btn"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={lang === 'fa' ? 'توضیحات' : 'Info'}
      >
        ?
      </button>
      {open && (
        <span className="info-panel" role="note">
          {text}
        </span>
      )}
    </span>
  )
}

// ── Page / navigation types ───────────────────────────────────────────────────

type PageId =
  | 'home'
  | 'servers'
  | 'subscriptions'
  | 'direct-sites'
  | 'bpb'
  | 'rescue'
  | 'statistics'
  | 'logs'
  | 'guide'
  | 'settings'

type NavigationItem = {
  id: PageId
  label: string
  icon: string
}

type PublicServer = {
  id: string
  nodeId: string
  subscriptionId: string
  subscriptionName: string
  name: string
  protocol: string
  host: string | null
  port: number | null
  transport: string | null
  tls: boolean
}

type LatencyItem = {
  id: string
  reachable: boolean
  latencyMs: number | null
  error: string | null
}


function App() {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem('hd-theme') as Theme) || 'dark',
  )
  const [lang, setLangState] = useState<Lang>(
    () => {
      const saved = localStorage.getItem('hd-lang') as Lang | null
      return (saved === 'fa' || saved === 'en') ? saved : 'fa'
    },
  )

  function setTheme(t: Theme) {
    setThemeState(t)
    localStorage.setItem('hd-theme', t)
  }

  function setLang(l: Lang) {
    setLangState(l)
    localStorage.setItem('hd-lang', l)
  }

  const t = (key: string, fallback?: string): string =>
    TR[lang]?.[key] ?? fallback ?? TR['fa'][key] ?? key

  const navigationItems: NavigationItem[] = [
    { id: 'home', label: t('nav.home'), icon: '⌂' },
    { id: 'servers', label: t('nav.servers'), icon: '◉' },
    { id: 'subscriptions', label: t('nav.subscriptions'), icon: '↧' },
    { id: 'bpb', label: t('nav.bpb'), icon: '◈' },
    { id: 'direct-sites', label: t('nav.directSites'), icon: '↗' },
    { id: 'rescue', label: t('nav.rescue'), icon: '✦' },
    { id: 'statistics', label: t('nav.statistics'), icon: '▥' },
    { id: 'logs', label: t('nav.logs'), icon: '≡' },
    { id: 'guide', label: t('nav.guide'), icon: '?' },
    { id: 'settings', label: t('nav.settings'), icon: '⚙' },
  ]

  const pageTitles: Record<PageId, string> = {
    home: t('page.home'),
    servers: t('page.servers'),
    subscriptions: t('page.subscriptions'),
    bpb: t('page.bpb'),
    'direct-sites': t('page.directSites'),
    rescue: t('page.rescue'),
    statistics: t('page.statistics'),
    logs: t('page.logs'),
    guide: t('page.guide'),
    settings: t('page.settings'),
  }

  const [activePage, setActivePage] = useState<PageId>('home')
  const [connectionActionError, setConnectionActionError] =
    useState<string | null>(null)

  const [automaticConnectionRunning, setAutomaticConnectionRunning] =
    useState(false)

  const [connectionWatchdogMessage, setConnectionWatchdogMessage] =
    useState<string | null>(null)

  const [tunBaselineIp, setTunBaselineIp] =
    useState<string | null>(null)

  const [tunCurrentIp, setTunCurrentIp] =
    useState<string | null>(null)

  const [tunVerified, setTunVerified] =
    useState(false)

  const connectionWatchdogBusyRef = useRef(false)
  const automaticConnectionBusyRef = useRef(false)

  const [codespaceConnecting, setCodespaceConnecting] = useState(false)
  const [codespaceConnected, setCodespaceConnected] = useState(false)
  const [codespaceProgress, setCodespaceProgress] = useState<string | null>(null)
  const [codespaceError, setCodespaceError] = useState<string | null>(null)
  const [codespaceHost, setCodespaceHost] = useState<string | null>(null)

  const [freePhase, setFreePhase] = useState<FreeConfigPhase>('idle')
  const [freeNodeName, setFreeNodeName] = useState<string | null>(null)
  const [freeLatencyMs, setFreeLatencyMs] = useState<number | null>(null)
  const [freeProgress, setFreeProgress] = useState<string | null>(null)
  const [freeError, setFreeError] = useState<string | null>(null)
  const [freePool, setFreePool] = useState<FreePoolServer[]>([])
  const [freePoolMeta, setFreePoolMeta] = useState<{ total: number; displaying: number; lastRefreshedAt: string | null; poolRefreshing: boolean } | null>(null)

  // Engine update notification
  const [engineUpdateAvailable, setEngineUpdateAvailable] = useState(false)

  // Speed test
  const [speedTestResult, setSpeedTestResult] = useState<{ mbps: number | null; running: boolean; error: string | null } | null>(null)

  // Geo-block auto-run trigger
  const [geoBlockTrigger, setGeoBlockTrigger] = useState(0)

  // Last connection for one-tap reconnect
  const [lastConnectionType, setLastConnectionType] = useState<'free' | 'subscription' | 'bpb' | 'codespace' | null>(null)
  const [showReconnectBar, setShowReconnectBar] = useState(false)

  // Ctrl+Enter keyboard shortcut toggle (UX #9)
  const [ctrlEnterEnabled, setCtrlEnterEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('hamidsdeutsch:ctrl-enter') !== 'false' } catch { return true }
  })
  const [closeToTray, setCloseToTray] = useState(true)
  useEffect(() => {
    void window.hamidsDeutsch.startup.getCloseToTray().then((r) => { setCloseToTray(r.enabled) }).catch(() => {})
  }, [])

  // For smart hero-button priority: know if BPB/codespace are configured
  const [codespaceHasToken, setCodespaceHasToken] = useState(false)
  const [bpbConfigured, setBpbConfigured] = useState(false)

  const directDomains = useDirectDomains()
  const engine = useEngineInfo()
  const engineProcess = useEngineProcess()
  const subscriptions = useSubscriptions()

  const serverNodes = useServerNodes(
    subscriptions.subscriptions.map(
      (subscription) => ({
        id: subscription.id,
        name: subscription.name,
      }),
    ),
    subscriptions.loading,
  )

  const selectedServer = useSelectedServer()
  const latency = useServerLatency(serverNodes.nodes)
  const configCheck = useServerConfigCheck()
  const ipVerification = useIpVerification()
  const windowsPrivilege = useWindowsPrivilege()
  const windowsElevation = useWindowsElevation()
  const rescueSettings = useRescueSettings()
  const connectionSettings = useConnectionSettings()
  const diagnostics = useConnectionDiagnostics()

  const connectionVerified =
    engineProcess.status.connectionMode === 'tun'
      ? tunVerified &&
        engineProcess.status.tunEnabled
      : ipVerification.connected &&
        engineProcess.status.systemProxyEnabled

  // ── Toast on disconnect ───────────────────────────────────────────────────
  const appHeroConnected = connectionVerified || codespaceConnected || freePhase === 'connected'
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevHeroConnectedRef = useRef(false)
  const hasConnectedRef = useRef(false)
  const connectionStartRef = useRef<{ at: string; mode: string; serverName: string | null; protocol: string | null; latencyMs: number | null } | null>(null)
  const intentionalDisconnectRef = useRef(false)

  useEffect(() => {
    if (appHeroConnected) {
      hasConnectedRef.current = true
      if (!prevHeroConnectedRef.current) {
        const mode = freePhase === 'connected' ? 'free' : codespaceConnected ? 'codespace' : lastConnectionType === 'bpb' ? 'bpb' : 'subscription'
        setLastConnectionType(mode)
        setShowReconnectBar(false)
        connectionStartRef.current = {
          at: new Date().toISOString(),
          mode,
          serverName: freePhase === 'connected' ? (freeNodeName ?? null) : (selectedServer.selectedServer?.name ?? null),
          protocol: freePhase === 'connected' ? null : (selectedServer.selectedServer?.protocol ?? null),
          latencyMs: null,
        }
        // Record free/codespace/bpb sessions in diagnostics (subscription sessions are recorded in prepareAndStart)
        if (mode === 'free' || mode === 'codespace' || mode === 'bpb') {
          diagnostics.beginSession({
            serverName: mode === 'free' ? (freeNodeName ?? mode) : mode === 'codespace' ? 'GitHub Codespace' : 'BPB Panel',
            subscriptionName: mode === 'free' ? 'سرور رایگان' : mode === 'codespace' ? 'GitHub Codespace' : 'BPB Panel',
            mode: 'system-proxy',
            latencyMs: mode === 'free' ? (freeLatencyMs ?? null) : null,
            exitIp: null,
          })
        }
        // Auto speed test and geo-block test: run after connect
        setSpeedTestResult({ mbps: null, running: true, error: null })
        setGeoBlockTrigger((n) => n + 1)
        setTimeout(() => {
          void window.hamidsDeutsch.speedtest.run().then((r) => {
            setSpeedTestResult({ mbps: r.mbps, running: false, error: r.error })
          }).catch(() => {
            setSpeedTestResult({ mbps: null, running: false, error: 'خطا در اجرای تست' })
          })
        }, 2000)
      }
      prevHeroConnectedRef.current = true
    } else if (prevHeroConnectedRef.current && hasConnectedRef.current) {
      prevHeroConnectedRef.current = false
      const startEntry = connectionStartRef.current
      connectionStartRef.current = null
      setSpeedTestResult(null)
      if (!intentionalDisconnectRef.current) setShowReconnectBar(true)
      intentionalDisconnectRef.current = false
      setToastMessage('اتصال قطع شد · پراکسی ویندوز بازگردانی شد')
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setToastMessage(null), 3200)
      if (startEntry) {
        const now = new Date().toISOString()
        const durationMs = Date.now() - new Date(startEntry.at).getTime()
        void window.hamidsDeutsch.history.append({
          connectedAt: startEntry.at,
          disconnectedAt: now,
          durationMs,
          mode: startEntry.mode,
          serverName: startEntry.serverName,
          protocol: startEntry.protocol,
          latencyMs: startEntry.latencyMs,
        })
        // End diagnostics session for free/codespace/bpb (subscription sessions end in stopLocalProxy)
        if (startEntry.mode === 'free' || startEntry.mode === 'codespace' || startEntry.mode === 'bpb') {
          diagnostics.endSession('manual')
        }
      }
    }
  }, [appHeroConnected]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void window.hamidsDeutsch.system.setVirtualLocationConnected(connectionVerified)
  }, [connectionVerified])

  useEffect(() => {
    void window.hamidsDeutsch.system.setDirectDomains(directDomains.domains)
  }, [directDomains.domains])

  useEffect(() => {
    return window.hamidsDeutsch.codespace.onProgress(({ message }) => {
      setCodespaceProgress(message)
    })
  }, [])

  // Check for engine update once on startup (30s delay to not block init)
  useEffect(() => {
    const timer = setTimeout(() => {
      void window.hamidsDeutsch.engine.checkForUpdate().then((r) => {
        if (r.updateAvailable) setEngineUpdateAvailable(true)
      }).catch(() => {})
    }, 30000)
    return () => clearTimeout(timer)
  }, [])

  // Load codespace token state + BPB profile state once on mount
  useEffect(() => {
    void window.hamidsDeutsch.codespace.getStatus().then((s) => {
      setCodespaceHasToken(Boolean(s?.hasToken))
    }).catch(() => {})
    void window.hamidsDeutsch.bpb.getProfile().then((r) => {
      setBpbConfigured(Boolean(r?.profile?.panelUrl?.trim()))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    void window.hamidsDeutsch.free.getPool().then((r) => {
      if (r.success) {
        setFreePool(r.servers)
        if (r.meta) setFreePoolMeta({ total: r.meta.total, displaying: r.meta.displaying, lastRefreshedAt: r.meta.lastRefreshedAt, poolRefreshing: false })
      }
    })
    const unsubProgress = window.hamidsDeutsch.free.onProgress(({ text, phase }) => {
      setFreeProgress(text)
      setFreePhase(phase)
    })
    const unsubPoolUpdated = window.hamidsDeutsch.free.onPoolUpdated((payload) => {
      void window.hamidsDeutsch.free.getPool().then((r) => {
        if (r.success) setFreePool(r.servers)
      })
      setFreePoolMeta((prev) => ({ ...prev, total: payload.count, displaying: payload.displaying, lastRefreshedAt: payload.refreshedAt, poolRefreshing: false } as typeof prev))
      setToastMessage(`${payload.count} سرور رایگان در مخزن — ${payload.displaying} در حال نمایش`)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setToastMessage(null), 3500)
    })
    const unsubPoolStatus = window.hamidsDeutsch.free.onPoolStatus((payload) => {
      setFreePoolMeta((prev) => ({
        total: payload.poolCount ?? prev?.total ?? 0,
        displaying: payload.poolDisplaying ?? prev?.displaying ?? 0,
        lastRefreshedAt: payload.poolLastRefreshedAt ?? prev?.lastRefreshedAt ?? null,
        poolRefreshing: payload.poolRefreshing ?? false,
      }))
    })
    return () => { unsubProgress(); unsubPoolUpdated(); unsubPoolStatus() }
  }, [])

  async function connectFreeConfig() {
    setFreePhase('fetching')
    setFreeProgress('در حال آماده‌سازی...')
    setFreeError(null)
    setFreeNodeName(null)
    setFreeLatencyMs(null)
    try {
      const result = await window.hamidsDeutsch.free.fetchAndConnect({
        directDomains: directDomains.domains,
      })
      if (result.success) {
        setFreeNodeName(result.nodeName)
        setFreeLatencyMs(result.latencyMs)
        setFreePhase('connected')
        setFreeError(null)
        void window.hamidsDeutsch.free.getPool().then((r) => {
          if (r.success) setFreePool(r.servers)
        })
      } else {
        setFreePhase('error')
        setFreeError(result.error ?? 'اتصال ناموفق بود.')
      }
    } catch (err) {
      setFreePhase('error')
      setFreeError(err instanceof Error ? err.message : 'خطای ناشناخته')
    } finally {
      setFreeProgress(null)
    }
  }

  async function disconnectFreeConfig() {
    intentionalDisconnectRef.current = true
    try {
      await window.hamidsDeutsch.free.disconnect()
      setFreePhase('idle')
      setFreeNodeName(null)
      setFreeLatencyMs(null)
      setFreeError(null)
    } catch {
      // ignore
    }
  }

  async function connectViaCodespace() {
    if (codespaceConnecting || engineProcess.status.running) return
    setCodespaceConnecting(true)
    setCodespaceError(null)
    setCodespaceProgress(null)

    try {
      const result = await window.hamidsDeutsch.codespace.connect(
        directDomains.domains,
      )

      if (!result.success) {
        setCodespaceError(result.error ?? 'اتصال GitHub Codespace ناموفق بود.')
        return
      }

      setCodespaceHost(result.host)
      setCodespaceConnected(true)

      // Activate system proxy for the sing-box that's now running
      await engineProcess.enableSystemProxy()
      const verification = await ipVerification.verify()
      if (!verification.success || !verification.changed) {
        setCodespaceError('پروکسی اجرا شد اما تغییر IP تأیید نشد. اتصال ممکن است فعال باشد.')
      }
    } catch (err) {
      setCodespaceError(
        err instanceof Error ? err.message : 'خطای ناشناخته در اتصال GitHub',
      )
    } finally {
      setCodespaceConnecting(false)
      setCodespaceProgress(null)
    }
  }

  async function disconnectCodespace() {
    intentionalDisconnectRef.current = true
    setCodespaceConnecting(true)
    setCodespaceError(null)
    try {
      await engineProcess.disableSystemProxy(false)
      await window.hamidsDeutsch.codespace.disconnect()
      setCodespaceConnected(false)
      setCodespaceHost(null)
      ipVerification.reset()
    } finally {
      setCodespaceConnecting(false)
    }
  }

  const automaticLatencyTestKey = useRef<string | null>(null)

  const fastestServer = useMemo(() => {
    // REALITY nodes get priority: if any REALITY node is reachable and within
    // 2× of the absolute fastest latency, prefer the fastest REALITY node.
    const reachableNodes = serverNodes.nodes
      .map((node) => ({ node, lat: latency.results[node.id] }))
      .filter((x) => x.lat?.reachable && x.lat.latencyMs != null)
    if (reachableNodes.length === 0) return null

    const absoluteFastest = reachableNodes.reduce((a, b) =>
      (a.lat.latencyMs ?? Infinity) <= (b.lat.latencyMs ?? Infinity) ? a : b,
    )
    const absoluteMs = absoluteFastest.lat.latencyMs ?? Infinity

    const REALITY_PROTOCOLS = new Set(['vless', 'vmess', 'trojan'])
    const realityNodes = reachableNodes.filter((x) => {
      const sec = (x.node.security ?? '').toLowerCase()
      return REALITY_PROTOCOLS.has(x.node.protocol) && sec === 'reality'
    })

    if (realityNodes.length > 0) {
      const fastestReality = realityNodes.reduce((a, b) =>
        (a.lat.latencyMs ?? Infinity) <= (b.lat.latencyMs ?? Infinity) ? a : b,
      )
      const realityMs = fastestReality.lat.latencyMs ?? Infinity
      if (realityMs <= absoluteMs * 2) {
        return fastestReality.node
      }
    }

    return absoluteFastest.node
  }, [latency.results, serverNodes.nodes])

  const selectedNode = useMemo(
    () =>
      selectedServer.selectedServer
        ? serverNodes.nodes.find(
            (node) =>
              node.id === selectedServer.selectedServer?.id,
          ) ?? null
        : null,
    [selectedServer.selectedServer, serverNodes.nodes],
  )

  const selectedServerLatency = selectedServer.selectedServer
    ? latency.results[selectedServer.selectedServer.id] ?? null
    : null

  useEffect(() => {
    if (
      serverNodes.loading ||
      serverNodes.nodes.length === 0 ||
      latency.testing
    ) {
      return
    }

    const testKey = [
      serverNodes.checkedAt ?? 'unknown',
      serverNodes.nodes.length,
      subscriptions.subscriptions.length,
    ].join('|')

    if (automaticLatencyTestKey.current === testKey) {
      return
    }

    automaticLatencyTestKey.current = testKey
    void latency.testAll()
  }, [
    latency,
    serverNodes.checkedAt,
    serverNodes.loading,
    serverNodes.nodes.length,
    subscriptions.subscriptions.length,
  ])

  // Auto-select fastest server after latency test completes
  const prevLatencyTesting = useRef(false)
  useEffect(() => {
    if (prevLatencyTesting.current && !latency.testing && fastestServer && !selectedServer.selectedServer) {
      selectedServer.selectServer(toPublicServer(fastestServer))
    }
    prevLatencyTesting.current = latency.testing
  }, [latency.testing, fastestServer, selectedServer])

  // Ctrl+Enter global keyboard shortcut (UX #9)
  useEffect(() => {
    if (!ctrlEnterEnabled) return
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        const tag = (e.target as HTMLElement)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        e.preventDefault()
        void smartHeroConnect()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [ctrlEnterEnabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Background latency refresh: re-test every 10 minutes when not connected
  useEffect(() => {
    const REFRESH_INTERVAL_MS = 10 * 60 * 1000
    const id = setInterval(() => {
      if (!appHeroConnected && serverNodes.nodes.length > 0 && !latency.testing) {
        void latency.testAll()
      }
    }, REFRESH_INTERVAL_MS)
    return () => clearInterval(id)
  }, [appHeroConnected, latency, serverNodes.nodes.length])

  async function attemptServerConnection(
    node: SafeServerNode,
  ) {
    if (
      !node.subscriptionId ||
      !node.nodeId
    ) {
      return {
        success: false as const,
        fatal: true as const,
        error: 'اشتراک این سرور مشخص نیست.',
      }
    }

    ipVerification.reset()
    setTunVerified(false)
    setTunBaselineIp(null)
    setTunCurrentIp(null)

    const checkResult = await configCheck.checkConfig({
      subscriptionId:
        node.subscriptionId,
      nodeId:
        node.nodeId,
      resultKey:
        node.id,
      directDomains:
        directDomains.domains,
      rescueOptions:
        rescueSettings.settings,
    })

    if (!checkResult.success) {
      return {
        success: false as const,
        fatal: false as const,
        error:
          checkResult.error ??
          'کانفیگ توسط sing-box تأیید نشد.',
      }
    }

    const startResult = await engineProcess.start()

    if (!startResult.success) {
      return {
        success: false as const,
        fatal: false as const,
        error: startResult.error,
      }
    }

    let localVerification =
      await ipVerification.verify()

    if (
      !localVerification.success ||
      !localVerification.changed ||
      !localVerification.directIp
    ) {
      // Auto DPI bypass retry: stop current proxy, rebuild config with DPI bypass, restart
      if (
        rescueSettings.settings.dpiBypassAuto &&
        node.subscriptionId
      ) {
        await engineProcess.stop()
        ipVerification.reset()

        const dpiCheckResult = await configCheck.checkConfig({
          subscriptionId: node.subscriptionId,
          nodeId: node.nodeId,
          resultKey: node.id,
          directDomains: directDomains.domains,
          rescueOptions: {
            ...rescueSettings.settings,
            enabled: true,
            recordFragment: true,
            dpiBypass: true,
          },
        })

        if (dpiCheckResult.success) {
          const dpiStartResult = await engineProcess.start()
          if (dpiStartResult.success) {
            localVerification = await ipVerification.verify()
          }
        }
      }

      if (
        !localVerification.success ||
        !localVerification.changed ||
        !localVerification.directIp
      ) {
        await engineProcess.stop()
        ipVerification.reset()

        return {
          success: false as const,
          fatal: false as const,
          error:
            localVerification.error ??
            'این سرور ترافیک واقعی عبور نداد.',
        }
      }
    }

    const baselineIp =
      localVerification.directIp

    const wantsTun =
      connectionSettings.settings.mode !==
      'system-proxy'

    const requiresTun =
      connectionSettings.settings.mode ===
      'tun'

    const canUseTun =
      windowsPrivilege.status.supported &&
      windowsPrivilege.status.isAdministrator

    if (
      requiresTun &&
      !canUseTun
    ) {
      await engineProcess.stop()
      ipVerification.reset()

      return {
        success: false as const,
        fatal: true as const,
        error:
          'حالت «فقط TUN» انتخاب شده، اما برنامه با دسترسی Administrator اجرا نشده است.',
      }
    }

    if (
      wantsTun &&
      canUseTun
    ) {
      const tunCheck =
        await window.hamidsDeutsch
          .servers
          .checkTunConfig({
            subscriptionId:
              node.subscriptionId,
            nodeId:
              node.nodeId,
            directDomains:
              directDomains.domains,
            rescueOptions:
              rescueSettings.settings,
          })

      if (tunCheck.success) {
        await engineProcess.stop()
        ipVerification.reset()

        const tunStart =
          await engineProcess.startTun()

        if (tunStart.success) {
          const currentIp =
            await window.hamidsDeutsch
              .network
              .getCurrentIp()

          if (
            currentIp.success &&
            currentIp.ip &&
            currentIp.ip !== baselineIp
          ) {
            setTunBaselineIp(
              baselineIp,
            )
            setTunCurrentIp(
              currentIp.ip,
            )
            setTunVerified(true)

            selectedServer.selectServer(
              toPublicServer(node),
            )

            return {
              success: true as const,
              fatal: false as const,
              mode: 'tun' as const,
              exitIp:
                currentIp.ip,
              error: null,
            }
          }

          await engineProcess.stop()
        }
      }

      if (
        requiresTun ||
        !connectionSettings.settings.allowFallback
      ) {
        await engineProcess.stop()
        ipVerification.reset()

        return {
          success: false as const,
          fatal: false as const,
          error:
            'راه‌اندازی یا تأیید TUN ناموفق بود و fallback غیرفعال است.',
        }
      }

      const restartLocal =
        await engineProcess.start()

      if (!restartLocal.success) {
        return {
          success: false as const,
          fatal: false as const,
          error:
            restartLocal.error ??
            'بازگشت از TUN به پروکسی محلی ناموفق بود.',
        }
      }

      const fallbackVerification =
        await ipVerification.verify()

      if (
        !fallbackVerification.success ||
        !fallbackVerification.changed
      ) {
        await engineProcess.stop()
        ipVerification.reset()

        return {
          success: false as const,
          fatal: false as const,
          error:
            fallbackVerification.error ??
            'تأیید اتصال fallback ناموفق بود.',
        }
      }
    }

    const systemProxyResult =
      await engineProcess.enableSystemProxy()

    if (!systemProxyResult.success) {
      await engineProcess.stop()
      ipVerification.reset()

      return {
        success: false as const,
        fatal: true as const,
        error:
          systemProxyResult.error ??
          'فعال‌سازی System Proxy ناموفق بود.',
      }
    }

    ipVerification.reset()

    const finalVerification =
      await ipVerification.verify()

    if (
      !finalVerification.success ||
      !finalVerification.changed
    ) {
      await engineProcess.disableSystemProxy(false)
      ipVerification.reset()

      return {
        success: false as const,
        fatal: false as const,
        error:
          finalVerification.error ??
          'System Proxy فعال شد، اما تغییر IP نهایی تأیید نشد.',
      }
    }

    selectedServer.selectServer(
      toPublicServer(node),
    )

    return {
      success: true as const,
      fatal: false as const,
      mode:
        'system-proxy' as const,
      exitIp:
        finalVerification.proxyIp ??
        null,
      error: null,
    }
  }

  function recordAttempt(
    node: SafeServerNode,
  ) {
    diagnostics.addEvent({
      level: 'info',
      type:
        'connection-attempt',
      message:
        'آزمایش اتصال واقعی به سرور آغاز شد.',
      serverName:
        node.name,
      subscriptionName:
        node.subscriptionName,
      mode: null,
      latencyMs:
        latency.results[node.id]
          ?.latencyMs ??
        null,
    })
  }

  function recordResult(
    node: SafeServerNode,
    result:
      | {
          success: true
          mode:
            | 'tun'
            | 'system-proxy'
          exitIp:
            | string
            | null
        }
      | {
          success: false
          error:
            | string
            | null
        },
  ) {
    const latencyMs =
      latency.results[node.id]
        ?.latencyMs ??
      null

    if (result.success) {
      diagnostics.beginSession({
        serverName:
          node.name,
        subscriptionName:
          node.subscriptionName,
        mode:
          result.mode,
        latencyMs,
        exitIp:
          result.exitIp,
      })

      return
    }

    diagnostics.addEvent({
      level: 'error',
      type:
        'connection-failure',
      message:
        result.error ??
        'اتصال واقعی برقرار نشد.',
      serverName:
        node.name,
      subscriptionName:
        node.subscriptionName,
      mode: null,
      latencyMs,
    })
  }

  async function prepareAndStart(
    node: SafeServerNode,
  ) {
    setConnectionActionError(null)

    if (engineProcess.status.running) {
      await engineProcess.stop()
    }

    recordAttempt(node)

    const result =
      await attemptServerConnection(node)

    recordResult(
      node,
      result,
    )

    if (!result.success) {
      setConnectionActionError(
        result.error,
      )
    }
  }

  async function connectToFirstHealthyServer(
    excludedNodeId: string | null = null,
  ) {
    if (
      automaticConnectionRunning ||
      automaticConnectionBusyRef.current
    ) {
      return
    }

    automaticConnectionBusyRef.current = true
    setAutomaticConnectionRunning(true)
    setConnectionActionError(null)
    setConnectionWatchdogMessage(null)
    ipVerification.reset()

    try {
      if (engineProcess.status.running) {
        await engineProcess.stop()
      }

      const validNodes =
        serverNodes.nodes.filter(
          (node) => node.valid,
        )

      const preferredNodes =
        validNodes.filter(
          (node) =>
            node.id !== excludedNodeId,
        )

      const previouslyFailedNode =
        excludedNodeId
          ? validNodes.find(
              (node) =>
                node.id === excludedNodeId,
            ) ?? null
          : null

      const candidates =
        [...preferredNodes].sort(
          (firstNode, secondNode) => {
            const first =
              latency.results[
                firstNode.id
              ]

            const second =
              latency.results[
                secondNode.id
              ]

            const firstRank =
              first?.reachable &&
              typeof first.latencyMs ===
                'number'
                ? first.latencyMs
                : Number.MAX_SAFE_INTEGER

            const secondRank =
              second?.reachable &&
              typeof second.latencyMs ===
                'number'
                ? second.latencyMs
                : Number.MAX_SAFE_INTEGER

            return (
              firstRank -
              secondRank
            )
          },
        )

      if (previouslyFailedNode) {
        candidates.push(
          previouslyFailedNode,
        )
      }

      if (candidates.length === 0) {
        setConnectionActionError(
          'هیچ سرور معتبری برای اتصال وجود ندارد.',
        )
        return
      }

      let lastError =
        'هیچ‌کدام از سرورها اتصال واقعی برقرار نکردند.'

      for (const node of candidates) {
        recordAttempt(node)

        const result =
          await attemptServerConnection(
            node,
          )

        recordResult(
          node,
          result,
        )

        if (result.success) {
          return
        }

        lastError =
          result.error ?? lastError

        if (result.fatal) {
          setConnectionActionError(
            lastError,
          )
          return
        }
      }

      setConnectionActionError(
        lastError,
      )
    } finally {
      automaticConnectionBusyRef.current = false
      setAutomaticConnectionRunning(
        false,
      )
    }
  }

  // Smart hero-button connect: priority order
  //   1. Subscription servers (user-configured) → fastest server
  //   2. Free configs (fetch and connect)
  //   3. BPB Panel (if panelUrl saved) → quick-connect
  //   4. GitHub Codespace (if token saved)
  async function smartHeroConnect() {
    // Priority 1: user has valid subscription servers
    if (serverNodes.nodes.some((n) => n.valid)) {
      void connectToFirstHealthyServer()
      return
    }

    // Priority 2: try free config
    try {
      const freeResult = await window.hamidsDeutsch.free.fetchAndConnect({
        directDomains: directDomains.domains,
      })
      if (freeResult.success) {
        setFreeNodeName(freeResult.nodeName)
        setFreeLatencyMs(freeResult.latencyMs)
        setFreePhase('connected')
        void window.hamidsDeutsch.free.getPool().then((r) => {
          if (r.success) setFreePool(r.servers)
        })
        return
      }
    } catch {
      // fall through
    }

    // Priority 3: BPB panel if configured
    try {
      const profileResult = await window.hamidsDeutsch.bpb.getProfile()
      const bpbPanelUrl = profileResult?.profile?.panelUrl?.trim()
      if (bpbPanelUrl) {
        const result = await window.hamidsDeutsch.bpb.quickConnect({
          panelUrl: bpbPanelUrl,
          directDomains: directDomains.domains,
        })
        if (result?.success) return
      }
    } catch {
      // fall through
    }

    // Priority 4: GitHub Codespace if token configured
    if (codespaceHasToken) {
      void connectViaCodespace()
    }
  }

  async function quickReconnect() {
    if (appHeroConnected) return
    if (lastConnectionType === 'free') {
      void connectFreeConfig()
    } else if (lastConnectionType === 'codespace') {
      void connectViaCodespace()
    } else if (lastConnectionType === 'bpb') {
      const profileResult = await window.hamidsDeutsch.bpb.getProfile().catch(() => null)
      const panelUrl = profileResult?.profile?.panelUrl?.trim()
      if (panelUrl) {
        void window.hamidsDeutsch.bpb.quickConnect({ panelUrl, directDomains: directDomains.domains })
      }
    } else if (lastConnectionType === 'subscription') {
      // Reconnect to the last used subscription server directly, falling back to fastest
      const node = selectedServer.selectedServer
        ? serverNodes.nodes.find((n) => n.id === selectedServer.selectedServer?.id) ?? fastestServer
        : fastestServer
      if (node) {
        void prepareAndStart(node)
      } else {
        void smartHeroConnect()
      }
    } else {
      void smartHeroConnect()
    }
    setShowReconnectBar(false)
  }

  async function recoverConnection(
    failedNodeId: string | null,
  ) {
    if (
      connectionWatchdogBusyRef.current ||
      automaticConnectionBusyRef.current
    ) {
      return
    }

    connectionWatchdogBusyRef.current = true
    setConnectionWatchdogMessage(
      'اتصال قطع شد؛ در حال بازیابی خودکار...',
    )

    diagnostics.endSession(
      'connection-lost',
    )

    try {
      const stopResult =
        engineProcess.status.systemProxyEnabled
          ? await engineProcess.disableSystemProxy(false)
          : await engineProcess.stop()

      ipVerification.reset()

      if (!stopResult.success) {
        setConnectionActionError(
          stopResult.error ??
          'آزادسازی Proxy ویندوز ناموفق بود.',
        )
        return
      }

      await connectToFirstHealthyServer(
        failedNodeId,
      )
    } finally {
      connectionWatchdogBusyRef.current = false
    }
  }

  async function verifyCurrentIp() {
    setConnectionActionError(null)

    const verificationResult = await ipVerification.verify()

    if (!verificationResult.success) {
      setConnectionActionError(
        verificationResult.error ?? 'بررسی تغییر IP ناموفق بود.',
      )
      return
    }

    if (!verificationResult.changed) {
      setConnectionActionError(
        'IP مستقیم و IP عبوری از پروکسی یکسان هستند.',
      )
    }
  }

  async function stopLocalProxy() {
    intentionalDisconnectRef.current = true
    setConnectionActionError(null)
    setConnectionWatchdogMessage(null)

    const result =
      engineProcess.status.systemProxyEnabled
        ? await engineProcess.disableSystemProxy(false)
        : await engineProcess.stop()

    if (!result.success) {
      setConnectionActionError(result.error)
      return
    }

    diagnostics.endSession(
      'manual',
    )

    ipVerification.reset()
    setTunVerified(false)
    setTunBaselineIp(null)
    setTunCurrentIp(null)
  }

  useEffect(() => {
    if (!connectionVerified) {
      return
    }

    let disposed = false

    async function checkHealth() {
      if (
        disposed ||
        connectionWatchdogBusyRef.current ||
        automaticConnectionBusyRef.current ||
        engineProcess.busy ||
        ipVerification.checking
      ) {
        return
      }

      connectionWatchdogBusyRef.current = true

      try {
        const currentStatus =
          await engineProcess.refreshStatus()

        if (
          !currentStatus?.running ||
          !currentStatus.ready
        ) {
          connectionWatchdogBusyRef.current = false

          await recoverConnection(
            selectedServer.selectedServer?.id ?? null,
          )

          return
        }

        if (
          currentStatus.connectionMode === 'tun'
        ) {
          const currentIp =
            await window.hamidsDeutsch
              .network
              .getCurrentIp()

          if (
            !currentIp.success ||
            !currentIp.ip ||
            !tunBaselineIp ||
            currentIp.ip === tunBaselineIp
          ) {
            connectionWatchdogBusyRef.current = false

            await recoverConnection(
              selectedServer.selectedServer?.id ?? null,
            )

            return
          }

          setTunCurrentIp(
            currentIp.ip,
          )
          setTunVerified(true)
        } else {
          if (
            !currentStatus.systemProxyEnabled
          ) {
            connectionWatchdogBusyRef.current = false

            await recoverConnection(
              selectedServer.selectedServer?.id ?? null,
            )

            return
          }

          const health =
            await ipVerification.verify()

          if (
            !health.success ||
            !health.changed
          ) {
            connectionWatchdogBusyRef.current = false

            await recoverConnection(
              selectedServer.selectedServer?.id ?? null,
            )

            return
          }
        }

        setConnectionWatchdogMessage(null)
      } finally {
        connectionWatchdogBusyRef.current = false
      }
    }

    const initialTimer =
      window.setTimeout(() => {
        void checkHealth()
      }, 15000)

    const intervalId =
      window.setInterval(() => {
        void checkHealth()
      }, 30000)

    return () => {
      disposed = true
      window.clearTimeout(initialTimer)
      window.clearInterval(intervalId)
    }
  }, [
    connectionVerified,
    engineProcess.busy,
    engineProcess.refreshStatus,
    ipVerification.checking,
    ipVerification.verify,
    selectedServer.selectedServer?.id,
    tunBaselineIp,
  ])

  return (
    <ThemeCtx.Provider value={{ theme, setTheme }}>
      <LangCtx.Provider value={{ lang, setLang }}>
    <div className="application-shell" data-theme={theme} dir={lang === 'fa' ? 'rtl' : 'ltr'}>
      <aside
        className="sidebar"
      >
        <div className="brand">
          <div className="brand-mark"><img src="logo.png" alt="HamidsDeutsch Connect" className="brand-logo-img" /></div>
          <div className="brand-text">
            <strong>HamidsDeutsch</strong>
            <span>Connect</span>
          </div>
        </div>

        <nav className="navigation" aria-label={t('nav.settings')}>
          {navigationItems.map((item) => (
            <button
              className={
                activePage === item.id
                  ? 'navigation-item navigation-item-active'
                  : 'navigation-item'
              }
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => setActivePage(item.id)}
            >
              <span className="navigation-icon">{item.icon}</span>
              <span className="navigation-label">{item.label}</span>
              {item.id === 'settings' && engineUpdateAvailable && (
                <span className="nav-update-dot" title="به‌روزرسانی موجود است" />
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="engine-status">
            <span
              className={
                connectionVerified
                  ? 'engine-status-dot engine-status-dot-ready'
                  : 'engine-status-dot'
              }
            />
            <div>
              <strong>{t('engineCore', 'هسته برنامه')}</strong>
              <span>
                {connectionVerified
                  ? `${t('status.connected')} · ${ipVerification.result.proxyIp ?? 'IP'}`
                  : engineProcess.status.ready
                    ? `Proxy ${engineProcess.status.localPort}`
                    : engine.info?.healthy
                      ? `sing-box ${engine.info.version}`
                      : t('home.core.unavailable')}
              </span>
            </div>
          </div>
          <div className="version">{t('version', 'نسخه ۰.۱.۰')}</div>
          <div className="made-by">Presented with ❤️ by Hamidreza</div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <p className="topbar-eyebrow">HamidsDeutsch Connect</p>
            <h1>{pageTitles[activePage]}</h1>
          </div>

          <div className="topbar-controls">
            {/* Day/Night slider toggle */}
            <button
              className={`theme-slider-toggle${theme === 'light' ? ' theme-slider-day' : ' theme-slider-night'}`}
              type="button"
              title={theme === 'dark' ? t('toggle.themeToLight') : t('toggle.themeToDark')}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label={theme === 'dark' ? t('toggle.themeToLight') : t('toggle.themeToDark')}
            >
              <span className="theme-slider-track">
                <span className="theme-slider-scene" />
                <span className="theme-slider-knob" />
              </span>
            </button>

            {/* Language toggle: FA ↔ EN */}
            <button
              className="lang-slider-toggle"
              type="button"
              title={t('toggle.lang')}
              onClick={() => setLang(lang === 'fa' ? 'en' : 'fa')}
              aria-label={t('toggle.lang')}
              data-lang={lang}
            >
              <span className="lang-slider-label lang-slider-label-left">
                {lang === 'fa' ? 'EN' : 'FA'}
              </span>
              <span className="lang-slider-track">
                <span className="lang-slider-flag" />
                <span className="lang-slider-knob" />
              </span>
              <span className="lang-slider-label lang-slider-label-right">
                {lang === 'fa' ? 'FA' : 'EN'}
              </span>
            </button>
          </div>

          <div
            className={
              connectionVerified
                ? 'connection-pill connection-pill-online'
                : 'connection-pill'
            }
          >
            <span className="connection-pill-dot" />
            <span>
              {connectionWatchdogMessage
                ? t('status.recovering')
                : automaticConnectionRunning
                  ? t('status.findingServer')
                  : engineProcess.starting
                  ? t('status.connecting')
                : engineProcess.stopping
                  ? t('status.stopping')
                  : ipVerification.checking
                    ? t('status.checkingIp')
                    : connectionVerified
                      ? engineProcess.status.connectionMode === 'tun'
                        ? t('status.tunConnected')
                        : t('status.connected')
                      : engineProcess.status.systemProxyEnabled
                        ? t('status.verifying')
                        : engineProcess.status.ready
                          ? t('status.proxyReady')
                        : engineProcess.status.running
                          ? t('status.running')
                          : t('status.disconnected')}
            </span>
          </div>
        </header>

        <main className="content">
          {activePage === 'home' && (
            <HomePage
              directDomains={directDomains.domains}
              engineInfo={engine.info}
              processStatus={engineProcess.status}
              tunBaselineIp={tunBaselineIp}
              tunCurrentIp={tunCurrentIp}
              administratorAvailable={
                windowsPrivilege.status.isAdministrator
              }
              elevationRequesting={
                windowsElevation.requesting
              }
              elevationError={
                windowsElevation.error
              }
              onRelaunchAsAdministrator={() => {
                void windowsElevation.relaunch()
              }}
              processBusy={
                engineProcess.busy ||
                automaticConnectionRunning
              }
              processError={
                connectionActionError ??
                connectionWatchdogMessage ??
                engineProcess.error
              }
              ipVerificationResult={ipVerification.result}
              ipVerificationChecking={ipVerification.checking}
              isConnected={connectionVerified}
              selectedServer={
                selectedNode
                  ? toPublicServer(
                      selectedNode,
                    )
                  : null
              }
              selectedServerLatency={selectedServerLatency}
              fastestServer={fastestServer}
              fastestLatencyMs={latency.fastestLatencyMs}
              latencyTesting={latency.testing}
              latencyError={latency.error}
              onMainAction={() => {
                if (codespaceConnected) {
                  void disconnectCodespace()
                } else if (freePhase === 'connected') {
                  void disconnectFreeConfig()
                } else if (engineProcess.status.running) {
                  void stopLocalProxy()
                } else {
                  void smartHeroConnect()
                }
              }}
              onStartFastest={() => {
                void connectToFirstHealthyServer()
              }}
              onStartPrevious={() => {
                if (selectedNode) {
                  void prepareAndStart(selectedNode)
                }
              }}
              onStop={() => void stopLocalProxy()}
              onVerifyIp={() => void verifyCurrentIp()}
              onRetestLatency={() => void latency.testAll()}
              onOpenServers={() => setActivePage('servers')}
              onOpenDirectSites={() => setActivePage('direct-sites')}
              onOpenRescue={() => setActivePage('rescue')}
              codespaceConnecting={codespaceConnecting}
              codespaceConnected={codespaceConnected}
              codespaceProgress={codespaceProgress}
              codespaceError={codespaceError}
              codespaceHost={codespaceHost}
              onCodespaceConnect={() => void connectViaCodespace()}
              onCodespaceDisconnect={() => void disconnectCodespace()}
              onOpenSettings={() => setActivePage('settings')}
              onOpenBpb={() => setActivePage('bpb')}
              bpbConfigured={bpbConfigured}
              onBpbQuickConnect={async () => {
                const r = await window.hamidsDeutsch.bpb.getProfile().catch(() => null)
                const panelUrl = r?.profile?.panelUrl?.trim()
                if (panelUrl) {
                  setLastConnectionType('bpb')
                  await window.hamidsDeutsch.bpb.quickConnect({ panelUrl, directDomains: directDomains.domains })
                } else {
                  setActivePage('bpb')
                }
              }}
              freePhase={freePhase}
              freeNodeName={freeNodeName}
              freeLatencyMs={freeLatencyMs}
              freeProgress={freeProgress}
              freeError={freeError}
              onFreeConnect={() => void connectFreeConfig()}
              onFreeDisconnect={() => void disconnectFreeConfig()}
              speedTest={speedTestResult}
              showReconnectBar={showReconnectBar}
              lastConnectionType={lastConnectionType}
              onQuickReconnect={() => void quickReconnect()}
              geoBlockTrigger={geoBlockTrigger}
              dataLoading={serverNodes.loading || subscriptions.loading}
              topSubServers={(() => {
                return serverNodes.nodes
                  .filter((n) => n.valid && latency.results[n.id]?.reachable)
                  .sort((a, b) => (latency.results[a.id]?.latencyMs ?? 9999) - (latency.results[b.id]?.latencyMs ?? 9999))
                  .slice(0, 5)
                  .map((n) => ({ id: n.id, name: n.name, protocol: n.protocol, latencyMs: latency.results[n.id]?.latencyMs ?? null }))
              })()}
              topFreeServers={freePool
                .filter((s) => s.latencyMs != null && s.latencyMs >= 100)
                .sort((a, b) => (a.latencyMs ?? 9999) - (b.latencyMs ?? 9999))
                .slice(0, 5)}
              onConnectSubServer={(id) => {
                const node = serverNodes.nodes.find((n) => n.id === id)
                if (node) void prepareAndStart(node)
              }}
              onConnectFreeServer={async (server) => {
                setFreePhase('connecting')
                setFreeProgress(`اتصال به ${server.name}...`)
                setFreeError(null)
                try {
                  const result = await window.hamidsDeutsch.free.connectSpecificNode({
                    nodeId: server.id,
                    nodeUri: server.uri,
                    nodeName: server.name,
                    nodeHost: server.host,
                    nodePort: server.port,
                    nodeProtocol: server.protocol,
                    directDomains: directDomains.domains,
                  })
                  if (result.success) {
                    setFreePhase('connected')
                    setFreeNodeName(result.nodeName)
                    setFreeLatencyMs(result.latencyMs)
                    setFreeError(null)
                  } else {
                    setFreePhase('error')
                    setFreeError(result.error ?? 'اتصال ناموفق بود.')
                  }
                } catch (err) {
                  setFreePhase('error')
                  setFreeError(err instanceof Error ? err.message : 'خطا')
                } finally {
                  setFreeProgress(null)
                }
              }}
            />
          )}

          {activePage === 'servers' && (
            <ServersPage
              loading={serverNodes.loading}
              nodes={serverNodes.nodes}
              error={serverNodes.error}
              selectedServerId={selectedServer.selectedServer?.id ?? null}
              latencyTesting={latency.testing}
              latencyResults={latency.results}
              latencyError={latency.error}
              fastestServerId={latency.fastestServerId}
              directDomains={directDomains.domains}
              configCheckingNodeId={configCheck.checkingNodeId}
              configCheckResults={configCheck.results}
              onCheckConfig={(node) => {
                void configCheck.checkConfig({
                  subscriptionId:
                    node.subscriptionId,
                  nodeId:
                    node.nodeId,
                  resultKey:
                    node.id,
                  directDomains:
                    directDomains.domains,
                  rescueOptions:
                    rescueSettings.settings,
                })
              }}
              processRunning={engineProcess.status.running}
              onTestLatency={() => void latency.testAll()}
              onSelectServer={selectedServer.selectServer}
              onClearSelectedServer={selectedServer.clearSelectedServer}
              onOpenSubscriptions={() => setActivePage('subscriptions')}
              freePool={freePool}
              freePoolMeta={freePoolMeta}
              freePhase={freePhase}
              onConnectFreeNode={async (server) => {
                setFreePhase('connecting')
                setFreeProgress(`اتصال به ${server.name}...`)
                setFreeError(null)
                try {
                  const result = await window.hamidsDeutsch.free.connectSpecificNode({
                    nodeId: server.id,
                    nodeUri: server.uri,
                    nodeName: server.name,
                    nodeHost: server.host,
                    nodePort: server.port,
                    nodeProtocol: server.protocol,
                    directDomains: directDomains.domains,
                  })
                  if (result.success) {
                    setFreePhase('connected')
                    setFreeNodeName(result.nodeName)
                    setFreeLatencyMs(result.latencyMs)
                    setFreeError(null)
                    setActivePage('home')
                  } else {
                    setFreePhase('error')
                    setFreeError(result.error ?? 'اتصال ناموفق بود.')
                  }
                } catch (err) {
                  setFreePhase('error')
                  setFreeError(err instanceof Error ? err.message : 'خطا')
                } finally {
                  setFreeProgress(null)
                }
              }}
              onRefreshFreePool={async () => {
                setFreePoolMeta((prev) => prev ? { ...prev, poolRefreshing: true } : prev)
                try {
                  const result = await window.hamidsDeutsch.free.refreshPool()
                  if (result.success) {
                    setFreePool(result.servers)
                    if (result.meta) setFreePoolMeta({ total: result.meta.total, displaying: result.meta.displaying, lastRefreshedAt: result.meta.lastRefreshedAt, poolRefreshing: false })
                  }
                } catch {
                  setFreePoolMeta((prev) => prev ? { ...prev, poolRefreshing: false } : prev)
                }
              }}
              onConnectSubNode={(node) => void prepareAndStart(node)}
            />
          )}

          {activePage === 'subscriptions' && (
            <SubscriptionsPage
              loading={subscriptions.loading}
              subscriptions={subscriptions.subscriptions}
              loadError={subscriptions.error}
              onAddSubscription={subscriptions.addSubscription}
              onRemoveSubscription={subscriptions.removeSubscription}
              onInspectSubscription={subscriptions.inspectSubscription}
              onLoadServers={async (subscriptionId) => {
                const result =
                  await serverNodes.loadFromSubscription(
                    subscriptionId,
                  )

                if (result.success) {
                  automaticLatencyTestKey.current = null
                  setActivePage('servers')

                  return {
                    success: true as const,
                    error: null,
                  }
                }

                return {
                  success: false as const,
                  error:
                    result.error ??
                    'دریافت سرورها ناموفق بود.',
                }
              }}
              loadingServerSubscriptionId={
                serverNodes.refreshingSubscriptionId
              }
            />
          )}

          {activePage === 'bpb' && (
            <BpbPage
              mainConnected={
                connectionVerified ||
                engineProcess.status.running
              }
              directDomains={
                directDomains.domains
              }
              rescueSettings={
                rescueSettings.settings
              }
              onBpbConnect={() => setLastConnectionType('bpb')}
              onBpbDisconnect={() => { intentionalDisconnectRef.current = true }}
            />
          )}

          {activePage === 'direct-sites' && (
            <DirectSitesPage
              domains={directDomains.domains}
              onAddDomain={directDomains.addDomain}
              onAddDomains={directDomains.addDomains}
              onRemoveDomain={directDomains.removeDomain}
              onResetDomains={directDomains.resetDomains}
            />
          )}

          {activePage === 'rescue' && (
            <RescuePage
              settings={
                rescueSettings.settings
              }
              onUpdate={
                rescueSettings.update
              }
              onReset={
                rescueSettings.reset
              }
              connected={
                connectionVerified
              }
            />
          )}
          {activePage === 'statistics' && (
            <StatisticsPage
              summary={
                diagnostics.summary
              }
              sessions={
                diagnostics.sessions
              }
            />
          )}
          {activePage === 'logs' && (
            <LogsPage
              events={
                diagnostics.events
              }
              onClear={
                diagnostics.clear
              }
              onCopyReport={async () => {
                await navigator.clipboard.writeText(
                  diagnostics.exportReport(),
                )
              }}
            />
          )}
          {activePage === 'guide' && (
            <GuidePage />
          )}
          {activePage === 'settings' && (
            <SettingsPage
              settings={
                connectionSettings.settings
              }
              onUpdate={
                connectionSettings.update
              }
              onReset={
                connectionSettings.reset
              }
              directDomainCount={
                directDomains.domains.length
              }
              administratorAvailable={
                windowsPrivilege.status.isAdministrator
              }
              connected={
                connectionVerified
              }
              onOpenDirectSites={() =>
                setActivePage(
                  'direct-sites',
                )
              }
              onOpenVirtualLocationExtension={() =>
                window.hamidsDeutsch.system.openVirtualLocationExtension()
              }
              onDownloadExtensionZip={() =>
                window.hamidsDeutsch.system.downloadExtensionZip()
              }
              currentEngineVersion={
                engine.info?.version ??
                null
              }
              onCheckEngineUpdate={() =>
                window.hamidsDeutsch
                  .engine
                  .checkForUpdate()
              }
              onInstallEngineUpdate={async () => {
                const r = await window.hamidsDeutsch.engine.updateToLatest()
                if (r.updated) setEngineUpdateAvailable(false)
                return r
              }}
              ctrlEnterEnabled={ctrlEnterEnabled}
              onCtrlEnterToggle={(v) => {
                setCtrlEnterEnabled(v)
                try { localStorage.setItem('hamidsdeutsch:ctrl-enter', v ? 'true' : 'false') } catch {}
              }}
              closeToTray={closeToTray}
              onCloseToTrayToggle={async (v) => {
                setCloseToTray(v)
                await window.hamidsDeutsch.startup.setCloseToTray(v)
              }}
            />
          )}
        </main>
      </section>
      {toastMessage && (
        <div className="toast" role="status" aria-live="polite">
          <span className="toast-icon">✓</span>
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
      </LangCtx.Provider>
    </ThemeCtx.Provider>
  )
}

function toPublicServer(
  node: SafeServerNode,
): PublicServer {
  return {
    id: node.id,
    nodeId:
      node.nodeId,
    subscriptionId:
      node.subscriptionId,
    subscriptionName:
      node.subscriptionName,
    name: node.name,
    protocol: node.protocol,
    host: node.host,
    port: node.port,
    transport: node.transport,
    tls: node.tls,
  }
}

type HomePageProps = {
  directDomains: string[]
  engineInfo: {
    installed: boolean
    healthy: boolean
    path: string
    version: string | null
    architecture: string | null
    error: string | null
  } | null
  tunBaselineIp: string | null
  tunCurrentIp: string | null
  administratorAvailable: boolean
  elevationRequesting: boolean
  elevationError: string | null
  onRelaunchAsAdministrator: () => void
  processStatus: {
    running: boolean
    ready: boolean
    systemProxyEnabled: boolean
    tunEnabled: boolean
    connectionMode:
      | 'local-proxy'
      | 'system-proxy'
      | 'tun'
      | null
    pid: number | null
    startedAt: string | null
    stoppedAt: string | null
    localHost: string
    localPort: number
    lastExitCode: number | null
    lastSignal: string | null
    lastError: string | null
    logTail: string
  }
  processBusy: boolean
  processError: string | null
  ipVerificationResult: {
    success: boolean
    checkedAt: string
    directIp: string | null
    proxyIp: string | null
    changed: boolean
    directDurationMs: number | null
    proxyDurationMs: number | null
    service: string
    error: string | null
  }
  ipVerificationChecking: boolean
  isConnected: boolean
  selectedServer: PublicServer | null
  selectedServerLatency: LatencyItem | null
  fastestServer: SafeServerNode | null
  fastestLatencyMs: number | null
  latencyTesting: boolean
  latencyError: string | null
  onMainAction: () => void
  onStartFastest: () => void
  onStartPrevious: () => void
  onStop: () => void
  onVerifyIp: () => void
  onRetestLatency: () => void
  onOpenServers: () => void
  onOpenDirectSites: () => void
  onOpenRescue: () => void
  codespaceConnecting: boolean
  codespaceConnected: boolean
  codespaceProgress: string | null
  codespaceError: string | null
  codespaceHost: string | null
  onCodespaceConnect: () => void
  onCodespaceDisconnect: () => void
  onOpenSettings: () => void
  onOpenBpb: () => void
  onBpbQuickConnect: () => Promise<void>
  bpbConfigured: boolean
  topSubServers: Array<{ id: string; name: string; protocol: string; latencyMs: number | null }>
  topFreeServers: FreePoolServer[]
  onConnectSubServer: (id: string) => void
  onConnectFreeServer: (server: FreePoolServer) => void
  freePhase: FreeConfigPhase
  freeNodeName: string | null
  freeLatencyMs: number | null
  freeProgress: string | null
  freeError: string | null
  onFreeConnect: () => void
  onFreeDisconnect: () => void
  speedTest: { mbps: number | null; running: boolean; error: string | null } | null
  showReconnectBar: boolean
  lastConnectionType: string | null
  onQuickReconnect: () => void
  geoBlockTrigger: number
  dataLoading: boolean
}

function HomePage({
  directDomains: _directDomains,
  engineInfo: _engineInfo,
  tunBaselineIp: _tunBaselineIp,
  tunCurrentIp,
  administratorAvailable,
  elevationRequesting,
  elevationError,
  onRelaunchAsAdministrator,
  processStatus,
  processBusy,
  processError,
  ipVerificationResult,
  ipVerificationChecking,
  isConnected,
  selectedServer,
  selectedServerLatency,
  fastestServer,
  fastestLatencyMs,
  latencyTesting,
  latencyError,
  onMainAction,
  onStartFastest,
  onStartPrevious,
  onStop,
  onVerifyIp: _onVerifyIp,
  onRetestLatency,
  onOpenServers,
  onOpenDirectSites: _onOpenDirectSites,
  onOpenRescue: _onOpenRescue,
  codespaceConnecting,
  codespaceConnected,
  codespaceProgress,
  codespaceError,
  codespaceHost,
  onCodespaceConnect,
  onCodespaceDisconnect,
  onOpenBpb,
  onBpbQuickConnect: _onBpbQuickConnect,
  bpbConfigured,
  freePhase,
  freeNodeName,
  freeLatencyMs,
  freeProgress: _freeProgress,
  freeError,
  onFreeConnect,
  onFreeDisconnect,
  speedTest,
  showReconnectBar,
  lastConnectionType,
  onQuickReconnect,
  geoBlockTrigger: _geoBlockTrigger,
  dataLoading,
  topSubServers,
  topFreeServers,
  onConnectSubServer,
  onConnectFreeServer,
}: HomePageProps) {
  const t = useT()

  // ── Local reconnect dismiss ───────────────────────────────────────────────
  const [reconnectDismissed, setReconnectDismissed] = useState(false)
  useEffect(() => { if (showReconnectBar) setReconnectDismissed(false) }, [showReconnectBar])
  function setShowReconnectBarLocal(v: boolean) { if (!v) setReconnectDismissed(true) }
  const showReconnect = showReconnectBar && !reconnectDismissed

  // ── Reconnect countdown (UX #10) ──────────────────────────────────────────
  const [_reconnectSecs, setReconnectSecs] = useState(1)
  useEffect(() => {
    if (freePhase !== 'reconnecting') { setReconnectSecs(1); return }
    setReconnectSecs(1)
    const id = setInterval(() => setReconnectSecs((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [freePhase])

  // ── Error banner (top of hero, auto-dismisses after 10s or on connection) ──
  const freeConnectedLocal = freePhase === 'connected'
  const heroConnectedLocal = isConnected || codespaceConnected || freeConnectedLocal
  const [errorBanner, setErrorBanner] = useState<string | null>(null)
  const errorBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dismissErrorBanner = () => {
    if (errorBannerTimerRef.current) clearTimeout(errorBannerTimerRef.current)
    setErrorBanner(null)
  }
  // Collect errors into banner
  const activeError = (freePhase === 'error' && freeError) ? freeError
    : processError ? processError
    : codespaceError ? codespaceError
    : (latencyError && !heroConnectedLocal) ? latencyError
    : null
  useEffect(() => {
    if (!activeError) return
    setErrorBanner(activeError)
    if (errorBannerTimerRef.current) clearTimeout(errorBannerTimerRef.current)
    errorBannerTimerRef.current = setTimeout(() => setErrorBanner(null), 10000)
    return () => { if (errorBannerTimerRef.current) clearTimeout(errorBannerTimerRef.current) }
  }, [activeError])
  // Dismiss on successful connection
  useEffect(() => { if (heroConnectedLocal) dismissErrorBanner() }, [heroConnectedLocal])
  const [sessionStart, setSessionStart] = useState<number | null>(null)
  const [elapsedSecs, setElapsedSecs] = useState(0)

  useEffect(() => {
    if (heroConnectedLocal) {
      setSessionStart((s) => s ?? Date.now())
    } else {
      setSessionStart(null)
      setElapsedSecs(0)
    }
  }, [heroConnectedLocal])

  useEffect(() => {
    if (sessionStart == null) return
    const id = window.setInterval(() => {
      setElapsedSecs(Math.floor((Date.now() - sessionStart) / 1000))
    }, 1000)
    return () => window.clearInterval(id)
  }, [sessionStart])

  function formatElapsed(s: number) {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    const pad = (n: number) => String(n).padStart(2, '0')
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`
  }

  const [switchConfirm, setSwitchConfirm] = useState<{
    title: string
    message: string
    onConfirm: () => void
  } | null>(null)

  function requireSwitch(title: string, message: string, onConfirm: () => void) {
    setSwitchConfirm({ title, message, onConfirm })
  }

  function handleFreeConnect() {
    if (otherMethodActive) {
      requireSwitch(
        'تغییر روش اتصال',
        'اتصال فعلی قطع می‌شود و از طریق سرور رایگان مجدداً متصل می‌شوید. ادامه می‌دهید؟',
        () => {
          setSwitchConfirm(null)
          onFreeConnect()
        },
      )
    } else {
      onFreeConnect()
    }
  }

  function handleCodespaceConnect() {
    if (processStatus.running || codespaceConnected) {
      requireSwitch(
        'تغییر روش اتصال',
        'اتصال فعلی قطع می‌شود و از طریق GitHub Codespace مجدداً متصل می‌شوید. ادامه می‌دهید؟',
        () => {
          setSwitchConfirm(null)
          onCodespaceConnect()
        },
      )
    } else {
      onCodespaceConnect()
    }
  }

  const freeConnected = freeConnectedLocal
  const otherMethodActive = processStatus.running || codespaceConnected || freeConnected
  const heroConnected = heroConnectedLocal
  const activeMethod: 'codespace' | 'free' | 'subscription' | 'bpb' | null =
    codespaceConnected ? 'codespace' : freeConnected ? 'free' : processStatus.running ? (lastConnectionType === 'bpb' ? 'bpb' : 'subscription') : null

  const isConnecting = processBusy && !heroConnected
  const isReconnecting = freePhase === 'reconnecting'
  const orbitClass = [
    'connection-orbit',
    isReconnecting ? 'connection-orbit-reconnecting' :
      heroConnected ? 'connection-orbit-online' :
      isConnecting ? 'connection-orbit-connecting' : '',
  ].filter(Boolean).join(' ')

  const [adminBannerDismissed, setAdminBannerDismissed] = useState(false)
  // bpbConnecting removed — BPB connects via BPB tab only

  const isSubConnecting = processBusy && !isConnected
  const isFreeActive = freePhase === 'fetching' || freePhase === 'testing' || freePhase === 'connecting' || freePhase === 'reconnecting' || freeConnected
  const isCodespaceActive = codespaceConnecting || codespaceConnected

  function handleSubscriptionConnect() {
    // During connecting or when connected: always stop/cancel
    if (isSubConnecting || activeMethod === 'subscription') {
      void onStop()
    } else if (activeMethod) {
      requireSwitch(
        'تغییر روش اتصال',
        'اتصال فعلی قطع می‌شود و از طریق اشتراک شخصی متصل می‌شوید. ادامه می‌دهید؟',
        () => { setSwitchConfirm(null); void onStartFastest() },
      )
    } else {
      void onStartFastest()
    }
  }

  function handleCodespaceToggle() {
    if (isCodespaceActive) {
      onCodespaceDisconnect()
    } else {
      handleCodespaceConnect()
    }
  }

  function handleFreeToggle() {
    if (isFreeActive) {
      onFreeDisconnect()
    } else {
      handleFreeConnect()
    }
  }

  // ── Connection stages ──────────────────────────────────────────────────────
  type StageStatus = 'idle' | 'active' | 'done' | 'error'
  function getSubStages(): { icon: string; label: string; status: StageStatus }[] {
    if (activeMethod === 'free' || (!activeMethod && (freePhase === 'fetching' || freePhase === 'testing' || freePhase === 'connecting' || freePhase === 'reconnecting'))) {
      const fetching = freePhase === 'fetching'
      const testing = freePhase === 'testing'
      const connecting = freePhase === 'connecting' || freePhase === 'reconnecting'
      const connected = freePhase === 'connected'
      return [
        { icon: '↓', label: 'دریافت سرورها', status: fetching ? 'active' : (testing || connecting || connected) ? 'done' : 'idle' },
        { icon: '◎', label: 'آزمون پینگ', status: testing ? 'active' : (connecting || connected) ? 'done' : 'idle' },
        { icon: '⬡', label: 'اتصال', status: connecting ? 'active' : connected ? 'done' : 'idle' },
        { icon: '✓', label: 'تأیید IP', status: connected && isConnected ? 'done' : connected ? 'active' : 'idle' },
      ]
    }
    if (activeMethod === 'codespace' || codespaceConnecting) {
      const done = codespaceConnected
      return [
        { icon: '⬡', label: 'ساخت Codespace', status: codespaceConnecting ? 'active' : done ? 'done' : 'idle' },
        { icon: '⇄', label: 'اتصال تونل', status: codespaceConnecting ? 'active' : done ? 'done' : 'idle' },
        { icon: '✓', label: 'تأیید IP', status: done && isConnected ? 'done' : done ? 'active' : 'idle' },
      ]
    }
    if (isConnecting || activeMethod === 'subscription' || activeMethod === 'bpb') {
      return [
        { icon: '◌', label: 'شروع sing-box', status: processBusy && !processStatus.ready ? 'active' : (processStatus.ready || isConnected) ? 'done' : 'idle' },
        { icon: '⇄', label: 'پراکسی محلی', status: processStatus.ready && !isConnected ? 'active' : isConnected ? 'done' : 'idle' },
        { icon: '✓', label: 'تأیید IP', status: ipVerificationChecking ? 'active' : isConnected ? 'done' : 'idle' },
      ]
    }
    return []
  }

  const subStages = getSubStages()
  const showStages = subStages.length > 0 && (isConnecting || codespaceConnecting ||
    freePhase === 'fetching' || freePhase === 'testing' || freePhase === 'connecting' || freePhase === 'reconnecting' ||
    (heroConnected && subStages.some(s => s.status !== 'idle')))

  return (
    <div className="home-layout">
      {errorBanner && (
        <div className="error-banner" role="alert">
          <span className="error-banner-text">{friendlyError(errorBanner)}</span>
          <button className="error-banner-close" type="button" onClick={dismissErrorBanner} aria-label="بستن">✕</button>
        </div>
      )}
      {!administratorAvailable && !processStatus.running && !adminBannerDismissed && (
        <div className="admin-banner">
          <div>
            <strong>{t('hero.adminRequired')}</strong>
            <span>{t('hero.adminDesc')}</span>
          </div>
          <button
            className="admin-banner-relaunch"
            type="button"
            disabled={elevationRequesting}
            onClick={onRelaunchAsAdministrator}
          >
            {elevationRequesting ? t('hero.requestingAccess') : t('hero.relaunchAdmin')}
          </button>
          <button
            className="admin-banner-close"
            type="button"
            onClick={() => setAdminBannerDismissed(true)}
            aria-label="بستن"
          >✕</button>
        </div>
      )}

      <section className="hero-card">
        <div className="hero-content">
          <div className="status-label">
            <span
              className={
                heroConnected
                  ? 'status-label-dot status-label-dot-online'
                  : 'status-label-dot'
              }
            />
            {activeMethod === 'codespace'
              ? `GitHub Codespace ${t('status.connected')}${codespaceHost ? ` · ${codespaceHost}` : ''}${isConnected ? ` · IP ${ipVerificationResult.proxyIp ?? t('stats.confirmed')}` : ''}`
              : activeMethod === 'free'
                ? `${t('home.free.title')} ${t('status.connected')}${freeNodeName ? ` · ${freeNodeName}` : ''}${freeLatencyMs ? ` · ${freeLatencyMs} ms` : ''}${isConnected ? ` · IP ${ipVerificationResult.proxyIp ?? t('stats.confirmed')}` : ''}`
                : isConnected
                  ? processStatus.connectionMode === 'tun'
                    ? `TUN · IP ${tunCurrentIp ?? t('stats.confirmed')}`
                    : `System Proxy · IP ${ipVerificationResult.proxyIp ?? t('stats.confirmed')}`
                  : ipVerificationChecking
                    ? t('status.checkingIp')
                    : processStatus.ready
                      ? t('home.proxy.title.ready')
                      : processStatus.running
                        ? t('home.proxy.title.running')
                        : t('status.disconnected')}
            {heroConnected && elapsedSecs >= 0 && (
              <span className="session-timer" dir="ltr">{formatElapsed(elapsedSecs)}</span>
            )}
          </div>

          {elevationError && (
            <div className="inline-error">
              {elevationError}
            </div>
          )}

          <div className="connect-method-buttons">
            {/* ── Personal Subscription — Black ── */}
            <button
              className={`method-btn method-btn-black${(activeMethod === 'subscription' || isSubConnecting) ? ' method-btn-active' : ''}`}
              type="button"
              onClick={handleSubscriptionConnect}
            >
              <span className="method-btn-icon">
                {isSubConnecting || (activeMethod === 'subscription' && processBusy) ? <span className="connection-stage-spinner">◌</span> : (activeMethod === 'subscription' || isSubConnecting) ? '■' : '▶'}
              </span>
              <span className="method-btn-label">
                <strong>{isSubConnecting ? '■ توقف' : activeMethod === 'subscription' ? t('btn.disconnect') : t('hero.connectFastest')}</strong>
                <small>
                  {activeMethod === 'subscription' && isConnected
                    ? (processStatus.connectionMode === 'tun' ? `TUN · ${tunCurrentIp ?? '—'}` : `IP ${ipVerificationResult.proxyIp ?? '—'}`)
                    : fastestServer ? fastestServer.name : t('home.fastest.unknown')}
                </small>
              </span>
            </button>

            {/* ── GitHub Codespace — Red ── */}
            <button
              className={`method-btn method-btn-red${activeMethod === 'codespace' || (codespaceConnecting && !codespaceConnected) ? ' method-btn-active' : ''}`}
              type="button"
              onClick={handleCodespaceToggle}
            >
              <span className="method-btn-icon">
                {codespaceConnecting && !codespaceConnected ? <span className="connection-stage-spinner">◌</span> : codespaceConnected ? '■' : '⬡'}
              </span>
              <span className="method-btn-label">
                <strong>{codespaceConnected ? t('hero.disconnectGithub') : codespaceConnecting ? '■ توقف' : t('home.codespace.connect')}</strong>
                <small>{codespaceConnected && codespaceHost ? codespaceHost : 'GitHub Codespace'}</small>
              </span>
            </button>

            {/* ── BPB Subscription — Gold ── */}
            <button
              className={`method-btn method-btn-gold${activeMethod === 'bpb' ? ' method-btn-active' : ''}`}
              type="button"
              onClick={() => onOpenBpb()}
            >
              <span className="method-btn-icon">
                {activeMethod === 'bpb' ? '■' : '◈'}
              </span>
              <span className="method-btn-label">
                <strong>{activeMethod === 'bpb' ? 'BPB متصل است' : (bpbConfigured ? t('home.bpb.connect') : t('home.bpb.setup'))}</strong>
                <small>BPB Panel</small>
              </span>
            </button>

            {/* ── Free Subscription — Teal ── */}
            <button
              className={`method-btn method-btn-teal${isFreeActive ? ' method-btn-active' : ''}`}
              type="button"
              onClick={handleFreeToggle}
            >
              <span className="method-btn-icon">
                {freePhase === 'fetching' || freePhase === 'testing' || freePhase === 'connecting' || freePhase === 'reconnecting'
                  ? <span className="connection-stage-spinner">◌</span>
                  : freeConnected ? '■' : '⬡'}
              </span>
              <span className="method-btn-label">
                <strong>
                  {freeConnected ? t('hero.disconnectFree')
                    : freePhase === 'fetching' ? '■ توقف'
                    : freePhase === 'testing' ? '■ توقف'
                    : freePhase === 'connecting' ? '■ توقف'
                    : freePhase === 'reconnecting' ? '■ توقف'
                    : 'سرور رایگان'}
                </strong>
                <small>{freeConnected && freeNodeName ? freeNodeName : 'V2ray Collector'}</small>
              </span>
            </button>
          </div>

          {showStages && (
            <div className="connection-stages">
              {subStages.map((stage, i) => (
                <div
                  key={i}
                  className={`connection-stage${
                    stage.status === 'active' ? ' connection-stage-active' :
                    stage.status === 'done' ? ' connection-stage-done' :
                    stage.status === 'error' ? ' connection-stage-error' : ''
                  }`}
                >
                  <span className="connection-stage-icon">
                    {stage.status === 'active' ? <span className="connection-stage-spinner">◌</span> : stage.icon}
                  </span>
                  <span className="connection-stage-label">{stage.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          className={`hero-visual${heroConnected ? ' hero-visual-clickable' : ''}`}
          aria-hidden={!heroConnected}
          title={heroConnected ? t('btn.disconnect') : undefined}
          onClick={heroConnected ? () => {
            if (activeMethod === 'codespace') handleCodespaceToggle()
            else if (activeMethod === 'free') handleFreeToggle()
            else if (activeMethod === 'subscription' || activeMethod === 'bpb') {
              requireSwitch(t('btn.disconnect'), 'اتصال قطع می‌شود. ادامه می‌دهید؟', () => { setSwitchConfirm(null); onMainAction() })
            }
          } : undefined}
        >
          <div className={orbitClass}>
            <div className="connection-orbit-middle">
              <div className="connection-orbit-core">
                <img
                  src="logo.png"
                  className={`orbit-logo${heroConnected ? ' orbit-logo-online' : ''}${isConnecting ? ' orbit-logo-connecting' : ''}`}
                  alt={heroConnected ? t('btn.disconnect') : ''}
                />
                {heroConnected && (
                  <div className="orbit-disconnect-hint">✕</div>
                )}
              </div>
            </div>
          </div>
          {heroConnected && (
            <div className="hero-mode-pill">
              {freePhase === 'connected'
                ? t('hero.modeFree')
                : codespaceConnected
                  ? t('hero.modeCodespace')
                  : lastConnectionType === 'bpb'
                    ? 'BPB Panel'
                    : t('hero.modeSubscription')}
            </div>
          )}
        </div>
      </section>

      {showReconnect && !heroConnected && (
        <div className="reconnect-bar">
          <span className="reconnect-bar-label">
            {t('reconnect.label')} {lastConnectionType === 'free' ? t('reconnect.free') : lastConnectionType === 'codespace' ? 'Codespace' : lastConnectionType === 'bpb' ? 'BPB' : t('reconnect.subscription')}
          </span>
          <button className="primary-button reconnect-bar-btn" type="button" onClick={onQuickReconnect}>
            {t('reconnect.button')}
          </button>
          <button className="text-button" type="button" onClick={() => setShowReconnectBarLocal(false)}>✕</button>
        </div>
      )}

      {/* ── Quick stats strip (shown only when connected) ── */}
      {heroConnected && (
      <section className="quick-statistics stats-connected">
        <article className="statistic-card" style={{ animationDelay: '0ms' }}>
          <span className="statistic-icon">◎</span>
          <div>
            <span className="statistic-label">{t('stats.outputIp')}</span>
            <div className="statistic-value-row">
              <strong dir="ltr">
                {ipVerificationResult.proxyIp
                  ? ipVerificationResult.proxyIp
                  : activeMethod === 'codespace' && codespaceHost
                    ? codespaceHost
                    : heroConnected
                      ? t('stats.confirmed')
                      : '—'}
              </strong>
              {ipVerificationResult.proxyIp && (
                <CopyButton text={ipVerificationResult.proxyIp} />
              )}
            </div>
          </div>
        </article>
        <article className="statistic-card" style={{ animationDelay: '80ms' }}>
          <span className="statistic-icon">◌</span>
          <div>
            <span className="statistic-label">{t('stats.prevServer')}</span>
            <strong>
              {activeMethod === 'codespace' && codespaceHost
                ? codespaceHost
                : activeMethod === 'free' && freeNodeName
                  ? freeNodeName
                  : activeMethod === 'bpb'
                    ? 'BPB Panel'
                    : selectedServer?.name ?? '—'}
            </strong>
          </div>
        </article>
        <article className="statistic-card" style={{ animationDelay: '160ms' }}>
          <span className="statistic-icon">⏱</span>
          <div>
            <span className="statistic-label">{t('stats.latency', 'پینگ')}</span>
            <strong dir="ltr">
              {activeMethod === 'free' && freeLatencyMs != null
                ? `${freeLatencyMs} ms`
                : activeMethod === 'subscription' && selectedServerLatency?.latencyMs != null
                  ? `${selectedServerLatency.latencyMs} ms`
                  : '—'}
            </strong>
          </div>
        </article>
        {speedTest && (
          <article className="statistic-card" style={heroConnected ? { animationDelay: '240ms' } : undefined}>
            <span className="statistic-icon">⚡</span>
            <div>
              <span className="statistic-label">{t('stats.speed')}</span>
              {speedTest.running ? (
                <span className="speed-bar-wrap"><span className="speed-bar-fill speed-bar-testing" /></span>
              ) : speedTest.mbps !== null ? (
                <div className="speed-bar-group">
                  <span className="speed-bar-wrap">
                    <span className="speed-bar-fill" style={{ width: `${Math.min(speedTest.mbps / 100 * 100, 100)}%` }} />
                  </span>
                  <strong dir="ltr">{speedTest.mbps} Mbps</strong>
                </div>
              ) : (
                <strong>{t('stats.speedError')}</strong>
              )}
            </div>
          </article>
        )}
      </section>
      )}

      {!heroConnected && !fastestServer && !selectedServer && !latencyTesting && !dataLoading && (
        <div className="home-empty-state">
          <div className="home-empty-icon">◎</div>
          <p className="home-empty-title">{t('home.empty.title')}</p>
          <ol className="home-empty-steps">
            <li>{t('home.empty.step1')}</li>
            <li>{t('home.empty.step2')}</li>
            <li>{t('home.empty.step3')}</li>
          </ol>
        </div>
      )}

      <section className="connection-choice-grid">
        <ConnectionChoiceCard
          title={t('home.fastest.title')}
          kicker={t('home.fastest.kicker')}
          serverName={
            fastestServer?.name ??
            (latencyTesting ? t('home.fastest.testing') : t('home.fastest.unknown'))
          }
          protocol={
            fastestServer
              ? formatProtocolNameForUi(fastestServer.protocol)
              : '—'
          }
          latencyMs={fastestLatencyMs}
          available={Boolean(fastestServer) && !processBusy}
          testing={latencyTesting}
          actionLabel={t('home.fastest.connect')}
          onAction={onStartFastest}
          secondaryActionLabel={t('home.fastest.viewServers')}
          onSecondaryAction={onOpenServers}
          realityBadge={(fastestServer?.security ?? '').toLowerCase() === 'reality'}
        />

        <ConnectionChoiceCard
          title={t('home.prev.title')}
          kicker={t('home.prev.kicker')}
          serverName={selectedServer?.name ?? t('home.prev.none')}
          protocol={
            selectedServer
              ? formatProtocolNameForUi(selectedServer.protocol)
              : '—'
          }
          latencyMs={selectedServerLatency?.latencyMs ?? null}
          available={Boolean(selectedServer) && !processBusy}
          testing={latencyTesting}
          actionLabel={t('home.prev.connect')}
          onAction={onStartPrevious}
          secondaryActionLabel={t('home.prev.retest')}
          onSecondaryAction={onRetestLatency}
        />
      </section>

      {/* Codespace progress shown inline when active */}
      {activeMethod === 'codespace' && codespaceProgress && (
        <div className="codespace-progress">{codespaceProgress}</div>
      )}

      {switchConfirm && (
        <ConfirmDialog
          title={switchConfirm.title}
          message={switchConfirm.message}
          confirmLabel="بله، تغییر بده"
          cancelLabel="انصراف"
          onConfirm={switchConfirm.onConfirm}
          onCancel={() => setSwitchConfirm(null)}
        />
      )}

      {/* ── Top-5 sub + free server mini-lists ── */}
      <section className="connection-choice-grid top-servers-grid">
        <article className="top-server-card">
          <div className="top-server-card-header">
            <span className="panel-kicker">{t('home.topSub.kicker', 'بهترین سرورهای اشتراک')}</span>
            <button className="text-button" type="button" onClick={onOpenServers}>{t('home.fastest.viewServers')}</button>
          </div>
          {topSubServers.length === 0 ? (
            <p className="top-server-empty">{latencyTesting ? t('home.fastest.testing') : t('home.topSub.empty', 'سرور آزمایش‌شده‌ای یافت نشد')}</p>
          ) : (
            <ul className="top-server-list">
              {topSubServers.map((s) => (
                <li key={s.id} className="top-server-row">
                  <span className="top-server-name">{s.name}</span>
                  <span className="top-server-latency" dir="ltr">{s.latencyMs != null ? `${s.latencyMs} ms` : '—'}</span>
                  <button
                    className="top-server-connect-btn"
                    type="button"
                    disabled={processBusy}
                    onClick={() => onConnectSubServer(s.id)}
                  >▶</button>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="top-server-card">
          <div className="top-server-card-header">
            <span className="panel-kicker">{t('home.topFree.kicker', 'بهترین سرورهای رایگان')}</span>
          </div>
          {topFreeServers.length === 0 ? (
            <p className="top-server-empty">{t('home.topFree.empty', 'هنوز سرور رایگانی آزمایش نشده')}</p>
          ) : (
            <ul className="top-server-list">
              {topFreeServers.map((s) => (
                <li key={s.id} className="top-server-row">
                  <span className="top-server-name">{s.name}</span>
                  <span className="top-server-latency" dir="ltr">{s.latencyMs != null ? `${s.latencyMs} ms` : '—'}</span>
                  <button
                    className="top-server-connect-btn"
                    type="button"
                    onClick={() => {
                      if (activeMethod || isFreeActive) {
                        requireSwitch('تغییر روش', 'اتصال فعلی قطع و به سرور رایگان انتخابی متصل می‌شوید.', () => {
                          setSwitchConfirm(null)
                          onConnectFreeServer(s)
                        })
                      } else {
                        onConnectFreeServer(s)
                      }
                    }}
                  >▶</button>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>
    </div>
  )
}

function ConnectionChoiceCard({
  title,
  kicker,
  serverName,
  protocol,
  latencyMs,
  available,
  testing,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  realityBadge = false,
}: {
  title: string
  kicker: string
  serverName: string
  protocol: string
  latencyMs: number | null
  available: boolean
  testing: boolean
  actionLabel: string
  onAction: () => void
  secondaryActionLabel: string
  onSecondaryAction: () => void
  realityBadge?: boolean
}) {
  return (
    <article className="connection-choice-card">
      <div className="connection-choice-heading">
        <div>
          <span className="panel-kicker">
            {kicker}
          </span>
          <h3>{title}</h3>
        </div>

        <div className="connection-choice-badges">
          {realityBadge && (
            <span className="reality-chip">🔐 REALITY</span>
          )}
          <LatencyBadge
            latencyMs={latencyMs}
            testing={testing}
          />
        </div>
      </div>

      <div className="connection-choice-server">
        <strong>{serverName}</strong>
        <span>{protocol}</span>
      </div>

      <div className="connection-choice-actions">
        <button
          className="primary-button"
          type="button"
          disabled={!available}
          onClick={onAction}
        >
          {actionLabel}
        </button>

        <button
          className="secondary-button"
          type="button"
          onClick={onSecondaryAction}
        >
          {secondaryActionLabel}
        </button>
      </div>
    </article>
  )
}

// ── ProtocolBadge ─────────────────────────────────────────────────────────────

const PROTOCOL_COLORS: Record<string, string> = {
  vmess: '#e8b84b',
  vless: '#a78bfa',
  trojan: '#f87171',
  ss: '#60a5fa',
  shadowsocks: '#60a5fa',
  hysteria: '#34d399',
  hysteria2: '#10b981',
  hy2: '#10b981',
  tuic: '#fb923c',
  wireguard: '#818cf8',
  anytls: '#f472b6',
}

function ProtocolBadge({ protocol, security }: { protocol: string; security?: string | null }) {
  const key = protocol.toLowerCase().replace('://', '')
  const color = PROTOCOL_COLORS[key] ?? '#94a3b8'
  const label = protocol.toUpperCase().replace('://', '')
  const icon = getProtocolIcon(key, security)
  return (
    <span className="protocol-badge" style={{ '--pb-color': color } as React.CSSProperties}>
      <span className="pb-icon" aria-hidden="true">{icon}</span>{label}
    </span>
  )
}

// ── Latency helpers ───────────────────────────────────────────────────────────

function getLatencyColor(ms: number | null): string {
  if (ms === null) return 'var(--text-secondary)'
  if (ms <= 100) return '#10b981'
  if (ms <= 250) return '#f59e0b'
  if (ms <= 400) return '#f97316'
  return '#ef4444'
}

function getQualityLabel(ms: number | null, t: (k: string) => string): string {
  if (ms === null) return '—'
  if (ms <= 100) return t('quality.excellent')
  if (ms <= 250) return t('quality.good')
  if (ms <= 400) return t('quality.fair')
  return t('quality.weak')
}

// ── Protocol icons ────────────────────────────────────────────────────────────

const PROTOCOL_ICONS: Record<string, string> = {
  vless: '🔒',
  vmess: '🔒',
  trojan: '🔒',
  hysteria2: '⚡',
  hy2: '⚡',
  hysteria: '⚡',
  tuic: '⚡',
  wireguard: '◆',
  anytls: '🛡',
  ss: '●',
  shadowsocks: '●',
}

function getProtocolIcon(protocol: string, security?: string | null): string {
  const key = protocol.toLowerCase().replace('://', '')
  if ((key === 'vless' || key === 'vmess' || key === 'trojan') && (security ?? '').toLowerCase() === 'reality') {
    return '🔐'
  }
  return PROTOCOL_ICONS[key] ?? '●'
}

// ── Error message mapper ───────────────────────────────────────────────────────

function friendlyError(raw: string | null | undefined): string {
  if (!raw) return 'خطای ناشناخته'
  const msg = raw.toLowerCase()
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('تایم')) return 'سرور پاسخ نداد (timeout)'
  if (msg.includes('refused') || msg.includes('econnrefused')) return 'پورت بسته است (connection refused)'
  if (msg.includes('network') || msg.includes('شبکه')) return 'خطای شبکه — اتصال اینترنت را بررسی کن'
  if (msg.includes('protocol') || msg.includes('پروتکل')) return 'پروتکل پشتیبانی نمی‌شود'
  if (msg.includes('config') || msg.includes('کانفیگ')) return 'ساختار کانفیگ نامعتبر است'
  if (msg.includes('uuid') || msg.includes('password') || msg.includes('auth')) return 'رمز یا UUID نادرست است'
  if (msg.includes('ip') || msg.includes('تغییر')) return 'IP تغییر نکرد — تانل برقرار نشد'
  if (msg.includes('sing-box') || msg.includes('engine')) return 'موتور sing-box خطا داد'
  return raw
}

// ── formatRelativeTime ─────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'همین الان'
  if (mins < 60) return `${mins} دقیقه پیش`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} ساعت پیش`
  return `${Math.floor(hrs / 24)} روز پیش`
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  return (
    <button
      className={`copy-btn${copied ? ' copy-btn-done' : ''}`}
      type="button"
      aria-label="Copy"
      onClick={() => {
        void navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      }}
    >
      {copied ? '✓' : '⎘'}
    </button>
  )
}

// ── LatencyBadge ──────────────────────────────────────────────────────────────

function LatencyBadge({
  latencyMs,
  testing = false,
}: {
  latencyMs: number | null
  testing?: boolean
}) {
  const t = useT()
  if (testing) {
    return (
      <span className="latency-badge latency-badge-testing">
        {t('servers.testing')}
      </span>
    )
  }

  if (latencyMs === null) {
    return (
      <span className="latency-badge latency-badge-unavailable">
        {t('servers.noResult')}
      </span>
    )
  }

  const color = getLatencyColor(latencyMs)
  const qualityLabel = getQualityLabel(latencyMs, t)

  return (
    <span
      className="latency-badge latency-badge-colored"
      dir="ltr"
      style={{ color, borderColor: color } as React.CSSProperties}
      title={qualityLabel}
    >
      {latencyMs} ms
    </span>
  )
}

function EmptyPage({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: string
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <section className="empty-state">
      <div className="empty-state-icon">
        {icon}
      </div>
      <h2>{title}</h2>
      <p>{description}</p>

      {actionLabel && onAction && (
        <button
          className="primary-button"
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </section>
  )
}

type SubscriptionItem = {
  id: string
  name: string
  host: string
  createdAt: string
  updatedAt: string
}

type SubscriptionInspection = {
  success: boolean
  checkedAt: string
  httpStatus: number | null
  httpStatusText: string | null
  contentType: string | null
  responseSize: number | null
  format: string
  configCount: number
  error: string | null
}

type SubscriptionsPageProps = {
  loading: boolean
  subscriptions: SubscriptionItem[]
  loadError: string | null

  onAddSubscription: (
    name: string,
    url: string,
  ) => Promise<
    | {
        success: true
        error: null
      }
    | {
        success: false
        error: string
      }
  >

  onRemoveSubscription: (
    subscriptionId: string,
  ) => Promise<
    | {
        success: true
        error: null
      }
    | {
        success: false
        error: string
      }
  >

  onInspectSubscription: (
    subscriptionId: string,
  ) => Promise<SubscriptionInspection>

  onLoadServers: (
    subscriptionId: string,
  ) => Promise<
    | {
        success: true
        error: null
      }
    | {
        success: false
        error: string
      }
  >

  loadingServerSubscriptionId:
    | string
    | null
}

function SubscriptionsPage({
  loading,
  subscriptions,
  loadError,
  onAddSubscription,
  onRemoveSubscription,
  onInspectSubscription,
  onLoadServers,
  loadingServerSubscriptionId,
}: SubscriptionsPageProps) {
  const t = useT()
  const [nameInput, setNameInput] =
    useState('')

  const [urlInput, setUrlInput] =
    useState('')

  const [submitting, setSubmitting] =
    useState(false)

  const [removingId, setRemovingId] =
    useState<string | null>(null)

  const [undoSubVisible, setUndoSubVisible] = useState(false)
  const [undoSubData, setUndoSubData] = useState<{ name: string; host: string } | null>(null)
  const undoSubTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [inspectingId, setInspectingId] =
    useState<string | null>(null)

  const [
    inspectionResults,
    setInspectionResults,
  ] = useState<
    Record<
      string,
      SubscriptionInspection
    >
  >({})

  const [message, setMessage] =
    useState<{
      type: 'success' | 'error'
      text: string
    } | null>(null)

  async function handleAddSubscription() {
    if (submitting) {
      return
    }

    setSubmitting(true)
    setMessage(null)

    const result =
      await onAddSubscription(
        nameInput,
        urlInput,
      )

    setSubmitting(false)

    if (!result.success) {
      setMessage({
        type: 'error',
        text: result.error,
      })

      return
    }

    setNameInput('')
    setUrlInput('')

    setMessage({
      type: 'success',
      text: t('sub.success.add'),
    })
  }

  async function handleRemoveSubscription(
    subscriptionId: string,
  ) {
    if (removingId) {
      return
    }

    const subToRemove = subscriptions.find((s) => s.id === subscriptionId)
    setRemovingId(subscriptionId)
    setMessage(null)

    const result =
      await onRemoveSubscription(
        subscriptionId,
      )

    setRemovingId(null)

    if (!result.success) {
      setMessage({
        type: 'error',
        text: result.error,
      })

      return
    }

    if (subToRemove) {
      setUndoSubData({ name: subToRemove.name, host: subToRemove.host })
      setUndoSubVisible(true)
      if (undoSubTimer.current) clearTimeout(undoSubTimer.current)
      undoSubTimer.current = setTimeout(() => setUndoSubVisible(false), 5000)
    } else {
      setMessage({ type: 'success', text: t('sub.success.delete') })
    }
  }

  async function handleUndoRemoveSub() {
    if (!undoSubData) return
    const snapshot = { ...undoSubData }
    if (undoSubTimer.current) clearTimeout(undoSubTimer.current)
    setUndoSubVisible(false)
    const result = await onAddSubscription(snapshot.name, snapshot.host)
    setUndoSubData(null)
    if (result.success) {
      setTimeout(() => {
        void window.hamidsDeutsch.subscriptions.list().then(async (subs) => {
          const restored = subs.find((s) => s.name === snapshot.name || s.host === snapshot.host)
          if (restored?.id) await onLoadServers(restored.id)
        }).catch(() => {})
      }, 300)
    }
  }

  async function handleInspectSubscription(
    subscriptionId: string,
  ) {
    if (inspectingId) {
      return
    }

    setInspectingId(subscriptionId)
    setMessage(null)

    const result =
      await onInspectSubscription(
        subscriptionId,
      )

    setInspectionResults(
      (currentResults) => ({
        ...currentResults,
        [subscriptionId]: result,
      }),
    )

    setInspectingId(null)

    if (!result.success) {
      setMessage({
        type: 'error',
        text:
          result.error ??
          'بررسی اشتراک ناموفق بود.',
      })

      return
    }

    setMessage({
      type: 'success',
      text: t('sub.success.inspect'),
    })
  }

  async function handleLoadServers(
    subscriptionId: string,
  ) {
    setMessage(null)

    const result =
      await onLoadServers(
        subscriptionId,
      )

    if (!result.success) {
      setMessage({
        type: 'error',
        text: result.error,
      })
    }
  }

  function handleUrlKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === 'Enter') {
      void handleAddSubscription()
    }
  }

  return (
    <div className="page-stack">
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              {t('sub.add.kicker')}
            </span>
            <h3>{t('sub.add.title')}</h3>
          </div>

          <div className="heading-end-row">
            <span className="count-badge">
              {subscriptions.length} اشتراک
            </span>
            <InfoButton
              fa="لینک اشتراک در فایل داده برنامه به‌صورت رمزگذاری‌شده ذخیره می‌شود. اصل لینک پس از ذخیره در این صفحه نمایش داده نخواهد شد."
              en="The subscription URL is stored encrypted in the app data folder. The original link will not be shown on this page after saving."
            />
          </div>
        </div>

        <label
          className="field-label"
          htmlFor="subscription-name"
        >
          {t('sub.name.label')}
        </label>

        <input
          id="subscription-name"
          className="text-input"
          placeholder={t('sub.name.placeholder')}
          type="text"
          value={nameInput}
          onChange={(event) => {
            setNameInput(
              event.target.value,
            )
            setMessage(null)
          }}
        />

        <label
          className="field-label subscription-url-label"
          htmlFor="subscription-url"
        >
          {t('sub.url.label')}
        </label>

        <div className="input-action-row">
          <input
            id="subscription-url"
            className="text-input"
            dir="ltr"
            placeholder="https://example.com/subscription"
            type="password"
            value={urlInput}
            onChange={(event) => {
              setUrlInput(
                event.target.value,
              )
              setMessage(null)
            }}
            onKeyDown={handleUrlKeyDown}
            autoComplete="off"
            spellCheck={false}
          />

          <button
            className="primary-button"
            type="button"
            disabled={submitting}
            onClick={() => {
              void handleAddSubscription()
            }}
          >
            {submitting
              ? t('sub.add.saving')
              : t('sub.add.btn')}
          </button>
        </div>

        {message && (
          <div
            className={
              message.type === 'success'
                ? 'form-message form-message-success'
                : 'form-message form-message-error'
            }
          >
            {message.text}
          </div>
        )}

        {loadError && (
          <div className="form-message form-message-error">
            {loadError}
          </div>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              {t('sub.list.kicker')}
            </span>
            <h3>{t('sub.list.title')}</h3>
          </div>
        </div>

        {loading ? (
          <div className="subscription-loading">
            {t('sub.list.loading')}
          </div>
        ) : subscriptions.length > 0 ? (
          <div className="subscription-list">
            {subscriptions.map(
              (subscription) => (
                <article
                  className="subscription-item"
                  key={subscription.id}
                >
                  <div className="subscription-icon">
                    ↧
                  </div>

                  <div className="subscription-main">
                    <strong>
                      {subscription.name}
                    </strong>

                    <span dir="ltr">
                      {subscription.host}
                    </span>

                    <small>
                      {t('sub.list.hidden')}
                    </small>
                  </div>

                  <div className="subscription-actions">
                    <span className="secure-badge">
                      {t('sub.list.secure')}
                    </span>

                    <button
                      className="load-servers-button"
                      type="button"
                      disabled={
                        loadingServerSubscriptionId ===
                        subscription.id
                      }
                      onClick={() => {
                        void handleLoadServers(
                          subscription.id,
                        )
                      }}
                    >
                      {loadingServerSubscriptionId ===
                      subscription.id
                        ? t('sub.list.loading2')
                        : t('sub.list.viewServers')}
                    </button>

                    <button
                      className="inspect-subscription-button"
                      type="button"
                      disabled={
                        inspectingId ===
                        subscription.id
                      }
                      onClick={() => {
                        void handleInspectSubscription(
                          subscription.id,
                        )
                      }}
                    >
                      {inspectingId ===
                      subscription.id
                        ? t('sub.list.inspecting')
                        : t('sub.list.inspect')}
                    </button>

                    <button
                      className="remove-domain-button"
                      type="button"
                      disabled={
                        removingId ===
                        subscription.id
                      }
                      onClick={() => {
                        void handleRemoveSubscription(
                          subscription.id,
                        )
                      }}
                    >
                      {removingId ===
                      subscription.id
                        ? t('sub.list.deleting')
                        : t('sub.list.delete')}
                    </button>
                  </div>

                  {inspectionResults[
                    subscription.id
                  ] && (
                    <SubscriptionInspectionPanel
                      inspection={
                        inspectionResults[
                          subscription.id
                        ]
                      }
                    />
                  )}
                </article>
              ),
            )}
          </div>
        ) : (
          <div className="empty-domain-list">
            <span>↧</span>
            <strong>
              {t('sub.empty.title')}
            </strong>
            <p>
              {t('sub.empty.desc')}
            </p>
          </div>
        )}
      </section>

      {undoSubVisible && (
        <div className="undo-bar">
          <span>{t('undo.removeSub')}</span>
          <button className="secondary-button undo-bar-btn" type="button" onClick={() => void handleUndoRemoveSub()}>
            {t('undo.button')}
          </button>
        </div>
      )}
    </div>
  )
}

function ServersPage({
  loading,
  nodes,
  error,
  selectedServerId,
  latencyTesting,
  latencyResults,
  latencyError,
  fastestServerId,
  directDomains,
  configCheckingNodeId,
  configCheckResults,
  processRunning,
  freePool,
  freePoolMeta,
  freePhase,
  onCheckConfig,
  onTestLatency,
  onSelectServer,
  onClearSelectedServer,
  onOpenSubscriptions,
  onConnectFreeNode,
  onRefreshFreePool,
  onConnectSubNode,
}: {
  loading: boolean
  nodes: SafeServerNode[]
  error: string | null
  selectedServerId: string | null
  latencyTesting: boolean
  latencyResults: Record<
    string,
    LatencyItem
  >
  latencyError: string | null
  fastestServerId: string | null
  directDomains: string[]
  configCheckingNodeId: string | null
  configCheckResults: Record<
    string,
    {
      success: boolean
      checkedAt: string
      nodeId: string | null
      protocol: string | null
      server: string | null
      serverPort: number | null
      configPath: string | null
      directDomainCount: number
      stdout: string
      error: string | null
    }
  >
  processRunning: boolean
  freePool: FreePoolServer[]
  freePoolMeta: { total: number; displaying: number; lastRefreshedAt: string | null; poolRefreshing: boolean } | null
  freePhase: FreeConfigPhase
  onCheckConfig: (
    node: SafeServerNode,
  ) => void
  onTestLatency: () => void
  onSelectServer: (
    server: PublicServer,
  ) => void
  onClearSelectedServer: () => void
  onOpenSubscriptions: () => void
  onConnectFreeNode: (server: FreePoolServer) => void
  onRefreshFreePool: () => void
  onConnectSubNode: (node: SafeServerNode) => void
}) {
  const t = useT()
  const [expandedServerId, setExpandedServerId] =
    useState<string | null>(null)

  const [switchConfirm, setSwitchConfirm] =
    useState<{ server: PublicServer } | null>(null)

  type SortMode = 'ping' | 'name' | 'protocol' | 'reality'
  const [sortMode, setSortMode] = useState<SortMode>(() => {
    const saved = localStorage.getItem('hamidsdeutsch:server-sort')
    return (saved === 'ping' || saved === 'name' || saved === 'protocol' || saved === 'reality') ? saved : 'ping'
  })

  if (loading) {
    return (
      <section className="empty-state">
        <div className="empty-state-icon">◌</div>
        <h2>{t('servers.loading')}</h2>
        <p>{t('servers.loadingDesc')}</p>
      </section>
    )
  }

  if (error) {
    return (
      <section className="empty-state">
        <div className="empty-state-icon">!</div>
        <h2>{t('servers.error.title')}</h2>
        <p>{error}</p>
        <button
          className="primary-button"
          type="button"
          onClick={onOpenSubscriptions}
        >
          {t('servers.back')}
        </button>
      </section>
    )
  }

  if (nodes.length === 0) {
    return (
      <section className="empty-state">
        <div className="empty-state-icon empty-state-icon-servers">◉</div>
        <h2>{t('servers.empty.title')}</h2>
        <p>{t('servers.empty.desc')}</p>
        <ol className="empty-state-steps">
          <li>{t('servers.empty.step1', 'به تب «اشتراک‌ها» بروید')}</li>
          <li>{t('servers.empty.step2', 'لینک اشتراک V2Ray را وارد کنید')}</li>
          <li>{t('servers.empty.step3', 'سرورها به‌طور خودکار بارگذاری می‌شوند')}</li>
        </ol>
        <button
          className="primary-button"
          type="button"
          onClick={onOpenSubscriptions}
        >
          {t('servers.goSubs')}
        </button>
      </section>
    )
  }

  const validNodes = nodes.filter(
    (node) => node.valid,
  )

  const sortedNodes = [...nodes].sort((a, b) => {
    if (sortMode === 'name') return a.name.localeCompare(b.name)
    if (sortMode === 'protocol') return a.protocol.localeCompare(b.protocol)
    if (sortMode === 'reality') {
      const aR = (a.security ?? '').toLowerCase() === 'reality' ? 0 : 1
      const bR = (b.security ?? '').toLowerCase() === 'reality' ? 0 : 1
      if (aR !== bR) return aR - bR
    }
    // default ping sort (also used as tiebreaker for reality)
    const aRes = latencyResults[a.id]
    const bRes = latencyResults[b.id]
    const aRank = aRes?.reachable && typeof aRes.latencyMs === 'number' ? aRes.latencyMs : aRes ? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER - 2
    const bRank = bRes?.reachable && typeof bRes.latencyMs === 'number' ? bRes.latencyMs : bRes ? Number.MAX_SAFE_INTEGER - 1 : Number.MAX_SAFE_INTEGER - 2
    return aRank - bRank
  })

  function getServerStatus(
    node: SafeServerNode,
  ) {
    const configResult =
      configCheckResults[node.id]
    const latencyResult =
      latencyResults[node.id]

    if (configCheckingNodeId === node.id) {
      return {
        label: t('servers.status.checking'),
        className: 'server-status-checking',
      }
    }

    if (configResult?.success) {
      return {
        label: t('servers.status.ok'),
        className: 'server-status-ready',
      }
    }

    if (configResult && !configResult.success) {
      return {
        label: t('servers.status.bad'),
        className: 'server-status-error',
      }
    }

    if (latencyResult?.reachable) {
      return {
        label: t('servers.status.reachable'),
        className: 'server-status-online',
      }
    }

    if (latencyResult && !latencyResult.reachable) {
      return {
        label: t('servers.status.offline'),
        className: 'server-status-offline',
      }
    }

    return {
      label: node.valid
        ? t('servers.status.ready')
        : t('servers.status.incomplete'),
      className: node.valid
        ? 'server-status-pending'
        : 'server-status-error',
    }
  }

  return (
    <div className="page-stack">
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              All Subscription Nodes
            </span>
            <h3>{t('servers.title')}</h3>
          </div>

          <div className="servers-heading-actions">
            <span className="count-badge">
              {validNodes.length} سرور معتبر از {
                new Set(
                  nodes.map(
                    (node) =>
                      node.subscriptionId,
                  ),
                ).size
              } اشتراک
            </span>

            <button
              className="inspect-subscription-button"
              type="button"
              disabled={latencyTesting}
              onClick={onTestLatency}
            >
              {latencyTesting
                ? t('servers.retesting')
                : t('servers.retestPing')}
            </button>

            {selectedServerId && (
              <button
                className="text-button"
                type="button"
                onClick={onClearSelectedServer}
              >
                {t('servers.deselect')}
              </button>
            )}

            <InfoButton
              fa="سرورهای همه اشتراک‌ها باهم بررسی و از سریع‌ترین به کندترین مرتب می‌شوند. برای دیدن اشتراک، آدرس، پورت و سایر جزئیات روی هر ردیف بزن."
              en="All subscription servers are tested together and sorted fastest to slowest. Tap a row to see subscription, address, port, and other details."
            />
          </div>
        </div>

        {latencyError && (
          <div className="form-message form-message-error">
            {latencyError}
          </div>
        )}
      </section>

      <div className="server-sort-bar">
        {(['ping', 'name', 'protocol', 'reality'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            className={`sort-chip${sortMode === mode ? ' sort-chip-active' : ''}`}
            onClick={() => { setSortMode(mode); localStorage.setItem('hamidsdeutsch:server-sort', mode) }}
          >
            {mode === 'ping' ? t('servers.sort.ping') : mode === 'name' ? t('servers.sort.name') : mode === 'protocol' ? t('servers.sort.protocol') : t('servers.sort.reality')}
          </button>
        ))}
      </div>

      <section className="server-list">
        {sortedNodes.map((node) => {
          const latencyResult =
            latencyResults[node.id] ?? null
          const configResult =
            configCheckResults[node.id] ?? null
          const isFastest =
            fastestServerId === node.id
          const isSelected =
            selectedServerId === node.id
          const isExpanded =
            expandedServerId === node.id
          const status =
            getServerStatus(node)
          const latencyBarPct = latencyResult?.reachable && latencyResult.latencyMs != null
            ? Math.min(latencyResult.latencyMs / 400 * 100, 100)
            : 0

          return (
            <article
              className={[
                'server-list-item',
                isFastest
                  ? 'server-list-item-fastest'
                  : '',
                isSelected
                  ? 'server-list-item-selected'
                  : '',
                !node.valid
                  ? 'server-list-item-invalid'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              key={node.id}
              style={latencyBarPct > 0 ? { '--lat-pct': `${latencyBarPct}%`, '--lat-color': getLatencyColor(latencyResult?.latencyMs ?? null) } as React.CSSProperties : undefined}
            >
              <div className="server-list-row">
                <button
                  className="server-list-summary"
                  type="button"
                  aria-expanded={isExpanded}
                  onClick={() => {
                    setExpandedServerId(
                      isExpanded ? null : node.id,
                    )
                  }}
                >
                  <span className="server-list-rank">
                    {isFastest ? '★' : '◉'}
                  </span>

                  <span className="server-list-name">
                    <strong>{node.name}</strong>
                    <small>
                      {node.subscriptionName}
                      {node.protocol && <ProtocolBadge protocol={node.protocol} />}
                    </small>
                  </span>

                  <LatencyBadge
                    latencyMs={
                      latencyResult?.latencyMs ?? null
                    }
                    testing={
                      latencyTesting &&
                      !latencyResult
                    }
                  />

                  <span
                    className={`server-list-status ${status.className}`}
                  >
                    {status.label}
                  </span>

                  {isSelected && (
                    <span className="server-selected-label">
                      {t('servers.selected')}
                    </span>
                  )}

                  <span className="server-expand-icon">
                    {isExpanded ? '⌃' : '⌄'}
                  </span>
                </button>
                <button
                  className={`server-list-connect-btn${isSelected && processRunning ? ' server-list-connect-btn-active' : ''}`}
                  type="button"
                  disabled={!node.valid}
                  title={t('servers.selectThis')}
                  onClick={() => {
                    if (processRunning && !isSelected) {
                      setSwitchConfirm({ server: toPublicServer(node) })
                    } else {
                      onConnectSubNode(node)
                    }
                  }}
                >
                  {isSelected && processRunning ? '■' : '▶'}
                </button>
              </div>

              {isExpanded && (
                <div className="server-list-details">
                  <div className="server-detail-grid">
                    <ServerInformationRow
                      label={t('servers.address')}
                      value={node.host ?? t('servers.unknown')}
                      leftToRight
                    />
                    <ServerInformationRow
                      label={t('servers.port')}
                      value={
                        node.port
                          ? String(node.port)
                          : t('servers.unknown')
                      }
                    />
                    <ServerInformationRow
                      label="Protocol"
                      value={
                        formatProtocolNameForUi(
                          node.protocol,
                        )
                      }
                    />
                    <ServerInformationRow
                      label={t('servers.subscription')}
                      value={
                        node.subscriptionName
                      }
                    />
                    <ServerInformationRow
                      label={t('servers.transport')}
                      value={
                        node.transport ?? t('servers.unknown')
                      }
                    />
                    <ServerInformationRow
                      label={t('servers.security')}
                      value={
                        node.tls
                          ? node.security ?? 'TLS'
                          : t('servers.noTls')
                      }
                    />
                    <ServerInformationRow
                      label={t('servers.directDomains')}
                      value={`${directDomains.length} ${t('stats.domainCount')}`}
                    />
                  </div>

                  {configResult && (
                    <div
                      className={
                        configResult.success
                          ? 'config-check-result config-check-result-success'
                          : 'config-check-result config-check-result-error'
                      }
                    >
                      <strong>
                        {configResult.success
                          ? t('servers.configOk')
                          : t('servers.configFail')}
                      </strong>
                      <p>
                        {configResult.success
                          ? `${configResult.protocol ?? node.protocol} • ${configResult.directDomainCount} دامنه مستقیم`
                          : configResult.error ?? 'خطای نامشخص'}
                      </p>
                    </div>
                  )}

                  <div className="server-list-actions">
                    <button
                      className={
                        isSelected
                          ? 'select-server-button select-server-button-selected'
                          : 'select-server-button'
                      }
                      type="button"
                      disabled={!node.valid}
                      onClick={() => {
                        const pub = toPublicServer(node)
                        if (processRunning && !isSelected) {
                          setSwitchConfirm({ server: pub })
                        } else {
                          onSelectServer(pub)
                        }
                      }}
                    >
                      {isSelected
                        ? t('servers.selectedBtn')
                        : t('servers.selectThis')}
                    </button>

                    {node.subscriptionId && (
                      <button
                        className="inspect-subscription-button"
                        type="button"
                        disabled={
                          !node.valid ||
                          configCheckingNodeId ===
                            node.id
                        }
                        onClick={() => {
                          onCheckConfig(node)
                        }}
                      >
                        {configCheckingNodeId === node.id
                          ? t('servers.checking')
                          : t('servers.checkBtn')}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          )
        })}
      </section>

      {switchConfirm && (
        <ConfirmDialog
          title="تغییر سرور"
          message={`اتصال فعلی قطع می‌شود و سرور «${switchConfirm.server.name}» انتخاب می‌شود. ادامه می‌دهید؟`}
          confirmLabel="بله، تغییر بده"
          cancelLabel="انصراف"
          onConfirm={() => {
            onSelectServer(switchConfirm.server)
            setSwitchConfirm(null)
          }}
          onCancel={() => setSwitchConfirm(null)}
        />
      )}

      {(true) && (
        <section className="free-pool-section">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker free-pool-kicker">مخزن رایگان</span>
              <h3>سرورهای رایگان ذخیره‌شده</h3>
            </div>
            <div className="free-pool-meta">
              {freePoolMeta?.poolRefreshing && <span className="free-pool-refreshing-dot" title="در حال بروزرسانی..." />}
              <span className="status-pill">
                {freePoolMeta ? `${freePoolMeta.total} سرور ذخیره · نمایش ${freePoolMeta.displaying}` : `${freePool.length} سرور`}
                {freePoolMeta?.lastRefreshedAt && ` · ${formatRelativeTime(freePoolMeta.lastRefreshedAt)}`}
              </span>
              <button
                className="free-pool-refresh-btn"
                type="button"
                disabled={freePoolMeta?.poolRefreshing || freePhase === 'fetching' || freePhase === 'testing' || freePhase === 'connecting'}
                onClick={() => void onRefreshFreePool()}
                title="دریافت مجدد سرورها از منابع"
              >↻ دریافت مجدد</button>
            </div>
          </div>
          <div className="free-pool-list">
            {freePool.filter((s) => s.latencyMs == null || s.latencyMs >= 100).map((server, index) => (
              <div
                key={server.id}
                className="free-pool-row"
              >
                <span className="free-pool-rank">{index + 1}</span>
                <div className="free-pool-main">
                  <strong>{server.name}</strong>
                  <small dir="ltr"><ProtocolBadge protocol={server.protocol} /> {server.host ?? '—'}{server.port ? `:${server.port}` : ''}</small>
                </div>
                <span className={server.latencyMs != null ? 'bpb-ping is-online' : 'bpb-ping'} dir="ltr">
                  {server.latencyMs != null ? `${server.latencyMs} ms` : '—'}
                </span>
                <button
                  className="free-pool-connect-btn"
                  type="button"
                  disabled={freePhase === 'fetching' || freePhase === 'testing' || freePhase === 'connecting'}
                  onClick={() => onConnectFreeNode(server)}
                >
                  اتصال
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ServerInformationRow({
  label,
  value,
  leftToRight = false,
}: {
  label: string
  value: string
  leftToRight?: boolean
}) {
  return (
    <div className="server-information-row">
      <span>{label}</span>
      <strong
        dir={
          leftToRight
            ? 'ltr'
            : undefined
        }
      >
        {value}
      </strong>
    </div>
  )
}

function formatProtocolNameForUi(
  protocol: string,
) {
  const names: Record<string, string> = {
    vmess: 'VMess',
    vless: 'VLESS',
    trojan: 'Trojan',
    ss: 'Shadowsocks',
    hysteria: 'Hysteria',
    hysteria2: 'Hysteria 2',
    hy2: 'Hysteria 2',
    tuic: 'TUIC',
  }

  return names[protocol] ?? protocol
}

type DirectSitesPageProps = {
  domains: string[]
  onAddDomain: (
    rawInput: string,
  ) =>
    | {
        success: true
        domain: string
      }
    | {
        success: false
        error: string
      }
  onAddDomains: (
    rawInput: string,
  ) => {
    success: boolean
    added: string[]
    duplicates: string[]
    invalid: string[]
    total: number
    error: string | null
  }
  onRemoveDomain: (
    domain: string,
  ) => void
  onResetDomains: () => void
}

function SubscriptionInspectionPanel({
  inspection,
}: {
  inspection: SubscriptionInspection
}) {
  return (
    <div
      className={
        inspection.success
          ? 'subscription-inspection subscription-inspection-success'
          : 'subscription-inspection subscription-inspection-error'
      }
    >
      <div className="inspection-heading">
        <strong>
          {inspection.success
            ? 'نتیجه بررسی موفق'
            : 'بررسی ناموفق'}
        </strong>

        <span>
          {formatInspectionDate(
            inspection.checkedAt,
          )}
        </span>
      </div>

      <div className="inspection-grid">
        <InspectionValue
          label="وضعیت HTTP"
          value={
            inspection.httpStatus
              ? String(
                  inspection.httpStatus,
                )
              : '—'
          }
        />

        <InspectionValue
          label="نوع محتوا"
          value={formatSubscriptionFormat(
            inspection.format,
          )}
        />

        <InspectionValue
          label="تعداد کانفیگ"
          value={String(
            inspection.configCount,
          )}
        />

        <InspectionValue
          label="حجم پاسخ"
          value={formatByteSize(
            inspection.responseSize,
          )}
        />
      </div>

      {inspection.contentType && (
        <p
          className="inspection-content-type"
          dir="ltr"
        >
          {inspection.contentType}
        </p>
      )}

      {inspection.error && (
        <p className="inspection-error-message">
          {inspection.error}
        </p>
      )}
    </div>
  )
}

function InspectionValue({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="inspection-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatByteSize(
  bytes: number | null,
) {
  if (bytes === null) {
    return '—'
  }

  if (bytes < 1024) {
    return `${bytes} بایت`
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} کیلوبایت`
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(2)} مگابایت`
}

function formatSubscriptionFormat(
  format: string,
) {
  const labels: Record<string, string> = {
    'uri-list': 'فهرست لینک‌ها',
    'base64-uri-list':
      'فهرست Base64',
    json: 'JSON',
    'base64-json':
      'JSON رمزگذاری‌شده',
    'base64-unknown':
      'Base64 ناشناخته',
    unknown: 'ناشناخته',
    empty: 'خالی',
    timeout: 'پایان زمان',
    'http-error': 'خطای HTTP',
    'network-error': 'خطای شبکه',
    'internal-error': 'خطای داخلی',
    'renderer-error': 'خطای رابط',
  }

  return labels[format] ?? format
}

function formatInspectionDate(
  isoDate: string,
) {
  try {
    return new Intl.DateTimeFormat(
      'fa-IR',
      {
        hour: '2-digit',
        minute: '2-digit',
      },
    ).format(new Date(isoDate))
  } catch {
    return 'همین حالا'
  }
}

function DirectSitesPage({
  domains,
  onAddDomain,
  onAddDomains,
  onRemoveDomain,
  onResetDomains,
}: DirectSitesPageProps) {
  const t = useT()
  const [domainInput, setDomainInput] =
    useState('')

  const [bulkDomainInput, setBulkDomainInput] =
    useState('')

  const [message, setMessage] =
    useState<{
      type: 'success' | 'error'
      text: string
    } | null>(null)

  function handleAddDomain() {
    const result =
      onAddDomain(domainInput)

    if (!result.success) {
      setMessage({
        type: 'error',
        text: result.error,
      })
      return
    }

    setDomainInput('')
    setMessage({
      type: 'success',
      text: `${result.domain} به فهرست سایت‌های مستقیم اضافه شد.`,
    })
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === 'Enter') {
      handleAddDomain()
    }
  }

  function handleAddDomains() {
    const result =
      onAddDomains(
        bulkDomainInput,
      )

    if (
      result.added.length === 0
    ) {
      setMessage({
        type: 'error',
        text:
          result.error ??
          'هیچ دامنه جدیدی اضافه نشد.',
      })
      return
    }

    setBulkDomainInput('')

    const details = [
      `${result.added.length.toLocaleString(
        'fa-IR',
      )} دامنه اضافه شد.`,
    ]

    if (
      result.duplicates.length > 0
    ) {
      details.push(
        `${result.duplicates.length.toLocaleString(
          'fa-IR',
        )} مورد تکراری نادیده گرفته شد.`,
      )
    }

    if (
      result.invalid.length > 0
    ) {
      details.push(
        `${result.invalid.length.toLocaleString(
          'fa-IR',
        )} مورد نامعتبر بود.`,
      )
    }

    setMessage({
      type: 'success',
      text:
        details.join(' '),
    })
  }

  function handleRemoveDomain(
    domain: string,
  ) {
    onRemoveDomain(domain)

    setMessage({
      type: 'success',
      text: `${domain} از فهرست حذف شد.`,
    })
  }

  function handleResetDomains() {
    onResetDomains()

    setMessage({
      type: 'success',
      text: 'فهرست اولیه سایت‌های مستقیم بازیابی شد.',
    })
  }

  return (
    <div className="page-stack">
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              Split Tunnel
            </span>
            <h3>
              {t('direct.add.title')}
            </h3>
          </div>

          <span className="count-badge">
            {domains.length} دامنه
          </span>
        </div>

        <div className="input-action-row">
          <input
            className="text-input"
            dir="ltr"
            placeholder="https://example.ir یا example.ir"
            type="text"
            value={domainInput}
            onChange={(event) => {
              setDomainInput(
                event.target.value,
              )
              setMessage(null)
            }}
            onKeyDown={handleKeyDown}
          />

          <button
            className="primary-button"
            type="button"
            onClick={handleAddDomain}
          >
            {t('direct.add.btn')}
          </button>

          <InfoButton
            fa="می‌توانی آدرس را با https، بدون https، همراه مسیر کامل یا با پیشوند domain وارد کنی. برنامه نام دامنه را خودکار استخراج می‌کند."
            en="You can enter the address with or without https, as a full URL, or with a domain: prefix. The app automatically extracts the domain name."
          />
        </div>

        <div className="bulk-domain-import">
          <div className="bulk-domain-heading">
            <div>
              <strong>
                {t('direct.bulk.title')}
              </strong>
              <span>
                {t('direct.bulk.desc')}
              </span>
            </div>
          </div>

          <textarea
            className="bulk-domain-textarea"
            dir="ltr"
            rows={9}
            spellCheck={false}
            value={
              bulkDomainInput
            }
            placeholder={`domain:intrack.ir,
domain:eghamat24.com,
domain:aparatsport.ir,
domain:hamidrezasaadati.com`}
            onChange={(event) => {
              setBulkDomainInput(
                event.target.value,
              )
              setMessage(null)
            }}
          />

          <div className="bulk-footer-row">
            <button
              className="secondary-button bulk-domain-button"
              type="button"
              disabled={
                !bulkDomainInput.trim()
              }
              onClick={
                handleAddDomains
              }
            >
              {t('direct.bulk.btn')}
            </button>
            <InfoButton
              fa="پیشوندهای domain:، آدرس کامل با https، ویرگول انتهای خط و خطوط خالی خودکار پاک می‌شوند. موارد تکراری دوباره ثبت نخواهند شد."
              en="domain: prefixes, full https URLs, trailing commas, and blank lines are stripped automatically. Duplicates are ignored."
            />
          </div>
        </div>

        {message && (
          <div
            className={
              message.type === 'success'
                ? 'form-message form-message-success'
                : 'form-message form-message-error'
            }
          >
            {message.text}
          </div>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              مسیر مستقیم
            </span>
            <h3>{t('direct.list.title')}</h3>
          </div>

          <button
            className="text-button"
            type="button"
            onClick={handleResetDomains}
          >
            {t('direct.list.reset')}
          </button>
        </div>

        {domains.length > 0 ? (
          <div className="domain-management-list">
            {domains.map((domain) => (
              <div
                className="domain-management-item"
                key={domain}
              >
                <div className="domain-management-main">
                  <span className="domain-preview-check">
                    ✓
                  </span>

                  <div>
                    <strong dir="ltr">
                      {domain}
                    </strong>
                    <span>
                      {t('direct.list.scope')}
                    </span>
                  </div>
                </div>

                <div className="domain-management-actions">
                  <span className="direct-badge">
                    {t('direct.list.direct')}
                  </span>

                  <button
                    className="remove-domain-button"
                    type="button"
                    onClick={() =>
                      handleRemoveDomain(
                        domain,
                      )
                    }
                  >
                    {t('direct.list.delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-domain-list">
            <span>↗</span>
            <strong>
              {t('direct.empty.title')}
            </strong>
            <p>
              {t('direct.empty.desc')}
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function RescuePage({
  settings,
  onUpdate,
  onReset,
  connected,
}: {
  settings: {
    enabled: boolean
    recordFragment: boolean
    handshakeFragment: boolean
    fragmentFallbackDelay: string
    customSni: string
    dpiBypassAuto: boolean
  }
  onUpdate: (
    patch: Partial<{
      enabled: boolean
      recordFragment: boolean
      handshakeFragment: boolean
      fragmentFallbackDelay: string
      customSni: string
      dpiBypassAuto: boolean
    }>,
  ) => void
  onReset: () => void
  connected: boolean
}) {
  const t = useT()
  return (
    <div className="page-stack">
      <section className="rescue-header-card active-rescue-header">
        <span className="rescue-header-icon">
          ✦
        </span>

        <div>
          <span className="panel-kicker">
            Emergency Connection
          </span>
          <h2>
            {t('rescue.title')}
          </h2>
          <p>
            این گزینه‌ها فقط هنگام ساخت اتصال جدید
            اعمال می‌شوند. برای تغییر حالت، ابتدا
            اتصال فعلی را قطع و دوباره وصل کن.
          </p>
        </div>

        <label className="rescue-master-switch">
          <input
            type="checkbox"
            checked={
              settings.enabled
            }
            onChange={(event) =>
              onUpdate({
                enabled:
                  event.target
                    .checked,
              })
            }
          />
          <span>
            {settings.enabled
              ? t('rescue.enabled')
              : t('rescue.disabled')}
          </span>
        </label>
      </section>

      {connected && (
        <div className="inline-notice">
          اتصال فعلی با تنظیمات قبلی اجرا شده است؛
          برای اعمال تغییرات یک‌بار قطع و وصل کن.
        </div>
      )}

      <section className="rescue-settings-grid">
        <article className="rescue-setting-card">
          <div className="rescue-setting-heading">
            <div>
              <span className="rescue-setting-badge">
                {t('rescue.suggested')}
              </span>
              <h3>
                TLS Record Fragment
              </h3>
            </div>

            <label className="compact-switch">
              <input
                type="checkbox"
                disabled={
                  !settings.enabled
                }
                checked={
                  settings.recordFragment
                }
                onChange={(event) =>
                  onUpdate({
                    recordFragment:
                      event.target
                        .checked,
                  })
                }
              />
              <span />
            </label>
          </div>

          <p>
            ClientHello را در چند TLS Record تقسیم
            می‌کند. این روش سبک‌تر است و قبل از
            Fragment کامل پیشنهاد می‌شود.
          </p>
        </article>

        <article className="rescue-setting-card">
          <div className="rescue-setting-heading">
            <div>
              <span className="rescue-setting-badge secondary">
                {t('rescue.advanced')}
              </span>
              <h3>
                TLS Handshake Fragment
              </h3>
            </div>

            <label className="compact-switch">
              <input
                type="checkbox"
                disabled={
                  !settings.enabled
                }
                checked={
                  settings.handshakeFragment
                }
                onChange={(event) =>
                  onUpdate({
                    handshakeFragment:
                      event.target
                        .checked,
                  })
                }
              />
              <span />
            </label>
          </div>

          <p>
            بسته‌های Handshake را در سطح TCP تقسیم
            می‌کند. ممکن است سرعت را کاهش دهد؛ فقط
            وقتی Record Fragment کافی نیست فعالش کن.
          </p>

          <label className="rescue-field">
            <span>
              {t('rescue.fallbackDelay')}
            </span>
            <select
              disabled={
                !settings.enabled ||
                !settings.handshakeFragment
              }
              value={
                settings.fragmentFallbackDelay
              }
              onChange={(event) =>
                onUpdate({
                  fragmentFallbackDelay:
                    event.target.value,
                })
              }
            >
              <option value="100ms">
                100 ms
              </option>
              <option value="250ms">
                250 ms
              </option>
              <option value="500ms">
                500 ms
              </option>
              <option value="1s">
                {t('rescue.sec1')}
              </option>
            </select>
          </label>
        </article>

        <article className="rescue-setting-card rescue-sni-card">
          <div className="rescue-setting-heading">
            <div>
              <span className="rescue-setting-badge caution">
                {t('rescue.optional')}
              </span>
              <h3>
                SNI سفارشی
              </h3>
            </div>
          </div>

          <p>
            فقط زمانی وارد کن که سرویس‌دهنده سرور
            یک SNI جایگزین معتبر داده باشد. مقدار
            اشتباه باعث شکست TLS می‌شود.
          </p>

          <label className="rescue-field">
            <span>
              {t('rescue.sniLabel')}
            </span>
            <input
              type="text"
              dir="ltr"
              disabled={
                !settings.enabled
              }
              value={
                settings.customSni
              }
              placeholder="example.com"
              onChange={(event) =>
                onUpdate({
                  customSni:
                    event.target.value,
                })
              }
            />
          </label>
        </article>

        <article className="rescue-setting-card rescue-dpi-card">
          <div className="rescue-setting-heading">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div>
                <span className="rescue-setting-badge caution">
                  {t('rescue.dpiBypass.badge')}
                </span>
                <h3>
                  {t('rescue.dpiBypass.title')}
                </h3>
              </div>
              <InfoButton
                fa={t('rescue.dpiBypass.tooltip')}
                en={t('rescue.dpiBypass.tooltip')}
              />
            </div>

            <label className="compact-switch">
              <input
                type="checkbox"
                checked={
                  settings.dpiBypassAuto
                }
                onChange={(event) =>
                  onUpdate({
                    dpiBypassAuto:
                      event.target.checked,
                  })
                }
              />
              <span />
            </label>
          </div>

          <p>
            {t('rescue.dpiBypass.desc')}
          </p>
        </article>
      </section>

      <section className="rescue-summary-card">
        <div>
          <span className="panel-kicker">
            Current Profile
          </span>
          <h3>
            وضعیت پروفایل نجات
          </h3>
        </div>

        <div className="rescue-summary-items">
          <span>
            Record Fragment:
            <strong>
              {settings.enabled &&
              settings.recordFragment
                ? ` ${t('rescue.on')}`
                : ` ${t('rescue.off')}`}
            </strong>
          </span>

          <span>
            Handshake Fragment:
            <strong>
              {settings.enabled &&
              settings.handshakeFragment
                ? ` ${t('rescue.on')}`
                : ` ${t('rescue.off')}`}
            </strong>
          </span>

          <span>
            SNI:
            <strong dir="ltr">
              {settings.enabled &&
              settings.customSni
                ? ` ${settings.customSni}`
                : ` ${t('rescue.auto')}`}
            </strong>
          </span>

          <span>
            {t('rescue.dpiBypass.summary')}:
            <strong>
              {settings.dpiBypassAuto
                ? ` ${t('rescue.on')}`
                : ` ${t('rescue.off')}`}
            </strong>
          </span>
        </div>

        <button
          className="secondary-button"
          type="button"
          onClick={onReset}
        >
          {t('rescue.reset')}
        </button>
      </section>
    </div>
  )
}

function StatisticsPage({
  summary,
  sessions,
}: {
  summary: {
    successfulSessions: number
    failedAttempts: number
    totalDurationMs: number
    tunSessions: number
  }
  sessions: Array<{
    id: string
    startedAt: string
    endedAt: string | null
    serverName: string
    subscriptionName: string
    mode:
      | 'tun'
      | 'system-proxy'
    latencyMs: number | null
    exitIp: string | null
    endReason:
      | 'manual'
      | 'connection-lost'
      | 'application'
      | null
  }>
}) {
  const t = useT()
  const recentSessions =
    sessions.slice(0, 10)

  return (
    <div className="page-stack">
      <section className="quick-statistics">
        <article className="statistic-card">
          <span className="statistic-icon">
            ✓
          </span>
          <div>
            <span className="statistic-label">
              {t('stats2.success')}
            </span>
            <strong>
              {summary.successfulSessions.toLocaleString(
                'fa-IR',
              )}
            </strong>
          </div>
        </article>

        <article className="statistic-card">
          <span className="statistic-icon">
            !
          </span>
          <div>
            <span className="statistic-label">
              {t('stats2.failed')}
            </span>
            <strong>
              {summary.failedAttempts.toLocaleString(
                'fa-IR',
              )}
            </strong>
          </div>
        </article>

        <article className="statistic-card">
          <span className="statistic-icon">
            ◷
          </span>
          <div>
            <span className="statistic-label">
              {t('stats2.totalTime')}
            </span>
            <strong>
              {formatDuration(
                summary.totalDurationMs,
              )}
            </strong>
          </div>
        </article>

        <article className="statistic-card">
          <span className="statistic-icon">
            T
          </span>
          <div>
            <span className="statistic-label">
              {t('stats2.tunSessions')}
            </span>
            <strong>
              {summary.tunSessions.toLocaleString(
                'fa-IR',
              )}
            </strong>
          </div>
        </article>
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              Connection History
            </span>
            <h3>
              {t('stats2.recent')}
            </h3>
          </div>

          <span className="count-badge">
            {sessions.length.toLocaleString(
              'fa-IR',
            )} {t('stats2.sessions')}
          </span>
        </div>

        {recentSessions.length === 0 ? (
          <EmptyPage
            icon="▥"
            title={t('stats2.noSessions')}
            description={t('stats2.noSessionsDesc')}
          />
        ) : (
          <div className="diagnostic-session-list">
            {recentSessions.map(
              (session) => (
                <article
                  className="diagnostic-session-row"
                  key={
                    session.id
                  }
                >
                  <div>
                    <strong>
                      {session.serverName}
                    </strong>
                    <span>
                      {
                        session.subscriptionName
                      }
                    </span>
                  </div>

                  <div className="diagnostic-session-meta">
                    <span>
                      {session.mode ===
                      'tun'
                        ? 'TUN'
                        : 'System Proxy'}
                    </span>
                    <span>
                      {formatSessionDuration(
                        session.startedAt,
                        session.endedAt,
                      )}
                    </span>
                    <span>
                      {session.latencyMs !==
                      null
                        ? `${session.latencyMs.toLocaleString(
                            'fa-IR',
                          )} ms`
                        : t('stats2.noPing')}
                    </span>
                    <span>
                      {session.endedAt
                        ? formatLocalDateTime(
                            session.endedAt,
                          )
                        : t('stats2.connecting')}
                    </span>
                  </div>
                </article>
              ),
            )}
          </div>
        )}
      </section>
    </div>
  )
}

function LogsPage({
  events,
  onClear,
  onCopyReport,
}: {
  events: Array<{
    id: string
    timestamp: string
    level:
      | 'info'
      | 'success'
      | 'warning'
      | 'error'
    type: string
    message: string
    serverName: string | null
    subscriptionName: string | null
    mode:
      | 'tun'
      | 'system-proxy'
      | null
    latencyMs: number | null
  }>
  onClear: () => void
  onCopyReport: () =>
    Promise<void>
}) {
  const t = useT()
  const [copied, setCopied] =
    useState(false)

  async function copyReport() {
    await onCopyReport()
    setCopied(true)

    window.setTimeout(() => {
      setCopied(false)
    }, 1800)
  }

  return (
    <section className="panel-card log-panel">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">
            Application Diagnostics
          </span>
          <h3>
            {t('logs.title')}
          </h3>
        </div>

        <div className="log-actions">
          <InfoButton
            fa="این گزارش شامل URI، UUID، رمز، کلید یا نشانی اشتراک نیست و فقط وضعیت عملیاتی اتصال را نگه می‌دارد."
            en="This log contains no URIs, UUIDs, passwords, keys, or subscription URLs — only operational connection status is recorded."
          />

          <button
            className="secondary-button"
            type="button"
            disabled={
              events.length === 0
            }
            onClick={() => {
              void copyReport()
            }}
          >
            {copied
              ? t('logs.copied')
              : t('logs.copy')}
          </button>

          <button
            className="text-button"
            type="button"
            disabled={
              events.length === 0
            }
            onClick={onClear}
          >
            {t('logs.clear')}
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <EmptyPage
          icon="▤"
          title={t('logs.empty.title')}
          description={t('logs.empty.desc')}
        />
      ) : (
        <div className="diagnostic-log-list">
          {events.map(
            (event) => (
              <article
                className={`diagnostic-log-row diagnostic-log-${event.level}`}
                key={event.id}
              >
                <div className="diagnostic-log-level">
                  {formatDiagnosticLevel(
                    event.level,
                  )}
                </div>

                <div className="diagnostic-log-content">
                  <strong>
                    {event.message}
                  </strong>

                  <div>
                    <span>
                      {formatLocalDateTime(
                        event.timestamp,
                      )}
                    </span>

                    {event.serverName && (
                      <span>
                        {event.serverName}
                      </span>
                    )}

                    {event.subscriptionName && (
                      <span>
                        {
                          event.subscriptionName
                        }
                      </span>
                    )}

                    {event.mode && (
                      <span>
                        {event.mode ===
                        'tun'
                          ? 'TUN'
                          : 'System Proxy'}
                      </span>
                    )}

                    {event.latencyMs !==
                      null && (
                      <span>
                        {event.latencyMs.toLocaleString(
                          'fa-IR',
                        )}{' '}
                        ms
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ),
          )}
        </div>
      )}
    </section>
  )
}

function formatDiagnosticLevel(
  level:
    | 'info'
    | 'success'
    | 'warning'
    | 'error',
) {
  if (level === 'success') {
    return 'موفق'
  }

  if (level === 'warning') {
    return 'هشدار'
  }

  if (level === 'error') {
    return 'خطا'
  }

  return 'اطلاع'
}

function formatDuration(
  durationMs: number,
) {
  const totalSeconds =
    Math.floor(
      durationMs / 1000,
    )

  const hours =
    Math.floor(
      totalSeconds / 3600,
    )

  const minutes =
    Math.floor(
      (
        totalSeconds % 3600
      ) / 60,
    )

  const seconds =
    totalSeconds % 60

  return [
    hours,
    minutes,
    seconds,
  ]
    .map((value) =>
      value
        .toString()
        .padStart(2, '0'),
    )
    .join(':')
    .replace(
      /\d/g,
      (digit) =>
        '۰۱۲۳۴۵۶۷۸۹'[
          Number(digit)
        ],
    )
}

function formatSessionDuration(
  startedAt: string,
  endedAt: string | null,
) {
  const started =
    new Date(
      startedAt,
    ).getTime()

  const ended =
    endedAt
      ? new Date(
          endedAt,
        ).getTime()
      : Date.now()

  return formatDuration(
    Math.max(
      0,
      ended - started,
    ),
  )
}

function formatLocalDateTime(
  value: string,
) {
  return new Intl.DateTimeFormat(
    'fa-IR',
    {
      dateStyle: 'short',
      timeStyle: 'medium',
    },
  ).format(
    new Date(value),
  )
}

function SettingsPage({
  settings,
  onUpdate,
  onReset,
  directDomainCount,
  administratorAvailable,
  connected,
  onOpenDirectSites,
  onOpenVirtualLocationExtension,
  onDownloadExtensionZip,
  currentEngineVersion,
  onCheckEngineUpdate,
  onInstallEngineUpdate,
  ctrlEnterEnabled,
  onCtrlEnterToggle,
  closeToTray,
  onCloseToTrayToggle,
}: {
  settings: {
    mode:
      | 'auto'
      | 'tun'
      | 'system-proxy'
    allowFallback: boolean
  }
  onUpdate: (
    patch: Partial<{
      mode:
        | 'auto'
        | 'tun'
        | 'system-proxy'
      allowFallback: boolean
    }>,
  ) => void
  onReset: () => void
  directDomainCount: number
  administratorAvailable: boolean
  connected: boolean
  onOpenDirectSites: () => void
  onOpenVirtualLocationExtension: () =>
    Promise<{
      success: boolean
      path: string
      error: string | null
    }>
  onDownloadExtensionZip: () =>
    Promise<{
      success: boolean
      path?: string
      error: string | null
    }>
  currentEngineVersion:
    | string
    | null
  onCheckEngineUpdate: () =>
    Promise<{
      success: boolean
      currentVersion: string | null
      latestVersion: string | null
      updateAvailable: boolean
      publishedAt: string | null
      releaseUrl: string | null
      assetName: string | null
      assetUrl: string | null
      assetDigest: string | null
      error: string | null
    }>
  onInstallEngineUpdate: () =>
    Promise<{
      success: boolean
      updated: boolean
      currentVersion: string | null
      latestVersion: string | null
      installedVersion: string | null
      message: string | null
      error: string | null
    }>
  ctrlEnterEnabled: boolean
  onCtrlEnterToggle: (v: boolean) => void
  closeToTray: boolean
  onCloseToTrayToggle: (v: boolean) => Promise<void>
}) {
  const t = useT()
  const [
    extensionMessage,
    setExtensionMessage,
  ] = useState<{
    type:
      | 'success'
      | 'error'
    text: string
  } | null>(null)

  const [
    openingExtensionFolder,
    setOpeningExtensionFolder,
  ] = useState(false)

  const [
    downloadingExtensionZip,
    setDownloadingExtensionZip,
  ] = useState(false)

  const [
    engineUpdateState,
    setEngineUpdateState,
  ] = useState<{
    checking: boolean
    installing: boolean
    latestVersion: string | null
    installedVersion: string | null
    updateAvailable: boolean
    message: string | null
    error: string | null
  }>({
    checking: false,
    installing: false,
    latestVersion: null,
    installedVersion:
      currentEngineVersion,
    updateAvailable: false,
    message: null,
    error: null,
  })

  async function checkEngineUpdate() {
    if (
      engineUpdateState.checking ||
      engineUpdateState.installing
    ) {
      return
    }

    setEngineUpdateState(
      (current) => ({
        ...current,
        checking: true,
        message: null,
        error: null,
      }),
    )

    const result =
      await onCheckEngineUpdate()

    setEngineUpdateState(
      (current) => ({
        ...current,
        checking: false,
        latestVersion:
          result.latestVersion,
        installedVersion:
          result.currentVersion ??
          current.installedVersion,
        updateAvailable:
          result.updateAvailable,
        message:
          result.success
            ? result.updateAvailable
              ? t('settings.engine.updateAvailable')
              : t('settings.engine.upToDate')
            : null,
        error:
          result.error,
      }),
    )
  }

  async function installEngineUpdate() {
    if (
      connected ||
      engineUpdateState.installing
    ) {
      return
    }

    setEngineUpdateState(
      (current) => ({
        ...current,
        installing: true,
        message: null,
        error: null,
      }),
    )

    const result =
      await onInstallEngineUpdate()

    setEngineUpdateState(
      (current) => ({
        ...current,
        installing: false,
        latestVersion:
          result.latestVersion ??
          current.latestVersion,
        installedVersion:
          result.installedVersion ??
          current.installedVersion,
        updateAvailable:
          result.success
            ? false
            : current.updateAvailable,
        message:
          result.message,
        error:
          result.error,
      }),
    )
  }

  async function downloadZip() {
    if (downloadingExtensionZip) return
    setDownloadingExtensionZip(true)
    setExtensionMessage(null)
    try {
      const result = await onDownloadExtensionZip()
      if (result.success) {
        setExtensionMessage({ type: 'success', text: t('settings.ext.zipSaved') })
      } else {
        setExtensionMessage({ type: 'error', text: result.error ?? t('settings.ext.zipFailed') })
      }
    } catch (error) {
      setExtensionMessage({ type: 'error', text: error instanceof Error ? error.message : t('settings.ext.zipFailed') })
    } finally {
      setDownloadingExtensionZip(false)
    }
  }

  async function openExtensionFolder() {
    if (openingExtensionFolder) {
      return
    }

    setOpeningExtensionFolder(true)
    setExtensionMessage(null)

    try {
      const result =
        await onOpenVirtualLocationExtension()

      if (result.success) {
        setExtensionMessage({
          type: 'success',
          text: t('settings.ext.folderOpened'),
        })
      } else {
        setExtensionMessage({
          type: 'error',
          text:
            result.error ??
            t('settings.ext.folderFailed'),
        })
      }
    } catch (error) {
      setExtensionMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('settings.ext.folderFailed'),
      })
    } finally {
      setOpeningExtensionFolder(false)
    }
  }

  const { theme, setTheme } = useContext(ThemeCtx)
  const { lang, setLang } = useContext(LangCtx)

  return (
    <div className="page-stack">

      {/* ── Appearance ─────────────────────────────────────────────── */}
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">{t('settings.appearanceKicker')}</span>
            <h3>{t('settings.appearance')}</h3>
          </div>
        </div>

        <div className="appearance-options">
          <label className="appearance-option">
            <input
              type="radio"
              name="theme"
              value="dark"
              checked={theme === 'dark'}
              onChange={() => setTheme('dark')}
            />
            <span className="appearance-option-icon">☽</span>
            <span>{t('settings.dark')}</span>
          </label>
          <label className="appearance-option">
            <input
              type="radio"
              name="theme"
              value="light"
              checked={theme === 'light'}
              onChange={() => setTheme('light')}
            />
            <span className="appearance-option-icon">☀</span>
            <span>{t('settings.light')}</span>
          </label>
        </div>

        <div className="appearance-options" style={{ marginTop: '16px' }}>
          <label className="appearance-option">
            <input
              type="radio"
              name="lang"
              value="fa"
              checked={lang === 'fa'}
              onChange={() => setLang('fa')}
            />
            <span className="appearance-option-icon">🇮🇷</span>
            <span>{t('settings.langFa')}</span>
          </label>
          <label className="appearance-option">
            <input
              type="radio"
              name="lang"
              value="en"
              checked={lang === 'en'}
              onChange={() => setLang('en')}
            />
            <span className="appearance-option-icon">🇬🇧</span>
            <span>{t('settings.langEn')}</span>
          </label>
        </div>

        <p className="inline-notice" style={{ marginTop: '12px' }}>
          {t('settings.appearanceNote')}
        </p>
      </section>

      {/* ── Connection routing ──────────────────────────────────────── */}
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              Connection Routing
            </span>
            <h3>
              {t('settings.connection.title')}
            </h3>
          </div>

          <button
            className="secondary-button"
            type="button"
            onClick={onReset}
          >
            {t('settings.connection.reset')}
          </button>
        </div>

        {connected && (
          <div className="inline-notice">
            {t('settings.connection.notice')}
          </div>
        )}

        <label className="settings-select-field">
          <span>
            {t('settings.mode.label')}
          </span>

          <select
            value={
              settings.mode
            }
            onChange={(event) =>
              onUpdate({
                mode:
                  event.target
                    .value as
                    | 'auto'
                    | 'tun'
                    | 'system-proxy',
              })
            }
          >
            <option value="auto">
              {t('settings.mode.auto')}
            </option>
            <option value="tun">
              {t('settings.mode.tunOnly')}
            </option>
            <option value="system-proxy">
              {t('settings.mode.proxyOnly')}
            </option>
          </select>
        </label>

        <SettingRow
          title={t('settings.mode.fallbackTitle')}
          description={t('settings.mode.fallbackDesc')}
          checked={
            settings.allowFallback
          }
          disabled={
            settings.mode ===
              'system-proxy' ||
            settings.mode ===
              'tun'
          }
          onChange={(checked) =>
            onUpdate({
              allowFallback:
                checked,
            })
          }
        />

        <SettingRow
          title={t('settings.shortcut.title')}
          description={t('settings.shortcut.desc')}
          checked={ctrlEnterEnabled}
          onChange={onCtrlEnterToggle}
        />

        <SettingRow
          title={lang === 'fa' ? 'کوچک‌سازی به سینی سیستم' : 'Minimize to System Tray'}
          description={lang === 'fa' ? 'با بستن پنجره، برنامه به‌جای خروج، در سینی سیستم باقی می‌ماند.' : 'Closing the window hides the app to the system tray instead of quitting.'}
          checked={closeToTray}
          onChange={(v) => void onCloseToTrayToggle(v)}
        />

        <div className="connection-mode-summary">
          <span>
            Administrator
          </span>
          <strong>
            {administratorAvailable
              ? t('settings.mode.active')
              : t('settings.mode.inactive')}
          </strong>

          <span>
            {t('settings.mode.selected')}
          </span>
          <strong>
            {settings.mode ===
            'auto'
              ? t('settings.mode.autoShort')
              : settings.mode ===
                  'tun'
                ? t('settings.mode.tunShort')
                : t('settings.mode.proxyShort')}
          </strong>
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              Split Tunneling
            </span>
            <h3>
              {t('settings.direct.title')}
            </h3>
          </div>

          <div className="heading-end-row">
            <span className="count-badge">
              {directDomainCount} {t('settings.direct.domains')}
            </span>
            <InfoButton
              fa="دامنه‌های این فهرست از خروجی مستقیم اینترنت باز می‌شوند و وارد تونل نمی‌شوند. این قانون هم در TUN و هم در System Proxy اعمال می‌شود."
              en="Domains in this list bypass the VPN tunnel and connect directly. This rule applies in both TUN and System Proxy modes."
            />
          </div>
        </div>

        <button
          className="primary-button compact-primary"
          type="button"
          onClick={
            onOpenDirectSites
          }
        >
          {t('settings.direct.manage')}
        </button>
      </section>

      <section className="panel-card engine-update-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              Engine Update
            </span>
            <h3>
              {t('settings.engine.title')}
            </h3>
          </div>

          <div className="heading-end-row">
            <span className="count-badge">
              Stable only
            </span>
            <InfoButton
              fa="نسخه فعلی با آخرین Release پایدار رسمی SagerNet مقایسه می‌شود. نسخه‌های Alpha، Beta و RC نصب نخواهند شد."
              en="The current version is compared against the latest stable SagerNet release. Alpha, Beta, and RC versions will not be installed."
            />
          </div>
        </div>

        <div className="engine-version-grid">
          <div>
            <span>
              {t('settings.engine.installed')}
            </span>
            <strong dir="ltr">
              {engineUpdateState.installedVersion ??
              currentEngineVersion ??
              t('settings.engine.unknown')}
            </strong>
          </div>

          <div>
            <span>
              {t('settings.engine.latest')}
            </span>
            <strong dir="ltr">
              {engineUpdateState.latestVersion ??
              t('settings.engine.notChecked')}
            </strong>
          </div>
        </div>

        <div className="engine-update-actions">
          <button
            className="secondary-button"
            type="button"
            disabled={
              engineUpdateState.checking ||
              engineUpdateState.installing
            }
            onClick={() => {
              void checkEngineUpdate()
            }}
          >
            {engineUpdateState.checking
              ? t('settings.engine.checking')
              : t('settings.engine.check')}
          </button>

          <button
            className="primary-button compact-primary"
            type="button"
            disabled={
              connected ||
              engineUpdateState.installing ||
              !engineUpdateState.updateAvailable
            }
            onClick={() => {
              void installEngineUpdate()
            }}
          >
            {engineUpdateState.installing
              ? t('settings.engine.installing')
              : connected
                ? t('settings.engine.disconnectFirst')
                : t('settings.engine.install')}
          </button>
        </div>

        {engineUpdateState.message && (
          <div className="inline-notice engine-update-message">
            {engineUpdateState.message}
          </div>
        )}

        {engineUpdateState.error && (
          <div className="inline-error engine-update-message">
            {engineUpdateState.error}
          </div>
        )}

      </section>

      <section className="panel-card virtual-location-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              Browser Virtual Location
            </span>
            <h3>
              {t('settings.ext.title')}
            </h3>
          </div>

          <div className="heading-end-row">
            <span className="count-badge">
              Chrome / Edge
            </span>
            <InfoButton
              fa="افزونه همراه فقط هنگام اتصال تأییدشده HamidsDeutsch فعال می‌شود و مختصات HTML5 Geolocation را با کشور و شهر IP خروجی هماهنگ می‌کند. با قطع برنامه یا استفاده از VPN دیگر، خودکار غیرفعال می‌شود."
              en="The bundled extension activates only on a verified HamidsDeutsch connection, aligning HTML5 Geolocation coordinates with the exit IP country and city. It deactivates automatically when the app disconnects or another VPN is used."
            />
          </div>
        </div>

        <div className="virtual-location-steps">
          <span>
            {t('settings.ext.step1')}
          </span>
          <span>
            {t('settings.ext.step2')}
          </span>
          <span>
            {t('settings.ext.step3')}
          </span>
        </div>

        <div className="extension-install-row">
          <button
            className="primary-button compact-primary"
            type="button"
            disabled={openingExtensionFolder}
            onClick={() => void openExtensionFolder()}
          >
            {openingExtensionFolder ? t('settings.ext.opening') : t('settings.ext.openFolder')}
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={downloadingExtensionZip}
            onClick={() => void downloadZip()}
          >
            {downloadingExtensionZip ? t('settings.ext.downloading') : t('settings.ext.downloadZip')}
          </button>
        </div>

        {extensionMessage && (
          <div
            className={
              extensionMessage.type ===
              'success'
                ? 'inline-notice virtual-location-message'
                : 'inline-error virtual-location-message'
            }
          >
            {extensionMessage.text}
          </div>
        )}

      </section>

      <StartupSection />

      <ExportImportSection />

      <GitHubSection />

      <ConnectionHistorySection />

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              Safety
            </span>
            <h3>
              {t('settings.fixed.title')}
            </h3>
          </div>
        </div>

        <SettingRow
          title={t('settings.fixed.ipCheck')}
          description={t('settings.fixed.ipCheckDesc')}
          checked
          disabled
        />

        <SettingRow
          title={t('settings.fixed.proxyRestore')}
          description={t('settings.fixed.proxyRestoreDesc')}
          checked
          disabled
        />

        <SettingRow
          title={t('settings.fixed.healthMonitor')}
          description={t('settings.fixed.healthMonitorDesc')}
          checked
          disabled
        />
      </section>
    </div>
  )
}

function ExportImportSection() {
  const t = useT()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function collectSettings(): Record<string, string> {
    const keys = [
      'hd-theme',
      'hd-lang',
      'hamidsdeutsch:connection-settings:v1',
      'hamidsdeutsch:rescue-settings:v1',
      'hamidsdeutsch:direct-domains:v2',
      'hamidsdeutsch:selected-server:v2',
      'hamidsdeutsch-bpb-config-cache-v1',
      'hamidsdeutsch:ctrl-enter',
    ]
    const out: Record<string, string> = {}
    for (const k of keys) {
      const v = localStorage.getItem(k)
      if (v !== null) out[k] = v
    }
    return out
  }

  function exportSettings() {
    try {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: collectSettings(),
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `hamids-deutsch-settings-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMessage({ type: 'success', text: t('settings.exportImport.exported') })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('settings.exportImport.exportFailed') })
    }
  }

  function importSettings() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result as string) as { version: number; settings: Record<string, string> }
          if (!data.settings || typeof data.settings !== 'object') {
            setMessage({ type: 'error', text: t('settings.exportImport.invalidFile') })
            return
          }
          for (const [k, v] of Object.entries(data.settings)) {
            localStorage.setItem(k, v)
          }
          setMessage({ type: 'success', text: t('settings.exportImport.imported') })
          setTimeout(() => window.location.reload(), 800)
        } catch {
          setMessage({ type: 'error', text: t('settings.exportImport.invalidFile') })
        }
      }
      reader.readAsText(file)
    }
    input.click()
  }

  return (
    <section className="panel-card">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">Settings</span>
          <h3>{t('settings.exportImport.title')}</h3>
        </div>
        <InfoButton
          fa="تمام تنظیمات برنامه (زبان، تم، حالت اتصال، دامنه‌های مستقیم و تنظیمات Rescue) را در یک فایل JSON ذخیره یا بارگذاری کنید."
          en="Save or load all app settings (language, theme, connection mode, direct domains, rescue settings) in a single JSON file."
        />
      </div>
      <div className="export-import-actions">
        <button className="secondary-button" type="button" onClick={exportSettings}>
          {t('settings.exportImport.export')}
        </button>
        <button className="primary-button compact-primary" type="button" onClick={importSettings}>
          {t('settings.exportImport.import')}
        </button>
      </div>
      {message && (
        <div className={message.type === 'success' ? 'inline-notice' : 'inline-error'} style={{ marginTop: '8px' }}>
          {message.text}
        </div>
      )}
    </section>
  )
}

function StartupSection() {
  const t = useT()
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    void window.hamidsDeutsch.startup.getLoginItem().then((r) => setEnabled(r.enabled))
  }, [])

  async function toggle() {
    if (busy || enabled === null) return
    setBusy(true)
    setMessage(null)
    const next = !enabled
    const r = await window.hamidsDeutsch.startup.setLoginItem(next)
    setBusy(false)
    if (r.success) {
      setEnabled(r.enabled)
      setMessage(r.enabled ? t('settings.startup.enabled') : t('settings.startup.disabled'))
    } else {
      setMessage(r.error ?? t('settings.startup.failed'))
    }
  }

  return (
    <section className="panel-card">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">System</span>
          <h3>{t('settings.startup.title')}</h3>
        </div>
        {enabled !== null && (
          <span className="count-badge">{enabled ? t('settings.startup.on') : t('settings.startup.off')}</span>
        )}
      </div>
      <p className="inline-notice">{t('settings.startup.desc')}</p>
      <button
        className={enabled ? 'secondary-button' : 'primary-button compact-primary'}
        type="button"
        disabled={busy || enabled === null}
        onClick={() => void toggle()}
      >
        {busy ? t('settings.startup.saving') : enabled ? t('settings.startup.disable') : t('settings.startup.enable')}
      </button>
      {message && <div className="inline-notice" style={{ marginTop: '8px' }}>{message}</div>}
    </section>
  )
}

function ConnectionHistorySection() {
  const t = useT()
  const [entries, setEntries] = useState<{
    id: string
    connectedAt: string
    disconnectedAt: string | null
    durationMs: number | null
    mode: string
    serverName: string | null
    protocol: string | null
    latencyMs: number | null
  }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [undoClearVisible, setUndoClearVisible] = useState(false)
  const [undoClearSnapshot, setUndoClearSnapshot] = useState<typeof entries>([])
  const undoClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    void window.hamidsDeutsch.history.get().then((r) => {
      if (r.success) setEntries(r.entries)
      setLoaded(true)
    })
  }, [])

  async function clearHistory() {
    if (clearing) return
    setClearing(true)
    setUndoClearSnapshot(entries)
    setEntries([])
    setUndoClearVisible(true)
    if (undoClearTimer.current) clearTimeout(undoClearTimer.current)
    undoClearTimer.current = setTimeout(async () => {
      setUndoClearVisible(false)
      await window.hamidsDeutsch.history.clear()
      setClearing(false)
    }, 5000)
  }

  async function undoClear() {
    if (undoClearTimer.current) clearTimeout(undoClearTimer.current)
    setUndoClearVisible(false)
    setEntries(undoClearSnapshot)
    setClearing(false)
  }

  function formatDuration(ms: number | null) {
    if (!ms) return '—'
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    if (m < 60) return `${m}m ${s % 60}s`
    return `${Math.floor(m / 60)}h ${m % 60}m`
  }

  function fmtTime(iso: string) {
    return new Date(iso).toLocaleTimeString()
  }

  function getDateLabel(iso: string): string {
    const d = new Date(iso)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const weekAgo = new Date(today)
    weekAgo.setDate(today.getDate() - 7)
    const isSameDay = (a: Date, b: Date) =>
      a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    if (isSameDay(d, today)) return t('history.today')
    if (isSameDay(d, yesterday)) return t('history.yesterday')
    if (d >= weekAgo) return t('history.thisWeek')
    return d.toLocaleDateString()
  }

  const groupedEntries = useMemo(() => {
    const groups: { label: string; entries: typeof entries }[] = []
    const seen = new Map<string, number>()
    for (const e of entries.slice(0, 30)) {
      const label = getDateLabel(e.connectedAt)
      if (!seen.has(label)) {
        seen.set(label, groups.length)
        groups.push({ label, entries: [] })
      }
      groups[seen.get(label)!].entries.push(e)
    }
    return groups
  }, [entries])

  return (
    <section className="panel-card">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">History</span>
          <h3>{t('settings.history.title')}</h3>
        </div>
        {entries.length > 0 && (
          <button
            className="secondary-button"
            type="button"
            disabled={clearing}
            onClick={() => void clearHistory()}
          >
            {t('settings.history.clear')}
          </button>
        )}
      </div>

      {!loaded ? (
        <p className="inline-notice">{t('settings.history.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="inline-notice">{t('settings.history.empty')}</p>
      ) : (
        <div className="history-list">
          {groupedEntries.map((group) => (
            <div key={group.label} className="history-date-group">
              <div className="history-date-label">{group.label}</div>
              {group.entries.map((e) => (
            <div key={e.id} className="history-entry">
              <div className="history-entry-top">
                <span className="history-mode">{e.mode}</span>
                {e.protocol && <span className="history-protocol">{e.protocol}</span>}
                <span className="history-duration">{formatDuration(e.durationMs)}</span>
              </div>
              <div className="history-entry-bottom">
                <span className="history-server">{e.serverName ?? '—'}</span>
                <span className="history-time">{fmtTime(e.connectedAt)}</span>
              </div>
            </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {undoClearVisible && (
        <div className="undo-bar">
          <span>{t('undo.clearHistory')}</span>
          <button className="secondary-button undo-bar-btn" type="button" onClick={() => void undoClear()}>
            {t('undo.button')}
          </button>
        </div>
      )}
    </section>
  )
}

function GitHubSection() {
  const t = useT()
  const [token, setToken] = useState('')
  const [status, setStatus] = useState<{
    hasToken: boolean
    username: string | null
    repoCreated: boolean
    lastCodespaceName: string | null
    lastCodespaceState: string | null
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null)

  useEffect(() => {
    void window.hamidsDeutsch.codespace.getStatus().then((s) => setStatus(s))
  }, [])

  async function handleSetup() {
    if (!token.trim() || busy) return
    setBusy(true)
    setMessage(null)
    const result = await window.hamidsDeutsch.codespace.setup(token.trim())
    setBusy(false)
    if (result.success) {
      setToken('')
      setMessage({ type: 'success', text: `${t('github.connected')}: @${result.username}` })
      const s = await window.hamidsDeutsch.codespace.getStatus()
      setStatus(s)
    } else {
      setMessage({ type: 'error', text: result.error ?? t('github.setupFailed') })
    }
  }

  async function handleClear() {
    if (busy) return
    setBusy(true)
    setMessage(null)
    await window.hamidsDeutsch.codespace.clearToken()
    setBusy(false)
    setMessage({ type: 'success', text: t('github.tokenCleared') })

    const s = await window.hamidsDeutsch.codespace.getStatus()
    setStatus(s)
  }

  return (
    <section className="panel-card">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">GitHub Codespace</span>
          <h3>{t('github.title')}</h3>
        </div>
        {status?.hasToken && (
          <span className="count-badge">{t('github.connected')}</span>
        )}
        <InfoButton
          fa="برای استفاده از اتصال Codespace، یک Personal Access Token با دسترسی‌های codespace و repo وارد کن. توکن به‌صورت رمزگذاری‌شده ذخیره می‌شود و هیچ‌گاه به‌صورت متن ساده نگهداری نخواهد شد."
          en="To use Codespace connection, enter a Personal Access Token with codespace and repo scopes. The token is stored encrypted and never kept in plain text."
        />
      </div>

      {status?.hasToken ? (
        <div className="github-status-grid">
          <div>
            <span>{t('github.account')}</span>
            <strong dir="ltr">@{status.username ?? '—'}</strong>
          </div>
          <div>
            <span>{t('github.repo')}</span>
            <strong>{status.repoCreated ? t('github.repoCreated') : t('github.repoNotCreated')}</strong>
          </div>
          {status.lastCodespaceName && (
            <div>
              <span>{t('github.lastCodespace')}</span>
              <strong dir="ltr">{status.lastCodespaceName}</strong>
            </div>
          )}
          {status.lastCodespaceState && (
            <div>
              <span>{t('github.status')}</span>
              <strong dir="ltr">{status.lastCodespaceState}</strong>
            </div>
          )}
        </div>
      ) : (
        <div className="github-token-field">
          <input
            type="password"
            placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
            value={token}
            disabled={busy}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSetup() }}
            dir="ltr"
          />
        </div>
      )}

      {message && (
        <div className={message.type === 'success' ? 'inline-notice' : 'inline-error'}>
          {message.text}
        </div>
      )}

      <div className="github-section-actions">
        {!status?.hasToken && (
          <button
            className="primary-button compact-primary"
            type="button"
            disabled={busy || !token.trim()}
            onClick={() => void handleSetup()}
          >
            {busy ? t('github.saving') : t('github.save')}
          </button>
        )}
        {status?.hasToken && (
          <button
            className="remove-domain-button"
            type="button"
            disabled={busy}
            onClick={() => void handleClear()}
          >
            {t('github.remove')}
          </button>
        )}
      </div>
    </section>
  )
}

function GuidePage() {
  const t = useT()

  return (
    <div className="page-stack">

      {/* ── Method 0: Free Config ──────────────────────────────────── */}
      <section className="panel-card guide-section">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">{t('guide.method0.kicker')}</span>
            <h3>{t('guide.method0.title')}</h3>
          </div>
          <span className="guide-badge guide-badge-free">{t('guide.method0.badge')}</span>
        </div>
        <p className="guide-desc">{t('guide.method0.desc')}</p>
        <ol className="guide-steps">
          <li>{t('guide.method0.step1')}</li>
          <li>{t('guide.method0.step2')}</li>
          <li>{t('guide.method0.step3')}</li>
          <li>{t('guide.method0.step4')}</li>
        </ol>
        <div className="guide-note">{t('guide.method0.note')}</div>
      </section>

      {/* ── Method 1: GitHub Codespace ─────────────────────────────── */}
      <section className="panel-card guide-section">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">{t('guide.method1.kicker')}</span>
            <h3>{t('guide.method1.title')}</h3>
          </div>
          <span className="guide-badge guide-badge-gh">{t('guide.method1.badge')}</span>
        </div>
        <p className="guide-desc">{t('guide.method1.desc')}</p>
        <ol className="guide-steps">
          <li>{t('guide.method1.step1')}</li>
          <li>{t('guide.method1.step2')}</li>
          <li>{t('guide.method1.step3')}</li>
          <li>{t('guide.method1.step4')}</li>
          <li>{t('guide.method1.step5')}</li>
          <li>{t('guide.method1.step6')}</li>
          <li>{t('guide.method1.step7')}</li>
          <li>{t('guide.method1.step8')}</li>
          <li>{t('guide.method1.step9')}</li>
          <li>{t('guide.method1.step10')}</li>
          <li>{t('guide.method1.step11')}</li>
          <li>{t('guide.method1.step12')}</li>
          <li>{t('guide.method1.step13')}</li>
          <li>{t('guide.method1.step14')}</li>
        </ol>
        <div className="guide-note">{t('guide.method1.note')}</div>
      </section>

      {/* ── Method 2: V2Ray Subscription ──────────────────────────── */}
      <section className="panel-card guide-section">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">{t('guide.method2.kicker')}</span>
            <h3>{t('guide.method2.title')}</h3>
          </div>
          <span className="guide-badge guide-badge-v2">{t('guide.method2.badge')}</span>
        </div>
        <p className="guide-desc">{t('guide.method2.desc')}</p>
        <ol className="guide-steps">
          <li>{t('guide.method2.step1')}</li>
          <li>{t('guide.method2.step2')}</li>
          <li>{t('guide.method2.step3')}</li>
          <li>{t('guide.method2.step4')}</li>
          <li>{t('guide.method2.step5')}</li>
        </ol>
      </section>

      {/* ── Method 3: BPB + Cloudflare ─────────────────────────────── */}
      <section className="panel-card guide-section">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">{t('guide.method3.kicker')}</span>
            <h3>{t('guide.method3.title')}</h3>
          </div>
          <span className="guide-badge guide-badge-cf">{t('guide.method3.badge')}</span>
        </div>
        <p className="guide-desc">{t('guide.method3.desc')}</p>
        <ol className="guide-steps">
          <li>{t('guide.method3.step1')}</li>
          <li>{t('guide.method3.step2')}</li>
          <li>{t('guide.method3.step3')}</li>
          <li>{t('guide.method3.step4')}</li>
          <li>{t('guide.method3.step5')}</li>
          <li>{t('guide.method3.step6')}</li>
          <li>{t('guide.method3.step7')}</li>
          <li>{t('guide.method3.step8')}</li>
        </ol>
        <div className="guide-note">{t('guide.method3.note')}</div>
      </section>

      {/* ── Keyboard Shortcut ──────────────────────────────────────── */}
      <section className="panel-card guide-section">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">{t('guide.shortcut.kicker')}</span>
            <h3>{t('guide.shortcut.title')}</h3>
          </div>
          <span className="guide-badge" style={{ fontFamily: 'monospace', letterSpacing: '0.04em' }}>Ctrl+Enter</span>
        </div>
        <p className="guide-desc">{t('guide.shortcut.desc')}</p>
      </section>

      {/* ── Method 4: Browser Extension ────────────────────────────── */}
      <section className="panel-card guide-section">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">{t('guide.method4.kicker')}</span>
            <h3>{t('guide.method4.title')}</h3>
          </div>
          <span className="guide-badge guide-badge-ext">{t('guide.method4.badge')}</span>
        </div>
        <p className="guide-desc">{t('guide.method4.desc')}</p>
        <ol className="guide-steps">
          <li>{t('guide.method4.step1')}</li>
          <li>{t('guide.method4.step2')}</li>
          <li>{t('guide.method4.step3')}</li>
          <li>{t('guide.method4.step4')}</li>
          <li>{t('guide.method4.step5')}</li>
          <li>{t('guide.method4.step6')}</li>
        </ol>
      </section>
    </div>
  )
}

function SettingRow({
  title,
  description,
  checked = false,
  disabled = false,
  onChange,
}: {
  title: string
  description: string
  checked?: boolean
  disabled?: boolean
  onChange?: (
    checked: boolean,
  ) => void
}) {
  return (
    <div
      className={
        disabled
          ? 'setting-row setting-row-disabled'
          : 'setting-row'
      }
    >
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>

      <label className="switch">
        <input
          checked={checked}
          disabled={disabled}
          type="checkbox"
          onChange={(event) =>
            onChange?.(
              event.target.checked,
            )
          }
        />
        <span className="switch-track" />
      </label>
    </div>
  )
}

export default App
