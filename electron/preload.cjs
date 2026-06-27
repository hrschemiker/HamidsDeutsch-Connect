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

      setVirtualLocationConnected: (connected) =>
        ipcRenderer.invoke('system:set-virtual-location-connected', connected),

      setDirectDomains: (domains) =>
        ipcRenderer.invoke('system:set-direct-domains', domains),

      downloadExtensionZip: () =>
        ipcRenderer.invoke('system:download-extension-zip'),
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

    bpb: {
      getProfile: () =>
        ipcRenderer.invoke(
          'bpb:get-profile',
        ),

      saveProfile: (input) =>
        ipcRenderer.invoke(
          'bpb:save-profile',
          input,
        ),

      loadNodes: (type) =>
        ipcRenderer.invoke(
          'bpb:load-nodes',
          {
            type,
          },
        ),

      connect: (input) =>
        ipcRenderer.invoke(
          'bpb:connect',
          input,
        ),

      disconnect: () =>
        ipcRenderer.invoke(
          'bpb:disconnect',
        ),

      getStatus: () =>
        ipcRenderer.invoke(
          'bpb:get-status',
        ),

      autoDiscover: (
        panelUrl,
      ) =>
        ipcRenderer.invoke(
          'bpb:auto-discover',
          panelUrl,
        ),

      quickConnect: (
        input,
      ) =>
        ipcRenderer.invoke(
          'bpb:quick-connect',
          input,
        ),

      cloudflare: {
        getStatus: () => ipcRenderer.invoke('bpb-cloudflare:get-status'),
        login: () => ipcRenderer.invoke('bpb-cloudflare:login'),
        deploy: () => ipcRenderer.invoke('bpb-cloudflare:deploy'),
        updatePanel: () => ipcRenderer.invoke('bpb-cloudflare:update-panel'),
        onProgress: (callback) => {
          const listener = (_event, payload) => callback(payload)
          ipcRenderer.on('bpb-cloudflare:progress', listener)
          return () => ipcRenderer.removeListener('bpb-cloudflare:progress', listener)
        },
      },
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

    free: {
      fetchAndConnect: (input) =>
        ipcRenderer.invoke('free:fetch-and-connect', input),

      connectFromPool: (input) =>
        ipcRenderer.invoke('free:connect-from-pool', input),

      connectSpecificNode: (input) =>
        ipcRenderer.invoke('free:connect-specific-node', input),

      refreshPool: () =>
        ipcRenderer.invoke('free:refresh-pool'),

      disconnect: () =>
        ipcRenderer.invoke('free:disconnect'),

      getStatus: () =>
        ipcRenderer.invoke('free:get-status'),

      getPool: () =>
        ipcRenderer.invoke('free:get-pool'),

      getPoolMeta: () =>
        ipcRenderer.invoke('free:get-pool-meta'),

      onProgress: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on('free:progress', listener)
        return () => ipcRenderer.removeListener('free:progress', listener)
      },

      onPoolUpdated: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on('free:pool-updated', listener)
        return () => ipcRenderer.removeListener('free:pool-updated', listener)
      },

      onPoolStatus: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on('free:pool-status', listener)
        return () => ipcRenderer.removeListener('free:pool-status', listener)
      },
    },

    speedtest: {
      run: () => ipcRenderer.invoke('speedtest:run'),
    },

    geoblock: {
      test: () => ipcRenderer.invoke('geoblock:test'),
    },

    history: {
      get: () => ipcRenderer.invoke('history:get'),
      append: (entry) => ipcRenderer.invoke('history:append', entry),
      clear: () => ipcRenderer.invoke('history:clear'),
    },

    startup: {
      getLoginItem: () => ipcRenderer.invoke('system:get-login-item'),
      setLoginItem: (enabled) => ipcRenderer.invoke('system:set-login-item', enabled),
      getCloseToTray: () => ipcRenderer.invoke('system:get-close-to-tray'),
      setCloseToTray: (enabled) => ipcRenderer.invoke('system:set-close-to-tray', enabled),
    },

    codespace: {
      getStatus: () =>
        ipcRenderer.invoke(
          'codespace:get-status',
        ),

      setup: (token) =>
        ipcRenderer.invoke(
          'codespace:setup',
          token,
        ),

      clearToken: () =>
        ipcRenderer.invoke(
          'codespace:clear-token',
        ),

      connect: (directDomains) =>
        ipcRenderer.invoke(
          'codespace:connect',
          directDomains,
        ),

      disconnect: () =>
        ipcRenderer.invoke(
          'codespace:disconnect',
        ),

      onProgress: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on('codespace:progress', listener)
        return () => ipcRenderer.removeListener('codespace:progress', listener)
      },
    },
  },
)
