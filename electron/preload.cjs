const {
  contextBridge,
  ipcRenderer,
} = require('electron')

contextBridge.exposeInMainWorld(
  'hamidsDeutsch',
  {
    appName:
      'HamidsDeutsch Connect',
    platform:
      process.platform,

    system: {
      getPrivilegeStatus: () =>
        ipcRenderer.invoke(
          'system:get-privilege-status',
        ),

      relaunchAsAdministrator: () =>
        ipcRenderer.invoke(
          'system:relaunch-as-administrator',
        ),

      openVirtualLocationExtension: () =>
        ipcRenderer.invoke(
          'system:open-virtual-location-extension',
        ),

      setVirtualLocationConnected: (
        connected,
      ) =>
        ipcRenderer.invoke(
          'system:set-virtual-location-connected',
          connected,
        ),
    },

    engine: {
      getInfo: () =>
        ipcRenderer.invoke(
          'engine:get-info',
        ),

      checkForUpdate: () =>
        ipcRenderer.invoke(
          'engine:check-for-update',
        ),

      updateToLatest: () =>
        ipcRenderer.invoke(
          'engine:update-to-latest',
        ),

      startLocalProxy: () =>
        ipcRenderer.invoke(
          'engine:start-local-proxy',
        ),

      startTun: () =>
        ipcRenderer.invoke(
          'engine:start-tun',
        ),

      activateSystemProxy: () =>
        ipcRenderer.invoke(
          'engine:activate-system-proxy',
        ),

      deactivateSystemProxy: (
        keepLocalProxy = false,
      ) =>
        ipcRenderer.invoke(
          'engine:deactivate-system-proxy',
          keepLocalProxy,
        ),

      stopLocalProxy: () =>
        ipcRenderer.invoke(
          'engine:stop-local-proxy',
        ),

      getProcessStatus: () =>
        ipcRenderer.invoke(
          'engine:get-process-status',
        ),
    },

    network: {
      verifyIpChange: () =>
        ipcRenderer.invoke(
          'network:verify-ip-change',
        ),

      getCurrentIp: () =>
        ipcRenderer.invoke(
          'network:get-current-ip',
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

      remove: (
        subscriptionId,
      ) =>
        ipcRenderer.invoke(
          'subscriptions:remove',
          subscriptionId,
        ),

      inspect: (
        subscriptionId,
      ) =>
        ipcRenderer.invoke(
          'subscriptions:inspect',
          subscriptionId,
        ),

      loadNodes: (
        subscriptionId,
      ) =>
        ipcRenderer.invoke(
          'subscriptions:load-nodes',
          subscriptionId,
        ),
    },

    servers: {
      testLatency: (servers) =>
        ipcRenderer.invoke(
          'servers:test-latency',
          servers,
        ),

      checkConfig: (input) =>
        ipcRenderer.invoke(
          'servers:check-config',
          input,
        ),

      checkTunConfig: (input) =>
        ipcRenderer.invoke(
          'servers:check-tun-config',
          input,
        ),
    },
  },
)
