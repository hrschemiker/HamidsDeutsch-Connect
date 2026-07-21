'use strict'

// Kill switch: when the tunnel drops unexpectedly (not via the Disconnect
// button), block ALL device internet until the user reconnects or turns it off —
// like ExpressVPN's Network Lock. Implemented with a Windows Firewall
// block-all-outbound rule (needs admin); falls back to a dead system proxy.

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
  const target = settingsPath(userDataPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify({ enabled: Boolean(enabled) }, null, 2), 'utf8')
  // Turning the feature off should also lift any active block.
  if (!enabled) await deactivateKillSwitch()
  return { enabled: Boolean(enabled) }
}

function isKillSwitchActive() {
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
    active = true // keep the "armed" state; the caller also enforces a dead proxy
    return { success: false, error: err?.message ?? 'kill switch activation failed (admin required)' }
  }
}

/** Remove the block rule and restore normal internet. */
async function deactivateKillSwitch() {
  active = false
  if (process.platform !== 'win32') return { success: true, error: null }
  try {
    await execFileAsync('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${RULE_NAME}`], { windowsHide: true, timeout: 8000 })
    return { success: true, error: null }
  } catch (err) {
    return { success: false, error: err?.message ?? null }
  }
}

module.exports = {
  getKillSwitchEnabled,
  setKillSwitchEnabled,
  activateKillSwitch,
  deactivateKillSwitch,
  isKillSwitchActive,
}
