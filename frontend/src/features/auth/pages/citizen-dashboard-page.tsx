import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignedInHeader } from '../components/signed-in-header';

/**
 * Citizen destination.
 *
 * A routing endpoint for Phase 3 and nothing more: it proves that a CITIZEN
 * lands here and that an officer does not. Citizen product functionality —
 * onboarding, scholarships, applications — belongs to later phases.
 */
export function CitizenDashboardPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <SignedInHeader />

      <Card>
        <CardHeader>
          <CardTitle>Citizen dashboard</CardTitle>
          <CardDescription>
            You reached a route that only the CITIZEN role can open.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Your role was resolved by the SetuX backend from your SetuX profile — not from
            anything this browser claimed.
          </p>
          <p>Scholarship discovery and applications arrive in a later phase.</p>
        </CardContent>
      </Card>
    </div>
  );
}
