// @vitest-environment node

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = fileURLToPath(new URL('../..', import.meta.url))
const sourceDirectory = join(projectRoot, 'src')
const nondeterminismAllowedIn = new Set(['src/state/feed.ts', 'src/state/hud.ts'])

const nondeterministicPatterns = [
  new RegExp(String.raw`\bMath\s*\.\s*random\b`),
  new RegExp(String.raw`\bDate\s*\.\s*now\b`),
  new RegExp(String.raw`\bnew\s+[\w.]*\bDate\s*\(\s*\)`),
  new RegExp(String.raw`(?<!\bnew\s+(?:[\w$]+\.)*)\bDate\s*\(`),
]

const sourceFiles = readdirSync(sourceDirectory, { recursive: true, encoding: 'utf8' })
  .filter((file) => /\.(ts|tsx|css)$/.test(file))
  .map((file) => relative(projectRoot, join(sourceDirectory, file)).replaceAll('\\', '/'))

describe('source bans', () => {
  it('finds source files to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(0)
  })

  it('keeps randomness and wall-clock time out of the source', () => {
    const offenders = sourceFiles
      .filter((file) => /\.tsx?$/.test(file) && !nondeterminismAllowedIn.has(file))
      .filter((file) => {
        const contents = readFileSync(join(projectRoot, file), 'utf8')
        return nondeterministicPatterns.some((pattern) => pattern.test(contents))
      })

    expect(offenders).toEqual([])
  })

  it('never uses the important flag in CSS', () => {
    const offenders = sourceFiles
      .filter((file) => file.endsWith('.css'))
      .filter((file) => /!\s*important/i.test(readFileSync(join(projectRoot, file), 'utf8')))

    expect(offenders).toEqual([])
  })

  it('keeps index.html free of inline styles and handlers', () => {
    const html = readFileSync(join(projectRoot, 'index.html'), 'utf8')

    expect(html).not.toMatch(/\sstyle\s*=/i)
    expect(html).not.toMatch(/<style\b/i)
    expect(html).not.toMatch(/\son[a-z]+\s*=/i)
  })

  it('allows only the hashed theme bootstrap as an inline script', () => {
    const html = readFileSync(join(projectRoot, 'index.html'), 'utf8')
    const config: unknown = JSON.parse(readFileSync(join(projectRoot, 'public/staticwebapp.config.json'), 'utf8'))
    const policy = JSON.stringify(config)
    const inlineScripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((match) => match[1] ?? '')
      .filter((body) => body.trim() !== '')

    expect(inlineScripts).toHaveLength(1)
    expect(policy).toContain(`'sha256-${createHash('sha256').update(inlineScripts[0] ?? '').digest('base64')}'`)
    expect(policy).not.toContain('unsafe-inline')
  })
})
