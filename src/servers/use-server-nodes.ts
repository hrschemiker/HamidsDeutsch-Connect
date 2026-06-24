import { useCallback, useState } from 'react'

export type SafeServerNode = {
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

type ServerNodesState = {
  loading: boolean
  nodes: SafeServerNode[]
  subscriptionId: string | null
  error: string | null
  checkedAt: string | null
}

export function useServerNodes() {
  const [state, setState] =
    useState<ServerNodesState>({
      loading: false,
      nodes: [],
      subscriptionId: null,
      error: null,
      checkedAt: null,
    })

  const loadFromSubscription =
    useCallback(
      async (subscriptionId: string) => {
        setState((currentState) => ({
          ...currentState,
          loading: true,
          error: null,
        }))

        try {
          const result =
            await window.hamidsDeutsch
              .subscriptions
              .loadNodes(subscriptionId)

          if (!result.success) {
            setState({
              loading: false,
              nodes: [],
              subscriptionId,
              error: result.error,
              checkedAt:
                result.checkedAt,
            })

            return {
              success: false as const,
              error: result.error,
            }
          }

          setState({
            loading: false,
            nodes: result.nodes,
            subscriptionId,
            error: null,
            checkedAt:
              result.checkedAt,
          })

          return {
            success: true as const,
            error: null,
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'دریافت سرورها با خطا مواجه شد.'

          setState({
            loading: false,
            nodes: [],
            subscriptionId,
            error: message,
            checkedAt: null,
          })

          return {
            success: false as const,
            error: message,
          }
        }
      },
      [],
    )

  return {
    loading: state.loading,
    nodes: state.nodes,
    subscriptionId:
      state.subscriptionId,
    error: state.error,
    checkedAt: state.checkedAt,
    loadFromSubscription,
  }
}