import {
  useCallback,
  useState,
} from 'react'

const STORAGE_KEY =
  'hamidsdeutsch:rescue-settings:v1'

export type RescueSettings = {
  enabled: boolean
  recordFragment: boolean
  handshakeFragment: boolean
  fragmentFallbackDelay: string
  customSni: string
  dpiBypassAuto: boolean
}

const DEFAULT_SETTINGS:
  RescueSettings = {
    enabled: false,
    recordFragment: true,
    handshakeFragment: false,
    fragmentFallbackDelay:
      '500ms',
    customSni: '',
    dpiBypassAuto: true,
  }

function readSettings():
  RescueSettings {
  try {
    const raw =
      window.localStorage.getItem(
        STORAGE_KEY,
      )

    if (!raw) {
      return DEFAULT_SETTINGS
    }

    const parsed =
      JSON.parse(raw) as
        Partial<RescueSettings>

    return {
      enabled:
        Boolean(
          parsed.enabled,
        ),
      recordFragment:
        parsed.recordFragment !==
          false,
      handshakeFragment:
        Boolean(
          parsed.handshakeFragment,
        ),
      fragmentFallbackDelay:
        typeof parsed.fragmentFallbackDelay ===
          'string' &&
        parsed.fragmentFallbackDelay.trim()
          ? parsed.fragmentFallbackDelay.trim()
          : '500ms',
      customSni:
        typeof parsed.customSni ===
          'string'
          ? parsed.customSni.trim()
          : '',
      dpiBypassAuto:
        parsed.dpiBypassAuto !== false,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function useRescueSettings() {
  const [settings, setSettings] =
    useState<RescueSettings>(
      () => readSettings(),
    )

  const save = useCallback(
    (
      next:
        RescueSettings,
    ) => {
      setSettings(next)

      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(next),
      )
    },
    [],
  )

  const update = useCallback(
    (
      patch:
        Partial<RescueSettings>,
    ) => {
      setSettings(
        (current) => {
          const next = {
            ...current,
            ...patch,
          }

          window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(next),
          )

          return next
        },
      )
    },
    [],
  )

  const reset = useCallback(
    () => {
      save(
        DEFAULT_SETTINGS,
      )
    },
    [save],
  )

  return {
    settings,
    update,
    reset,
  }
}
