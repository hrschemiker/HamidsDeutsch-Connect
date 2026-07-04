const path = require('node:path')
const fs = require('node:fs/promises')

const VALID_FINGERPRINTS = ['auto', 'chrome', 'firefox', 'safari', 'ios', 'android', 'random', 'randomized']

function getFilePath(userDataPath) {
  return path.join(userDataPath, 'HamidsDeutsch-Connect', 'utls-settings.json')
}

async function getUTlsSettings(userDataPath) {
  try {
    const raw = await fs.readFile(getFilePath(userDataPath), 'utf8')
    const parsed = JSON.parse(raw)
    return {
      globalFingerprint: VALID_FINGERPRINTS.includes(parsed.globalFingerprint) ? parsed.globalFingerprint : 'auto',
      echEnabled: Boolean(parsed.echEnabled),
      fragmentEnabled: Boolean(parsed.fragmentEnabled),
    }
  } catch {
    return { globalFingerprint: 'auto', echEnabled: false, fragmentEnabled: false }
  }
}

async function setUTlsSettings(userDataPath, settings) {
  const safe = {
    globalFingerprint: VALID_FINGERPRINTS.includes(settings?.globalFingerprint)
      ? settings.globalFingerprint
      : 'auto',
    echEnabled: Boolean(settings?.echEnabled),
    fragmentEnabled: Boolean(settings?.fragmentEnabled),
  }

  const dir = path.join(userDataPath, 'HamidsDeutsch-Connect')
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(getFilePath(userDataPath), JSON.stringify(safe, null, 2), 'utf8')
  return safe
}

module.exports = { getUTlsSettings, setUTlsSettings, VALID_FINGERPRINTS }
