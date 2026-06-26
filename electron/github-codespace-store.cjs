const path = require('node:path')
const fs = require('node:fs/promises')
const { safeStorage } = require('electron')

const STORE_FILE = 'codespace-settings.json'

function getStorePath(userDataPath) {
  return path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    'github',
    STORE_FILE,
  )
}

async function loadCodespaceSettings(userDataPath) {
  const filePath = getStorePath(userDataPath)
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return { success: true, settings: decodeSettings(parsed), error: null }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { success: true, settings: createEmptySettings(), error: null }
    }
    return {
      success: false,
      settings: createEmptySettings(),
      error: error instanceof Error ? error.message : 'خواندن تنظیمات GitHub ناموفق بود.',
    }
  }
}

async function saveCodespaceSettings(userDataPath, input) {
  const settings = normalizeSettings(input)
  const filePath = getStorePath(userDataPath)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const encoded = encodeSettings(settings)
  const tmpPath = `${filePath}.tmp`
  await fs.writeFile(tmpPath, JSON.stringify(encoded, null, 2), 'utf8')
  await fs.rm(filePath, { force: true })
  await fs.rename(tmpPath, filePath)
  return { success: true, settings, error: null }
}

function createEmptySettings() {
  return {
    token: null,
    username: null,
    repoName: null,
    repoCreated: false,
    lastCodespaceName: null,
    lastCodespaceState: null,
    lastConnectedUuid: null,
  }
}

function normalizeSettings(input) {
  return {
    token:
      typeof input?.token === 'string' && input.token.trim()
        ? input.token.trim()
        : null,
    username:
      typeof input?.username === 'string' && input.username.trim()
        ? input.username.trim()
        : null,
    repoName:
      typeof input?.repoName === 'string' && input.repoName.trim()
        ? input.repoName.trim()
        : null,
    repoCreated: input?.repoCreated === true,
    lastCodespaceName:
      typeof input?.lastCodespaceName === 'string'
        ? input.lastCodespaceName
        : null,
    lastCodespaceState:
      typeof input?.lastCodespaceState === 'string'
        ? input.lastCodespaceState
        : null,
    lastConnectedUuid:
      typeof input?.lastConnectedUuid === 'string'
        ? input.lastConnectedUuid
        : null,
  }
}

function encodeSettings(settings) {
  const { token, ...rest } = settings
  return {
    version: 1,
    encrypted: safeStorage.isEncryptionAvailable(),
    token: token ? encryptText(token) : null,
    ...rest,
  }
}

function decodeSettings(payload) {
  if (!payload) return createEmptySettings()
  const token = payload.token
    ? decryptText(payload.token, payload.encrypted === true)
    : null
  return {
    token,
    username: typeof payload.username === 'string' ? payload.username : null,
    repoName: typeof payload.repoName === 'string' ? payload.repoName : null,
    repoCreated: payload.repoCreated === true,
    lastCodespaceName:
      typeof payload.lastCodespaceName === 'string'
        ? payload.lastCodespaceName
        : null,
    lastCodespaceState:
      typeof payload.lastCodespaceState === 'string'
        ? payload.lastCodespaceState
        : null,
    lastConnectedUuid:
      typeof payload.lastConnectedUuid === 'string'
        ? payload.lastConnectedUuid
        : null,
  }
}

function encryptText(value) {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(value).toString('base64')
  }
  return Buffer.from(value, 'utf8').toString('base64')
}

function decryptText(value, encrypted) {
  const buffer = Buffer.from(value, 'base64')
  if (encrypted && safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(buffer)
  }
  return buffer.toString('utf8')
}

module.exports = { loadCodespaceSettings, saveCodespaceSettings }
