const { net } = require('electron')

const DOWNLOAD_TIMEOUT_MS = 20000
const MAX_RESPONSE_SIZE_BYTES = 5 * 1024 * 1024

const CONFIG_PROTOCOLS = [
  'vmess://',
  'vless://',
  'trojan://',
  'ss://',
  'ssr://',
  'hysteria://',
  'hysteria2://',
  'hy2://',
  'tuic://',
  'wireguard://',
  'socks://',
  'http://',
  'https://',
]

async function inspectSubscriptionUrl(subscriptionUrl) {
  validateSubscriptionUrl(subscriptionUrl)

  const controller = new AbortController()

  const timeout = setTimeout(() => {
    controller.abort()
  }, DOWNLOAD_TIMEOUT_MS)

  try {
    const response = await net.fetch(subscriptionUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,

      headers: {
        Accept:
          'text/plain, application/json, application/octet-stream;q=0.9, */*;q=0.8',

        'User-Agent':
          'HamidsDeutsch-Connect/0.1.0',
      },
    })

    const contentLengthHeader =
      response.headers.get('content-length')

    const declaredSize = parseContentLength(
      contentLengthHeader,
    )

    if (
      declaredSize !== null &&
      declaredSize > MAX_RESPONSE_SIZE_BYTES
    ) {
      throw new Error(
        'حجم پاسخ اشتراک بیشتر از محدودیت ۵ مگابایت است.',
      )
    }

    if (!response.ok) {
      return {
        success: false,
        checkedAt: new Date().toISOString(),
        httpStatus: response.status,
        httpStatusText: response.statusText,
        contentType:
          response.headers.get('content-type'),
        responseSize: declaredSize,
        format: 'http-error',
        configCount: 0,
        error: `سرور اشتراک با وضعیت HTTP ${response.status} پاسخ داد.`,
      }
    }

    const bodyBuffer = Buffer.from(
      await response.arrayBuffer(),
    )

    if (
      bodyBuffer.byteLength >
      MAX_RESPONSE_SIZE_BYTES
    ) {
      throw new Error(
        'حجم پاسخ اشتراک بیشتر از محدودیت ۵ مگابایت است.',
      )
    }

    const textContent = bodyBuffer
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .trim()

    if (!textContent) {
      return {
        success: false,
        checkedAt: new Date().toISOString(),
        httpStatus: response.status,
        httpStatusText: response.statusText,
        contentType:
          response.headers.get('content-type'),
        responseSize: bodyBuffer.byteLength,
        format: 'empty',
        configCount: 0,
        error: 'پاسخ اشتراک خالی است.',
      }
    }

    const analysis = analyzeSubscriptionContent(
      textContent,
    )

    return {
      success: true,
      checkedAt: new Date().toISOString(),
      httpStatus: response.status,
      httpStatusText: response.statusText,
      contentType:
        response.headers.get('content-type'),
      responseSize: bodyBuffer.byteLength,
      format: analysis.format,
      configCount: analysis.configCount,
      error: null,
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      return {
        success: false,
        checkedAt: new Date().toISOString(),
        httpStatus: null,
        httpStatusText: null,
        contentType: null,
        responseSize: null,
        format: 'timeout',
        configCount: 0,
        error:
          'زمان دریافت اشتراک بیش از ۲۰ ثانیه شد.',
      }
    }

    return {
      success: false,
      checkedAt: new Date().toISOString(),
      httpStatus: null,
      httpStatusText: null,
      contentType: null,
      responseSize: null,
      format: 'network-error',
      configCount: 0,
      error:
        error instanceof Error
          ? error.message
          : 'دریافت اشتراک با خطا مواجه شد.',
    }
  } finally {
    clearTimeout(timeout)
  }
}

function analyzeSubscriptionContent(content) {
  const directUriCount =
    countConfigurationUris(content)

  if (directUriCount > 0) {
    return {
      format: 'uri-list',
      configCount: directUriCount,
    }
  }

  const jsonResult = analyzeJsonContent(content)

  if (jsonResult) {
    return jsonResult
  }

  const decodedBase64 =
    tryDecodeBase64(content)

  if (decodedBase64) {
    const decodedUriCount =
      countConfigurationUris(decodedBase64)

    if (decodedUriCount > 0) {
      return {
        format: 'base64-uri-list',
        configCount: decodedUriCount,
      }
    }

    const decodedJson =
      analyzeJsonContent(decodedBase64)

    if (decodedJson) {
      return {
        format: 'base64-json',
        configCount: decodedJson.configCount,
      }
    }

    return {
      format: 'base64-unknown',
      configCount: 0,
    }
  }

  return {
    format: 'unknown',
    configCount: 0,
  }
}

function analyzeJsonContent(content) {
  if (
    !content.startsWith('{') &&
    !content.startsWith('[')
  ) {
    return null
  }

  try {
    const parsed = JSON.parse(content)

    return {
      format: 'json',
      configCount:
        estimateJsonConfigurationCount(parsed),
    }
  } catch {
    return null
  }
}

function estimateJsonConfigurationCount(value) {
  if (Array.isArray(value)) {
    return value.length
  }

  if (
    value &&
    typeof value === 'object'
  ) {
    const possibleArrays = [
      value.outbounds,
      value.proxies,
      value.servers,
      value.nodes,
      value.configs,
    ]

    for (const possibleArray of possibleArrays) {
      if (Array.isArray(possibleArray)) {
        return possibleArray.length
      }
    }

    return 1
  }

  return 0
}

function countConfigurationUris(content) {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.filter((line) =>
    CONFIG_PROTOCOLS.some((protocol) =>
      line
        .toLowerCase()
        .startsWith(protocol),
    ),
  ).length
}

function tryDecodeBase64(content) {
  const compactContent = content.replace(
    /\s+/g,
    '',
  )

  if (
    compactContent.length < 8 ||
    !/^[A-Za-z0-9+/_=-]+$/.test(
      compactContent,
    )
  ) {
    return null
  }

  try {
    const normalized = compactContent
      .replace(/-/g, '+')
      .replace(/_/g, '/')

    const paddingLength =
      (4 - (normalized.length % 4)) % 4

    const padded =
      normalized + '='.repeat(paddingLength)

    const decoded = Buffer.from(
      padded,
      'base64',
    ).toString('utf8')

    if (!decoded.trim()) {
      return null
    }

    const replacementCharacterCount = (
      decoded.match(/\uFFFD/g) ?? []
    ).length

    if (
      replacementCharacterCount >
      Math.max(2, decoded.length * 0.02)
    ) {
      return null
    }

    return decoded.trim()
  } catch {
    return null
  }
}

function parseContentLength(value) {
  if (!value) {
    return null
  }

  const parsedValue = Number(value)

  if (
    !Number.isFinite(parsedValue) ||
    parsedValue < 0
  ) {
    return null
  }

  return parsedValue
}

function validateSubscriptionUrl(value) {
  let parsedUrl

  try {
    parsedUrl = new URL(value)
  } catch {
    throw new Error(
      'لینک ذخیره‌شده معتبر نیست.',
    )
  }

  if (
    parsedUrl.protocol !== 'https:' &&
    parsedUrl.protocol !== 'http:'
  ) {
    throw new Error(
      'پروتکل لینک اشتراک معتبر نیست.',
    )
  }
}

module.exports = {
  inspectSubscriptionUrl,
}