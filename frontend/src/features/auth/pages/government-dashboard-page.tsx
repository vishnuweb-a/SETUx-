import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignedInHeader } from '../components/signed-in-header';

/**
 * Government officer destination.
 *
 * As with the citizen dashboard, this is a Phase 3 routing endpoint. Review,
 * approval and rejection belong to later phases.
 */
export function GovernmentDashboardPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">
      <SignedInHeader />

      <Card>
        <CardHeader>
          <CardTitle>Officer dashboard</CardTitle>
          <CardDescription>
            You reached a route that only the GOVERNMENT_OFFICER role can open.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            You signed in through the same authentication flow as every other SetuX user; only
            the role resolved from your SetuX profile differs.
          </p>
          <p>Application review and decisions arrive in a later phase.</p>
        </CardContent>
      </Card>
    </div>
  );
}
