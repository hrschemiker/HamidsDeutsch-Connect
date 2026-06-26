import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import { useT } from '../i18n'

import type {
  RescueSettings,
} from '../rescue/use-rescue-settings'

type BpbType =
  | 'normal'
  | 'fragment'
  | 'raw'
  | 'warp'

type BpbProfile = {
  id: string
  name: string
  normalUrl: string
  fragmentUrl: string
  rawUrl: string
  warpUrl: string
  panelUrl: string
  subPath: string
  panelVersion: string | null
  chainEnabled: boolean
  optimizerEnabled: boolean
  optimizerAutoRefreshDays: number
  activeType: BpbType
  lastSuccessfulNodeId: string | null
  lastSuccessfulNodeName: string | null
  lastSuccessfulType: BpbType | null
  updatedAt: string | null
}

type BpbNode = {
  id: string
  uri: string
  name: string
  protocol: string
  host: string | null
  port: number | null
  transport: string | null
  tls: boolean
  security: string | null
  valid: boolean
}

type BpbStatus = {
  running: boolean
  ready: boolean
  connected: boolean
  pid: number | null
  startedAt: string | null
  stoppedAt: string | null
  localHost: string
  localPort: number
  profileType: BpbType | null
  nodeId: string | null
  nodeName: string | null
  lastError: string | null
  logTail: string
}

type CloudflareStatus = {
  connected: boolean
  accountName: string | null
  deployed: boolean
  panelUrl: string | null
  projectName: string | null
}

type Props = {
  mainConnected: boolean
  directDomains: string[]
  rescueSettings: RescueSettings
}

const CACHE_KEY =
  'hamidsdeutsch-bpb-config-cache-v1'

const EMPTY_PROFILE: BpbProfile = {
  id: '',
  name: 'BPB شخصی',
  normalUrl: '',
  fragmentUrl: '',
  rawUrl: '',
  warpUrl: '',
  panelUrl: '',
  subPath: '',
  panelVersion: null,
  chainEnabled: false,
  optimizerEnabled: false,
  optimizerAutoRefreshDays: 7,
  activeType: 'raw',
  lastSuccessfulNodeId: null,
  lastSuccessfulNodeName: null,
  lastSuccessfulType: null,
  updatedAt: null,
}

const EMPTY_CLOUDFLARE:
  CloudflareStatus = {
    connected: false,
    accountName: null,
    deployed: false,
    panelUrl: null,
    projectName: null,
  }

const TYPE_ORDER: BpbType[] = [
  'raw',
  'normal',
  'fragment',
  'warp',
]

export function BpbPage({
  mainConnected,
  directDomains,
  rescueSettings,
}: Props) {
  const t = useT()
  const [profile, setProfile] =
    useState<BpbProfile>(EMPTY_PROFILE)

  const [cloudflare, setCloudflare] =
    useState<CloudflareStatus>(
      EMPTY_CLOUDFLARE,
    )

  const [nodes, setNodes] =
    useState<BpbNode[]>([])

  const [latency, setLatency] =
    useState<Record<string, number | null>>(
      {},
    )

  const [activeType, setActiveType] =
    useState<BpbType>('raw')

  const [status, setStatus] =
    useState<BpbStatus | null>(null)

  const [loading, setLoading] =
    useState(true)

  const [busy, setBusy] =
    useState(false)

  const [connectingMode, setConnectingMode] =
    useState<
      'fastest' | 'previous' | 'selected' | null
    >(null)

  const [progressText, setProgressText] =
    useState('')

  const [message, setMessage] =
    useState<{
      type: 'success' | 'error' | 'info'
      text: string
    } | null>(null)

  const [switchConfirm, setSwitchConfirm] =
    useState<{
      node: BpbNode
    } | null>(null)

  useEffect(() => {
    const unsubscribe =
      window.hamidsDeutsch.bpb.cloudflare
        .onProgress((progress) => {
          setProgressText(progress.message)
        })

    void initialize()

    return unsubscribe
  }, [])

  const sortedNodes = useMemo(
    () =>
      [...nodes].sort((left, right) => {
        const a = latency[left.id]
        const b = latency[right.id]

        if (
          typeof a === 'number' &&
          typeof b === 'number'
        ) {
          return a - b
        }

        if (typeof a === 'number') return -1
        if (typeof b === 'number') return 1

        return left.name.localeCompare(
          right.name,
        )
      }),
    [nodes, latency],
  )

  const fastestNode = useMemo(
    () =>
      sortedNodes.find(
        (node) =>
          typeof latency[node.id] === 'number',
      ) ?? sortedNodes[0] ?? null,
    [sortedNodes, latency],
  )

  const previousNode = useMemo(
    () =>
      profile.lastSuccessfulNodeId
        ? nodes.find(
            (node) =>
              node.id ===
              profile.lastSuccessfulNodeId,
          ) ?? null
        : null,
    [nodes, profile.lastSuccessfulNodeId],
  )

  async function initialize() {
    setLoading(true)

    const [profileResult, processStatus, cf] =
      await Promise.all([
        window.hamidsDeutsch.bpb.getProfile(),
        window.hamidsDeutsch.bpb.getStatus(),
        window.hamidsDeutsch.bpb.cloudflare
          .getStatus(),
      ])

    const loadedProfile =
      profileResult.success &&
      profileResult.profile
        ? profileResult.profile
        : EMPTY_PROFILE

    setProfile(loadedProfile)
    setStatus(processStatus)
    setCloudflare(cf)

    const cached = readCache()

    if (
      loadedProfile.panelUrl &&
      cached?.panelUrl ===
        loadedProfile.panelUrl
    ) {
      setNodes(cached.nodes)
      setLatency(cached.latency)
      setActiveType(cached.activeType)
      setMessage({
        type: 'success',
        text:
          t('bpb.msg.cacheReady'),
      })
    } else if (!loadedProfile.panelUrl) {
      setMessage({
        type: 'info',
        text:
          t('bpb.msg.noPanelYet'),
      })
    }

    setLoading(false)
  }

  async function setupEverything() {
    if (busy || mainConnected) return

    setBusy(true)
    setMessage({
      type: 'info',
      text:
        t('bpb.msg.cfLoginPrompt'),
    })

    try {
      let cf = await window.hamidsDeutsch.bpb
        .cloudflare.getStatus()

      if (!cf.connected) {
        const login =
          await window.hamidsDeutsch.bpb
            .cloudflare.login()

        if (!login.success) {
          throw new Error(
            login.error ??
              t('bpb.msg.cfLoginFailed'),
          )
        }

        cf = await window.hamidsDeutsch.bpb
          .cloudflare.getStatus()
      }

      let nextProfile = profile

      if (!cf.deployed || !profile.panelUrl) {
        const deployed =
          await window.hamidsDeutsch.bpb
            .cloudflare.deploy()

        if (
          !deployed.success ||
          !deployed.profile
        ) {
          throw new Error(
            deployed.error ??
              t('bpb.msg.deployFailed'),
          )
        }

        nextProfile = deployed.profile
        setProfile(nextProfile)
      }

      setCloudflare(
        await window.hamidsDeutsch.bpb
          .cloudflare.getStatus(),
      )

      await updateConfigs(nextProfile)
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('bpb.msg.setupFailed'),
      })
    }

    setBusy(false)
    setProgressText('')
  }

  async function updateConfigs(
    sourceProfile = profile,
  ) {
    if (!sourceProfile.panelUrl) {
      throw new Error(
        t('bpb.msg.setupFirst'),
      )
    }

    setBusy(true)
    setMessage({
      type: 'info',
      text:
        t('bpb.msg.fetchingConfigs'),
    })

    try {
      let selectedType: BpbType | null = null
      let selectedNodes: BpbNode[] = []

      for (const type of TYPE_ORDER) {
        const result =
          await window.hamidsDeutsch.bpb
            .loadNodes(type)

        if (
          result.success &&
          result.mode === 'uri-list' &&
          result.nodes.length > 0
        ) {
          selectedType = type
          selectedNodes = result.nodes.map(
            (node) => ({
              ...node,
              uri: node.uri ?? '',
            }),
          )
          break
        }
      }

      if (!selectedType || selectedNodes.length === 0) {
        throw new Error(
          t('bpb.msg.noConfigsYet'),
        )
      }

      const pingResult =
        await window.hamidsDeutsch.servers
          .testLatency(
            selectedNodes.map((node) => ({
              id: node.id,
              host: node.host,
              port: node.port,
            })),
          )

      const nextLatency:
        Record<string, number | null> = {}

      for (const item of pingResult.results) {
        nextLatency[item.id] =
          item.reachable
            ? item.latencyMs
            : null
      }

      setNodes(selectedNodes)
      setLatency(nextLatency)
      setActiveType(selectedType)

      writeCache({
        panelUrl: sourceProfile.panelUrl,
        activeType: selectedType,
        nodes: selectedNodes,
        latency: nextLatency,
        updatedAt: new Date().toISOString(),
      })

      setMessage({
        type: 'success',
        text:
          t('bpb.msg.configsSaved', `${selectedNodes.length} configs saved.`),
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('bpb.msg.updateFailed'),
      })
    }

    setBusy(false)
  }

  async function updatePanel() {
    if (busy) return
    setBusy(true)

    const result =
      await window.hamidsDeutsch.bpb.cloudflare
        .updatePanel()

    setMessage({
      type: result.success ? 'success' : 'error',
      text: result.success
        ? t('bpb.msg.panelUpdated')
        : result.error ??
          t('bpb.msg.panelUpdateFailed'),
    })

    setBusy(false)
  }

  async function connectNode(
    node: BpbNode | null,
    mode:
      | 'fastest'
      | 'previous'
      | 'selected',
  ) {
    if (
      mainConnected ||
      connectingMode ||
      !node
    ) {
      if (!node) {
        setMessage({
          type: 'error',
          text:
            mode === 'previous'
              ? t('bpb.msg.noPrevServer')
              : t('bpb.msg.noConfig'),
        })
      }
      return
    }

    setConnectingMode(mode)
    setMessage({
      type: 'info',
      text:
        t('bpb.msg.connecting'),
    })

    const result =
      await window.hamidsDeutsch.bpb.connect({
        type: activeType,
        nodeId: node.id,
        nodeUri: node.uri,
        nodeName: node.name,
        directDomains,
        rescueOptions: rescueSettings,
      })

    setStatus(result.status)

    if (result.success) {
      const updated: BpbProfile = {
        ...profile,
        activeType,
        lastSuccessfulNodeId: node.id,
        lastSuccessfulNodeName: node.name,
        lastSuccessfulType: activeType,
      }

      const saved =
        await window.hamidsDeutsch.bpb
          .saveProfile(updated)

      if (saved.success && saved.profile) {
        setProfile(saved.profile)
      }

      setMessage({
        type: 'success',
        text: t('bpb.msg.connected', `Connected: ${node.name}`),
      })
    } else {
      setMessage({
        type: 'error',
        text:
          result.error ??
          t('bpb.msg.connectFailed'),
      })
    }

    setConnectingMode(null)
  }

  async function disconnect() {
    const result =
      await window.hamidsDeutsch.bpb.disconnect()

    setStatus(result.status)
    setMessage({
      type: result.success ? 'success' : 'error',
      text: result.success
        ? t('bpb.msg.disconnected')
        : result.error ??
          t('bpb.msg.disconnectFailed'),
    })
  }

  if (loading) {
    return (
      <section className="panel-card">
        <p className="panel-description">
          {t('bpb.loading')}
        </p>
      </section>
    )
  }

  return (
    <div className="bpb-page">
      <section className="panel-card bpb-auto-dashboard">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              Cloudflare + BPB
            </span>
            <h3>{t('bpb.title')}</h3>
          </div>

          <span
            className={
              status?.connected
                ? 'status-pill success'
                : cloudflare.deployed
                  ? 'status-pill success'
                  : 'status-pill'
            }
          >
            {status?.connected
              ? t('bpb.badge.connected')
              : cloudflare.deployed
                ? t('bpb.badge.ready')
                : t('bpb.badge.notSetup')}
          </span>
        </div>

        <p className="panel-description">
          {t('bpb.desc')}
        </p>

        {progressText && (
          <div className="inline-notice">
            {progressText}
          </div>
        )}

        {message && (
          <div
            className={
              message.type === 'error'
                ? 'inline-error'
                : 'inline-notice'
            }
          >
            {message.text}
          </div>
        )}

        <div className="bpb-auto-summary">
          <div>
            <span>{t('bpb.cf.account')}</span>
            <strong>
              {cloudflare.accountName ??
                t('bpb.cf.notConnected')}
            </strong>
          </div>
          <div>
            <span>{t('bpb.panel')}</span>
            <strong>
              {cloudflare.deployed
                ? t('bpb.panel.created')
                : t('bpb.panel.notCreated')}
            </strong>
          </div>
          <div>
            <span>{t('bpb.cachedConfigs')}</span>
            <strong>
              {nodes.length.toLocaleString('fa-IR')}
            </strong>
          </div>
          <div>
            <span>{t('bpb.prevServer')}</span>
            <strong>
              {profile.lastSuccessfulNodeName ??
                t('bpb.prevServer.none')}
            </strong>
          </div>
        </div>

        <div className="bpb-auto-actions">
          {!cloudflare.deployed && (
            <button
              className="primary-button compact-primary"
              type="button"
              disabled={busy || mainConnected}
              onClick={() => void setupEverything()}
            >
              {busy
                ? t('bpb.settingUp')
                : t('bpb.setup')}
            </button>
          )}

          {cloudflare.deployed &&
            !status?.connected && (
              <>
                <button
                  className="primary-button compact-primary"
                  type="button"
                  disabled={
                    busy ||
                    mainConnected ||
                    !fastestNode ||
                    Boolean(connectingMode)
                  }
                  onClick={() =>
                    void connectNode(
                      fastestNode,
                      'fastest',
                    )
                  }
                >
                  {connectingMode === 'fastest'
                    ? t('bpb.connecting')
                    : t('bpb.connectFastest')}
                </button>

                <button
                  className="secondary-button"
                  type="button"
                  disabled={
                    busy ||
                    mainConnected ||
                    !previousNode ||
                    Boolean(connectingMode)
                  }
                  onClick={() =>
                    void connectNode(
                      previousNode,
                      'previous',
                    )
                  }
                >
                  {t('bpb.connectPrev')}
                </button>
              </>
            )}

          {status?.connected && (
            <button
              className="danger-button"
              type="button"
              onClick={() => void disconnect()}
            >
              {t('bpb.disconnect')}
            </button>
          )}

          {cloudflare.deployed && (
            <>
              <button
                className="secondary-button"
                type="button"
                disabled={busy || status?.connected}
                onClick={() => void updateConfigs()}
              >
                {busy
                  ? t('bpb.updating')
                  : t('bpb.updateConfigs')}
              </button>

              <button
                className="secondary-button"
                type="button"
                disabled={busy || status?.connected}
                onClick={() => void updatePanel()}
              >
                {t('bpb.updatePanel')}
              </button>
            </>
          )}
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              Cached BPB Configs
            </span>
            <h3>{t('bpb.list.title')}</h3>
          </div>
          <span className="status-pill">
            {t('bpb.list.sorted')}
          </span>
        </div>

        {nodes.length === 0 ? (
          <div className="bpb-empty-list">
            {t('bpb.list.empty')}
          </div>
        ) : (
          <div className="bpb-server-list">
            {sortedNodes.map((node, index) => {
              const ping = latency[node.id]
              const isFastest =
                node.id === fastestNode?.id
              const isPrevious =
                node.id ===
                profile.lastSuccessfulNodeId
              const isActive =
                status?.connected &&
                status.nodeId === node.id

              return (
                <button
                  key={node.id}
                  type="button"
                  className={[
                    'bpb-server-row',
                    isFastest ? 'is-fastest' : '',
                    isPrevious ? 'is-previous' : '',
                    isActive ? 'is-active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  disabled={
                    mainConnected ||
                    Boolean(connectingMode)
                  }
                  onClick={() => {
                    if (status?.connected) {
                      setSwitchConfirm({ node })
                    } else {
                      void connectNode(node, 'selected')
                    }
                  }}
                >
                  <span className="bpb-server-rank">
                    {(index + 1).toLocaleString(
                      'fa-IR',
                    )}
                  </span>
                  <span className="bpb-server-main">
                    <strong>{node.name}</strong>
                    <small dir="ltr">
                      {node.protocol.toUpperCase()}
                      {' · '}
                      {node.host ?? '—'}
                      {node.port
                        ? `:${node.port}`
                        : ''}
                    </small>
                  </span>
                  <span className="bpb-server-badges">
                    {isFastest && <em>{t('bpb.badge.fastest')}</em>}
                    {isPrevious && <em>{t('bpb.badge.previous')}</em>}
                    {isActive && <em>{t('bpb.badge.connected')}</em>}
                  </span>
                  <span
                    className={
                      typeof ping === 'number'
                        ? 'bpb-ping is-online'
                        : 'bpb-ping'
                    }
                    dir="ltr"
                  >
                    {typeof ping === 'number'
                      ? `${ping} ms`
                      : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {switchConfirm && (
        <div className="confirm-overlay" onClick={() => setSwitchConfirm(null)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <p className="confirm-title">تغییر سرور BPB</p>
            <p className="confirm-message">
              اتصال فعلی BPB قطع می‌شود و از طریق سرور «{switchConfirm.node.name}» مجدداً متصل می‌شوید. ادامه می‌دهید؟
            </p>
            <div className="confirm-actions">
              <button className="confirm-cancel-btn" type="button" onClick={() => setSwitchConfirm(null)}>انصراف</button>
              <button className="confirm-ok-btn" type="button" onClick={() => {
                const node = switchConfirm.node
                setSwitchConfirm(null)
                void connectNode(node, 'selected')
              }}>بله، تغییر بده</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

type CacheShape = {
  panelUrl: string
  activeType: BpbType
  nodes: BpbNode[]
  latency: Record<string, number | null>
  updatedAt: string
}

function readCache(): CacheShape | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(CACHE_KEY) ?? '',
    ) as CacheShape

    if (
      !parsed ||
      !Array.isArray(parsed.nodes) ||
      !parsed.panelUrl
    ) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

function writeCache(cache: CacheShape) {
  localStorage.setItem(
    CACHE_KEY,
    JSON.stringify(cache),
  )
}
