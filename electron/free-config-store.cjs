const { app } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')

const DATA_DIR = 'HamidsDeutsch-Connect'
const DATA_FILE = 'free-config-pool.json'
const MAX_POOL_SIZE = 100
const MAX_FAIL_COUNT = 2

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
  return { version: 1, servers: [] }
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
    return { version: 1, servers: parsed.servers.filter(isValidEntry) }
  } catch (err) {
    if (err?.code === 'ENOENT') return createEmpty()
    throw err
  }
}

async function writePool(servers) {
  await ensureDir()
  const sorted = [...servers]
    .sort((a, b) => (a.latencyMs ?? 999999) - (b.latencyMs ?? 999999))
    .slice(0, MAX_POOL_SIZE)

  const tmp = getFilePath() + '.tmp'
  await fs.writeFile(tmp, JSON.stringify({ version: 1, servers: sorted }, null, 2), 'utf8')
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
 * newServers: Array<{ id, uri, name, protocol, host, port, latencyMs, lastTestedAt, addedAt }>
 * Reachable servers reset failCount; existing unreachable entries keep their failCount.
 */
async function mergeServers(newServers) {
  const pool = await readPool()
  const map = new Map(pool.servers.map((s) => [s.id, s]))

  for (const s of newServers) {
    const existing = map.get(s.id)
    map.set(s.id, {
      ...(existing ?? {}),
      ...s,
      failCount: 0,
      lastTestedAt: s.lastTestedAt ?? new Date().toISOString(),
    })
  }

  const merged = [...map.values()].filter((s) => (s.failCount ?? 0) < MAX_FAIL_COUNT)
  return writePool(merged)
}

/**
 * Called on app launch to increment failCount for all servers that are not in the
 * current "known good" set. If failCount reaches MAX_FAIL_COUNT they are dropped.
 */
async function markStartupFailure(successfulIds = []) {
  const pool = await readPool()
  const successSet = new Set(successfulIds)
  const updated = pool.servers
    .map((s) => ({
      ...s,
      failCount: successSet.has(s.id) ? 0 : (s.failCount ?? 0) + 1,
    }))
    .filter((s) => s.failCount < MAX_FAIL_COUNT)
  return writePool(updated)
}

/** Reset failCount for a server that successfully connected. */
async function markSuccess(id) {
  const pool = await readPool()
  const updated = pool.servers.map((s) =>
    s.id === id ? { ...s, failCount: 0 } : s,
  )
  return writePool(updated)
}

/** Returns the sorted pool (best latency first). */
async function getPool() {
  const pool = await readPool()
  return pool.servers
}

module.exports = {
  mergeServers,
  markStartupFailure,
  markSuccess,
  getPool,
}
