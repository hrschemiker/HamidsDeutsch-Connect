import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

export type SubscriptionSource = {
  id: string
  name: string
}

export type SafeServerNode = {
  id: string
  nodeId: string
  subscriptionId: string
  subscriptionName: string
  name: string
  protocol: string
  host: string | null
  port: number | null
  transport: string | null
  tls: boolean
  security: string | null
  valid: boolean
}

type LoadResult = {
  success: boolean
  checkedAt: string
  nodes: SafeServerNode[]
  error: string | null
}

type HookState = {
  loading: boolean
  refreshingSubscriptionId: string | null
  checkedAt: string | null
  nodes: SafeServerNode[]
  error: string | null
  failedSubscriptionCount: number
}

const INITIAL_STATE: HookState = {
  loading: false,
  refreshingSubscriptionId: null,
  checkedAt: null,
  nodes: [],
  error: null,
  failedSubscriptionCount: 0,
}

function createCompositeNode(
  subscription: SubscriptionSource,
  node: {
    id: string
    name: string
    protocol: string
    host: string | null
    port: number | null
    transport: string | null
    tls: boolean
    security: string | null
    valid: boolean
  },
): SafeServerNode {
  return {
    ...node,
    id:
      `${subscription.id}::${node.id}`,
    nodeId: node.id,
    subscriptionId:
      subscription.id,
    subscriptionName:
      subscription.name,
  }
}

export function useServerNodes(
  subscriptions: SubscriptionSource[],
  subscriptionsLoading: boolean,
) {
  const [state, setState] =
    useState<HookState>(
      INITIAL_STATE,
    )

  const requestVersionRef =
    useRef(0)

  const subscriptionsRef =
    useRef<SubscriptionSource[]>(
      subscriptions,
    )

  const subscriptionsKey =
    useMemo(
      () =>
        subscriptions
          .map(
            (subscription) =>
              `${subscription.id}:${subscription.name}`,
          )
          .sort()
          .join('|'),
      [subscriptions],
    )

  useEffect(() => {
    subscriptionsRef.current =
      subscriptions
  }, [
    subscriptionsKey,
    subscriptions,
  ])

  const loadAll =
    useCallback(
      async (): Promise<LoadResult> => {
        const currentSubscriptions =
          subscriptionsRef.current

        const requestVersion =
          ++requestVersionRef.current

        if (
          currentSubscriptions.length === 0
        ) {
          const emptyResult: LoadResult = {
            success: true,
            checkedAt:
              new Date().toISOString(),
            nodes: [],
            error: null,
          }

          setState({
            ...INITIAL_STATE,
            checkedAt:
              emptyResult.checkedAt,
          })

          return emptyResult
        }

        setState((current) => ({
          ...current,
          loading: true,
          refreshingSubscriptionId:
            null,
          error: null,
        }))

        const results =
          await Promise.all(
            currentSubscriptions.map(
              async (
                subscription,
              ) => {
                try {
                  const result =
                    await window
                      .hamidsDeutsch
                      .subscriptions
                      .loadNodes(
                        subscription.id,
                      )

                  return {
                    subscription,
                    result,
                  }
                } catch (error) {
                  return {
                    subscription,
                    result: {
                      success: false as const,
                      checkedAt:
                        new Date().toISOString(),
                      nodes: [],
                      error:
                        error instanceof Error
                          ? error.message
                          : 'دریافت سرورها ناموفق بود.',
                    },
                  }
                }
              },
            ),
          )

        const nodes =
          results.flatMap(
            ({
              subscription,
              result,
            }) =>
              result.success
                ? result.nodes.map(
                    (node) =>
                      createCompositeNode(
                        subscription,
                        node,
                      ),
                  )
                : [],
          )

        const failures =
          results.filter(
            ({ result }) =>
              !result.success,
          )

        const checkedAt =
          results
            .map(
              ({ result }) =>
                result.checkedAt,
            )
            .filter(Boolean)
            .sort()
            .at(-1) ??
          new Date().toISOString()

        const allFailed =
          failures.length ===
            results.length &&
          results.length > 0

        const error =
          allFailed
            ? failures
                .map(
                  ({
                    subscription,
                    result,
                  }) =>
                    `${subscription.name}: ${
                      result.error ??
                      'خطای نامشخص'
                    }`,
                )
                .join(' | ')
            : null

        if (
          requestVersion ===
          requestVersionRef.current
        ) {
          setState({
            loading: false,
            refreshingSubscriptionId:
              null,
            checkedAt,
            nodes,
            error,
            failedSubscriptionCount:
              failures.length,
          })
        }

        return {
          success: !allFailed,
          checkedAt,
          nodes,
          error,
        }
      },
      [subscriptionsKey],
    )

  const loadFromSubscription =
    useCallback(
      async (
        subscriptionId: string,
      ): Promise<LoadResult> => {
        const subscription =
          subscriptionsRef.current.find(
            (item) =>
              item.id ===
              subscriptionId,
          )

        if (!subscription) {
          return {
            success: false,
            checkedAt:
              new Date().toISOString(),
            nodes: [],
            error:
              'اشتراک انتخاب‌شده پیدا نشد.',
          }
        }

        setState((current) => ({
          ...current,
          loading:
            current.nodes.length === 0,
          refreshingSubscriptionId:
            subscriptionId,
          error: null,
        }))

        try {
          const result =
            await window
              .hamidsDeutsch
              .subscriptions
              .loadNodes(
                subscriptionId,
              )

          if (!result.success) {
            setState((current) => ({
              ...current,
              loading: false,
              refreshingSubscriptionId:
                null,
              error:
                current.nodes.length ===
                0
                  ? result.error
                  : null,
              failedSubscriptionCount:
                current.failedSubscriptionCount +
                1,
            }))

            return {
              success: false,
              checkedAt:
                result.checkedAt,
              nodes: [],
              error:
                result.error,
            }
          }

          const nextNodes =
            result.nodes.map(
              (node) =>
                createCompositeNode(
                  subscription,
                  node,
                ),
            )

          setState((current) => ({
            ...current,
            loading: false,
            refreshingSubscriptionId:
              null,
            checkedAt:
              result.checkedAt,
            nodes: [
              ...current.nodes.filter(
                (node) =>
                  node.subscriptionId !==
                  subscriptionId,
              ),
              ...nextNodes,
            ],
            error: null,
            failedSubscriptionCount:
              Math.max(
                0,
                current.failedSubscriptionCount -
                  1,
              ),
          }))

          return {
            success: true,
            checkedAt:
              result.checkedAt,
            nodes: nextNodes,
            error: null,
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'دریافت سرورها ناموفق بود.'

          setState((current) => ({
            ...current,
            loading: false,
            refreshingSubscriptionId:
              null,
            error:
              current.nodes.length === 0
                ? message
                : null,
          }))

          return {
            success: false,
            checkedAt:
              new Date().toISOString(),
            nodes: [],
            error: message,
          }
        }
      },
      [subscriptionsKey],
    )

  useEffect(() => {
    if (subscriptionsLoading) {
      return
    }

    void loadAll()
  }, [
    loadAll,
    subscriptionsKey,
    subscriptionsLoading,
  ])

  return {
    ...state,
    subscriptionId:
      state.refreshingSubscriptionId,
    loadAll,
    loadFromSubscription,
  }
}
