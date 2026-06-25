const net = require('node:net')
const tls = require('node:tls')
const https = require('node:https')
const path = require('node:path')
const fs = require('node:fs/promises')
const crypto = require('node:crypto')

const OFFICIAL_IPV4_URL =
  'https://www.cloudflare.com/ips-v4'

const OFFICIAL_IPV6_URL =
  'https://www.cloudflare.com/ips-v6'

const TLS_PORTS = [
  443,
  2053,
  2083,
  2087,
  2096,
  8443,
]

const TCP_TIMEOUT_MS = 2200
const SPEED_TIMEOUT_MS = 8000
const MAX_CONCURRENCY = 28
const DEFAULT_SAMPLE_COUNT = 220
const SPEED_TEST_COUNT = 8
const RESULT_LIMIT = 30

let activeScan = false
let activeProgress = {
  running: false,
  phase: 'idle',
  tested: 0,
  total: 0,
  reachable: 0,
  message: '',
}

let progressListener = null

function setOptimizerProgressListener(
  listener,
) {
  progressListener =
    typeof listener === 'function'
      ? listener
      : null
}

function emitProgress() {
  if (!progressListener) {
    return
  }

  try {
    progressListener({
      ...activeProgress,
      at:
        new Date().toISOString(),
    })
  } catch {
    // UI delivery must never interrupt the scan.
  }
}

function getOptimizerStatePath(
  userDataPath,
) {
  return path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    'bpb',
    'cloudflare-optimizer.json',
  )
}

async function getOptimizerState({
  userDataPath,
}) {
  try {
    const raw =
      await fs.readFile(
        getOptimizerStatePath(
          userDataPath,
        ),
        'utf8',
      )

    const parsed =
      JSON.parse(raw)

    return normalizeState(parsed)
  } catch {
    return createEmptyState()
  }
}

async function saveOptimizerState({
  userDataPath,
  state,
}) {
  const filePath =
    getOptimizerStatePath(
      userDataPath,
    )

  await fs.mkdir(
    path.dirname(filePath),
    {
      recursive: true,
    },
  )

  const normalized =
    normalizeState(state)

  const temporaryPath =
    `${filePath}.tmp`

  await fs.writeFile(
    temporaryPath,
    JSON.stringify(
      normalized,
      null,
      2,
    ),
    'utf8',
  )

  await fs.rm(
    filePath,
    {
      force: true,
    },
  )

  await fs.rename(
    temporaryPath,
    filePath,
  )

  return normalized
}

function createEmptyState() {
  return {
    enabled: true,
    scannedAt: null,
    panelHost: null,
    bestEndpoint: null,
    results: [],
    source: 'cloudflare-official-ranges',
    error: null,
  }
}

function normalizeState(
  input,
) {
  const best =
    normalizeResult(
      input?.bestEndpoint,
    )

  const results =
    Array.isArray(
      input?.results,
    )
      ? input.results
          .map(
            normalizeResult,
          )
          .filter(Boolean)
          .slice(
            0,
            RESULT_LIMIT,
          )
      : []

  return {
    enabled:
      input?.enabled !== false,
    scannedAt:
      typeof input?.scannedAt ===
        'string'
        ? input.scannedAt
        : null,
    panelHost:
      typeof input?.panelHost ===
        'string'
        ? input.panelHost
        : null,
    bestEndpoint:
      best,
    results,
    source:
      'cloudflare-official-ranges',
    error:
      typeof input?.error ===
        'string'
        ? input.error
        : null,
  }
}

function normalizeResult(
  input,
) {
  if (
    !input ||
    typeof input.ip !==
      'string' ||
    !Number.isInteger(
      input.port,
    )
  ) {
    return null
  }

  return {
    id:
      typeof input.id ===
        'string'
        ? input.id
        : `${input.ip}:${input.port}`,
    ip:
      input.ip,
    family:
      input.family === 6
        ? 6
        : 4,
    port:
      input.port,
    latencyMs:
      Number.isFinite(
        input.latencyMs,
      )
        ? Math.round(
            input.latencyMs,
          )
        : null,
    downloadMbps:
      Number.isFinite(
        input.downloadMbps,
      )
        ? Math.round(
            input.downloadMbps *
              100,
          ) / 100
        : null,
    score:
      Number.isFinite(
        input.score,
      )
        ? Math.round(
            input.score *
              100,
          ) / 100
        : null,
    colo:
      typeof input.colo ===
        'string'
        ? input.colo
        : null,
    testedAt:
      typeof input.testedAt ===
        'string'
        ? input.testedAt
        : new Date().toISOString(),
  }
}

async function scanCloudflareEndpoints({
  userDataPath,
  panelUrl,
  sampleCount =
    DEFAULT_SAMPLE_COUNT,
}) {
  if (activeScan) {
    throw new Error(
      'اسکن Cloudflare از قبل در حال اجراست.',
    )
  }

  const panelHost =
    getPanelHost(
      panelUrl,
    )

  activeScan = true
  activeProgress = {
    running: true,
    phase: 'ranges',
    tested: 0,
    total: 0,
    reachable: 0,
    message:
      'در حال دریافت رنج‌های رسمی Cloudflare...',
  }

  emitProgress()

  try {
    const [
      ipv4Text,
      ipv6Text,
    ] =
      await Promise.all([
        downloadText(
          OFFICIAL_IPV4_URL,
        ),
        downloadText(
          OFFICIAL_IPV6_URL,
        ),
      ])

    const candidates =
      buildCandidates({
        ipv4Ranges:
          parseLines(
            ipv4Text,
          ),
        ipv6Ranges:
          parseLines(
            ipv6Text,
          ),
        sampleCount:
          clamp(
            Number(
              sampleCount,
            ) ||
              DEFAULT_SAMPLE_COUNT,
            60,
            900,
          ),
      })

    activeProgress = {
      running: true,
      phase: 'latency',
      tested: 0,
      total:
        candidates.length *
        TLS_PORTS.length,
      reachable: 0,
      message:
        'در حال تست تأخیر و TLS...',
    }

    emitProgress()

    const latencyResults =
      await mapLimit(
        expandCandidates(
          candidates,
        ),
        MAX_CONCURRENCY,
        async (
          candidate,
        ) => {
          const result =
            await testTlsLatency({
              ip:
                candidate.ip,
              family:
                candidate.family,
              port:
                candidate.port,
              servername:
                panelHost,
            })

          activeProgress.tested += 1

          if (result) {
            activeProgress.reachable += 1
          }

          if (
            activeProgress.tested %
              10 ===
            0
          ) {
            emitProgress()
          }

          return result
        },
      )

    const reachable =
      latencyResults
        .filter(Boolean)
        .sort(
          (
            left,
            right,
          ) =>
            left.latencyMs -
            right.latencyMs,
        )
        .slice(
          0,
          28,
        )

    if (
      reachable.length ===
        0
    ) {
      throw new Error(
        'هیچ IP سالم Cloudflare در این اسکن پیدا نشد.',
      )
    }

    activeProgress = {
      running: true,
      phase: 'speed',
      tested: 0,
      total:
        Math.min(
          SPEED_TEST_COUNT,
          reachable.length,
        ),
      reachable:
        reachable.length,
      message:
        'در حال سنجش سرعت دانلود بهترین IPها...',
    }

    emitProgress()

    const speedCandidates =
      reachable.slice(
        0,
        SPEED_TEST_COUNT,
      )

    const speedResults =
      await mapLimit(
        speedCandidates,
        3,
        async (
          candidate,
        ) => {
          const speed =
            await testDownloadSpeed({
              ip:
                candidate.ip,
              family:
                candidate.family,
              port:
                candidate.port,
            })

          activeProgress.tested += 1
          emitProgress()

          return {
            ...candidate,
            downloadMbps:
              speed.downloadMbps,
            colo:
              speed.colo,
          }
        },
      )

    const speedMap =
      new Map(
        speedResults.map(
          (item) => [
            item.id,
            item,
          ],
        ),
      )

    const finalResults =
      reachable
        .map(
          (item) => {
            const enriched =
              speedMap.get(
                item.id,
              )

            const downloadMbps =
              enriched
                ?.downloadMbps ??
              null

            const score =
              calculateScore({
                latencyMs:
                  item.latencyMs,
                downloadMbps,
              })

            return {
              ...item,
              downloadMbps,
              colo:
                enriched?.colo ??
                null,
              score,
              testedAt:
                new Date().toISOString(),
            }
          },
        )
        .sort(
          (
            left,
            right,
          ) =>
            right.score -
            left.score,
        )
        .slice(
          0,
          RESULT_LIMIT,
        )

    const state =
      await saveOptimizerState({
        userDataPath,
        state: {
          enabled: true,
          scannedAt:
            new Date().toISOString(),
          panelHost,
          bestEndpoint:
            finalResults[0] ??
            null,
          results:
            finalResults,
          source:
            'cloudflare-official-ranges',
          error: null,
        },
      })

    activeProgress = {
      running: false,
      phase: 'done',
      tested:
        finalResults.length,
      total:
        finalResults.length,
      reachable:
        finalResults.length,
      message:
        'بهترین IP Cloudflare پیدا و ذخیره شد.',
    }

    emitProgress()

    return {
      success: true,
      state,
      error: null,
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'اسکن Cloudflare ناموفق بود.'

    const previous =
      await getOptimizerState({
        userDataPath,
      })

    const state =
      await saveOptimizerState({
        userDataPath,
        state: {
          ...previous,
          error:
            message,
        },
      })

    activeProgress = {
      running: false,
      phase: 'error',
      tested:
        activeProgress.tested,
      total:
        activeProgress.total,
      reachable:
        activeProgress.reachable,
      message,
    }

    emitProgress()

    return {
      success: false,
      state,
      error:
        message,
    }
  } finally {
    activeScan = false
  }
}

async function setOptimizerEnabled({
  userDataPath,
  enabled,
}) {
  const current =
    await getOptimizerState({
      userDataPath,
    })

  return saveOptimizerState({
    userDataPath,
    state: {
      ...current,
      enabled:
        enabled === true,
    },
  })
}

async function clearOptimizerState({
  userDataPath,
}) {
  await fs.rm(
    getOptimizerStatePath(
      userDataPath,
    ),
    {
      force: true,
    },
  )

  return createEmptyState()
}

async function getPreferredEndpoint({
  userDataPath,
}) {
  const state =
    await getOptimizerState({
      userDataPath,
    })

  if (
    !state.enabled ||
    !state.bestEndpoint
  ) {
    return null
  }

  return state.bestEndpoint
}

function applyPreferredEndpointToUri(
  uri,
  endpoint,
) {
  if (
    !endpoint ||
    typeof uri !==
      'string'
  ) {
    return uri
  }

  if (
    uri.startsWith(
      'vless://',
    ) ||
    uri.startsWith(
      'trojan://',
    )
  ) {
    const parsed =
      new URL(uri)

    parsed.hostname =
      endpoint.ip

    parsed.port =
      String(
        endpoint.port,
      )

    return parsed.toString()
  }

  if (
    uri.startsWith(
      'vmess://',
    )
  ) {
    try {
      const payload =
        uri.slice(
          'vmess://'.length,
        )

      const padded =
        payload +
        '='.repeat(
          (
            4 -
            (
              payload.length %
              4
            )
          ) %
            4,
        )

      const decoded =
        JSON.parse(
          Buffer
            .from(
              padded
                .replace(
                  /-/g,
                  '+',
                )
                .replace(
                  /_/g,
                  '/',
                ),
              'base64',
            )
            .toString(
              'utf8',
            ),
        )

      decoded.add =
        endpoint.ip

      decoded.port =
        String(
          endpoint.port,
        )

      return (
        'vmess://' +
        Buffer
          .from(
            JSON.stringify(
              decoded,
            ),
            'utf8',
          )
          .toString(
            'base64',
          )
      )
    } catch {
      return uri
    }
  }

  return uri
}

function applyPreferredEndpointToConfig(
  input,
  endpoint,
) {
  if (
    !endpoint ||
    !input ||
    typeof input !==
      'object'
  ) {
    return input
  }

  const config =
    structuredClone(
      input,
    )

  if (
    !Array.isArray(
      config.outbounds,
    )
  ) {
    return config
  }

  config.outbounds =
    config.outbounds.map(
      (outbound) => {
        if (
          !outbound ||
          typeof outbound !==
            'object' ||
          typeof outbound.server !==
            'string'
        ) {
          return outbound
        }

        if (
          ![
            'vless',
            'trojan',
            'vmess',
          ].includes(
            outbound.type,
          )
        ) {
          return outbound
        }

        const next = {
          ...outbound,
          server:
            endpoint.ip,
          server_port:
            endpoint.port,
        }

        return next
      },
    )

  return config
}

function getPanelHost(
  value,
) {
  const url =
    new URL(
      String(value ?? ''),
    )

  if (
    url.protocol !==
      'https:'
  ) {
    throw new Error(
      'آدرس پنل BPB معتبر نیست.',
    )
  }

  return url.hostname
}

function parseLines(
  text,
) {
  return String(text)
    .split(
      /\r?\n/,
    )
    .map(
      (line) =>
        line.trim(),
    )
    .filter(Boolean)
}

function buildCandidates({
  ipv4Ranges,
  ipv6Ranges,
  sampleCount,
}) {
  const ipv4Count =
    Math.max(
      40,
      Math.floor(
        sampleCount *
          0.85,
      ),
    )

  const ipv6Count =
    Math.max(
      0,
      sampleCount -
        ipv4Count,
    )

  return [
    ...sampleIpv4Ranges(
      ipv4Ranges,
      ipv4Count,
    ),
    ...sampleIpv6Ranges(
      ipv6Ranges,
      ipv6Count,
    ),
  ]
}

function sampleIpv4Ranges(
  ranges,
  count,
) {
  const result = []

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const cidr =
      ranges[
        index %
        ranges.length
      ]

    const sample =
      sampleIpv4FromCidr(
        cidr,
        index,
      )

    if (sample) {
      result.push({
        ip: sample,
        family: 4,
      })
    }
  }

  return deduplicateCandidates(
    result,
  )
}

function sampleIpv6Ranges(
  ranges,
  count,
) {
  const result = []

  for (
    let index = 0;
    index < count;
    index += 1
  ) {
    const cidr =
      ranges[
        index %
        ranges.length
      ]

    const sample =
      sampleIpv6FromCidr(
        cidr,
        index,
      )

    if (sample) {
      result.push({
        ip: sample,
        family: 6,
      })
    }
  }

  return deduplicateCandidates(
    result,
  )
}

function sampleIpv4FromCidr(
  cidr,
  seed,
) {
  const [
    address,
    prefixText,
  ] =
    String(cidr)
      .split('/')

  const prefix =
    Number(
      prefixText,
    )

  if (
    !net.isIPv4(
      address,
    ) ||
    !Number.isInteger(
      prefix,
    ) ||
    prefix < 0 ||
    prefix > 32
  ) {
    return null
  }

  const base =
    ipv4ToInt(
      address,
    )

  const hostBits =
    32 - prefix

  const hostCount =
    hostBits === 32
      ? 0xffffffff
      : (
          2 ** hostBits
        )

  const offset =
    hostCount <= 2
      ? 0
      : (
          deterministicNumber(
            `${cidr}:${seed}`,
          ) %
          (
            hostCount - 2
          )
        ) + 1

  const mask =
    prefix === 0
      ? 0
      : (
          0xffffffff <<
          hostBits
        ) >>> 0

  const value =
    (
      base &
      mask
    ) +
    offset

  return intToIpv4(
    value >>> 0,
  )
}

function sampleIpv6FromCidr(
  cidr,
  seed,
) {
  const [
    address,
    prefixText,
  ] =
    String(cidr)
      .split('/')

  const prefix =
    Number(
      prefixText,
    )

  if (
    !net.isIPv6(
      address,
    ) ||
    !Number.isInteger(
      prefix,
    ) ||
    prefix < 0 ||
    prefix > 128
  ) {
    return null
  }

  try {
    const base =
      ipv6ToBigInt(
        address,
      )

    const hostBits =
      128 - prefix

    const mask =
      hostBits === 128
        ? 0n
        : (
            (
              (1n << 128n) -
              1n
            ) ^
            (
              (1n <<
                BigInt(
                  hostBits,
                )) -
              1n
            )
          )

    const random =
      BigInt(
        deterministicNumber(
          `${cidr}:${seed}`,
        ),
      )

    const offsetMask =
      hostBits === 0
        ? 0n
        : (
            (1n <<
              BigInt(
                Math.min(
                  hostBits,
                  31,
                ),
              )) -
            1n
          )

    const value =
      (
        base &
        mask
      ) |
      (
        random &
        offsetMask
      )

    return bigIntToIpv6(
      value,
    )
  } catch {
    return null
  }
}

function ipv4ToInt(
  address,
) {
  return address
    .split('.')
    .reduce(
      (
        total,
        part,
      ) =>
        (
          (
            total << 8
          ) +
          Number(part)
        ) >>> 0,
      0,
    )
}

function intToIpv4(
  value,
) {
  return [
    (
      value >>> 24
    ) &
      255,
    (
      value >>> 16
    ) &
      255,
    (
      value >>> 8
    ) &
      255,
    value & 255,
  ].join('.')
}

function ipv6ToBigInt(
  address,
) {
  const [
    left,
    right,
  ] =
    address.split('::')

  const leftParts =
    left
      ? left.split(':')
      : []

  const rightParts =
    right
      ? right.split(':')
      : []

  const missing =
    8 -
    leftParts.length -
    rightParts.length

  const parts = [
    ...leftParts,
    ...Array(
      Math.max(
        0,
        missing,
      ),
    ).fill('0'),
    ...rightParts,
  ]

  return parts.reduce(
    (
      total,
      part,
    ) =>
      (
        total << 16n
      ) +
      BigInt(
        parseInt(
          part || '0',
          16,
        ),
      ),
    0n,
  )
}

function bigIntToIpv6(
  value,
) {
  const parts = []

  for (
    let index = 0;
    index < 8;
    index += 1
  ) {
    const shift =
      BigInt(
        (
          7 - index
        ) *
          16,
      )

    parts.push(
      Number(
        (
          value >>
          shift
        ) &
          0xffffn,
      ).toString(16),
    )
  }

  return parts.join(':')
}

function deterministicNumber(
  value,
) {
  const digest =
    crypto
      .createHash(
        'sha256',
      )
      .update(
        value,
      )
      .digest()

  return digest.readUInt32BE(
    0,
  )
}

function deduplicateCandidates(
  candidates,
) {
  const seen =
    new Set()

  return candidates.filter(
    (candidate) => {
      const key =
        `${candidate.family}:${candidate.ip}`

      if (seen.has(key)) {
        return false
      }

      seen.add(key)
      return true
    },
  )
}

function expandCandidates(
  candidates,
) {
  return candidates.flatMap(
    (candidate) =>
      TLS_PORTS.map(
        (port) => ({
          ...candidate,
          port,
        }),
      ),
  )
}

async function testTlsLatency({
  ip,
  family,
  port,
  servername,
}) {
  return new Promise(
    (resolve) => {
      const startedAt =
        Date.now()

      const socket =
        tls.connect({
          host: ip,
          port,
          family,
          servername,
          rejectUnauthorized:
            false,
          ALPNProtocols: [
            'http/1.1',
          ],
          timeout:
            TCP_TIMEOUT_MS,
        })

      const finish =
        (value) => {
          socket.destroy()
          resolve(value)
        }

      socket.once(
        'secureConnect',
        () => {
          finish({
            id:
              `${ip}:${port}`,
            ip,
            family,
            port,
            latencyMs:
              Date.now() -
              startedAt,
          })
        },
      )

      socket.once(
        'timeout',
        () => {
          finish(null)
        },
      )

      socket.once(
        'error',
        () => {
          finish(null)
        },
      )
    },
  )
}

async function testDownloadSpeed({
  ip,
  family,
  port,
}) {
  return new Promise(
    (resolve) => {
      const startedAt =
        Date.now()

      let bytes = 0
      let colo = null
      let finished = false

      const finish =
        () => {
          if (finished) {
            return
          }

          finished = true

          const durationSeconds =
            Math.max(
              0.001,
              (
                Date.now() -
                startedAt
              ) /
                1000,
            )

          resolve({
            downloadMbps:
              (
                bytes *
                8
              ) /
              1_000_000 /
              durationSeconds,
            colo,
          })
        }

      const request =
        https.request(
          {
            host: ip,
            port,
            family,
            servername:
              'speed.cloudflare.com',
            method: 'GET',
            path:
              '/__down?bytes=3000000',
            headers: {
              Host:
                'speed.cloudflare.com',
              Connection:
                'close',
              'User-Agent':
                'HamidsDeutsch-Connect',
            },
            rejectUnauthorized:
              false,
            timeout:
              SPEED_TIMEOUT_MS,
          },
          (response) => {
            const ray =
              response.headers[
                'cf-ray'
              ]

            if (
              typeof ray ===
                'string' &&
              ray.includes('-')
            ) {
              colo =
                ray
                  .split('-')
                  .pop() ??
                null
            }

            response.on(
              'data',
              (chunk) => {
                bytes +=
                  chunk.length
              },
            )

            response.on(
              'end',
              finish,
            )

            response.on(
              'error',
              finish,
            )
          },
        )

      request.on(
        'timeout',
        () => {
          request.destroy()
          finish()
        },
      )

      request.on(
        'error',
        finish,
      )

      request.end()
    },
  )
}

function calculateScore({
  latencyMs,
  downloadMbps,
}) {
  const latencyScore =
    Math.max(
      0,
      1000 -
      latencyMs *
        3,
    )

  const speedScore =
    Math.min(
      1000,
      (
        downloadMbps ??
        0
      ) *
        18,
    )

  return (
    latencyScore *
      0.62 +
    speedScore *
      0.38
  )
}

async function downloadText(
  url,
) {
  return new Promise(
    (resolve, reject) => {
      const request =
        https.get(
          url,
          {
            headers: {
              'User-Agent':
                'HamidsDeutsch-Connect',
            },
          },
          (response) => {
            if (
              response.statusCode !==
                200
            ) {
              response.resume()

              reject(
                new Error(
                  `دریافت رنج Cloudflare با HTTP ${response.statusCode} ناموفق بود.`,
                ),
              )
              return
            }

            const chunks = []

            response.on(
              'data',
              (chunk) => {
                chunks.push(chunk)
              },
            )

            response.on(
              'end',
              () => {
                resolve(
                  Buffer.concat(
                    chunks,
                  ).toString(
                    'utf8',
                  ),
                )
              },
            )

            response.on(
              'error',
              reject,
            )
          },
        )

      request.setTimeout(
        15000,
        () => {
          request.destroy(
            new Error(
              'مهلت دریافت رنج‌های Cloudflare تمام شد.',
            ),
          )
        },
      )

      request.on(
        'error',
        reject,
      )
    },
  )
}

async function mapLimit(
  items,
  limit,
  worker,
) {
  const results =
    new Array(
      items.length,
    )

  let cursor = 0

  async function run() {
    while (true) {
      const index =
        cursor

      cursor += 1

      if (
        index >=
        items.length
      ) {
        return
      }

      results[index] =
        await worker(
          items[index],
          index,
        )
    }
  }

  await Promise.all(
    Array.from(
      {
        length:
          Math.min(
            limit,
            items.length,
          ),
      },
      run,
    ),
  )

  return results
}

function clamp(
  value,
  minimum,
  maximum,
) {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      value,
    ),
  )
}

module.exports = {
  scanCloudflareEndpoints,
  getOptimizerState,
  setOptimizerEnabled,
  clearOptimizerState,
  getPreferredEndpoint,
  applyPreferredEndpointToUri,
  applyPreferredEndpointToConfig,
  setOptimizerProgressListener,
}
