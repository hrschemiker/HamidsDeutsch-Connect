const path = require('node:path')
const fs = require('node:fs/promises')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const XRAY_PROTOCOLS = new Set(['vless', 'vmess', 'trojan', 'ss'])
const PROXY_ONLY_DOMAINS = [
  'x.com', 'twitter.com', 'twimg.com', 'instagram.com', 'cdninstagram.com',
  'facebook.com', 'fbcdn.net', 'threads.net', 'telegram.org', 't.me',
]

function getProtocol(uri) {
  const value = String(uri ?? '')
  const separator = value.indexOf('://')
  return separator > 0 ? value.slice(0, separator).toLowerCase() : ''
}

function getXrayCompatibility(uri) {
  const protocol = getProtocol(uri)
  return {
    compatible: XRAY_PROTOCOLS.has(protocol),
    protocol,
    reason: XRAY_PROTOCOLS.has(protocol)
      ? null
      : `پروتکل ${protocol || 'ناشناخته'} در نسخه Xray این برنامه پشتیبانی نمی‌شود و به sing-box نیاز دارد.`,
  }
}

async function createAndCheckXrayConfig({
  nodeId,
  nodeUri,
  enginePath,
  userDataPath,
  directDomains = [],
  rescueOptions = null,
  vpnDns = null,
  utlsSettings = null,
  cfCleanIp = null,
  upstreamProxy = null,
}) {
  const compatibility = getXrayCompatibility(nodeUri)
  if (!compatibility.compatible) throw new Error(compatibility.reason)

  const outbound = buildOutbound(nodeUri, { rescueOptions, utlsSettings, cfCleanIp })
  const safeDirectDomains = normalizeDirectDomains(directDomains)
  const config = buildConfig(outbound, safeDirectDomains, vpnDns, upstreamProxy)
  const runtimeDirectory = path.join(userDataPath, 'HamidsDeutsch-Connect', 'runtime')
  const configPath = path.join(runtimeDirectory, 'xray-config.json')
  await fs.mkdir(runtimeDirectory, { recursive: true })
  await writeJsonAtomically(configPath, config)

  const check = await checkConfig(enginePath, configPath)
  return {
    success: check.success,
    checkedAt: new Date().toISOString(),
    nodeId: nodeId ?? null,
    protocol: compatibility.protocol,
    server: outbound.settings?.vnext?.[0]?.address ?? outbound.settings?.servers?.[0]?.address ?? null,
    serverPort: outbound.settings?.vnext?.[0]?.port ?? outbound.settings?.servers?.[0]?.port ?? null,
    configPath,
    directDomainCount: safeDirectDomains.length,
    stdout: check.stdout,
    engineType: 'xray',
    error: check.error,
  }
}

function buildConfig(proxyOutbound, directDomains, vpnDns, upstreamProxy) {
  const routingRules = []
  if (directDomains.length > 0) {
    routingRules.push({ type: 'field', domain: directDomains.map((value) => `domain:${value}`), outboundTag: 'direct' })
  }
  routingRules.push(
    { type: 'field', ip: ['geoip:private'], outboundTag: 'direct' },
    { type: 'field', network: 'udp', port: '443', outboundTag: 'block' },
  )

  const dnsAddress = String(vpnDns?.primary || '1.1.1.1').trim()
  const chainedProxyOutbound = upstreamProxy?.enabled && upstreamProxy?.host
    ? { ...proxyOutbound, proxySettings: { tag: 'upstream-proxy', transportLayer: true } }
    : proxyOutbound
  const outbounds = [
    chainedProxyOutbound,
    { tag: 'direct', protocol: 'freedom', settings: { domainStrategy: 'UseIPv4' } },
    { tag: 'block', protocol: 'blackhole', settings: {} },
  ]
  if (upstreamProxy?.enabled && upstreamProxy?.host) {
    const protocol = upstreamProxy.type === 'http' ? 'http' : 'socks'
    outbounds.push({
      tag: 'upstream-proxy',
      protocol,
      settings: {
        servers: [{ address: upstreamProxy.host, port: upstreamProxy.port }],
      },
    })
  }
  if (proxyOutbound.streamSettings?.sockopt?.dialerProxy === 'fragment') {
    outbounds.push({
      tag: 'fragment',
      protocol: 'freedom',
      settings: {
        domainStrategy: 'UseIPv4',
        fragment: { packets: 'tlshello', length: '100-200', interval: '10-20' },
      },
    })
  }

  return {
    log: { loglevel: 'warning' },
    dns: {
      queryStrategy: 'UseIPv4',
      servers: [dnsAddress, '1.1.1.1'],
    },
    inbounds: [{
      tag: 'local-http',
      listen: '127.0.0.1',
      port: 2080,
      protocol: 'http',
      settings: { allowTransparent: false },
      sniffing: { enabled: true, destOverride: ['http', 'tls', 'quic'], routeOnly: true },
    }],
    outbounds,
    routing: {
      domainStrategy: 'IPIfNonMatch',
      domainMatcher: 'hybrid',
      rules: routingRules,
    },
  }
}

function buildOutbound(uri, options) {
  const protocol = getProtocol(uri)
  if (protocol === 'vmess') return buildVmess(uri, options)
  if (protocol === 'ss') return buildShadowsocks(uri)
  const parsed = new URL(uri)
  if (protocol === 'vless') return buildVless(parsed, options)
  if (protocol === 'trojan') return buildTrojan(parsed, options)
  throw new Error(`پروتکل ${protocol} برای Xray پشتیبانی نمی‌شود.`)
}

function buildVless(parsed, options) {
  const params = parsed.searchParams
  const user = { id: decodeURIComponent(parsed.username), encryption: params.get('encryption') || 'none' }
  const flow = params.get('flow')
  if (flow) user.flow = flow
  return {
    tag: 'proxy', protocol: 'vless',
    settings: { vnext: [{ address: effectiveHost(parsed.hostname, options.cfCleanIp), port: requirePort(parsed), users: [user] }] },
    streamSettings: buildStreamSettings(params, parsed.hostname, options),
  }
}

function buildVmess(uri, options) {
  const payload = JSON.parse(decodeBase64(uri.slice('vmess://'.length)))
  const params = new URLSearchParams()
  if (payload.net) params.set('type', payload.net)
  if (payload.path) params.set('path', payload.path)
  if (payload.host) params.set('host', payload.host)
  if (payload.sni) params.set('sni', payload.sni)
  if (payload.alpn) params.set('alpn', payload.alpn)
  if (String(payload.tls).toLowerCase() === 'tls') params.set('security', 'tls')
  if (payload.fp) params.set('fp', payload.fp)
  const host = String(payload.add || '').trim()
  const port = Number(payload.port)
  if (!host || !Number.isInteger(port) || !payload.id) throw new Error('اطلاعات ضروری VMess ناقص است.')
  return {
    tag: 'proxy', protocol: 'vmess',
    settings: { vnext: [{ address: effectiveHost(host, options.cfCleanIp), port, users: [{ id: payload.id, alterId: Number(payload.aid || 0), security: payload.scy || 'auto' }] }] },
    streamSettings: buildStreamSettings(params, host, options),
  }
}

function buildTrojan(parsed, options) {
  const password = decodeURIComponent(parsed.username)
  if (!password) throw new Error('رمز Trojan خالی است.')
  const params = parsed.searchParams
  if (!params.get('security')) params.set('security', 'tls')
  return {
    tag: 'proxy', protocol: 'trojan',
    settings: { servers: [{ address: effectiveHost(parsed.hostname, options.cfCleanIp), port: requirePort(parsed), password }] },
    streamSettings: buildStreamSettings(params, parsed.hostname, options),
  }
}

function buildShadowsocks(uri) {
  const withoutHash = uri.split('#')[0]
  let body = withoutHash.slice('ss://'.length)
  let plugin = ''
  const queryIndex = body.indexOf('?')
  if (queryIndex >= 0) {
    const params = new URLSearchParams(body.slice(queryIndex + 1))
    plugin = params.get('plugin') || ''
    body = body.slice(0, queryIndex)
  }
  let credentials = ''
  let endpoint = ''
  if (body.includes('@')) {
    const at = body.lastIndexOf('@')
    credentials = body.slice(0, at)
    endpoint = body.slice(at + 1)
    if (!credentials.includes(':')) credentials = decodeBase64(credentials)
  } else {
    const decoded = decodeBase64(body)
    const at = decoded.lastIndexOf('@')
    credentials = decoded.slice(0, at)
    endpoint = decoded.slice(at + 1)
  }
  const separator = credentials.indexOf(':')
  const method = credentials.slice(0, separator)
  const password = credentials.slice(separator + 1)
  const { host, port } = parseEndpoint(endpoint)
  if (!method || !password || !host || !port) throw new Error('کانفیگ Shadowsocks ناقص است.')
  const server = { address: host, port, method, password }
  if (plugin) server.plugin = plugin
  return { tag: 'proxy', protocol: 'shadowsocks', settings: { servers: [server] } }
}

function buildStreamSettings(params, originalHost, options) {
  const transport = String(params.get('type') || params.get('transport') || 'tcp').toLowerCase()
  const security = String(params.get('security') || '').toLowerCase()
  const stream = { network: normalizeNetwork(transport), security: security === 'reality' ? 'reality' : security === 'tls' ? 'tls' : 'none' }
  const pathValue = params.get('path') || '/'
  const hostValue = params.get('host') || ''
  if (stream.network === 'ws') stream.wsSettings = { path: pathValue, headers: hostValue ? { Host: hostValue } : {} }
  if (stream.network === 'grpc') stream.grpcSettings = { serviceName: params.get('serviceName') || params.get('service_name') || pathValue.replace(/^\//, '') }
  if (stream.network === 'httpupgrade') stream.httpupgradeSettings = { path: pathValue, host: hostValue || originalHost }
  if (stream.network === 'xhttp') stream.xhttpSettings = { path: pathValue, host: hostValue || originalHost, mode: params.get('mode') || 'auto' }
  if (stream.network === 'h2') stream.httpSettings = { path: pathValue, host: hostValue ? hostValue.split(',') : [originalHost] }

  const fingerprint = params.get('fp') || options.utlsSettings?.globalFingerprint || 'chrome'
  const configuredServerName = params.get('sni') || originalHost
  const rescueServerName = options.rescueOptions?.enabled
    ? String(options.rescueOptions?.customSni || '').trim()
    : ''
  const serverName = rescueServerName || configuredServerName
  if (stream.security === 'tls') {
    stream.tlsSettings = { serverName, allowInsecure: parseBoolean(params.get('allowInsecure') || params.get('insecure')), fingerprint }
    const alpn = params.get('alpn')
    if (alpn) stream.tlsSettings.alpn = alpn.split(',').filter(Boolean)
  }
  if (stream.security === 'reality') {
    const publicKey = params.get('pbk')
    if (!publicKey) throw new Error('کلید عمومی Reality وجود ندارد.')
    stream.realitySettings = { serverName, fingerprint, publicKey, shortId: params.get('sid') || '', spiderX: params.get('spx') || '/' }
  }
  if (options.rescueOptions?.enabled && (options.rescueOptions?.recordFragment || options.rescueOptions?.handshakeFragment)) {
    stream.sockopt = { dialerProxy: 'fragment' }
  }
  return stream
}

function normalizeNetwork(value) {
  if (value === 'websocket') return 'ws'
  if (value === 'splithttp') return 'xhttp'
  if (value === 'http-upgrade') return 'httpupgrade'
  if (value === 'http') return 'h2'
  return ['tcp', 'ws', 'grpc', 'httpupgrade', 'xhttp', 'h2', 'quic'].includes(value) ? value : 'tcp'
}

function normalizeDirectDomains(values) {
  const result = []
  for (const value of Array.isArray(values) ? values : []) {
    const normalized = String(value ?? '').trim().toLowerCase().replace(/^domain:/, '').replace(/^\./, '')
    if (!normalized || PROXY_ONLY_DOMAINS.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`))) continue
    if (/^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/i.test(normalized)) result.push(normalized)
  }
  return [...new Set(result)].sort()
}

function effectiveHost(host, cleanIp) {
  return cleanIp && /(?:cloudflare|workers\.dev|pages\.dev)$/i.test(host) ? cleanIp : host
}

function requirePort(parsed) {
  const port = Number(parsed.port)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('پورت سرور معتبر نیست.')
  return port
}

function parseEndpoint(value) {
  const match = String(value).match(/^\[([^\]]+)\]:(\d+)$/) || String(value).match(/^(.+):(\d+)$/)
  return match ? { host: match[1], port: Number(match[2]) } : { host: '', port: 0 }
}

function decodeBase64(value) {
  const normalized = String(value).replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '')
  return Buffer.from(normalized + '='.repeat((4 - normalized.length % 4) % 4), 'base64').toString('utf8')
}

function parseBoolean(value) {
  return ['1', 'true', 'yes'].includes(String(value ?? '').toLowerCase())
}

async function checkConfig(enginePath, configPath) {
  try {
    const { stdout, stderr } = await execFileAsync(enginePath, ['run', '-test', '-c', configPath], { windowsHide: true, timeout: 15000, encoding: 'utf8' })
    return { success: true, stdout: `${stdout}\n${stderr}`.trim(), error: null }
  } catch (error) {
    return { success: false, stdout: String(error?.stdout || ''), error: String(error?.stderr || error?.message || 'اعتبارسنجی Xray ناموفق بود.').slice(0, 3000) }
  }
}

async function writeJsonAtomically(configPath, config) {
  const temporaryPath = `${configPath}.tmp`
  await fs.writeFile(temporaryPath, JSON.stringify(config, null, 2), 'utf8')
  await fs.rm(configPath, { force: true })
  await fs.rename(temporaryPath, configPath)
}

module.exports = { createAndCheckXrayConfig, getXrayCompatibility }
