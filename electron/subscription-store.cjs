const { app, safeStorage } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')
const crypto = require('node:crypto')

const DATA_DIRECTORY_NAME = 'HamidsDeutsch-Connect'
const DATA_FILE_NAME = 'subscriptions.json'

function getDataDirectoryPath() {
  return path.join(
    app.getPath('userData'),
    DATA_DIRECTORY_NAME,
  )
}

function getDataFilePath() {
  return path.join(
    getDataDirectoryPath(),
    DATA_FILE_NAME,
  )
}

function getTemporaryFilePath() {
  return `${getDataFilePath()}.tmp`
}

function createEmptyStore() {
  return {
    version: 1,
    subscriptions: [],
  }
}

async function ensureDataDirectory() {
  await fs.mkdir(getDataDirectoryPath(), {
    recursive: true,
  })
}

async function readStore() {
  await ensureDataDirectory()

  try {
    const content = await fs.readFile(
      getDataFilePath(),
      'utf8',
    )

    const parsed = JSON.parse(content)

    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray(parsed.subscriptions)
    ) {
      return createEmptyStore()
    }

    return {
      version: 1,
      subscriptions: parsed.subscriptions.filter(
        isStoredSubscription,
      ),
    }
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return createEmptyStore()
    }

    console.error(
      '[Subscriptions] Failed to read data file:',
      error,
    )

    throw new Error(
      'خواندن اطلاعات اشتراک‌ها با خطا مواجه شد.',
    )
  }
}

async function writeStore(store) {
  await ensureDataDirectory()

  const serialized = JSON.stringify(
    store,
    null,
    2,
  )

  const temporaryPath = getTemporaryFilePath()
  const finalPath = getDataFilePath()

  await fs.writeFile(
    temporaryPath,
    serialized,
    'utf8',
  )

  try {
    await fs.rename(
      temporaryPath,
      finalPath,
    )
  } catch (error) {
    if (
      error?.code === 'EEXIST' ||
      error?.code === 'EPERM'
    ) {
      await fs.rm(finalPath, {
        force: true,
      })

      await fs.rename(
        temporaryPath,
        finalPath,
      )

      return
    }

    throw error
  }
}

function isStoredSubscription(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      typeof value.id === 'string' &&
      typeof value.name === 'string' &&
      typeof value.host === 'string' &&
      typeof value.encryptedUrl === 'string' &&
      typeof value.createdAt === 'string' &&
      typeof value.updatedAt === 'string',
  )
}

function normalizeSubscriptionUrl(rawUrl) {
  if (typeof rawUrl !== 'string') {
    throw new Error(
      'آدرس اشتراک معتبر نیست.',
    )
  }

  const trimmedUrl = rawUrl.trim()

  if (!trimmedUrl) {
    throw new Error(
      'لطفاً لینک اشتراک را وارد کن.',
    )
  }

  if (trimmedUrl.length > 4096) {
    throw new Error(
      'طول لینک اشتراک بیش از حد مجاز است.',
    )
  }

  let parsedUrl

  try {
    parsedUrl = new URL(trimmedUrl)
  } catch {
    throw new Error(
      'ساختار لینک اشتراک معتبر نیست.',
    )
  }

  if (
    parsedUrl.protocol !== 'https:' &&
    parsedUrl.protocol !== 'http:'
  ) {
    throw new Error(
      'فقط لینک‌های http و https پذیرفته می‌شوند.',
    )
  }

  if (!parsedUrl.hostname) {
    throw new Error(
      'نام میزبان لینک اشتراک تشخیص داده نشد.',
    )
  }

  parsedUrl.hash = ''

  return {
    url: parsedUrl.toString(),
    host: parsedUrl.hostname.toLowerCase(),
  }
}

function normalizeSubscriptionName(
  rawName,
  fallbackHost,
) {
  if (typeof rawName !== 'string') {
    return fallbackHost
  }

  const normalizedName = rawName
    .trim()
    .replace(/\s+/g, ' ')

  if (!normalizedName) {
    return fallbackHost
  }

  if (normalizedName.length > 80) {
    throw new Error(
      'نام اشتراک نباید بیشتر از ۸۰ نویسه باشد.',
    )
  }

  return normalizedName
}

function ensureEncryptionAvailable() {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'ذخیره‌سازی امن ویندوز در دسترس نیست؛ لینک اشتراک ذخیره نشد.',
    )
  }
}

function encryptUrl(url) {
  ensureEncryptionAvailable()

  return safeStorage
    .encryptString(url)
    .toString('base64')
}

function toPublicSubscription(subscription) {
  return {
    id: subscription.id,
    name: subscription.name,
    host: subscription.host,
    createdAt: subscription.createdAt,
    updatedAt: subscription.updatedAt,
  }
}

async function listSubscriptions() {
  const store = await readStore()

  return store.subscriptions
    .map(toPublicSubscription)
    .sort((first, second) =>
      second.createdAt.localeCompare(
        first.createdAt,
      ),
    )
}

async function addSubscription(input) {
  const {
    url,
    host,
  } = normalizeSubscriptionUrl(
    input?.url,
  )

  const name = normalizeSubscriptionName(
    input?.name,
    host,
  )

  const store = await readStore()

  const duplicate = store.subscriptions.some(
    (subscription) =>
      subscription.host === host &&
      decryptUrl(subscription.encryptedUrl) === url,
  )

  if (duplicate) {
    throw new Error(
      'این لینک اشتراک قبلاً ثبت شده است.',
    )
  }

  const now = new Date().toISOString()

  const subscription = {
    id: crypto.randomUUID(),
    name,
    host,
    encryptedUrl: encryptUrl(url),
    createdAt: now,
    updatedAt: now,
  }

  store.subscriptions.push(subscription)

  await writeStore(store)

  console.log(
    '[Subscriptions] Subscription saved:',
    subscription.id,
  )

  return toPublicSubscription(subscription)
}

async function removeSubscription(subscriptionId) {
  if (
    typeof subscriptionId !== 'string' ||
    !subscriptionId.trim()
  ) {
    throw new Error(
      'شناسه اشتراک معتبر نیست.',
    )
  }

  const store = await readStore()

  const nextSubscriptions =
    store.subscriptions.filter(
      (subscription) =>
        subscription.id !== subscriptionId,
    )

  if (
    nextSubscriptions.length ===
    store.subscriptions.length
  ) {
    throw new Error(
      'اشتراک موردنظر پیدا نشد.',
    )
  }

  await writeStore({
    version: 1,
    subscriptions: nextSubscriptions,
  })

  console.log(
    '[Subscriptions] Subscription removed:',
    subscriptionId,
  )

  return {
    success: true,
  }
}

function decryptUrl(encryptedUrl) {
  ensureEncryptionAvailable()

  try {
    return safeStorage.decryptString(
      Buffer.from(
        encryptedUrl,
        'base64',
      ),
    )
  } catch {
    throw new Error(
      'رمزگشایی اطلاعات اشتراک امکان‌پذیر نیست.',
    )
  }
}

function getSubscriptionDataPath() {
  return getDataFilePath()
}

async function getSubscriptionUrl(
  subscriptionId,
) {
  if (
    typeof subscriptionId !== 'string' ||
    !subscriptionId.trim()
  ) {
    throw new Error(
      'شناسه اشتراک معتبر نیست.',
    )
  }

  const store = await readStore()

  const subscription =
    store.subscriptions.find(
      (item) =>
        item.id === subscriptionId,
    )

  if (!subscription) {
    throw new Error(
      'اشتراک موردنظر پیدا نشد.',
    )
  }

  return decryptUrl(
    subscription.encryptedUrl,
  )
}

module.exports = {
  addSubscription,
  getSubscriptionDataPath,
  getSubscriptionUrl,
  listSubscriptions,
  removeSubscription,
}