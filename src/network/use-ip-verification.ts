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
  directBlocked?: boolean
  unverifiedChange?: boolean
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
          directIp: null,
          proxyIp: null,
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
          directIp:
            nextResult.directIp,
          proxyIp:
            nextResult.proxyIp,
          unverifiedChange:
            nextResult.unverifiedChange === true,
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
          directIp: null,
          proxyIp: null,
          unverifiedChange: false,
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
    // `success` already means the tunnel carried real traffic. Requiring
    // `changed` on top of it left the app stuck on "disconnected" whenever the
    // direct probe was censored, even with a perfectly healthy tunnel.
    connected: result.success,
    verify,
    reset,
  }
}
