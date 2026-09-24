import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [react(), nodePolyfills({ include: ['buffer', 'process', 'events', 'stream', 'util'] })],
  base: process.env.GITHUB_PAGES ? '/curve-covenant/' : '/',
  test: { environment: 'node' },
})
