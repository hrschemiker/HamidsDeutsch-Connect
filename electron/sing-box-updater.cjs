const https =
  require('node:https')

const path =
  require('node:path')

const fs =
  require('node:fs')

const fsp =
  require('node:fs/promises')

const os =
  require('node:os')

const crypto =
  require('node:crypto')

const {
  execFile,
} = require('node:child_process')

const {
  promisify,
} = require('node:util')

const execFileAsync =
  promisify(execFile)

const LATEST_RELEASE_API =
  'https://api.github.com/repos/SagerNet/sing-box/releases/latest'

const USER_AGENT =
  'HamidsDeutsch-Connect'

const REQUEST_TIMEOUT_MS =
  30000

const DOWNLOAD_TIMEOUT_MS =
  120000

async function checkLatestStable({
  currentVersion,
}) {
  const release =
    await requestJson(
      LATEST_RELEASE_API,
    )

  if (
    release?.draft === true ||
    release?.prerelease === true
  ) {
    throw new Error(
      'پاسخ GitHub مربوط به نسخه پایدار نبود.',
    )
  }

  const latestVersion =
    normalizeVersion(
      release?.tag_name,
    )

  if (!latestVersion) {
    throw new Error(
      'نسخه پایدار منتشرشده قابل تشخیص نبود.',
    )
  }

  const asset =
    selectWindowsAmd64Asset(
      release.assets,
      latestVersion,
    )

  if (!asset) {
    throw new Error(
      'فایل رسمی Windows AMD64 در Release پیدا نشد.',
    )
  }

  const current =
    normalizeVersion(
      currentVersion,
    )

  return {
    success: true,
    currentVersion:
      current,
    latestVersion,
    updateAvailable:
      !current ||
      compareVersions(
        current,
        latestVersion,
      ) < 0,
    publishedAt:
      typeof release.published_at ===
        'string'
        ? release.published_at
        : null,
    releaseUrl:
      typeof release.html_url ===
        'string'
        ? release.html_url
        : null,
    assetName:
      asset.name,
    assetUrl:
      asset.browser_download_url,
    assetDigest:
      normalizeDigest(
        asset.digest,
      ),
    error: null,
  }
}

async function updateToLatestStable({
  currentVersion,
  targetDirectory,
}) {
  const latest =
    await checkLatestStable({
      currentVersion,
    })

  if (
    !latest.updateAvailable &&
    latest.currentVersion
  ) {
    return {
      ...latest,
      updated: false,
      installedVersion:
        latest.currentVersion,
      message:
        'آخرین نسخه پایدار از قبل نصب است.',
    }
  }

  if (
    typeof targetDirectory !==
      'string' ||
    !targetDirectory.trim()
  ) {
    throw new Error(
      'مسیر نصب Engine معتبر نیست.',
    )
  }

  const workingDirectory =
    await fsp.mkdtemp(
      path.join(
        os.tmpdir(),
        'hamidsdeutsch-sing-box-',
      ),
    )

  const zipPath =
    path.join(
      workingDirectory,
      latest.assetName,
    )

  const extractPath =
    path.join(
      workingDirectory,
      'extracted',
    )

  try {
    await downloadFile(
      latest.assetUrl,
      zipPath,
    )

    const actualDigest =
      await calculateSha256(
        zipPath,
      )

    if (
      latest.assetDigest &&
      actualDigest !==
        latest.assetDigest
    ) {
      throw new Error(
        'SHA-256 فایل دانلودشده با مقدار رسمی GitHub یکسان نیست.',
      )
    }

    await fsp.mkdir(
      extractPath,
      {
        recursive: true,
      },
    )

    await expandArchive(
      zipPath,
      extractPath,
    )

    const extractedEngine =
      await findFileRecursive(
        extractPath,
        'sing-box.exe',
      )

    if (!extractedEngine) {
      throw new Error(
        'فایل sing-box.exe داخل بسته دانلودشده پیدا نشد.',
      )
    }

    const extractedVersion =
      await readEngineVersion(
        extractedEngine,
      )

    if (
      extractedVersion !==
      latest.latestVersion
    ) {
      throw new Error(
        `نسخه فایل دانلودشده ${extractedVersion ?? 'نامشخص'} است و با Release ${latest.latestVersion} تطبیق ندارد.`,
      )
    }

    await fsp.mkdir(
      targetDirectory,
      {
        recursive: true,
      },
    )

    const targetPath =
      path.join(
        targetDirectory,
        'sing-box.exe',
      )

    const temporaryTarget =
      path.join(
        targetDirectory,
        'sing-box.exe.new',
      )

    const backupPath =
      path.join(
        targetDirectory,
        'sing-box.exe.backup',
      )

    await fsp.rm(
      temporaryTarget,
      {
        force: true,
      },
    )

    await fsp.copyFile(
      extractedEngine,
      temporaryTarget,
    )

    const copiedVersion =
      await readEngineVersion(
        temporaryTarget,
      )

    if (
      copiedVersion !==
      latest.latestVersion
    ) {
      throw new Error(
        'اعتبارسنجی فایل آماده نصب ناموفق بود.',
      )
    }

    await fsp.rm(
      backupPath,
      {
        force: true,
      },
    )

    if (
      fs.existsSync(
        targetPath,
      )
    ) {
      await fsp.rename(
        targetPath,
        backupPath,
      )
    }

    try {
      await fsp.rename(
        temporaryTarget,
        targetPath,
      )

      const installedVersion =
        await readEngineVersion(
          targetPath,
        )

      if (
        installedVersion !==
        latest.latestVersion
      ) {
        throw new Error(
          'نسخه نصب‌شده پس از جایگزینی معتبر نبود.',
        )
      }

      await fsp.rm(
        backupPath,
        {
          force: true,
        },
      )

      return {
        ...latest,
        updated: true,
        installedVersion,
        installedPath:
          targetPath,
        verifiedSha256:
          actualDigest,
        message:
          `sing-box ${installedVersion} با موفقیت نصب شد.`,
      }
    } catch (error) {
      await fsp.rm(
        targetPath,
        {
          force: true,
        },
      )

      if (
        fs.existsSync(
          backupPath,
        )
      ) {
        await fsp.rename(
          backupPath,
          targetPath,
        )
      }

      throw error
    }
  } finally {
    await fsp.rm(
      workingDirectory,
      {
        recursive: true,
        force: true,
      },
    )
  }
}

function getUserEngineDirectory(
  userDataPath,
) {
  return path.join(
    userDataPath,
    'HamidsDeutsch-Connect',
    'engine',
  )
}

function getUserEnginePath(
  userDataPath,
) {
  return path.join(
    getUserEngineDirectory(
      userDataPath,
    ),
    'sing-box.exe',
  )
}

function selectWindowsAmd64Asset(
  assets,
  version,
) {
  if (!Array.isArray(assets)) {
    return null
  }

  const exactName =
    `sing-box-${version}-windows-amd64.zip`

  const exact =
    assets.find(
      (asset) =>
        asset?.name ===
          exactName &&
        typeof asset?.browser_download_url ===
          'string',
    )

  if (exact) {
    return exact
  }

  return (
    assets.find(
      (asset) =>
        typeof asset?.name ===
          'string' &&
        /^sing-box-[^-]+(?:\.[^-]+)*-windows-amd64\.zip$/i.test(
          asset.name,
        ) &&
        typeof asset?.browser_download_url ===
          'string',
    ) ??
    null
  )
}

function normalizeVersion(
  value,
) {
  if (
    typeof value !==
      'string'
  ) {
    return null
  }

  const match =
    value
      .trim()
      .match(
        /^v?(\d+\.\d+\.\d+)$/,
      )

  return match?.[1] ?? null
}

function normalizeDigest(
  value,
) {
  if (
    typeof value !==
      'string'
  ) {
    return null
  }

  const match =
    value
      .trim()
      .toLowerCase()
      .match(
        /^sha256:([a-f0-9]{64})$/,
      )

  return match?.[1] ?? null
}

function compareVersions(
  left,
  right,
) {
  const a =
    left
      .split('.')
      .map(Number)

  const b =
    right
      .split('.')
      .map(Number)

  for (
    let index = 0;
    index < 3;
    index += 1
  ) {
    if (a[index] < b[index]) {
      return -1
    }

    if (a[index] > b[index]) {
      return 1
    }
  }

  return 0
}

async function requestJson(
  url,
) {
  const buffer =
    await requestBuffer(
      url,
      REQUEST_TIMEOUT_MS,
      {
        Accept:
          'application/vnd.github+json',
        'X-GitHub-Api-Version':
          '2022-11-28',
      },
    )

  return JSON.parse(
    buffer.toString('utf8'),
  )
}

async function downloadFile(
  url,
  destination,
) {
  const buffer =
    await requestBuffer(
      url,
      DOWNLOAD_TIMEOUT_MS,
      {
        Accept:
          'application/octet-stream',
      },
    )

  await fsp.writeFile(
    destination,
    buffer,
  )
}

function requestBuffer(
  url,
  timeout,
  extraHeaders,
  redirectCount = 0,
) {
  if (redirectCount > 5) {
    return Promise.reject(
      new Error(
        'تعداد Redirectهای دانلود بیش از حد مجاز بود.',
      ),
    )
  }

  return new Promise(
    (resolve, reject) => {
      const request =
        https.get(
          url,
          {
            headers: {
              'User-Agent':
                USER_AGENT,
              ...extraHeaders,
            },
          },
          (response) => {
            const status =
              response.statusCode ??
              0

            if (
              status >= 300 &&
              status < 400 &&
              response.headers.location
            ) {
              response.resume()

              const nextUrl =
                new URL(
                  response.headers.location,
                  url,
                ).toString()

              requestBuffer(
                nextUrl,
                timeout,
                extraHeaders,
                redirectCount + 1,
              )
                .then(resolve)
                .catch(reject)

              return
            }

            if (
              status < 200 ||
              status >= 300
            ) {
              response.resume()

              reject(
                new Error(
                  `درخواست GitHub با HTTP ${status} ناموفق بود.`,
                ),
              )
              return
            }

            const chunks = []

            response.on(
              'data',
              (chunk) => {
                chunks.push(chunk)
              },
            )

            response.on(
              'end',
              () => {
                resolve(
                  Buffer.concat(
                    chunks,
                  ),
                )
              },
            )

            response.on(
              'error',
              reject,
            )
          },
        )

      request.setTimeout(
        timeout,
        () => {
          request.destroy(
            new Error(
              'مهلت ارتباط با GitHub تمام شد.',
            ),
          )
        },
      )

      request.on(
        'error',
        reject,
      )
    },
  )
}

async function calculateSha256(
  filePath,
) {
  const hash =
    crypto.createHash(
      'sha256',
    )

  await new Promise(
    (resolve, reject) => {
      const stream =
        fs.createReadStream(
          filePath,
        )

      stream.on(
        'data',
        (chunk) => {
          hash.update(chunk)
        },
      )

      stream.on(
        'end',
        resolve,
      )

      stream.on(
        'error',
        reject,
      )
    },
  )

  return hash.digest(
    'hex',
  )
}

async function expandArchive(
  zipPath,
  destination,
) {
  const command =
    `Expand-Archive -LiteralPath '${escapePowerShellLiteral(zipPath)}' -DestinationPath '${escapePowerShellLiteral(destination)}' -Force`

  await execFileAsync(
    'powershell.exe',
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      command,
    ],
    {
      windowsHide: true,
      timeout:
        DOWNLOAD_TIMEOUT_MS,
      encoding: 'utf8',
      shell: false,
    },
  )
}

function escapePowerShellLiteral(
  value,
) {
  return String(value)
    .replace(
      /'/g,
      "''",
    )
}

async function findFileRecursive(
  directory,
  fileName,
) {
  const entries =
    await fsp.readdir(
      directory,
      {
        withFileTypes: true,
      },
    )

  for (const entry of entries) {
    const fullPath =
      path.join(
        directory,
        entry.name,
      )

    if (
      entry.isFile() &&
      entry.name.toLowerCase() ===
        fileName.toLowerCase()
    ) {
      return fullPath
    }

    if (entry.isDirectory()) {
      const nested =
        await findFileRecursive(
          fullPath,
          fileName,
        )

      if (nested) {
        return nested
      }
    }
  }

  return null
}

async function readEngineVersion(
  enginePath,
) {
  try {
    const {
      stdout,
      stderr,
    } = await execFileAsync(
      enginePath,
      ['version'],
      {
        windowsHide: true,
        timeout: 15000,
        encoding: 'utf8',
        shell: false,
      },
    )

    const output =
      `${stdout}\n${stderr}`

    const match =
      output.match(
        /sing-box version\s+([^\s]+)/i,
      )

    return normalizeVersion(
      match?.[1],
    )
  } catch {
    return null
  }
}

module.exports = {
  checkLatestStable,
  updateToLatestStable,
  getUserEngineDirectory,
  getUserEnginePath,
}
