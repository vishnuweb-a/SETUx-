import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useCitizenRecords } from '../hooks/use-citizen-records';
import { changeDetailsErrorMessage } from '../utils/change-details-error';
import { RecordCard } from '../components/record-card';

/**
 * The entry screen for a correction: which record needs fixing?
 *
 * Records are listed, never searched or filtered — a citizen has five of them,
 * and a filter over five rows is furniture.
 *
 * This screen reads. It creates nothing: choosing a record here does not start
 * a correction request, and no request exists until a later phase builds one.
 */
export function ChangeDetailsRecordsPage() {
  const records = useCitizenRecords();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Change &amp; Correct Details
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Select the government record you want to update. SetuX will show you which details can be
          corrected and who is responsible for each record.
        </p>
      </header>

      {records.isPending ? (
        <RecordsSkeleton />
      ) : records.isError ? (
        <ErrorState
          title="Could not load your records"
          description={changeDetailsErrorMessage(records.error)}
          onRetry={() => void records.refetch()}
        />
      ) : records.data.items.length === 0 ? (
        <EmptyState
          title="No linked government records"
          description="SetuX has not linked any government records to your account yet. Once a record is linked, you can request corrections to it here."
          className="bg-card"
        />
      ) : (
        <section aria-label="Your government records">
          <ul className="grid gap-4 sm:grid-cols-2">
            {records.data.items.map((record) => (
              <RecordCard key={record.id} record={record} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RecordsSkeleton() {
  return (
    <div role="status" aria-live="polite" className="grid gap-4 sm:grid-cols-2">
      <span className="sr-only">Loading your government records…</span>
      {Array.from({ length: 4 }, (_, index) => (
        <Skeleton key={index} className="h-52 w-full rounded-2xl" aria-hidden />
      ))}
    </div>
  );
}
