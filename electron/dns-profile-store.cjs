'use strict'

const path = require('node:path')
const fs = require('node:fs/promises')
const net = require('node:net')
const crypto = require('node:crypto')

const FILE_NAME = 'dns-profiles.json'
const MAX_PROFILES = 50

function filePath(userDataPath) {
  return path.join(userDataPath, 'HamidsDeutsch-Connect', FILE_NAME)
}

function normalizeProfile(value) {
  const primary = String(value?.primary ?? '').trim()
  const secondary = String(value?.secondary ?? '').trim()
  if (net.isIP(primary) !== 4) throw new Error('Primary DNS must be a valid IPv4 address.')
  if (secondary && net.isIP(secondary) !== 4) throw new Error('Secondary DNS must be a valid IPv4 address.')
  if (secondary && secondary === primary) throw new Error('Primary and secondary DNS addresses must be different.')
  return {
    id: String(value?.id || `custom-${crypto.randomUUID()}`).slice(0, 100),
    name: String(value?.name || `DNS ${primary}`).trim().slice(0, 40) || `DNS ${primary}`,
    primary,
    secondary,
  }
}

async function listDnsProfiles(userDataPath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath(userDataPath), 'utf8'))
    if (!Array.isArray(parsed)) return []
    const profiles = []
    for (const item of parsed.slice(0, MAX_PROFILES)) {
      try { profiles.push(normalizeProfile(item)) } catch {}
    }
    return profiles
  } catch {
    return []
  }
}

async function saveDnsProfiles(userDataPath, profiles) {
  if (!Array.isArray(profiles)) throw new Error('DNS profile list is invalid.')
  const normalized = profiles.slice(0, MAX_PROFILES).map(normalizeProfile)
  const unique = []
  const seen = new Set()
  for (const profile of normalized) {
    const key = `${profile.primary}|${profile.secondary}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(profile)
  }
  const target = filePath(userDataPath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  const temporary = `${target}.tmp`
  await fs.writeFile(temporary, JSON.stringify(unique, null, 2), 'utf8')
  await fs.rename(temporary, target)
  return unique
}

module.exports = { listDnsProfiles, saveDnsProfiles }
