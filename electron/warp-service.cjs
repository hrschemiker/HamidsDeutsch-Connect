const crypto = require('node:crypto')
const { net } = require('electron')
const path = require('node:path')
const fs = require('node:fs/promises')

const WARP_API = 'https://api.cloudflareclient.com/v0a2158/reg'
const WARP_PEER_PUBKEY = 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo='
const WARP_ENDPOINT_HOST = 'engage.cloudflareclient.com'
const WARP_ENDPOINT_PORT = 2408

function generateX25519Keypair() {
  const { privateKey: privDer, publicKey: pubDer } = crypto.generateKeyPairSync('x25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
    publicKeyEncoding: { type: 'spki', format: 'der' },
  })
  // Raw key is the last 32 bytes in both DER formats
  const privateKeyB64 = Buffer.from(privDer.slice(-32)).toString('base64')
  const publicKeyB64 = Buffer.from(pubDer.slice(-32)).toString('base64')
  return { privateKeyB64, publicKeyB64 }
}

async function registerWarpAccount({ publicKeyB64 }) {
  const installId = crypto.randomUUID()

  const body = JSON.stringify({
    key: publicKeyB64,
    install_id: installId,
    fcm_token: '',
    tos: new Date().toISOString(),
    type: 'Android',
    model: 'PC',
    locale: 'en_US',
  })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)

  try {
    const res = await net.fetch(WARP_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'okhttp/3.12.1',
        'CF-Client-Version': 'a-6.16-2158',
      },
      body,
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (!res.ok) {
      throw new Error(`WARP API returned HTTP ${res.status}`)
    }

    const data = await res.json()
    return data
  } catch (error) {
    clearTimeout(timer)
    if (error?.name === 'AbortError') throw new Error('WARP registration timed out.')
    throw error
  }
}

async function createWarpAccount() {
  const { privateKeyB64, publicKeyB64 } = generateX25519Keypair()
  const data = await registerWarpAccount({ publicKeyB64 })

  const config = data?.config
  if (!config) throw new Error('WARP API response missing config.')

  const ipv4 = config?.interface?.addresses?.v4
  const ipv6 = config?.interface?.addresses?.v6
  const clientId = config?.client_id || ''
  const reserved = config?.reserved || [0, 0, 0]

  if (!ipv4) throw new Error('WARP API response missing IPv4 address.')

  const peer = config?.peers?.[0]
  const peerPubKey = peer?.public_key || WARP_PEER_PUBKEY
  const endpointRaw = peer?.endpoint?.host || `${WARP_ENDPOINT_HOST}:${WARP_ENDPOINT_PORT}`
  const [endpointHost, endpointPortStr] = endpointRaw.split(':')
  const endpointPort = parseInt(endpointPortStr || String(WARP_ENDPOINT_PORT), 10)

  return {
    privateKey: privateKeyB64,
    publicKey: publicKeyB64,
    peerPublicKey: peerPubKey,
    localAddresses: ipv6 ? [`${ipv4}/32`, `${ipv6}/128`] : [`${ipv4}/32`],
    endpointHost: endpointHost || WARP_ENDPOINT_HOST,
    endpointPort,
    reserved,
    clientId,
    createdAt: new Date().toISOString(),
  }
}

function buildWarpSingboxOutbound(warpAccount) {
  const outbound = {
    type: 'wireguard',
    tag: 'proxy',
    server: warpAccount.endpointHost,
    server_port: warpAccount.endpointPort,
    local_address: warpAccount.localAddresses,
    private_key: warpAccount.privateKey,
    peer_public_key: warpAccount.peerPublicKey,
  }

  if (Array.isArray(warpAccount.reserved) && warpAccount.reserved.length === 3) {
    outbound.reserved = warpAccount.reserved
  }

  return outbound
}

async function loadWarpAccount(userDataPath) {
  const filePath = path.join(userDataPath, 'HamidsDeutsch-Connect', 'warp-account.json')
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function saveWarpAccount(userDataPath, account) {
  const dir = path.join(userDataPath, 'HamidsDeutsch-Connect')
  await fs.mkdir(dir, { recursive: true })
  const filePath = path.join(dir, 'warp-account.json')
  await fs.writeFile(filePath, JSON.stringify(account, null, 2), 'utf8')
}

async function deleteWarpAccount(userDataPath) {
  const filePath = path.join(userDataPath, 'HamidsDeutsch-Connect', 'warp-account.json')
  try {
    await fs.unlink(filePath)
  } catch {
    // Already gone
  }
}

module.exports = {
  createWarpAccount,
  buildWarpSingboxOutbound,
  loadWarpAccount,
  saveWarpAccount,
  deleteWarpAccount,
}
