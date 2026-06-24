import {
  useCallback,
  useState,
} from 'react'

export type ConnectionModePreference =
  | 'auto'
  | 'tun'
  | 'system-proxy'

export type ConnectionSettings = {
  mode: ConnectionModePreference
  allowFallback: boolean
}

const STORAGE_KEY =
  'hamidsdeutsch:connection-settings:v1'

const DEFAULT_SETTINGS:
  ConnectionSettings = {
    mode: 'auto',
    allowFallback: true,
  }

function readSettings():
  ConnectionSettings {
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
        Partial<ConnectionSettings>

    const mode:
      ConnectionModePreference =
        parsed.mode === 'tun' ||
        parsed.mode ===
          'system-proxy'
          ? parsed.mode
          : 'auto'

    return {
      mode,
      allowFallback:
        parsed.allowFallback !==
        false,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function useConnectionSettings() {
  const [settings, setSettings] =
    useState<ConnectionSettings>(
      () => readSettings(),
    )

  const update = useCallback(
    (
      patch:
        Partial<ConnectionSettings>,
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
      setSettings(
        DEFAULT_SETTINGS,
      )

      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(
          DEFAULT_SETTINGS,
        ),
      )
    },
    [],
  )

  return {
    settings,
    update,
    reset,
  }
}
