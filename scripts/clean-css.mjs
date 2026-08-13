// Removes CSS rules whose selectors reference only classes that never appear
// in the app's TSX, then removes orphaned @keyframes. Preserves original text.
//
// Class extraction is deliberately broad: className="...", className={`...`}
// (static parts AND string literals inside interpolations), plus every quoted
// string literal in the TSX (covers classes built dynamically, e.g.
// `server-status-${...}` where the values are string literals elsewhere).
// Over-extraction only keeps a few extra rules; under-extraction is the danger.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const CSS_PATH = 'src/App.css'

const used = new Set()
const CLASS_TOKEN = /[a-zA-Z][a-zA-Z0-9_-]*/g

// Classes assembled at runtime from prefixes (never appear whole in TSX).
const KEEP_PREFIXES = ['update-state-', 'diagnostic-log-']
function isAllowed(c) {
  return KEEP_PREFIXES.some((p) => c.startsWith(p))
}

function addTokens(text) {
  for (const tok of text.matchAll(CLASS_TOKEN)) used.add(tok[0])
}

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full)
    else if (entry.endsWith('.tsx')) {
      const text = readFileSync(full, 'utf8')
      // className="..." and className={`...`}
      const re = /className=\s*(?:"([^"]*)"|`([^`]*)`|\{`([^`]*)`\})/g
      let m
      while ((m = re.exec(text))) {
        const chunk = m[1] ?? m[2] ?? m[3] ?? ''
        addTokens(chunk)
        // string literals inside template interpolations
        for (const lit of chunk.matchAll(/['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]/g)) used.add(lit[1])
      }
      // every quoted string literal in the file (catches dynamic class values)
      for (const lit of text.matchAll(/['"]([a-zA-Z][a-zA-Z0-9_-]*)['"]/g)) used.add(lit[1])
    }
  }
}
walk('src')

const src = readFileSync(CSS_PATH, 'utf8')

function topLevelChunks(css) {
  const chunks = []
  let i = 0
  while (i < css.length) {
    const open = css.indexOf('{', i)
    if (open === -1) { chunks.push({ text: css.slice(i) }); break }
    let depth = 0
    let j = open
    for (; j < css.length; j++) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') { depth--; if (depth === 0) break }
    }
    const end = j + 1
    const selector = css.slice(i, open).trim()
    chunks.push({ text: css.slice(i, end), selector, body: css.slice(open + 1, j), start: i, end })
    i = end
  }
  return chunks
}

const chunks = topLevelChunks(src)
const classesRe = /\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)/g
function classesIn(selector) {
  const out = new Set()
  let m
  while ((m = classesRe.exec(selector))) out.add(m[1])
  return out
}

function deletable(selector) {
  const parts = selector.split(',').map((s) => s.trim()).filter(Boolean)
  if (parts.length === 0) return false
  return parts.every((part) => {
    const cls = [...classesIn(part)]
    if (cls.length === 0) return false
    return cls.every((c) => !used.has(c) && !isAllowed(c))
  })
}

let removed = 0
const out = []
for (const chunk of chunks) {
  if (chunk.selector === undefined) { out.push(chunk); continue }
  const sel = chunk.selector
  if (sel.startsWith('@media') || sel.startsWith('@supports')) {
    const inner = topLevelChunks(chunk.body)
    let innerOut = []
    let dirty = false
    for (const sub of inner) {
      if (sub.selector !== undefined && deletable(sub.selector)) { removed++; dirty = true; continue }
      innerOut.push(sub)
    }
    if (dirty) {
      const rebuilt = innerOut.map((s) => s.text).join('')
      if (rebuilt.trim() === '') { removed++; continue }
      out.push({ text: sel + '{' + rebuilt + '}' })
    } else {
      out.push(chunk)
    }
    continue
  }
  if (sel.startsWith('@keyframes')) { out.push(chunk); continue }
  if (deletable(sel)) { removed++; continue }
  out.push(chunk)
}

let result = out.map((c) => c.text).join('')

// Drop unreferenced @keyframes.
const kfRe = /@keyframes\s+([a-zA-Z0-9_-]+)/g
const names = new Set()
let m
while ((m = kfRe.exec(result))) names.add(m[1])
for (const name of names) {
  const refRe = new RegExp(`animation(?:-name)?\\s*:\\s*[^;]*\\b${name}\\b`, 'g')
  if (refRe.test(result.replace(new RegExp(`@keyframes\\s+${name}\\b[\\s\\S]*?\\n\\}`), ''))) continue
  result = result.replace(new RegExp(`@keyframes\\s+${name}\\b[\\s\\S]*?\\n\\}`), '')
}

writeFileSync(CSS_PATH, result)
console.log(`removed rules: ${removed}`)
