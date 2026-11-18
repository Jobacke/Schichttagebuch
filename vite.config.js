import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

// Eindeutige Kennung je Veröffentlichung – die App vergleicht sie mit /version.json
// und zeigt „Neue Version verfügbar“, sobald online ein neuerer Stand liegt.
const BUILD_ID = process.env.GITHUB_SHA || String(Date.now())
const APP_VERSION = (readFileSync('src/version.js', 'utf-8').match(/APP_VERSION\s*=\s*"([^"]+)"/) || [])[1] || ''

function versionFile() {
  return {
    name: 'schichttagebuch-version-file',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ build: BUILD_ID, version: APP_VERSION, builtAt: new Date().toISOString() })
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: '/',
  plugins: [react(), versionFile()],
  define: {
    __APP_BUILD_ID__: JSON.stringify(command === 'build' ? BUILD_ID : 'dev')
  }
}))
