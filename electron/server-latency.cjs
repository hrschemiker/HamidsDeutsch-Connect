const net = require('node:net')
const { performance } = require('node:perf_hooks')

const SINGLE_ATTEMPT_TIMEOUT_MS = 3500
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

function testTcpLatency(server) {
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
        id: server.id,
        reachable: true,
        latencyMs,
        error: null,
      })
    })

    socket.once('timeout', () => {
      finish({
        id: server.id,
        reachable: false,
        latencyMs: null,
        error: 'مهلت اتصال تمام شد.',
      })
    })

    socket.once('error', (error) => {
      finish({
        id: server.id,
        reachable: false,
        latencyMs: null,
        error:
          typeof error?.code === 'string'
            ? error.code
            : 'اتصال TCP ناموفق بود.',
      })
    })

    try {
      socket.connect({
        host: server.host,
        port: server.port,
        autoSelectFamily: true,
      })
    } catch (error) {
      finish({
        id: server.id,
        reachable: false,
        latencyMs: null,
        error:
          error instanceof Error
            ? error.message
            : 'شروع تست سرور ناموفق بود.',
      })
    }
  })
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