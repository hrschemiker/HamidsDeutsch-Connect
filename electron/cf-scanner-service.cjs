const net = require('node:net')
const { performance } = require('node:perf_hooks')
const { net: electronNet } = require('electron')

// Cloudflare IPv4 CIDR ranges (official list, updated 2025)
const CF_CIDRS = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
]

const SCAN_TIMEOUT_MS = 2500
const MAX_CONCURRENT = 100
const MAX_RESULTS = 20
const SAMPLE_PER_CIDR = 30

function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) | parseInt(octet, 10), 0) >>> 0
}

function intToIp(n) {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.')
}

function sampleCidr(cidr, sampleSize) {
  const [base, prefixStr] = cidr.split('/')
  const prefix = parseInt(prefixStr, 10)
  const baseInt = ipToInt(base)
  const count = Math.pow(2, 32 - prefix)
  const usable = count - 2 // skip network and broadcast

  if (usable <= 0) return []

  const step = Math.max(1, Math.floor(usable / sampleSize))
  const ips = []

  for (let i = 1; i <= usable && ips.length < sampleSize; i += step) {
    ips.push(intToIp(baseInt + i))
  }

  return ips
}

function tcpPing(ip, port) {
  return new Promise((resolve) => {
    const start = performance.now()
    const socket = new net.Socket()
    let done = false

    function finish(latencyMs) {
      if (done) return
      done = true
      socket.destroy()
      resolve({ ip, latencyMs })
    }

    socket.setTimeout(SCAN_TIMEOUT_MS)
    socket.once('connect', () => finish(Math.round(performance.now() - start)))
    socket.once('timeout', () => finish(null))
    socket.once('error', () => finish(null))

    try {
      socket.connect({ host: ip, port })
    } catch {
      finish(null)
    }
  })
}

async function scanCloudflareIps({ port = 443, onProgress } = {}) {
  const allIps = []
  const liveCidrs = await fetchCloudflareIpsFromCdn().catch(() => null)
  const cidrs = Array.isArray(liveCidrs) && liveCidrs.length > 0 ? liveCidrs : CF_CIDRS

  for (const cidr of cidrs) {
    const sample = sampleCidr(cidr, SAMPLE_PER_CIDR)
    allIps.push(...sample)
  }

  // Shuffle for even sampling across ranges
  for (let i = allIps.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[allIps[i], allIps[j]] = [allIps[j], allIps[i]]
  }

  const results = []
  let completed = 0
  let nextIndex = 0
  const total = allIps.length

  async function worker() {
    while (true) {
      const idx = nextIndex++
      if (idx >= total) return

      const result = await tcpPing(allIps[idx], port)
      completed++

      if (result.latencyMs !== null) {
        results.push(result)
      }

      if (onProgress) {
        onProgress({ completed, total, found: results.length })
      }
    }
  }

  const workers = Array.from({ length: MAX_CONCURRENT }, () => worker())
  await Promise.all(workers)

  results.sort((a, b) => a.latencyMs - b.latencyMs)

  return {
    scannedAt: new Date().toISOString(),
    total,
    reachable: results.length,
    port,
    results: results.slice(0, MAX_RESULTS),
    source: liveCidrs ? 'cloudflare-live' : 'bundled-fallback',
  }
}

async function fetchCloudflareIpsFromCdn() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await electronNet.fetch('https://www.cloudflare.com/ips-v4/#', {
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const text = await res.text()
    const cidrs = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => /^\d+\.\d+\.\d+\.\d+\/\d+$/.test(l))
    return cidrs.length > 0 ? cidrs : null
  } catch {
    return null
  }
}

module.exports = { scanCloudflareIps, fetchCloudflareIpsFromCdn }
