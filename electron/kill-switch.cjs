'use strict'

// Kill switch: when the tunnel drops unexpectedly (not via the Disconnect
// button), block ALL device internet until the user reconnects or turns it off —
// like ExpressVPN's Network Lock. Implemented with a Windows Firewall
// block-all-outbound rule (needs admin). A reconnect attempt must explicitly
// release the rule before starting sing-box, otherwise the firewall blocks the
// VPN engine itself and makes recovery impossible.

const path = require('node:path')
const fs = require('node:fs/promises')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const execFileAsync = promisify(execFile)

const RULE_NAME = 'ManfazVPN Kill Switch'
const SETTINGS_FILE = 'kill-switch.json'

let active = false

function settingsPath(userDataPath) {
  return path.join(userDataPath, 'HamidsDeutsch-Connect', SETTINGS_FILE)
}

async function getKillSwitchEnabled(userDataPath) {
  try {
    const raw = await fs.readFile(settingsPath(userDataPath), 'utf8')
    return Boolean(JSON.parse(raw).enabled)
  } catch {
    return false
  }
}

async function setKillSwitchEnabled(userDataPath, enabled) {
  // Do not persist "disabled" while an outbound block is still present.
  // Keeping the setting enabled makes the unresolved state visible and lets
  // the UI ask for elevation instead of silently leaving Windows offline.
  if (!enabled) {
    const release = await deactivateKillSwitch()
    if (!release.success) {
      throw new Error(release.error ?? 'Kill Switch firewall rule could not be removed.')
    }
  }

  const target = settingsPath(userDataPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify({ enabled: Boolean(enabled) }, null, 2), 'utf8')
  return { enabled: Boolean(enabled) }
}

function isKillSwitchActive() {
  return active
}

async function refreshKillSwitchActive() {
  if (process.platform !== 'win32') {
    active = false
    return active
  }

  try {
    const { stdout = '' } = await execFileAsync(
      'netsh',
      ['advfirewall', 'firewall', 'show', 'rule', `name=${RULE_NAME}`],
      { windowsHide: true, timeout: 8000 },
    )
    active = String(stdout).includes(RULE_NAME)
  } catch {
    active = false
  }

  return active
}

/** Block all outbound traffic via a Windows Firewall rule (best-effort). */
async function activateKillSwitch() {
  if (process.platform !== 'win32') return { success: false, error: 'unsupported platform' }
  try {
    // Remove any stale rule first, then add a fresh block-all-outbound rule.
    await execFileAsync('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${RULE_NAME}`], { windowsHide: true, timeout: 8000 }).catch(() => {})
    await execFileAsync('netsh', ['advfirewall', 'firewall', 'add', 'rule', `name=${RULE_NAME}`, 'dir=out', 'action=block', 'enable=yes', 'profile=any'], { windowsHide: true, timeout: 8000 })
    active = true
    return { success: true, error: null }
  } catch (err) {
    active = false
    return { success: false, error: err?.message ?? 'kill switch activation failed (admin required)' }
  }
}

/** Remove the block rule and restore normal internet. */
async function deactivateKillSwitch() {
  if (process.platform !== 'win32') {
    active = false
    return { success: true, error: null }
  }
  try {
    await execFileAsync('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${RULE_NAME}`], { windowsHide: true, timeout: 8000 })
    active = false
    return { success: true, error: null }
  } catch (err) {
    await refreshKillSwitchActive().catch(() => {})
    return { success: false, error: err?.message ?? null }
  }
}

module.exports = {
  getKillSwitchEnabled,
  setKillSwitchEnabled,
  activateKillSwitch,
  deactivateKillSwitch,
  isKillSwitchActive,
  refreshKillSwitchActive,
}
