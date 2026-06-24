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
      }
    }
  }
}