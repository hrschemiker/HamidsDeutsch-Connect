'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// Telegram channel crawler for free proxy configs.
//
// Telegram is blocked in Iran, but the app only crawls AFTER the user is already
// connected through some other method, so the fetch travels through the active
// tunnel. We read the channel's PUBLIC web preview at https://t.me/s/<channel>,
// which returns plain HTML (no login, no bot token needed), then paginate
// backwards through the latest posts and pull out vless/vmess/ss/trojan/... URIs.
//
// Configs from this source are tagged source:'telegram' and are prioritised
// ahead of the generic subscription lists, because this channel is hand-curated
// and its configs tend to actually work.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CHANNEL = 'Spotify_Porteghali'
const WEB_PREVIEW_BASE = 'https://t.me/s'
const POSTS_PER_PAGE_ESTIMATE = 20
const FETCH_TIMEOUT_MS = 15000

const CONFIG_URI_REGEX =
  /(?:vless|vmess|trojan|ss|ssr|hysteria2|hy2|tuic|anytls):\/\/[^\s<>"'`]+/gi

// data-post="Channel/12345" — used to find the oldest message id on a page so
// we can request the page before it.
const POST_ID_REGEX = /data-post="[^"/]+\/(\d+)"/g

/** Decode the handful of HTML entities Telegram emits in message text. */
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => {
      const n = Number(code)
      return Number.isFinite(n) ? String.fromCodePoint(n) : _m
    })
}

/** Strip HTML tags, turning <br> into newlines so multi-line posts split cleanly. */
function stripHtml(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
}

/** Trim trailing punctuation that commonly clings to a pasted link. */
function cleanUri(uri) {
  return uri.replace(/[.,;)\]}>«»"']+$/, '')
}

/**
 * Extract every proxy-config URI from a raw HTML page of the web preview.
 * Returns { uris: string[], oldestId: number|null }.
 */
function extractFromPage(html) {
  const text = decodeHtmlEntities(stripHtml(html))
  const uris = []
  const seen = new Set()

  let m
  CONFIG_URI_REGEX.lastIndex = 0
  while ((m = CONFIG_URI_REGEX.exec(text)) !== null) {
    const uri = cleanUri(m[0])
    if (uri.length < 12) continue
    if (seen.has(uri)) continue
    seen.add(uri)
    uris.push(uri)
  }

  let oldestId = null
  POST_ID_REGEX.lastIndex = 0
  while ((m = POST_ID_REGEX.exec(html)) !== null) {
    const id = Number(m[1])
    if (Number.isFinite(id) && (oldestId === null || id < oldestId)) oldestId = id
  }

  return { uris, oldestId }
}

/**
 * Crawl a Telegram channel's web preview for config URIs.
 *
 * @param {object}   opts
 * @param {string}   [opts.channel]  Channel username (no @).
 * @param {number}   [opts.maxPosts] Approx. number of recent posts to scan.
 * @param {function} opts.fetchImpl  async (url) => { ok, status, text() }. Caller
 *                                   supplies this so the fetch can be routed
 *                                   through the active tunnel.
 * @returns {Promise<{ uris: string[], postsScanned: number, pages: number }>}
 */
async function crawlTelegramConfigs({ channel = DEFAULT_CHANNEL, maxPosts = 200, fetchImpl } = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('crawlTelegramConfigs requires a fetchImpl')
  }

  const cleanChannel = String(channel).replace(/^@/, '').trim()
  if (!cleanChannel) throw new Error('Telegram channel name is empty')

  const maxPages = Math.max(1, Math.ceil(maxPosts / POSTS_PER_PAGE_ESTIMATE))
  const allUris = []
  const seen = new Set()
  let before = null
  let pages = 0
  let postsScanned = 0
  let lastOldestId = null

  for (let page = 0; page < maxPages; page++) {
    const url = before
      ? `${WEB_PREVIEW_BASE}/${cleanChannel}?before=${before}`
      : `${WEB_PREVIEW_BASE}/${cleanChannel}`

    let html
    try {
      const resp = await fetchImpl(url)
      if (!resp || !resp.ok) break
      html = await resp.text()
    } catch {
      break
    }
    if (!html) break

    const { uris, oldestId } = extractFromPage(html)
    pages++
    postsScanned += POSTS_PER_PAGE_ESTIMATE

    for (const uri of uris) {
      if (seen.has(uri)) continue
      seen.add(uri)
      allUris.push(uri)
    }

    // No older-post cursor, or we looped on the same id → we've reached the end.
    if (oldestId === null || oldestId === lastOldestId) break
    lastOldestId = oldestId
    before = oldestId
  }

  return { uris: allUris, postsScanned: Math.min(postsScanned, maxPosts), pages }
}

module.exports = {
  crawlTelegramConfigs,
  extractFromPage, // exported for testing
  DEFAULT_CHANNEL,
}
