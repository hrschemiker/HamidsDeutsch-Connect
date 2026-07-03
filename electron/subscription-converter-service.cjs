const { net } = require('electron')

const CONVERTER_TIMEOUT_MS = 20000

// Public subscription converter backends (from Nova Tools / community)
const BACKENDS = [
  { id: 'cmliussss', label: 'CM Load Balancing', url: 'https://subapi.cmliussss.net' },
  { id: 'v1mk', label: 'Fiyang Enhanced', url: 'https://api.v1.mk' },
  { id: 'fxxk', label: 'CM Emergency', url: 'https://subapi.fxxk.dedyn.io' },
  { id: 'zrfme', label: 'Zhu Runfa', url: 'https://subapi.zrfme.com' },
]

const TARGETS = [
  { id: 'singbox', label: 'sing-box', value: 'singbox' },
  { id: 'clash', label: 'Clash Meta', value: 'clash' },
  { id: 'v2ray', label: 'V2Ray (base64)', value: 'v2ray' },
  { id: 'mixed', label: 'Mixed (URI list)', value: 'mixed' },
]

function getBackends() {
  return BACKENDS
}

function getTargets() {
  return TARGETS
}

async function convertSubscription({ subscriptionUrl, backendId, targetId }) {
  const backend = BACKENDS.find((b) => b.id === backendId) || BACKENDS[0]
  const target = TARGETS.find((t) => t.id === targetId) || TARGETS[0]

  if (!subscriptionUrl || typeof subscriptionUrl !== 'string') {
    throw new Error('Invalid subscription URL.')
  }

  // Build conversion URL (standard subconverter API format)
  const params = new URLSearchParams({
    target: target.value,
    url: subscriptionUrl,
    insert: 'false',
    emoji: 'true',
    list: 'false',
    xudp: 'false',
    udp: 'true',
    tfo: 'false',
    expand: 'true',
    scv: 'false',
    fdn: 'false',
    sort: 'false',
  })

  const convertUrl = `${backend.url}/sub?${params.toString()}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), CONVERTER_TIMEOUT_MS)

  try {
    const res = await net.fetch(convertUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'HamidsDeutsch-Connect/1.9.0',
        Accept: 'text/plain, application/json, */*',
      },
    })
    clearTimeout(timer)

    if (!res.ok) {
      throw new Error(`Converter returned HTTP ${res.status}.`)
    }

    const text = await res.text()

    if (!text || !text.trim()) {
      throw new Error('Converter returned empty response.')
    }

    return {
      success: true,
      convertedContent: text.trim(),
      convertUrl,
      backend: backend.label,
      target: target.label,
    }
  } catch (error) {
    clearTimeout(timer)
    if (error?.name === 'AbortError') throw new Error('Converter request timed out.')
    throw error
  }
}

module.exports = { convertSubscription, getBackends, getTargets }
