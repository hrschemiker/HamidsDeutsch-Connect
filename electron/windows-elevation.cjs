const {
  execFile,
} = require('node:child_process')
const path = require('node:path')

const ELEVATION_TIMEOUT_MS = 20000

function quotePowerShellLiteral(
  value,
) {
  return `'${String(value).replace(
    /'/g,
    "''",
  )}'`
}

async function relaunchAsAdministrator({
  isDevelopment,
  appPath,
  executablePath,
}) {
  if (process.platform !== 'win32') {
    return {
      success: false,
      launched: false,
      error:
        'اجرای Elevated فقط در Windows پشتیبانی می‌شود.',
    }
  }

  if (
    typeof appPath !== 'string' ||
    !appPath.trim()
  ) {
    return {
      success: false,
      launched: false,
      error:
        'مسیر برنامه معتبر نیست.',
    }
  }

  const command =
    isDevelopment
      ? buildDevelopmentCommand(
          appPath,
        )
      : buildPackagedCommand(
          executablePath,
        )

  return new Promise((resolve) => {
    execFile(
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
          ELEVATION_TIMEOUT_MS,
        encoding: 'utf8',
        shell: false,
      },
      (error) => {
        if (error) {
          const rawMessage =
            String(
              error.stderr ||
              error.message ||
              '',
            ).trim()

          const cancelled =
            /cancel|canceled|cancelled|1223/i.test(
              rawMessage,
            )

          resolve({
            success: false,
            launched: false,
            error: cancelled
              ? 'درخواست دسترسی Administrator لغو شد.'
              : `اجرای برنامه با دسترسی Administrator ناموفق بود: ${
                  rawMessage ||
                  'خطای نامشخص'
                }`,
          })

          return
        }

        resolve({
          success: true,
          launched: true,
          error: null,
        })
      },
    )
  })
}

function buildDevelopmentCommand(
  appPath,
) {
  const workingDirectory =
    path.resolve(appPath)

  const delayedCommand =
    `timeout /t 2 /nobreak >nul && cd /d "${workingDirectory}" && npm start`

  return [
    `$arguments = @('/k', ${quotePowerShellLiteral(delayedCommand)})`,
    `Start-Process -FilePath 'cmd.exe' -ArgumentList $arguments -WorkingDirectory ${quotePowerShellLiteral(workingDirectory)} -Verb RunAs`,
  ].join(
    EnvironmentNewLine(),
  )
}

function buildPackagedCommand(
  executablePath,
) {
  if (
    typeof executablePath !==
      'string' ||
    !executablePath.trim()
  ) {
    throw new Error(
      'مسیر فایل اجرایی برنامه معتبر نیست.',
    )
  }

  return `Start-Process -FilePath ${quotePowerShellLiteral(executablePath)} -Verb RunAs`
}

function EnvironmentNewLine() {
  return '\r\n'
}

module.exports = {
  relaunchAsAdministrator,
}
