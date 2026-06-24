export {}

type EngineInfo = {
  installed: boolean
  healthy: boolean
  path: string
  version: string | null
  architecture: string | null
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
    }
  }
}