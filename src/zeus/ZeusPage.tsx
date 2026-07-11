import {
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'

import { LangCtx, useT } from '../i18n'

type ZeusStatus = {
  connected: boolean
  needsReauth?: boolean
  accountName: string | null
  deployed: boolean
  workerUrl: string | null
  username: string | null
  subUrl: string | null
  deployedAt: string | null
}

const EMPTY_STATUS: ZeusStatus = {
  connected: false,
  accountName: null,
  deployed: false,
  workerUrl: null,
  username: null,
  subUrl: null,
  deployedAt: null,
}

type Props = {
  onZeusConnect?: () => void
}

export function ZeusPage({ onZeusConnect }: Props) {
  const t = useT()
  const { lang } = useContext(LangCtx)
  const isRtl = lang === 'fa'

  const [status, setStatus] = useState<ZeusStatus>(EMPTY_STATUS)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [progressText, setProgressText] = useState('')
  const [message, setMessage] = useState<{
    type: 'success' | 'error' | 'info'
    text: string
  } | null>(null)
  const isMounted = useRef(true)

  useEffect(() => {
    isMounted.current = true
    const unsubscribe = window.hamidsDeutsch.zeus.onProgress((p) => {
      if (isMounted.current) setProgressText(p.message)
    })
    void initialize()
    return () => {
      isMounted.current = false
      unsubscribe()
    }
  }, [])

  async function initialize() {
    if (!isMounted.current) return
    setLoading(true)
    try {
      const s = await window.hamidsDeutsch.zeus.getStatus()
      if (!isMounted.current) return
      setStatus(s)
      if (s.deployed) {
        setMessage({ type: 'success', text: t('zeus.msg.panelReady') })
      }
    } finally {
      if (isMounted.current) setLoading(false)
    }
  }

  async function handleDeploy() {
    if (busy) return
    setBusy(true)
    setMessage({ type: 'info', text: t('zeus.msg.cfLoginPrompt') })
    setProgressText('')
    try {
      let s = await window.hamidsDeutsch.zeus.getStatus()
      // Re-login if there is no token OR the stored token predates a required
      // scope (needsReauth) — otherwise the browser never opens and the D1 call
      // later fails with "Authentication error".
      if (!s.connected || s.needsReauth) {
        const login = await window.hamidsDeutsch.zeus.login()
        if (!login.success) {
          throw new Error(login.error ?? t('zeus.msg.cfLoginFailed'))
        }
        s = await window.hamidsDeutsch.zeus.getStatus()
      }
      if (!s.deployed) {
        const deployed = await window.hamidsDeutsch.zeus.deploy()
        if (!deployed.success) {
          throw new Error(deployed.error ?? t('zeus.msg.deployFailed'))
        }
        s = await window.hamidsDeutsch.zeus.getStatus()
      }
      setStatus(s)
      setMessage({ type: 'success', text: t('zeus.msg.panelReady') })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('zeus.msg.deployFailed') })
    } finally {
      setBusy(false)
      setProgressText('')
    }
  }

  async function handleUpdate() {
    if (busy) return
    setBusy(true)
    setProgressText('')
    try {
      const result = await window.hamidsDeutsch.zeus.updatePanel()
      if (!result.success) throw new Error(result.error ?? t('zeus.msg.updateFailed'))
      setMessage({ type: 'success', text: t('zeus.msg.updateDone') })
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('zeus.msg.updateFailed') })
    } finally {
      setBusy(false)
      setProgressText('')
    }
  }

  if (loading) {
    return (
      <div className="bpb-page" dir={isRtl ? 'rtl' : 'ltr'}>
        <div className="bpb-loading">{t('zeus.loading')}</div>
      </div>
    )
  }

  return (
    <div className="bpb-page zeus-page" dir={isRtl ? 'rtl' : 'ltr'}>
      <div className="bpb-header">
        <div className="bpb-header-icon zeus-icon">⬡</div>
        <div className="bpb-header-text">
          <h2>{t('zeus.title')}</h2>
          <p>{t('zeus.subtitle')}</p>
        </div>
      </div>

      {/* CF account status */}
      <div className={`bpb-cf-status ${status.connected ? 'bpb-cf-status--connected' : ''}`}>
        <span className="bpb-cf-dot" />
        <span>
          {status.connected
            ? `${t('zeus.cfConnected')} — ${status.accountName ?? ''}`
            : t('zeus.cfNotConnected')}
        </span>
      </div>

      {/* Message bar */}
      {message && (
        <div className={`bpb-message bpb-message--${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Progress */}
      {busy && progressText && (
        <div className="bpb-progress">
          <span className="connection-stage-spinner">◌</span>
          {' '}{progressText}
        </div>
      )}

      {/* Deployed status card */}
      {status.deployed && status.workerUrl && (
        <div className="zeus-status-card">
          <div className="zeus-status-row">
            <span className="zeus-status-label">{t('zeus.workerUrl')}</span>
            <span className="zeus-status-value">
              <a href={status.workerUrl} target="_blank" rel="noreferrer">{status.workerUrl}</a>
            </span>
          </div>
          {status.username && (
            <div className="zeus-status-row">
              <span className="zeus-status-label">{t('zeus.username')}</span>
              <span className="zeus-status-value">{status.username}</span>
            </div>
          )}
          {status.subUrl && (
            <div className="zeus-status-row">
              <span className="zeus-status-label">{t('zeus.subUrl')}</span>
              <span className="zeus-status-value zeus-sub-url">{status.subUrl}</span>
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="bpb-actions">
        {!status.deployed ? (
          <button
            className="bpb-action-btn bpb-action-btn--primary zeus-deploy-btn"
            onClick={() => void handleDeploy()}
            disabled={busy}
          >
            {busy
              ? <><span className="connection-stage-spinner">◌</span> {progressText || t('zeus.deploying')}</>
              : status.connected
                ? t('zeus.deployPanel')
                : t('zeus.loginAndDeploy')}
          </button>
        ) : (
          <>
            <button
              className="bpb-action-btn bpb-action-btn--primary zeus-connect-btn"
              onClick={onZeusConnect}
              disabled={busy || !onZeusConnect}
            >
              ⚡ {t('zeus.connect')}
            </button>
            <button
              className="bpb-action-btn bpb-action-btn--secondary"
              onClick={() => void handleUpdate()}
              disabled={busy}
            >
              {busy ? <><span className="connection-stage-spinner">◌</span> {progressText || t('zeus.updating')}</> : t('zeus.updatePanel')}
            </button>
          </>
        )}
      </div>

      {/* Info note */}
      {!status.deployed && (
        <div className="bpb-info-note">
          {t('zeus.infoNote')}
        </div>
      )}
    </div>
  )
}
