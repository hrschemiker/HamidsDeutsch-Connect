const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hamidsDeutsch', {
  appName: 'HamidsDeutsch Connect',
  platform: process.platform,

  engine: {
    getInfo: () => ipcRenderer.invoke('engine:get-info'),
  },
})