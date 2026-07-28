import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react'
import { Toaster as Sonner } from 'sonner'
import type { ToasterProps } from 'sonner'

// shadcn's stock version reads the theme from next-themes; this app has no
// theme provider, so it follows the OS preference directly instead.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      // A 240-character preview wrapped to seven lines and ate a third of a
      // phone screen. Clamp it: the toast is a notification, and the full text
      // is on /events. `break-all` because an unbroken paste (a token, a URL)
      // has nowhere to wrap and would otherwise overflow the toast entirely.
      toastOptions={{
        classNames: {
          title: 'break-words',
          description: 'line-clamp-3 break-all',
        },
      }}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          // sonner's richColors palette fails WCAG AA on the light surfaces it
          // pairs them with — the amber warning measured 3.07:1 against 4.5:1
          // required, at 13px. These are the same hues a step or two darker, so
          // the toast still reads as a warning, an error, and so on.
          '--warning-text': '#8a4b00',
          '--error-text': '#a1121f',
          '--success-text': '#136c3a',
          '--info-text': '#1b4fa8',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
