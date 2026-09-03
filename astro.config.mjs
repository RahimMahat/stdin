// @ts-check
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://rahimmahat.dev',
  output: 'static',
  trailingSlash: 'never',
  build: {
    // Every command is a real file at /whoami, not /whoami/index.html.
    format: 'file',
  },
  devToolbar: { enabled: false },
})
