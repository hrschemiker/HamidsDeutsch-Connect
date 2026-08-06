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
      setPreference: (engineType) =>
        ipcRenderer.invoke('engine:set-preference', engineType),

      getPreference: () =>
        ipcRenderer.invoke('engine:get-preference'),

      getXrayCompatibility: (nodeUri) =>
        ipcRenderer.invoke('engine:get-xray-compatibility', nodeUri),

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

      getTraffic: () => ipcRenderer.invoke('engine:get-traffic'),
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

      repair: () =>
        ipcRenderer.invoke('network:repair'),
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

      getNodeUri: (input) =>
        ipcRenderer.invoke(
          'servers:get-node-uri',
          input,
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

      addManualNode: (uri) =>
        ipcRenderer.invoke(
          'servers:add-manual-node',
          uri,
        ),

      removeManualNode: (nodeId) =>
        ipcRenderer.invoke(
          'servers:remove-manual-node',
          nodeId,
        ),

      hideNode: (compositeId) =>
        ipcRenderer.invoke(
          'servers:hide-node',
          compositeId,
        ),

      unhideNode: (compositeId) =>
        ipcRenderer.invoke(
          'servers:unhide-node',
          compositeId,
        ),

      getHiddenNodes: () =>
        ipcRenderer.invoke(
          'servers:get-hidden-nodes',
        ),
    },

    free: {
      // Crawl the two Telegram channels for new configs (through the tunnel).
      crawl: () =>
        ipcRenderer.invoke('free:crawl'),

      // Run the one-by-one working test (disconnect first).
      testStart: () =>
        ipcRenderer.invoke('free:test-start'),

      // Stop an in-flight working test so a connection can be established.
      stopTesting: () =>
        ipcRenderer.invoke('free:stop-testing'),

      // One-shot deep crawl: ignore throttle + cursor, re-scan 200 posts/channel.
      crawlDeep: () =>
        ipcRenderer.invoke('free:crawl-deep'),

      // Re-measure ping of the configs that passed the working test.
      refreshPings: () =>
        ipcRenderer.invoke('free:refresh-pings'),

      connectSpecificNode: (input) =>
        ipcRenderer.invoke('free:connect-specific-node', input),

      removeNode: (nodeId) =>
        ipcRenderer.invoke('free:remove-node', nodeId),

      disconnect: () =>
        ipcRenderer.invoke('free:disconnect'),

      getStatus: () =>
        ipcRenderer.invoke('free:get-status'),

      getPool: () =>
        ipcRenderer.invoke('free:get-pool'),

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

    apps: {
      list: () => ipcRenderer.invoke('apps:list'),
      add: () => ipcRenderer.invoke('apps:add'),
      remove: (processName) => ipcRenderer.invoke('apps:remove', processName),
    },

    killswitch: {
      get: () => ipcRenderer.invoke('killswitch:get'),
      set: (enabled) => ipcRenderer.invoke('killswitch:set', enabled),
      deactivate: () => ipcRenderer.invoke('killswitch:deactivate'),
      onActivated: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on('killswitch:activated', listener)
        return () => ipcRenderer.removeListener('killswitch:activated', listener)
      },
      onDeactivated: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on('killswitch:deactivated', listener)
        return () => ipcRenderer.removeListener('killswitch:deactivated', listener)
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

    updater: {
      getSettings: () => ipcRenderer.invoke('app:update-get-settings'),
      setEnabled: (enabled) => ipcRenderer.invoke('app:update-set-enabled', enabled),
      checkForUpdate: () => ipcRenderer.invoke('app:check-for-update'),
      downloadUpdate: () => ipcRenderer.invoke('app:download-update'),
      onState: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on('app:update-state', listener)
        return () => ipcRenderer.removeListener('app:update-state', listener)
      },
      onUpdateAvailable: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on('app:update-available', listener)
        return () => ipcRenderer.removeListener('app:update-available', listener)
      },
      onUpdateDownloaded: (callback) => {
        const listener = (_event, payload) => callback(payload)
        ipcRenderer.on('app:update-downloaded', listener)
        return () => ipcRenderer.removeListener('app:update-downloaded', listener)
      },
      installUpdate: () => ipcRenderer.invoke('app:install-update'),
    },

    startup: {
      getLoginItem: () => ipcRenderer.invoke('system:get-login-item'),
      setLoginItem: (enabled) => ipcRenderer.invoke('system:set-login-item', enabled),
      getCloseToTray: () => ipcRenderer.invoke('system:get-close-to-tray'),
      setCloseToTray: (enabled) => ipcRenderer.invoke('system:set-close-to-tray', enabled),
    },

    doh: {
      getSettings: () => ipcRenderer.invoke('doh:get-settings'),
      test: (input) => ipcRenderer.invoke('doh:test', input),
      setPreferred: (input) => ipcRenderer.invoke('doh:set-preferred', input),
      setStandalone: (input) => ipcRenderer.invoke('doh:set-standalone', input),
      setProxyDoH: (enabled) => ipcRenderer.invoke('doh:set-proxy-doh', enabled),
    },


    tools: {
      cfScan: (input) => ipcRenderer.invoke('tools:cf-scan', input),
      getCfAutoScan: () => ipcRenderer.invoke('tools:get-cf-auto-scan'),
      setCfAutoScan: (input) => ipcRenderer.invoke('tools:set-cf-auto-scan', input),
      getConverterBackends: () => ipcRenderer.invoke('tools:get-converter-backends'),
      convertSubscription: (input) => ipcRenderer.invoke('tools:convert-subscription', input),
      getUpstreamProxy: () => ipcRenderer.invoke('tools:get-upstream-proxy'),
      setUpstreamProxy: (settings) => ipcRenderer.invoke('tools:set-upstream-proxy', settings),
      getUTlsSettings: () => ipcRenderer.invoke('tools:get-utls-settings'),
      setUTlsSettings: (settings) => ipcRenderer.invoke('tools:set-utls-settings', settings),
    },

    settings: {
      export: () => ipcRenderer.invoke('settings:export'),
      import: (backup) => ipcRenderer.invoke('settings:import', backup),
    },


  },
)
