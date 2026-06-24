import {
  useCallback,
  useEffect,
  useState,
} from 'react'

export type SelectedServer = {
  id: string
  name: string
  protocol: string
  host: string | null
  port: number | null
  transport: string | null
  tls: boolean
}

const STORAGE_KEY =
  'hamidsdeutsch-connect.selected-server'

function loadSelectedServer():
  | SelectedServer
  | null {
  try {
    const storedValue =
      window.localStorage.getItem(
        STORAGE_KEY,
      )

    if (!storedValue) {
      return null
    }

    const parsedValue: unknown =
      JSON.parse(storedValue)

    if (
      !parsedValue ||
      typeof parsedValue !== 'object'
    ) {
      return null
    }

    const candidate =
      parsedValue as Partial<SelectedServer>

    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.name !== 'string' ||
      typeof candidate.protocol !== 'string'
    ) {
      return null
    }

    return {
      id: candidate.id,
      name: candidate.name,
      protocol: candidate.protocol,
      host:
        typeof candidate.host === 'string'
          ? candidate.host
          : null,
      port:
        typeof candidate.port === 'number'
          ? candidate.port
          : null,
      transport:
        typeof candidate.transport ===
        'string'
          ? candidate.transport
          : null,
      tls: candidate.tls === true,
    }
  } catch {
    return null
  }
}

export function useSelectedServer() {
  const [
    selectedServer,
    setSelectedServer,
  ] = useState<SelectedServer | null>(
    loadSelectedServer,
  )

  useEffect(() => {
    if (!selectedServer) {
      window.localStorage.removeItem(
        STORAGE_KEY,
      )

      return
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(selectedServer),
    )
  }, [selectedServer])

  const selectServer = useCallback(
    (server: SelectedServer) => {
      setSelectedServer(server)
    },
    [],
  )

  const clearSelectedServer =
    useCallback(() => {
      setSelectedServer(null)
    }, [])

  return {
    selectedServer,
    selectServer,
    clearSelectedServer,
  }
}