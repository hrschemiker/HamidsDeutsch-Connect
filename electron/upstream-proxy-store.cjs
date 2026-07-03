const path = require('node:path')
const fs = require('node:fs/promises')

function getFilePath(userDataPath) {
  return path.join(userDataPath, 'HamidsDeutsch-Connect', 'upstream-proxy.json')
}

const DEFAULT_SETTINGS = {
  enabled: false,
  type: 'socks5', // 'socks5' | 'http'
  host: '',
  port: 1080,
}

async function getUpstreamProxy(userDataPath) {
  try {
    const raw = await fs.readFile(getFilePath(userDataPath), 'utf8')
    const parsed = JSON.parse(raw)
    return {
      enabled: Boolean(parsed.enabled),
      type: parsed.type === 'http' ? 'http' : 'socks5',
      host: typeof parsed.host === 'string' ? parsed.host.trim() : '',
      port: Number.isInteger(parsed.port) && parsed.port > 0 && parsed.port < 65536 ? parsed.port : 1080,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

async function setUpstreamProxy(userDataPath, settings) {
  const safe = {
    enabled: Boolean(settings?.enabled),
    type: settings?.type === 'http' ? 'http' : 'socks5',
    host: typeof settings?.host === 'string' ? settings.host.trim().slice(0, 253) : '',
    port: Number.isInteger(settings?.port) && settings.port > 0 && settings.port < 65536 ? settings.port : 1080,
  }

  const dir = path.join(userDataPath, 'HamidsDeutsch-Connect')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(getFilePath(userDataPath), JSON.stringify(safe, null, 2), 'utf8')
  return safe
}

module.exports = { getUpstreamProxy, setUpstreamProxy }
