'use strict'

const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)

// DoH server definitions
const DOH_SERVERS = {
  cloudflare: {
    primary: '1.1.1.1',
    secondary: '1.0.0.1',
    template: 'https://cloudflare-dns.com/dns-query',
    label: 'Cloudflare (1.1.1.1)',
  },
  google: {
    primary: '8.8.8.8',
    secondary: '8.8.4.4',
    template: 'https://dns.google/dns-query',
    label: 'Google (8.8.8.8)',
  },
}

// Store original DNS per adapter so we can restore
let originalDnsMap = {}
let standaloneActive = false

async function runPS(command) {
  const { stdout, stderr } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', command,
  ], { timeout: 15000 })
  return { stdout: stdout.trim(), stderr: stderr.trim() }
}

// Get all active network adapter names
async function getActiveAdapters() {
  const { stdout } = await runPS(
    `Get-NetAdapter | Where-Object { $_.Status -eq 'Up' } | Select-Object -ExpandProperty Name`
  )
  return stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
}

// Get current DNS servers for an adapter
async function getAdapterDns(adapter) {
  try {
    const { stdout } = await runPS(
      `(Get-DnsClientServerAddress -InterfaceAlias '${adapter}' -AddressFamily IPv4).ServerAddresses -join ','`
    )
    return stdout || ''
  } catch {
    return ''
  }
}

// Enable standalone DoH — changes system DNS + registers DoH template (Win11)
async function enableStandaloneDoH(server) {
  const cfg = DOH_SERVERS[server]
  if (!cfg) throw new Error(`Unknown DoH server: ${server}`)

  const adapters = await getActiveAdapters()
  if (adapters.length === 0) throw new Error('No active network adapters found.')

  // Save originals
  originalDnsMap = {}
  for (const adapter of adapters) {
    originalDnsMap[adapter] = await getAdapterDns(adapter)
  }

  // Set DNS servers — requires Administrator. Throw on failure so the UI can show the error.
  for (const adapter of adapters) {
    const { stderr } = await runPS(
      `Set-DnsClientServerAddress -InterfaceAlias '${adapter}' -ServerAddresses ('${cfg.primary}','${cfg.secondary}') -ErrorAction Stop`
    ).catch((err) => ({ stderr: err?.message ?? 'Access denied' }))

    if (stderr && stderr.length > 0) {
      throw new Error(`Failed to set DNS on "${adapter}": administrator privileges required. Relaunch the app as Administrator and try again.`)
    }

    // Register DoH encryption template (Windows 11 only — silently skipped on Win10)
    await runPS(
      `Add-DnsClientDohServerAddress -ServerAddress '${cfg.primary}' -DohTemplate '${cfg.template}' -AutoUpgrade $true -ErrorAction SilentlyContinue`
    ).catch(() => {})
    await runPS(
      `Add-DnsClientDohServerAddress -ServerAddress '${cfg.secondary}' -DohTemplate '${cfg.template}' -AutoUpgrade $true -ErrorAction SilentlyContinue`
    ).catch(() => {})
  }

  standaloneActive = true
  return { success: true, server, label: cfg.label, error: null }
}

// Restore original DNS
async function disableStandaloneDoH() {
  const adapters = await getActiveAdapters()

  for (const adapter of adapters) {
    const original = originalDnsMap[adapter]
    if (original && original.length > 0) {
      const ips = original.split(',').map(s => s.trim()).filter(Boolean)
      const ipList = ips.map(ip => `'${ip}'`).join(',')
      await runPS(
        `Set-DnsClientServerAddress -InterfaceAlias '${adapter}' -ServerAddresses (${ipList})`
      ).catch(() => {})
    } else {
      // Reset to DHCP/auto
      await runPS(
        `Set-DnsClientServerAddress -InterfaceAlias '${adapter}' -ResetServerAddresses`
      ).catch(() => {})
    }
  }

  originalDnsMap = {}
  standaloneActive = false
  return { success: true, error: null }
}

function getStandaloneStatus() {
  return { active: standaloneActive }
}

module.exports = {
  DOH_SERVERS,
  enableStandaloneDoH,
  disableStandaloneDoH,
  getStandaloneStatus,
}
