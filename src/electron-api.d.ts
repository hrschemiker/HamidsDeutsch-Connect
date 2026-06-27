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
      error: null
    }
  | {
      success: false
      checkedAt: string
      nodes: []
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

type FreeConnectResult = {
  success: boolean
  nodeId: string | null
  nodeName: string | null
  latencyMs: number | null
  error: string | null
}

type FreePoolMeta = {
  total: number
  displaying: number
  lastRefreshedAt: string | null
  sourceCount: number
}

type FreePoolResult = {
  success: boolean
  servers: FreePoolServer[]
  meta: FreePoolMeta | null
  error: string | null
}

type FreePoolStatusEvent = {
  poolCount: number
  poolDisplaying: number
  poolLastRefreshedAt: string | null
  poolRefreshing: boolean
}

type FreePoolUpdatedEvent = {
  count: number
  displaying: number
  refreshedAt: string
}

type FreeProgressEvent = {
  text: string
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
      }

      network: {
        verifyIpChange: () =>
          Promise<IpVerificationResult>

        getCurrentIp: () =>
          Promise<CurrentIpResult>
      }

      bpb: {
        getProfile: () =>
          Promise<BpbProfileResult>

        saveProfile: (
          input: BpbProfile,
        ) => Promise<BpbProfileResult>

        loadNodes: (
          type: BpbType,
        ) => Promise<BpbLoadNodesResult>

        connect: (
          input: BpbConnectInput,
        ) => Promise<BpbConnectResult>

        disconnect: () =>
          Promise<BpbDisconnectResult>

        getStatus: () =>
          Promise<BpbStatus>

        autoDiscover: (
          panelUrl?: string,
        ) => Promise<BpbAutoDiscoveryResult>

        quickConnect: (
          input?: {
            panelUrl?: string
            directDomains?: string[]
            rescueOptions?: RescueSettings | null
          },
        ) => Promise<BpbQuickConnectResult>

        cloudflare: {
          getStatus: () => Promise<{ connected: boolean; accountName: string | null; deployed: boolean; panelUrl: string | null; projectName: string | null }>
          login: () => Promise<{ success: boolean; accountId: string | null; accountName: string | null; error: string | null }>
          deploy: () => Promise<{ success: boolean; profile: BpbProfile | null; deployment: { projectName: string; kvId: string; panelUrl: string; workerSha256: string } | null; error: string | null }>
          updatePanel: () => Promise<{ success: boolean; panelUrl: string | null; error: string | null }>
          onProgress: (callback: (progress: { stage: string; message: string; at: string; panelUrl?: string }) => void) => () => void
        }
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
      }

      free: {
        fetchAndConnect: (input?: {
          directDomains?: string[]
          rescueOptions?: RescueOptions | null
        }) => Promise<FreeConnectResult>

        connectFromPool: (input?: {
          directDomains?: string[]
          rescueOptions?: RescueOptions | null
        }) => Promise<FreeConnectResult>

        disconnect: () => Promise<{ success: boolean; error: string | null }>

        getStatus: () => Promise<FreeConfigStatus>

        getPool: () => Promise<FreePoolResult>

        getPoolMeta: () => Promise<{ success: boolean; total: number; displaying: number; lastRefreshedAt: string | null; poolRefreshing: boolean; error: string | null }>

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

      geoblock: {
        test: () => Promise<GeoBlockResult>
      }

      history: {
        get: () => Promise<{ success: boolean; entries: ConnectionHistoryEntry[] }>
        append: (entry: Omit<ConnectionHistoryEntry, 'id'>) => Promise<{ success: boolean; error?: string }>
        clear: () => Promise<{ success: boolean; error?: string }>
      }

      startup: {
        getLoginItem: () => Promise<{ enabled: boolean; error: string | null }>
        setLoginItem: (enabled: boolean) => Promise<{ success: boolean; enabled: boolean; error: string | null }>
      }

      codespace: {
        getStatus: () => Promise<CodespaceStatus>

        setup: (token: string) => Promise<{
          success: boolean
          username: string | null
          error: string | null
        }>

        clearToken: () => Promise<{ success: boolean }>

        connect: (directDomains: string[]) => Promise<{
          success: boolean
          codespaceName: string | null
          host: string | null
          error: string | null
        }>

        disconnect: () => Promise<{
          success: boolean
          error: string | null
        }>

        onProgress: (
          callback: (payload: { step: string; message: string }) => void,
        ) => () => void
      }
    }
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
