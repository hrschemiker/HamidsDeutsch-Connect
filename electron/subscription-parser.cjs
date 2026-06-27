const {
  createStableNodeId,
} = require('./server-node-id.cjs')

const SUPPORTED_PROTOCOLS = [
  'vmess://',
  'vless://',
  'trojan://',
  'ss://',
  'hysteria://',
  'hysteria2://',
  'hy2://',
  'tuic://',
  'anytls://',
]

function parseSubscriptionNodeRecords(
  content,
) {
  const normalizedContent =
    decodeSubscriptionContent(content)

  const lines = normalizedContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const records = []

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

    const node = parseNode(line)

    if (!node) {
      continue
    }

    const id =
      createStableNodeId(line)

    records.push({
      id,
      uri: line,
      node: {
        ...node,
        id,
      },
    })
  }

  return records
}

function parseSubscriptionNodes(
  content,
) {
  return parseSubscriptionNodeRecords(
    content,
  ).map((record) => record.node)
}

function decodeSubscriptionContent(content) {
  const trimmedContent = content
    .replace(/^\uFEFF/, '')
    .trim()

  if (
    SUPPORTED_PROTOCOLS.some((protocol) =>
      trimmedContent
        .toLowerCase()
        .includes(protocol),
    )
  ) {
    return trimmedContent
  }

  const decoded = tryDecodeBase64(
    trimmedContent,
  )

  return decoded ?? trimmedContent
}

function parseNode(uri) {
  const protocol = uri
    .slice(0, uri.indexOf('://'))
    .toLowerCase()

  try {
    switch (protocol) {
      case 'vmess':
        return parseVmess(uri)

      case 'vless':
      case 'trojan':
      case 'hysteria':
      case 'hysteria2':
      case 'hy2':
      case 'tuic':
      case 'anytls':
        return parseStandardUri(
          uri,
          protocol,
        )

      case 'ss':
        return parseShadowsocks(uri)

      default:
        return null
    }
  } catch {
    return createUnknownNode(
      protocol,
      uri,
    )
  }
}

function parseVmess(uri) {
  const encoded = uri.slice(
    'vmess://'.length,
  )

  const decoded = decodeBase64Value(
    encoded,
  )

  if (!decoded) {
    return createUnknownNode(
      'vmess',
      uri,
    )
  }

  let config

  try {
    config = JSON.parse(decoded)
  } catch {
    return createUnknownNode(
      'vmess',
      uri,
    )
  }

  const host = normalizeHost(
    config.add,
  )

  const port = normalizePort(
    config.port,
  )

  const transport =
    normalizeText(config.net) ||
    'tcp'

  const tlsValue =
    normalizeText(config.tls)

  return {
    name:
      normalizeNodeName(config.ps) ||
      createDefaultName('VMess', host),
    protocol: 'vmess',
    host,
    port,
    transport,
    tls:
      tlsValue === 'tls' ||
      tlsValue === 'reality',
    security:
      tlsValue || null,
    valid: Boolean(host && port),
  }
}

function parseStandardUri(
  uri,
  protocol,
) {
  const parsed = new URL(uri)

  const host = normalizeHost(
    parsed.hostname,
  )

  const port = normalizePort(
    parsed.port,
  )

  const params = parsed.searchParams

  const transport =
    normalizeText(
      params.get('type'),
    ) ||
    normalizeText(
      params.get('transport'),
    ) ||
    defaultTransportForProtocol(
      protocol,
    )

  const security =
    normalizeText(
      params.get('security'),
    ) ||
    normalizeText(
      params.get('tls'),
    )

  const tls =
    security === 'tls' ||
    security === 'reality' ||
    params.get('insecure') !== null ||
    protocol === 'hysteria' ||
    protocol === 'hysteria2' ||
    protocol === 'hy2'

  return {
    name:
      extractFragmentName(parsed.hash) ||
      createDefaultName(
        formatProtocolName(protocol),
        host,
      ),
    protocol,
    host,
    port,
    transport,
    tls,
    security: security || null,
    valid: Boolean(host && port),
  }
}

function parseShadowsocks(uri) {
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

  const mainPart =
    queryIndex >= 0
      ? withoutHash.slice(
          0,
          queryIndex,
        )
      : withoutHash

  let serverPart = mainPart

  if (!serverPart.includes('@')) {
    const decoded =
      decodeBase64Value(serverPart)

    if (decoded) {
      serverPart = decoded
    }
  }

  const atIndex =
    serverPart.lastIndexOf('@')

  const address =
    atIndex >= 0
      ? serverPart.slice(atIndex + 1)
      : serverPart

  const {
    host,
    port,
  } = parseHostAndPort(address)

  return {
    name:
      decodeText(rawName) ||
      createDefaultName(
        'Shadowsocks',
        host,
      ),
    protocol: 'ss',
    host,
    port,
    transport: 'tcp/udp',
    tls: false,
    security: null,
    valid: Boolean(host && port),
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

    const host = trimmed.slice(
      1,
      closingBracket,
    )

    const portText =
      trimmed.slice(
        closingBracket + 1,
      )

    return {
      host: normalizeHost(host),
      port: normalizePort(
        portText.replace(/^:/, ''),
      ),
    }
  }

  const separator =
    trimmed.lastIndexOf(':')

  if (separator < 0) {
    return {
      host: normalizeHost(trimmed),
      port: null,
    }
  }

  return {
    host: normalizeHost(
      trimmed.slice(0, separator),
    ),
    port: normalizePort(
      trimmed.slice(separator + 1),
    ),
  }
}

function createUnknownNode(
  protocol,
  uri,
) {
  let name =
    formatProtocolName(protocol)

  try {
    const hashIndex =
      uri.lastIndexOf('#')

    if (hashIndex >= 0) {
      name =
        decodeText(
          uri.slice(hashIndex + 1),
        ) || name
    }
  } catch {
    // اطلاعات حساس عمداً نادیده گرفته می‌شود.
  }

  return {
    name,
    protocol,
    host: null,
    port: null,
    transport: null,
    tls: false,
    security: null,
    valid: false,
  }
}

function tryDecodeBase64(value) {
  const compact = value.replace(
    /\s+/g,
    '',
  )

  if (
    compact.length < 8 ||
    !/^[A-Za-z0-9+/_=-]+$/.test(
      compact,
    )
  ) {
    return null
  }

  const decoded =
    decodeBase64Value(compact)

  if (!decoded) {
    return null
  }

  const controlCharacters = (
    decoded.match(
      /[\u0000-\u0008\u000E-\u001F]/g,
    ) ?? []
  ).length

  if (
    controlCharacters >
    Math.max(
      2,
      decoded.length * 0.01,
    )
  ) {
    return null
  }

  return decoded.trim()
}

function decodeBase64Value(value) {
  try {
    const normalized = value
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .replace(/\s+/g, '')

    const padding =
      (4 - (normalized.length % 4)) %
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
    typeof value !== 'string'
  ) {
    return null
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .slice(0, 40)

  return normalized || null
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
    return normalizeNodeName(value)
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

function defaultTransportForProtocol(
  protocol,
) {
  if (
    protocol === 'hysteria' ||
    protocol === 'hysteria2' ||
    protocol === 'hy2' ||
    protocol === 'tuic'
  ) {
    return 'udp'
  }

  return 'tcp'
}

function formatProtocolName(
  protocol,
) {
  const names = {
    vmess: 'VMess',
    vless: 'VLESS',
    trojan: 'Trojan',
    ss: 'Shadowsocks',
    hysteria: 'Hysteria',
    hysteria2: 'Hysteria 2',
    hy2: 'Hysteria 2',
    tuic: 'TUIC',
    anytls: 'AnyTLS',
  }

  return names[protocol] ?? protocol
}

module.exports = {
  parseSubscriptionNodes,
  parseSubscriptionNodeRecords,
}