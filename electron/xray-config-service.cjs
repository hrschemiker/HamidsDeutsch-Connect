'use strict'

/**
 * Builds xray-core JSON configs from VLESS/VMess/Trojan/Shadowsocks URIs.
 *
 * Xray natively supports TLS fragmentation (sockopt.fragment), which is the
 * main reason to fall back to it when sing-box fails under heavy DPI.
 *
 * Unsupported protocols (Hysteria2, TUIC, AnyTLS) return null so the caller
 * can skip the xray attempt gracefully.
 */

const path = require('node:path')
const fs = require('node:fs/promises')

// Protocols xray-core can handle
const XRAY_SUPPORTED = new Set(['vless', 'vmess', 'trojan', 'ss', 'shadowsocks'])

function isXrayCompatible(uri) {
  if (typeof uri !== 'string') return false
  const proto = uri.split('://')[0].toLowerCase()
  return XRAY_SUPPORTED.has(proto)
}

// ── Inbound (mixed HTTP+SOCKS5 on the same port) ─────────────────────────────

function buildInbound(port = 2080) {
  return {
    tag: 'mixed-in',
    port,
    listen: '127.0.0.1',
    protocol: 'mixed',
    settings: { udpEnabled: true },
    sniffing: { enabled: false },
  }
}

// ── Stream settings ───────────────────────────────────────────────────────────

function buildStreamSettings(params, security) {
  const network = (params.get('type') || params.get('network') || 'tcp').toLowerCase()
  const stream = { network }

  // TLS
  if (security === 'tls') {
    const sni = params.get('sni') || params.get('serverName') || ''
    const fp = params.get('fp') || 'chrome'
    const alpnRaw = params.get('alpn') || ''
    const alpn = alpnRaw ? alpnRaw.split(',').map(s => s.trim()).filter(Boolean) : ['h2', 'http/1.1']
    stream.security = 'tls'
    stream.tlsSettings = {
      serverName: sni,
      fingerprint: fp,
      allowInsecure: params.get('allowInsecure') === '1' || params.get('insecure') === '1',
      alpn,
    }
  }

  // REALITY
  if (security === 'reality') {
    const pbk = params.get('pbk') || ''
    const sid = params.get('sid') || ''
    const sni = params.get('sni') || params.get('serverName') || ''
    const fp = params.get('fp') || 'chrome'
    stream.security = 'reality'
    stream.realitySettings = {
      show: false,
      fingerprint: fp,
      serverName: sni,
      publicKey: pbk,
      shortId: sid,
      spiderX: '',
    }
  }

  // Transport
  if (network === 'ws' || network === 'websocket') {
    const wsPath = params.get('path') || '/'
    const wsHost = params.get('host') || ''
    stream.network = 'ws'
    stream.wsSettings = { path: wsPath, headers: wsHost ? { Host: wsHost } : {} }
  } else if (network === 'grpc') {
    stream.network = 'grpc'
    stream.grpcSettings = { serviceName: params.get('serviceName') || params.get('path') || '' }
  } else if (network === 'h2' || network === 'http') {
    const h2Host = params.get('host') || ''
    const h2Path = params.get('path') || '/'
    stream.network = 'h2'
    stream.httpSettings = {
      host: h2Host ? [h2Host] : [],
      path: h2Path,
    }
  } else if (network === 'xhttp' || network === 'splithttp') {
    stream.network = 'xhttp'
    stream.xhttpSettings = {
      path: params.get('path') || '/',
      host: params.get('host') || '',
    }
  }
  // tcp/none → no extra settings needed

  // TLS fragmentation — the key feature xray adds over sing-box.
  // Breaks the TLS ClientHello into fragments to bypass DPI.
  // Only apply when TLS is used (not REALITY, which has its own mechanism).
  if (security === 'tls') {
    stream.sockopt = {
      tcpFastOpen: true,
      fragment: {
        packets: 'tlshello',
        length: '100-200',
        interval: '10-20',
      },
    }
  }

  return stream
}

// ── Outbound builders ─────────────────────────────────────────────────────────

function buildVlessOutbound(uri) {
  const parsed = new URL(uri)
  const params = parsed.searchParams
  const uuid = decodeURIComponent(parsed.username)
  const host = parsed.hostname
  const port = parseInt(parsed.port, 10) || 443
  const security = (params.get('security') || '').toLowerCase()
  const flow = params.get('flow') || ''

  return {
    tag: 'proxy',
    protocol: 'vless',
    settings: {
      vnext: [{ address: host, port, users: [{ id: uuid, encryption: 'none', flow }] }],
    },
    streamSettings: buildStreamSettings(params, security),
  }
}

function buildVmessOutbound(uri) {
  // VMess URIs are base64-encoded JSON
  const raw = uri.replace(/^vmess:\/\//i, '')
  let cfg
  try {
    cfg = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'))
  } catch {
    throw new Error('VMess URI is not valid base64 JSON')
  }

  const host = cfg.add || cfg.host || ''
  const port = parseInt(cfg.port, 10) || 443
  const uuid = cfg.id || ''
  const alterId = parseInt(cfg.aid, 10) || 0
  const network = (cfg.net || 'tcp').toLowerCase()
  const security = (cfg.tls || '').toLowerCase()
  const sni = cfg.sni || cfg.host || host
  const fp = cfg.fp || 'chrome'
  const path_ = cfg.path || '/'
  const wsHost = cfg.host || ''

  // Build params-like object to reuse buildStreamSettings
  const fakeParams = new Map([
    ['type', network],
    ['security', security],
    ['sni', sni],
    ['fp', fp],
    ['path', path_],
    ['host', wsHost],
    ['alpn', cfg.alpn || ''],
    ['serviceName', cfg.path || ''],
  ])
  fakeParams.get = (k) => fakeParams.has(k) ? fakeParams.get(k) : null

  // Build a real URLSearchParams-like object
  const sp = new URLSearchParams()
  sp.set('type', network)
  sp.set('security', security)
  sp.set('sni', sni)
  sp.set('fp', fp)
  sp.set('path', path_)
  sp.set('host', wsHost)
  sp.set('alpn', cfg.alpn || '')
  sp.set('serviceName', cfg.path || '')

  return {
    tag: 'proxy',
    protocol: 'vmess',
    settings: {
      vnext: [{ address: host, port, users: [{ id: uuid, security: 'auto', alterId }] }],
    },
    streamSettings: buildStreamSettings(sp, security),
  }
}

function buildTrojanOutbound(uri) {
  const parsed = new URL(uri)
  const params = parsed.searchParams
  const password = decodeURIComponent(parsed.username)
  const host = parsed.hostname
  const port = parseInt(parsed.port, 10) || 443
  const security = (params.get('security') || 'tls').toLowerCase()

  return {
    tag: 'proxy',
    protocol: 'trojan',
    settings: {
      servers: [{ address: host, port, password }],
    },
    streamSettings: buildStreamSettings(params, security),
  }
}

function buildShadowsocksOutbound(uri) {
  const parsed = new URL(uri)
  const host = parsed.hostname
  const port = parseInt(parsed.port, 10)

  // ss://BASE64@host:port or ss://method:password@host:port
  let method, password
  const userInfo = decodeURIComponent(parsed.username)
  if (userInfo.includes(':')) {
    ;[method, password] = userInfo.split(':', 2)
  } else {
    try {
      const decoded = Buffer.from(userInfo, 'base64').toString('utf8')
      ;[method, password] = decoded.split(':', 2)
    } catch {
      throw new Error('Shadowsocks URI could not be decoded')
    }
  }

  return {
    tag: 'proxy',
    protocol: 'shadowsocks',
    settings: {
      servers: [{ address: host, port, method, password }],
    },
    streamSettings: { network: 'tcp' },
  }
}

function buildProxyOutbound(uri) {
  const proto = uri.split('://')[0].toLowerCase()
  if (proto === 'vless') return buildVlessOutbound(uri)
  if (proto === 'vmess') return buildVmessOutbound(uri)
  if (proto === 'trojan') return buildTrojanOutbound(uri)
  if (proto === 'ss' || proto === 'shadowsocks') return buildShadowsocksOutbound(uri)
  return null
}

// ── Routing ───────────────────────────────────────────────────────────────────

function buildRouting(directDomains) {
  const rules = []
  if (Array.isArray(directDomains) && directDomains.length > 0) {
    rules.push({
      type: 'field',
      domain: directDomains.map(d => `domain:${d}`),
      outboundTag: 'direct',
    })
  }
  return {
    domainStrategy: 'IPIfNonMatch',
    rules,
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Build a complete xray config JSON and write it to configPath.
 * Returns true on success, false if the URI protocol is unsupported.
 */
async function buildAndWriteXrayConfig({ uri, directDomains, configPath, localPort = 2080 }) {
  if (!isXrayCompatible(uri)) return false

  const proxyOutbound = buildProxyOutbound(uri)
  if (!proxyOutbound) return false

  const config = {
    log: { loglevel: 'warning' },
    inbounds: [buildInbound(localPort)],
    outbounds: [
      proxyOutbound,
      { tag: 'direct', protocol: 'freedom', settings: {} },
    ],
    routing: buildRouting(directDomains ?? []),
  }

  const dir = path.dirname(configPath)
  await fs.mkdir(dir, { recursive: true })

  const tmp = configPath + '.xray.tmp'
  await fs.writeFile(tmp, JSON.stringify(config, null, 2), 'utf8')
  try {
    await fs.rename(tmp, configPath)
  } catch {
    await fs.rm(configPath, { force: true })
    await fs.rename(tmp, configPath)
  }

  return true
}

module.exports = { buildAndWriteXrayConfig, isXrayCompatible }
