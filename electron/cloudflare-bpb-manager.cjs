const http = require('node:http')
const crypto = require('node:crypto')
const path = require('node:path')
const fs = require('node:fs/promises')
const { shell, safeStorage } = require('electron')

const CLIENT_ID = '54d11594-84e4-41aa-b438-e81b8fa78ee7'
const REDIRECT_URI = 'http://localhost:8976/oauth/callback'
const AUTH_URL = 'https://dash.cloudflare.com/oauth2/auth'
const TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token'
const API_BASE = 'https://api.cloudflare.com/client/v4'
const WORKER_URL = 'https://github.com/bia-pain-bache/BPB-Worker-Panel/releases/latest/download/worker.js'
const SCOPES = [
  'account:read', 'user:read', 'workers:write', 'workers_kv:write',
  'workers_routes:write', 'workers_scripts:write', 'offline_access',
]

let progressListener = null
let running = false

function setCloudflareBpbProgressListener(listener) {
  progressListener = typeof listener === 'function' ? listener : null
}

function emit(stage, message, extra = {}) {
  try {
    progressListener?.({ stage, message, at: new Date().toISOString(), ...extra })
  } catch {}
}

function statePath(userDataPath) {
  return path.join(userDataPath, 'HamidsDeutsch-Connect', 'bpb', 'cloudflare-account.json')
}

async function loadState(userDataPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(statePath(userDataPath), 'utf8'))
    if (parsed.encryptedToken && safeStorage.isEncryptionAvailable()) {
      parsed.token = JSON.parse(safeStorage.decryptString(Buffer.from(parsed.encryptedToken, 'base64')))
    }
    delete parsed.encryptedToken
    return parsed
  } catch {
    return null
  }
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

async function loginCloudflare({ userDataPath }) {
  if (running) throw new Error('یک عملیات Cloudflare در حال اجراست.')
  running = true
  try {
    emit('login', 'مرورگر Cloudflare باز شد؛ فقط ورود و تأیید دسترسی را انجام بده.')
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
  } finally {
    running = false
  }
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
        res.end('<h2 style="font-family:sans-serif">Cloudflare connected. You can close this window.</h2>')
        clearTimeout(timer); server.close(); resolve(code)
      } catch (error) {
        clearTimeout(timer); server.close(); reject(error)
      }
    })
    server.on('error', reject)
    server.listen(8976, 'localhost')
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
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  })
  const json = await response.json().catch(() => null)
  if (!response.ok || json?.success === false) {
    const message = json?.errors?.map((item) => item.message).join('; ') || `Cloudflare API ${response.status}`
    throw new Error(message)
  }
  return json
}

async function deployBpbPanel({ userDataPath }) {
  if (running) throw new Error('یک عملیات Cloudflare در حال اجراست.')
  running = true
  try {
    const account = await ensureToken(userDataPath)
    const token = account.token.access_token
    const accountId = account.accountId
    const projectName = `hamids-bpb-${randomText(12).toLowerCase()}`
    const kvTitle = `hamids-bpb-kv-${Date.now()}`
    const uuid = crypto.randomUUID()
    const trPass = randomText(32)
    const subPath = randomText(28)

    emit('worker-download', 'در حال دریافت آخرین worker.js رسمی BPB...')
    const workerResponse = await fetch(WORKER_URL, { redirect: 'follow' })
    if (!workerResponse.ok) throw new Error(`دریافت worker.js ناموفق بود (${workerResponse.status}).`)
    const workerBytes = Buffer.from(await workerResponse.arrayBuffer())
    const workerSha256 = crypto.createHash('sha256').update(workerBytes).digest('hex')

    emit('kv', 'در حال ساخت فضای ذخیره‌سازی KV...')
    const kv = await cfApi(token, `/accounts/${accountId}/storage/kv/namespaces`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: kvTitle }),
    })
    const kvId = kv.result.id

    emit('deploy', 'در حال ساخت و انتشار پنل BPB...')
    const form = new FormData()
    const metadata = {
      main_module: 'worker.js',
      compatibility_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      compatibility_flags: ['nodejs_compat'],
      bindings: [
        { name: 'kv', namespace_id: kvId, type: 'kv_namespace' },
        { name: 'UUID', text: uuid, type: 'plain_text' },
        { name: 'TR_PASS', text: trPass, type: 'plain_text' },
        { name: 'SUB_PATH', text: subPath, type: 'plain_text' },
      ],
      observability: { enabled: false }, placement: {}, usage_model: 'standard', tags: [], tail_consumers: [], logpush: false,
    }
    form.set('metadata', JSON.stringify(metadata))
    form.set('package.json', new Blob(['{}'], { type: 'text/plain' }), 'package.json')
    form.set('package-lock.json', new Blob(['{}'], { type: 'text/plain' }), 'package-lock.json')
    form.set('worker.js', new Blob([workerBytes], { type: 'application/javascript+module' }), 'worker.js')

    await cfApi(token, `/accounts/${accountId}/workers/scripts/${projectName}`, { method: 'PUT', body: form })
    await cfApi(token, `/accounts/${accountId}/workers/scripts/${projectName}/subdomain`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true, previews_enabled: false }),
    })
    const subdomain = await cfApi(token, `/accounts/${accountId}/workers/subdomain`)
    const origin = `https://${projectName}.${subdomain.result.subdomain}.workers.dev`
    const panelUrl = `${origin}/panel`
    const suffix = '?app=sing-box'
    const profile = {
      name: 'BPB شخصی', panelUrl, subPath, panelVersion: null, chainEnabled: false,
      normalUrl: `${origin}/sub/normal/${encodeURIComponent(subPath)}${suffix}`,
      fragmentUrl: `${origin}/sub/fragment/${encodeURIComponent(subPath)}${suffix}`,
      rawUrl: `${origin}/sub/raw/${encodeURIComponent(subPath)}${suffix}`,
      warpUrl: `${origin}/sub/warp/${encodeURIComponent(subPath)}${suffix}`,
      activeType: 'raw',
    }
    await saveState(userDataPath, { ...account, deployment: { projectName, kvId, kvTitle, uuid, trPass, subPath, panelUrl, workerSha256, deployedAt: new Date().toISOString() } })
    emit('ready', 'پنل BPB ساخته شد؛ حالا کانفیگ‌ها دریافت می‌شوند.', { panelUrl })
    return { success: true, profile, deployment: { projectName, kvId, panelUrl, workerSha256 }, error: null }
  } finally {
    running = false
  }
}

async function updateBpbPanel({ userDataPath }) {
  const state = await ensureToken(userDataPath)
  if (!state.deployment?.projectName) throw new Error('پنل BPB ساخته‌شده‌ای ثبت نشده است.')
  const workerResponse = await fetch(WORKER_URL, { redirect: 'follow' })
  if (!workerResponse.ok) throw new Error('دریافت نسخه جدید worker.js ناموفق بود.')
  const workerBytes = Buffer.from(await workerResponse.arrayBuffer())
  const form = new FormData()
  const d = state.deployment
  const metadata = {
    main_module: 'worker.js', compatibility_date: new Date(Date.now() - 86400000).toISOString().slice(0,10),
    compatibility_flags: ['nodejs_compat'],
    bindings: [
      { name:'kv', namespace_id:d.kvId, type:'kv_namespace' },
      { name:'UUID', text:d.uuid, type:'plain_text' },
      { name:'TR_PASS', text:d.trPass, type:'plain_text' },
      { name:'SUB_PATH', text:d.subPath, type:'plain_text' },
    ], observability:{enabled:false}, placement:{}, usage_model:'standard', tags:[], tail_consumers:[], logpush:false,
  }
  form.set('metadata', JSON.stringify(metadata))
  form.set('package.json', new Blob(['{}'], {type:'text/plain'}), 'package.json')
  form.set('package-lock.json', new Blob(['{}'], {type:'text/plain'}), 'package-lock.json')
  form.set('worker.js', new Blob([workerBytes], {type:'application/javascript+module'}), 'worker.js')
  await cfApi(state.token.access_token, `/accounts/${state.accountId}/workers/scripts/${d.projectName}`, { method:'PUT', body:form })
  d.workerSha256 = crypto.createHash('sha256').update(workerBytes).digest('hex')
  d.updatedAt = new Date().toISOString()
  await saveState(userDataPath, state)
  return { success:true, panelUrl:d.panelUrl, error:null }
}

async function getCloudflareBpbStatus({ userDataPath }) {
  const state = await loadState(userDataPath)
  return {
    connected: Boolean(state?.token?.access_token),
    accountName: state?.accountName || null,
    deployed: Boolean(state?.deployment?.panelUrl),
    panelUrl: state?.deployment?.panelUrl || null,
    projectName: state?.deployment?.projectName || null,
  }
}

module.exports = {
  loginCloudflare,
  deployBpbPanel,
  updateBpbPanel,
  getCloudflareBpbStatus,
  setCloudflareBpbProgressListener,
}
