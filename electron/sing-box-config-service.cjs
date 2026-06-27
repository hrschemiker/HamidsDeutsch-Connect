const {
  createStableNodeId,
} = require('./server-node-id.cjs')

const { net } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)

const DOWNLOAD_TIMEOUT_MS = 20000
const MAX_RESPONSE_SIZE_BYTES = 5 * 1024 * 1024
const CHECK_TIMEOUT_MS = 15000

const SUPPORTED_PROTOCOLS = [
  'vmess://',
  'vless://',
  'trojan://',
  'ss://',
  'hysteria2://',
  'hy2://',
  'tuic://',
]

async function createAndCheckConfig({
  subscriptionUrl,
  nodeId,
  nodeUri,
  enginePath,
  userDataPath,
  directDomains,
  rescueOptions,
  runtimeDirectoryName = 'runtime',
  configFileName = 'config.json',
  localPort = 2080,
  setSystemProxy = false,
}) {
  validateRequest({
    subscriptionUrl,
    nodeId,
    enginePath,
    userDataPath,
  })

  let resolvedUri =
    typeof nodeUri === 'string' &&
    nodeUri.trim()
      ? nodeUri.trim()
      : null

  if (!resolvedUri) {
    const content =
      await downloadSubscriptionContent(
        subscriptionUrl,
      )

    const resolvedNode =
      resolveNodeById(
        content,
        nodeId,
      )

    if (!resolvedNode) {
      throw new Error(
        'سرور انتخاب‌شده در نسخه فعلی اشتراک پیدا نشد.',
      )
    }

    resolvedUri =
      resolvedNode.uri
  }

  const outbound =
    applyRescueOptions(
      buildOutboundFromUri(
        resolvedUri,
      ),
      rescueOptions,
    )

  const normalizedDirectDomains =
    normalizeDirectDomains(
      directDomains,
    )

  const config = buildConfig(
    outbound,
    normalizedDirectDomains,
    localPort,
    setSystemProxy,
  )

  const runtimeDirectory = path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    runtimeDirectoryName,
  )

  const configPath = path.join(
    runtimeDirectory,
    configFileName,
  )

  await writeConfigAtomically(
    runtimeDirectory,
    configPath,
    config,
  )

  const checkResult =
    await checkConfig(
      enginePath,
      configPath,
    )

  return {
    success: checkResult.success,
    checkedAt:
      new Date().toISOString(),
    nodeId,
    protocol: outbound.type,
    server: outbound.server,
    serverPort:
      outbound.server_port,
    configPath,
    directDomainCount:
      normalizedDirectDomains.length,
    stdout: checkResult.stdout,
    error: checkResult.error,
  }
}

async function createAndCheckTunConfig({
  subscriptionUrl,
  nodeId,
  nodeUri,
  enginePath,
  userDataPath,
  directDomains,
  rescueOptions,
  runtimeDirectoryName = 'runtime',
  configFileName = 'tun-config.json',
  localPort = 2080,
  setSystemProxy = false,
}) {
  validateRequest({
    subscriptionUrl,
    nodeId,
    enginePath,
    userDataPath,
  })

  let resolvedUri =
    typeof nodeUri === 'string' &&
    nodeUri.trim()
      ? nodeUri.trim()
      : null

  if (!resolvedUri) {
    const content =
      await downloadSubscriptionContent(
        subscriptionUrl,
      )

    const resolvedNode =
      resolveNodeById(
        content,
        nodeId,
      )

    if (!resolvedNode) {
      throw new Error(
        'سرور انتخاب‌شده در نسخه فعلی اشتراک پیدا نشد.',
      )
    }

    resolvedUri =
      resolvedNode.uri
  }

  const outbound =
    applyRescueOptions(
      buildOutboundFromUri(
        resolvedUri,
      ),
      rescueOptions,
    )

  const normalizedDirectDomains =
    normalizeDirectDomains(
      directDomains,
    )

  const config =
    buildTunConfig(
      outbound,
      normalizedDirectDomains,
      localPort,
      setSystemProxy,
    )

  const runtimeDirectory = path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    runtimeDirectoryName,
  )

  const configPath = path.join(
    runtimeDirectory,
    configFileName,
  )

  await writeConfigAtomically(
    runtimeDirectory,
    configPath,
    config,
  )

  const checkResult =
    await checkConfig(
      enginePath,
      configPath,
    )

  return {
    success: checkResult.success,
    checkedAt:
      new Date().toISOString(),
    mode: 'tun',
    nodeId,
    protocol: outbound.type,
    server: outbound.server,
    serverPort:
      outbound.server_port,
    configPath,
    interfaceName:
      'HamidsDeutsch',
    directDomainCount:
      normalizedDirectDomains.length,
    stdout: checkResult.stdout,
    error: checkResult.error,
  }
}

function validateRequest({
  subscriptionUrl,
  nodeId,
  enginePath,
  userDataPath,
}) {
  if (
    typeof subscriptionUrl !== 'string' ||
    !subscriptionUrl.trim()
  ) {
    throw new Error(
      'لینک اشتراک در دسترس نیست.',
    )
  }

  if (
    typeof nodeId !== 'string' ||
    !nodeId.trim()
  ) {
    throw new Error(
      'شناسه سرور انتخاب‌شده معتبر نیست.',
    )
  }

  if (
    typeof enginePath !== 'string' ||
    !enginePath.trim()
  ) {
    throw new Error(
      'مسیر sing-box معتبر نیست.',
    )
  }

  if (
    typeof userDataPath !== 'string' ||
    !userDataPath.trim()
  ) {
    throw new Error(
      'مسیر داده برنامه معتبر نیست.',
    )
  }
}

async function downloadSubscriptionContent(
  subscriptionUrl,
) {
  let parsedUrl

  try {
    parsedUrl = new URL(
      subscriptionUrl,
    )
  } catch {
    throw new Error(
      'لینک ذخیره‌شده اشتراک معتبر نیست.',
    )
  }

  if (
    parsedUrl.protocol !== 'https:' &&
    parsedUrl.protocol !== 'http:'
  ) {
    throw new Error(
      'پروتکل لینک اشتراک پشتیبانی نمی‌شود.',
    )
  }

  const controller =
    new AbortController()

  const timeout = setTimeout(() => {
    controller.abort()
  }, DOWNLOAD_TIMEOUT_MS)

  try {
    const response = await net.fetch(
      parsedUrl.toString(),
      {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          Accept:
            'text/plain, application/json, application/octet-stream;q=0.9, */*;q=0.8',
          'User-Agent':
            'HamidsDeutsch-Connect/0.1.0',
        },
      },
    )

    if (!response.ok) {
      throw new Error(
        `سرور اشتراک با وضعیت HTTP ${response.status} پاسخ داد.`,
      )
    }

    const declaredSize = Number(
      response.headers.get(
        'content-length',
      ),
    )

    if (
      Number.isFinite(declaredSize) &&
      declaredSize >
        MAX_RESPONSE_SIZE_BYTES
    ) {
      throw new Error(
        'حجم اشتراک بیشتر از محدودیت ۵ مگابایت است.',
      )
    }

    const buffer = Buffer.from(
      await response.arrayBuffer(),
    )

    if (
      buffer.byteLength >
      MAX_RESPONSE_SIZE_BYTES
    ) {
      throw new Error(
        'حجم اشتراک بیشتر از محدودیت ۵ مگابایت است.',
      )
    }

    const content = buffer
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .trim()

    if (!content) {
      throw new Error(
        'پاسخ اشتراک خالی است.',
      )
    }

    return content
  } catch (error) {
    if (
      error?.name === 'AbortError'
    ) {
      throw new Error(
        'زمان دریافت اشتراک بیش از ۲۰ ثانیه شد.',
      )
    }

    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function resolveNodeById(
  content,
  targetNodeId,
) {
  const normalizedContent =
    decodeSubscriptionContent(
      content,
    )

  const lines = normalizedContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    const lowerLine =
      line.toLowerCase()

    if (
      !SUPPORTED_PROTOCOLS.some(
        (protocol) =>
          lowerLine.startsWith(
            protocol,
          ),
      )
    ) {
      continue
    }

    const safeNode =
      parseSafeNode(line)

    const nodeId =
      createStableNodeId(line)

    if (nodeId === targetNodeId) {
      return {
        uri: line,
        safeNode,
      }
    }

  }

  return null
}

function decodeSubscriptionContent(
  content,
) {
  const trimmedContent = content
    .replace(/^\uFEFF/, '')
    .trim()

  if (
    SUPPORTED_PROTOCOLS.some(
      (protocol) =>
        trimmedContent
          .toLowerCase()
          .includes(protocol),
    )
  ) {
    return trimmedContent
  }

  const decoded =
    decodeBase64Value(
      trimmedContent,
    )

  return decoded?.trim() ||
    trimmedContent
}

function parseSafeNode(uri) {
  const protocol = uri
    .slice(0, uri.indexOf('://'))
    .toLowerCase()

  if (protocol === 'vmess') {
    const config =
      parseVmessPayload(uri)

    return {
      name:
        normalizeNodeName(
          config.ps,
        ) ||
        createDefaultName(
          'VMess',
          normalizeHost(
            config.add,
          ),
        ),
      protocol,
      host: normalizeHost(
        config.add,
      ),
      port: normalizePort(
        config.port,
      ),
    }
  }

  if (protocol === 'ss') {
    const parsed =
      parseShadowsocksUri(uri)

    return {
      name:
        parsed.name ||
        createDefaultName(
          'Shadowsocks',
          parsed.host,
        ),
      protocol,
      host: parsed.host,
      port: parsed.port,
    }
  }

  const parsed = new URL(uri)

  return {
    name:
      extractFragmentName(
        parsed.hash,
      ) ||
      createDefaultName(
        formatProtocolName(
          protocol,
        ),
        normalizeHost(
          parsed.hostname,
        ),
      ),
    protocol,
    host: normalizeHost(
      parsed.hostname,
    ),
    port: normalizePort(
      parsed.port,
    ),
  }
}

function buildOutboundFromUri(uri) {
  const protocol = uri
    .slice(0, uri.indexOf('://'))
    .toLowerCase()

  switch (protocol) {
    case 'vless':
      return buildVlessOutbound(uri)

    case 'vmess':
      return buildVmessOutbound(uri)

    case 'trojan':
      return buildTrojanOutbound(uri)

    case 'ss':
      return buildShadowsocksOutbound(uri)

    case 'hysteria2':
    case 'hy2':
      return buildHysteria2Outbound(uri)

    case 'tuic':
      return buildTuicOutbound(uri)

    default:
      throw new Error(
        `پروتکل ${protocol} هنوز برای ساخت کانفیگ پشتیبانی نمی‌شود.`,
      )
  }
}

function buildVlessOutbound(uri) {
  const parsed = new URL(uri)
  const params = parsed.searchParams

  const uuid = decodeURIComponent(
    parsed.username,
  )

  if (!uuid) {
    throw new Error(
      'UUID کانفیگ VLESS خالی است.',
    )
  }

  const outbound = {
    type: 'vless',
    tag: 'proxy',
    server: requireHost(parsed),
    server_port: requirePort(parsed),
    uuid,
  }

  const flow = params.get('flow')

  if (flow) {
    outbound.flow = flow
  }

  const tls = buildTlsConfig(
    params,
    parsed.hostname,
  )

  if (tls) {
    outbound.tls = tls
  }

  const transport =
    buildTransportConfig(params)

  if (transport) {
    outbound.transport =
      transport
  }

  return outbound
}

function buildVmessOutbound(uri) {
  const config =
    parseVmessPayload(uri)

  const host = normalizeHost(
    config.add,
  )

  const port = normalizePort(
    config.port,
  )

  const uuid = normalizeText(
    config.id,
  )

  if (!host || !port || !uuid) {
    throw new Error(
      'اطلاعات ضروری کانفیگ VMess ناقص است.',
    )
  }

  const outbound = {
    type: 'vmess',
    tag: 'proxy',
    server: host,
    server_port: port,
    uuid,
    security:
      normalizeText(config.scy) ||
      'auto',
    alter_id:
      Number.isFinite(
        Number(config.aid),
      )
        ? Number(config.aid)
        : 0,
  }

  const params =
    new URLSearchParams()

  if (config.net) {
    params.set(
      'type',
      String(config.net),
    )
  }

  if (config.path) {
    params.set(
      'path',
      String(config.path),
    )
  }

  if (config.host) {
    params.set(
      'host',
      String(config.host),
    )
  }

  if (config.sni) {
    params.set(
      'sni',
      String(config.sni),
    )
  }

  if (config.alpn) {
    params.set(
      'alpn',
      String(config.alpn),
    )
  }

  if (
    String(config.tls)
      .toLowerCase() === 'tls'
  ) {
    params.set(
      'security',
      'tls',
    )
  }

  const tls = buildTlsConfig(
    params,
    host,
  )

  if (tls) {
    outbound.tls = tls
  }

  const transport =
    buildTransportConfig(params)

  if (transport) {
    outbound.transport =
      transport
  }

  return outbound
}

function buildTrojanOutbound(uri) {
  const parsed = new URL(uri)
  const params = parsed.searchParams

  const password = decodeURIComponent(
    parsed.username,
  )

  if (!password) {
    throw new Error(
      'رمز کانفیگ Trojan خالی است.',
    )
  }

  const outbound = {
    type: 'trojan',
    tag: 'proxy',
    server: requireHost(parsed),
    server_port: requirePort(parsed),
    password,
  }

  const tls =
    buildTlsConfig(
      params,
      parsed.hostname,
      true,
    )

  if (tls) {
    outbound.tls = tls
  }

  const transport =
    buildTransportConfig(params)

  if (transport) {
    outbound.transport =
      transport
  }

  return outbound
}

function buildShadowsocksOutbound(uri) {
  const parsed =
    parseShadowsocksUri(uri)

  if (
    !parsed.host ||
    !parsed.port ||
    !parsed.method ||
    !parsed.password
  ) {
    throw new Error(
      'اطلاعات ضروری کانفیگ Shadowsocks ناقص است.',
    )
  }

  const outbound = {
    type: 'shadowsocks',
    tag: 'proxy',
    server: parsed.host,
    server_port: parsed.port,
    method: parsed.method,
    password: parsed.password,
  }

  if (parsed.plugin) {
    outbound.plugin =
      parsed.plugin

    if (parsed.pluginOpts) {
      outbound.plugin_opts =
        parsed.pluginOpts
    }
  }

  return outbound
}

function buildHysteria2Outbound(uri) {
  const parsed = new URL(uri)
  const params = parsed.searchParams

  const password =
    decodeURIComponent(
      parsed.username,
    ) ||
    params.get('auth') ||
    params.get('password')

  if (!password) {
    throw new Error(
      'رمز کانفیگ Hysteria 2 خالی است.',
    )
  }

  const outbound = {
    type: 'hysteria2',
    tag: 'proxy',
    server: requireHost(parsed),
    server_port: requirePort(parsed),
    password,
    tls:
      buildTlsConfig(
        params,
        parsed.hostname,
        true,
      ),
  }

  const obfsType =
    params.get('obfs')

  const obfsPassword =
    params.get(
      'obfs-password',
    ) ||
    params.get('obfsPassword')

  if (
    obfsType &&
    obfsPassword
  ) {
    outbound.obfs = {
      type: obfsType,
      password:
        obfsPassword,
    }
  }

  const upMbps =
    normalizePositiveNumber(
      params.get('upmbps') ||
      params.get('up')
    )

  const downMbps =
    normalizePositiveNumber(
      params.get('downmbps') ||
      params.get('down')
    )

  if (upMbps) {
    outbound.up_mbps = upMbps
  }

  if (downMbps) {
    outbound.down_mbps =
      downMbps
  }

  return outbound
}

function buildTuicOutbound(uri) {
  const parsed = new URL(uri)
  const params = parsed.searchParams

  const uuid = decodeURIComponent(
    parsed.username,
  )

  const password = decodeURIComponent(
    parsed.password,
  )

  if (!uuid || !password) {
    throw new Error(
      'UUID یا رمز کانفیگ TUIC ناقص است.',
    )
  }

  const congestionControl =
    params.get(
      'congestion_control',
    ) ||
    params.get(
      'congestion-control',
    ) ||
    'cubic'

  return {
    type: 'tuic',
    tag: 'proxy',
    server: requireHost(parsed),
    server_port: requirePort(parsed),
    uuid,
    password,
    congestion_control:
      congestionControl,
    udp_relay_mode:
      params.get(
        'udp_relay_mode',
      ) ||
      params.get(
        'udp-relay-mode',
      ) ||
      'native',
    tls:
      buildTlsConfig(
        params,
        parsed.hostname,
        true,
      ),
  }
}

function buildTlsConfig(
  params,
  fallbackServerName,
  forceEnabled = false,
) {
  const security = (
    params.get('security') ||
    params.get('tls') ||
    ''
  ).toLowerCase()

  const enabled =
    forceEnabled ||
    security === 'tls' ||
    security === 'reality'

  if (!enabled) {
    return null
  }

  const serverName =
    params.get('sni') ||
    params.get('serverName') ||
    fallbackServerName

  const tls = {
    enabled: true,
    server_name: serverName,
    insecure:
      parseBoolean(
        params.get(
          'allowInsecure',
        ) ||
        params.get('insecure'),
      ),
  }

  const alpn = splitList(
    params.get('alpn'),
  )

  if (alpn.length > 0) {
    tls.alpn = alpn
  }

  const fingerprint =
    params.get('fp')

  if (fingerprint) {
    tls.utls = {
      enabled: true,
      fingerprint,
    }
  }

  if (security === 'reality') {
    const publicKey =
      params.get('pbk')

    const shortId =
      params.get('sid') ?? ''

    if (!publicKey) {
      throw new Error(
        'کلید عمومی Reality در کانفیگ وجود ندارد.',
      )
    }

    tls.reality = {
      enabled: true,
      public_key: publicKey,
      short_id: shortId,
    }
  }

  return tls
}

function buildTransportConfig(params) {
  const type = (
    params.get('type') ||
    params.get('transport') ||
    'tcp'
  ).toLowerCase()

  const pathValue =
    params.get('path') ||
    '/'

  const hostValue =
    params.get('host') ||
    ''

  if (
    type === 'tcp' ||
    type === 'none' ||
    !type
  ) {
    return null
  }

  if (
    type === 'ws' ||
    type === 'websocket'
  ) {
    const transport = {
      type: 'ws',
      path: pathValue,
    }

    if (hostValue) {
      transport.headers = {
        Host: hostValue,
      }
    }

    const earlyData =
      normalizePositiveNumber(
        params.get('ed'),
      )

    if (earlyData) {
      transport.max_early_data =
        earlyData

      transport.early_data_header_name =
        params.get('eh') ||
        'Sec-WebSocket-Protocol'
    }

    return transport
  }

  if (type === 'grpc') {
    return {
      type: 'grpc',
      service_name:
        params.get(
          'serviceName',
        ) ||
        params.get(
          'service_name',
        ) ||
        pathValue.replace(
          /^\//,
          '',
        ),
    }
  }

  if (
    type === 'httpupgrade' ||
    type === 'http-upgrade'
  ) {
    const transport = {
      type: 'httpupgrade',
      path: pathValue,
    }

    if (hostValue) {
      transport.host =
        hostValue
    }

    return transport
  }

  if (
    type === 'http' ||
    type === 'h2'
  ) {
    const transport = {
      type: 'http',
      path: pathValue,
    }

    if (hostValue) {
      transport.host =
        splitList(hostValue)
    }

    return transport
  }

  if (type === 'quic') {
    return {
      type: 'quic',
    }
  }

  if (type === 'xhttp' || type === 'splithttp') {
    return {
      type: 'splithttp',
      path: pathValue,
    }
  }

  throw new Error(
    `نوع انتقال ${type} هنوز پشتیبانی نمی‌شود.`,
  )
}

function buildDirectRules(directDomains) {
  if (!directDomains || directDomains.length === 0) return []
  // Two rules: exact domain match AND subdomain suffix match
  return [
    {
      domain: directDomains,
      outbound: 'direct',
    },
    {
      domain_suffix: directDomains,
      outbound: 'direct',
    },
  ]
}

function buildConfig(
  proxyOutbound,
  directDomains,
  localPort = 2080,
  setSystemProxy = false,
) {
  const rules = buildDirectRules(directDomains)

  return {
    log: {
      level: 'warn',
      timestamp: true,
    },

    inbounds: [
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: '127.0.0.1',
        listen_port: localPort,
        set_system_proxy:
          setSystemProxy,
      },
    ],

    outbounds: [
      proxyOutbound,
      {
        type: 'direct',
        tag: 'direct',
      },
    ],

    route: {
      rules,
      final: 'proxy',
      auto_detect_interface: true,
    },
  }
}

function buildTunConfig(
  proxyOutbound,
  directDomains,
  localPort = 2080,
  setSystemProxy = false,
) {
  const rules = [
    {
      ip_is_private: true,
      outbound: 'direct',
    },
    ...buildDirectRules(directDomains),
  ]

  return {
    log: {
      level: 'warn',
      timestamp: true,
    },

    inbounds: [
      {
        type: 'tun',
        tag: 'tun-in',
        interface_name:
          'HamidsDeutsch',
        address: [
          '172.19.0.1/30',
          'fdfe:dcba:9876::1/126',
        ],
        mtu: 1500,
        auto_route: true,
        strict_route: true,
        stack: 'mixed',
      },
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: '127.0.0.1',
        listen_port: localPort,
        set_system_proxy:
          setSystemProxy,
      },
    ],

    outbounds: [
      proxyOutbound,
      {
        type: 'direct',
        tag: 'direct',
      },
    ],

    route: {
      rules,
      final: 'proxy',
      auto_detect_interface: true,
    },
  }
}

function applyRescueOptions(
  outbound,
  rescueOptions,
) {
  const options =
    normalizeRescueOptions(
      rescueOptions,
    )

  if (
    !options.enabled ||
    !outbound?.tls?.enabled
  ) {
    return outbound
  }

  const tls = {
    ...outbound.tls,
  }

  if (
    options.customSni
  ) {
    tls.server_name =
      options.customSni
  }

  if (
    options.recordFragment
  ) {
    tls.record_fragment =
      true
  }

  if (
    options.handshakeFragment
  ) {
    tls.fragment = true
    tls.fragment_fallback_delay =
      options.fragmentFallbackDelay
  }

  return {
    ...outbound,
    tls,
  }
}

function normalizeRescueOptions(
  value,
) {
  const enabled =
    Boolean(
      value?.enabled,
    )

  const customSni =
    normalizeServerName(
      value?.customSni,
    )

  const delay =
    normalizeDuration(
      value?.fragmentFallbackDelay,
      '500ms',
    )

  return {
    enabled,
    recordFragment:
      enabled &&
      value?.recordFragment !==
        false,
    handshakeFragment:
      enabled &&
      Boolean(
        value?.handshakeFragment,
      ),
    fragmentFallbackDelay:
      delay,
    customSni,
  }
}

function normalizeServerName(
  value,
) {
  if (
    typeof value !== 'string'
  ) {
    return ''
  }

  const normalized =
    value
      .trim()
      .toLowerCase()
      .replace(/\.$/, '')

  if (!normalized) {
    return ''
  }

  if (
    normalized.length > 253 ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
      normalized,
    )
  ) {
    throw new Error(
      'SNI سفارشی معتبر نیست.',
    )
  }

  return normalized
}

function normalizeDuration(
  value,
  fallback,
) {
  if (
    typeof value !== 'string'
  ) {
    return fallback
  }

  const normalized =
    value.trim()

  if (
    !/^\d+(?:\.\d+)?(?:ms|s)$/.test(
      normalized,
    )
  ) {
    return fallback
  }

  return normalized
}

function normalizeDirectDomains(values) {
  if (!Array.isArray(values)) {
    return []
  }

  return Array.from(
    new Set(
      values
        .filter(
          (value) =>
            typeof value ===
            'string',
        )
        .map((value) =>
          value
            .trim()
            .toLowerCase()
            .replace(/^\./, '')
            .replace(/\.$/, ''),
        )
        .filter(Boolean)
        .slice(0, 500),
    ),
  )
}

async function writeConfigAtomically(
  runtimeDirectory,
  configPath,
  config,
) {
  await fs.mkdir(
    runtimeDirectory,
    {
      recursive: true,
    },
  )

  const temporaryPath =
    `${configPath}.tmp`

  await fs.writeFile(
    temporaryPath,
    JSON.stringify(
      config,
      null,
      2,
    ),
    'utf8',
  )

  await fs.rm(
    configPath,
    {
      force: true,
    },
  )

  await fs.rename(
    temporaryPath,
    configPath,
  )
}

async function checkConfig(
  enginePath,
  configPath,
) {
  try {
    const {
      stdout,
      stderr,
    } = await execFileAsync(
      enginePath,
      [
        'check',
        '-c',
        configPath,
      ],
      {
        windowsHide: true,
        timeout:
          CHECK_TIMEOUT_MS,
        encoding: 'utf8',
      },
    )

    return {
      success: true,
      stdout:
        `${stdout}\n${stderr}`
          .trim(),
      error: null,
    }
  } catch (error) {
    const stdout =
      typeof error?.stdout ===
      'string'
        ? error.stdout
        : ''

    const stderr =
      typeof error?.stderr ===
      'string'
        ? error.stderr
        : ''

    const message =
      `${stdout}\n${stderr}`
        .trim() ||
      (error instanceof Error
        ? error.message
        : 'اعتبارسنجی کانفیگ ناموفق بود.')

    return {
      success: false,
      stdout: '',
      error: sanitizeEngineError(
        message,
      ),
    }
  }
}

function sanitizeEngineError(message) {
  return String(message)
    .replace(
      /[A-Za-z0-9+/=_-]{32,}/g,
      '[hidden]',
    )
    .slice(0, 2000)
}

function parseVmessPayload(uri) {
  const encoded = uri.slice(
    'vmess://'.length,
  )

  const decoded =
    decodeBase64Value(encoded)

  if (!decoded) {
    throw new Error(
      'رمزگشایی VMess ناموفق بود.',
    )
  }

  try {
    return JSON.parse(decoded)
  } catch {
    throw new Error(
      'ساختار JSON کانفیگ VMess معتبر نیست.',
    )
  }
}

function parseShadowsocksUri(uri) {
  const withoutScheme = uri.slice(
    'ss://'.length,
  )

  const hashIndex =
    withoutScheme.indexOf('#')

  const rawName =
    hashIndex >= 0
      ? withoutScheme.slice(
          hashIndex + 1,
        )
      : ''

  const withoutHash =
    hashIndex >= 0
      ? withoutScheme.slice(
          0,
          hashIndex,
        )
      : withoutScheme

  const queryIndex =
    withoutHash.indexOf('?')

  const query =
    queryIndex >= 0
      ? withoutHash.slice(
          queryIndex + 1,
        )
      : ''

  let mainPart =
    queryIndex >= 0
      ? withoutHash.slice(
          0,
          queryIndex,
        )
      : withoutHash

  if (!mainPart.includes('@')) {
    mainPart =
      decodeBase64Value(
        mainPart,
      ) || mainPart
  }

  const atIndex =
    mainPart.lastIndexOf('@')

  if (atIndex < 0) {
    throw new Error(
      'ساختار Shadowsocks معتبر نیست.',
    )
  }

  let userInfo =
    mainPart.slice(0, atIndex)

  const address =
    mainPart.slice(atIndex + 1)

  if (!userInfo.includes(':')) {
    userInfo =
      decodeBase64Value(
        userInfo,
      ) || userInfo
  }

  const separator =
    userInfo.indexOf(':')

  if (separator < 0) {
    throw new Error(
      'روش رمزنگاری یا رمز Shadowsocks ناقص است.',
    )
  }

  const {
    host,
    port,
  } = parseHostAndPort(address)

  const params =
    new URLSearchParams(query)

  const pluginValue =
    params.get('plugin')

  let plugin = null
  let pluginOpts = null

  if (pluginValue) {
    const [
      pluginName,
      ...pluginOptions
    ] = pluginValue.split(';')

    plugin = pluginName
    pluginOpts =
      pluginOptions.join(';') ||
      null
  }

  return {
    name:
      decodeText(rawName),
    host,
    port,
    method:
      decodeURIComponent(
        userInfo.slice(
          0,
          separator,
        ),
      ),
    password:
      decodeURIComponent(
        userInfo.slice(
          separator + 1,
        ),
      ),
    plugin,
    pluginOpts,
  }
}

function parseHostAndPort(value) {
  const trimmed = value.trim()

  if (trimmed.startsWith('[')) {
    const closingBracket =
      trimmed.indexOf(']')

    if (closingBracket < 0) {
      return {
        host: null,
        port: null,
      }
    }

    return {
      host: normalizeHost(
        trimmed.slice(
          1,
          closingBracket,
        ),
      ),
      port: normalizePort(
        trimmed
          .slice(
            closingBracket + 1,
          )
          .replace(/^:/, ''),
      ),
    }
  }

  const separator =
    trimmed.lastIndexOf(':')

  if (separator < 0) {
    return {
      host: normalizeHost(
        trimmed,
      ),
      port: null,
    }
  }

  return {
    host: normalizeHost(
      trimmed.slice(
        0,
        separator,
      ),
    ),
    port: normalizePort(
      trimmed.slice(
        separator + 1,
      ),
    ),
  }
}

function requireHost(parsedUrl) {
  const host = normalizeHost(
    parsedUrl.hostname,
  )

  if (!host) {
    throw new Error(
      'آدرس سرور خالی است.',
    )
  }

  return host
}

function requirePort(parsedUrl) {
  const port = normalizePort(
    parsedUrl.port,
  )

  if (!port) {
    throw new Error(
      'پورت سرور معتبر نیست.',
    )
  }

  return port
}

function normalizeHost(value) {
  if (
    typeof value !== 'string'
  ) {
    return null
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')

  return normalized || null
}

function normalizePort(value) {
  const number = Number(value)

  if (
    !Number.isInteger(number) ||
    number < 1 ||
    number > 65535
  ) {
    return null
  }

  return number
}

function normalizeNodeName(value) {
  if (
    typeof value !== 'string'
  ) {
    return null
  }

  const normalized = value
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 120)

  return normalized || null
}

function normalizeText(value) {
  if (
    value === undefined ||
    value === null
  ) {
    return null
  }

  const normalized =
    String(value).trim()

  return normalized || null
}

function normalizePositiveNumber(value) {
  const number = Number(value)

  if (
    !Number.isFinite(number) ||
    number <= 0
  ) {
    return null
  }

  return number
}

function extractFragmentName(hash) {
  if (!hash) {
    return null
  }

  return decodeText(
    hash.replace(/^#/, ''),
  )
}

function decodeText(value) {
  if (!value) {
    return null
  }

  try {
    return normalizeNodeName(
      decodeURIComponent(value),
    )
  } catch {
    return normalizeNodeName(
      value,
    )
  }
}

function createDefaultName(
  protocolName,
  host,
) {
  if (host) {
    return `${protocolName} – ${host}`
  }

  return protocolName
}

function formatProtocolName(protocol) {
  const names = {
    vmess: 'VMess',
    vless: 'VLESS',
    trojan: 'Trojan',
    ss: 'Shadowsocks',
    hysteria2: 'Hysteria 2',
    hy2: 'Hysteria 2',
    tuic: 'TUIC',
  }

  return names[protocol] ??
    protocol
}

function decodeBase64Value(value) {
  try {
    const normalized = String(value)
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .replace(/\s+/g, '')

    if (!normalized) {
      return null
    }

    const padding =
      (4 -
        (normalized.length % 4)) %
      4

    return Buffer.from(
      normalized +
        '='.repeat(padding),
      'base64',
    ).toString('utf8')
  } catch {
    return null
  }
}

function parseBoolean(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return false
  }

  return [
    '1',
    'true',
    'yes',
  ].includes(
    String(value)
      .toLowerCase(),
  )
}

function splitList(value) {
  if (!value) {
    return []
  }

  return String(value)
    .split(/[,|]/)
    .map((item) =>
      item.trim(),
    )
    .filter(Boolean)
}

module.exports = {
  createAndCheckConfig,
  createAndCheckTunConfig,
}
