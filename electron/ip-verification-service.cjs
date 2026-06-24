const {
  net: electronNet,
} = require('electron')

const nodeNet =
  require('node:net')

const tls =
  require('node:tls')

const crypto =
  require('node:crypto')

const DIRECT_TIMEOUT_MS = 10000
const PROXY_TIMEOUT_MS = 12000
const MAX_RESPONSE_BYTES = 64 * 1024

const IP_SERVICE_HOST =
  'api.ipify.org'

const IP_SERVICE_PORT = 443
const IP_SERVICE_PATH = '/'

async function verifyIpChange({
  proxyHost,
  proxyPort,
}) {
  validateProxyAddress(
    proxyHost,
    proxyPort,
  )

  const checkedAt =
    new Date().toISOString()

  const directStartedAt =
    Date.now()

  const directIp =
    await fetchDirectIp()

  const directDurationMs =
    Date.now() -
    directStartedAt

  const proxyStartedAt =
    Date.now()

  const proxyIp =
    await fetchIpThroughProxy({
      proxyHost,
      proxyPort,
    })

  const proxyDurationMs =
    Date.now() -
    proxyStartedAt

  const changed =
    directIp !== proxyIp

  return {
    success: true,
    checkedAt,
    directIp,
    proxyIp,
    changed,
    directDurationMs,
    proxyDurationMs,
    service:
      IP_SERVICE_HOST,
    error: changed
      ? null
      : 'IP خروجی پروکسی با IP مستقیم یکسان است.',
  }
}

async function fetchDirectIp() {
  const controller =
    new AbortController()

  const timeoutId =
    setTimeout(() => {
      controller.abort()
    }, DIRECT_TIMEOUT_MS)

  try {
    const cacheBuster =
      crypto.randomBytes(8)
        .toString('hex')

    const response =
      await electronNet.fetch(
        `https://${IP_SERVICE_HOST}${IP_SERVICE_PATH}?r=${cacheBuster}`,
        {
          method: 'GET',
          redirect: 'error',
          cache: 'no-store',
          signal:
            controller.signal,
          headers: {
            Accept:
              'text/plain',
            'User-Agent':
              'HamidsDeutsch-Connect/0.1.0',
          },
        },
      )

    if (!response.ok) {
      throw new Error(
        `سرویس IP مستقیم با وضعیت HTTP ${response.status} پاسخ داد.`,
      )
    }

    const text =
      await response.text()

    return normalizeIp(text)
  } catch (error) {
    if (
      error?.name ===
      'AbortError'
    ) {
      throw new Error(
        'زمان دریافت IP مستقیم تمام شد.',
      )
    }

    throw new Error(
      error instanceof Error
        ? `دریافت IP مستقیم ناموفق بود: ${error.message}`
        : 'دریافت IP مستقیم ناموفق بود.',
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

function fetchIpThroughProxy({
  proxyHost,
  proxyPort,
}) {
  return new Promise(
    (resolve, reject) => {
      const proxySocket =
        new nodeNet.Socket()

      let settled = false
      let connectBuffer =
        Buffer.alloc(0)

      const overallTimer =
        setTimeout(() => {
          finishError(
            new Error(
              'زمان دریافت IP از پروکسی تمام شد.',
            ),
          )
        }, PROXY_TIMEOUT_MS)

      function cleanup() {
        clearTimeout(overallTimer)
      }

      function finishSuccess(ip) {
        if (settled) {
          return
        }

        settled = true
        cleanup()
        proxySocket.destroy()
        resolve(ip)
      }

      function finishError(error) {
        if (settled) {
          return
        }

        settled = true
        cleanup()
        proxySocket.destroy()

        reject(
          error instanceof Error
            ? error
            : new Error(
                'درخواست IP از پروکسی ناموفق بود.',
              ),
        )
      }

      proxySocket.setTimeout(
        PROXY_TIMEOUT_MS,
      )

      proxySocket.once(
        'timeout',
        () => {
          finishError(
            new Error(
              'پروکسی محلی در زمان تعیین‌شده پاسخ نداد.',
            ),
          )
        },
      )

      proxySocket.once(
        'error',
        (error) => {
          finishError(
            new Error(
              `اتصال به پروکسی محلی ناموفق بود: ${error.message}`,
            ),
          )
        },
      )

      proxySocket.on(
        'data',
        handleConnectData,
      )

      proxySocket.once(
        'connect',
        () => {
          const request = [
            `CONNECT ${IP_SERVICE_HOST}:${IP_SERVICE_PORT} HTTP/1.1`,
            `Host: ${IP_SERVICE_HOST}:${IP_SERVICE_PORT}`,
            'Proxy-Connection: keep-alive',
            'Connection: keep-alive',
            '',
            '',
          ].join('\r\n')

          proxySocket.write(
            request,
            'ascii',
          )
        },
      )

      function handleConnectData(
        chunk,
      ) {
        connectBuffer =
          Buffer.concat([
            connectBuffer,
            chunk,
          ])

        if (
          connectBuffer.length >
          MAX_RESPONSE_BYTES
        ) {
          finishError(
            new Error(
              'پاسخ CONNECT پروکسی بیش از حد بزرگ بود.',
            ),
          )

          return
        }

        const headerEnd =
          connectBuffer.indexOf(
            '\r\n\r\n',
          )

        if (headerEnd < 0) {
          return
        }

        proxySocket.off(
          'data',
          handleConnectData,
        )

        const header =
          connectBuffer
            .subarray(
              0,
              headerEnd,
            )
            .toString('latin1')

        const statusLine =
          header.split('\r\n')[0] ??
          ''

        const statusMatch =
          statusLine.match(
            /^HTTP\/\d(?:\.\d)?\s+(\d{3})/,
          )

        const statusCode =
          statusMatch
            ? Number(
                statusMatch[1],
              )
            : null

        if (statusCode !== 200) {
          finishError(
            new Error(
              `پروکسی درخواست CONNECT را نپذیرفت${statusCode ? `؛ وضعیت ${statusCode}` : ''}.`,
            ),
          )

          return
        }

        const remaining =
          connectBuffer.subarray(
            headerEnd + 4,
          )

        if (
          remaining.length > 0
        ) {
          proxySocket.unshift(
            remaining,
          )
        }

        beginTlsRequest()
      }

      function beginTlsRequest() {
        const tlsSocket =
          tls.connect({
            socket:
              proxySocket,
            servername:
              IP_SERVICE_HOST,
            rejectUnauthorized:
              true,
            ALPNProtocols: [
              'http/1.1',
            ],
          })

        let responseBuffer =
          Buffer.alloc(0)

        tlsSocket.setTimeout(
          PROXY_TIMEOUT_MS,
        )

        tlsSocket.once(
          'secureConnect',
          () => {
            const cacheBuster =
              crypto.randomBytes(8)
                .toString('hex')

            const request = [
              `GET ${IP_SERVICE_PATH}?r=${cacheBuster} HTTP/1.1`,
              `Host: ${IP_SERVICE_HOST}`,
              'Accept: text/plain',
              'User-Agent: HamidsDeutsch-Connect/0.1.0',
              'Connection: close',
              '',
              '',
            ].join('\r\n')

            tlsSocket.write(
              request,
              'ascii',
            )
          },
        )

        tlsSocket.on(
          'data',
          (chunk) => {
            responseBuffer =
              Buffer.concat([
                responseBuffer,
                chunk,
              ])

            if (
              responseBuffer.length >
              MAX_RESPONSE_BYTES
            ) {
              tlsSocket.destroy()

              finishError(
                new Error(
                  'پاسخ سرویس IP بیش از حد بزرگ بود.',
                ),
              )
            }
          },
        )

        tlsSocket.once(
          'timeout',
          () => {
            tlsSocket.destroy()

            finishError(
              new Error(
                'درخواست HTTPS از داخل پروکسی زمان‌بر شد.',
              ),
            )
          },
        )

        tlsSocket.once(
          'error',
          (error) => {
            finishError(
              new Error(
                `درخواست TLS از داخل پروکسی ناموفق بود: ${error.message}`,
              ),
            )
          },
        )

        tlsSocket.once(
          'end',
          () => {
            try {
              const body =
                parseHttpResponse(
                  responseBuffer,
                )

              finishSuccess(
                normalizeIp(body),
              )
            } catch (error) {
              finishError(error)
            }
          },
        )
      }

      try {
        proxySocket.connect({
          host: proxyHost,
          port: proxyPort,
        })
      } catch (error) {
        finishError(error)
      }
    },
  )
}

function parseHttpResponse(
  responseBuffer,
) {
  const headerEnd =
    responseBuffer.indexOf(
      '\r\n\r\n',
    )

  if (headerEnd < 0) {
    throw new Error(
      'پاسخ HTTP سرویس IP ناقص بود.',
    )
  }

  const headerText =
    responseBuffer
      .subarray(
        0,
        headerEnd,
      )
      .toString('latin1')

  const headerLines =
    headerText.split('\r\n')

  const statusLine =
    headerLines.shift() ?? ''

  const statusMatch =
    statusLine.match(
      /^HTTP\/\d(?:\.\d)?\s+(\d{3})/,
    )

  const statusCode =
    statusMatch
      ? Number(statusMatch[1])
      : null

  if (
    statusCode === null ||
    statusCode < 200 ||
    statusCode >= 300
  ) {
    throw new Error(
      `سرویس IP از داخل پروکسی پاسخ معتبر نداد${statusCode ? `؛ وضعیت ${statusCode}` : ''}.`,
    )
  }

  const headers = {}

  for (
    const line of headerLines
  ) {
    const separator =
      line.indexOf(':')

    if (separator < 0) {
      continue
    }

    const name =
      line
        .slice(0, separator)
        .trim()
        .toLowerCase()

    const value =
      line
        .slice(separator + 1)
        .trim()

    headers[name] = value
  }

  const rawBody =
    responseBuffer.subarray(
      headerEnd + 4,
    )

  if (
    headers[
      'transfer-encoding'
    ]?.toLowerCase()
      .includes('chunked')
  ) {
    return decodeChunkedBody(
      rawBody,
    ).toString('utf8')
  }

  return rawBody.toString(
    'utf8',
  )
}

function decodeChunkedBody(
  buffer,
) {
  const chunks = []
  let offset = 0

  while (
    offset < buffer.length
  ) {
    const lineEnd =
      buffer.indexOf(
        '\r\n',
        offset,
      )

    if (lineEnd < 0) {
      throw new Error(
        'بدنه Chunked ناقص است.',
      )
    }

    const sizeText =
      buffer
        .subarray(
          offset,
          lineEnd,
        )
        .toString('ascii')
        .split(';')[0]
        .trim()

    const size =
      Number.parseInt(
        sizeText,
        16,
      )

    if (
      !Number.isFinite(size)
    ) {
      throw new Error(
        'اندازه Chunked معتبر نیست.',
      )
    }

    offset =
      lineEnd + 2

    if (size === 0) {
      break
    }

    const chunkEnd =
      offset + size

    if (
      chunkEnd >
      buffer.length
    ) {
      throw new Error(
        'بدنه Chunked ناقص است.',
      )
    }

    chunks.push(
      buffer.subarray(
        offset,
        chunkEnd,
      ),
    )

    offset =
      chunkEnd + 2
  }

  return Buffer.concat(chunks)
}

function normalizeIp(value) {
  const candidate =
    String(value ?? '')
      .trim()
      .split(/\s+/)[0]
      .replace(/^\[/, '')
      .replace(/\]$/, '')

  if (
    nodeNet.isIP(candidate) ===
    0
  ) {
    throw new Error(
      'سرویس بررسی IP مقدار معتبری برنگرداند.',
    )
  }

  return candidate
}

function validateProxyAddress(
  proxyHost,
  proxyPort,
) {
  if (
    typeof proxyHost !==
      'string' ||
    !proxyHost.trim()
  ) {
    throw new Error(
      'آدرس پروکسی محلی معتبر نیست.',
    )
  }

  if (
    !Number.isInteger(
      proxyPort,
    ) ||
    proxyPort < 1 ||
    proxyPort > 65535
  ) {
    throw new Error(
      'پورت پروکسی محلی معتبر نیست.',
    )
  }
}

module.exports = {
  verifyIpChange,
}
