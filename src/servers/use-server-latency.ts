import {
  useCallback,
  useMemo,
  useState,
} from 'react'

import type {
  SafeServerNode,
} from './use-server-nodes'

export type ServerLatencyItem = {
  id: string
  reachable: boolean
  latencyMs: number | null
  error: string | null
}

type ServerLatencyState = {
  testing: boolean
  checkedAt: string | null
  fastestServerId: string | null
  fastestLatencyMs: number | null
  results: Record<
    string,
    ServerLatencyItem
  >
  error: string | null
}

export function useServerLatency(
  nodes: SafeServerNode[],
) {
  const [state, setState] =
    useState<ServerLatencyState>({
      testing: false,
      checkedAt: null,
      fastestServerId: null,
      fastestLatencyMs: null,
      results: {},
      error: null,
    })

  const validNodes = useMemo(
    () =>
      nodes.filter(
        (node) =>
          node.valid &&
          Boolean(node.host) &&
          Boolean(node.port),
      ),
    [nodes],
  )

  const testAll = useCallback(
    async () => {
      if (validNodes.length === 0) {
        setState({
          testing: false,
          checkedAt: null,
          fastestServerId: null,
          fastestLatencyMs: null,
          results: {},
          error:
            'سرور معتبری برای تست وجود ندارد.',
        })

        return {
          success: false as const,
          error:
            'سرور معتبری برای تست وجود ندارد.',
        }
      }

      setState((currentState) => ({
        ...currentState,
        testing: true,
        error: null,
      }))

      try {
        const result =
          await window.hamidsDeutsch
            .servers
            .testLatency(
              validNodes.map(
                (node) => ({
                  id: node.id,
                  host: node.host,
                  port: node.port,
                }),
              ),
            )

        const resultMap = Object.fromEntries(
          result.results.map(
            (item) => [
              item.id,
              item,
            ],
          ),
        )

        setState({
          testing: false,
          checkedAt:
            result.checkedAt,
          fastestServerId:
            result.fastestServerId,
          fastestLatencyMs:
            result.fastestLatencyMs,
          results: resultMap,
          error: result.error,
        })

        return result.success
          ? {
              success: true as const,
              error: null,
            }
          : {
              success: false as const,
              error:
                result.error ??
                'تست تأخیر ناموفق بود.',
            }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'تست تأخیر سرورها ناموفق بود.'

        setState({
          testing: false,
          checkedAt: null,
          fastestServerId: null,
          fastestLatencyMs: null,
          results: {},
          error: message,
        })

        return {
          success: false as const,
          error: message,
        }
      }
    },
    [validNodes],
  )

  return {
    testing: state.testing,
    checkedAt: state.checkedAt,
    fastestServerId:
      state.fastestServerId,
    fastestLatencyMs:
      state.fastestLatencyMs,
    results: state.results,
    error: state.error,
    testAll,
  }
}