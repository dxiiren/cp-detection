import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '#/components/ui/button'
import { useTheme } from '#/hooks/use-theme'
import type { ThemePreference } from '#/lib/theme'

const ICONS = { light: Sun, dark: Moon, system: Monitor } as const

const LABELS: Record<ThemePreference, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'Theme follows your system',
}

export function ThemeToggle() {
  const { preference, cycle } = useTheme()
  const Icon = ICONS[preference]

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      // The icon changes with the preference, so the name has to as well —
      // otherwise a screen reader announces the same button three times over
      // and never says which one is active.
      aria-label={`${LABELS[preference]}. Activate to change.`}
      title={LABELS[preference]}
    >
      <Icon className="size-4" aria-hidden />
    </Button>
  )
}
