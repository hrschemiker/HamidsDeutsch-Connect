import {
  useCallback,
  useState,
} from 'react'

export type IpVerificationResult = {
  success: boolean
  checkedAt: string
  directIp: string | null
  proxyIp: string | null
  changed: boolean
  directDurationMs: number | null
  proxyDurationMs: number | null
  service: string
  error: string | null
}

const INITIAL_RESULT: IpVerificationResult = {
  success: false,
  checkedAt: '',
  directIp: null,
  proxyIp: null,
  changed: false,
  directDurationMs: null,
  proxyDurationMs: null,
  service: 'api.ipify.org',
  error: null,
}

export function useIpVerification() {
  const [result, setResult] =
    useState<IpVerificationResult>(
      INITIAL_RESULT,
    )

  const [checking, setChecking] =
    useState(false)

  const verify = useCallback(
    async () => {
      if (checking) {
        return {
          success: false as const,
          changed: false,
          error:
            'بررسی IP در حال انجام است.',
        }
      }

      setChecking(true)

      try {
        const nextResult =
          await window.hamidsDeutsch
            .network
            .verifyIpChange()

        setResult(nextResult)

        return {
          success:
            nextResult.success,
          changed:
            nextResult.changed,
          error:
            nextResult.error,
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'بررسی تغییر IP ناموفق بود.'

        const failedResult: IpVerificationResult = {
          ...INITIAL_RESULT,
          checkedAt:
            new Date().toISOString(),
          error: message,
        }

        setResult(failedResult)

        return {
          success: false as const,
          changed: false,
          error: message,
        }
      } finally {
        setChecking(false)
      }
    },
    [checking],
  )

  const reset = useCallback(() => {
    setResult(INITIAL_RESULT)
  }, [])

  return {
    result,
    checking,
    connected:
      result.success &&
      result.changed,
    verify,
    reset,
  }
}
