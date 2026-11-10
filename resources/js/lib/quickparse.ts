import { addDays, format, nextDay, type Day } from 'date-fns'
import type { Tag } from './types'

export interface ParsedQuickAdd {
  title: string
  due_date?: string
  tag_ids?: number[]
  priority?: 'high' | 'medium' | 'low'
}

/** Full weekday names — unambiguous, recognised anywhere in the text. */
const WEEKDAYS: Record<string, Day> = {
  sunday: 0, ahad: 0,
  monday: 1, senin: 1,
  tuesday: 2, selasa: 2,
  wednesday: 3, rabu: 3,
  thursday: 4, kamis: 4,
  friday: 5, jumat: 5, "jum'at": 5,
  saturday: 6, sabtu: 6,
}

/**
 * Short forms collide with ordinary words ("sun cream", "sat down", "wed"),
 * so they only count after "next"/"on" or as the very last word.
 */
const WEEKDAY_ABBR: Record<string, Day> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

/** End of a word: whitespace or punctuation — unlike \b, "today's" is not a match. */
const END = `(?=[\\s,.;:!?)]|$)`

/**
 * Parse a quick-add string into task fields.
 *  - `#tag`  → matches an existing tag (by name, case-insensitive)
 *  - `!high|!med|!low` (or `!h/!m/!l`) → priority
 *  - dates: today/hari ini, tomorrow/besok, lusa, weekday names (EN/ID),
 *    "next monday" / "senin depan", "in N days" / "N hari lagi",
 *    "in N weeks" / "N minggu lagi", "next week" / "minggu depan"
 *  - times (5pm, 17:00) are stripped (only dates are stored)
 */
export function parseQuickAdd(input: string, tags: Tag[] = []): ParsedQuickAdd {
  let text = ` ${input} `
  const out: ParsedQuickAdd = { title: '' }

  // priority
  text = text.replace(/\s!(high|hi|h|medium|med|m|low|lo|l)\b/i, (_m, v: string) => {
    const c = v.toLowerCase()[0]
    out.priority = c === 'h' ? 'high' : c === 'm' ? 'medium' : 'low'
    return ' '
  })

  // tags (only recognised ones are consumed)
  const tagIds: number[] = []
  text = text.replace(/\s#([\p{L}\d_-]+)/gu, (m, name: string) => {
    const f = tags.find((t) => t.name.toLowerCase() === name.toLowerCase())
    if (f) {
      if (!tagIds.includes(f.id)) tagIds.push(f.id)
      return ' '
    }
    return m
  })
  if (tagIds.length) out.tag_ids = tagIds

  // strip time tokens (dates only are stored)
  text = text.replace(/\s\d{1,2}([:.]\d{2})?\s?(am|pm)\b/gi, ' ').replace(/\s([01]?\d|2[0-3]):\d{2}\b/g, ' ')

  const today = new Date()
  let due: Date | null = null

  const rel: [RegExp, number][] = [
    [new RegExp(`\\sin (\\d+) days?${END}`, 'i'), 1],
    [new RegExp(`\\s(\\d+) hari(?: lagi)?${END}`, 'i'), 1],
    [new RegExp(`\\sin (\\d+) weeks?${END}`, 'i'), 7],
    // Indonesian "minggu" also means "week": "2 minggu lagi" = in 2 weeks.
    [new RegExp(`\\s(\\d+) minggu(?: lagi)?${END}`, 'i'), 7],
  ]
  for (const [re, unit] of rel) {
    const m = text.match(re)
    if (m) {
      due = addDays(today, parseInt(m[1], 10) * unit)
      text = text.replace(m[0], ' ')
      break
    }
  }

  if (!due) {
    const words: [RegExp, () => Date][] = [
      [new RegExp(`\\s(today|hari ini)${END}`, 'i'), () => today],
      [new RegExp(`\\s(day after tomorrow|lusa)${END}`, 'i'), () => addDays(today, 2)],
      [new RegExp(`\\s(tomorrow|besok|bsk|esok)${END}`, 'i'), () => addDays(today, 1)],
      [new RegExp(`\\s(next week|minggu depan|pekan depan)${END}`, 'i'), () => addDays(today, 7)],
      // "hari minggu" = Sunday (bare "minggu" is too ambiguous: week vs Sunday).
      [new RegExp(`\\shari minggu${END}`, 'i'), () => nextDay(today, 0)],
    ]
    for (const [re, fn] of words) {
      const mm = text.match(re)
      if (mm) {
        due = fn()
        text = text.replace(mm[0], ' ')
        break
      }
    }
  }

  if (!due) {
    const keys = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length)
    const group = keys.join('|')
    const abbr = Object.keys(WEEKDAY_ABBR).join('|')
    const dayOf = (w: string) => WEEKDAYS[w.toLowerCase()] ?? WEEKDAY_ABBR[w.toLowerCase().replace(/\.$/, '')]
    // Indonesian: "senin depan"
    const idNext = text.match(new RegExp(`\\s(${group})\\s+depan${END}`, 'i'))
    // English: "[next] monday"
    const en = text.match(new RegExp(`\\s(next\\s+)?(${group})${END}`, 'i'))
    // Short: "next fri" / "on fri" / "... fri" at the very end
    const short =
      text.match(new RegExp(`\\s(next\\s+|on\\s+)(${abbr})\\.?${END}`, 'i')) ??
      text.match(new RegExp(`\\s()(${abbr})\\.?\\s*$`, 'i'))
    if (idNext) {
      due = addDays(nextDay(today, dayOf(idNext[1])), 7)
      text = text.replace(idNext[0], ' ')
    } else if (en ?? short) {
      const hit = (en ?? short)!
      let d = nextDay(today, dayOf(hit[2]))
      if (hit[1]?.trim().toLowerCase() === 'next') d = addDays(d, 7)
      due = d
      text = text.replace(hit[0], ' ')
    }
  }

  if (due) out.due_date = format(due, 'yyyy-MM-dd')
  out.title = text.replace(/\s+/g, ' ').trim()
  return out
}
