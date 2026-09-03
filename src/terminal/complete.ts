import { candidates } from '../commands'
import { search } from '../commands/fuzzy'
import type { SiteData } from '../commands/types'

/**
 * Tab completion.
 *
 * The candidate list and the matcher both live in the command layer, because
 * the unknown-command fallback uses them too — completion and "did you mean"
 * are two readings of one list, and splitting them would let the prompt offer
 * something the shell then claims not to know.
 *
 * The plan called for uFuzzy here. There are around a dozen candidates.
 * Shipping five kilobytes of general-purpose fuzzy matching to rank a dozen
 * strings would cost more than the rest of this bundle, so `commands/fuzzy.ts`
 * does it in forty lines.
 */

export interface Suggestion {
  /** What gets inserted into the input. */
  value: string
  /** Right-hand description, shown dimmed. */
  label: string
  /** Indices in `value` that matched, for highlighting. */
  hits: number[]
}

export function suggest(input: string, data: SiteData | null, limit = 8): Suggestion[] {
  return search(candidates(data), input, limit).map(({ value, label, hits }) => ({ value, label, hits }))
}

/**
 * The longest prefix every candidate agrees on — what a shell inserts when tab
 * is ambiguous. Returns null when it would not extend what is already typed.
 */
export function commonPrefix(items: Suggestion[], typed: string): string | null {
  if (items.length === 0) return null

  let prefix = items[0].value
  for (const it of items.slice(1)) {
    let i = 0
    while (i < prefix.length && i < it.value.length && prefix[i].toLowerCase() === it.value[i].toLowerCase()) i++
    prefix = prefix.slice(0, i)
  }

  return prefix.length > typed.length ? prefix : null
}
