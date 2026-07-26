import type { ReactNode, SVGProps } from 'react'

export type BrandIconName =
  | 'home' | 'servers' | 'route' | 'chart' | 'logs' | 'settings'
  | 'info' | 'check' | 'close' | 'lock' | 'shield' | 'bolt'
  | 'play' | 'stop' | 'refresh' | 'clock' | 'copy' | 'star'
  | 'download' | 'update' | 'globe' | 'pulse' | 'app'
  | 'upload' | 'sun' | 'moon' | 'language' | 'repair' | 'power'

type Props = Omit<SVGProps<SVGSVGElement>, 'name'> & {
  name: BrandIconName
  size?: number
}

export function BrandIcon({ name, size = 20, ...props }: Props) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  const paths: Record<BrandIconName, ReactNode> = {
    home: <><path d="m4 10 8-6.5 8 6.5" /><path d="M6.5 9v10h11V9M10 19v-5h4v5" /></>,
    servers: <><rect x="4" y="4" width="16" height="6" rx="2" /><rect x="4" y="14" width="16" height="6" rx="2" /><path d="M8 7h.01M8 17h.01M12 7h5M12 17h5" /></>,
    route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h3a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3h-1" /></>,
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2" /></>,
    logs: <><path d="M8 6h12M8 12h12M8 18h12" /><circle cx="4" cy="6" r=".8" fill="currentColor" stroke="none" /><circle cx="4" cy="12" r=".8" fill="currentColor" stroke="none" /><circle cx="4" cy="18" r=".8" fill="currentColor" stroke="none" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1H10.4a1.7 1.7 0 0 0-.4-1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4v-3.2a1.7 1.7 0 0 0 1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06L7.06 4.2l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1h3.2a1.7 1.7 0 0 0 .4 1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9c.13.38.35.72.6 1 .28.25.62.38 1 .4v3.2a1.7 1.7 0 0 0-1 .4c-.25.28-.47.62-.6 1Z" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    lock: <><rect x="5" y="10" width="14" height="10" rx="3" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v2" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    bolt: <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z" />,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    refresh: <><path d="M20 6v5h-5" /><path d="M18.5 8.5A8 8 0 1 0 20 14" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    copy: <><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    star: <path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" />,
    download: <><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 20h16" /></>,
    update: <><path d="M20 6v5h-5M4 18v-5h5" /><path d="M18.5 8.5A8 8 0 0 0 5 7M5.5 15.5A8 8 0 0 0 19 17" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.3 3 14.7 0 18M12 3c-3 3.3-3 14.7 0 18" /></>,
    pulse: <><circle cx="12" cy="12" r="9" /><path d="M3 12h5l2-4 3 8 2-4h6" /></>,
    app: <><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></>,
    upload: <><path d="M12 21V9M7 14l5-5 5 5" /><path d="M4 4h16" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.65 17.65l1.42 1.42M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.65 6.35l1.42-1.42" /></>,
    moon: <path d="M20 15.4A8.5 8.5 0 0 1 8.6 4a8.5 8.5 0 1 0 11.4 11.4Z" />,
    language: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 3.4 6 2.7 9-.6 3-1.5 6.3-2.7 9M12 3C9.5 5.7 8.6 9 9.3 12c.6 3 1.5 6.3 2.7 9" /></>,
    repair: <><path d="m14.5 6.5 3-3a4 4 0 0 1-5 5L5 16l-2 5 5-2 7.5-7.5a4 4 0 0 1 5-5l-3 3Z" /></>,
    power: <><path d="M12 3v9" /><path d="M7.1 6.4a8 8 0 1 0 9.8 0" /></>,
  }

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden={props['aria-label'] ? undefined : true}
      focusable="false"
      {...common}
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
