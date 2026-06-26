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
      return (saved === 'fa' || saved === 'en' || saved === 'de') ? saved : 'fa'
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

  // For smart hero-button priority: know if BPB/codespace are configured
  const [codespaceHasToken, setCodespaceHasToken] = useState(false)

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

  useEffect(() => {
    if (appHeroConnected) {
      hasConnectedRef.current = true
      prevHeroConnectedRef.current = true
    } else if (prevHeroConnectedRef.current && hasConnectedRef.current) {
      prevHeroConnectedRef.current = false
      setToastMessage('اتصال قطع شد · پراکسی ویندوز بازگردانی شد')
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setToastMessage(null), 3200)
    }
  }, [appHeroConnected])

  // ── Sidebar hover state ───────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  // Load codespace token state once on mount for smart hero button
  useEffect(() => {
    void window.hamidsDeutsch.codespace.getStatus().then((s) => {
      setCodespaceHasToken(Boolean(s?.hasToken))
    }).catch(() => {})
  }, [])

  useEffect(() => {
    void window.hamidsDeutsch.free.getPool().then((r) => {
      if (r.success) setFreePool(r.servers)
    })
    return window.hamidsDeutsch.free.onProgress(({ text, phase }) => {
      setFreeProgress(text)
      setFreePhase(phase)
    })
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

  const fastestServer = useMemo(
    () =>
      serverNodes.nodes.find(
        (node) => node.id === latency.fastestServerId,
      ) ?? null,
    [latency.fastestServerId, serverNodes.nodes],
  )

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

    const localVerification =
      await ipVerification.verify()

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
        className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}
        onMouseEnter={() => setSidebarOpen(true)}
        onMouseLeave={() => setSidebarOpen(false)}
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

            {/* Language cycle toggle: FA → EN → DE → FA */}
            <button
              className="lang-slider-toggle"
              type="button"
              title={t('toggle.lang')}
              onClick={() => setLang(lang === 'fa' ? 'en' : lang === 'en' ? 'de' : 'fa')}
              aria-label={t('toggle.lang')}
              data-lang={lang}
            >
              <span className="lang-slider-label lang-slider-label-left">
                {lang === 'fa' ? 'EN' : lang === 'en' ? 'DE' : 'FA'}
              </span>
              <span className="lang-slider-track">
                <span className="lang-slider-flag" />
                <span className="lang-slider-knob" />
              </span>
              <span className="lang-slider-label lang-slider-label-right">
                {lang === 'fa' ? 'FA' : lang === 'en' ? 'EN' : 'DE'}
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
              freePhase={freePhase}
              freeNodeName={freeNodeName}
              freeLatencyMs={freeLatencyMs}
              freeProgress={freeProgress}
              freeError={freeError}
              onFreeConnect={() => void connectFreeConfig()}
              onFreeDisconnect={() => void disconnectFreeConfig()}
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
              freePhase={freePhase}
              onConnectFreeNode={async (server) => {
                setFreePhase('connecting')
                setFreeProgress(`اتصال به ${server.name}...`)
                setFreeError(null)
                try {
                  const result = await window.hamidsDeutsch.free.connectFromPool({
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
              onInstallEngineUpdate={() =>
                window.hamidsDeutsch
                  .engine
                  .updateToLatest()
              }
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
  freePhase: FreeConfigPhase
  freeNodeName: string | null
  freeLatencyMs: number | null
  freeProgress: string | null
  freeError: string | null
  onFreeConnect: () => void
  onFreeDisconnect: () => void
}

function HomePage({
  directDomains,
  engineInfo,
  tunBaselineIp,
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
  onVerifyIp,
  onRetestLatency,
  onOpenServers,
  onOpenDirectSites,
  onOpenRescue,
  codespaceConnecting,
  codespaceConnected,
  codespaceProgress,
  codespaceError,
  codespaceHost,
  onCodespaceConnect,
  onCodespaceDisconnect,
  onOpenBpb,
  freePhase,
  freeNodeName,
  freeLatencyMs,
  freeProgress,
  freeError,
  onFreeConnect,
  onFreeDisconnect,
}: HomePageProps) {
  const t = useT()
  const mainActionAvailable = Boolean(
    processStatus.running || codespaceConnected || freePhase === 'connected' || fastestServer || selectedServer,
  )

  // ── Session timer ──────────────────────────────────────────────────────────
  const freeConnectedLocal = freePhase === 'connected'
  const heroConnectedLocal = isConnected || codespaceConnected || freeConnectedLocal
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

  function handleBpbOpen() {
    if (processStatus.running || codespaceConnected) {
      requireSwitch(
        'تغییر روش اتصال',
        'اتصال فعلی قطع می‌شود و از طریق پنل BPB مجدداً متصل می‌شوید. ادامه می‌دهید؟',
        () => {
          setSwitchConfirm(null)
          onOpenBpb()
        },
      )
    } else {
      onOpenBpb()
    }
  }

  const freeConnected = freeConnectedLocal
  const otherMethodActive = processStatus.running || codespaceConnected || freeConnected
  const heroConnected = heroConnectedLocal
  const activeMethod: 'codespace' | 'free' | 'subscription' | null =
    codespaceConnected ? 'codespace' : freeConnected ? 'free' : processStatus.running ? 'subscription' : null

  const isConnecting = processBusy && !heroConnected
  const isReconnecting = freePhase === 'reconnecting'
  const orbitClass = [
    'connection-orbit',
    isReconnecting ? 'connection-orbit-reconnecting' :
      heroConnected ? 'connection-orbit-online' :
      isConnecting ? 'connection-orbit-connecting' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className="home-layout">
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

          {!administratorAvailable && !processStatus.running && (
            <div className="elevation-panel">
              <div>
                <strong>{t('hero.adminRequired')}</strong>
                <span>{t('hero.adminDesc')}</span>
              </div>
              <button
                className="secondary-button"
                type="button"
                disabled={elevationRequesting}
                onClick={onRelaunchAsAdministrator}
              >
                {elevationRequesting
                  ? t('hero.requestingAccess')
                  : t('hero.relaunchAdmin')}
              </button>
            </div>
          )}

          {elevationError && (
            <div className="inline-error">
              {elevationError}
            </div>
          )}

          <button
            className={
              heroConnected
                ? 'connect-button connect-button-active'
                : 'connect-button'
            }
            type="button"
            disabled={processBusy || ipVerificationChecking || (!activeMethod && !mainActionAvailable)}
            onClick={onMainAction}
          >
            <span className="connect-button-icon">
              {processBusy || ipVerificationChecking ? '…' : activeMethod ? '■' : '▶'}
            </span>
            <span>
              <strong>
                {processBusy
                  ? t('btn.processing')
                  : ipVerificationChecking
                    ? t('btn.verifyingIp')
                    : activeMethod === 'codespace'
                      ? t('hero.disconnectGithub')
                      : activeMethod === 'free'
                        ? t('hero.disconnectFree')
                        : activeMethod === 'subscription'
                          ? t('btn.disconnect')
                          : t('hero.connectFastest')}
              </strong>
              <small>
                {activeMethod === 'codespace'
                  ? `GitHub Codespace${codespaceHost ? ` · ${codespaceHost}` : ''}`
                  : activeMethod === 'free'
                    ? `${freeNodeName ?? t('home.free.title')}${freeLatencyMs ? ` · ${freeLatencyMs} ms` : ''}`
                    : isConnected
                      ? processStatus.connectionMode === 'tun'
                        ? `${tunBaselineIp ?? '—'} ← ${tunCurrentIp ?? '—'}`
                        : `${ipVerificationResult.directIp ?? '—'} ← ${ipVerificationResult.proxyIp ?? '—'}`
                      : processStatus.ready
                        ? t('hero.proxyReady')
                        : t('hero.configHint')}
              </small>
            </span>
          </button>

          {(isConnecting || isReconnecting ||
            freePhase === 'fetching' || freePhase === 'testing' || freePhase === 'connecting') && (
            <div className="hero-progress">
              <div className={`hero-progress-fill ${
                freePhase === 'fetching' ? 'hero-progress-p1' :
                freePhase === 'testing'  ? 'hero-progress-p2' :
                freePhase === 'connecting' ? 'hero-progress-p3' :
                'hero-progress-indeterminate'
              }`} />
            </div>
          )}
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className={orbitClass}>
            <div className="connection-orbit-middle">
              <div className="connection-orbit-core">
                <img
                  src="logo.png"
                  className={`orbit-logo${heroConnected ? ' orbit-logo-online' : ''}${isConnecting ? ' orbit-logo-connecting' : ''}`}
                  alt=""
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="quick-statistics">
        <article className="statistic-card">
          <span className="statistic-icon">◎</span>
          <div>
            <span className="statistic-label">{t('stats.outputIp')}</span>
            <div className="statistic-value-row">
              <strong dir="ltr">
                {isConnected
                  ? ipVerificationResult.proxyIp ?? t('stats.confirmed')
                  : processStatus.ready
                    ? t('stats.pendingVerify')
                    : '—'}
              </strong>
              {isConnected && ipVerificationResult.proxyIp && (
                <CopyButton text={ipVerificationResult.proxyIp} />
              )}
            </div>
          </div>
        </article>
        <article className="statistic-card">
          <span className="statistic-icon">◌</span>
          <div>
            <span className="statistic-label">{t('stats.prevServer')}</span>
            <strong>{selectedServer?.name ?? t('stats.notSelected')}</strong>
          </div>
        </article>
        <article className="statistic-card">
          <span className="statistic-icon">↗</span>
          <div>
            <span className="statistic-label">{t('stats.directSites')}</span>
            <strong>{directDomains.length} {t('stats.domainCount')}</strong>
          </div>
        </article>
      </section>

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

      <div className="home-dual-card-row">
        <section className="codespace-connect-section">
          <div className="codespace-connect-header">
            <div>
              <span className="panel-kicker">GitHub Codespace</span>
              <h3>{t('home.codespace.title')}</h3>
            </div>
            <div className="codespace-header-end">
              {codespaceConnected && codespaceHost && (
                <span className="codespace-host-badge" dir="ltr">{codespaceHost}</span>
              )}
              <span className="free-badge">Free</span>
              <InfoButton
                fa="یک سرور پروکسی موقت روی زیرساخت GitHub می‌سازد و از طریق پروتکل VLESS + WebSocket متصل می‌شود. نیازی به سرور اختصاصی نیست. توکن GitHub باید در تنظیمات وارد شده باشد."
                en="Spins up a temporary proxy server on GitHub's infrastructure and connects via VLESS + WebSocket. No dedicated server needed. A GitHub PAT must be configured in Settings."
              />
            </div>
          </div>

          {codespaceProgress && (
            <div className="codespace-progress">{codespaceProgress}</div>
          )}

          {codespaceError && (
            <div className="form-message form-message-error">{codespaceError}</div>
          )}

          <div className="codespace-actions">
            {codespaceConnected ? (
              <button
                className="codespace-disconnect-button"
                type="button"
                disabled={codespaceConnecting || processBusy}
                onClick={onCodespaceDisconnect}
              >
                {t('home.codespace.disconnect')}
              </button>
            ) : (
              <button
                className={`codespace-connect-button${!codespaceConnecting && processStatus.running ? ' method-faded' : ''}`}
                type="button"
                disabled={codespaceConnecting}
                onClick={handleCodespaceConnect}
              >
                <span className="codespace-connect-icon">⬡</span>
                <span>
                  <strong>
                    {codespaceConnecting ? t('home.codespace.connecting') : t('home.codespace.connect')}
                  </strong>
                  <small>VLESS · WebSocket · TLS · GitHub Infrastructure</small>
                </span>
              </button>
            )}
          </div>
        </section>

        <section className="bpb-home-card">
          <div className="codespace-connect-header">
            <div>
              <span className="panel-kicker bpb-home-kicker">BPB Panel</span>
              <h3>{t('home.bpb.title')}</h3>
            </div>
            <div className="codespace-header-end">
              <span className="free-badge">Free</span>
              <InfoButton
                fa="از طریق پنل BPB که قبلاً در تب «اتصال BPB» پیکربندی کرده‌ای به سریع‌ترین سرور وصل می‌شود."
                en="Connects via a BPB Panel you've already configured in the BPB Connect tab."
              />
            </div>
          </div>
          <div className="bpb-home-actions">
            <button
              className={`bpb-home-connect-button${otherMethodActive ? ' method-faded' : ''}`}
              type="button"
              onClick={handleBpbOpen}
            >
              <span>◈</span>
              <span>
                <strong>{t('home.bpb.connect')}</strong>
              </span>
            </button>
          </div>
        </section>
      </div>

      {/* ── Free Config Card ─────────────────────────────────────────────── */}
      <section className={`free-config-card${otherMethodActive && !freeConnected ? ' method-faded-card' : ''}`}>
        <div className="free-config-header">
          <div className="free-config-header-info">
            <span className="panel-kicker free-config-kicker">V2ray Collector</span>
            <h3>اتصال با سرور رایگان</h3>
          </div>
          <div className="codespace-header-end">
            <span className="free-badge">Free</span>
            <InfoButton
              fa="به‌طور خودکار از مخزن GitHub سرورهای رایگان را دریافت، آزمایش و سریع‌ترین را انتخاب می‌کند. در صورت قطع اتصال، به‌طور خودکار سرور جایگزین پیدا می‌کند."
              en="Automatically fetches free proxy servers from a GitHub repository, tests them, and connects to the fastest. Auto-reconnects if the connection drops."
            />
          </div>
        </div>

        {freeProgress && (
          <div className="free-config-progress">
            <span className={`free-spinner ${freePhase === 'fetching' || freePhase === 'testing' || freePhase === 'connecting' || freePhase === 'reconnecting' ? 'spinning' : ''}`}>◌</span>
            <span>{freeProgress}</span>
          </div>
        )}

        {freeError && freePhase === 'error' && (
          <div className="form-message form-message-error">{freeError}</div>
        )}

        {freeConnected && (
          <div className="free-config-connected-info">
            <span className="free-connected-dot" />
            <span>{freeNodeName}</span>
            {freeLatencyMs != null && <LatencyBadge latencyMs={freeLatencyMs} />}
          </div>
        )}

        <div className="free-config-actions">
          {freeConnected ? (
            <button
              className="free-disconnect-button"
              type="button"
              onClick={onFreeDisconnect}
            >
              قطع اتصال سرور رایگان
            </button>
          ) : (
            <button
              className={`free-connect-button${freePhase === 'fetching' || freePhase === 'testing' || freePhase === 'connecting' || freePhase === 'reconnecting' ? ' loading' : ''}`}
              type="button"
              disabled={freePhase === 'fetching' || freePhase === 'testing' || freePhase === 'connecting' || freePhase === 'reconnecting'}
              onClick={handleFreeConnect}
            >
              <span className="free-btn-icon">⬡</span>
              <span>
                <strong>
                  {freePhase === 'fetching' ? 'دریافت سرورها...' :
                   freePhase === 'testing' ? 'آزمون پینگ...' :
                   freePhase === 'connecting' ? 'در حال اتصال...' :
                   freePhase === 'reconnecting' ? 'اتصال مجدد...' :
                   'دریافت سرور رایگان'}
                </strong>
                <small>جستجو · آزمون · اتصال خودکار</small>
              </span>
            </button>
          )}
        </div>
      </section>

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

      {processStatus.running && (
        <section
          className={
            isConnected
              ? 'local-proxy-status-card local-proxy-status-card-verified'
              : 'local-proxy-status-card'
          }
        >
          <div>
            <span className="panel-kicker">
              {isConnected
                ? 'Windows System Proxy'
                : processStatus.systemProxyEnabled
                  ? 'System Proxy Verification'
                  : 'Local Proxy'}
            </span>
            <h3>
              {isConnected
                ? t('home.proxy.title.verified')
                : processStatus.ready
                  ? t('home.proxy.title.ready')
                  : t('home.proxy.title.running')}
            </h3>
            <p dir="ltr">
              {processStatus.localHost}:{processStatus.localPort}
              {processStatus.pid ? ` · PID ${processStatus.pid}` : ''}
            </p>

            {(ipVerificationResult.directIp || ipVerificationResult.proxyIp) && (
              <div className="ip-comparison-inline" dir="ltr">
                <span>Direct: {ipVerificationResult.directIp ?? '—'}</span>
                <span>Proxy: {ipVerificationResult.proxyIp ?? '—'}</span>
              </div>
            )}
          </div>

          <div className="local-proxy-actions">
            {processStatus.ready && !isConnected && (
              <button
                className="secondary-button"
                type="button"
                disabled={processBusy || ipVerificationChecking}
                onClick={onVerifyIp}
              >
                {ipVerificationChecking ? t('home.proxy.verifying') : t('home.proxy.recheck')}
              </button>
            )}

            <button
              className="remove-domain-button"
              type="button"
              disabled={processBusy || ipVerificationChecking}
              onClick={onStop}
            >
              {t('home.proxy.stop')}
            </button>
          </div>
        </section>
      )}

      {(processError || latencyError || ipVerificationResult.error) && (
        <div className="form-message form-message-error">
          {processError ?? ipVerificationResult.error ?? latencyError}
        </div>
      )}

      {isConnected && (
        <section className="ip-verification-card">
          <div className="ip-verification-heading">
            <div>
              <span className="panel-kicker">IP Verification</span>
              <h3>
                {processStatus.connectionMode === 'tun'
                  ? t('home.proxy.title.tun')
                  : t('home.proxy.title.global')}
              </h3>
            </div>
            <span className="verified-connection-badge">{t('home.proxy.connected')}</span>
          </div>

          <div className="ip-verification-grid">
            <div>
              <span>IP</span>
              <strong dir="ltr">{ipVerificationResult.directIp ?? '—'}</strong>
              <small>
                {ipVerificationResult.directDurationMs !== null
                  ? `${ipVerificationResult.directDurationMs} ms`
                  : '—'}
              </small>
            </div>
            <div>
              <span>{t('home.proxy.ipLabel')}</span>
              <strong dir="ltr">{ipVerificationResult.proxyIp ?? '—'}</strong>
              <small>
                {ipVerificationResult.proxyDurationMs !== null
                  ? `${ipVerificationResult.proxyDurationMs} ms`
                  : '—'}
              </small>
            </div>
          </div>
        </section>
      )}

      <section className="home-grid">
        <article className="panel-card">
          <div className="panel-heading">
            <div><span className="panel-kicker">{t('home.core.kicker')}</span><h3>{t('home.core.title')}</h3></div>
            <span className="panel-icon">◉</span>
          </div>
          <div className="connection-details">
            <DetailRow
              label={t('home.core.phase')}
              value={isConnected ? t('home.core.connected') : t('home.core.localProxy')}
            />
            <DetailRow
              label={t('home.core.port')}
              value={`${processStatus.localHost}:${processStatus.localPort}`}
              muted={!processStatus.ready}
            />
            <DetailRow
              label={t('home.core.engine')}
              value={engineInfo?.healthy ? `sing-box ${engineInfo.version}` : t('home.core.unavailable')}
              muted={!engineInfo?.healthy}
            />
            <DetailRow label={t('home.core.proxyStatus')} value={t('home.core.notEnabled')} muted />
            <DetailRow
              label={t('home.core.ipCheck')}
              value={
                isConnected
                  ? `${ipVerificationResult.directIp ?? '—'} → ${ipVerificationResult.proxyIp ?? '—'}`
                  : ipVerificationChecking
                    ? t('home.core.checking')
                    : processStatus.ready
                      ? t('home.core.unverified')
                      : t('home.core.pending')
              }
              muted={!isConnected}
            />
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-heading">
            <div><span className="panel-kicker">{t('home.direct.kicker')}</span><h3>{t('home.direct.title')}</h3></div>
            <button className="text-button" type="button" onClick={onOpenDirectSites}>{t('home.direct.manage')}</button>
          </div>
          <div className="domain-preview-list">
            {directDomains.slice(0, 3).map((domain) => (
              <DomainPreview domain={domain} key={domain} />
            ))}
            {directDomains.length === 0 && (
              <p className="empty-list-message">{t('home.direct.empty')}</p>
            )}
          </div>
          <button className="secondary-button" type="button" onClick={onOpenDirectSites}>
            {t('home.direct.viewAll')}
          </button>
        </article>

        <article className="panel-card rescue-preview-card">
          <div className="panel-heading">
            <div><span className="panel-kicker">{t('home.rescue.kicker')}</span><h3>{t('home.rescue.title')}</h3></div>
            <span className="rescue-badge">{t('home.rescue.badge')}</span>
          </div>
          <p>{t('home.rescue.desc')}</p>
          <button className="secondary-button" type="button" onClick={onOpenRescue}>
            {t('home.rescue.view')}
          </button>
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

        <LatencyBadge
          latencyMs={latencyMs}
          testing={testing}
        />
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

  const qualityClass =
    latencyMs <= 120
      ? 'latency-badge-good'
      : latencyMs <= 280
        ? 'latency-badge-medium'
        : 'latency-badge-slow'

  return (
    <span
      className={`latency-badge ${qualityClass}`}
      dir="ltr"
    >
      {latencyMs} ms
    </span>
  )
}

function DetailRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong
        className={
          muted ? 'muted-value' : ''
        }
      >
        {value}
      </strong>
    </div>
  )
}

function DomainPreview({
  domain,
}: {
  domain: string
}) {
  const t = useT()
  return (
    <div className="domain-preview">
      <span className="domain-preview-check">
        ✓
      </span>
      <span dir="ltr">{domain}</span>
      <small>{t('servers.direct')}</small>
    </div>
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

    setMessage({
      type: 'success',
      text: t('sub.success.delete'),
    })
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
  freePhase,
  onCheckConfig,
  onTestLatency,
  onSelectServer,
  onClearSelectedServer,
  onOpenSubscriptions,
  onConnectFreeNode,
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
}) {
  const t = useT()
  const [expandedServerId, setExpandedServerId] =
    useState<string | null>(null)

  const [switchConfirm, setSwitchConfirm] =
    useState<{ server: PublicServer } | null>(null)

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

  const sortedNodes = [...nodes].sort(
    (firstNode, secondNode) => {
      const firstResult =
        latencyResults[firstNode.id]
      const secondResult =
        latencyResults[secondNode.id]

      const firstRank =
        firstResult?.reachable &&
        typeof firstResult.latencyMs === 'number'
          ? firstResult.latencyMs
          : firstResult
            ? Number.MAX_SAFE_INTEGER - 1
            : Number.MAX_SAFE_INTEGER - 2

      const secondRank =
        secondResult?.reachable &&
        typeof secondResult.latencyMs === 'number'
          ? secondResult.latencyMs
          : secondResult
            ? Number.MAX_SAFE_INTEGER - 1
            : Number.MAX_SAFE_INTEGER - 2

      return firstRank - secondRank
    },
  )

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
            >
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

                    <button
                      className="inspect-subscription-button"
                      type="button"
                      disabled={
                        !node.valid ||
                        !node.subscriptionId ||
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

      {freePool.length > 0 && (
        <section className="free-pool-section">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker free-pool-kicker">مخزن رایگان</span>
              <h3>سرورهای رایگان ذخیره‌شده</h3>
            </div>
            <span className="status-pill">
              {freePool.length} سرور · مرتب‌شده بر اساس پینگ
            </span>
          </div>
          <div className="free-pool-list">
            {freePool.map((server, index) => (
              <div
                key={server.id}
                className="free-pool-row"
              >
                <span className="free-pool-rank">{index + 1}</span>
                <div className="free-pool-main">
                  <strong>{server.name}</strong>
                  <small dir="ltr">{server.protocol.toUpperCase()} · {server.host ?? '—'}{server.port ? `:${server.port}` : ''}</small>
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
  }
  onUpdate: (
    patch: Partial<{
      enabled: boolean
      recordFragment: boolean
      handshakeFragment: boolean
      fragmentFallbackDelay: string
      customSni: string
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
          <label className="appearance-option">
            <input
              type="radio"
              name="lang"
              value="de"
              checked={lang === 'de'}
              onChange={() => setLang('de')}
            />
            <span className="appearance-option-icon">🇩🇪</span>
            <span>{t('settings.langDe', 'Deutsch')}</span>
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

      <GitHubSection />

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
