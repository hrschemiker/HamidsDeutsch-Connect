'use strict'

const path = require('node:path')
const fs = require('node:fs/promises')

const BACKUP_FILES = [
  'utls-settings.json',
  'cf-scan-settings.json',
  'upstream-proxy.json',
]

function getDir(userDataPath) {
  return path.join(userDataPath, 'HamidsDeutsch-Connect')
}

async function exportSettings(userDataPath) {
  const dir = getDir(userDataPath)
  const result = { version: 1, files: {}, exportedAt: new Date().toISOString() }

  for (const file of BACKUP_FILES) {
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf8')
      result.files[file] = JSON.parse(raw)
    } catch {
      // skip missing files
    }
  }

  // Include subscriptions list
  try {
    const raw = await fs.readFile(path.join(dir, 'subscriptions.json'), 'utf8')
    result.files['subscriptions.json'] = JSON.parse(raw)
  } catch {}

  // Include manual nodes
  try {
    const raw = await fs.readFile(path.join(dir, 'manual-nodes.json'), 'utf8')
    result.files['manual-nodes.json'] = JSON.parse(raw)
  } catch {}

  // Include direct domains
  try {
    const raw = await fs.readFile(path.join(dir, 'direct-domains.json'), 'utf8')
    result.files['direct-domains.json'] = JSON.parse(raw)
  } catch {}

  return result
}

async function importSettings(userDataPath, backup) {
  if (!backup || backup.version !== 1 || !backup.files) {
    throw new Error('فایل پشتیبان معتبر نیست.')
  }

  const dir = getDir(userDataPath)
  await fs.mkdir(dir, { recursive: true })

  for (const [file, data] of Object.entries(backup.files)) {
    // Only allow known safe file names (no path traversal)
    const baseName = path.basename(file)
    if (baseName !== file || !baseName.endsWith('.json')) continue
    await fs.writeFile(path.join(dir, baseName), JSON.stringify(data, null, 2), 'utf8')
  }

  return { success: true }
}

module.exports = { exportSettings, importSettings }
