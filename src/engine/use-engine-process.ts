import {
  useCallback,
  useEffect,
  useState,
} from 'react'

export type EngineProcessStatus = {
  running: boolean
  ready: boolean
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

export function useEngineProcess() {
  const [status, setStatus] =
    useState<EngineProcessStatus>(
      INITIAL_STATUS,
    )

  const [starting, setStarting] =
    useState(false)

  const [stopping, setStopping] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

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
        stopping
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

        const {
          success,
          error: resultError,
          ...nextStatus
        } = result

        setStatus(nextStatus)

        if (!success) {
          const message =
            resultError ??
            'اجرای پروکسی محلی ناموفق بود.'

          setError(message)

          return {
            success: false as const,
            error: message,
          }
        }

        return {
          success: true as const,
          error: null,
        }
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
      starting,
      stopping,
    ],
  )

  const stop = useCallback(
    async () => {
      if (
        starting ||
        stopping
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

        const {
          success,
          error: resultError,
          ...nextStatus
        } = result

        setStatus(nextStatus)

        if (!success) {
          const message =
            resultError ??
            'توقف پروکسی محلی ناموفق بود.'

          setError(message)

          return {
            success: false as const,
            error: message,
          }
        }

        return {
          success: true as const,
          error: null,
        }
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
    busy:
      starting || stopping,
    error,
    start,
    stop,
    refreshStatus,
  }
}
