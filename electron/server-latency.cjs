const net = require('node:net')
const dns = require('node:dns').promises
const { performance } = require('node:perf_hooks')

const SINGLE_ATTEMPT_TIMEOUT_MS = 2200
const ATTEMPT_COUNT = 3
const MAX_CONCURRENT_TESTS = 12
const MAX_SERVERS_PER_REQUEST = 300

function validateServer(server) {
  if (
    !server ||
    typeof server !== 'object'
  ) {
    return false
  }

  if (
    typeof server.id !== 'string' ||
    !server.id.trim()
  ) {
    return false
  }

  if (
    typeof server.host !== 'string' ||
    !server.host.trim()
  ) {
    return false
  }

  if (
    !Number.isInteger(server.port) ||
    server.port < 1 ||
    server.port > 65535
  ) {
    return false
  }

  return true
}

async function resolveTargets(host) {
  if (net.isIP(host)) return [host]
  try {
    const records = await dns.resolve4(host)
    if (records.length) return [...new Set(records)].slice(0, 2)
  } catch {}
  return [host]
}

function testTcpAttempt(server, host) {
  return new Promise((resolve) => {
    if (!validateServer(server)) {
      resolve({
        id:
          typeof server?.id === 'string'
            ? server.id
            : 'invalid-server',
        reachable: false,
        latencyMs: null,
        error: 'اطلاعات آدرس یا پورت سرور ناقص است.',
      })

      return
    }

    const startedAt = performance.now()
    const socket = new net.Socket()

    let completed = false

    function finish(result) {
      if (completed) {
        return
      }

      completed = true
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(
      SINGLE_ATTEMPT_TIMEOUT_MS,
    )

    socket.once('connect', () => {
      const latencyMs = Math.max(
        1,
        Math.round(
          performance.now() - startedAt,
        ),
      )

      finish({
        latencyMs,
      })
    })

    socket.once('timeout', () => {
      finish({
        latencyMs: null,
        error: 'مهلت اتصال تمام شد.',
      })
    })

    socket.once('error', (error) => {
      finish({
        latencyMs: null,
        error:
          typeof error?.code === 'string'
            ? error.code
            : 'اتصال TCP ناموفق بود.',
      })
    })

    try {
      socket.connect({
        host,
        port: server.port,
        family: net.isIP(host) || undefined,
      })
    } catch (error) {
      finish({
        latencyMs: null,
        error:
          error instanceof Error
            ? error.message
            : 'شروع تست سرور ناموفق بود.',
      })
    }
  })
}

async function testTcpLatency(server) {
  if (!validateServer(server)) {
    return { id: typeof server?.id === 'string' ? server.id : 'invalid-server', reachable: false, latencyMs: null, error: 'اطلاعات آدرس یا پورت سرور ناقص است.' }
  }
  const targets = await resolveTargets(server.host)
  const samples = []
  let lastError = null
  for (let index = 0; index < ATTEMPT_COUNT; index += 1) {
    // Keep all samples on the same resolved endpoint. Rotating CDN addresses
    // measures different servers and can inflate the median dramatically.
    const result = await testTcpAttempt(server, targets[0])
    if (typeof result.latencyMs === 'number') samples.push(result.latencyMs)
    else lastError = result.error
  }
  if (!samples.length) return { id: server.id, reachable: false, latencyMs: null, error: lastError || 'اتصال TCP ناموفق بود.' }
  samples.sort((a, b) => a - b)
  // Median rejects one-off scheduler/DNS/network spikes and matches what users
  // perceive more closely than a single cold connection.
  const latencyMs = samples[Math.floor(samples.length / 2)]
  return { id: server.id, reachable: true, latencyMs, samples, error: null }
}

async function testServerBatch(
  servers,
) {
  if (!Array.isArray(servers)) {
    throw new Error(
      'فهرست سرورها معتبر نیست.',
    )
  }

  const safeServers = servers
    .slice(0, MAX_SERVERS_PER_REQUEST)
    .map((server) => ({
      id:
        typeof server?.id === 'string'
          ? server.id.slice(0, 200)
          : '',
      host:
        typeof server?.host === 'string'
          ? server.host
              .trim()
              .slice(0, 253)
          : null,
      port:
        typeof server?.port === 'number'
          ? server.port
          : null,
    }))

  const results = new Array(
    safeServers.length,
  )

  let nextIndex = 0

  async function worker() {
    while (true) {
      const currentIndex = nextIndex
      nextIndex += 1

      if (
        currentIndex >=
        safeServers.length
      ) {
        return
      }

      results[currentIndex] =
        await testTcpLatency(
          safeServers[currentIndex],
        )
    }
  }

  const workerCount = Math.min(
    MAX_CONCURRENT_TESTS,
    Math.max(
      1,
      safeServers.length,
    ),
  )

  await Promise.all(
    Array.from(
      {
        length: workerCount,
      },
      () => worker(),
    ),
  )

  const reachableResults =
    results.filter(
      (result) =>
        result.reachable &&
        typeof result.latencyMs ===
          'number',
    )

  const fastest =
    reachableResults.length > 0
      ? reachableResults.reduce(
          (bestResult, currentResult) =>
            currentResult.latencyMs <
            bestResult.latencyMs
              ? currentResult
              : bestResult,
        )
      : null

  return {
    checkedAt:
      new Date().toISOString(),
    total: results.length,
    reachable:
      reachableResults.length,
    unreachable:
      results.length -
      reachableResults.length,
    fastestServerId:
      fastest?.id ?? null,
    fastestLatencyMs:
      fastest?.latencyMs ?? null,
    results,
  }
}

module.exports = {
  testServerBatch,
}
