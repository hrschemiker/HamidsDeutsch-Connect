const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

const isDevelopment = !app.isPackaged
let mainWindow = null

console.log('[Electron] Main process started')
console.log('[Electron] Development mode:', isDevelopment)

function createMainWindow() {
  console.log('[Electron] Creating main window...')

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 960,
    minHeight: 640,

    // فعلاً پنجره را از ابتدا نشان می‌دهیم
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
      console.log('[Electron] Page loaded successfully')
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
      console.error('[Electron] Page failed to load')
      console.error('Error code:', errorCode)
      console.error('Description:', errorDescription)
      console.error('URL:', validatedURL)
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url)
    }

    return {
      action: 'deny',
    }
  })

  mainWindow.webContents.on(
    'will-navigate',
    (event, url) => {
      const developmentUrl = 'http://localhost:5173'

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

    mainWindow.loadURL(
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

    mainWindow.loadFile(productionFile)
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  console.log('[Electron] Application is ready')
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

app.on('certificate-error', (
  event,
  _webContents,
  url,
  error,
) => {
  console.error(
    '[Electron] Certificate error:',
    url,
    error,
  )

  event.preventDefault()
})