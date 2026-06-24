const {
  createHash,
} = require('node:crypto')

function createStableNodeId(uri) {
  const canonicalValue =
    canonicalizeNodeUri(uri)

  const digest = createHash('sha256')
    .update(canonicalValue, 'utf8')
    .digest('hex')
    .slice(0, 16)

  return `node-${digest}`
}

function canonicalizeNodeUri(uri) {
  if (typeof uri !== 'string') {
    return 'invalid-node'
  }

  const trimmed = uri.trim()
  const separator = trimmed.indexOf('://')

  if (separator < 1) {
    return trimmed
  }

  const protocol = trimmed
    .slice(0, separator)
    .toLowerCase()

  if (protocol === 'vmess') {
    return canonicalizeVmess(trimmed)
  }

  try {
    const parsed = new URL(trimmed)

    parsed.protocol = `${protocol}:`
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase()

    const sortedParams = Array.from(
      parsed.searchParams.entries(),
    ).sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      const keyComparison = leftKey.localeCompare(rightKey)

      if (keyComparison !== 0) {
        return keyComparison
      }

      return leftValue.localeCompare(rightValue)
    })

    parsed.search = ''

    for (const [key, value] of sortedParams) {
      parsed.searchParams.append(key, value)
    }

    return parsed.toString()
  } catch {
    return stripFragment(trimmed)
  }
}

function canonicalizeVmess(uri) {
  const encoded = uri.slice('vmess://'.length)
  const decoded = decodeBase64Value(encoded)

  if (!decoded) {
    return stripFragment(uri)
  }

  try {
    const config = JSON.parse(decoded)

    // عنوان نمایشی نباید هویت فنی سرور را تغییر دهد.
    delete config.ps

    return `vmess://${stableStringify(config)}`
  } catch {
    return stripFragment(uri)
  }
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    const keys = Object.keys(value).sort()

    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function stripFragment(value) {
  const hashIndex = value.indexOf('#')

  return hashIndex >= 0
    ? value.slice(0, hashIndex)
    : value
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
      (4 - (normalized.length % 4)) % 4

    return Buffer.from(
      normalized + '='.repeat(padding),
      'base64',
    ).toString('utf8')
  } catch {
    return null
  }
}

module.exports = {
  createStableNodeId,
}
