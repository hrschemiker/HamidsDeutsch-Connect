import { useCallback, useEffect, useState } from 'react'

export type EngineInfo = {
  installed: boolean
  healthy: boolean
  path: string
  version: string | null
  architecture: string | null
  error: string | null
}

type EngineInfoState = {
  loading: boolean
  info: EngineInfo | null
}

export function useEngineInfo() {
  const [state, setState] = useState<EngineInfoState>({
    loading: true,
    info: null,
  })

  const refresh = useCallback(async () => {
    setState((currentState) => ({
      ...currentState,
      loading: true,
    }))

    try {
      if (!window.hamidsDeutsch?.engine) {
        setState({
          loading: false,
          info: {
            installed: false,
            healthy: false,
            path: '',
            version: null,
            architecture: null,
            error:
              'ارتباط امن با Electron در دسترس نیست.',
          },
        })

        return
      }

      const engineInfo =
        await window.hamidsDeutsch.engine.getInfo()

      setState({
        loading: false,
        info: engineInfo,
      })
    } catch (error) {
      setState({
        loading: false,
        info: {
          installed: false,
          healthy: false,
          path: '',
          version: null,
          architecture: null,
          error:
            error instanceof Error
              ? error.message
              : 'بررسی هسته با خطا مواجه شد.',
        },
      })
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return {
    loading: state.loading,
    info: state.info,
    refresh,
  }
}