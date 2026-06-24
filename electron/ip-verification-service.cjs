const {
  execFile,
} = require('node:child_process')
const {
  promisify,
} = require('node:util')
const net = require('node:net')

const execFileAsync =
  promisify(execFile)

const REQUEST_TIMEOUT_SECONDS = 7
const CONNECT_TIMEOUT_SECONDS = 5
const MAX_OUTPUT_BYTES = 64 * 1024

const IP_SERVICES = [
  {
    name: 'api.ipify.org',
    url: 'https://api.ipify.org',
  },
  {
    name: 'icanhazip.com',
    url: 'https://icanhazip.com',
  },
  {
    name: 'ifconfig.me',
    url: 'https://ifconfig.me/ip',
  },
]

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

  const directResult =
    await fetchFirstWorkingIp({
      mode: 'direct',
      proxyHost,
      proxyPort,
    })

  const directDurationMs =
    Date.now() -
    directStartedAt

  const proxyStartedAt =
    Date.now()

  const proxyResult =
    await fetchFirstWorkingIp({
      mode: 'proxy',
      proxyHost,
      proxyPort,
    })

  const proxyDurationMs =
    Date.now() -
    proxyStartedAt

  const directIp =
    directResult.ip

  const proxyIp =
    proxyResult.ip

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
      `${directResult.service} / ${proxyResult.service}`,
    error: changed
      ? null
      : 'IP خروجی پروکسی با IP مستقیم یکسان است.',
  }
}

async function fetchFirstWorkingIp({
  mode,
  proxyHost,
  proxyPort,
}) {
  const attempts =
    IP_SERVICES.map(
      async (service) => {
        const ip =
          await fetchIpWithCurl({
            mode,
            serviceUrl:
              service.url,
            proxyHost,
            proxyPort,
          })

        return {
          ip,
          service:
            service.name,
        }
      },
    )

  try {
    return await Promise.any(
      attempts,
    )
  } catch (aggregateError) {
    const messages =
      Array.isArray(
        aggregateError?.errors,
      )
        ? aggregateError.errors
            .map((error) =>
              error instanceof Error
                ? error.message
                : String(error),
            )
            .join(' | ')
        : 'خطای نامشخص'

    const label =
      mode === 'direct'
        ? 'مستقیم'
        : 'از داخل پروکسی'

    throw new Error(
      `دریافت IP ${label} ناموفق بود. ${messages}`,
    )
  }
}

async function fetchIpWithCurl({
  mode,
  serviceUrl,
  proxyHost,
  proxyPort,
}) {
  const args = [
    '--silent',
    '--show-error',
    '--fail',
    '--ipv4',
    '--connect-timeout',
    String(
      CONNECT_TIMEOUT_SECONDS,
    ),
    '--max-time',
    String(
      REQUEST_TIMEOUT_SECONDS,
    ),
    '--header',
    'Accept: text/plain',
    '--user-agent',
    'HamidsDeutsch-Connect/0.1.0',
  ]

  if (mode === 'direct') {
    args.push(
      '--noproxy',
      '*',
    )
  } else {
    args.push(
      '--proxy',
      `http://${proxyHost}:${proxyPort}`,
    )
  }

  args.push(serviceUrl)

  try {
    const {
      stdout,
      stderr,
    } = await execFileAsync(
      'curl.exe',
      args,
      {
        windowsHide: true,
        timeout:
          (REQUEST_TIMEOUT_SECONDS +
            2) *
          1000,
        encoding: 'utf8',
        maxBuffer:
          MAX_OUTPUT_BYTES,
        shell: false,
      },
    )

    const output =
      String(stdout ?? '').trim()

    if (!output) {
      throw new Error(
        sanitizeError(stderr) ||
        'پاسخ سرویس IP خالی بود.',
      )
    }

    return normalizeIp(output)
  } catch (error) {
    if (
      error?.code ===
      'ENOENT'
    ) {
      throw new Error(
        'curl.exe در ویندوز پیدا نشد.',
      )
    }

    const stderr =
      sanitizeError(
        error?.stderr,
      )

    throw new Error(
      stderr ||
      (error instanceof Error
        ? error.message
        : 'اجرای curl ناموفق بود.'),
    )
  }
}

function normalizeIp(value) {
  const candidate =
    String(value ?? '')
      .trim()
      .split(/\s+/)[0]
      .replace(
        /^[\[\("'`]+|[\]\)"'`,;]+$/g,
        '',
      )

  if (
    !net.isIP(candidate)
  ) {
    throw new Error(
      'پاسخ سرویس، یک نشانی IP معتبر نبود.',
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

function sanitizeError(value) {
  return String(value ?? '')
    .replace(
      /https?:\/\/[^\s]+/gi,
      '[service-url]',
    )
    .replace(
      /(?:password|passwd|token|secret|uuid)\s*[:=]\s*[^\s,]+/gi,
      '$1=[hidden]',
    )
    .trim()
    .slice(0, 1000)
}

module.exports = {
  verifyIpChange,
}
