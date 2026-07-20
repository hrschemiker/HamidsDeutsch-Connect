'use strict'

const { app } = require('electron')
const path = require('node:path')
const crypto = require('node:crypto')
const fs = require('node:fs/promises')

const DATA_DIR = 'HamidsDeutsch-Connect'
const DATA_FILE = 'free-config-pool.json'
const MAX_POOL_SIZE = 1000

function getFilePath() {
  return path.join(app.getPath('userData'), DATA_DIR, DATA_FILE)
}

// Entry shape:
// { id: '482913', uri, host, port, protocol, security, country: 'NL', flag: '🇳🇱',
//   source: 'telegram', working: true|false|null, latencyMs, addedAt, lastTestedAt }
function isValidEntry(s) {
  return s && typeof s.id === 'string' && typeof s.uri === 'string'
}

function createEmpty() {
  return { version: 3, servers: [], channels: {}, meta: { lastRefreshedAt: null } }
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
      version: 3,
      servers: parsed.servers.filter(isValidEntry),
      channels: parsed.channels && typeof parsed.channels === 'object' ? parsed.channels : {},
      meta: parsed.meta ?? { lastRefreshedAt: null },
    }
  } catch (err) {
    if (err?.code === 'ENOENT') return createEmpty()
    throw err
  }
}

async function writePool(pool) {
  await ensureDir()
  const servers = [...pool.servers].slice(0, MAX_POOL_SIZE)
  const tmp = getFilePath() + '.tmp'
  const data = { version: 3, servers, channels: pool.channels ?? {}, meta: pool.meta ?? { lastRefreshedAt: null } }
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  try {
    await fs.rename(tmp, getFilePath())
  } catch (err) {
    if (err?.code === 'EEXIST' || err?.code === 'EPERM') {
      await fs.rm(getFilePath(), { force: true })
      await fs.rename(tmp, getFilePath())
    } else throw err
  }
  return servers
}

/** Random 6-digit id, unique within the pool. */
function makeId(existing) {
  let id
  do { id = String(crypto.randomInt(100000, 1000000)) } while (existing.has(id))
  existing.add(id)
  return id
}

/**
 * Add newly-found configs, de-duplicated by uri. `entries` items:
 * { uri, host, port, protocol, security, country, flag, source }.
 * New ones get a random 6-digit id and working:null (untested). Returns count added.
 */
async function addConfigs(entries) {
  const pool = await readPool()
  const byUri = new Map(pool.servers.map((s) => [s.uri, s]))
  const ids = new Set(pool.servers.map((s) => s.id))
  const now = new Date().toISOString()
  let added = 0
  for (const e of entries) {
    if (!e || !e.uri || byUri.has(e.uri)) continue
    const entry = {
      id: makeId(ids),
      uri: e.uri,
      host: e.host ?? null,
      port: e.port ?? null,
      protocol: e.protocol ?? null,
      security: e.security ?? null,
      country: e.country ?? null,
      flag: e.flag ?? null,
      source: e.source ?? 'telegram',
      working: null,
      latencyMs: null,
      addedAt: now,
      lastTestedAt: null,
    }
    pool.servers.push(entry)
    byUri.set(entry.uri, entry)
    added++
  }
  pool.meta = { ...pool.meta, lastRefreshedAt: now }
  await writePool(pool)
  return added
}

/** Mark one config's test result. working=false entries are candidates for prune. */
async function setTestResult(id, working, latencyMs) {
  const pool = await readPool()
  const now = new Date().toISOString()
  for (const s of pool.servers) {
    if (s.id === id) {
      s.working = Boolean(working)
      s.latencyMs = typeof latencyMs === 'number' ? latencyMs : s.latencyMs
      s.lastTestedAt = now
      break
    }
  }
  await writePool(pool)
}

/** Remove every config whose last test failed (working === false). */
async function pruneDead() {
  const pool = await readPool()
  const before = pool.servers.length
  pool.servers = pool.servers.filter((s) => s.working !== false)
  await writePool(pool)
  return before - pool.servers.length
}

/** Remove one config by id. */
async function removeServer(id) {
  const pool = await readPool()
  pool.servers = pool.servers.filter((s) => s.id !== id)
  return writePool(pool)
}

/** Per-channel newest-post-id cursor (so we never re-import old posts). */
async function getChannelId(channel) {
  const pool = await readPool()
  return pool.channels?.[channel] ?? 0
}

async function setChannelId(channel, id) {
  const pool = await readPool()
  const cur = pool.channels?.[channel] ?? 0
  if (typeof id === 'number' && id > cur) {
    pool.channels = { ...pool.channels, [channel]: id }
    await writePool(pool)
  }
}

/** All configs (working first, then untested; dead excluded from display). */
async function getPool() {
  const pool = await readPool()
  const rank = (s) => (s.working === true ? 0 : s.working === null ? 1 : 2)
  return [...pool.servers]
    .filter((s) => s.working !== false)
    .sort((a, b) => rank(a) - rank(b) || (a.latencyMs ?? 9e9) - (b.latencyMs ?? 9e9))
}

/** Everything (incl. untested) for the test runner. */
async function getAllPool() {
  const pool = await readPool()
  return pool.servers
}

async function getPoolMeta() {
  const pool = await readPool()
  const working = pool.servers.filter((s) => s.working === true).length
  const untested = pool.servers.filter((s) => s.working === null).length
  return {
    total: pool.servers.filter((s) => s.working !== false).length,
    working,
    untested,
    lastRefreshedAt: pool.meta?.lastRefreshedAt ?? null,
    channels: pool.channels ?? {},
  }
}

module.exports = {
  addConfigs,
  setTestResult,
  pruneDead,
  removeServer,
  getChannelId,
  setChannelId,
  getPool,
  getAllPool,
  getPoolMeta,
}
