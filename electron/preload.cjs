const {
  contextBridge,
  ipcRenderer,
} = require('electron')

contextBridge.exposeInMainWorld(
  'hamidsDeutsch',
  {
    appName: 'HamidsDeutsch Connect',
    platform: process.platform,

    engine: {
      getInfo: () =>
        ipcRenderer.invoke(
          'engine:get-info',
        ),
    },

    subscriptions: {
      list: () =>
        ipcRenderer.invoke(
          'subscriptions:list',
        ),

      add: (input) =>
        ipcRenderer.invoke(
          'subscriptions:add',
          input,
        ),

      remove: (subscriptionId) =>
        ipcRenderer.invoke(
          'subscriptions:remove',
          subscriptionId,
        ),
    },
  },
)