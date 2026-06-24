const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
} = require('electron')

const path = require('node:path')
const fs = require('node:fs')
const {
  execFile,
} = require('node:child_process')
const {
  promisify,
} = require('node:util')

const {
  addSubscription,
  getSubscriptionUrl,
  listSubscriptions,
  removeSubscription,
} = require('./subscription-store.cjs')

const {
  inspectSubscriptionUrl,
  loadSubscriptionNodeRecords,
} = require('./subscription-inspector.cjs')

const {
  testServerBatch,
} = require('./server-latency.cjs')

const {
  createAndCheckConfig,
} = require('./sing-box-config-service.cjs')

const {
  startLocalProxy,
  activateSystemProxy,
  deactivateSystemProxy,
  stopLocalProxy,
  getProcessStatus,
  disposeProcessManager,
} = require('./sing-box-process-manager.cjs')

const {
  verifyIpChange,
} = require('./ip-verification-service.cjs')

const {
  replaceSubscriptionNodes,
  getSubscriptionNodeUri,
  removeSubscriptionNodes,
  clearSubscriptionNodeCache,
} = require('./subscription-node-cache.cjs')

const execFileAsync =
  promisify(execFile)

const isDevelopment =
  !app.isPackaged

let mainWindow = null
let isQuitting = false

console.log(
  '[Electron] Main process started',
)

console.log(
  '[Electron] Development mode:',
  isDevelopment,
)

function getEnginePath() {
  if (isDevelopment) {
    return path.join(
      __dirname,
      '..',
      'resources',
      'sing-box',
      'sing-box.exe',
    )
  }

  return path.join(
    process.resourcesPath,
    'sing-box',
    'sing-box.exe',
  )
}

async function getEngineInfo() {
  const enginePath =
    getEnginePath()

  console.log(
    '[Engine] Checking path:',
    enginePath,
  )

  const exists =
    fs.existsSync(enginePath)

  console.log(
    '[Engine] File exists:',
    exists,
  )

  if (!exists) {
    return {
      installed: false,
      healthy: false,
      path: enginePath,
      version: null,
      architecture: null,
      error:
        'فایل sing-box.exe پیدا نشد.',
    }
  }

  try {
    const {
      stdout,
      stderr,
    } = await execFileAsync(
      enginePath,
      ['version'],
      {
        windowsHide: true,
        timeout: 10000,
        encoding: 'utf8',
      },
    )

    const output =
      `${stdout}\n${stderr}`.trim()

    const versionMatch =
      output.match(
        /sing-box version\s+([^\s]+)/i,
      )

    const environmentMatch =
      output.match(
        /Environment:\s+[^\s]+\s+([^\r\n]+)/i,
      )

    return {
      installed: true,
      healthy: true,
      path: enginePath,
      version:
        versionMatch?.[1] ??
        'نامشخص',
      architecture:
        environmentMatch?.[1]
          ?.trim() ?? null,
      error: null,
    }
  } catch (error) {
    console.error(
      '[Engine] Version check failed:',
      error,
    )

    return {
      installed: true,
      healthy: false,
      path: enginePath,
      version: null,
      architecture: null,
      error:
        error instanceof Error
          ? error.message
          : 'اجرای sing-box با خطا مواجه شد.',
    }
  }
}

function createProcessErrorResult(
  error,
) {
  return {
    success: false,
    ...getProcessStatus(),
    error:
      error instanceof Error
        ? error.message
        : 'عملیات sing-box ناموفق بود.',
  }
}

function registerIpcHandlers() {
  ipcMain.handle(
    'engine:get-info',
    async () => {
      return getEngineInfo()
    },
  )

  ipcMain.handle(
    'engine:start-local-proxy',
    async () => {
      try {
        const result =
          await startLocalProxy({
            enginePath:
              getEnginePath(),
            userDataPath:
              app.getPath(
                'userData',
              ),
          })

        console.log(
          '[Engine] Local proxy start:',
          result.success,
          result.ready,
        )

        return result
      } catch (error) {
        console.error(
          '[Engine] Local proxy start failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return createProcessErrorResult(
          error,
        )
      }
    },
  )

  ipcMain.handle(
    'engine:activate-system-proxy',
    async () => {
      try {
        const result =
          await activateSystemProxy({
            enginePath:
              getEnginePath(),
            userDataPath:
              app.getPath(
                'userData',
              ),
          })

        console.log(
          '[Engine] System proxy activation:',
          result.success,
          result.systemProxyEnabled,
        )

        return result
      } catch (error) {
        console.error(
          '[Engine] System proxy activation failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return createProcessErrorResult(
          error,
        )
      }
    },
  )

  ipcMain.handle(
    'engine:deactivate-system-proxy',
    async (
      _event,
      keepLocalProxy,
    ) => {
      try {
        const result =
          await deactivateSystemProxy({
            enginePath:
              getEnginePath(),
            userDataPath:
              app.getPath(
                'userData',
              ),
            keepLocalProxy:
              Boolean(
                keepLocalProxy,
              ),
          })

        console.log(
          '[Engine] System proxy deactivation:',
          result.success,
        )

        return result
      } catch (error) {
        console.error(
          '[Engine] System proxy deactivation failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return createProcessErrorResult(
          error,
        )
      }
    },
  )

  ipcMain.handle(
    'engine:stop-local-proxy',
    async () => {
      try {
        const result =
          await stopLocalProxy()

        console.log(
          '[Engine] Local proxy stop:',
          result.success,
        )

        return result
      } catch (error) {
        console.error(
          '[Engine] Local proxy stop failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return createProcessErrorResult(
          error,
        )
      }
    },
  )

  ipcMain.handle(
    'engine:get-process-status',
    async () => {
      return getProcessStatus()
    },
  )

  ipcMain.handle(
    'network:verify-ip-change',
    async () => {
      const processStatus =
        getProcessStatus()

      if (
        !processStatus.running ||
        !processStatus.ready
      ) {
        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          directIp: null,
          proxyIp: null,
          changed: false,
          directDurationMs: null,
          proxyDurationMs: null,
          service:
            'api.ipify.org',
          error:
            'پروکسی محلی هنوز آماده نیست.',
        }
      }

      try {
        const result =
          await verifyIpChange({
            proxyHost:
              processStatus.localHost,
            proxyPort:
              processStatus.localPort,
          })

        console.log(
          '[Network] IP verification:',
          result.changed,
          result.directIp,
          result.proxyIp,
        )

        return result
      } catch (error) {
        console.error(
          '[Network] IP verification failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          directIp: null,
          proxyIp: null,
          changed: false,
          directDurationMs: null,
          proxyDurationMs: null,
          service:
            'api.ipify.org',
          error:
            error instanceof Error
              ? error.message
              : 'بررسی تغییر IP ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'subscriptions:list',
    async () => {
      return listSubscriptions()
    },
  )

  ipcMain.handle(
    'subscriptions:add',
    async (_event, input) => {
      try {
        const subscription =
          await addSubscription(
            input,
          )

        return {
          success: true,
          subscription,
          error: null,
        }
      } catch (error) {
        console.error(
          '[Subscriptions] Add failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          subscription: null,
          error:
            error instanceof Error
              ? error.message
              : 'ثبت اشتراک با خطا مواجه شد.',
        }
      }
    },
  )

  ipcMain.handle(
    'subscriptions:remove',
    async (
      _event,
      subscriptionId,
    ) => {
      try {
        await removeSubscription(
          subscriptionId,
        )

        removeSubscriptionNodes(
          subscriptionId,
        )

        return {
          success: true,
          error: null,
        }
      } catch (error) {
        console.error(
          '[Subscriptions] Remove failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'حذف اشتراک با خطا مواجه شد.',
        }
      }
    },
  )

  ipcMain.handle(
    'subscriptions:inspect',
    async (
      _event,
      subscriptionId,
    ) => {
      try {
        const subscriptionUrl =
          await getSubscriptionUrl(
            subscriptionId,
          )

        const inspection =
          await inspectSubscriptionUrl(
            subscriptionUrl,
          )

        console.log(
          '[Subscriptions] Inspection completed:',
          subscriptionId,
          inspection.success,
        )

        return inspection
      } catch (error) {
        console.error(
          '[Subscriptions] Inspection failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          httpStatus: null,
          httpStatusText: null,
          contentType: null,
          responseSize: null,
          format:
            'internal-error',
          configCount: 0,
          error:
            error instanceof Error
              ? error.message
              : 'بررسی اشتراک با خطا مواجه شد.',
        }
      }
    },
  )

  ipcMain.handle(
    'subscriptions:load-nodes',
    async (
      _event,
      subscriptionId,
    ) => {
      try {
        const subscriptionUrl =
          await getSubscriptionUrl(
            subscriptionId,
          )

        const result =
          await loadSubscriptionNodeRecords(
            subscriptionUrl,
          )

        if (result.success) {
          replaceSubscriptionNodes(
            subscriptionId,
            result.records,
          )
        }

        console.log(
          '[Subscriptions] Safe nodes loaded:',
          subscriptionId,
          result.nodes.length,
        )

        return {
          success:
            result.success,
          checkedAt:
            result.checkedAt,
          nodes:
            result.nodes,
          error:
            result.error,
        }
      } catch (error) {
        console.error(
          '[Subscriptions] Loading nodes failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          nodes: [],
          error:
            error instanceof Error
              ? error.message
              : 'دریافت سرورها با خطا مواجه شد.',
        }
      }
    },
  )

  ipcMain.handle(
    'servers:test-latency',
    async (
      _event,
      servers,
    ) => {
      try {
        const result =
          await testServerBatch(
            servers,
          )

        console.log(
          '[Servers] Latency test completed:',
          result.total,
          result.reachable,
        )

        return {
          success: true,
          ...result,
          error: null,
        }
      } catch (error) {
        console.error(
          '[Servers] Latency test failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          total: 0,
          reachable: 0,
          unreachable: 0,
          fastestServerId: null,
          fastestLatencyMs: null,
          results: [],
          error:
            error instanceof Error
              ? error.message
              : 'بررسی تأخیر سرورها ناموفق بود.',
        }
      }
    },
  )

  ipcMain.handle(
    'servers:check-config',
    async (_event, input) => {
      try {
        const subscriptionId =
          input?.subscriptionId

        const nodeId =
          input?.nodeId

        const directDomains =
          Array.isArray(
            input?.directDomains,
          )
            ? input.directDomains
            : []

        const subscriptionUrl =
          await getSubscriptionUrl(
            subscriptionId,
          )

        const cachedNodeUri =
          getSubscriptionNodeUri(
            subscriptionId,
            nodeId,
          )

        if (!cachedNodeUri) {
          const refreshed =
            await loadSubscriptionNodeRecords(
              subscriptionUrl,
            )

          if (refreshed.success) {
            replaceSubscriptionNodes(
              subscriptionId,
              refreshed.records,
            )
          }
        }

        const nodeUri =
          getSubscriptionNodeUri(
            subscriptionId,
            nodeId,
          )

        if (!nodeUri) {
          throw new Error(
            'سرور انتخاب‌شده دیگر در حافظه امن اشتراک وجود ندارد. فهرست سرورها را یک‌بار تازه‌سازی کن.',
          )
        }

        const result =
          await createAndCheckConfig({
            subscriptionUrl,
            nodeId,
            nodeUri,
            enginePath:
              getEnginePath(),
            userDataPath:
              app.getPath(
                'userData',
              ),
            directDomains,
          })

        console.log(
          '[Servers] Config check completed:',
          nodeId,
          result.success,
        )

        return result
      } catch (error) {
        console.error(
          '[Servers] Config check failed:',
          error instanceof Error
            ? error.message
            : 'Unknown error',
        )

        return {
          success: false,
          checkedAt:
            new Date().toISOString(),
          nodeId:
            typeof input?.nodeId ===
            'string'
              ? input.nodeId
              : null,
          protocol: null,
          server: null,
          serverPort: null,
          configPath: null,
          directDomainCount: 0,
          stdout: '',
          error:
            error instanceof Error
              ? error.message
              : 'اعتبارسنجی کانفیگ ناموفق بود.',
        }
      }
    },
  )
}

function createMainWindow() {
  console.log(
    '[Electron] Creating main window...',
  )

  mainWindow =
    new BrowserWindow({
      width: 1180,
      height: 760,
      minWidth: 960,
      minHeight: 640,
      show: true,
      backgroundColor:
        '#090b10',
      title:
        'HamidsDeutsch Connect',
      autoHideMenuBar: true,

      webPreferences: {
        preload: path.join(
          __dirname,
          'preload.cjs',
        ),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    })

  mainWindow.webContents.on(
    'did-finish-load',
    () => {
      console.log(
        '[Electron] Page loaded successfully',
      )
    },
  )

  mainWindow.webContents.on(
    'did-fail-load',
    (
      _event,
      errorCode,
      errorDescription,
      validatedURL,
    ) => {
      console.error(
        '[Electron] Page failed to load',
      )

      console.error(
        'Error code:',
        errorCode,
      )

      console.error(
        'Description:',
        errorDescription,
      )

      console.error(
        'URL:',
        validatedURL,
      )
    },
  )

  mainWindow.webContents.on(
    'render-process-gone',
    (_event, details) => {
      console.error(
        '[Electron] Renderer process stopped:',
        details,
      )
    },
  )

  mainWindow.webContents
    .setWindowOpenHandler(
      ({ url }) => {
        if (
          url.startsWith(
            'https://',
          )
        ) {
          void shell.openExternal(
            url,
          )
        }

        return {
          action: 'deny',
        }
      },
    )

  mainWindow.webContents.on(
    'will-navigate',
    (event, url) => {
      const developmentUrl =
        'http://localhost:5173'

      if (
        isDevelopment &&
        url.startsWith(
          developmentUrl,
        )
      ) {
        return
      }

      event.preventDefault()
    },
  )

  if (isDevelopment) {
    console.log(
      '[Electron] Loading http://localhost:5173',
    )

    void mainWindow.loadURL(
      'http://localhost:5173',
    )
  } else {
    const productionFile =
      path.join(
        __dirname,
        '..',
        'dist',
        'index.html',
      )

    console.log(
      '[Electron] Loading:',
      productionFile,
    )

    void mainWindow.loadFile(
      productionFile,
    )
  }

  mainWindow.on(
    'closed',
    () => {
      mainWindow = null
    },
  )
}

app.whenReady().then(() => {
  console.log(
    '[Electron] Application is ready',
  )

  registerIpcHandlers()
  createMainWindow()

  app.on(
    'activate',
    () => {
      if (
        BrowserWindow
          .getAllWindows()
          .length === 0
      ) {
        createMainWindow()
      }
    },
  )
})

app.on(
  'before-quit',
  (event) => {
    if (isQuitting) {
      return
    }

    const status =
      getProcessStatus()

    if (!status.running) {
      isQuitting = true
      return
    }

    event.preventDefault()
    isQuitting = true

    void disposeProcessManager({
      userDataPath:
        app.getPath(
          'userData',
        ),
    }).finally(() => {
      clearSubscriptionNodeCache()
      app.quit()
    })
  },
)

app.on(
  'window-all-closed',
  () => {
    if (
      process.platform !==
      'darwin'
    ) {
      app.quit()
    }
  },
)
