'use strict'

const path = require('node:path')
const fs = require('node:fs/promises')
const net = require('node:net')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const STATE_FILE = 'dns-system-state.json'

const DNS_SERVERS = {
  cloudflare: {
    primary: '1.1.1.1',
    secondary: '1.0.0.1',
    template: 'https://cloudflare-dns.com/dns-query',
    label: 'Cloudflare',
    encrypted: true,
  },
  'cloudflare-family': {
    primary: '1.1.1.3',
    secondary: '1.0.0.3',
    template: 'https://family.cloudflare-dns.com/dns-query',
    label: 'Cloudflare Family',
    encrypted: true,
  },
  google: {
    primary: '8.8.8.8',
    secondary: '8.8.4.4',
    template: 'https://dns.google/dns-query',
    label: 'Google',
    encrypted: true,
  },
  adguard: {
    primary: '94.140.14.14',
    secondary: '94.140.15.15',
    template: 'https://dns.adguard-dns.com/dns-query',
    label: 'AdGuard',
    encrypted: true,
  },
  shecan: {
    primary: '178.22.122.100',
    secondary: '185.51.200.2',
    template: null,
    label: 'Shecan',
    encrypted: false,
  },
  radar: {
    primary: '10.202.10.10',
    secondary: '10.202.10.11',
    template: null,
    label: 'Radar Game',
    encrypted: false,
  },
  electro: {
    primary: '78.157.42.100',
    secondary: '78.157.42.101',
    template: null,
    label: 'Electro',
    encrypted: false,
  },
}

// Backwards-compatible export name used by older callers.
const DOH_SERVERS = DNS_SERVERS

let originalDnsMap = {}
let standaloneActive = false
let activeConfig = null
let statePath = null

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function getStatePath(userDataPath) {
  return path.join(userDataPath, 'HamidsDeutsch-Connect', STATE_FILE)
}

async function runPS(command, timeout = 20000) {
  const { stdout, stderr } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', command,
  ], { timeout, windowsHide: true })
  return { stdout: stdout.trim(), stderr: stderr.trim() }
}

async function getActiveAdapters() {
  const { stdout } = await runPS(
    `Get-NetAdapter | Where-Object { $_.Status -eq 'Up' -and $_.Name -ne 'HamidsDeutsch' } | Select-Object -ExpandProperty Name`,
  )
  return stdout.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
}

async function getAdapterDns(adapter) {
  try {
    const { stdout } = await runPS(
      `(Get-DnsClientServerAddress -InterfaceAlias ${psQuote(adapter)} -AddressFamily IPv4).ServerAddresses -join ','`,
    )
    return stdout || ''
  } catch {
    return ''
  }
}

function normalizeCustomConfig(custom) {
  const primary = String(custom?.primary ?? '').trim()
  const secondary = String(custom?.secondary ?? '').trim()
  if (net.isIP(primary) !== 4) {
    throw new Error('Primary DNS must be a valid IPv4 address.')
  }
  if (secondary && net.isIP(secondary) !== 4) {
    throw new Error('Secondary DNS must be a valid IPv4 address.')
  }
  if (secondary && secondary === primary) {
    throw new Error('Primary and secondary DNS addresses must be different.')
  }
  return {
    primary,
    secondary: secondary || null,
    template: null,
    label: String(custom?.label ?? 'Custom DNS').trim().slice(0, 60) || 'Custom DNS',
    encrypted: false,
  }
}

function resolveConfig(server, custom) {
  if (server === 'custom') return normalizeCustomConfig(custom)
  const preset = DNS_SERVERS[server]
  if (!preset) throw new Error(`Unknown DNS server: ${server}`)
  return { ...preset }
}

async function testDnsAddress(address) {
  try {
    const { stdout } = await runPS(
      `$answer = Resolve-DnsName -Name 'example.com' -Server ${psQuote(address)} -DnsOnly -QuickTimeout -ErrorAction Stop | Where-Object { $_.Type -eq 'A' } | Select-Object -First 1 -ExpandProperty IPAddress; if (-not $answer) { throw 'No A record returned' }; $answer`,
      12000,
    )
    return { address, success: Boolean(stdout), answer: stdout || null, error: null }
  } catch (error) {
    return {
      address,
      success: false,
      answer: null,
      error: error instanceof Error ? error.message : 'DNS query failed.',
    }
  }
}

async function testDnsConfig(server, custom = null) {
  const config = resolveConfig(server, custom)
  const addresses = [config.primary, config.secondary].filter(Boolean)
  const results = await Promise.all(addresses.map(testDnsAddress))
  return {
    success: results.some((result) => result.success),
    config,
    results,
    error: results.some((result) => result.success)
      ? null
      : 'The selected DNS servers did not answer a real DNS query.',
  }
}

async function writeState() {
  if (!statePath) return
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  await fs.writeFile(statePath, JSON.stringify({
    originalDnsMap,
    activeConfig,
    savedAt: new Date().toISOString(),
  }, null, 2), 'utf8')
}

async function initializeDnsManager(userDataPath) {
  statePath = getStatePath(userDataPath)
  try {
    const saved = JSON.parse(await fs.readFile(statePath, 'utf8'))
    originalDnsMap = saved?.originalDnsMap && typeof saved.originalDnsMap === 'object'
      ? saved.originalDnsMap
      : {}
    activeConfig = saved?.activeConfig ?? null
    standaloneActive = Boolean(activeConfig && Object.keys(originalDnsMap).length > 0)
    if (standaloneActive) {
      const expected = [activeConfig.primary, activeConfig.secondary].filter(Boolean)
      const adapters = await getActiveAdapters()
      const appliedEverywhere = adapters.length > 0 && (
        await Promise.all(adapters.map(async (adapter) => {
          const current = (await getAdapterDns(adapter)).split(',').map((value) => value.trim()).filter(Boolean)
          return expected.every((address, index) => current[index] === address)
        }))
      ).every(Boolean)
      standaloneActive = appliedEverywhere
    }
  } catch {
    originalDnsMap = {}
    activeConfig = null
    standaloneActive = false
  }
  return getStandaloneStatus()
}

async function restoreDnsMap(dnsMap) {
  const adapters = await getActiveAdapters()
  for (const adapter of adapters) {
    const original = dnsMap[adapter]
    if (original && original.length > 0) {
      const ipList = original.split(',').map((ip) => ip.trim()).filter(Boolean).map(psQuote).join(',')
      await runPS(
        `Set-DnsClientServerAddress -InterfaceAlias ${psQuote(adapter)} -ServerAddresses (${ipList}) -ErrorAction Stop`,
      )
    } else {
      await runPS(
        `Set-DnsClientServerAddress -InterfaceAlias ${psQuote(adapter)} -ResetServerAddresses -ErrorAction Stop`,
      )
    }
  }
}

async function enableStandaloneDoH(server, custom = null, userDataPath = null) {
  if (userDataPath && !statePath) await initializeDnsManager(userDataPath)
  const test = await testDnsConfig(server, custom)
  if (!test.success) throw new Error(test.error)
  const config = test.config
  const adapters = await getActiveAdapters()
  if (adapters.length === 0) throw new Error('No active network adapters found.')

  // Capture the DHCP/manual baseline only once. Switching presets must not
  // overwrite the real original values with another Manfaz-managed DNS.
  if (Object.keys(originalDnsMap).length === 0) {
    for (const adapter of adapters) {
      originalDnsMap[adapter] = await getAdapterDns(adapter)
    }
  }

  const addresses = [config.primary, config.secondary].filter(Boolean)
  const addressList = addresses.map(psQuote).join(',')
  try {
    for (const adapter of adapters) {
      await runPS(
        `Set-DnsClientServerAddress -InterfaceAlias ${psQuote(adapter)} -ServerAddresses (${addressList}) -ErrorAction Stop`,
      )
      const applied = (await getAdapterDns(adapter)).split(',').map((value) => value.trim()).filter(Boolean)
      if (addresses.some((address, index) => applied[index] !== address)) {
        throw new Error(`Windows did not apply the requested DNS addresses on "${adapter}".`)
      }
    }

    if (config.template) {
      for (const address of addresses) {
        await runPS(
          `Add-DnsClientDohServerAddress -ServerAddress ${psQuote(address)} -DohTemplate ${psQuote(config.template)} -AutoUpgrade $true -ErrorAction SilentlyContinue`,
        ).catch(() => {})
      }
    }

    activeConfig = { server, ...config }
    standaloneActive = true
    await writeState()
    await runPS('Clear-DnsClientCache -ErrorAction SilentlyContinue').catch(() => {})
    return { success: true, server, config: activeConfig, test: test.results, error: null }
  } catch (error) {
    await restoreDnsMap(originalDnsMap).catch(() => {})
    standaloneActive = false
    activeConfig = null
    throw error
  }
}

async function disableStandaloneDoH(userDataPath = null) {
  if (userDataPath && !statePath) await initializeDnsManager(userDataPath)
  if (Object.keys(originalDnsMap).length === 0) {
    standaloneActive = false
    activeConfig = null
    if (statePath) await fs.rm(statePath, { force: true }).catch(() => {})
    return { success: true, alreadyInactive: true, error: null }
  }
  await restoreDnsMap(originalDnsMap)
  originalDnsMap = {}
  standaloneActive = false
  activeConfig = null
  if (statePath) await fs.rm(statePath, { force: true }).catch(() => {})
  await runPS('Clear-DnsClientCache -ErrorAction SilentlyContinue').catch(() => {})
  return { success: true, error: null }
}

function getStandaloneStatus() {
  return { active: standaloneActive, config: activeConfig }
}

module.exports = {
  DNS_SERVERS,
  DOH_SERVERS,
  initializeDnsManager,
  enableStandaloneDoH,
  disableStandaloneDoH,
  testDnsConfig,
  getStandaloneStatus,
}
