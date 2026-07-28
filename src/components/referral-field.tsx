import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'

/**
 * Stands in for a field the app does not control — a component from a design
 * system or a third-party widget. It has no paste handler of its own, and the
 * detector still sees pastes into it, because the listener is on the document
 * rather than on each input. Acceptance spec 6 depends on this staying dumb;
 * do not add an onPaste here.
 */
export function ReferralField() {
  return (
    <div className="grid gap-2">
      <Label htmlFor="referral">Referral code</Label>
      <Input id="referral" placeholder="FRIEND-2026" />
    </div>
  )
}
