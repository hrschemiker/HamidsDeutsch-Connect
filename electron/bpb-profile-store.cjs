const path = require('node:path')
const fs = require('node:fs/promises')
const crypto = require('node:crypto')
const {
  safeStorage,
} = require('electron')

const STORE_FILE =
  'bpb-profile.json'

function getStorePath(
  userDataPath,
) {
  return path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    'bpb',
    STORE_FILE,
  )
}

async function loadBpbProfile(
  userDataPath,
) {
  const filePath =
    getStorePath(
      userDataPath,
    )

  try {
    const raw =
      await fs.readFile(
        filePath,
        'utf8',
      )

    const parsed =
      JSON.parse(raw)

    return {
      success: true,
      profile:
        decodeProfile(
          parsed,
        ),
      error: null,
    }
  } catch (error) {
    if (
      error?.code ===
      'ENOENT'
    ) {
      return {
        success: true,
        profile:
          createEmptyProfile(),
        error: null,
      }
    }

    return {
      success: false,
      profile:
        createEmptyProfile(),
      error:
        error instanceof Error
          ? error.message
          : 'خواندن تنظیمات BPB ناموفق بود.',
    }
  }
}

async function saveBpbProfile(
  userDataPath,
  input,
) {
  const profile =
    normalizeProfile(
      input,
    )

  const filePath =
    getStorePath(
      userDataPath,
    )

  await fs.mkdir(
    path.dirname(
      filePath,
    ),
    {
      recursive: true,
    },
  )

  const encoded =
    encodeProfile(
      profile,
    )

  const temporaryPath =
    `${filePath}.tmp`

  await fs.writeFile(
    temporaryPath,
    JSON.stringify(
      encoded,
      null,
      2,
    ),
    'utf8',
  )

  await fs.rm(
    filePath,
    {
      force: true,
    },
  )

  await fs.rename(
    temporaryPath,
    filePath,
  )

  return {
    success: true,
    profile,
    error: null,
  }
}

function createEmptyProfile() {
  return {
    id:
      crypto.randomUUID(),
    name:
      'BPB شخصی',
    normalUrl: '',
    fragmentUrl: '',
    rawUrl: '',
    warpUrl: '',
    panelUrl: '',
    subPath: '',
    panelVersion: null,
    chainEnabled: false,
    optimizerEnabled: true,
    optimizerAutoRefreshDays: 7,
    activeType:
      'normal',
    lastSuccessfulNodeId: null,
    lastSuccessfulNodeName: null,
    lastSuccessfulType: null,
    updatedAt: null,
  }
}

function normalizeProfile(
  input,
) {
  const activeType =
    [
      'normal',
      'fragment',
      'raw',
      'warp',
    ].includes(
      input?.activeType,
    )
      ? input.activeType
      : 'normal'

  return {
    id:
      typeof input?.id ===
        'string' &&
      input.id.trim()
        ? input.id.trim()
        : crypto.randomUUID(),
    name:
      typeof input?.name ===
        'string' &&
      input.name.trim()
        ? input.name
            .trim()
            .slice(
              0,
              80,
            )
        : 'BPB شخصی',
    normalUrl:
      normalizeUrl(
        input?.normalUrl,
      ),
    fragmentUrl:
      normalizeUrl(
        input?.fragmentUrl,
      ),
    rawUrl:
      normalizeUrl(
        input?.rawUrl,
      ),
    warpUrl:
      normalizeUrl(
        input?.warpUrl,
      ),
    panelUrl:
      normalizeUrl(
        input?.panelUrl,
      ),
    subPath:
      typeof input?.subPath ===
        'string'
        ? input.subPath.trim()
        : '',
    panelVersion:
      typeof input?.panelVersion ===
        'string'
        ? input.panelVersion.trim()
        : null,
    chainEnabled:
      input?.chainEnabled === true,
    optimizerEnabled:
      input?.optimizerEnabled !== false,
    optimizerAutoRefreshDays:
      Number.isInteger(
        input?.optimizerAutoRefreshDays,
      )
        ? Math.min(
            30,
            Math.max(
              1,
              input.optimizerAutoRefreshDays,
            ),
          )
        : 7,
    activeType,
    lastSuccessfulNodeId:
      typeof input?.lastSuccessfulNodeId ===
        'string' &&
      input.lastSuccessfulNodeId.trim()
        ? input.lastSuccessfulNodeId.trim()
        : null,
    lastSuccessfulNodeName:
      typeof input?.lastSuccessfulNodeName ===
        'string' &&
      input.lastSuccessfulNodeName.trim()
        ? input.lastSuccessfulNodeName
            .trim()
            .slice(0, 160)
        : null,
    lastSuccessfulType:
      [
        'normal',
        'fragment',
        'raw',
      ].includes(
        input?.lastSuccessfulType,
      )
        ? input.lastSuccessfulType
        : null,
    updatedAt:
      new Date().toISOString(),
  }
}

function normalizeUrl(
  value,
) {
  if (
    typeof value !==
      'string' ||
    !value.trim()
  ) {
    return ''
  }

  const parsed =
    new URL(
      value.trim(),
    )

  if (
    ![
      'https:',
      'http:',
    ].includes(
      parsed.protocol,
    )
  ) {
    throw new Error(
      'لینک BPB باید با http یا https شروع شود.',
    )
  }

  return parsed.toString()
}

function encodeProfile(
  profile,
) {
  return {
    version: 1,
    encrypted:
      safeStorage.isEncryptionAvailable(),
    data:
      encryptText(
        JSON.stringify(
          profile,
        ),
      ),
  }
}

function decodeProfile(
  payload,
) {
  if (
    !payload ||
    typeof payload.data !==
      'string'
  ) {
    return createEmptyProfile()
  }

  const json =
    decryptText(
      payload.data,
      payload.encrypted ===
        true,
    )

  return normalizeLoadedProfile(
    JSON.parse(json),
  )
}

function encryptText(
  value,
) {
  if (
    safeStorage.isEncryptionAvailable()
  ) {
    return safeStorage
      .encryptString(value)
      .toString('base64')
  }

  return Buffer
    .from(
      value,
      'utf8',
    )
    .toString('base64')
}

function decryptText(
  value,
  encrypted,
) {
  const buffer =
    Buffer.from(
      value,
      'base64',
    )

  if (
    encrypted &&
    safeStorage.isEncryptionAvailable()
  ) {
    return safeStorage
      .decryptString(
        buffer,
      )
  }

  return buffer.toString(
    'utf8',
  )
}

function normalizeLoadedProfile(
  profile,
) {
  return {
    id:
      typeof profile?.id ===
        'string'
        ? profile.id
        : crypto.randomUUID(),
    name:
      typeof profile?.name ===
        'string'
        ? profile.name
        : 'BPB شخصی',
    normalUrl:
      typeof profile?.normalUrl ===
        'string'
        ? profile.normalUrl
        : '',
    fragmentUrl:
      typeof profile?.fragmentUrl ===
        'string'
        ? profile.fragmentUrl
        : '',
    rawUrl:
      typeof profile?.rawUrl ===
        'string'
        ? profile.rawUrl
        : '',
    warpUrl:
      typeof profile?.warpUrl ===
        'string'
        ? profile.warpUrl
        : '',
    panelUrl:
      typeof profile?.panelUrl ===
        'string'
        ? profile.panelUrl
        : '',
    subPath:
      typeof profile?.subPath ===
        'string'
        ? profile.subPath
        : '',
    panelVersion:
      typeof profile?.panelVersion ===
        'string'
        ? profile.panelVersion
        : null,
    chainEnabled:
      profile?.chainEnabled === true,
    optimizerEnabled:
      profile?.optimizerEnabled !== false,
    optimizerAutoRefreshDays:
      Number.isInteger(
        profile?.optimizerAutoRefreshDays,
      )
        ? Math.min(
            30,
            Math.max(
              1,
              profile.optimizerAutoRefreshDays,
            ),
          )
        : 7,
    lastSuccessfulNodeId:
      typeof profile?.lastSuccessfulNodeId ===
        'string'
        ? profile.lastSuccessfulNodeId
        : null,
    lastSuccessfulNodeName:
      typeof profile?.lastSuccessfulNodeName ===
        'string'
        ? profile.lastSuccessfulNodeName
        : null,
    lastSuccessfulType:
      [
        'normal',
        'fragment',
        'raw',
        'warp',
      ].includes(
        profile?.lastSuccessfulType,
      )
        ? profile.lastSuccessfulType
        : null,
    activeType:
      [
        'normal',
        'fragment',
        'raw',
        'warp',
      ].includes(
        profile?.activeType,
      )
        ? profile.activeType
        : 'normal',
    updatedAt:
      typeof profile?.updatedAt ===
        'string'
        ? profile.updatedAt
        : null,
  }
}

module.exports = {
  loadBpbProfile,
  saveBpbProfile,
}
