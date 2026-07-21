export {}

type EngineInfo = {
  installed: boolean
  healthy: boolean
  path: string
  version: string | null
  architecture: string | null
  error: string | null
}

type EngineUpdateCheckResult = {
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
}

type EngineUpdateResult =
  EngineUpdateCheckResult & {
    updated: boolean
    installedVersion:
      | string
      | null
    installedPath?: string
    verifiedSha256?: string
    message: string | null
  }

type EngineProcessStatus = {
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

type EngineProcessResult =
  EngineProcessStatus & {
    success: boolean
    error: string | null
  }

type IpVerificationResult = {
  success: boolean
  checkedAt: string
  directIp: string | null
  proxyIp: string | null
  changed: boolean
  directDurationMs: number | null
  proxyDurationMs: number | null
  service: string
  error: string | null
  directBlocked?: boolean
}

type CurrentIpResult = {
  success: boolean
  checkedAt: string
  ip: string | null
  durationMs: number | null
  service: string | null
  error: string | null
}

type BpbType =
  | 'normal'
  | 'fragment'
  | 'raw'
  | 'warp'

type BpbProfile = {
  id: string
  name: string
  normalUrl: string
  fragmentUrl: string
  rawUrl: string
  warpUrl: string
  panelUrl: string
  subPath: string
  panelVersion: string | null
  chainEnabled: boolean
  optimizerEnabled: boolean
  optimizerAutoRefreshDays: number
  activeType: BpbType
  lastSuccessfulNodeId: string | null
  lastSuccessfulNodeName: string | null
  lastSuccessfulType: BpbType | null
  updatedAt: string | null
}

type BpbProfileResult = {
  success: boolean
  profile:
    | BpbProfile
    | null
  error: string | null
}

type BpbStatus = {
  running: boolean
  ready: boolean
  connected: boolean
  pid: number | null
  startedAt: string | null
  stoppedAt: string | null
  localHost: string
  localPort: number
  profileType:
    | BpbType
    | null
  nodeId: string | null
  nodeName: string | null
  lastError: string | null
  logTail: string
}

type BpbSourceMode =
  | 'uri-list'
  | 'sing-box-json'

type BpbLoadNodesResult = {
  success: boolean
  checkedAt: string
  type: BpbType
  mode:
    | BpbSourceMode
    | null
  nodes: SafeServerNode[]
  error: string | null
}

type BpbConnectInput = {
  type: BpbType
  nodeId:
    | string
    | null
  nodeUri?: string | null
  nodeName?: string | null
  directDomains: string[]
  rescueOptions?: RescueOptions
}

type BpbConnectResult = {
  success: boolean
  status: BpbStatus
  verification:
    | IpVerificationResult
    | null
  configPath: string | null
  error: string | null
}

type BpbDisconnectResult = {
  success: boolean
  status: BpbStatus
  error: string | null
}

type BpbWizardStatus = {
  running: boolean
  ready: boolean
  pid: number | null
  version: string | null
  executablePath: string | null
  startedAt: string | null
  stoppedAt: string | null
  exitCode: number | null
  lastError: string | null
  output: string
  panelUrl: string | null
  phase:
    | 'idle'
    | 'checking'
    | 'downloading'
    | 'ready'
    | 'running'
    | 'finished'
    | 'stopped'
    | 'error'
}

type BpbWizardEvent = {
  type:
    | 'status'
    | 'output'
    | 'input'
    | 'panel-url'
  at: string
  text?: string
  stream?: string
  panelUrl?: string
  status?: BpbWizardStatus
}

type BpbWizardEnsureResult = {
  success: boolean
  downloaded: boolean
  version: string | null
  executablePath: string | null
  error: string | null
}

type BpbWizardActionResult = {
  success: boolean
  status: BpbWizardStatus
  error: string | null
}

type BpbWizardInputResult = {
  success: boolean
  error: string | null
}

type BpbWizardOpenPanelResult = {
  success: boolean
  panelUrl: string | null
  error: string | null
}

type BpbAutoDiscoveryResult = {
  success: boolean
  panelUrl: string | null
  normalUrl: string
  fragmentUrl: string
  rawUrl: string
  warpUrl: string
  subPath: string | null
  panelVersion: string | null
  chainEnabled: boolean
  normalMode:
    | BpbSourceMode
    | null
  fragmentMode:
    | BpbSourceMode
    | null
  rawMode:
    | BpbSourceMode
    | null
  warpMode:
    | BpbSourceMode
    | null
  candidateCount?: number
  profile: BpbProfile | null
  error: string | null
}

type BpbQuickConnectResult = {
  success: boolean
  status: BpbStatus
  verification:
    | IpVerificationResult
    | null
  configPath: string | null
  selectedType:
    | BpbType
    | null
  selectedNodeId: string | null
  selectedNodeName: string | null
  error: string | null
}

type BpbOptimizerEndpoint = {
  id: string
  ip: string
  family: 4 | 6
  port: number
  latencyMs: number | null
  downloadMbps: number | null
  score: number | null
  colo: string | null
  testedAt: string
}

type BpbOptimizerState = {
  enabled: boolean
  scannedAt: string | null
  panelHost: string | null
  bestEndpoint:
    | BpbOptimizerEndpoint
    | null
  results: BpbOptimizerEndpoint[]
  source: 'cloudflare-official-ranges'
  error: string | null
}

type BpbOptimizerScanResult = {
  success: boolean
  state: BpbOptimizerState
  error: string | null
}

type BpbOptimizerActionResult = {
  success: boolean
  state: BpbOptimizerState
  error: string | null
}

type BpbOptimizerProgress = {
  running: boolean
  phase:
    | 'idle'
    | 'ranges'
    | 'latency'
    | 'speed'
    | 'done'
    | 'error'
  tested: number
  total: number
  reachable: number
  message: string
  at: string
}

type SubscriptionSummary = {
  id: string
  name: string
  host: string
  createdAt: string
  updatedAt: string
}

type AddSubscriptionInput = {
  name: string
  url: string
}

type AddSubscriptionResult =
  | {
      success: true
      subscription: SubscriptionSummary
      error: null
    }
  | {
      success: false
      subscription: null
      error: string
    }

type RemoveSubscriptionResult =
  | {
      success: true
      error: null
    }
  | {
      success: false
      error: string
    }

type SubscriptionInspectionResult = {
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

type SafeServerNode = {
  id: string
  uri?: string
  name: string
  protocol: string
  host: string | null
  port: number | null
  transport: string | null
  tls: boolean
  security: string | null
  valid: boolean
}

type LoadSubscriptionNodesResult =
  | {
      success: true
      checkedAt: string
      nodes: SafeServerNode[]
      subscriptionInfo?: SubscriptionInfo | null
      error: null
    }
  | {
      success: false
      checkedAt: string
      nodes: []
      subscriptionInfo?: null
      error: string
    }

type ServerLatencyInput = {
  id: string
  host: string | null
  port: number | null
}

type ServerLatencyItem = {
  id: string
  reachable: boolean
  latencyMs: number | null
  error: string | null
}

type ServerLatencyResult = {
  success: boolean
  checkedAt: string
  total: number
  reachable: number
  unreachable: number
  fastestServerId: string | null
  fastestLatencyMs: number | null
  results: ServerLatencyItem[]
  error: string | null
}


type RescueOptions = {
  enabled: boolean
  recordFragment: boolean
  handshakeFragment: boolean
  fragmentFallbackDelay: string
  customSni: string
  dpiBypassAuto?: boolean
  dpiBypass?: boolean
}

type CheckServerConfigInput = {
  subscriptionId: string
  nodeId: string
  directDomains: string[]
  rescueOptions?: RescueOptions
}

type CheckServerConfigResult = {
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

type FreeConfigPhase =
  | 'idle'
  | 'fetching'
  | 'testing'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

type FreeConfigStatus = {
  phase: FreeConfigPhase
  nodeId: string | null
  nodeName: string | null
  latencyMs: number | null
  error: string | null
  userDisconnected: boolean
}

type SplitApp = {
  name: string
  processName: string
  path: string
  icon: string | null
}

type FreePoolServer = {
  id: string
  uri: string
  protocol: string | null
  host: string | null
  port: number | null
  security: string | null
  country: string | null
  flag: string | null
  source: string | null
  working: boolean | null
  latencyMs: number | null
  lastTestedAt: string | null
  addedAt: string
}

type FreeConnectResult = {
  success: boolean
  nodeId: string | null
  error: string | null
}

type FreePoolMeta = {
  total: number
  working: number
  untested: number
  lastRefreshedAt: string | null
  channels: Record<string, number>
}

type FreePoolResult = {
  success: boolean
  servers: FreePoolServer[]
  meta: FreePoolMeta | null
  added?: number
  tested?: number
  removed?: number
  error: string | null
}

type FreePoolStatusEvent = {
  total: number
  working: number
  untested: number
  testing: boolean
  testDone: number
  testTotal: number
  lastRefreshedAt: string | null
}

type FreePoolUpdatedEvent = {
  added: number
}

type FreeProgressEvent = {
  message: string
  phase: FreeConfigPhase
}

type OpenExtensionFolderResult = {
  success: boolean
  path: string
  error: string | null
}

type ElevationResult = {
  success: boolean
  launched: boolean
  alreadyAdministrator: boolean
  error: string | null
}

type WindowsPrivilegeStatus = {
  supported: boolean
  isAdministrator: boolean
  platform: string
  error: string | null
}

type CheckTunConfigResult = {
  success: boolean
  checkedAt: string
  mode: 'tun'
  nodeId: string | null
  protocol: string | null
  server: string | null
  serverPort: number | null
  configPath: string | null
  interfaceName: string
  directDomainCount: number
  stdout: string
  error: string | null
}

declare global {
  interface Window {
    hamidsDeutsch: {
      appName: string
      platform: string

      system: {
        getPrivilegeStatus: () =>
          Promise<WindowsPrivilegeStatus>

        relaunchAsAdministrator: () =>
          Promise<ElevationResult>

        openVirtualLocationExtension: () =>
          Promise<OpenExtensionFolderResult>

        setVirtualLocationConnected: (
          connected: boolean,
        ) => Promise<{ success: boolean }>

        setDirectDomains: (
          domains: string[],
        ) => Promise<{ success: boolean }>

        downloadExtensionZip: () => Promise<{
          success: boolean
          path?: string
          error: string | null
        }>
      }

      engine: {
        getInfo: () =>
          Promise<EngineInfo>

        checkForUpdate: () =>
          Promise<EngineUpdateCheckResult>

        updateToLatest: () =>
          Promise<EngineUpdateResult>

        startLocalProxy: () =>
          Promise<EngineProcessResult>

        startTun: () =>
          Promise<EngineProcessResult>

        activateSystemProxy: () =>
          Promise<EngineProcessResult>

        deactivateSystemProxy: (
          keepLocalProxy?: boolean,
        ) => Promise<EngineProcessResult>

        stopLocalProxy: () =>
          Promise<EngineProcessResult>

        getProcessStatus: () =>
          Promise<EngineProcessStatus>

        getTraffic: () => Promise<{ up: number; down: number; connections: number }>
      }

      network: {
        verifyIpChange: () =>
          Promise<IpVerificationResult>

        getCurrentIp: () =>
          Promise<CurrentIpResult>
      }


      subscriptions: {
        list: () => Promise<
          SubscriptionSummary[]
        >

        add: (
          input:
            AddSubscriptionInput,
        ) => Promise<
          AddSubscriptionResult
        >

        remove: (
          subscriptionId: string,
        ) => Promise<
          RemoveSubscriptionResult
        >

        inspect: (
          subscriptionId: string,
        ) => Promise<
          SubscriptionInspectionResult
        >

        loadNodes: (
          subscriptionId: string,
        ) => Promise<
          LoadSubscriptionNodesResult
        >
      }

      servers: {
        testLatency: (
          servers:
            ServerLatencyInput[],
        ) => Promise<
          ServerLatencyResult
        >

        getNodeUri: (input: { subscriptionId: string; nodeId: string }) => Promise<{ success: boolean; uri: string | null }>

        checkConfig: (
          input:
            CheckServerConfigInput,
        ) => Promise<
          CheckServerConfigResult
        >

        checkTunConfig: (
          input:
            CheckServerConfigInput,
        ) => Promise<
          CheckTunConfigResult
        >

        addManualNode: (
          uri: string,
        ) => Promise<{
          success: boolean
          node?: { id: string; uri: string; addedAt: string }
          parsedNode?: {
            id: string
            name: string
            protocol: string
            host: string | null
            port: number | null
            transport: string | null
            tls: boolean
            security: string | null
            valid: boolean
          }
          error?: string
        }>

        removeManualNode: (
          nodeId: string,
        ) => Promise<{ success: boolean; error?: string }>

        hideNode: (
          compositeId: string,
        ) => Promise<{ success: boolean; error?: string }>

        unhideNode: (
          compositeId: string,
        ) => Promise<{ success: boolean; error?: string }>

        getHiddenNodes: () => Promise<string[]>
      }

      free: {
        crawl: () => Promise<FreePoolResult>

        testStart: () => Promise<FreePoolResult>

        connectSpecificNode: (input: {
          nodeId?: string
          nodeUri?: string
          directDomains?: string[]
          rescueOptions?: RescueOptions | null
        }) => Promise<FreeConnectResult>

        removeNode: (nodeId: string) => Promise<FreePoolResult>

        disconnect: () => Promise<{ success: boolean; error: string | null }>

        getStatus: () => Promise<FreeConfigStatus>

        getPool: () => Promise<FreePoolResult>

        onProgress: (
          callback: (payload: FreeProgressEvent) => void,
        ) => () => void

        onPoolUpdated: (
          callback: (payload: FreePoolUpdatedEvent) => void,
        ) => () => void

        onPoolStatus: (
          callback: (payload: FreePoolStatusEvent) => void,
        ) => () => void
      }

      speedtest: {
        run: () => Promise<{ success: boolean; mbps: number | null; bytes: number; elapsedSec: number; error: string | null }>
      }

      apps: {
        list: () => Promise<SplitApp[]>
        add: () => Promise<{ success: boolean; apps: SplitApp[] }>
        remove: (processName: string) => Promise<{ success: boolean; apps: SplitApp[] }>
      }

      killswitch: {
        get: () => Promise<{ enabled: boolean; active: boolean }>
        set: (enabled: boolean) => Promise<{ enabled: boolean; error?: string }>
        deactivate: () => Promise<{ success: boolean; error: string | null }>
        onActivated: (callback: (payload: { firewall: boolean }) => void) => () => void
        onDeactivated: (callback: (payload: unknown) => void) => () => void
      }

      geoblock: {
        test: () => Promise<GeoBlockResult>
      }

      history: {
        get: () => Promise<{ success: boolean; entries: ConnectionHistoryEntry[] }>
        append: (entry: Omit<ConnectionHistoryEntry, 'id'>) => Promise<{ success: boolean; error?: string }>
        clear: () => Promise<{ success: boolean; error?: string }>
      }

      updater: {
        onUpdateAvailable: (callback: (payload: { version: string; releaseNotes: string | null }) => void) => () => void
        onUpdateDownloaded: (callback: (payload: { version: string }) => void) => () => void
        installUpdate: () => Promise<void>
      }

      startup: {
        getLoginItem: () => Promise<{ enabled: boolean; error: string | null }>
        setLoginItem: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean; error: string | null }>
        getCloseToTray: () => Promise<{ enabled: boolean; error: string | null }>
        setCloseToTray: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean; error: string | null }>
      }

      doh: {
        getSettings: () => Promise<{
          standaloneDoHServer: 'off' | 'cloudflare' | 'cloudflare-family' | 'google' | 'adguard'
          proxyDoHEnabled: boolean
          standaloneActive: boolean
          error: string | null
        }>
        setStandalone: (server: 'off' | 'cloudflare' | 'cloudflare-family' | 'google' | 'adguard') => Promise<{
          success: boolean
          standaloneDoHServer: 'off' | 'cloudflare' | 'cloudflare-family' | 'google' | 'adguard'
          standaloneActive: boolean
          error: string | null
        }>
        setProxyDoH: (enabled: boolean) => Promise<{
          success: boolean
          proxyDoHEnabled: boolean
          error: string | null
        }>
      }



      tools: {
        cfScan: (input?: { port?: number }) => Promise<CfScanResult>
        getCfAutoScan: () => Promise<{ settings: { enabled: boolean; intervalHours: number }; cache: { bestIp: string | null; scannedAt: string } | null }>
        setCfAutoScan: (input: { enabled: boolean; intervalHours?: number }) => Promise<{ success: boolean }>
        getConverterBackends: () => Promise<{ backends: ConverterBackend[]; targets: ConverterTarget[] }>
        convertSubscription: (input: {
          subscriptionUrl: string
          backendId: string
          targetId: string
        }) => Promise<{ success: boolean; convertedContent?: string; convertUrl?: string; backend?: string; target?: string; error?: string }>
        getUpstreamProxy: () => Promise<{ success: boolean; settings: UpstreamProxySettings }>
        setUpstreamProxy: (settings: UpstreamProxySettings) => Promise<{ success: boolean; settings: UpstreamProxySettings; error?: string }>
        getUTlsSettings: () => Promise<{ success: boolean; settings: UTlsSettings }>
        setUTlsSettings: (settings: UTlsSettings) => Promise<{ success: boolean; settings: UTlsSettings; error?: string }>
      }

      settings: {
        export: () => Promise<{ success: boolean; data?: SettingsBackup; error?: string }>
        import: (backup: SettingsBackup) => Promise<{ success: boolean; error?: string }>
      }

    }
  }

  type WarpAccount = {
    privateKey: string
    publicKey: string
    peerPublicKey: string
    localAddresses: string[]
    endpointHost: string
    endpointPort: number
    reserved: number[]
    clientId: string
    createdAt: string
  }

  type CfScanResult = {
    success: boolean
    scannedAt?: string
    total?: number
    reachable?: number
    port?: number
    results?: Array<{ ip: string; latencyMs: number }>
    error?: string
  }

  type ConverterBackend = {
    id: string
    label: string
    url: string
  }

  type ConverterTarget = {
    id: string
    label: string
    value: string
  }

  type UpstreamProxySettings = {
    enabled: boolean
    type: 'socks5' | 'http'
    host: string
    port: number
  }

  type UTlsSettings = {
    globalFingerprint: 'auto' | 'chrome' | 'firefox' | 'safari' | 'ios' | 'android' | 'random' | 'randomized'
    echEnabled: boolean
    fragmentEnabled?: boolean
  }

  type SubscriptionInfo = {
    upload: number | null
    download: number | null
    total: number | null
    expire: string | null
  }

  type SettingsBackup = {
    version: number
    exportedAt: string
    files: Record<string, unknown>
  }
}

type GeoBlockTarget = {
  name: string
  domain: string
  accessible: boolean
  status: number | null
  error: string | null
}

type GeoBlockResult = {
  results: GeoBlockTarget[]
  testedAt: string
}

type ConnectionHistoryEntry = {
  id: string
  connectedAt: string
  disconnectedAt: string | null
  durationMs: number | null
  mode: string
  serverName: string | null
  protocol: string | null
  latencyMs: number | null
}

type CodespaceStatus = {
  hasToken: boolean
  username: string | null
  repoCreated: boolean
  lastCodespaceName: string | null
  lastCodespaceState: string | null
  lastConnectedUuid: string | null
}

