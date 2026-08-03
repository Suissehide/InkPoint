import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@sim': fileURLToPath(new URL('../sim', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    root: fileURLToPath(new URL('..', import.meta.url)),
    include: ['front/src/**/*.test.ts', 'sim/**/*.test.ts'],
  },
})
