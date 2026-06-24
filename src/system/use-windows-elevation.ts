import {
  useCallback,
  useState,
} from 'react'

export function useWindowsElevation() {
  const [requesting, setRequesting] =
    useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const relaunch =
    useCallback(
      async () => {
        if (requesting) {
          return {
            success: false as const,
            launched: false,
            error:
              'درخواست دسترسی مدیر در حال انجام است.',
          }
        }

        setRequesting(true)
        setError(null)

        try {
          const result =
            await window.hamidsDeutsch
              .system
              .relaunchAsAdministrator()

          if (!result.success) {
            setError(
              result.error ??
              'اجرای مجدد با دسترسی مدیر ناموفق بود.',
            )
          }

          return result
        } catch (requestError) {
          const message =
            requestError instanceof Error
              ? requestError.message
              : 'اجرای مجدد با دسترسی مدیر ناموفق بود.'

          setError(message)

          return {
            success: false as const,
            launched: false,
            alreadyAdministrator: false,
            error: message,
          }
        } finally {
          setRequesting(false)
        }
      },
      [requesting],
    )

  return {
    requesting,
    error,
    relaunch,
  }
}
