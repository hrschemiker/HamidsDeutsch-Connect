'use strict'

const path = require('node:path')
const fs = require('node:fs/promises')

const BACKUP_FILES = Object.freeze([
  'app-settings.json',
  'utls-settings.json',
  'cf-scan-settings.json',
  'upstream-proxy.json',
  'dns-profiles.json',
  'subscriptions.json',
  'manual-nodes.json',
  'hidden-nodes.json',
  'split-tunnel-apps.json',
  'kill-switch.json',
  'free-config-pool.json',
])

const ALLOWED_BACKUP_FILES = new Set(BACKUP_FILES)

function getDir(userDataPath) {
  return path.join(userDataPath, 'HamidsDeutsch-Connect')
}

async function exportSettings(userDataPath) {
  const dir = getDir(userDataPath)
  const result = { version: 2, files: {}, exportedAt: new Date().toISOString() }

  for (const file of BACKUP_FILES) {
    try {
      const raw = await fs.readFile(path.join(dir, file), 'utf8')
      result.files[file] = JSON.parse(raw)
    } catch {
      // skip missing files
    }
  }

  return result
}

async function importSettings(userDataPath, backup) {
  if (
    !backup ||
    ![1, 2].includes(backup.version) ||
    !backup.files ||
    typeof backup.files !== 'object' ||
    Array.isArray(backup.files)
  ) {
    throw new Error('فایل پشتیبان معتبر نیست.')
  }

  const dir = getDir(userDataPath)
  await fs.mkdir(dir, { recursive: true })

  for (const [file, data] of Object.entries(backup.files)) {
    // Reject unknown JSON files as well as path traversal. Importing arbitrary
    // runtime files can corrupt the engine or overwrite recovery state.
    if (!ALLOWED_BACKUP_FILES.has(file) || path.basename(file) !== file) continue
    await fs.writeFile(path.join(dir, file), JSON.stringify(data, null, 2), 'utf8')
  }

  return { success: true }
}

module.exports = { exportSettings, importSettings }
