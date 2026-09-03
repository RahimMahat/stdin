// @ts-check
import { defineConfig } from 'astro/config'

export default defineConfig({
  // The canonical origin. Every <link rel="canonical"> is built from this, so
  // it must be a domain that actually serves the site. Cloudflare Pages hands
  // out <project>.pages.dev; change this the day a real domain is bought, and
  // not before — a canonical pointing somewhere that 404s is worse than none.
  site: 'https://stdin-er5.pages.dev',
  output: 'static',
  trailingSlash: 'never',
  build: {
    // Every command is a real file at /whoami, not /whoami/index.html.
    format: 'file',
  },
  devToolbar: { enabled: false },
})
