/**
 * Everything the site says about itself, in one place and as plain data.
 *
 * Pure: no env, no DOM, no clock. `site.ts` is the adapter that supplies the
 * origin at build time; `seo.ts` turns this into tags, XML and text.
 *
 * The point of keeping the copy here rather than inline in the routes is that
 * the same sentences have to appear in three places at once — the rendered
 * page, the document head, and the structured data — and Google treats
 * structured data that disagrees with visible content as a reason to distrust
 * the page. One constant, three consumers, no drift.
 */

export interface PageMeta {
  path: string
  title: string
  description: string
  /** Sitemap hints. Priority is relative within this site only. */
  priority: number
  changefreq: 'daily' | 'weekly' | 'monthly'
  /** The one-liner llms.txt uses to describe the page. */
  summary: string
}

export interface FaqEntry {
  question: string
  answer: string
}

export const SITE_NAME = 'Clipboard Activity Detector'
export const SITE_SHORT_NAME = 'Clipboard Detector'

export const SITE_TAGLINE =
  'A live demo of how much a web page can tell about your clipboard — and how it knows.'

export const SITE_DESCRIPTION =
  'An open demo that detects every copy, cut, paste and drag-drop on a page, infers how each paste was triggered, and logs it — from a single document-level listener.'

/** Used when nothing supplies an origin — local dev, and unit tests. */
export const SITE_ORIGIN_FALLBACK = 'http://localhost:3000'

export const OG_IMAGE = '/og.png'
export const OG_IMAGE_ALT =
  'Clipboard Activity Detector — copy, cut, paste and drag-drop, detected on any field'

export const THEME_COLOR = '#173a40'

export const PAGES = {
  home: {
    path: '/',
    title: 'Clipboard Activity Detector — Copy, Cut, Paste & Drop',
    description:
      'A live demo that detects every copy, cut, paste and drag-drop on a page, including how the paste was triggered, from one document-level listener.',
    priority: 1,
    changefreq: 'weekly',
    summary:
      'The playground: type, paste and drag into ordinary fields and watch each event get detected and attributed.',
  },
  events: {
    path: '/events',
    title: 'Events log — Clipboard Activity Detector',
    description:
      'Every detected clipboard event in one table: the type, how it was triggered, which field, the character count and the time, for the session and the server.',
    priority: 0.6,
    changefreq: 'weekly',
    summary:
      'The log of detected events, with the browser session and the server record side by side.',
  },
} as const satisfies Record<string, PageMeta>

/**
 * How it works, as prose. Lifted out of the README because a crawler and an
 * LLM never read the README — until this landed, the site itself explained
 * almost nothing about what it does.
 */
export const HOW_IT_WORKS: ReadonlyArray<{ heading: string; body: string }> = [
  {
    heading: 'One listener, every field',
    body: 'Detection is a single listener on the document, in the capture phase — not a handler wired onto each input. That is why it still sees pastes into third-party widgets, design-system components and anything that calls stopPropagation. The Referral code field below has no paste handler of its own, and is detected anyway.',
  },
  {
    heading: 'Where the paste came from is inferred, not reported',
    body: 'No browser API tells a page whether a paste was Ctrl+V, the right-click menu or a drag. It has to be worked out from the order and timing of events: a paste shortly after the paste shortcut is attributed to the keyboard, one arriving with no preceding shortcut to the context menu, and a drop to the drag. That inference is a pure state machine, so it can be tested without a browser at all.',
  },
  {
    heading: 'Some pastes never fire a paste event',
    body: 'Mobile paste bars and certain menu paths mutate the field without a ClipboardEvent ever arriving. The detector also watches beforeinput for insertFromPaste and insertFromDrop, which is what catches those.',
  },
]

export const PRIVACY_POINTS: ReadonlyArray<string> = [
  'Clipboard text stays in your browser. The server is told the shape of an event — what kind, how it was triggered, which field, how many characters and when — and never the contents.',
  'Sending excerpts is opt-in, off by default, and capped at 80 characters even when you turn it on. People paste passwords into demos.',
  'The redaction is enforced on both ends: the client omits the field, and the server rebuilds every payload from scratch rather than trusting that the client did.',
  'The server log lives in memory and is gone on restart. No database quietly accumulates other people’s clipboards.',
]

/**
 * The FAQ. Rendered on the page *and* emitted as FAQPage structured data from
 * this same array — see `faqJsonLd`. Structured data that does not match what
 * a visitor can read is a manual action waiting to happen.
 */
export const FAQ: ReadonlyArray<FaqEntry> = [
  {
    question: 'Can a website detect when you paste into a form?',
    answer:
      'Yes. Pasting fires a paste event that any page can listen for, and a listener on the document catches it for every field at once — including fields the page never wired up itself.',
  },
  {
    question: 'Can a site tell whether you used Ctrl+V, right-click or a drag?',
    answer:
      'Not directly — no browser API reports it. It can be inferred from timing: this demo watches for a paste shortcut or a drag immediately before the paste and attributes the event to whichever it saw, falling back to the context menu when it saw neither.',
  },
  {
    question: 'Can a website see what you pasted?',
    answer:
      'Yes. The pasted text is handed to the page along with the event. That is why this demo keeps clipboard contents in the browser by default and sends the server only the shape of the event: type, field, character count and time.',
  },
  {
    question: 'Can a website stop you pasting into a field?',
    answer:
      'Yes, by cancelling the paste event — which is what the Confirm email field here does. It is worth knowing it is usually hostile: blocking paste breaks password managers and makes long values far more error-prone, without stopping anyone determined.',
  },
  {
    question: 'Does detection work in fields the app did not write itself?',
    answer:
      'Yes. Because the listener sits on the document in the capture phase, it also sees pastes into third-party widgets and into components that stop the event from bubbling any further.',
  },
  {
    question:
      'Why is a copy measured from the selection instead of the clipboard?',
    answer:
      'During copy and cut the event’s clipboard data is write-only: reading it back returns an empty string, so every copy would be logged as zero characters. The count has to come from the selection instead.',
  },
]

/** Feeds the SoftwareApplication structured data. */
export const FEATURES: ReadonlyArray<string> = [
  'Detects copy, cut, paste and drag-drop on any field',
  'Infers whether a paste came from the keyboard, the context menu or a drag',
  'Catches pastes into fields with no handler of their own',
  'Flags whether the event was user-generated or script-dispatched',
  'Optional paste blocking on protected fields',
  'Session and server-side event logs',
]
