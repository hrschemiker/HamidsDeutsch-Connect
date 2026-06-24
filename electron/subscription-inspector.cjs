const { net } = require('electron')

const {
  parseSubscriptionNodes,
} = require('./subscription-parser.cjs')

const DOWNLOAD_TIMEOUT_MS = 20000
const MAX_RESPONSE_SIZE_BYTES =
  5 * 1024 * 1024

async function inspectSubscriptionUrl(
  subscriptionUrl,
) {
  const downloadResult =
    await downloadSubscriptionContent(
      subscriptionUrl,
    )

  if (!downloadResult.success) {
    return downloadResult
  }

  const nodes = parseSubscriptionNodes(
    downloadResult.content,
  )

  return {
    success: true,
    checkedAt:
      downloadResult.checkedAt,
    httpStatus:
      downloadResult.httpStatus,
    httpStatusText:
      downloadResult.httpStatusText,
    contentType:
      downloadResult.contentType,
    responseSize:
      downloadResult.responseSize,
    format:
      detectContentFormat(
        downloadResult.content,
        nodes.length,
      ),
    configCount: nodes.length,
    error: null,
  }
}

async function loadSubscriptionNodes(
  subscriptionUrl,
) {
  const downloadResult =
    await downloadSubscriptionContent(
      subscriptionUrl,
    )

  if (!downloadResult.success) {
    return {
      success: false,
      checkedAt:
        downloadResult.checkedAt,
      nodes: [],
      error:
        downloadResult.error,
    }
  }

  const nodes = parseSubscriptionNodes(
    downloadResult.content,
  )

  return {
    success: true,
    checkedAt:
      downloadResult.checkedAt,
    nodes,
    error: null,
  }
}

async function downloadSubscriptionContent(
  subscriptionUrl,
) {
  validateSubscriptionUrl(
    subscriptionUrl,
  )

  const controller =
    new AbortController()

  const timeout = setTimeout(() => {
    controller.abort()
  }, DOWNLOAD_TIMEOUT_MS)

  try {
    const response = await net.fetch(
      subscriptionUrl,
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

    const contentLengthHeader =
      response.headers.get(
        'content-length',
      )

    const declaredSize =
      parseContentLength(
        contentLengthHeader,
      )

    if (
      declaredSize !== null &&
      declaredSize >
        MAX_RESPONSE_SIZE_BYTES
    ) {
      return createDownloadError(
        'حجم پاسخ اشتراک بیشتر از محدودیت ۵ مگابایت است.',
      )
    }

    if (!response.ok) {
      return {
        success: false,
        checkedAt:
          new Date().toISOString(),
        httpStatus: response.status,
        httpStatusText:
          response.statusText,
        contentType:
          response.headers.get(
            'content-type',
          ),
        responseSize: declaredSize,
        content: null,
        format: 'http-error',
        configCount: 0,
        error:
          `سرور اشتراک با وضعیت HTTP ${response.status} پاسخ داد.`,
      }
    }

    const bodyBuffer =
      Buffer.from(
        await response.arrayBuffer(),
      )

    if (
      bodyBuffer.byteLength >
      MAX_RESPONSE_SIZE_BYTES
    ) {
      return createDownloadError(
        'حجم پاسخ اشتراک بیشتر از محدودیت ۵ مگابایت است.',
      )
    }

    const content = bodyBuffer
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .trim()

    if (!content) {
      return {
        success: false,
        checkedAt:
          new Date().toISOString(),
        httpStatus: response.status,
        httpStatusText:
          response.statusText,
        contentType:
          response.headers.get(
            'content-type',
          ),
        responseSize:
          bodyBuffer.byteLength,
        content: null,
        format: 'empty',
        configCount: 0,
        error:
          'پاسخ اشتراک خالی است.',
      }
    }

    return {
      success: true,
      checkedAt:
        new Date().toISOString(),
      httpStatus: response.status,
      httpStatusText:
        response.statusText,
      contentType:
        response.headers.get(
          'content-type',
        ),
      responseSize:
        bodyBuffer.byteLength,
      content,
      error: null,
    }
  } catch (error) {
    if (
      error?.name === 'AbortError'
    ) {
      return createDownloadError(
        'زمان دریافت اشتراک بیش از ۲۰ ثانیه شد.',
        'timeout',
      )
    }

    return createDownloadError(
      error instanceof Error
        ? error.message
        : 'دریافت اشتراک با خطا مواجه شد.',
      'network-error',
    )
  } finally {
    clearTimeout(timeout)
  }
}

function detectContentFormat(
  content,
  nodeCount,
) {
  if (nodeCount === 0) {
    return 'unknown'
  }

  const trimmed = content.trim()

  const containsDirectUri =
    /(?:^|\r?\n)(?:vmess|vless|trojan|ss|hysteria2?|hy2|tuic):\/\//i.test(
      trimmed,
    )

  if (containsDirectUri) {
    return 'uri-list'
  }

  return 'base64-uri-list'
}

function createDownloadError(
  error,
  format = 'network-error',
) {
  return {
    success: false,
    checkedAt:
      new Date().toISOString(),
    httpStatus: null,
    httpStatusText: null,
    contentType: null,
    responseSize: null,
    content: null,
    format,
    configCount: 0,
    error,
  }
}

function parseContentLength(value) {
  if (!value) {
    return null
  }

  const parsed = Number(value)

  if (
    !Number.isFinite(parsed) ||
    parsed < 0
  ) {
    return null
  }

  return parsed
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
  loadSubscriptionNodes,
}