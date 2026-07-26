import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Application render failed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <main className="fatal-error" role="alert">
        <img src="/logo.png" alt="" className="fatal-error-logo" />
        <h1>Manfaz VPN</h1>
        <p>رابط برنامه با خطای غیرمنتظره روبه‌رو شد.</p>
        <details className="fatal-error-detail">
          <summary>نمایش جزئیات فنی</summary>
          <code>{this.state.error.message}</code>
        </details>
        <button type="button" onClick={() => window.location.reload()}>
          بارگذاری دوباره
        </button>
      </main>
    )
  }
}
