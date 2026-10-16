import { readFileSync } from 'node:fs'
import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function readGlobalHeaders(): Record<string, string> {
  const config: unknown = JSON.parse(
    readFileSync(new URL('./public/staticwebapp.config.json', import.meta.url), 'utf8'),
  )

  if (typeof config !== 'object' || config === null || !('globalHeaders' in config)) {
    throw new Error('public/staticwebapp.config.json has no globalHeaders object.')
  }

  const { globalHeaders } = config

  if (typeof globalHeaders !== 'object' || globalHeaders === null) {
    throw new Error('globalHeaders in public/staticwebapp.config.json must be an object.')
  }

  const headers: Record<string, string> = {}

  for (const [name, value] of Object.entries(globalHeaders)) {
    if (typeof value !== 'string') {
      throw new Error(`Header ${name} in public/staticwebapp.config.json must be a string.`)
    }

    headers[name] = value
  }

  return headers
}

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
  ],
  build: {
    manifest: true,
    modulePreload: { polyfill: false },
  },
  preview: {
    headers: readGlobalHeaders(),
  },
})
