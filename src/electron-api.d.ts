export {}

type EngineInfo = {
  installed: boolean
  healthy: boolean
  path: string
  version: string | null
  architecture: string | null
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

declare global {
  interface Window {
    hamidsDeutsch: {
      appName: string
      platform: string

      engine: {
        getInfo: () => Promise<EngineInfo>
      }

      subscriptions: {
        list: () => Promise<
          SubscriptionSummary[]
        >

        add: (
          input: AddSubscriptionInput,
        ) => Promise<AddSubscriptionResult>

        remove: (
          subscriptionId: string,
        ) => Promise<RemoveSubscriptionResult>

        inspect: (
          subscriptionId: string,
        ) => Promise<SubscriptionInspectionResult>

        loadNodes: (
          subscriptionId: string,
        ) => Promise<LoadSubscriptionNodesResult>
      }

      servers: {
        testLatency: (
          servers: ServerLatencyInput[],
        ) => Promise<ServerLatencyResult>
      }
    }
  }
}