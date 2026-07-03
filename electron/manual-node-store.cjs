'use strict'

const path = require('node:path')
const fs = require('node:fs/promises')
const crypto = require('node:crypto')

const MANUAL_SUBSCRIPTION_ID = '__manual__'
const MANUAL_SUBSCRIPTION_NAME = 'سرورهای دستی'
const DATA_FILE = 'manual-nodes.json'
const DATA_DIR = 'HamidsDeutsch-Connect'

function getFilePath() {
  const { app } = require('electron')
  return path.join(app.getPath('userData'), DATA_DIR, DATA_FILE)
}

async function readStore() {
  try {
    const content = await fs.readFile(getFilePath(), 'utf8')
    const parsed = JSON.parse(content)
    if (parsed && Array.isArray(parsed.nodes)) return parsed
  } catch {
    // file missing or corrupt — start fresh
  }
  return { version: 1, nodes: [] }
}

async function writeStore(store) {
  const filePath = getFilePath()
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.tmp`
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}

async function listManualNodes() {
  const store = await readStore()
  return store.nodes
}

async function addManualNode(uri) {
  if (typeof uri !== 'string' || !uri.trim()) {
    throw new Error('لینک سرور خالی است.')
  }

  const store = await readStore()
  const isDuplicate = store.nodes.some((n) => n.uri === uri.trim())
  if (isDuplicate) throw new Error('این سرور قبلاً اضافه شده است.')

  const node = {
    id: crypto.randomUUID(),
    uri: uri.trim(),
    addedAt: new Date().toISOString(),
  }

  store.nodes.push(node)
  await writeStore(store)
  return node
}

async function removeManualNode(nodeId) {
  const store = await readStore()
  const next = store.nodes.filter((n) => n.id !== nodeId)
  if (next.length === store.nodes.length) throw new Error('سرور پیدا نشد.')
  await writeStore({ ...store, nodes: next })
  return { success: true }
}

async function getManualNodeUri(nodeId) {
  const store = await readStore()
  return store.nodes.find((n) => n.id === nodeId)?.uri ?? null
}

module.exports = {
  MANUAL_SUBSCRIPTION_ID,
  MANUAL_SUBSCRIPTION_NAME,
  listManualNodes,
  addManualNode,
  removeManualNode,
  getManualNodeUri,
}
