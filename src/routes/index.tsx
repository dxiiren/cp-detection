import { Link, createFileRoute } from '@tanstack/react-router'
import { useSelector } from '@tanstack/react-store'
import { toast } from 'sonner'
import { ReferralField } from '#/components/referral-field'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '#/components/ui/accordion'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Separator } from '#/components/ui/separator'
import { Switch } from '#/components/ui/switch'
import { Textarea } from '#/components/ui/textarea'
import {
  PROTECTED_ATTRIBUTE,
  useClipboardDetection,
} from '#/hooks/use-clipboard-detection'
import { clipboardStore, setSetting } from '#/lib/event-store'
import { logClipboardEvent } from '#/lib/events-log'
import { SERVER_PREVIEW_LIMIT, toServerPayload } from '#/lib/redact'
import { canonicalLink, faqJsonLd, jsonLdScript, pageMeta } from '#/lib/seo'
import { SITE_INDEXABLE, SITE_ORIGIN } from '#/lib/site'
import { FAQ, HOW_IT_WORKS, PAGES, PRIVACY_POINTS } from '#/lib/site-content'
import { MAX_TOAST_SECONDS, MIN_TOAST_SECONDS } from '#/lib/toast-copy'

export const Route = createFileRoute('/')({
  head: () => ({
    meta: pageMeta({
      origin: SITE_ORIGIN,
      indexable: SITE_INDEXABLE,
      ...PAGES.home,
    }),
    links: [canonicalLink(SITE_ORIGIN, PAGES.home.path)],
    // Built from the same FAQ constant the page renders below, because
    // structured data that disagrees with visible content is a manual action
    // waiting to happen.
    scripts: [jsonLdScript(faqJsonLd(FAQ))],
  }),
  component: Playground,
})

function Playground() {
  const settings = useSelector(clipboardStore, (state) => state.settings)

  const { detecting } = useClipboardDetection({
    onRecord: (record) => {
      // Fire and forget: the log is a nicety, and a failed POST should never
      // interfere with the field the person is actually typing into. Report
      // the failure rather than swallowing it, though — a silently dropped
      // log is indistinguishable from one that was never sent.
      void logClipboardEvent({
        data: toServerPayload(record, {
          sendPreview: clipboardStore.state.settings.sendPreviewToServer,
        }),
      }).catch((error) => {
        console.warn('clipboard event was not logged to the server', error)
      })
    },
  })

  return (
    <div className="grid gap-14">
      <section>
        <h1 className="display-title text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
          Copy, cut, paste and drop — all detected.
        </h1>
        <p className="text-muted-foreground mt-4 max-w-2xl text-lg">
          A web page can tell when you paste into it, roughly how you did it,
          and what you pasted. This is a live demonstration of all three, and an
          explanation of how each one works.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button asChild>
            <a href="#try-it">Try it below</a>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/events">See the events log</Link>
          </Button>
        </div>
      </section>

      {/* Collapsible so the explanation does not stand between a visitor and
          the thing they came to try. `forceMount` keeps every panel in the DOM
          even while closed: the FAQ here is generated from the same constant as
          the FAQPage structured data, and markup that describes content a
          crawler cannot find is exactly the mismatch that earns a penalty. */}
      <section data-testid="home-accordion">
        <h2 className="sr-only">About this page</h2>
        <Accordion type="multiple" defaultValue={['how']} className="w-full">
          <AccordionItem value="how">
            <AccordionTrigger className="text-xl font-semibold tracking-tight">
              How it works
            </AccordionTrigger>
            <AccordionContent forceMount>
              <div className="grid gap-6 pt-2">
                {HOW_IT_WORKS.map((section) => (
                  <div key={section.heading}>
                    <h3 className="font-semibold">{section.heading}</h3>
                    <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                      {section.body}
                    </p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="privacy">
            <AccordionTrigger className="text-xl font-semibold tracking-tight">
              What this page does with your clipboard
            </AccordionTrigger>
            <AccordionContent forceMount>
              <ul className="grid gap-3 pt-2">
                {PRIVACY_POINTS.map((point) => (
                  <li
                    key={point}
                    className="text-muted-foreground border-l-2 pl-4 text-sm leading-relaxed"
                  >
                    {point}
                  </li>
                ))}
              </ul>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="faq">
            <AccordionTrigger className="text-xl font-semibold tracking-tight">
              Questions
            </AccordionTrigger>
            <AccordionContent forceMount>
              <div className="grid gap-5 pt-2">
                {FAQ.map((entry) => (
                  <div key={entry.question}>
                    <h3 className="font-semibold">{entry.question}</h3>
                    <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                      {entry.answer}
                    </p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </section>

      <section id="try-it" className="scroll-mt-8">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">Try it</h2>
          {/* Fixed width: the label changes on hydration, and a badge that
              grows from "Not yet active" to "Detecting" reflows the heading
              row next to it. Reserving the space costs nothing and removes
              the shift. */}
          <Badge
            variant={detecting ? 'default' : 'secondary'}
            className="min-w-[7.5rem] justify-center"
          >
            {detecting ? 'Detecting' : 'Not yet active'}
          </Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Copy, cut, paste or drag text into any field below. Every clipboard
          action on the page is detected, attributed, and logged.
        </p>

        {/* The detection harness. Everything the acceptance specs reach for —
            this testid, data-detecting, and the field ids — lives inside here
            and deliberately did not move when the surrounding page grew. */}
        <div
          data-testid="playground"
          data-detecting={detecting}
          className="mt-6 grid gap-6"
        >
          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h3>Fields</h3>
              </CardTitle>
              <CardDescription>
                Ordinary inputs, a rich-text area, and one field that refuses
                pasted text.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  rows={3}
                  placeholder="Paste anything here"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="bio">Bio</Label>
                <div
                  id="bio"
                  aria-label="Bio"
                  contentEditable
                  suppressContentEditableWarning
                  role="textbox"
                  tabIndex={0}
                  className="border-input min-h-20 rounded-md border bg-transparent px-3 py-2 text-sm focus-visible:ring-[3px] focus-visible:outline-none"
                />
                <p className="text-muted-foreground text-xs">
                  A contenteditable region — pastes here are detected too.
                </p>
              </div>

              <Separator />

              <div className="grid gap-2">
                <Label htmlFor="confirm-email">Confirm email</Label>
                <Input
                  id="confirm-email"
                  type="email"
                  placeholder="Type it again — no pasting"
                  {...{ [PROTECTED_ATTRIBUTE]: '' }}
                />
                <p className="text-muted-foreground text-xs">
                  Protected: pasting is refused while the switch below is on.
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="secret">Password</Label>
                <Input
                  id="secret"
                  type="password"
                  placeholder="Paste one and watch what gets logged"
                />
                <p className="text-muted-foreground text-xs">
                  Detected and counted like any other field — but its contents
                  are never kept, previewed or sent, whatever the switches below
                  say.
                </p>
              </div>

              <ReferralField />
              <p className="text-muted-foreground -mt-3 text-xs">
                Rendered by a component with no paste handler of its own — proof
                the detection is global, not wired per field.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle asChild>
                <h3>Settings</h3>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <label className="flex items-start justify-between gap-6">
                <span className="grid gap-1">
                  <span className="text-sm font-medium">
                    Block pasting into protected fields
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Cancels the paste and says so, rather than silently
                    accepting it.
                  </span>
                </span>
                <Switch
                  data-testid="toggle-block"
                  checked={settings.blockProtectedFields}
                  onCheckedChange={(value) =>
                    setSetting('blockProtectedFields', value)
                  }
                />
              </label>

              <label className="flex items-start justify-between gap-6">
                <span className="grid gap-1">
                  <span className="text-sm font-medium">
                    Send clipboard excerpts to the server
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Off by default. The server otherwise records only the kind
                    of event, which field, and how many characters — never the
                    text. Even when on, it receives at most{' '}
                    {SERVER_PREVIEW_LIMIT} characters.
                  </span>
                </span>
                <Switch
                  data-testid="toggle-preview"
                  checked={settings.sendPreviewToServer}
                  onCheckedChange={(value) =>
                    setSetting('sendPreviewToServer', value)
                  }
                />
              </label>

              <Separator />

              <label className="flex items-start justify-between gap-6">
                <span className="grid gap-1">
                  <span className="text-sm font-medium">
                    Keep toasts until dismissed
                  </span>
                  <span className="text-muted-foreground text-xs">
                    Pins every toast open so you can read a long paste at your
                    own pace.
                  </span>
                </span>
                <Switch
                  data-testid="toggle-keep-toasts"
                  checked={settings.keepToastsOpen}
                  onCheckedChange={(value) =>
                    setSetting('keepToastsOpen', value)
                  }
                />
              </label>

              <div className="flex items-start justify-between gap-6">
                <span className="grid gap-1">
                  <Label
                    htmlFor="toast-seconds"
                    className="text-sm font-medium"
                  >
                    Dismiss after
                  </Label>
                  <span className="text-muted-foreground text-xs">
                    Seconds a toast stays on screen ({MIN_TOAST_SECONDS}–
                    {MAX_TOAST_SECONDS}). Ignored while toasts are pinned.
                  </span>
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <Input
                    id="toast-seconds"
                    data-testid="toast-seconds"
                    type="number"
                    min={MIN_TOAST_SECONDS}
                    max={MAX_TOAST_SECONDS}
                    className="w-20"
                    disabled={settings.keepToastsOpen}
                    value={settings.toastSeconds}
                    onChange={(e) =>
                      setSetting('toastSeconds', e.target.valueAsNumber)
                    }
                  />
                  <span className="text-muted-foreground text-sm">s</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-6">
                <span className="text-muted-foreground text-xs">
                  Cleared toasts stay in the events log — dismissing only clears
                  the screen.
                </span>
                <Button
                  data-testid="clear-toasts"
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => toast.dismiss()}
                >
                  Dismiss all
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold tracking-tight">
          Frequently asked questions
        </h2>
        <div className="mt-6 grid gap-6">
          {FAQ.map((entry) => (
            <div key={entry.question}>
              <h3 className="font-semibold">{entry.question}</h3>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {entry.answer}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
