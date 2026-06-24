const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
} = require('electron')

const path = require('node:path')
const fs = require('node:fs')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const {
  addSubscription,
  listSubscriptions,
  removeSubscription,
} = require('./subscription-store.cjs')

const execFileAsync = promisify(execFile)

const isDevelopment = !app.isPackaged

let mainWindow = null

console.log('[Electron] Main process started')
console.log('[Electron] Development mode:', isDevelopment)

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
  const enginePath = getEnginePath()

  console.log('[Engine] Checking path:', enginePath)

  const exists = fs.existsSync(enginePath)

  console.log('[Engine] File exists:', exists)

  if (!exists) {
    return {
      installed: false,
      healthy: false,
      path: enginePath,
      version: null,
      architecture: null,
      error: 'فایل sing-box.exe پیدا نشد.',
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(
      enginePath,
      ['version'],
      {
        windowsHide: true,
        timeout: 10000,
        encoding: 'utf8',
      },
    )

    const output = `${stdout}\n${stderr}`.trim()

    const versionMatch = output.match(
      /sing-box version\s+([^\s]+)/i,
    )

    const environmentMatch = output.match(
      /Environment:\s+[^\s]+\s+([^\r\n]+)/i,
    )

    return {
      installed: true,
      healthy: true,
      path: enginePath,
      version: versionMatch?.[1] ?? 'نامشخص',
      architecture:
        environmentMatch?.[1]?.trim() ?? null,
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

function registerIpcHandlers() {
  ipcMain.handle(
    'engine:get-info',
    async () => {
      return getEngineInfo()
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
          await addSubscription(input)

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
    async (_event, subscriptionId) => {
      try {
        await removeSubscription(
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
}

function createMainWindow() {
  console.log('[Electron] Creating main window...')

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,
    show: true,
    backgroundColor: '#090b10',
    title: 'HamidsDeutsch Connect',
    autoHideMenuBar: true,

    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
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

  mainWindow.webContents.setWindowOpenHandler(
    ({ url }) => {
      if (url.startsWith('https://')) {
        void shell.openExternal(url)
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
        url.startsWith(developmentUrl)
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
    const productionFile = path.join(
      __dirname,
      '..',
      'dist',
      'index.html',
    )

    console.log(
      '[Electron] Loading:',
      productionFile,
    )

    void mainWindow.loadFile(productionFile)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  console.log('[Electron] Application is ready')

  registerIpcHandlers()
  createMainWindow()

  app.on('activate', () => {
    if (
      BrowserWindow.getAllWindows().length === 0
    ) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})