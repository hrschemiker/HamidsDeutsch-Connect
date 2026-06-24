import {
  useCallback,
  useEffect,
  useState,
} from 'react'

export type SubscriptionSummary = {
  id: string
  name: string
  host: string
  createdAt: string
  updatedAt: string
}

type SubscriptionState = {
  loading: boolean
  subscriptions: SubscriptionSummary[]
  error: string | null
}

export type SubscriptionInspectionResult = {
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

export function useSubscriptions() {
  const [state, setState] =
    useState<SubscriptionState>({
      loading: true,
      subscriptions: [],
      error: null,
    })

  const refresh = useCallback(async () => {
    setState((currentState) => ({
      ...currentState,
      loading: true,
      error: null,
    }))

    try {
      if (
        !window.hamidsDeutsch?.subscriptions
      ) {
        setState({
          loading: false,
          subscriptions: [],
          error:
            'ارتباط امن با بخش اشتراک‌ها در دسترس نیست.',
        })

        return
      }

      const subscriptions =
        await window.hamidsDeutsch.subscriptions.list()

      setState({
        loading: false,
        subscriptions,
        error: null,
      })
    } catch (error) {
      setState({
        loading: false,
        subscriptions: [],
        error:
          error instanceof Error
            ? error.message
            : 'خواندن اشتراک‌ها با خطا مواجه شد.',
      })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const addSubscription = useCallback(
    async (
      name: string,
      url: string,
    ) => {
      try {
        const result =
          await window.hamidsDeutsch.subscriptions.add({
            name,
            url,
          })

        if (!result.success) {
          return {
            success: false as const,
            error: result.error,
          }
        }

        await refresh()

        return {
          success: true as const,
          error: null,
        }
      } catch (error) {
        return {
          success: false as const,
          error:
            error instanceof Error
              ? error.message
              : 'ثبت اشتراک با خطا مواجه شد.',
        }
      }
    },
    [refresh],
  )

  const removeSubscription = useCallback(
    async (subscriptionId: string) => {
      try {
        const result =
          await window.hamidsDeutsch.subscriptions.remove(
            subscriptionId,
          )

        if (!result.success) {
          return {
            success: false as const,
            error: result.error,
          }
        }

        await refresh()

        return {
          success: true as const,
          error: null,
        }
      } catch (error) {
        return {
          success: false as const,
          error:
            error instanceof Error
              ? error.message
              : 'حذف اشتراک با خطا مواجه شد.',
        }
      }
    },
    [refresh],
  )

    const inspectSubscription = useCallback(
    async (
      subscriptionId: string,
    ): Promise<SubscriptionInspectionResult> => {
      try {
        return await window.hamidsDeutsch
          .subscriptions
          .inspect(subscriptionId)
      } catch (error) {
        return {
          success: false,
          checkedAt: new Date().toISOString(),
          httpStatus: null,
          httpStatusText: null,
          contentType: null,
          responseSize: null,
          format: 'renderer-error',
          configCount: 0,
          error:
            error instanceof Error
              ? error.message
              : 'بررسی اشتراک با خطا مواجه شد.',
        }
      }
    },
    [],
  )

    return {
    loading: state.loading,
    subscriptions: state.subscriptions,
    error: state.error,
    refresh,
    addSubscription,
    removeSubscription,
    inspectSubscription,
  }
}