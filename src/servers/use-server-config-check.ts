import {
  useCallback,
  useState,
} from 'react'

type ConfigCheckResult = {
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

type ConfigCheckState = {
  checkingNodeId: string | null
  results: Record<
    string,
    ConfigCheckResult
  >
}

export function useServerConfigCheck() {
  const [state, setState] =
    useState<ConfigCheckState>({
      checkingNodeId: null,
      results: {},
    })

  const checkConfig = useCallback(
    async ({
      subscriptionId,
      nodeId,
      resultKey = nodeId,
      directDomains,
      rescueOptions,
    }: {
      subscriptionId: string | null
      nodeId: string
      resultKey?: string
      directDomains: string[]
      rescueOptions?: {
        enabled: boolean
        recordFragment: boolean
        handshakeFragment: boolean
        fragmentFallbackDelay: string
        customSni: string
      }
    }) => {
      if (!subscriptionId) {
        const result: ConfigCheckResult = {
          success: false,
          checkedAt:
            new Date().toISOString(),
          nodeId,
          protocol: null,
          server: null,
          serverPort: null,
          configPath: null,
          directDomainCount: 0,
          stdout: '',
          error:
            'اشتراک این سرور مشخص نیست.',
        }

        setState((current) => ({
          checkingNodeId: null,
          results: {
            ...current.results,
            [resultKey]: result,
          },
        }))

        return result
      }

      setState((current) => ({
        ...current,
        checkingNodeId:
          resultKey,
      }))

      try {
        const result =
          await window.hamidsDeutsch
            .servers
            .checkConfig({
              subscriptionId,
              nodeId,
              directDomains,
              rescueOptions,
            })

        setState((current) => ({
          checkingNodeId: null,
          results: {
            ...current.results,
            [resultKey]: result,
          },
        }))

        return result
      } catch (error) {
        const result: ConfigCheckResult = {
          success: false,
          checkedAt:
            new Date().toISOString(),
          nodeId,
          protocol: null,
          server: null,
          serverPort: null,
          configPath: null,
          directDomainCount: 0,
          stdout: '',
          error:
            error instanceof Error
              ? error.message
              : 'بررسی کانفیگ ناموفق بود.',
        }

        setState((current) => ({
          checkingNodeId: null,
          results: {
            ...current.results,
            [resultKey]: result,
          },
        }))

        return result
      }
    },
    [],
  )

  const clearResult = useCallback(
    (resultKey: string) => {
      setState((current) => {
        const nextResults = {
          ...current.results,
        }

        delete nextResults[
          resultKey
        ]

        return {
          ...current,
          results:
            nextResults,
        }
      })
    },
    [],
  )

  return {
    checkingNodeId:
      state.checkingNodeId,
    results:
      state.results,
    checkConfig,
    clearResult,
  }
}
