import { ArrowRight, GraduationCap, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/**
 * Citizen landing screen.
 *
 * Follows `reference/dashboard.png` in the parts Phase 5 can honour: the
 * greeting, and a featured card that opens the scholarship catalogue. The
 * reference's other panels — active applications, verification progress,
 * notifications — are counts of things that cannot exist until Phase 6 and
 * later, and a dashboard tile reading "0 applications" beside a feature that
 * does not exist would be a mock-up, not a screen (Phase 5 §29, §56).
 */
export function CitizenDashboardPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Welcome to SetuX</h1>
        <p className="text-sm text-muted-foreground">
          Access connected government services from one secure place.
        </p>
      </header>

      {/* The featured-service band from the reference: deep blue, full width,
          carrying the one action this phase offers. */}
      <section
        aria-labelledby="featured-heading"
        className="flex flex-col gap-4 rounded-2xl bg-primary p-6 text-primary-foreground sm:p-8"
      >
        <span className="w-fit rounded-full bg-white/15 px-3 py-1 text-xs font-medium">
          Featured service
        </span>

        <div className="flex flex-col gap-2">
          <h2 id="featured-heading" className="text-xl font-bold text-balance sm:text-2xl">
            Scholarships
          </h2>
          <p className="max-w-2xl text-sm text-blue-50">
            Browse scholarships offered through SetuX, see exactly what each one requires, and
            apply without submitting the same documents twice.
          </p>
        </div>

        <Button asChild variant="secondary" className="w-fit">
          <Link to="/citizen/services">
            <GraduationCap className="size-4" aria-hidden />
            Browse scholarships
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Button>
      </section>

      <section
        aria-labelledby="trust-heading"
        className="flex items-start gap-3 rounded-2xl border border-border bg-card p-5"
      >
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        <div>
          <h2 id="trust-heading" className="font-semibold">
            Your data stays yours
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            SetuX retrieves records from the departments that issued them, only with your consent,
            and only for the service you are applying to. Government systems in this prototype are
            simulated with synthetic data.
          </p>
        </div>
      </section>
    </div>
  );
}
