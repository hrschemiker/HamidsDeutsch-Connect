'use strict'

// Offline IPv4 -> country lookup. Data is a compact big-endian binary bundled in
// resources/geoip/ipv4-country.bin: [uint32 count][ count × (uint32 start, uint32
// end, 2-byte ISO country) ], sorted by start. Public-domain (CC0) ranges from
// the ip-location-db project. No network needed.

const fs = require('node:fs')
const path = require('node:path')
const dns = require('node:dns').promises

let RANGES = null // { starts: Uint32Array, ends: Uint32Array, cc: string[] }

function binPath() {
  // Packaged: resources/geoip/... under process.resourcesPath. Dev: repo resources.
  const packaged = path.join(process.resourcesPath || '', 'geoip', 'ipv4-country.bin')
  if (fs.existsSync(packaged)) return packaged
  return path.join(__dirname, '..', 'resources', 'geoip', 'ipv4-country.bin')
}

function ensureLoaded() {
  if (RANGES) return RANGES
  try {
    const buf = fs.readFileSync(binPath())
    const count = buf.readUInt32BE(0)
    const starts = new Uint32Array(count)
    const ends = new Uint32Array(count)
    const cc = new Array(count)
    let o = 4
    for (let i = 0; i < count; i++) {
      starts[i] = buf.readUInt32BE(o)
      ends[i] = buf.readUInt32BE(o + 4)
      cc[i] = String.fromCharCode(buf[o + 8], buf[o + 9])
      o += 10
    }
    RANGES = { starts, ends, cc }
  } catch {
    RANGES = { starts: new Uint32Array(0), ends: new Uint32Array(0), cc: [] }
  }
  return RANGES
}

function ipv4ToInt(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip)
  if (!m) return null
  const a = +m[1], b = +m[2], c = +m[3], d = +m[4]
  if (a > 255 || b > 255 || c > 255 || d > 255) return null
  return ((a * 256 + b) * 256 + c) * 256 + d
}

/** ISO country code (e.g. "US") for an IPv4 address, or null. */
function countryForIp(ip) {
  const n = ipv4ToInt(ip)
  if (n === null) return null
  const { starts, ends, cc } = ensureLoaded()
  let lo = 0, hi = starts.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (n < starts[mid]) hi = mid - 1
    else if (n > ends[mid]) lo = mid + 1
    else return cc[mid]
  }
  return null
}

/** Resolve a host (IP or domain) to an ISO country code, or null. */
async function countryForHost(host) {
  if (!host) return null
  if (ipv4ToInt(host) !== null) return countryForIp(host)
  // Domain -> resolve to an IPv4, then look up.
  try {
    const addrs = await dns.resolve4(host)
    for (const a of addrs) {
      const c = countryForIp(a)
      if (c) return c
    }
  } catch {
    // ignore resolution errors
  }
  return null
}

/** ISO country code -> regional-indicator flag emoji (e.g. "US" -> 🇺🇸). */
function flagForCountry(cc) {
  if (!cc || cc.length !== 2) return '🏳️'
  const up = cc.toUpperCase()
  if (!/^[A-Z]{2}$/.test(up)) return '🏳️'
  const A = 0x1f1e6
  return String.fromCodePoint(A + (up.charCodeAt(0) - 65), A + (up.charCodeAt(1) - 65))
}

module.exports = {
  countryForIp,
  countryForHost,
  flagForCountry,
}
