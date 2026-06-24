import {
  useState,
  type KeyboardEvent,
} from 'react'
import { useDirectDomains } from './domain/use-direct-domains'
import { useEngineInfo } from './engine/use-engine-info'
import { useSubscriptions } from './subscriptions/use-subscriptions'
import './App.css'

type PageId =
  | 'home'
  | 'servers'
  | 'subscriptions'
  | 'direct-sites'
  | 'rescue'
  | 'statistics'
  | 'logs'
  | 'settings'

type NavigationItem = {
  id: PageId
  label: string
  icon: string
}

const navigationItems: NavigationItem[] = [
  { id: 'home', label: 'خانه', icon: '⌂' },
  { id: 'servers', label: 'سرورها', icon: '◉' },
  { id: 'subscriptions', label: 'اشتراک‌ها', icon: '↧' },
  { id: 'direct-sites', label: 'سایت‌های مستقیم', icon: '↗' },
  { id: 'rescue', label: 'مرکز نجات', icon: '✦' },
  { id: 'statistics', label: 'آمار', icon: '▥' },
  { id: 'logs', label: 'گزارش', icon: '≡' },
  { id: 'settings', label: 'تنظیمات', icon: '⚙' },
]

const pageTitles: Record<PageId, string> = {
  home: 'خانه',
  servers: 'سرورها',
  subscriptions: 'اشتراک‌ها',
  'direct-sites': 'سایت‌های مستقیم',
  rescue: 'مرکز نجات اتصال',
  statistics: 'آمار اتصال',
  logs: 'گزارش برنامه',
  settings: 'تنظیمات',
}

function App() {
  const [activePage, setActivePage] = useState<PageId>('home')
  const [isConnected, setIsConnected] = useState(false)
  const directDomains = useDirectDomains()
  const engine = useEngineInfo()
  const subscriptions = useSubscriptions()

  function toggleConnection() {
    setIsConnected((currentValue) => !currentValue)
  }

  return (
    <div className="application-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <span>H</span>
          </div>

          <div className="brand-text">
            <strong>HamidsDeutsch</strong>
            <span>Connect</span>
          </div>
        </div>

        <nav className="navigation" aria-label="منوی اصلی">
          {navigationItems.map((item) => (
            <button
              className={
                activePage === item.id
                  ? 'navigation-item navigation-item-active'
                  : 'navigation-item'
              }
              key={item.id}
              type="button"
              onClick={() => setActivePage(item.id)}
            >
              <span className="navigation-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="engine-status">
  <span
    className={
      engine.info?.healthy
        ? 'engine-status-dot engine-status-dot-ready'
        : 'engine-status-dot'
    }
  />

  <div>
    <strong>هسته برنامه</strong>

    <span>
      {engine.loading
        ? 'در حال بررسی...'
        : engine.info?.healthy
          ? `sing-box ${engine.info.version}`
          : 'در دسترس نیست'}
    </span>
  </div>
</div>

          <div className="version">نسخه 0.1.0</div>
        </div>
      </aside>

      <section className="main-area">
        <header className="topbar">
          <div>
            <p className="topbar-eyebrow">HamidsDeutsch Connect</p>
            <h1>{pageTitles[activePage]}</h1>
          </div>

          <div
            className={
              isConnected
                ? 'connection-pill connection-pill-online'
                : 'connection-pill'
            }
          >
            <span className="connection-pill-dot" />
            <span>{isConnected ? 'متصل' : 'قطع'}</span>
          </div>
        </header>

        <main className="content">
          {activePage === 'home' && (
            <HomePage
  isConnected={isConnected}
  directDomains={directDomains.domains}
  engineInfo={engine.info}
  onToggleConnection={toggleConnection}
  onOpenDirectSites={() => setActivePage('direct-sites')}
  onOpenRescue={() => setActivePage('rescue')}
/>
          )}

          {activePage === 'servers' && (
            <EmptyPage
              icon="◉"
              title="هنوز سروری اضافه نشده است"
              description="بعداً در این بخش سرورها، کیفیت اتصال، تأخیر و وضعیت واقعی آن‌ها نمایش داده می‌شود."
              actionLabel="افزودن اشتراک"
              onAction={() => setActivePage('subscriptions')}
            />
          )}

          {activePage === 'subscriptions' && (
  <SubscriptionsPage
    loading={subscriptions.loading}
    subscriptions={subscriptions.subscriptions}
    loadError={subscriptions.error}
    onAddSubscription={
      subscriptions.addSubscription
    }
    onRemoveSubscription={
      subscriptions.removeSubscription
    }
    onInspectSubscription={
  subscriptions.inspectSubscription
}
  />
)}

          {activePage === 'direct-sites' && (
            <DirectSitesPage
              domains={directDomains.domains}
              onAddDomain={directDomains.addDomain}
              onRemoveDomain={directDomains.removeDomain}
              onResetDomains={directDomains.resetDomains}
            />
          )}

          {activePage === 'rescue' && (
            <RescuePage />
          )}

          {activePage === 'statistics' && (
            <StatisticsPage />
          )}

          {activePage === 'logs' && (
            <LogsPage />
          )}

          {activePage === 'settings' && (
            <SettingsPage />
          )}
        </main>
      </section>
    </div>
  )
}

type HomePageProps = {
  isConnected: boolean
  directDomains: string[]

  engineInfo: {
    installed: boolean
    healthy: boolean
    path: string
    version: string | null
    architecture: string | null
    error: string | null
  } | null

  onToggleConnection: () => void
  onOpenDirectSites: () => void
  onOpenRescue: () => void
}

function HomePage({
  isConnected,
  directDomains,
  engineInfo,
  onToggleConnection,
  onOpenDirectSites,
  onOpenRescue,
}: HomePageProps) {
  return (
    <div className="home-layout">
      <section className="hero-card">
        <div className="hero-content">
          <div className="status-label">
            <span
              className={
                isConnected
                  ? 'status-label-dot status-label-dot-online'
                  : 'status-label-dot'
              }
            />

            {isConnected
              ? 'اتصال آزمایشی فعال است'
              : 'در حال حاضر اتصال برقرار نیست'}
          </div>

          <h2>
            اینترنت آزاد،
            <br />
            ساده و قابل اعتماد
          </h2>

          <p>
            اتصال واقعی، بررسی تغییر IP، جداسازی سایت‌های ایرانی و
            راهکارهای نجات برای شرایط اختلال شدید.
          </p>

          <button
            className={
              isConnected
                ? 'connect-button connect-button-active'
                : 'connect-button'
            }
            type="button"
            onClick={onToggleConnection}
          >
            <span className="connect-button-icon">
              {isConnected ? '■' : '▶'}
            </span>

            <span>
              <strong>
                {isConnected ? 'قطع اتصال آزمایشی' : 'اتصال آزمایشی'}
              </strong>

              <small>
                {isConnected
                  ? 'این دکمه فعلاً فقط رابط را آزمایش می‌کند'
                  : 'هسته شبکه در مراحل بعد اضافه می‌شود'}
              </small>
            </span>
          </button>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div
            className={
              isConnected
                ? 'connection-orbit connection-orbit-online'
                : 'connection-orbit'
            }
          >
            <div className="connection-orbit-middle">
              <div className="connection-orbit-core">
                <span>{isConnected ? '✓' : 'H'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="quick-statistics">
        <article className="statistic-card">
          <span className="statistic-icon">◎</span>
          <div>
            <span className="statistic-label">IP خروجی</span>
            <strong>{isConnected ? 'آزمایشی' : '—'}</strong>
          </div>
        </article>

        <article className="statistic-card">
          <span className="statistic-icon">◌</span>
          <div>
            <span className="statistic-label">سرور انتخاب‌شده</span>
            <strong>انتخاب نشده</strong>
          </div>
        </article>

        <article className="statistic-card">
          <span className="statistic-icon">↗</span>
          <div>
            <span className="statistic-label">سایت‌های مستقیم</span>
            <strong>{directDomains.length} دامنه</strong>
          </div>
        </article>
      </section>

      <section className="home-grid">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">مسیر خروج</span>
              <h3>وضعیت اتصال</h3>
            </div>

            <span className="panel-icon">◉</span>
          </div>

          <div className="connection-details">
            <DetailRow label="حالت اتصال" value="TUN" />
            <DetailRow label="روش انتخاب" value="خودکار" />
            <DetailRow
  label="هسته شبکه"
  value={
    engineInfo?.healthy
      ? `sing-box ${engineInfo.version}`
      : 'در دسترس نیست'
  }
  muted={!engineInfo?.healthy}
/>
<DetailRow
  label="معماری هسته"
  value={engineInfo?.architecture ?? '—'}
  muted={!engineInfo?.architecture}
/>
            <DetailRow label="بررسی IP" value="در انتظار اتصال" muted />
          </div>
        </article>

        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">دسترسی مستقیم</span>
              <h3>سایت‌های بدون VPN</h3>
            </div>

            <button
              className="text-button"
              type="button"
              onClick={onOpenDirectSites}
            >
              مدیریت
            </button>
          </div>

          <div className="domain-preview-list">
            {directDomains.slice(0, 3).map((domain) => (
              <DomainPreview domain={domain} key={domain} />
            ))}

            {directDomains.length === 0 && (
              <p className="empty-list-message">
                هنوز دامنه‌ای ثبت نشده است.
              </p>
            )}
          </div>

          <button
            className="secondary-button"
            type="button"
            onClick={onOpenDirectSites}
          >
            مشاهده تمام دامنه‌ها
          </button>
        </article>

        <article className="panel-card rescue-preview-card">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">شرایط اختلال</span>
              <h3>مرکز نجات اتصال</h3>
            </div>

            <span className="rescue-badge">آماده‌سازی</span>
          </div>

          <p>
            در نسخه‌های بعد، برنامه Fragment، SNI، Serverless و
            روش‌های Tor را بررسی می‌کند و راهکار قابل‌استفاده را
            پیشنهاد می‌دهد.
          </p>

          <button
            className="secondary-button"
            type="button"
            onClick={onOpenRescue}
          >
            مشاهده مرکز نجات
          </button>
        </article>
      </section>
    </div>
  )
}

function DetailRow({
  label,
  value,
  muted = false,
}: {
  label: string
  value: string
  muted?: boolean
}) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong className={muted ? 'muted-value' : ''}>{value}</strong>
    </div>
  )
}

function DomainPreview({ domain }: { domain: string }) {
  return (
    <div className="domain-preview">
      <span className="domain-preview-check">✓</span>
      <span dir="ltr">{domain}</span>
      <small>مستقیم</small>
    </div>
  )
}

function EmptyPage({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: string
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <section className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <h2>{title}</h2>
      <p>{description}</p>

      {actionLabel && onAction && (
        <button
          className="primary-button"
          type="button"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </section>
  )
}

type SubscriptionItem = {
  id: string
  name: string
  host: string
  createdAt: string
  updatedAt: string
}

type SubscriptionInspection = {
  success: boolean
  checkedAt: string
  httpStatus: number | null
  httpStatusText: string | null
  contentType: string | null
  responseSize: number | null
  format: string
  configCount: number
  error: string | null
}

type SubscriptionsPageProps = {
  loading: boolean
  subscriptions: SubscriptionItem[]
  loadError: string | null

  onAddSubscription: (
    name: string,
    url: string,
  ) => Promise<
    | {
        success: true
        error: null
      }
    | {
        success: false
        error: string
      }
  >

  onRemoveSubscription: (
    subscriptionId: string,
  ) => Promise<
    | {
        success: true
        error: null
      }
    | {
        success: false
        error: string
      }
  >

  onInspectSubscription: (
    subscriptionId: string,
  ) => Promise<SubscriptionInspection>

}

function SubscriptionsPage({
  loading,
  subscriptions,
  loadError,
  onAddSubscription,
  onRemoveSubscription,
  onInspectSubscription,
}: SubscriptionsPageProps) {
  const [nameInput, setNameInput] =
    useState('')

  const [urlInput, setUrlInput] =
    useState('')

  const [submitting, setSubmitting] =
    useState(false)

  const [removingId, setRemovingId] =
    useState<string | null>(null)

    const [inspectingId, setInspectingId] =
    useState<string | null>(null)

  const [
    inspectionResults,
    setInspectionResults,
  ] = useState<
    Record<
      string,
      SubscriptionInspection
    >
  >({})

  const [message, setMessage] =
    useState<{
      type: 'success' | 'error'
      text: string
    } | null>(null)

  async function handleAddSubscription() {
    if (submitting) {
      return
    }

    setSubmitting(true)
    setMessage(null)

    const result =
      await onAddSubscription(
        nameInput,
        urlInput,
      )

    setSubmitting(false)

    if (!result.success) {
      setMessage({
        type: 'error',
        text: result.error,
      })

      return
    }

    setNameInput('')
    setUrlInput('')

    setMessage({
      type: 'success',
      text: 'اشتراک با موفقیت و به‌صورت امن ذخیره شد.',
    })
  }

  async function handleRemoveSubscription(
    subscriptionId: string,
  ) {
    if (removingId) {
      return
    }

    setRemovingId(subscriptionId)
    setMessage(null)

    const result =
      await onRemoveSubscription(
        subscriptionId,
      )

    setRemovingId(null)

    if (!result.success) {
      setMessage({
        type: 'error',
        text: result.error,
      })

      return
    }

    setMessage({
      type: 'success',
      text: 'اشتراک حذف شد.',
    })
  }

    async function handleInspectSubscription(
    subscriptionId: string,
  ) {
    if (inspectingId) {
      return
    }

    setInspectingId(subscriptionId)
    setMessage(null)

    const result =
      await onInspectSubscription(
        subscriptionId,
      )

    setInspectionResults(
      (currentResults) => ({
        ...currentResults,
        [subscriptionId]: result,
      }),
    )

    setInspectingId(null)

    if (!result.success) {
      setMessage({
        type: 'error',
        text:
          result.error ??
          'بررسی اشتراک ناموفق بود.',
      })

      return
    }

    setMessage({
      type: 'success',
      text:
        'اشتراک با موفقیت دریافت و تحلیل شد.',
    })
  }

  function handleUrlKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === 'Enter') {
      void handleAddSubscription()
    }
  }

  return (
    <div className="page-stack">
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              منبع کانفیگ
            </span>

            <h3>افزودن اشتراک امن</h3>
          </div>

          <span className="count-badge">
            {subscriptions.length} اشتراک
          </span>
        </div>

        <label
          className="field-label"
          htmlFor="subscription-name"
        >
          نام دلخواه
        </label>

        <input
          id="subscription-name"
          className="text-input"
          placeholder="مثلاً اشتراک شخصی من"
          type="text"
          value={nameInput}
          onChange={(event) => {
            setNameInput(
              event.target.value,
            )
            setMessage(null)
          }}
        />

        <label
          className="field-label subscription-url-label"
          htmlFor="subscription-url"
        >
          آدرس اشتراک
        </label>

        <div className="input-action-row">
          <input
            id="subscription-url"
            className="text-input"
            dir="ltr"
            placeholder="https://example.com/subscription"
            type="password"
            value={urlInput}
            onChange={(event) => {
              setUrlInput(
                event.target.value,
              )
              setMessage(null)
            }}
            onKeyDown={handleUrlKeyDown}
            autoComplete="off"
            spellCheck={false}
          />

          <button
            className="primary-button"
            type="button"
            disabled={submitting}
            onClick={() => {
              void handleAddSubscription()
            }}
          >
            {submitting
              ? 'در حال ذخیره...'
              : 'افزودن'}
          </button>
        </div>

        <p className="field-help">
          لینک اشتراک در فایل داده برنامه به‌صورت
          رمزگذاری‌شده ذخیره می‌شود. اصل لینک پس از
          ذخیره در این صفحه نمایش داده نخواهد شد.
        </p>

        {message && (
          <div
            className={
              message.type === 'success'
                ? 'form-message form-message-success'
                : 'form-message form-message-error'
            }
          >
            {message.text}
          </div>
        )}

        {loadError && (
          <div className="form-message form-message-error">
            {loadError}
          </div>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              اشتراک‌های ذخیره‌شده
            </span>

            <h3>منابع کانفیگ</h3>
          </div>
        </div>

        {loading ? (
          <div className="subscription-loading">
            در حال خواندن اشتراک‌ها...
          </div>
        ) : subscriptions.length > 0 ? (
          <div className="subscription-list">
            {subscriptions.map(
              (subscription) => (
                <article
                  className="subscription-item"
                  key={subscription.id}
                >
                  <div className="subscription-icon">
                    ↧
                  </div>

                  <div className="subscription-main">
                    <strong>
                      {subscription.name}
                    </strong>

                    <span dir="ltr">
                      {subscription.host}
                    </span>

                    <small>
                      لینک ذخیره‌شده و مخفی است
                    </small>
                  </div>

                  <div className="subscription-actions">
                    <span className="secure-badge">
                      امن
                    </span>

                    <button
  className="inspect-subscription-button"
  type="button"
  disabled={
    inspectingId === subscription.id
  }
  onClick={() => {
    void handleInspectSubscription(
      subscription.id,
    )
  }}
>
  {inspectingId === subscription.id
    ? 'در حال بررسی...'
    : 'بررسی اشتراک'}
</button>

                    <button
                      className="remove-domain-button"
                      type="button"
                      disabled={
                        removingId ===
                        subscription.id
                      }
                      onClick={() => {
                        void handleRemoveSubscription(
                          subscription.id,
                        )
                      }}
                    >
                      {removingId ===
                      subscription.id
                        ? 'در حال حذف...'
                        : 'حذف'}
                    </button>
                  </div>


                  {inspectionResults[
  subscription.id
] && (
  <SubscriptionInspectionPanel
    inspection={
      inspectionResults[
        subscription.id
      ]
    }
  />
)}
                </article>
              ),
            )}
          </div>
        ) : (
          <div className="empty-domain-list">
            <span>↧</span>
            <strong>
              اشتراکی ثبت نشده است
            </strong>

            <p>
              لینک شخصی خودت را از فرم بالا اضافه کن.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

type DirectSitesPageProps = {
  domains: string[]
  onAddDomain: (
    rawInput: string,
  ) =>
    | {
        success: true
        domain: string
      }
    | {
        success: false
        error: string
      }
  onRemoveDomain: (domain: string) => void
  onResetDomains: () => void
}

function SubscriptionInspectionPanel({
  inspection,
}: {
  inspection: SubscriptionInspection
}) {
  return (
    <div
      className={
        inspection.success
          ? 'subscription-inspection subscription-inspection-success'
          : 'subscription-inspection subscription-inspection-error'
      }
    >
      <div className="inspection-heading">
        <strong>
          {inspection.success
            ? 'نتیجه بررسی موفق'
            : 'بررسی ناموفق'}
        </strong>

        <span>
          {formatInspectionDate(
            inspection.checkedAt,
          )}
        </span>
      </div>

      <div className="inspection-grid">
        <InspectionValue
          label="وضعیت HTTP"
          value={
            inspection.httpStatus
              ? String(
                  inspection.httpStatus,
                )
              : '—'
          }
        />

        <InspectionValue
          label="نوع محتوا"
          value={formatSubscriptionFormat(
            inspection.format,
          )}
        />

        <InspectionValue
          label="تعداد کانفیگ"
          value={String(
            inspection.configCount,
          )}
        />

        <InspectionValue
          label="حجم پاسخ"
          value={formatByteSize(
            inspection.responseSize,
          )}
        />
      </div>

      {inspection.contentType && (
        <p
          className="inspection-content-type"
          dir="ltr"
        >
          {inspection.contentType}
        </p>
      )}

      {inspection.error && (
        <p className="inspection-error-message">
          {inspection.error}
        </p>
      )}
    </div>
  )
}

function InspectionValue({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="inspection-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function formatByteSize(
  bytes: number | null,
) {
  if (bytes === null) {
    return '—'
  }

  if (bytes < 1024) {
    return `${bytes} بایت`
  }

  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} کیلوبایت`
  }

  return `${(
    bytes /
    (1024 * 1024)
  ).toFixed(2)} مگابایت`
}

function formatSubscriptionFormat(
  format: string,
) {
  const labels: Record<string, string> = {
    'uri-list': 'فهرست لینک‌ها',
    'base64-uri-list':
      'فهرست Base64',
    json: 'JSON',
    'base64-json': 'JSON رمزگذاری‌شده',
    'base64-unknown':
      'Base64 ناشناخته',
    unknown: 'ناشناخته',
    empty: 'خالی',
    timeout: 'پایان زمان',
    'http-error': 'خطای HTTP',
    'network-error': 'خطای شبکه',
    'internal-error': 'خطای داخلی',
    'renderer-error': 'خطای رابط',
  }

  return labels[format] ?? format
}

function formatInspectionDate(
  isoDate: string,
) {
  try {
    return new Intl.DateTimeFormat(
      'fa-IR',
      {
        hour: '2-digit',
        minute: '2-digit',
      },
    ).format(new Date(isoDate))
  } catch {
    return 'همین حالا'
  }
}

function DirectSitesPage({
  domains,
  onAddDomain,
  onRemoveDomain,
  onResetDomains,
}: DirectSitesPageProps) {
  const [domainInput, setDomainInput] = useState('')
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  function handleAddDomain() {
    const result = onAddDomain(domainInput)

    if (!result.success) {
      setMessage({
        type: 'error',
        text: result.error,
      })

      return
    }

    setDomainInput('')
    setMessage({
      type: 'success',
      text: `${result.domain} به فهرست سایت‌های مستقیم اضافه شد.`,
    })
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      handleAddDomain()
    }
  }

  function handleRemoveDomain(domain: string) {
    onRemoveDomain(domain)

    setMessage({
      type: 'success',
      text: `${domain} از فهرست حذف شد.`,
    })
  }

  function handleResetDomains() {
    onResetDomains()

    setMessage({
      type: 'success',
      text: 'فهرست اولیه سایت‌های مستقیم بازیابی شد.',
    })
  }

  return (
    <div className="page-stack">
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">Split Tunnel</span>
            <h3>افزودن سایت بدون VPN</h3>
          </div>

          <span className="count-badge">
            {domains.length} دامنه
          </span>
        </div>

        <div className="input-action-row">
          <input
            className="text-input"
            dir="ltr"
            placeholder="https://example.ir یا example.ir"
            type="text"
            value={domainInput}
            onChange={(event) => {
              setDomainInput(event.target.value)
              setMessage(null)
            }}
            onKeyDown={handleKeyDown}
          />

          <button
            className="primary-button"
            type="button"
            onClick={handleAddDomain}
          >
            افزودن
          </button>
        </div>

        <p className="field-help">
          می‌توانی آدرس را با https، بدون https، همراه مسیر کامل یا
          با پیشوند domain وارد کنی. برنامه نام دامنه را خودکار
          استخراج می‌کند.
        </p>

        {message && (
          <div
            className={
              message.type === 'success'
                ? 'form-message form-message-success'
                : 'form-message form-message-error'
            }
          >
            {message.text}
          </div>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">مسیر مستقیم</span>
            <h3>دامنه‌های ثبت‌شده</h3>
          </div>

          <button
            className="text-button"
            type="button"
            onClick={handleResetDomains}
          >
            بازیابی فهرست اولیه
          </button>
        </div>

        {domains.length > 0 ? (
          <div className="domain-management-list">
            {domains.map((domain) => (
              <div
                className="domain-management-item"
                key={domain}
              >
                <div className="domain-management-main">
                  <span className="domain-preview-check">✓</span>

                  <div>
                    <strong dir="ltr">{domain}</strong>
                    <span>دامنه و تمام زیردامنه‌ها</span>
                  </div>
                </div>

                <div className="domain-management-actions">
                  <span className="direct-badge">مستقیم</span>

                  <button
                    className="remove-domain-button"
                    type="button"
                    aria-label={`حذف ${domain}`}
                    title="حذف دامنه"
                    onClick={() => handleRemoveDomain(domain)}
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-domain-list">
            <span>↗</span>
            <strong>فهرست خالی است</strong>
            <p>یک آدرس سایت وارد کن تا بدون VPN باز شود.</p>
          </div>
        )}
      </section>
    </div>
  )
}

function RescuePage() {
  const rescueMethods = [
    {
      name: 'Fragment',
      description: 'تقسیم کنترل‌شده بسته‌های TLS',
      status: 'در آینده',
    },
    {
      name: 'SNI Rescue',
      description: 'راهکار کمکی برای شرایط DPI شدید',
      status: 'در آینده',
    },
    {
      name: 'Serverless',
      description: 'واردکردن Profileهای بررسی‌شده',
      status: 'در آینده',
    },
    {
      name: 'Tor Bridges',
      description: 'Snowflake، WebTunnel و Bridge',
      status: 'در آینده',
    },
  ]

  return (
    <div className="page-stack">
      <section className="rescue-header-card">
        <span className="rescue-header-icon">✦</span>

        <div>
          <span className="panel-kicker">Emergency Connection</span>
          <h2>پیداکردن راهکار مناسب برای شبکه فعلی</h2>
          <p>
            این بخش بعداً وضعیت DNS، TCP، UDP و TLS را بررسی می‌کند
            و روش قابل‌استفاده را پیشنهاد می‌دهد.
          </p>
        </div>

        <button className="primary-button" type="button" disabled>
          شروع بررسی
        </button>
      </section>

      <section className="rescue-method-grid">
        {rescueMethods.map((method) => (
          <article className="rescue-method-card" key={method.name}>
            <div className="rescue-method-top">
              <span>◇</span>
              <small>{method.status}</small>
            </div>

            <h3>{method.name}</h3>
            <p>{method.description}</p>
          </article>
        ))}
      </section>
    </div>
  )
}

function StatisticsPage() {
  return (
    <div className="page-stack">
      <section className="quick-statistics">
        <article className="statistic-card">
          <span className="statistic-icon">↓</span>
          <div>
            <span className="statistic-label">دانلود</span>
            <strong>۰ مگابایت</strong>
          </div>
        </article>

        <article className="statistic-card">
          <span className="statistic-icon">↑</span>
          <div>
            <span className="statistic-label">آپلود</span>
            <strong>۰ مگابایت</strong>
          </div>
        </article>

        <article className="statistic-card">
          <span className="statistic-icon">◷</span>
          <div>
            <span className="statistic-label">مدت اتصال</span>
            <strong>۰۰:۰۰:۰۰</strong>
          </div>
        </article>
      </section>

      <EmptyPage
        icon="▥"
        title="هنوز آماری وجود ندارد"
        description="آمار این بخش فقط از داده‌های واقعی هسته اتصال خوانده خواهد شد؛ هیچ عدد ساختگی نمایش داده نمی‌شود."
      />
    </div>
  )
}

function LogsPage() {
  return (
    <section className="panel-card log-panel">
      <div className="panel-heading">
        <div>
          <span className="panel-kicker">Application Log</span>
          <h3>گزارش برنامه</h3>
        </div>

        <button className="text-button" type="button">
          پاک‌کردن
        </button>
      </div>

      <div className="log-viewer" dir="ltr">
        <div>
          <span>INFO</span>
          <p>HamidsDeutsch Connect interface started.</p>
        </div>

        <div>
          <span>INFO</span>
          <p>Electron secure shell is ready.</p>
        </div>

        <div>
          <span>WAIT</span>
          <p>Network engine has not been installed yet.</p>
        </div>
      </div>
    </section>
  )
}

function SettingsPage() {
  return (
    <div className="page-stack">
      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">عمومی</span>
            <h3>تنظیمات برنامه</h3>
          </div>
        </div>

        <SettingRow
          title="اتصال خودکار"
          description="پس از اجرای برنامه، آخرین اتصال سالم بررسی شود."
        />

        <SettingRow
          title="حالت TUN"
          description="تمام ترافیک سازگار سیستم از تونل عبور کند."
          checked
        />

        <SettingRow
          title="بررسی تغییر IP"
          description="اتصال فقط پس از تغییر واقعی IP موفق شناخته شود."
          checked
        />
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">ظاهر</span>
            <h3>نمای برنامه</h3>
          </div>
        </div>

        <SettingRow
          title="حالت تیره"
          description="رابط تیره HamidsDeutsch Connect"
          checked
        />
      </section>
    </div>
  )
}

function SettingRow({
  title,
  description,
  checked = false,
}: {
  title: string
  description: string
  checked?: boolean
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>

      <label className="switch">
        <input defaultChecked={checked} type="checkbox" />
        <span className="switch-track" />
      </label>
    </div>
  )
}

export default App