import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'

const STORAGE_KEY =
  'hamidsdeutsch:diagnostics:v1'

const MAX_EVENTS = 200
const MAX_SESSIONS = 100

export type DiagnosticEventLevel =
  | 'info'
  | 'success'
  | 'warning'
  | 'error'

export type DiagnosticEvent = {
  id: string
  timestamp: string
  level: DiagnosticEventLevel
  type:
    | 'connection-attempt'
    | 'connection-success'
    | 'connection-failure'
    | 'connection-recovery'
    | 'connection-disconnect'
  message: string
  serverName: string | null
  subscriptionName: string | null
  mode: 'tun' | 'system-proxy' | null
  latencyMs: number | null
}

export type ConnectionSession = {
  id: string
  startedAt: string
  endedAt: string | null
  serverName: string
  subscriptionName: string
  mode: 'tun' | 'system-proxy'
  latencyMs: number | null
  exitIp: string | null
  endReason:
    | 'manual'
    | 'connection-lost'
    | 'application'
    | null
}

type StoredDiagnostics = {
  events: DiagnosticEvent[]
  sessions: ConnectionSession[]
}

function createId(
  prefix: string,
) {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`
}

function readStored():
  StoredDiagnostics {
  try {
    const raw =
      window.localStorage.getItem(
        STORAGE_KEY,
      )

    if (!raw) {
      return {
        events: [],
        sessions: [],
      }
    }

    const parsed =
      JSON.parse(raw) as
        Partial<StoredDiagnostics>

    return {
      events:
        Array.isArray(parsed.events)
          ? parsed.events.slice(
              0,
              MAX_EVENTS,
            )
          : [],
      sessions:
        Array.isArray(parsed.sessions)
          ? parsed.sessions.slice(
              0,
              MAX_SESSIONS,
            )
          : [],
    }
  } catch {
    return {
      events: [],
      sessions: [],
    }
  }
}

function persist(
  data: StoredDiagnostics,
) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(data),
  )
}

export function useConnectionDiagnostics() {
  const [data, setData] =
    useState<StoredDiagnostics>(
      () => readStored(),
    )

  const activeSessionIdRef =
    useRef<string | null>(
      data.sessions.find(
        (session) =>
          session.endedAt === null,
      )?.id ?? null,
    )

  const updateData =
    useCallback(
      (
        updater: (
          current:
            StoredDiagnostics,
        ) => StoredDiagnostics,
      ) => {
        setData((current) => {
          const next =
            updater(current)

          persist(next)
          return next
        })
      },
      [],
    )

  const addEvent =
    useCallback(
      (
        event: Omit<
          DiagnosticEvent,
          'id' | 'timestamp'
        >,
      ) => {
        updateData(
          (current) => ({
            ...current,
            events: [
              {
                ...event,
                id:
                  createId('event'),
                timestamp:
                  new Date()
                    .toISOString(),
              },
              ...current.events,
            ].slice(
              0,
              MAX_EVENTS,
            ),
          }),
        )
      },
      [updateData],
    )

  const beginSession =
    useCallback(
      ({
        serverName,
        subscriptionName,
        mode,
        latencyMs,
        exitIp,
      }: {
        serverName: string
        subscriptionName: string
        mode:
          | 'tun'
          | 'system-proxy'
        latencyMs: number | null
        exitIp: string | null
      }) => {
        const sessionId =
          createId('session')

        activeSessionIdRef.current =
          sessionId

        updateData(
          (current) => {
            const successEvent:
              DiagnosticEvent = {
                id:
                  createId('event'),
                timestamp:
                  new Date()
                    .toISOString(),
                level: 'success',
                type:
                  'connection-success',
                message:
                  mode === 'tun'
                    ? 'اتصال واقعی با TUN تأیید شد.'
                    : 'اتصال واقعی با System Proxy تأیید شد.',
                serverName,
                subscriptionName,
                mode,
                latencyMs,
              }

            return {
              events: [
                successEvent,
                ...current.events,
              ].slice(
                0,
                MAX_EVENTS,
              ),
            sessions: [
              {
                id:
                  sessionId,
                startedAt:
                  new Date()
                    .toISOString(),
                endedAt: null,
                serverName,
                subscriptionName,
                mode,
                latencyMs,
                exitIp,
                endReason: null,
              },
              ...current.sessions.map(
                (session) =>
                  session.endedAt ===
                  null
                    ? {
                        ...session,
                        endedAt:
                          new Date()
                            .toISOString(),
                        endReason:
                          'application' as const,
                      }
                    : session,
              ),
            ].slice(
              0,
              MAX_SESSIONS,
            ),
            }
          },
        )
      },
      [updateData],
    )

  const endSession =
    useCallback(
      (
        reason:
          | 'manual'
          | 'connection-lost'
          | 'application',
      ) => {
        const activeId =
          activeSessionIdRef.current

        activeSessionIdRef.current =
          null

        if (!activeId) {
          return
        }

        const reasonMessage =
          reason === 'manual'
            ? 'اتصال به‌صورت دستی قطع شد.'
            : reason ===
                'connection-lost'
              ? 'سلامت اتصال از دست رفت و بازیابی آغاز شد.'
              : 'نشست قبلی بسته شد.'

        updateData(
          (current) => {
            const active =
              current.sessions.find(
                (session) =>
                  session.id ===
                  activeId,
              )

            const endEvent:
              DiagnosticEvent = {
                id:
                  createId('event'),
                timestamp:
                  new Date()
                    .toISOString(),
                level:
                  reason ===
                  'connection-lost'
                    ? 'warning'
                    : 'info',
                type:
                  reason ===
                  'connection-lost'
                    ? 'connection-recovery'
                    : 'connection-disconnect',
                message:
                  reasonMessage,
                serverName:
                  active?.serverName ??
                  null,
                subscriptionName:
                  active?.subscriptionName ??
                  null,
                mode:
                  active?.mode ??
                  null,
                latencyMs:
                  active?.latencyMs ??
                  null,
              }

            return {
              sessions:
                current.sessions.map(
                  (session) =>
                    session.id ===
                    activeId
                      ? {
                          ...session,
                          endedAt:
                            new Date()
                              .toISOString(),
                          endReason:
                            reason,
                        }
                      : session,
                ),
              events: [
                endEvent,
                ...current.events,
              ].slice(
                0,
                MAX_EVENTS,
              ),
            }
          },
        )
      },
      [updateData],
    )

  const clear = useCallback(
    () => {
      activeSessionIdRef.current =
        null

      const empty = {
        events: [],
        sessions: [],
      }

      setData(empty)
      persist(empty)
    },
    [],
  )

  const exportReport =
    useCallback(
      () => {
        return JSON.stringify(
          {
            generatedAt:
              new Date()
                .toISOString(),
            application:
              'HamidsDeutsch Connect',
            events:
              data.events,
            sessions:
              data.sessions,
          },
          null,
          2,
        )
      },
      [data],
    )

  const summary =
    useMemo(
      () => {
        const successfulSessions =
          data.sessions.length

        const failedAttempts =
          data.events.filter(
            (event) =>
              event.type ===
              'connection-failure',
          ).length

        const totalDurationMs =
          data.sessions.reduce(
            (
              total,
              session,
            ) => {
              const end =
                session.endedAt
                  ? new Date(
                      session.endedAt,
                    ).getTime()
                  : Date.now()

              const start =
                new Date(
                  session.startedAt,
                ).getTime()

              return (
                total +
                Math.max(
                  0,
                  end - start,
                )
              )
            },
            0,
          )

        const tunSessions =
          data.sessions.filter(
            (session) =>
              session.mode ===
              'tun',
          ).length

        return {
          successfulSessions,
          failedAttempts,
          totalDurationMs,
          tunSessions,
        }
      },
      [data],
    )

  return {
    events: data.events,
    sessions: data.sessions,
    summary,
    addEvent,
    beginSession,
    endSession,
    clear,
    exportReport,
  }
}
