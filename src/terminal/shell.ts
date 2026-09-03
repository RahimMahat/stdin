import { pageFor, parse, run } from '../commands'
import type { SiteData } from '../commands/types'
import { line, type Out } from '../render/ast'
import { renderLive } from '../render/live'
import { commonPrefix, suggest, type Suggestion } from './complete'
import { loadData } from './data'
import { stream, type Stream } from './stream'
import { applyTheme } from './theme-dom'

/**
 * The shell.
 *
 * Everything here is an enhancement over a page that already works. The input
 * ships hidden and is revealed only once this module runs, so a visitor without
 * JavaScript is never shown a prompt that cannot accept anything — they get the
 * same document, with links.
 */

const HISTORY_KEY = 'stdin.history'
const HISTORY_MAX = 50
const PS1 = 'rahim@stdin ~ %'

interface Els {
  session: HTMLElement
  stream: HTMLElement
  form: HTMLFormElement
  input: HTMLInputElement
  listbox: HTMLUListElement
  status: HTMLElement
}

export function mount(): void {
  const session = document.querySelector<HTMLElement>('.session')
  const streamHost = document.querySelector<HTMLElement>('#stream')
  const form = document.querySelector<HTMLFormElement>('#tty')
  const input = document.querySelector<HTMLInputElement>('#tty-in')
  const listbox = document.querySelector<HTMLUListElement>('#tty-ac')
  const status = document.querySelector<HTMLElement>('#tty-status')

  if (!session || !streamHost || !form || !input || !listbox || !status) return

  new Shell({ session, stream: streamHost, form, input, listbox, status }).start()
}

class Shell {
  private data: SiteData | null = null
  private history: string[] = []
  /** Where ↑/↓ currently sits. history.length means "at the live input". */
  private cursor = 0
  private draft = ''
  private items: Suggestion[] = []
  private active = -1
  private running: Stream | null = null

  constructor(private els: Els) {}

  start(): void {
    this.history = readHistory()
    this.cursor = this.history.length

    // Stands down the decorative prompt: there is a real one now.
    document.documentElement.dataset.shell = 'live'

    this.els.form.hidden = false
    this.wire()
    this.scheduleLoad()
  }

  /**
   * The content payload is several times the weight of the page that links to
   * it, and most visitors will read rather than type. So it waits for an idle
   * moment — or for the first sign that someone intends to use the prompt,
   * whichever comes first.
   */
  private scheduleLoad(): void {
    let started = false
    const go = (): void => {
      if (started) return
      started = true
      this.load()
    }

    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: object) => void })
      .requestIdleCallback
    if (typeof idle === 'function') idle(go, { timeout: 1500 })
    else window.setTimeout(go, 300)

    this.els.input.addEventListener('focus', go, { once: true })
    document.addEventListener('keydown', go, { once: true })
    this.els.session.addEventListener('pointerdown', go, { once: true })
  }

  private load(): void {
    loadData()
      .then((d) => {
        this.data = d
        this.els.input.disabled = false
        this.els.input.placeholder = 'type a command — tab completes, ↑ recalls'
      })
      .catch(() => {
        // The links on the page are all still real. Say so rather than leaving
        // an input that silently swallows everything typed into it.
        this.els.form.hidden = true
        this.announce('the terminal could not load. every command is still a link above.')
      })
  }

  /* ---------------------------------------------------------------- */
  /* wiring                                                            */
  /* ---------------------------------------------------------------- */

  private wire(): void {
    const { form, input, session } = this.els

    form.addEventListener('submit', (e) => {
      e.preventDefault()
      const value = input.value.trim()
      if (!value) return
      input.value = ''
      this.closeList()
      this.exec(value)
    })

    input.addEventListener('input', () => {
      this.draft = input.value
      this.cursor = this.history.length
      this.refreshList()
    })

    input.addEventListener('keydown', (e) => this.onKey(e))
    input.addEventListener('blur', () => {
      // Let a click on an option land before the list disappears.
      window.setTimeout(() => this.closeList(), 120)
    })

    // A command chip runs the command instead of navigating — but only while
    // this module is alive. With it absent, the same element is a plain link to
    // a real page, which is the entire reason chips are anchors.
    session.addEventListener('click', (e) => {
      const target = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-cmd]') : null
      if (!target) return
      if (e.metaKey || e.ctrlKey || e.shiftKey || (e as MouseEvent).button !== 0) return
      const cmd = target.dataset.cmd
      if (!cmd || !this.data) return
      e.preventDefault()
      this.exec(cmd)
    })

    // Clicking dead space in the session focuses the prompt, the way clicking a
    // terminal window does. Not while text is selected — that would cancel it.
    session.addEventListener('mouseup', (e) => {
      if (e.target instanceof Element && e.target.closest('a, button, input, [data-cmd]')) return
      if ((window.getSelection()?.toString() ?? '').length > 0) return
      this.focus()
    })

    // Typing anywhere starts typing here.
    document.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.length !== 1) return
      const t = e.target
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return
      if (t instanceof HTMLElement && t.isContentEditable) return
      this.focus()
    })

    window.addEventListener('popstate', () => this.onPop())
  }

  private focus(): void {
    if (!this.els.form.hidden && !this.els.input.disabled) this.els.input.focus()
  }

  /* ---------------------------------------------------------------- */
  /* keys                                                              */
  /* ---------------------------------------------------------------- */

  private onKey(e: KeyboardEvent): void {
    const open = this.items.length > 0 && !this.els.listbox.hidden

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        if (open) this.setActive(this.active + 1)
        else this.recall(1)
        return

      case 'ArrowUp':
        if (open && this.active > 0) {
          e.preventDefault()
          this.setActive(this.active - 1)
          return
        }
        if (open && this.active === 0) {
          e.preventDefault()
          this.setActive(-1)
          return
        }
        e.preventDefault()
        this.recall(-1)
        return

      case 'Escape':
        if (open) {
          e.preventDefault()
          this.closeList()
        }
        return

      case 'Tab': {
        if (!this.data) return
        e.preventDefault()
        if (this.active >= 0 && this.items[this.active]) {
          this.accept(this.items[this.active].value)
          return
        }
        const items = suggest(this.els.input.value, this.data)
        if (items.length === 1) {
          this.accept(items[0].value)
          return
        }
        const shared = commonPrefix(items, this.els.input.value)
        if (shared) {
          this.els.input.value = shared
          this.draft = shared
        }
        this.refreshList()
        return
      }

      case 'Enter':
        if (open && this.active >= 0 && this.items[this.active]) {
          e.preventDefault()
          this.accept(this.items[this.active].value)
        }
        return

      default:
        if (e.ctrlKey && e.key.toLowerCase() === 'c') {
          this.els.input.value = ''
          this.closeList()
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'l') {
          e.preventDefault()
          this.clear()
        }
    }
  }

  private recall(dir: -1 | 1): void {
    if (this.history.length === 0) return
    if (this.cursor === this.history.length) this.draft = this.els.input.value

    const next = Math.min(this.history.length, Math.max(0, this.cursor + dir))
    this.cursor = next
    this.els.input.value = next === this.history.length ? this.draft : this.history[next]
    this.closeList()

    const end = this.els.input.value.length
    this.els.input.setSelectionRange(end, end)
  }

  /* ---------------------------------------------------------------- */
  /* completion list — combobox / listbox                              */
  /* ---------------------------------------------------------------- */

  private refreshList(): void {
    if (!this.data) return
    const value = this.els.input.value
    this.items = value.trim() ? suggest(value, this.data) : []
    this.active = -1
    this.paintList()
  }

  private paintList(): void {
    const { listbox, input } = this.els
    listbox.textContent = ''

    if (this.items.length === 0) {
      this.closeList()
      return
    }

    this.items.forEach((s, i) => {
      const li = document.createElement('li')
      li.setAttribute('role', 'option')
      li.id = `tty-ac-${i}`
      li.className = 'ac-item'
      li.setAttribute('aria-selected', String(i === this.active))

      const name = document.createElement('span')
      name.className = 'ac-name'
      const hits = new Set(s.hits)
      for (let c = 0; c < s.value.length; c++) {
        const ch = s.value[c]
        if (hits.has(c)) {
          const b = document.createElement('b')
          b.textContent = ch
          name.append(b)
        } else {
          name.append(document.createTextNode(ch))
        }
      }

      const label = document.createElement('span')
      label.className = 'ac-label o-dim'
      label.textContent = s.label

      li.append(name, label)
      li.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.accept(s.value)
      })
      listbox.append(li)
    })

    listbox.hidden = false
    input.setAttribute('aria-expanded', 'true')
  }

  private setActive(i: number): void {
    if (this.items.length === 0) return
    this.active = i < -1 ? -1 : i >= this.items.length ? this.items.length - 1 : i

    const options = [...this.els.listbox.children]
    options.forEach((o, n) => o.setAttribute('aria-selected', String(n === this.active)))

    if (this.active >= 0) {
      this.els.input.setAttribute('aria-activedescendant', `tty-ac-${this.active}`)
      const opt = options[this.active]
      if (opt instanceof HTMLElement) opt.scrollIntoView?.({ block: 'nearest' })
    } else {
      this.els.input.removeAttribute('aria-activedescendant')
    }
  }

  private accept(value: string): void {
    this.els.input.value = value
    this.draft = value
    this.closeList()
    this.focus()
  }

  private closeList(): void {
    this.items = []
    this.active = -1
    this.els.listbox.hidden = true
    this.els.listbox.textContent = ''
    this.els.input.setAttribute('aria-expanded', 'false')
    this.els.input.removeAttribute('aria-activedescendant')
  }

  /* ---------------------------------------------------------------- */
  /* execution                                                         */
  /* ---------------------------------------------------------------- */

  private exec(input: string): void {
    if (!this.data) return

    // Anything still animating is finished now, so output never interleaves.
    this.running?.flush()

    this.remember(input)

    const { name, args } = parse(input)

    if (name === 'clear') {
      this.clear()
      return
    }

    let out: Out[] = run(input, this.data)

    if (name === 'theme') {
      const arg = (args[0] ?? '').toLowerCase()
      if (arg === '' || arg === 'dark' || arg === 'light' || arg === 'toggle') {
        const applied = applyTheme(arg === '' || arg === 'toggle' ? undefined : arg)
        // Bare `theme` explains itself on its static page, where nothing can be
        // toggled. Typed into a live shell it should just do the thing.
        if (arg === '' || arg === 'toggle') {
          out = [line(`theme → ${applied}`, 'ok'), line('persisted. type it again to flip back.', 'dim')]
        }
      }
    }

    const block = document.createElement('section')
    block.className = 'block'

    // Only a command that some page actually renders gets a URL. An error has
    // nowhere to point, so the address bar keeps whatever it had.
    const href = pageFor(input, this.data.projects.map((p) => p.slug))
    if (href) block.dataset.href = href

    const echo = document.createElement('div')
    echo.className = 'prompt-line'
    const ps1 = document.createElement('span')
    ps1.className = 'ps1'
    ps1.textContent = PS1
    const typed = document.createElement('span')
    typed.className = 'typed'
    typed.textContent = input
    echo.append(ps1, typed)

    const body = document.createElement('div')
    body.className = 'out'
    body.setAttribute('role', 'log')
    body.setAttribute('aria-live', 'polite')

    block.append(echo, body)
    this.els.stream.append(block)

    reveal(echo)

    this.running = stream(body, renderLive(out))
    this.running.done.then(() => this.announce(`${input} — output complete`))

    if (href && href !== location.pathname) {
      history.pushState({ cmd: input, href }, '', href)
      document.title = `${input} — rahim mahat`
    }
  }

  private clear(): void {
    this.running?.flush()
    this.running = null
    this.els.stream.textContent = ''
    document.querySelector('.out')?.replaceChildren()
    const crumbs = document.querySelector('.crumbs')
    if (crumbs instanceof HTMLElement) reveal(crumbs)
    this.announce('cleared')
  }

  private onPop(): void {
    const href = location.pathname
    const block = [...this.els.stream.querySelectorAll<HTMLElement>('[data-href]')].find(
      (b) => b.dataset.href === href,
    )

    if (block) {
      reveal(block)
      return
    }

    // Nothing in this session rendered that URL — it is a real page, so go and
    // get it rather than faking the navigation.
    location.reload()
  }

  /* ---------------------------------------------------------------- */

  private remember(input: string): void {
    if (this.history[this.history.length - 1] !== input) this.history.push(input)
    if (this.history.length > HISTORY_MAX) this.history = this.history.slice(-HISTORY_MAX)
    this.cursor = this.history.length
    this.draft = ''
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(this.history))
    } catch {
      // Not worth failing a command over.
    }
  }

  private announce(msg: string): void {
    this.els.status.textContent = msg
  }
}

/** scrollIntoView is absent in some embedded and test environments. */
function reveal(el: HTMLElement): void {
  el.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
}

function readHistory(): string[] {
  try {
    const raw = sessionStorage.getItem(HISTORY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
