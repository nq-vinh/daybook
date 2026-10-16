import { createHash } from 'node:crypto'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const BUDGET_GZIP_BYTES = 85 * 1024
const ALLOWED_DEPENDENCIES = ['react', 'react-dom']

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const distDirectory = join(projectRoot, 'dist')
const failures = []

const packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8'))
const dependencies = Object.keys(packageJson.dependencies ?? {})
const unexpectedDependencies = dependencies.filter((name) => !ALLOWED_DEPENDENCIES.includes(name))

if (dependencies.length > ALLOWED_DEPENDENCIES.length || unexpectedDependencies.length > 0) {
  failures.push(`Runtime dependencies must be ${ALLOWED_DEPENDENCIES.join(' and ')} only, found: ${dependencies.join(', ')}`)
}

console.log(`Runtime dependencies: ${String(dependencies.length)} (${dependencies.join(', ')})`)

const html = await readFile(join(distDirectory, 'index.html'), 'utf8').catch(() => {
  throw new Error('dist/index.html was not found. Run npm run build first.')
})

const deployedConfig = JSON.parse(await readFile(join(distDirectory, 'staticwebapp.config.json'), 'utf8'))
const contentSecurityPolicy = deployedConfig.globalHeaders?.['Content-Security-Policy'] ?? ''
const allowedScriptHashes = new Set([...contentSecurityPolicy.matchAll(/'sha256-([A-Za-z0-9+/=]+)'/g)].map((match) => match[1]))
const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
  .map((match) => match[1] ?? '')
  .filter((body) => body.trim() !== '')

if (inlineScripts.length !== 1) {
  failures.push(`dist/index.html must contain exactly one inline <script> (the theme bootstrap), found ${String(inlineScripts.length)}.`)
}

for (const body of inlineScripts) {
  const hash = createHash('sha256').update(body).digest('base64')

  if (!allowedScriptHashes.has(hash)) {
    failures.push(`dist/index.html has an inline <script> whose hash sha256-${hash} is not in the CSP script-src.`)
  }
}

if (/<style\b/i.test(html)) {
  failures.push('dist/index.html contains a <style> element.')
}

if (/\sstyle\s*=/i.test(html)) {
  failures.push('dist/index.html contains a style attribute.')
}

if (/\son[a-z]+\s*=/i.test(html)) {
  failures.push('dist/index.html contains an inline event handler attribute.')
}

const manifest = JSON.parse(await readFile(join(distDirectory, '.vite/manifest.json'), 'utf8').catch(() => {
  throw new Error('dist/.vite/manifest.json was not found. Enable build.manifest and run npm run build.')
}))
const entryKeys = Object.keys(manifest).filter((key) => manifest[key].isEntry === true)
const initialChunkKeys = new Set()
const pendingKeys = [...entryKeys]

while (pendingKeys.length > 0) {
  const key = pendingKeys.pop()

  if (initialChunkKeys.has(key)) {
    continue
  }

  initialChunkKeys.add(key)
  pendingKeys.push(...(manifest[key].imports ?? []))
}

const initialJavascript = [...initialChunkKeys].map((key) => manifest[key].file)

if (entryKeys.length === 0) {
  failures.push('dist/.vite/manifest.json has no entry chunk.')
}

for (const key of entryKeys) {
  if (!html.includes(`/${manifest[key].file}`)) {
    failures.push(`dist/index.html does not reference the entry chunk ${manifest[key].file}.`)
  }
}

let totalBytes = 0
let totalGzipBytes = 0

for (const source of initialJavascript) {
  const contents = await readFile(join(distDirectory, source))
  const gzipBytes = gzipSync(contents).byteLength

  totalBytes += contents.byteLength
  totalGzipBytes += gzipBytes
  console.log(`${source}: ${String(contents.byteLength)} bytes, ${String(gzipBytes)} bytes gzip`)
}

console.log(`Initial JavaScript: ${String(totalBytes)} bytes, ${String(totalGzipBytes)} bytes gzip (budget ${String(BUDGET_GZIP_BYTES)})`)

if (totalGzipBytes > BUDGET_GZIP_BYTES) {
  failures.push(`Initial JavaScript exceeds the ${String(BUDGET_GZIP_BYTES)} byte gzip budget.`)
}

const distFiles = await readdir(distDirectory, { recursive: true })
const sourceMaps = distFiles.filter((file) => file.endsWith('.map'))

if (sourceMaps.length > 0) {
  failures.push(`Source maps found in dist: ${sourceMaps.join(', ')}`)
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL ${failure}`)
  }

  process.exit(1)
}

await rm(join(distDirectory, '.vite'), { recursive: true, force: true })
console.log('Removed dist/.vite so the build manifest is not deployed.')
console.log('Bundle verified.')
