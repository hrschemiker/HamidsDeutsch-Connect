'use strict'

// ─────────────────────────────────────────────────────────────────────────────
// Telegram channel crawler for free proxy configs.
//
// Telegram is blocked in Iran, so the app only crawls once a tunnel is already
// up (subscription or free) — the fetch travels through the active connection.
// We read each channel's PUBLIC web preview at https://t.me/s/<channel>, which
// returns plain HTML (no login/bot token), paginate backwards through recent
// posts, and pull out vless/vmess/ss/trojan/... URIs.
//
// Incremental crawls pass `sinceId` (the newest post id seen last time) so we
// stop as soon as we reach already-seen posts and never re-import duplicates.
// ─────────────────────────────────────────────────────────────────────────────

const CHANNELS = ['best_internet_iran', 'Spotify_Porteghali']
const WEB_PREVIEW_BASE = 'https://t.me/s'
const POSTS_PER_PAGE_ESTIMATE = 20
const MAX_POSTS_DEFAULT = 200

const CONFIG_URI_REGEX =
  /(?:vless|vmess|trojan|ss|ssr|hysteria2|hy2|tuic|anytls):\/\/[^\s<>"'`]+/gi

// data-post="Channel/12345" — the message id of each rendered post.
const POST_ID_REGEX = /data-post="[^"/]+\/(\d+)"/g

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

function stripHtml(html) {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ')
}

function cleanUri(uri) {
  return uri.replace(/[.,;)\]}>«»"']+$/, '')
}

/** Extract config URIs + the min/max post id from one web-preview page. */
function extractFromPage(html) {
  const text = decodeHtmlEntities(stripHtml(html))
  const uris = []
  const seen = new Set()
  let m
  CONFIG_URI_REGEX.lastIndex = 0
  while ((m = CONFIG_URI_REGEX.exec(text)) !== null) {
    const uri = cleanUri(m[0])
    if (uri.length < 12 || seen.has(uri)) continue
    seen.add(uri)
    uris.push(uri)
  }

  let oldestId = null
  let newestId = null
  POST_ID_REGEX.lastIndex = 0
  while ((m = POST_ID_REGEX.exec(html)) !== null) {
    const id = Number(m[1])
    if (!Number.isFinite(id)) continue
    if (oldestId === null || id < oldestId) oldestId = id
    if (newestId === null || id > newestId) newestId = id
  }
  return { uris, oldestId, newestId }
}

/**
 * Crawl ONE channel's web preview.
 * @param {object}   opts
 * @param {string}   opts.channel     Channel username (no @).
 * @param {number}   [opts.sinceId]   Only collect posts newer than this id; stop
 *                                    paginating once we reach it. 0/undefined = full scan.
 * @param {number}   [opts.maxPosts]  Cap on posts scanned (approx).
 * @param {function} opts.fetchImpl   async (url) => { ok, status, text() }.
 * @returns {Promise<{ uris: string[], newestId: number|null, pages: number }>}
 */
async function crawlChannel({ channel, sinceId = 0, maxPosts = MAX_POSTS_DEFAULT, fetchImpl } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('crawlChannel requires a fetchImpl')
  const cleanChannel = String(channel || '').replace(/^@/, '').trim()
  if (!cleanChannel) throw new Error('Telegram channel name is empty')

  const maxPages = Math.max(1, Math.ceil(maxPosts / POSTS_PER_PAGE_ESTIMATE))
  const allUris = []
  const seen = new Set()
  let before = null
  let pages = 0
  let newestId = null
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

    const { uris, oldestId, newestId: pageNewest } = extractFromPage(html)
    pages++
    if (pageNewest !== null && (newestId === null || pageNewest > newestId)) newestId = pageNewest

    for (const uri of uris) {
      if (seen.has(uri)) continue
      seen.add(uri)
      allUris.push(uri)
    }

    // Reached posts we already imported last time → stop.
    if (sinceId && oldestId !== null && oldestId <= sinceId) break
    // No older cursor, or looping on the same id → end of channel.
    if (oldestId === null || oldestId === lastOldestId) break
    lastOldestId = oldestId
    before = oldestId
  }

  return { uris: allUris, newestId, pages }
}

module.exports = {
  crawlChannel,
  extractFromPage, // exported for testing
  CHANNELS,
}
