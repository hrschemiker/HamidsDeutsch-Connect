const {
  net,
} = require('electron')

const path =
  require('node:path')

const fs =
  require('node:fs/promises')

const {
  execFile,
} = require('node:child_process')

const {
  promisify,
} = require('node:util')

const execFileAsync =
  promisify(execFile)

const {
  applyPreferredEndpointToConfig,
} = require('./bpb-cloudflare-optimizer.cjs')

const MAX_SIZE =
  8 * 1024 * 1024

const TIMEOUT_MS =
  25000

async function inspectBpbSource(
  url,
) {
  const content =
    await downloadText(
      url,
    )

  const json =
    tryParseJson(
      content,
    )

  if (
    json &&
    Array.isArray(
      json.outbounds,
    )
  ) {
    return {
      mode:
        'sing-box-json',
      content,
      json,
    }
  }

  return {
    mode:
      'uri-list',
    content,
    json: null,
  }
}

async function importBpbJsonConfig({
  url,
  enginePath,
  userDataPath,
  type,
  localPort = 2081,
  runtimeDirectoryName = 'bpb-runtime',
  preferredEndpoint = null,
}) {
  const inspected =
    await inspectBpbSource(
      url,
    )

  if (
    inspected.mode !==
      'sing-box-json' ||
    !inspected.json
  ) {
    throw new Error(
      'منبع انتخاب‌شده JSON کامل sing-box نیست.',
    )
  }

  const optimizedJson =
    applyPreferredEndpointToConfig(
      inspected.json,
      preferredEndpoint,
    )

  const config =
    sanitizeConfig(
      optimizedJson,
      localPort,
    )

  const directory =
    path.join(
      userDataPath,
      'HamidsDeutsch-Connect',
      runtimeDirectoryName,
    )

  const configPath =
    path.join(
      directory,
      `bpb-${type}-imported.json`,
    )

  await fs.mkdir(
    directory,
    {
      recursive: true,
    },
  )

  const temporary =
    `${configPath}.tmp`

  await fs.writeFile(
    temporary,
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
    temporary,
    configPath,
  )

  const checked =
    await checkConfig({
      enginePath,
      configPath,
    })

  return {
    success: true,
    mode:
      'sing-box-json',
    configPath,
    outboundCount:
      config.outbounds.length,
    stdout:
      checked.stdout,
    error: null,
  }
}

function sanitizeConfig(
  input,
  localPort,
) {
  const config =
    structuredClone(
      input,
    )

  if (
    !Array.isArray(
      config.outbounds,
    ) ||
    config.outbounds.length ===
      0
  ) {
    throw new Error(
      'JSON BPB هیچ Outbound معتبری ندارد.',
    )
  }

  config.log = {
    ...(config.log &&
    typeof config.log ===
      'object'
      ? config.log
      : {}),
    level: 'warn',
    timestamp: true,
  }

  config.inbounds = [
    {
      type: 'mixed',
      tag: 'bpb-mixed-in',
      listen: '127.0.0.1',
      listen_port:
        localPort,
      set_system_proxy: true,
    },
  ]

  if (
    config.experimental &&
    typeof config.experimental ===
      'object'
  ) {
    delete config
      .experimental
      .clash_api

    if (
      Object.keys(
        config.experimental,
      ).length === 0
    ) {
      delete config.experimental
    }
  }

  if (
    config.route &&
    typeof config.route ===
      'object' &&
    Array.isArray(
      config.route.rules,
    )
  ) {
    config.route.rules =
      config.route.rules.map(
        (rule) => {
          if (
            !rule ||
            typeof rule !==
              'object'
          ) {
            return rule
          }

          const next = {
            ...rule,
          }

          delete next.inbound
          delete next.inbound_type

          return next
        },
      )
  }

  return config
}

async function downloadText(
  value,
) {
  const parsed =
    new URL(
      value,
    )

  if (
    ![
      'https:',
      'http:',
    ].includes(
      parsed.protocol,
    )
  ) {
    throw new Error(
      'پروتکل لینک BPB معتبر نیست.',
    )
  }

  const controller =
    new AbortController()

  const timeout =
    setTimeout(
      () => {
        controller.abort()
      },
      TIMEOUT_MS,
    )

  try {
    const response =
      await net.fetch(
        parsed.toString(),
        {
          redirect:
            'follow',
          signal:
            controller.signal,
          headers: {
            Accept:
              'application/json, text/plain, application/octet-stream;q=0.9, */*;q=0.8',
            'User-Agent':
              'HamidsDeutsch-Connect/1.0.0',
          },
        },
      )

    if (!response.ok) {
      throw new Error(
        `سرور BPB با HTTP ${response.status} پاسخ داد.`,
      )
    }

    const buffer =
      Buffer.from(
        await response.arrayBuffer(),
      )

    if (
      buffer.byteLength >
      MAX_SIZE
    ) {
      throw new Error(
        'حجم خروجی BPB بیش از ۸ مگابایت است.',
      )
    }

    const text =
      buffer
        .toString('utf8')
        .replace(
          /^\uFEFF/,
          '',
        )
        .trim()

    if (!text) {
      throw new Error(
        'خروجی BPB خالی است.',
      )
    }

    return text
  } catch (error) {
    if (
      error?.name ===
        'AbortError'
    ) {
      throw new Error(
        'زمان دریافت خروجی BPB بیش از حد مجاز شد.',
      )
    }

    throw error
  } finally {
    clearTimeout(
      timeout,
    )
  }
}

function tryParseJson(
  value,
) {
  try {
    const parsed =
      JSON.parse(
        value,
      )

    return (
      parsed &&
      typeof parsed ===
        'object' &&
      !Array.isArray(parsed)
        ? parsed
        : null
    )
  } catch {
    return null
  }
}

async function checkConfig({
  enginePath,
  configPath,
}) {
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
        timeout: 20000,
        encoding: 'utf8',
        shell: false,
      },
    )

    return {
      stdout:
        `${stdout}\n${stderr}`
          .trim(),
    }
  } catch (error) {
    const details =
      String(
        error?.stderr ??
        error?.stdout ??
        error?.message ??
        '',
      ).trim()

    throw new Error(
      details ||
      'اعتبارسنجی JSON واردشده BPB ناموفق بود.',
    )
  }
}

module.exports = {
  inspectBpbSource,
  importBpbJsonConfig,
}
