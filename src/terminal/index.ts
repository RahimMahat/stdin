import { mount } from './shell'
import { mountNavMenu } from '../effects/nav-menu'

/**
 * Entry point for the live shell. Bundled and deferred by Astro, so it always
 * runs after the document is parsed and after the page has painted — the static
 * output is readable before this file exists.
 */
mount()
mountNavMenu()
