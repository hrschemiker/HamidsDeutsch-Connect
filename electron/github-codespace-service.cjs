const { net } = require('electron')

const GITHUB_API = 'https://api.github.com'
const PROXY_REPO_NAME = 'hd-proxy-node'
const API_TIMEOUT_MS = 30000

// ── Embedded devcontainer file contents ─────────────────────────────────────

const DOCKERFILE = `FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y \\
    curl unzip ca-certificates tmux sudo uuid-runtime \\
    && rm -rf /var/lib/apt/lists/*
COPY setup.sh /usr/local/bin/setup.sh
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/setup.sh /usr/local/bin/start.sh
`

const SETUP_SH = `#!/bin/bash
set -e
echo "[hd-proxy] Installing xray..."
XRAY_VERSION=$(curl -sf https://api.github.com/repos/XTLS/Xray-core/releases/latest \\
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['tag_name'])" 2>/dev/null || echo "v26.3.27")
curl -fsSL -o /tmp/xray.zip \\
  "https://github.com/XTLS/Xray-core/releases/download/\${XRAY_VERSION}/Xray-linux-64.zip"
unzip -o /tmp/xray.zip xray -d /tmp/xray-bin
sudo install -m 755 /tmp/xray-bin/xray /usr/local/bin/xray
rm -rf /tmp/xray.zip /tmp/xray-bin
echo "[hd-proxy] Done: $(/usr/local/bin/xray version 2>/dev/null | head -1)"
`

const START_SH = `#!/bin/bash
# Copy latest config from workspace (in case it was updated for a new UUID)
WORKSPACE_CONFIG=$(find /workspaces -name config.json -path "*/.devcontainer/*" 2>/dev/null | head -1)
if [ -n "$WORKSPACE_CONFIG" ]; then
  sudo mkdir -p /etc/xray
  sudo cp "$WORKSPACE_CONFIG" /etc/xray/config.json
fi

if [ ! -f /etc/xray/config.json ]; then
  echo "[hd-proxy] ERROR: /etc/xray/config.json not found" >&2
  exit 1
fi

tmux kill-session -t hd-proxy 2>/dev/null || true
tmux new-session -d -s hd-proxy "sudo /usr/local/bin/xray run -c /etc/xray/config.json &>/tmp/xray.log"
sleep 2
if ! tmux has-session -t hd-proxy 2>/dev/null; then
  echo "[hd-proxy] ERROR: xray failed to start, check /tmp/xray.log" >&2
  cat /tmp/xray.log >&2 || true
  exit 1
fi
echo "[hd-proxy] Xray running on port 443"
`

const DEVCONTAINER_JSON = JSON.stringify({
  name: 'HD Proxy Node',
  build: { dockerfile: 'Dockerfile', context: '.' },
  features: {
    'ghcr.io/devcontainers/features/common-utils:2': { installZsh: false },
    'ghcr.io/devcontainers/features/github-cli:1': { version: 'latest' },
  },
  forwardPorts: [443],
  portsAttributes: {
    '443': { label: 'proxy', protocol: 'http', onAutoForward: 'silent' },
  },
  onCreateCommand: '/bin/bash /usr/local/bin/setup.sh',
  postStartCommand: '/bin/bash /usr/local/bin/start.sh',
  hostRequirements: { cpus: 2 },
}, null, 2)

// ── Helper ───────────────────────────────────────────────────────────────────

function buildConfigJson(uuid) {
  return JSON.stringify({
    log: { loglevel: 'warning', error: '/tmp/xray-error.log' },
    inbounds: [{
      port: 443,
      protocol: 'vless',
      settings: {
        clients: [{ id: uuid, level: 0 }],
        decryption: 'none',
      },
      streamSettings: {
        network: 'ws',
        security: 'none',
        wsSettings: { path: '/' },
      },
    }],
    outbounds: [
      { protocol: 'freedom', tag: 'direct' },
      {
        protocol: 'blackhole',
        tag: 'blocked',
        settings: { response: { type: 'http' } },
      },
    ],
    routing: {
      rules: [
        { type: 'field', ip: ['geoip:private'], outboundTag: 'blocked' },
        { type: 'field', protocol: ['bittorrent'], outboundTag: 'blocked' },
      ],
    },
  }, null, 2)
}

async function githubRequest(method, path, token, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

  try {
    const response = await net.fetch(`${GITHUB_API}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
        'User-Agent': 'HamidsDeutsch-Connect',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })

    const text = await response.text()
    let data = null
    try { data = JSON.parse(text) } catch { data = null }

    return { ok: response.ok, status: response.status, data, headers: response.headers }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('زمان درخواست GitHub API بیش از حد شد.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

async function validateToken(token) {
  const { ok, data, headers } = await githubRequest('GET', '/user', token)
  if (!ok) {
    throw new Error('توکن GitHub معتبر نیست یا دسترسی کافی ندارد.')
  }

  // Classic tokens report their granted scopes in this header. Verify the two we
  // need are present and tell the user exactly which one is missing.
  const scopeHeader = headers?.get?.('x-oauth-scopes')
  if (typeof scopeHeader === 'string') {
    const scopes = scopeHeader.split(',').map((s) => s.trim()).filter(Boolean)
    const hasRepo = scopes.includes('repo')
    const hasCodespace = scopes.includes('codespace') || scopes.includes('codespaces')
    const missing = []
    if (!hasRepo) missing.push('repo')
    if (!hasCodespace) missing.push('codespace')
    if (missing.length > 0) {
      throw new Error(
        `توکن GitHub این دسترسی‌ها را ندارد: ${missing.join(', ')}. ` +
        `یک توکن classic با هر دو اسکوپ «repo» و «codespace» بساز.`,
      )
    }
  }

  return { username: data.login, name: data.name ?? data.login }
}

async function repoExists(token, owner) {
  const { ok } = await githubRequest('GET', `/repos/${owner}/${PROXY_REPO_NAME}`, token)
  return ok
}

async function createRepo(token) {
  const { ok, data } = await githubRequest('POST', '/user/repos', token, {
    name: PROXY_REPO_NAME,
    description: 'HD Connect proxy node — auto-managed, do not modify',
    private: true,
    auto_init: false,
  })

  if (!ok) {
    const msg = data?.message ?? 'ساخت مخزن GitHub ناموفق بود.'
    if (msg.toLowerCase().includes('already exists')) return
    throw new Error(msg)
  }
}

async function getFileSha(token, owner, filePath) {
  const { ok, data } = await githubRequest(
    'GET',
    `/repos/${owner}/${PROXY_REPO_NAME}/contents/${filePath}`,
    token,
  )
  if (!ok) return null
  return data?.sha ?? null
}

async function upsertFile(token, owner, filePath, content, commitMsg) {
  const sha = await getFileSha(token, owner, filePath)
  const body = {
    message: commitMsg,
    content: Buffer.from(content, 'utf8').toString('base64'),
  }
  if (sha) body.sha = sha

  const { ok, data } = await githubRequest(
    'PUT',
    `/repos/${owner}/${PROXY_REPO_NAME}/contents/${filePath}`,
    token,
    body,
  )

  if (!ok) {
    throw new Error(data?.message ?? `آپلود فایل ${filePath} ناموفق بود.`)
  }
}

async function pushDevcontainerFiles(token, owner, uuid) {
  const configJson = buildConfigJson(uuid)

  await upsertFile(token, owner, '.devcontainer/Dockerfile', DOCKERFILE, 'chore: update Dockerfile')
  await upsertFile(token, owner, '.devcontainer/setup.sh', SETUP_SH, 'chore: update setup.sh')
  await upsertFile(token, owner, '.devcontainer/start.sh', START_SH, 'chore: update start.sh')
  await upsertFile(token, owner, '.devcontainer/devcontainer.json', DEVCONTAINER_JSON, 'chore: update devcontainer.json')
  await upsertFile(token, owner, '.devcontainer/config.json', configJson, `chore: update config uuid`)
}

async function createCodespace(token, owner) {
  const { ok, data } = await githubRequest(
    'POST',
    `/repos/${owner}/${PROXY_REPO_NAME}/codespaces`,
    token,
    {},
  )

  if (!ok) {
    throw new Error(data?.message ?? 'ساخت Codespace ناموفق بود.')
  }

  return { name: data.name, state: data.state }
}

async function getCodespace(token, name) {
  const { ok, data } = await githubRequest('GET', `/user/codespaces/${name}`, token)
  if (!ok) return null
  return { name: data.name, state: data.state, webUrl: data.web_url }
}

async function startCodespace(token, name) {
  const { ok, data } = await githubRequest('POST', `/user/codespaces/${name}/start`, token)
  if (!ok) {
    throw new Error(data?.message ?? 'راه‌اندازی مجدد Codespace ناموفق بود.')
  }
  return { name: data.name, state: data.state }
}

async function stopCodespace(token, name) {
  const { ok } = await githubRequest('POST', `/user/codespaces/${name}/stop`, token)
  return ok
}

async function deleteCodespace(token, name) {
  const { ok } = await githubRequest('DELETE', `/user/codespaces/${name}`, token)
  return ok
}

async function setPortPublic(token, name, port) {
  const { ok } = await githubRequest(
    'PATCH',
    `/user/codespaces/${name}/ports/${port}`,
    token,
    { visibility: 'public' },
  )
  return ok
}

async function listCodespacesForRepo(token, owner) {
  const { ok, data } = await githubRequest(
    'GET',
    `/repos/${owner}/${PROXY_REPO_NAME}/codespaces`,
    token,
  )
  if (!ok) return []
  return (data?.codespaces ?? []).map((cs) => ({
    name: cs.name,
    state: cs.state,
  }))
}

function buildVlessHost(codespaceName) {
  return `${codespaceName}-443.app.github.dev`
}

function buildSingboxOutbound(uuid, codespaceName) {
  const host = buildVlessHost(codespaceName)
  return {
    type: 'vless',
    tag: 'proxy',
    server: host,
    server_port: 443,
    uuid,
    tls: {
      enabled: true,
      server_name: host,
      utls: { enabled: true, fingerprint: 'chrome' },
    },
    transport: {
      type: 'ws',
      path: '/',
    },
  }
}

module.exports = {
  PROXY_REPO_NAME,
  validateToken,
  repoExists,
  createRepo,
  pushDevcontainerFiles,
  createCodespace,
  getCodespace,
  startCodespace,
  stopCodespace,
  deleteCodespace,
  setPortPublic,
  listCodespacesForRepo,
  buildVlessHost,
  buildSingboxOutbound,
}
