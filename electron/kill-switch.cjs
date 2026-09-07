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
let armed = false

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

function setKillSwitchArmed(value) {
  armed = value === true
  return armed
}

function isKillSwitchArmed() {
  return armed
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

/**
 * Block all outbound traffic via a Windows Firewall rule.
 *
 * `force` bypasses the armed check for the drop handler, which disarms first so
 * a second exit event cannot trigger a second activation.
 */
async function activateKillSwitch({ force = false } = {}) {
  if (process.platform !== 'win32') return { success: false, error: 'unsupported platform' }
  if (!force && !armed) return { success: false, skipped: true, error: 'kill switch is not armed' }
  try {
    // `netsh delete rule` exits non-zero when the rule does not exist. Treat
    // absence as the desired state instead of surfacing a false command error.
    if (await refreshKillSwitchActive()) {
      await execFileAsync('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${RULE_NAME}`], { windowsHide: true, timeout: 8000 })
    }
    await execFileAsync('netsh', ['advfirewall', 'firewall', 'add', 'rule', `name=${RULE_NAME}`, 'dir=out', 'action=block', 'enable=yes', 'profile=any'], { windowsHide: true, timeout: 8000 })
    // Trust the rule listing, not the exit code: netsh can report success while
    // silently refusing the rule when the process is not elevated.
    const confirmed = await refreshKillSwitchActive()
    if (!confirmed) {
      return {
        success: false,
        error: 'Windows Firewall did not accept the block rule. Run Manfaz VPN as Administrator.',
      }
    }
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
    if (!(await refreshKillSwitchActive())) {
      active = false
      return { success: true, error: null, alreadyInactive: true }
    }
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
  setKillSwitchArmed,
  isKillSwitchArmed,
  refreshKillSwitchActive,
}
