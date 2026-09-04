import { ArrowRight, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useApplications } from '../hooks/use-applications';
import { applicationErrorMessage } from '../utils/application-error';
import { ApplicationStatusBadge } from '../components/application-status-badge';

export function ApplicationListPage() {
  const applications = useApplications();
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My Applications</h1><p className="mt-1 text-sm text-muted-foreground">Manage drafts and view submitted scholarship applications.</p></header>
      {applications.isPending ? <ListSkeleton /> : applications.isError ? (
        <ErrorState title="Could not load applications" description={applicationErrorMessage(applications.error)} onRetry={() => void applications.refetch()} />
      ) : applications.data.items.length === 0 ? (
        <EmptyState title="No applications yet" description="Browse scholarships to start your first application." action={<Button asChild size="sm" className="mt-2"><Link to="/citizen/services">Browse scholarships</Link></Button>} className="bg-card" />
      ) : (
        <section aria-label="Your applications" className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="hidden grid-cols-[1.2fr_2fr_1fr_1fr_auto] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-xs font-medium text-muted-foreground md:grid"><span>Application</span><span>Service</span><span>Status</span><span>Updated</span><span>Action</span></div>
          <ul className="divide-y divide-border">
            {applications.data.items.map((application) => <li key={application.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.2fr_2fr_1fr_1fr_auto] md:items-center md:gap-4"><span className="flex items-center gap-2 font-medium text-primary"><FileText className="size-4" aria-hidden />{application.applicationNumber}</span><span className="text-sm">{application.service.name}</span><ApplicationStatusBadge status={application.status} /><time className="text-sm text-muted-foreground" dateTime={application.updatedAt}>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(application.updatedAt))}</time><Button asChild variant="outline" size="sm"><Link to={`/citizen/applications/${application.id}`}>{application.status === 'DRAFT' ? 'Continue' : 'View'}<ArrowRight className="size-4" aria-hidden /></Link></Button></li>)}
          </ul>
        </section>
      )}
    </div>
  );
}

function ListSkeleton() {
  return <div aria-busy="true" aria-live="polite" className="space-y-3"><span className="sr-only">Loading applications…</span>{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-20 w-full rounded-xl" />)}</div>;
}
