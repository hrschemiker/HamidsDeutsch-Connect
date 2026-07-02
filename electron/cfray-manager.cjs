'use strict'

const { execFile, spawn } = require('node:child_process')
const { promisify } = require('node:util')
const path = require('node:path')
const fs = require('node:fs/promises')
const os = require('node:os')

const execFileAsync = promisify(execFile)

// ── Scanner path ──────────────────────────────────────────────────────────────
// In development: electron/cfray/scanner.py (accessible via __dirname)
// In production (asar): asarUnpack extracts it to app.asar.unpacked/electron/cfray/scanner.py

function getScannerPath() {
  const candidate = path.join(__dirname, 'cfray', 'scanner.py')
  // If running from inside an asar bundle, rewrite to the .asar.unpacked sibling path
  if (candidate.includes('.asar' + path.sep) && !candidate.includes('.asar.unpacked')) {
    return candidate.replace(
      '.asar' + path.sep,
      '.asar.unpacked' + path.sep,
    )
  }
  return candidate
}

// ── Python detection ──────────────────────────────────────────────────────────

let _pythonExe = null

function getBundledPythonPath() {
  const { app } = require('electron')
  if (!app) return null
  try {
    const base = app.isPackaged
      ? path.join(process.resourcesPath, 'python')
      : path.join(__dirname, '..', 'resources', 'python')
    const exe = path.join(base, 'python.exe')
    return require('node:fs').existsSync(exe) ? exe : null
  } catch {
    return null
  }
}

async function findPython() {
  if (_pythonExe) return _pythonExe

  // Check bundled Python first (always works without system install)
  const bundled = getBundledPythonPath()
  if (bundled) {
    try {
      const { stdout } = await execFileAsync(bundled, ['--version'], { timeout: 6000 })
      const match = (stdout || '').match(/Python (\d+)\.(\d+)/)
      if (match && parseInt(match[1]) >= 3 && parseInt(match[2]) >= 8) {
        _pythonExe = bundled
        return bundled
      }
    } catch {
      // bundled python broken — fall through to system
    }
  }

  // Fall back to system Python
  const candidates = ['python', 'python3', 'py']
  for (const cmd of candidates) {
    try {
      const { stdout } = await execFileAsync(cmd, ['--version'], { timeout: 6000 })
      const version = (stdout || '').trim()
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

// ── Run cfray against a saved text file of configs ────────────────────────────

/**
 * Given a string of VLESS/VMess URIs (one per line), run cfray speed-test and
 * return the ranked URIs from cfray's output file.
 *
 * timeoutMs: default 4 minutes for quick mode
 */
async function fetchViaCfray(combinedText, timeoutMs = 240000) {
  const python = await findPython()
  if (!python) return []

  const scannerPath = getScannerPath()
  try {
    await fs.access(scannerPath)
  } catch {
    return [] // scanner.py not accessible
  }

  // Isolated temp dir so cfray's results/ folder doesn't collide
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfray-'))
  const inputPath = path.join(tmpDir, 'input.txt')
  const outputPath = path.join(tmpDir, 'top_configs.txt')

  try {
    // Write the combined subscription content as the input file
    await fs.writeFile(inputPath, combinedText, 'utf8')

    await runCfrayProcess(python, scannerPath, inputPath, outputPath, tmpDir, timeoutMs)

    // Read the output (top ranked URIs)
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
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

function runCfrayProcess(python, scannerPath, inputPath, outputPath, cwd, timeoutMs) {
  return new Promise((resolve) => {
    const args = [
      scannerPath,
      '--input', inputPath,
      '--no-tui',
      '--mode', 'quick',     // latency + small download (2-3 min)
      '--top', '20',
      '--output-configs', outputPath,
    ]

    const child = spawn(python, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })

    const timer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch {}
      resolve() // partial results may still be in outputPath
    }, timeoutMs)

    child.on('close', () => { clearTimeout(timer); resolve() })
    child.on('error', () => { clearTimeout(timer); resolve() })
  })
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run cfray against pre-fetched subscription content strings.
 * Returns { uris: string[], source: 'cfray' | 'unavailable' }
 */
async function getCfrayConfigs(texts) {
  if (!texts || texts.length === 0) return { uris: [], source: 'unavailable' }

  const python = await findPython()
  if (!python) return { uris: [], source: 'unavailable' }

  const combined = texts.join('\n')
  const uris = await fetchViaCfray(combined)

  if (uris.length >= 3) {
    return { uris, source: 'cfray' }
  }
  return { uris: [], source: 'unavailable' }
}

/** Returns true if Python 3.8+ is available. */
async function isCfrayAvailable() {
  return (await findPython()) !== null
}

module.exports = {
  getCfrayConfigs,
  isCfrayAvailable,
  findPython,
}
