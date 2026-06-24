import {
  useCallback,
  useEffect,
  useState,
} from 'react'

export type WindowsPrivilegeStatus = {
  supported: boolean
  isAdministrator: boolean
  platform: string
  error: string | null
}

const INITIAL_STATUS: WindowsPrivilegeStatus = {
  supported: false,
  isAdministrator: false,
  platform: 'unknown',
  error: null,
}

export function useWindowsPrivilege() {
  const [status, setStatus] =
    useState<WindowsPrivilegeStatus>(
      INITIAL_STATUS,
    )

  const [loading, setLoading] =
    useState(true)

  const refresh = useCallback(
    async () => {
      setLoading(true)

      try {
        const nextStatus =
          await window.hamidsDeutsch
            .system
            .getPrivilegeStatus()

        setStatus(nextStatus)

        return nextStatus
      } catch (error) {
        const failedStatus: WindowsPrivilegeStatus = {
          supported: false,
          isAdministrator: false,
          platform:
            window.hamidsDeutsch.platform,
          error:
            error instanceof Error
              ? error.message
              : 'بررسی سطح دسترسی ویندوز ناموفق بود.',
        }

        setStatus(failedStatus)

        return failedStatus
      } finally {
        setLoading(false)
      }
    },
    [],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    status,
    loading,
    refresh,
  }
}
