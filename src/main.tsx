import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AppErrorBoundary from './AppErrorBoundary.tsx'

async function bootstrap() {
  if (import.meta.env.DEV && !window.hamidsDeutsch) {
    const { installDevelopmentElectronMock } = await import('./dev-electron-mock')
    installDevelopmentElectronMock()
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <AppErrorBoundary>
        <App />
      </AppErrorBoundary>
    </StrictMode>,
  )
}

void bootstrap()
