import {
  useEffect,
  useMemo,
  useState,
} from 'react'

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
          'کانفیگ‌های ذخیره‌شده آماده‌اند. فقط برای دریافت نسخه جدید، دکمه به‌روزرسانی کانفیگ‌ها را بزن.',
      })
    } else if (!loadedProfile.panelUrl) {
      setMessage({
        type: 'info',
        text:
          'هنوز پنل BPB ساخته نشده است. فقط دکمه راه‌اندازی خودکار را بزن.',
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
        'مرورگر Cloudflare باز می‌شود؛ وارد حساب شو و اجازه دسترسی را تأیید کن.',
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
              'ورود Cloudflare ناموفق بود.',
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
              'ساخت پنل BPB ناموفق بود.',
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
            : 'راه‌اندازی BPB ناموفق بود.',
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
        'ابتدا راه‌اندازی خودکار BPB را انجام بده.',
      )
    }

    setBusy(true)
    setMessage({
      type: 'info',
      text:
        'در حال دریافت کانفیگ‌ها و تست پینگ...',
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
          'پنل ساخته شد، اما هنوز کانفیگ قابل نمایش برنگرداند. چند ثانیه بعد دوباره دکمه به‌روزرسانی کانفیگ‌ها را بزن.',
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
          `${selectedNodes.length.toLocaleString(
            'fa-IR',
          )} کانفیگ ذخیره شد؛ دفعه بعد بدون دانلود دوباره نمایش داده می‌شود.`,
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'به‌روزرسانی کانفیگ‌ها ناموفق بود.',
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
        ? 'پنل BPB به آخرین نسخه رسمی به‌روزرسانی شد. حالا کانفیگ‌ها را به‌روزرسانی کن.'
        : result.error ??
          'به‌روزرسانی پنل ناموفق بود.',
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
              ? 'هنوز سرور قبلی ثبت نشده است.'
              : 'کانفیگی برای اتصال وجود ندارد.',
        })
      }
      return
    }

    setConnectingMode(mode)
    setMessage({
      type: 'info',
      text:
        'در حال اتصال و بررسی تغییر واقعی IP...',
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
        text: `اتصال برقرار شد: ${node.name}`,
      })
    } else {
      setMessage({
        type: 'error',
        text:
          result.error ??
          'اتصال BPB ناموفق بود.',
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
        ? 'اتصال BPB قطع شد.'
        : result.error ??
          'قطع اتصال ناموفق بود.',
    })
  }

  if (loading) {
    return (
      <section className="panel-card">
        <p className="panel-description">
          در حال بارگیری BPB...
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
            <h3>راه‌اندازی و اتصال خودکار BPB</h3>
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
              ? 'متصل'
              : cloudflare.deployed
                ? 'پنل آماده'
                : 'راه‌اندازی نشده'}
          </span>
        </div>

        <p className="panel-description">
          اولین بار فقط «راه‌اندازی خودکار» را بزن و داخل مرورگر Cloudflare ورود را تأیید کن. نرم‌افزار خودش KV، Worker، پنل و لینک‌های اشتراک را می‌سازد. بعد از آن کانفیگ‌ها روی دستگاه ذخیره می‌شوند.
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
            <span>حساب Cloudflare</span>
            <strong>
              {cloudflare.accountName ??
                'متصل نشده'}
            </strong>
          </div>
          <div>
            <span>پنل BPB</span>
            <strong>
              {cloudflare.deployed
                ? 'ساخته شده'
                : 'ساخته نشده'}
            </strong>
          </div>
          <div>
            <span>کانفیگ‌های ذخیره‌شده</span>
            <strong>
              {nodes.length.toLocaleString('fa-IR')}
            </strong>
          </div>
          <div>
            <span>سرور قبلی</span>
            <strong>
              {profile.lastSuccessfulNodeName ??
                'هنوز ثبت نشده'}
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
                ? 'در حال راه‌اندازی...'
                : 'راه‌اندازی خودکار BPB'}
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
                    ? 'در حال اتصال...'
                    : 'اتصال به سریع‌ترین'}
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
                  اتصال به سرور قبلی
                </button>
              </>
            )}

          {status?.connected && (
            <button
              className="danger-button"
              type="button"
              onClick={() => void disconnect()}
            >
              قطع اتصال BPB
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
                  ? 'در حال دریافت...'
                  : 'به‌روزرسانی کانفیگ‌ها'}
              </button>

              <button
                className="secondary-button"
                type="button"
                disabled={busy || status?.connected}
                onClick={() => void updatePanel()}
              >
                به‌روزرسانی پنل BPB
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
            <h3>فهرست کانفیگ‌های BPB</h3>
          </div>
          <span className="status-pill">
            مرتب‌شده براساس پینگ
          </span>
        </div>

        {nodes.length === 0 ? (
          <div className="bpb-empty-list">
            هنوز کانفیگی ذخیره نشده است. ابتدا راه‌اندازی خودکار را انجام بده یا «به‌روزرسانی کانفیگ‌ها» را بزن.
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
                    {isFastest && <em>سریع‌ترین</em>}
                    {isPrevious && <em>قبلی</em>}
                    {isActive && <em>متصل</em>}
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
