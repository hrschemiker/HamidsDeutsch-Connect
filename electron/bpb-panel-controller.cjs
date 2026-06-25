const {
  BrowserWindow,
  session,
  clipboard,
} = require('electron')

const {
  inspectBpbSource,
} = require('./bpb-source-service.cjs')

const LOAD_TIMEOUT_MS = 30000
const ACTION_TIMEOUT_MS = 2500
const PANEL_PARTITION =
  'persist:hamidsdeutsch-bpb-panel'

async function discoverBpbPanel({
  panelUrl,
}) {
  const normalizedPanelUrl =
    normalizePanelUrl(panelUrl)

  const panelWindow =
    await createPanelWindow({
      show: false,
    })

  try {
    await loadWindow(
      panelWindow,
      normalizedPanelUrl,
    )

    let discovered =
      await discoverFromRenderedPanel({
        window:
          panelWindow,
        panelUrl:
          normalizedPanelUrl,
      })

    if (
      !hasAnySubscription(
        discovered,
      )
    ) {
      const apiResult =
        await tryDiscoverFromSettingsApi({
          window:
            panelWindow,
          panelUrl:
            normalizedPanelUrl,
        })

      if (
        hasAnySubscription(
          apiResult,
        )
      ) {
        discovered = {
          ...discovered,
          ...apiResult,
        }
      }
    }

    if (
      !hasAnySubscription(
        discovered,
      )
    ) {
      panelWindow.show()
      panelWindow.focus()

      await waitForAuthenticatedPanel({
        window:
          panelWindow,
        panelUrl:
          normalizedPanelUrl,
      })

      discovered =
        await discoverFromRenderedPanel({
          window:
            panelWindow,
          panelUrl:
            normalizedPanelUrl,
        })
    }

    if (
      !hasAnySubscription(
        discovered,
      )
    ) {
      throw new Error(
        'اشتراک‌های پنل دیده شدند، اما لینک‌های Copy/Download قابل استخراج نبودند. داخل پنجره پنل یک‌بار Apply را بزن و دوباره بروزرسانی کن.',
      )
    }

    const validated =
      await validateDiscovered(
        discovered,
      )

    if (
      !hasAnySubscription(
        validated,
      )
    ) {
      throw new Error(
        'لینک‌های اشتراک از پنل خوانده شدند، اما خروجی معتبر sing-box یا Raw در آن‌ها پیدا نشد.',
      )
    }

    return {
      success: true,
      panelUrl:
        normalizedPanelUrl,
      origin:
        new URL(
          normalizedPanelUrl,
        ).origin,
      subPath:
        discovered.subPath ??
        null,
      panelVersion:
        discovered.panelVersion ??
        null,
      chainEnabled:
        discovered.chainEnabled === true,
      normalUrl:
        validated.normalUrl,
      fragmentUrl:
        validated.fragmentUrl,
      rawUrl:
        validated.rawUrl,
      warpUrl:
        validated.warpUrl,
      normalMode:
        validated.normalMode,
      fragmentMode:
        validated.fragmentMode,
      rawMode:
        validated.rawMode,
      warpMode:
        validated.warpMode,
      error: null,
    }
  } finally {
    if (
      !panelWindow.isDestroyed()
    ) {
      panelWindow.destroy()
    }
  }
}

async function createPanelWindow({
  show,
}) {
  session.fromPartition(
    PANEL_PARTITION,
    {
      cache: true,
    },
  )

  return new BrowserWindow({
    width: 1120,
    height: 820,
    show,
    autoHideMenuBar: true,
    backgroundColor: '#0b1120',
    title:
      'BPB Panel — HamidsDeutsch Connect',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent:
        false,
      partition:
        PANEL_PARTITION,
    },
  })
}

function normalizePanelUrl(
  value,
) {
  const url =
    new URL(
      String(value ?? ''),
    )

  if (
    url.protocol !==
      'https:'
  ) {
    throw new Error(
      'آدرس پنل BPB باید HTTPS باشد.',
    )
  }

  if (
    !/(\.pages\.dev|\.workers\.dev)$/i.test(
      url.hostname,
    )
  ) {
    throw new Error(
      'دامنه پنل BPB معتبر نیست.',
    )
  }

  url.pathname = '/panel'
  url.search = ''
  url.hash = ''

  return url.toString()
}

function loadWindow(
  window,
  url,
) {
  return new Promise(
    (resolve, reject) => {
      const timer =
        setTimeout(
          () => {
            cleanup()

            reject(
              new Error(
                'مهلت بارگیری پنل BPB تمام شد.',
              ),
            )
          },
          LOAD_TIMEOUT_MS,
        )

      const cleanup =
        () => {
          clearTimeout(timer)

          window.webContents
            .removeListener(
              'did-finish-load',
              onLoaded,
            )

          window.webContents
            .removeListener(
              'did-fail-load',
              onFailed,
            )
        }

      const onLoaded =
        () => {
          cleanup()

          setTimeout(
            resolve,
            1100,
          )
        }

      const onFailed =
        (
          _event,
          code,
          description,
        ) => {
          cleanup()

          reject(
            new Error(
              `بارگیری پنل BPB ناموفق بود: ${description} (${code})`,
            ),
          )
        }

      window.webContents.once(
        'did-finish-load',
        onLoaded,
      )

      window.webContents.once(
        'did-fail-load',
        onFailed,
      )

      void window.loadURL(url)
    },
  )
}

async function discoverFromRenderedPanel({
  window,
  panelUrl,
}) {
  const staticValues =
    await window.webContents
      .executeJavaScript(
        buildStaticExtractionScript(),
        true,
      )

  const targets =
    await window.webContents
      .executeJavaScript(
        buildClickTargetScript(),
        true,
      )

  const captured = []

  for (
    const target of
      Array.isArray(targets)
        ? targets.slice(0, 48)
        : []
  ) {
    const previousClipboard =
      clipboard.readText()

    clipboard.clear()

    const clicked =
      await window.webContents
        .executeJavaScript(
          `(() => {
            const element =
              document.querySelector(
                ${JSON.stringify(
                  `[data-hd-bpb-target="${target.id}"]`,
                )}
              )

            if (!element) {
              return false
            }

            element.click()
            return true
          })()`,
          true,
        )

    if (!clicked) {
      clipboard.writeText(
        previousClipboard,
      )
      continue
    }

    await delay(240)

    const value =
      clipboard.readText()

    clipboard.writeText(
      previousClipboard,
    )

    if (
      value &&
      value !== previousClipboard
    ) {
      captured.push({
        value,
        context:
          target.context,
        source:
          'clipboard',
      })
    }
  }

  const entries = [
    ...(
      Array.isArray(
        staticValues,
      )
        ? staticValues
        : []
    ),
    ...captured,
  ]

  return classifyEntries({
    entries,
    panelUrl,
  })
}

function buildStaticExtractionScript() {
  return `(() => {
    const results = []

    const push = (
      value,
      context,
      source,
    ) => {
      if (
        typeof value !== 'string' ||
        !value.trim()
      ) {
        return
      }

      results.push({
        value: value.trim(),
        context:
          String(context || '')
            .replace(/\\s+/g, ' ')
            .trim()
            .slice(0, 1200),
        source,
      })
    }

    const elements =
      Array.from(
        document.querySelectorAll(
          'a, button, input, textarea, [data-url], [data-link], [data-clipboard-text]',
        ),
      )

    for (const element of elements) {
      const context =
        getContext(element)

      for (const name of [
        'href',
        'value',
        'data-url',
        'data-link',
        'data-href',
        'data-clipboard-text',
        'onclick',
      ]) {
        push(
          element.getAttribute?.(name),
          context,
          name,
        )
      }

      if (
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) {
        push(
          element.value,
          context,
          'form-value',
        )
      }
    }

    const html =
      document.documentElement.outerHTML

    const urls =
      html.match(
        /(?:https?:\\\\?\\/\\\\?\\/|sing-box:\\\\?\\/\\\\?\\/|v2rayng:\\\\?\\/\\\\?\\/|hiddify:\\\\?\\/\\\\?\\/)[^"'<>\\\\s]+/gi,
      ) || []

    for (const url of urls) {
      push(
        url.replaceAll('\\\\/', '/'),
        'document html',
        'html-regex',
      )
    }

    function getContext(
      element,
    ) {
      let current = element
      let context = ''

      for (
        let depth = 0;
        depth < 7 && current;
        depth += 1
      ) {
        const text =
          String(
            current.textContent || '',
          )
            .replace(/\\s+/g, ' ')
            .trim()

        if (text) {
          context =
            text + ' ' + context
        }

        if (
          /Normal|Fragment|Raw|Warp|Subscriptions/i.test(
            context,
          )
        ) {
          break
        }

        current =
          current.parentElement
      }

      return context
    }

    return results
  })()`
}

function buildClickTargetScript() {
  return `(() => {
    const candidates =
      Array.from(
        document.querySelectorAll(
          'button, [role="button"], a, .material-icons, [class*="copy"], [class*="download"]',
        ),
      )

    const result = []
    let counter = 0

    for (const element of candidates) {
      const ownText =
        String(
          element.textContent || '',
        )
          .replace(/\\s+/g, ' ')
          .trim()

      const aria =
        String(
          element.getAttribute?.(
            'aria-label',
          ) || '',
        )

      const title =
        String(
          element.getAttribute?.(
            'title',
          ) || '',
        )

      if (
        !/copy|download|content_copy|file_download|دانلود|کپی/i.test(
          ownText + ' ' + aria + ' ' + title,
        )
      ) {
        continue
      }

      let current = element
      let context = ''

      for (
        let depth = 0;
        depth < 8 && current;
        depth += 1
      ) {
        context =
          String(
            current.textContent || '',
          )
            .replace(/\\s+/g, ' ')
            .trim() +
          ' ' +
          context

        if (
          /Normal|Fragment|Raw|Warp/i.test(
            context,
          ) &&
          /sing-box|v2rayNG|Raw|Warp/i.test(
            context,
          )
        ) {
          break
        }

        current =
          current.parentElement
      }

      const id =
        'hd-bpb-' +
        Date.now() +
        '-' +
        counter++

      element.setAttribute(
        'data-hd-bpb-target',
        id,
      )

      result.push({
        id,
        context:
          context.slice(
            0,
            1400,
          ),
      })
    }

    return result
  })()`
}

function classifyEntries({
  entries,
  panelUrl,
}) {
  const result = {
    normalUrl: '',
    fragmentUrl: '',
    rawUrl: '',
    warpUrl: '',
    subPath: null,
    panelVersion: null,
    chainEnabled: false,
  }

  const origin =
    new URL(
      panelUrl,
    ).origin

  for (
    const entry of entries
  ) {
    const values =
      unwrapValues(
        entry?.value,
        origin,
      )

    for (const value of values) {
      const context =
        String(
          entry?.context ?? '',
        )
          .toLowerCase()

      const lowerValue =
        value.toLowerCase()

      let type = null

      if (
        /\bfragment\b/.test(
          context,
        ) ||
        /\/fragment\//.test(
          lowerValue,
        )
      ) {
        type = 'fragment'
      } else if (
        /\bwarp\b/.test(
          context,
        ) ||
        /\/warp\//.test(
          lowerValue,
        )
      ) {
        type = 'warp'
      } else if (
        /\braw\b/.test(
          context,
        ) ||
        /\/raw\//.test(
          lowerValue,
        )
      ) {
        type = 'raw'
      } else if (
        /\bnormal\b/.test(
          context,
        ) ||
        /\/normal\//.test(
          lowerValue,
        )
      ) {
        type = 'normal'
      }

      if (!type) {
        continue
      }

      const isSingBox =
        /sing-box|singbox/.test(
          context,
        ) ||
        /app=sing-box|sing-box/.test(
          lowerValue,
        )

      if (
        type !== 'raw' &&
        !isSingBox
      ) {
        continue
      }

      const key =
        `${type}Url`

      if (!result[key]) {
        result[key] = value
      }

      const pathMatch =
        value.match(
          /\/sub\/(?:normal|fragment|raw|warp)\/([^/?#]+)/i,
        )

      if (
        pathMatch?.[1] &&
        !result.subPath
      ) {
        try {
          result.subPath =
            decodeURIComponent(
              pathMatch[1],
            )
        } catch {
          result.subPath =
            pathMatch[1]
        }
      }
    }
  }

  return result
}

function unwrapValues(
  rawValue,
  origin,
) {
  if (
    typeof rawValue !==
      'string' ||
    !rawValue.trim()
  ) {
    return []
  }

  const decoded =
    decodeEntities(
      rawValue,
    )
      .replace(
        /\\u0026/g,
        '&',
      )
      .replace(
        /\\\//g,
        '/',
      )
      .trim()

  const result = []

  const chunks =
    decoded
      .split(
        /[\s"'<>]+/,
      )
      .filter(Boolean)

  for (const chunk of chunks) {
    const normalized =
      normalizeCandidate(
        chunk,
        origin,
      )

    if (!normalized) {
      continue
    }

    result.push(
      normalized,
    )

    try {
      const wrapper =
        new URL(
          normalized,
        )

      for (
        const key of [
          'url',
          'sub',
          'subscription',
          'config',
        ]
      ) {
        const nested =
          wrapper
            .searchParams
            .get(key)

        const nestedUrl =
          normalizeCandidate(
            nested,
            origin,
          )

        if (nestedUrl) {
          result.push(
            nestedUrl,
          )
        }
      }
    } catch {
      // Ignore malformed wrappers.
    }
  }

  return [
    ...new Set(result),
  ]
}

function normalizeCandidate(
  value,
  origin,
) {
  if (
    typeof value !==
      'string' ||
    !value.trim()
  ) {
    return null
  }

  const cleaned =
    value
      .trim()
      .replace(
        /[),.;]+$/,
        '',
      )

  try {
    const url =
      new URL(
        cleaned,
        origin,
      )

    if (
      [
        'https:',
        'http:',
      ].includes(
        url.protocol,
      )
    ) {
      return url.toString()
    }

    if (
      [
        'sing-box:',
        'v2rayng:',
        'hiddify:',
      ].includes(
        url.protocol,
      )
    ) {
      for (
        const key of [
          'url',
          'sub',
          'subscription',
          'config',
        ]
      ) {
        const nested =
          url.searchParams.get(
            key,
          )

        if (nested) {
          return normalizeCandidate(
            nested,
            origin,
          )
        }
      }
    }
  } catch {
    return null
  }

  return null
}

async function validateDiscovered(
  discovered,
) {
  const result = {
    normalUrl: '',
    fragmentUrl: '',
    rawUrl: '',
    warpUrl: '',
    normalMode: null,
    fragmentMode: null,
    rawMode: null,
    warpMode: null,
  }

  for (
    const type of [
      'normal',
      'fragment',
      'raw',
      'warp',
    ]
  ) {
    const key =
      `${type}Url`

    const value =
      discovered[key]

    if (!value) {
      continue
    }

    try {
      const inspected =
        await inspectBpbSource(
          value,
        )

      result[key] =
        value

      result[
        `${type}Mode`
      ] =
        inspected.mode
    } catch {
      // A disabled profile is allowed.
    }
  }

  return result
}

async function tryDiscoverFromSettingsApi({
  window,
  panelUrl,
}) {
  const origin =
    new URL(
      panelUrl,
    ).origin

  try {
    const response =
      await window.webContents
        .executeJavaScript(
          `fetch(
            ${JSON.stringify(
              origin +
              '/panel/settings',
            )},
            {
              credentials: 'include',
              cache: 'no-store',
              headers: {
                Accept: 'application/json',
              },
            },
          ).then(async (response) => ({
            status: response.status,
            text: await response.text(),
          }))`,
          true,
        )

    if (
      Number(
        response?.status,
      ) !== 200
    ) {
      return {}
    }

    let json

    try {
      json =
        JSON.parse(
          String(
            response.text,
          ),
        )
    } catch {
      return {}
    }

    const holder =
      findObjectWithSubPath(
        json,
      )

    if (
      !holder?.subPath
    ) {
      return {}
    }

    const subPath =
      String(
        holder.subPath,
      ).trim()

    if (!subPath) {
      return {}
    }

    const urls =
      buildGuessedUrls({
        origin,
        subPath,
      })

    return {
      ...urls,
      subPath,
      panelVersion:
        findPanelVersion(
          json,
        ),
      chainEnabled:
        findChainEnabled(
          json,
        ),
    }
  } catch {
    return {}
  }
}

function buildGuessedUrls({
  origin,
  subPath,
}) {
  const encoded =
    encodeURIComponent(
      subPath,
    )

  return {
    normalUrl:
      `${origin}/sub/normal/${encoded}?app=sing-box`,
    fragmentUrl:
      `${origin}/sub/fragment/${encoded}?app=sing-box`,
    rawUrl:
      `${origin}/sub/raw/${encoded}?app=sing-box`,
    warpUrl:
      `${origin}/sub/warp/${encoded}?app=sing-box`,
  }
}

function findObjectWithSubPath(
  value,
) {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return null
  }

  if (
    typeof value.subPath ===
      'string'
  ) {
    return value
  }

  for (
    const nested of
    Object.values(value)
  ) {
    const found =
      findObjectWithSubPath(
        nested,
      )

    if (found) {
      return found
    }
  }

  return null
}

function findPanelVersion(
  value,
) {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return null
  }

  if (
    typeof value.panelVersion ===
      'string'
  ) {
    return value.panelVersion
  }

  for (
    const nested of
    Object.values(value)
  ) {
    const found =
      findPanelVersion(
        nested,
      )

    if (found) {
      return found
    }
  }

  return null
}

function findChainEnabled(
  value,
) {
  if (
    !value ||
    typeof value !==
      'object'
  ) {
    return false
  }

  if (
    typeof value.outProxy ===
      'string' &&
    value.outProxy.trim()
  ) {
    return true
  }

  if (
    typeof value.upstreamProxy ===
      'string' &&
    value.upstreamProxy.trim()
  ) {
    return true
  }

  return Object
    .values(value)
    .some(
      findChainEnabled,
    )
}

async function waitForAuthenticatedPanel({
  window,
  panelUrl,
}) {
  const deadline =
    Date.now() +
    120000

  while (
    Date.now() <
    deadline
  ) {
    await delay(1500)

    if (
      window.isDestroyed()
    ) {
      throw new Error(
        'پنجره پنل قبل از ورود بسته شد.',
      )
    }

    const currentUrl =
      window.webContents
        .getURL()

    if (
      currentUrl.startsWith(
        new URL(
          panelUrl,
        ).origin,
      )
    ) {
      const text =
        await window.webContents
          .executeJavaScript(
            `document.body?.innerText || ''`,
            true,
          )

      if (
        /Subscriptions|Normal|Fragment|Raw|Warp/i.test(
          String(text),
        )
      ) {
        await delay(800)
        return
      }
    }
  }

  throw new Error(
    'مهلت ورود به پنل BPB تمام شد.',
  )
}

function hasAnySubscription(
  value,
) {
  return Boolean(
    value?.normalUrl ||
    value?.fragmentUrl ||
    value?.rawUrl ||
    value?.warpUrl,
  )
}

function decodeEntities(
  value,
) {
  return String(value)
    .replaceAll(
      '&amp;',
      '&',
    )
    .replaceAll(
      '&quot;',
      '"',
    )
    .replaceAll(
      '&#39;',
      "'",
    )
}

function delay(
  milliseconds,
) {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      )
    },
  )
}

module.exports = {
  discoverBpbPanel,
}
