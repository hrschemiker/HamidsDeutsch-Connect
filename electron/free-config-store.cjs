const { app } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')

const DATA_DIR = 'HamidsDeutsch-Connect'
const DATA_FILE = 'free-config-pool.json'
const MAX_POOL_SIZE = 400
const MAX_FAIL_COUNT = 3
const PING_THRESHOLD_MS = 400

function getFilePath() {
  return path.join(app.getPath('userData'), DATA_DIR, DATA_FILE)
}

function isValidEntry(s) {
  return (
    s &&
    typeof s.id === 'string' &&
    typeof s.uri === 'string' &&
    typeof s.name === 'string' &&
    typeof s.protocol === 'string'
  )
}

function createEmpty() {
  return { version: 2, servers: [], meta: { lastRefreshedAt: null, sourceCount: 0 } }
}

async function ensureDir() {
  await fs.mkdir(path.dirname(getFilePath()), { recursive: true })
}

async function readPool() {
  await ensureDir()
  try {
    const raw = await fs.readFile(getFilePath(), 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || !Array.isArray(parsed.servers)) return createEmpty()
    return {
      version: 2,
      servers: parsed.servers.filter(isValidEntry),
      meta: parsed.meta ?? { lastRefreshedAt: null, sourceCount: 0 },
    }
  } catch (err) {
    if (err?.code === 'ENOENT') return createEmpty()
    throw err
  }
}

async function writePool(servers, meta) {
  await ensureDir()
  const sorted = [...servers]
    .sort((a, b) => (a.latencyMs ?? 999999) - (b.latencyMs ?? 999999))
    .slice(0, MAX_POOL_SIZE)

  const current = await readPool()
  const newMeta = meta ?? current.meta ?? { lastRefreshedAt: null, sourceCount: 0 }

  const tmp = getFilePath() + '.tmp'
  await fs.writeFile(tmp, JSON.stringify({ version: 2, servers: sorted, meta: newMeta }, null, 2), 'utf8')
  try {
    await fs.rename(tmp, getFilePath())
  } catch (err) {
    if (err?.code === 'EEXIST' || err?.code === 'EPERM') {
      await fs.rm(getFilePath(), { force: true })
      await fs.rename(tmp, getFilePath())
    } else {
      throw err
    }
  }
  return sorted
}

/**
 * Merge newly-tested servers into the persistent pool.
 * - Only keeps servers with latencyMs < PING_THRESHOLD_MS
 * - Evicts worst-latency entries when over MAX_POOL_SIZE
 */
async function mergeServers(newServers) {
  const pool = await readPool()
  const map = new Map(pool.servers.map((s) => [s.id, s]))

  for (const s of newServers) {
    if (typeof s.latencyMs === 'number' && s.latencyMs >= PING_THRESHOLD_MS) continue
    const existing = map.get(s.id)
    map.set(s.id, {
      ...(existing ?? {}),
      ...s,
      failCount: 0,
      lastTestedAt: s.lastTestedAt ?? new Date().toISOString(),
    })
  }

  // Only keep servers with acceptable ping; drop those over threshold
  const merged = [...map.values()].filter(
    (s) =>
      (s.failCount ?? 0) < MAX_FAIL_COUNT &&
      (s.latencyMs == null || s.latencyMs < PING_THRESHOLD_MS),
  )
  return writePool(merged)
}

/**
 * Re-validate stored servers by pinging them.
 * latencyFn: async (inputs: {id, host, port}[]) => {results: {id, reachable, latencyMs}[]}
 * Removes servers that are unreachable or over threshold.
 */
async function revalidatePool(latencyFn) {
  const pool = await readPool()
  if (pool.servers.length === 0) return []

  const inputs = pool.servers
    .filter((s) => s.host && s.port)
    .map((s) => ({ id: s.id, host: s.host, port: s.port }))

  if (inputs.length === 0) return pool.servers

  const result = await latencyFn(inputs)
  const latencyMap = new Map(result.results.map((r) => [r.id, r]))
  const now = new Date().toISOString()

  const updated = pool.servers
    .map((s) => {
      const lr = latencyMap.get(s.id)
      if (!lr) return { ...s, failCount: (s.failCount ?? 0) + 1 }
      if (!lr.reachable || typeof lr.latencyMs !== 'number' || lr.latencyMs >= PING_THRESHOLD_MS) {
        return { ...s, failCount: (s.failCount ?? 0) + 1 }
      }
      return { ...s, latencyMs: lr.latencyMs, failCount: 0, lastTestedAt: now }
    })
    .filter((s) => (s.failCount ?? 0) < MAX_FAIL_COUNT)

  return writePool(updated)
}

/**
 * Update pool metadata (lastRefreshedAt, sourceCount).
 */
async function updatePoolMeta(meta) {
  const pool = await readPool()
  return writePool(pool.servers, { ...pool.meta, ...meta })
}

/** Reset failCount for a server that successfully connected. */
async function markSuccess(id) {
  const pool = await readPool()
  const updated = pool.servers.map((s) =>
    s.id === id ? { ...s, failCount: 0 } : s,
  )
  return writePool(updated)
}

/** Returns top 100 servers by latency for UI display. */
async function getPool() {
  const pool = await readPool()
  return pool.servers.slice(0, 100)
}

/** Returns total pool size and metadata. */
async function getPoolMeta() {
  const pool = await readPool()
  return {
    total: pool.servers.length,
    displaying: Math.min(pool.servers.length, 100),
    lastRefreshedAt: pool.meta?.lastRefreshedAt ?? null,
    sourceCount: pool.meta?.sourceCount ?? 0,
  }
}

/** Returns all stored servers (up to MAX_POOL_SIZE) for reconnect rotation. */
async function getAllPool() {
  const pool = await readPool()
  return pool.servers
}

module.exports = {
  mergeServers,
  revalidatePool,
  updatePoolMeta,
  markSuccess,
  getPool,
  getPoolMeta,
  getAllPool,
  PING_THRESHOLD_MS,
}
