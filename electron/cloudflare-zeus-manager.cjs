const http = require('node:http')
const crypto = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs/promises')
const { shell, safeStorage } = require('electron')

const CLIENT_ID = '54d11594-84e4-41aa-b438-e81b8fa78ee7'
const REDIRECT_PORT = 8977
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth/callback`
const AUTH_URL = 'https://dash.cloudflare.com/oauth2/auth'
const TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token'
const API_BASE = 'https://api.cloudflare.com/client/v4'
const ZEUS_JS_URL = 'https://raw.githubusercontent.com/IR-NETLIFY/zeus/main/zeus.js'
const SCOPES = [
  'account:read', 'user:read', 'workers:write', 'workers_kv:write',
  'workers_routes:write', 'workers_scripts:write', 'd1:write', 'offline_access',
]

let progressListener = null
let running = false

function setZeusProgressListener(listener) {
  progressListener = typeof listener === 'function' ? listener : null
}

function emit(stage, message, extra = {}) {
  try { progressListener?.({ stage, message, at: new Date().toISOString(), ...extra }) } catch {}
}

function statePath(userDataPath) {
  return path.join(userDataPath, 'HamidsDeutsch-Connect', 'zeus', 'cloudflare-account.json')
}

async function loadState(userDataPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath(userDataPath), 'utf8'))
    if (parsed.encryptedToken && safeStorage.isEncryptionAvailable()) {
      parsed.token = JSON.parse(safeStorage.decryptString(Buffer.from(parsed.encryptedToken, 'base64')))
    }
    delete parsed.encryptedToken
    return parsed
  } catch { return null }
}

async function saveState(userDataPath, state) {
  const target = statePath(userDataPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  const serializable = { ...state }
  if (serializable.token && safeStorage.isEncryptionAvailable()) {
    serializable.encryptedToken = safeStorage.encryptString(JSON.stringify(serializable.token)).toString('base64')
    delete serializable.token
  }
  await fs.writeFile(target, JSON.stringify(serializable, null, 2), 'utf8')
}

function randomText(length = 32) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length)
}

function challenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

function waitForOAuthCode(expectedState) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { server.close(); reject(new Error('مهلت ورود Cloudflare تمام شد.')) }, 180000)
    const server = http.createServer((req, res) => {
      try {
        const url = new URL(req.url, REDIRECT_URI)
        if (url.pathname !== '/oauth/callback') { res.writeHead(404).end(); return }
        if (url.searchParams.get('state') !== expectedState) throw new Error('پاسخ امنیتی Cloudflare معتبر نیست.')
        const error = url.searchParams.get('error')
        if (error) throw new Error(`Cloudflare ورود را رد کرد: ${error}`)
        const code = url.searchParams.get('code')
        if (!code) throw new Error('کد ورود Cloudflare دریافت نشد.')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h2 style="font-family:sans-serif;text-align:center;padding:40px">✅ Cloudflare connected. You can close this window.</h2>')
        clearTimeout(timer); server.close(); resolve(code)
      } catch (error) { clearTimeout(timer); server.close(); reject(error) }
    })
    server.on('error', reject)
    server.listen(REDIRECT_PORT, 'localhost')
  })
}

async function exchangeCode(code, verifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID, code_verifier: verifier,
  })
  const response = await fetch(TOKEN_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  })
  if (!response.ok) throw new Error(`دریافت مجوز Cloudflare ناموفق بود (${response.status}).`)
  const token = await response.json()
  token.expires_at = Date.now() + Number(token.expires_in || 3600) * 1000
  return token
}

async function ensureToken(userDataPath) {
  const state = await loadState(userDataPath)
  if (!state?.token?.access_token) throw new Error('ابتدا حساب Cloudflare را متصل کن.')
  if (state.token.expires_at && state.token.expires_at - Date.now() > 60000) return state
  if (!state.token.refresh_token) throw new Error('مجوز Cloudflare منقضی شده؛ دوباره حساب را متصل کن.')
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: state.token.refresh_token, client_id: CLIENT_ID })
  const response = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
  if (!response.ok) throw new Error('تمدید مجوز Cloudflare ناموفق بود؛ دوباره وارد شو.')
  const token = await response.json()
  token.expires_at = Date.now() + Number(token.expires_in || 3600) * 1000
  if (!token.refresh_token) token.refresh_token = state.token.refresh_token
  state.token = token
  await saveState(userDataPath, state)
  return state
}

async function cfApi(token, route, options = {}) {
  const response = await fetch(`${API_BASE}${route}`, {
    ...options, headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || json?.success === false) {
    const message = json?.errors?.map((e) => e.message).join('; ') || `Cloudflare API ${response.status}`
    throw new Error(message)
  }
  return json
}

async function loginCloudflareZeus({ userDataPath }) {
  if (running) throw new Error('یک عملیات در حال اجراست.')
  running = true
  try {
    emit('login', 'مرورگر Cloudflare باز شد؛ ورود و تأیید دسترسی را انجام بده.')
    const state = randomText(24)
    const verifier = randomText(64)
    const codeChallenge = challenge(verifier)
    const auth = new URL(AUTH_URL)
    auth.searchParams.set('client_id', CLIENT_ID)
    auth.searchParams.set('redirect_uri', REDIRECT_URI)
    auth.searchParams.set('response_type', 'code')
    auth.searchParams.set('scope', SCOPES.join(' '))
    auth.searchParams.set('state', state)
    auth.searchParams.set('code_challenge', codeChallenge)
    auth.searchParams.set('code_challenge_method', 'S256')
    const codePromise = waitForOAuthCode(state)
    await shell.openExternal(auth.toString())
    const code = await codePromise
    const token = await exchangeCode(code, verifier)
    const accounts = await cfApi(token.access_token, '/accounts')
    if (!accounts.result?.length) throw new Error('هیچ حساب Cloudflare پیدا نشد.')
    const account = accounts.result[0]
    const saved = { token, accountId: account.id, accountName: account.name, connectedAt: new Date().toISOString() }
    await saveState(userDataPath, saved)
    emit('connected', `حساب Cloudflare متصل شد: ${account.name}`)
    return { success: true, accountId: account.id, accountName: account.name, error: null }
  } catch (err) {
    return { success: false, error: err.message }
  } finally { running = false }
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractCookie(setCookieHeader) {
  if (!setCookieHeader) return null
  const parts = (Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader])
    .map(h => h.split(';')[0].trim())
  return parts.join('; ')
}

async function deployZeusPanel({ userDataPath }) {
  if (running) throw new Error('یک عملیات در حال اجراست.')
  running = true
  try {
    const account = await ensureToken(userDataPath)
    const token = account.token.access_token
    const accountId = account.accountId

    const workerName = `zeus-hd-${randomText(8).toLowerCase()}`
    const dbName = `zeus-db-${randomText(8).toLowerCase()}`
    const panelPassword = randomText(20)
    const username = 'hamid'
    const userUuid = crypto.randomUUID()

    emit('download', 'در حال دریافت zeus.js از GitHub...')
    const zeusResp = await fetch(ZEUS_JS_URL, { redirect: 'follow' })
    if (!zeusResp.ok) throw new Error(`دریافت zeus.js ناموفق بود (${zeusResp.status}).`)
    const zeusCode = await zeusResp.text()

    emit('db', 'در حال ساخت پایگاه داده D1...')
    const dbResult = await cfApi(token, `/accounts/${accountId}/d1/database`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: dbName }),
    })
    const dbId = dbResult.result.uuid

    emit('deploy', 'در حال انتشار پنل Zeus روی Cloudflare Workers...')
    const form = new FormData()
    const metadata = {
      main_module: 'zeus.js',
      compatibility_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      bindings: [
        { type: 'd1', name: 'DB', database_id: dbId },
        { type: 'plain_text', name: 'CF_API_TOKEN', text: token },
        { type: 'plain_text', name: 'CF_ACCOUNT_ID', text: accountId },
      ],
      observability: { enabled: false }, placement: {}, usage_model: 'standard',
      tags: [], tail_consumers: [], logpush: false,
    }
    form.set('metadata', JSON.stringify(metadata))
    form.set('package.json', new Blob(['{}'], { type: 'text/plain' }), 'package.json')
    form.set('package-lock.json', new Blob(['{}'], { type: 'text/plain' }), 'package-lock.json')
    form.set('zeus.js', new Blob([zeusCode], { type: 'application/javascript+module' }), 'zeus.js')

    await cfApi(token, `/accounts/${accountId}/workers/scripts/${workerName}`, { method: 'PUT', body: form })

    emit('subdomain', 'در حال فعال‌سازی آدرس workers.dev...')
    await cfApi(token, `/accounts/${accountId}/workers/scripts/${workerName}/subdomain`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, previews_enabled: false }),
    })
    const subdomainResult = await cfApi(token, `/accounts/${accountId}/workers/subdomain`)
    const workerDomain = `${workerName}.${subdomainResult.result.subdomain}.workers.dev`
    const workerUrl = `https://${workerDomain}`

    emit('init', 'در حال راه‌اندازی پنل (چند ثانیه صبر کن)...')
    await sleep(5000)

    // Set panel password
    let setupOk = false
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const pwResp = await fetch(`${workerUrl}/api/setup-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: panelPassword }),
        })
        if (pwResp.ok || pwResp.status === 409) { setupOk = true; break }
      } catch {}
      await sleep(3000)
    }
    if (!setupOk) throw new Error('راه‌اندازی رمز پنل Zeus ناموفق بود. دوباره تلاش کن.')

    // Login to panel to get session cookie
    const loginResp = await fetch(`${workerUrl}/api/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: panelPassword }),
    })
    const rawCookies = loginResp.headers.getSetCookie?.() ?? []
    const sessionCookie = extractCookie(rawCookies.length ? rawCookies : loginResp.headers.get('set-cookie'))
    if (!sessionCookie) throw new Error('ورود به پنل Zeus ناموفق بود.')

    emit('user', 'در حال ساخت کاربر اشتراک...')
    const userResp = await fetch(`${workerUrl}/api/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': sessionCookie },
      body: JSON.stringify({
        username, uuid: userUuid, limit_gb: 999, expiry_days: 3650,
        ip_limit: 10, tls: 'tls', port: 443, fingerprint: 'chrome', is_active: 1,
      }),
    })
    if (!userResp.ok) {
      const txt = await userResp.text().catch(() => '')
      throw new Error(`ساخت کاربر Zeus ناموفق بود: ${txt}`)
    }

    const subUrl = `${workerUrl}/sub/${username}`
    const deployment = {
      workerName, dbName, dbId, workerUrl, workerDomain,
      panelPassword, username, userUuid, subUrl,
      deployedAt: new Date().toISOString(),
    }
    await saveState(userDataPath, { ...account, deployment })
    emit('ready', 'پنل Zeus آماده است!', { workerUrl, subUrl })
    return { success: true, workerUrl, subUrl, username, error: null }
  } catch (err) {
    emit('error', err.message)
    return { success: false, error: err.message }
  } finally { running = false }
}

async function updateZeusPanel({ userDataPath }) {
  if (running) throw new Error('یک عملیات در حال اجراست.')
  running = true
  try {
    const account = await ensureToken(userDataPath)
    const d = account.deployment
    if (!d?.workerName) throw new Error('پنل Zeus ساخته‌شده‌ای ثبت نشده است.')
    emit('download', 'در حال دریافت zeus.js جدید از GitHub...')
    const zeusResp = await fetch(ZEUS_JS_URL, { redirect: 'follow' })
    if (!zeusResp.ok) throw new Error('دریافت zeus.js ناموفق بود.')
    const zeusCode = await zeusResp.text()
    const token = account.token.access_token
    const accountId = account.accountId
    emit('deploy', 'در حال بروزرسانی worker...')
    const form = new FormData()
    const metadata = {
      main_module: 'zeus.js',
      compatibility_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      bindings: [
        { type: 'd1', name: 'DB', database_id: d.dbId },
        { type: 'plain_text', name: 'CF_API_TOKEN', text: token },
        { type: 'plain_text', name: 'CF_ACCOUNT_ID', text: accountId },
      ],
      observability: { enabled: false }, placement: {}, usage_model: 'standard',
      tags: [], tail_consumers: [], logpush: false,
    }
    form.set('metadata', JSON.stringify(metadata))
    form.set('package.json', new Blob(['{}'], { type: 'text/plain' }), 'package.json')
    form.set('package-lock.json', new Blob(['{}'], { type: 'text/plain' }), 'package-lock.json')
    form.set('zeus.js', new Blob([zeusCode], { type: 'application/javascript+module' }), 'zeus.js')
    await cfApi(token, `/accounts/${accountId}/workers/scripts/${d.workerName}`, { method: 'PUT', body: form })
    d.updatedAt = new Date().toISOString()
    await saveState(userDataPath, account)
    emit('ready', 'پنل Zeus بروز شد.')
    return { success: true, error: null }
  } catch (err) {
    emit('error', err.message)
    return { success: false, error: err.message }
  } finally { running = false }
}

async function getZeusStatus({ userDataPath }) {
  const state = await loadState(userDataPath)
  return {
    connected: Boolean(state?.token?.access_token),
    accountName: state?.accountName ?? null,
    deployed: Boolean(state?.deployment?.workerUrl),
    workerUrl: state?.deployment?.workerUrl ?? null,
    workerDomain: state?.deployment?.workerDomain ?? null,
    username: state?.deployment?.username ?? null,
    subUrl: state?.deployment?.subUrl ?? null,
    deployedAt: state?.deployment?.deployedAt ?? null,
  }
}

module.exports = {
  loginCloudflareZeus,
  deployZeusPanel,
  updateZeusPanel,
  getZeusStatus,
  setZeusProgressListener,
}
