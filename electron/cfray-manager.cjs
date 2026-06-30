'use strict'

const { execFile, spawn } = require('node:child_process')
const { promisify } = require('node:util')
const path = require('node:path')
const fs = require('node:fs/promises')
const os = require('node:os')

const execFileAsync = promisify(execFile)

// Path to bundled scanner.py
function getScannerPath() {
  // In production (asar) the electron/ folder is inside app.asar; use __dirname which points there.
  return path.join(__dirname, 'cfray', 'scanner.py')
}

// ── Python detection ──────────────────────────────────────────────────────────

let _pythonExe = null

async function findPython() {
  if (_pythonExe) return _pythonExe

  const candidates = ['python3', 'python', 'py']

  for (const cmd of candidates) {
    try {
      const { stdout } = await execFileAsync(cmd, ['--version'], { timeout: 5000 })
      const version = stdout.trim()
      const match = version.match(/Python (\d+)\.(\d+)/)
      if (match && parseInt(match[1]) >= 3 && parseInt(match[2]) >= 8) {
        _pythonExe = cmd
        return cmd
      }
    } catch {
      // not found or wrong version — try next
    }
  }

  return null
}

// ── Run cfray for one subscription URL ───────────────────────────────────────

// Returns an array of VLESS/VMess URI strings (empty if cfray fails).
// timeoutMs: max time to wait for cfray (default 3 minutes for quick mode)
async function fetchViaCfray(subscriptionUrl, timeoutMs = 180000) {
  const python = await findPython()
  if (!python) return []

  const scannerPath = getScannerPath()
  try {
    await fs.access(scannerPath)
  } catch {
    return [] // scanner.py not found in bundle
  }

  // Run cfray in a per-call temp dir so its results/ folder is isolated
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfray-'))
  const outputPath = path.join(tmpDir, 'top_configs.txt')

  try {
    await runCfrayProcess(python, scannerPath, subscriptionUrl, outputPath, tmpDir, timeoutMs)

    // Read the output file
    try {
      const content = await fs.readFile(outputPath, 'utf8')
      const uris = content
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => /^(vless|vmess|trojan|ss|hysteria2?|hy2|tuic|anytls):\/\//i.test(l))
      return uris
    } catch {
      return []
    }
  } finally {
    // Clean up temp dir (best-effort)
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

function runCfrayProcess(python, scannerPath, subscriptionUrl, outputPath, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const args = [
      scannerPath,
      '--sub', subscriptionUrl,
      '--no-tui',
      '--mode', 'quick',
      '--top', '20',
      '--skip-download',    // latency-only for speed; drop for full speed test
      '--output-configs', outputPath,
    ]

    const child = spawn(python, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch {}
      resolve() // timeout — whatever was written is still usable
    }, timeoutMs)

    child.on('close', () => {
      clearTimeout(timer)
      resolve()
    })

    child.on('error', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Try to get speed-ranked free configs via cfray for the given subscription URLs.
 * Returns { uris: string[], source: 'cfray' | 'unavailable' }
 *
 * Strategy: try each URL in order; stop after the first that returns ≥5 results.
 */
async function getCfrayConfigs(subscriptionUrls) {
  const python = await findPython()
  if (!python) return { uris: [], source: 'unavailable' }

  for (const url of subscriptionUrls) {
    try {
      const uris = await fetchViaCfray(url)
      if (uris.length >= 5) {
        return { uris, source: 'cfray' }
      }
    } catch {
      // try next
    }
  }

  return { uris: [], source: 'unavailable' }
}

/** Returns true if Python 3.8+ is available for cfray. */
async function isCfrayAvailable() {
  const python = await findPython()
  return python !== null
}

module.exports = {
  getCfrayConfigs,
  isCfrayAvailable,
  findPython,
}
