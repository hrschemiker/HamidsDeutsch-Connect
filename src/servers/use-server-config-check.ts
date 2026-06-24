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
      directDomains,
    }: {
      subscriptionId: string | null
      nodeId: string
      directDomains: string[]
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
            'اشتراک فعال برای این سرور مشخص نیست.',
        }

        setState((current) => ({
          checkingNodeId: null,
          results: {
            ...current.results,
            [nodeId]: result,
          },
        }))

        return result
      }

      setState((current) => ({
        ...current,
        checkingNodeId: nodeId,
      }))

      try {
        const result =
          await window.hamidsDeutsch
            .servers
            .checkConfig({
              subscriptionId,
              nodeId,
              directDomains,
            })

        setState((current) => ({
          checkingNodeId: null,
          results: {
            ...current.results,
            [nodeId]: result,
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
            [nodeId]: result,
          },
        }))

        return result
      }
    },
    [],
  )

  const clearResult = useCallback(
    (nodeId: string) => {
      setState((current) => {
        const nextResults = {
          ...current.results,
        }

        delete nextResults[nodeId]

        return {
          ...current,
          results: nextResults,
        }
      })
    },
    [],
  )

  return {
    checkingNodeId:
      state.checkingNodeId,
    results: state.results,
    checkConfig,
    clearResult,
  }
}
