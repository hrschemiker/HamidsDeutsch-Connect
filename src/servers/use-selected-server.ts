import {
  useCallback,
  useEffect,
  useState,
} from 'react'

const STORAGE_KEY =
  'hamidsdeutsch:selected-server:v2'

const LEGACY_STORAGE_KEYS = [
  'hamidsdeutsch:selected-server',
  'hamidsDeutsch:selectedServer',
  'selectedServer',
]

export type SelectedServer = {
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
}

function isSelectedServer(
  value: unknown,
): value is SelectedServer {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return false
  }

  const server =
    value as Record<
      string,
      unknown
    >

  return (
    typeof server.id === 'string' &&
    typeof server.nodeId === 'string' &&
    typeof server.subscriptionId === 'string' &&
    typeof server.subscriptionName === 'string' &&
    typeof server.name === 'string' &&
    typeof server.protocol === 'string' &&
    (
      server.host === null ||
      typeof server.host === 'string'
    ) &&
    (
      server.port === null ||
      typeof server.port === 'number'
    ) &&
    (
      server.transport === null ||
      typeof server.transport === 'string'
    ) &&
    typeof server.tls === 'boolean'
  )
}

function readStoredServer():
  SelectedServer | null {
  try {
    const raw =
      window.localStorage.getItem(
        STORAGE_KEY,
      )

    if (raw) {
      const parsed =
        JSON.parse(raw)

      if (isSelectedServer(parsed)) {
        return parsed
      }
    }

    for (
      const legacyKey of
        LEGACY_STORAGE_KEYS
    ) {
      const legacyRaw =
        window.localStorage.getItem(
          legacyKey,
        )

      if (!legacyRaw) {
        continue
      }

      const parsed =
        JSON.parse(legacyRaw)

      if (
        parsed &&
        typeof parsed === 'object' &&
        typeof parsed.id === 'string' &&
        typeof parsed.name === 'string'
      ) {
        const legacyServer =
          parsed as Record<
            string,
            unknown
          >

        const migrated:
          SelectedServer = {
            id:
              String(
                legacyServer.id,
              ),
            nodeId:
              typeof legacyServer.nodeId ===
                'string'
                ? legacyServer.nodeId
                : String(
                    legacyServer.id,
                  ),
            subscriptionId:
              typeof legacyServer.subscriptionId ===
                'string'
                ? legacyServer.subscriptionId
                : '',
            subscriptionName:
              typeof legacyServer.subscriptionName ===
                'string'
                ? legacyServer.subscriptionName
                : 'اشتراک قبلی',
            name:
              String(
                legacyServer.name,
              ),
            protocol:
              typeof legacyServer.protocol ===
                'string'
                ? legacyServer.protocol
                : 'unknown',
            host:
              typeof legacyServer.host ===
                'string'
                ? legacyServer.host
                : null,
            port:
              typeof legacyServer.port ===
                'number'
                ? legacyServer.port
                : null,
            transport:
              typeof legacyServer.transport ===
                'string'
                ? legacyServer.transport
                : null,
            tls:
              Boolean(
                legacyServer.tls,
              ),
          }

        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(
            migrated,
          ),
        )

        return migrated
      }
    }
  } catch {
    return null
  }

  return null
}

export function useSelectedServer() {
  const [
    selectedServer,
    setSelectedServer,
  ] = useState<
    SelectedServer | null
  >(() => readStoredServer())

  const selectServer =
    useCallback(
      (
        server:
          SelectedServer,
      ) => {
        setSelectedServer(
          server,
        )

        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(
            server,
          ),
        )
      },
      [],
    )

  const clearSelectedServer =
    useCallback(
      () => {
        setSelectedServer(
          null,
        )

        window.localStorage.removeItem(
          STORAGE_KEY,
        )

        for (
          const legacyKey of
            LEGACY_STORAGE_KEYS
        ) {
          window.localStorage.removeItem(
            legacyKey,
          )
        }
      },
      [],
    )

  useEffect(() => {
    const handleStorage =
      (
        event:
          StorageEvent,
      ) => {
        if (
          event.key !==
          STORAGE_KEY
        ) {
          return
        }

        setSelectedServer(
          readStoredServer(),
        )
      }

    window.addEventListener(
      'storage',
      handleStorage,
    )

    return () => {
      window.removeEventListener(
        'storage',
        handleStorage,
      )
    }
  }, [])

  return {
    selectedServer,
    selectServer,
    clearSelectedServer,
  }
}
