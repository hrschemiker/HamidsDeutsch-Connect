export {}

type EngineInfo = {
  installed: boolean
  healthy: boolean
  path: string
  version: string | null
  architecture: string | null
  error: string | null
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

type CheckServerConfigInput = {
  subscriptionId: string
  nodeId: string
  directDomains: string[]
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
      }

      engine: {
        getInfo: () =>
          Promise<EngineInfo>

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
    }
  }
}
