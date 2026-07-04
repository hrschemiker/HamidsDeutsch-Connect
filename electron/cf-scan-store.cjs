const path = require('node:path')
const fs = require('node:fs/promises')

const CF_CIDRS = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15',
  '104.16.0.0/13', '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
]

function getDir(userDataPath) {
  return path.join(userDataPath, 'HamidsDeutsch-Connect')
}

// ── Settings ────────────────────────────────────────────────────────────────

async function getCfAutoScanSettings(userDataPath) {
  try {
    const raw = await fs.readFile(path.join(getDir(userDataPath), 'cf-scan-settings.json'), 'utf8')
    const data = JSON.parse(raw)
    return {
      enabled: data.enabled !== false,
      intervalHours: typeof data.intervalHours === 'number' ? data.intervalHours : 0,
    }
  } catch {
    return { enabled: true, intervalHours: 0 }
  }
}

async function setCfAutoScanSettings(userDataPath, settings) {
  const dir = getDir(userDataPath)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    path.join(dir, 'cf-scan-settings.json'),
    JSON.stringify({
      enabled: settings.enabled !== false,
      intervalHours: typeof settings.intervalHours === 'number' ? settings.intervalHours : 0,
    }, null, 2),
    'utf8',
  )
}

// ── Cache ────────────────────────────────────────────────────────────────────

async function getCfScanCache(userDataPath) {
  try {
    const raw = await fs.readFile(path.join(getDir(userDataPath), 'cf-scan-cache.json'), 'utf8')
    return JSON.parse(raw) // { bestIp, results, scannedAt }
  } catch {
    return null
  }
}

async function saveCfScanCache(userDataPath, results) {
  const dir = getDir(userDataPath)
  await fs.mkdir(dir, { recursive: true })
  const bestIp = results?.[0]?.ip ?? null
  await fs.writeFile(
    path.join(dir, 'cf-scan-cache.json'),
    JSON.stringify({ bestIp, results: results.slice(0, 10), scannedAt: new Date().toISOString() }, null, 2),
    'utf8',
  )
}

// ── CF host detection ────────────────────────────────────────────────────────

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0
}

function isIpInCidr(ip, cidr) {
  const [base, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr, 10)
  const mask = ~((1 << (32 - prefix)) - 1) >>> 0
  return (ipToInt(ip) & mask) === (ipToInt(base) & mask)
}

function isCloudflareIp(ip) {
  return CF_CIDRS.some((cidr) => isIpInCidr(ip, cidr))
}

function isCloudflareHost(host) {
  if (!host) return false
  const h = host.toLowerCase()
  // Workers / Pages domains
  if (h.endsWith('.workers.dev') || h.endsWith('.pages.dev')) return true
  // Raw CF IPs
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return isCloudflareIp(h)
  return false
}

module.exports = {
  getCfAutoScanSettings,
  setCfAutoScanSettings,
  getCfScanCache,
  saveCfScanCache,
  isCloudflareHost,
  isCloudflareIp,
}
