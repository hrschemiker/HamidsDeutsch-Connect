'use strict'

const path = require('node:path')
const fs = require('node:fs/promises')

const DATA_FILE = 'hidden-nodes.json'
const DATA_DIR = 'HamidsDeutsch-Connect'

function getFilePath() {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), DATA_DIR, DATA_FILE)
}

async function readStore() {
  try {
    const content = await fs.readFile(getFilePath(), 'utf8')
    const parsed = JSON.parse(content)
    if (parsed && Array.isArray(parsed.hidden)) return parsed
  } catch {
    // file missing or corrupt — start fresh
  }
  return { version: 1, hidden: [] }
}

async function writeStore(store) {
  const filePath = getFilePath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}

async function hideNode(compositeId) {
  const store = await readStore()
  if (!store.hidden.includes(compositeId)) {
    store.hidden.push(compositeId)
    await writeStore(store)
  }
  return { success: true }
}

async function unhideNode(compositeId) {
  const store = await readStore()
  store.hidden = store.hidden.filter((id) => id !== compositeId)
  await writeStore(store)
  return { success: true }
}

async function getHiddenNodes() {
  const store = await readStore()
  return store.hidden
}

async function isNodeHidden(compositeId) {
  const store = await readStore()
  return store.hidden.includes(compositeId)
}

module.exports = {
  hideNode,
  unhideNode,
  getHiddenNodes,
  isNodeHidden,
}
