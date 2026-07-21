'use strict'

// Persisted list of apps that BYPASS the tunnel (split tunneling — "tunnel
// everything except these"). Each entry: { name, processName, path, icon }.

const path = require('node:path')
const fs = require('node:fs/promises')

const DATA_DIR = 'HamidsDeutsch-Connect'
const FILE = 'split-tunnel-apps.json'

function filePath(userDataPath) {
  return path.join(userDataPath, DATA_DIR, FILE)
}

async function getApps(userDataPath) {
  try {
    const raw = await fs.readFile(filePath(userDataPath), 'utf8')
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((a) => a && a.processName) : []
  } catch {
    return []
  }
}

async function saveApps(userDataPath, apps) {
  const target = filePath(userDataPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, JSON.stringify(apps, null, 2), 'utf8')
  return apps
}

async function addApp(userDataPath, app) {
  const apps = await getApps(userDataPath)
  const key = app.processName.toLowerCase()
  if (apps.some((a) => a.processName.toLowerCase() === key)) return apps
  apps.push(app)
  return saveApps(userDataPath, apps)
}

async function removeApp(userDataPath, processName) {
  const apps = await getApps(userDataPath)
  const key = String(processName).toLowerCase()
  return saveApps(userDataPath, apps.filter((a) => a.processName.toLowerCase() !== key))
}

/** Just the process basenames, for the sing-box route rule. */
async function getProcessNames(userDataPath) {
  return (await getApps(userDataPath)).map((a) => a.processName)
}

module.exports = { getApps, addApp, removeApp, getProcessNames }
