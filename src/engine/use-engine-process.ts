import {
  useCallback,
  useEffect,
  useState,
} from 'react'

export type EngineProcessStatus = {
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

const INITIAL_STATUS: EngineProcessStatus = {
  running: false,
  ready: false,
  systemProxyEnabled: false,
  tunEnabled: false,
  connectionMode: null,
  pid: null,
  startedAt: null,
  stoppedAt: null,
  localHost: '127.0.0.1',
  localPort: 2080,
  lastExitCode: null,
  lastSignal: null,
  lastError: null,
  logTail: '',
}

type ActionResult = {
  success: boolean
  error: string | null
}

export function useEngineProcess() {
  const [status, setStatus] =
    useState<EngineProcessStatus>(
      INITIAL_STATUS,
    )

  const [starting, setStarting] =
    useState(false)

  const [stopping, setStopping] =
    useState(false)

  const [
    changingSystemProxy,
    setChangingSystemProxy,
  ] = useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const applyProcessResult =
    useCallback(
      (
        result:
          | (EngineProcessStatus & {
              success: boolean
              error: string | null
            })
          | null,
        fallbackError: string,
      ): ActionResult => {
        if (!result) {
          setError(fallbackError)

          return {
            success: false,
            error: fallbackError,
          }
        }

        const {
          success,
          error: resultError,
          ...nextStatus
        } = result

        setStatus(nextStatus)

        if (!success) {
          const message =
            resultError ??
            fallbackError

          setError(message)

          return {
            success: false,
            error: message,
          }
        }

        setError(null)

        return {
          success: true,
          error: null,
        }
      },
      [],
    )

  const refreshStatus = useCallback(
    async () => {
      try {
        const nextStatus =
          await window.hamidsDeutsch
            .engine
            .getProcessStatus()

        setStatus(nextStatus)

        if (nextStatus.lastError) {
          setError(
            nextStatus.lastError,
          )
        }

        return nextStatus
      } catch (refreshError) {
        const message =
          refreshError instanceof Error
            ? refreshError.message
            : 'خواندن وضعیت sing-box ناموفق بود.'

        setError(message)

        return null
      }
    },
    [],
  )

  const start = useCallback(
    async () => {
      if (
        starting ||
        stopping ||
        changingSystemProxy
      ) {
        return {
          success: false as const,
          error:
            'یک عملیات دیگر در حال انجام است.',
        }
      }

      setStarting(true)
      setError(null)

      try {
        const result =
          await window.hamidsDeutsch
            .engine
            .startLocalProxy()

        return applyProcessResult(
          result,
          'اجرای پروکسی محلی ناموفق بود.',
        )
      } catch (startError) {
        const message =
          startError instanceof Error
            ? startError.message
            : 'اجرای پروکسی محلی ناموفق بود.'

        setError(message)

        return {
          success: false as const,
          error: message,
        }
      } finally {
        setStarting(false)
      }
    },
    [
      applyProcessResult,
      changingSystemProxy,
      starting,
      stopping,
    ],
  )

  const startTun =
    useCallback(
      async () => {
        if (
          starting ||
          stopping ||
          changingSystemProxy
        ) {
          return {
            success: false as const,
            error:
              'یک عملیات دیگر در حال انجام است.',
          }
        }

        setStarting(true)
        setError(null)

        try {
          const result =
            await window.hamidsDeutsch
              .engine
              .startTun()

          return applyProcessResult(
            result,
            'اجرای TUN ناموفق بود.',
          )
        } catch (actionError) {
          const message =
            actionError instanceof Error
              ? actionError.message
              : 'اجرای TUN ناموفق بود.'

          setError(message)

          return {
            success: false as const,
            error: message,
          }
        } finally {
          setStarting(false)
        }
      },
      [
        applyProcessResult,
        changingSystemProxy,
        starting,
        stopping,
      ],
    )

  const enableSystemProxy =
    useCallback(
      async () => {
        if (
          starting ||
          stopping ||
          changingSystemProxy
        ) {
          return {
            success: false as const,
            error:
              'یک عملیات دیگر در حال انجام است.',
          }
        }

        setChangingSystemProxy(true)
        setError(null)

        try {
          const result =
            await window.hamidsDeutsch
              .engine
              .activateSystemProxy()

          return applyProcessResult(
            result,
            'فعال‌سازی System Proxy ناموفق بود.',
          )
        } catch (actionError) {
          const message =
            actionError instanceof Error
              ? actionError.message
              : 'فعال‌سازی System Proxy ناموفق بود.'

          setError(message)

          return {
            success: false as const,
            error: message,
          }
        } finally {
          setChangingSystemProxy(
            false,
          )
        }
      },
      [
        applyProcessResult,
        changingSystemProxy,
        starting,
        stopping,
      ],
    )

  const disableSystemProxy =
    useCallback(
      async (
        keepLocalProxy = false,
      ) => {
        if (
          starting ||
          stopping ||
          changingSystemProxy
        ) {
          return {
            success: false as const,
            error:
              'یک عملیات دیگر در حال انجام است.',
          }
        }

        setChangingSystemProxy(true)
        setError(null)

        try {
          const result =
            await window.hamidsDeutsch
              .engine
              .deactivateSystemProxy(
                keepLocalProxy,
              )

          return applyProcessResult(
            result,
            'غیرفعال‌سازی System Proxy ناموفق بود.',
          )
        } catch (actionError) {
          const message =
            actionError instanceof Error
              ? actionError.message
              : 'غیرفعال‌سازی System Proxy ناموفق بود.'

          setError(message)

          return {
            success: false as const,
            error: message,
          }
        } finally {
          setChangingSystemProxy(
            false,
          )
        }
      },
      [
        applyProcessResult,
        changingSystemProxy,
        starting,
        stopping,
      ],
    )

  const stop = useCallback(
    async () => {
      if (
        starting ||
        stopping ||
        changingSystemProxy
      ) {
        return {
          success: false as const,
          error:
            'یک عملیات دیگر در حال انجام است.',
        }
      }

      setStopping(true)
      setError(null)

      try {
        const result =
          await window.hamidsDeutsch
            .engine
            .stopLocalProxy()

        return applyProcessResult(
          result,
          'توقف پروکسی محلی ناموفق بود.',
        )
      } catch (stopError) {
        const message =
          stopError instanceof Error
            ? stopError.message
            : 'توقف پروکسی محلی ناموفق بود.'

        setError(message)

        return {
          success: false as const,
          error: message,
        }
      } finally {
        setStopping(false)
      }
    },
    [
      applyProcessResult,
      changingSystemProxy,
      starting,
      stopping,
    ],
  )

  useEffect(() => {
    void refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!status.running) {
      return
    }

    const intervalId =
      window.setInterval(() => {
        void refreshStatus()
      }, 1000)

    return () => {
      window.clearInterval(
        intervalId,
      )
    }
  }, [
    refreshStatus,
    status.running,
  ])

  return {
    status,
    starting,
    stopping,
    changingSystemProxy,
    busy:
      starting ||
      stopping ||
      changingSystemProxy,
    error,
    start,
    startTun,
    stop,
    enableSystemProxy,
    disableSystemProxy,
    refreshStatus,
  }
}
