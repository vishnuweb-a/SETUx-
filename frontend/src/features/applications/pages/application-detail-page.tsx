import { ArrowLeft, CheckCircle2, FileText, GraduationCap, ShieldCheck, ShieldQuestion } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useBlocker, useParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/feedback/error-state';
import { useApplicationConsents } from '@/features/consents';
import { RetrievalPanel } from '@/features/retrievals';
import { useApplication, useSaveApplication, useSubmitApplication } from '../hooks/use-applications';
import { applicationErrorMessage } from '../utils/application-error';
import { ApplicationStatusBadge } from '../components/application-status-badge';

export function ApplicationDetailPage() {
  const { applicationId = '' } = useParams<{ applicationId: string }>();
  const application = useApplication(applicationId);
  if (application.isPending) return <Skeleton className="mx-auto h-[34rem] max-w-6xl rounded-2xl" />;
  if (application.isError || !application.data) return <div className="mx-auto max-w-6xl"><ErrorState title="Could not load application" description={applicationErrorMessage(application.error)} onRetry={() => void application.refetch()} /></div>;
  return <ApplicationForm application={application.data} />;
}

function ApplicationForm({ application }: { readonly application: NonNullable<ReturnType<typeof useApplication>['data']> }) {
  const declarations = application.requirements.filter((requirement) => requirement.type === 'DECLARATION');
  const [fields, setFields] = useState<Readonly<Record<string, string>>>(application.fields);
  const save = useSaveApplication(application.id);
  const submit = useSubmitApplication(application.id);
  const isDraft = application.status === 'DRAFT';
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const error = save.error ?? submit.error;

  const guardUnsavedChanges = isDraft && hasUnsavedChanges;

  useEffect(() => {
    if (!guardUnsavedChanges) return undefined;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [guardUnsavedChanges]);

  // `beforeunload` covers a reload or a closed tab, but never an in-app route
  // change — and in a SPA that is how a citizen actually leaves this page.
  // Without this, following "My Applications" discards an edited declaration
  // silently.
  const blocker = useBlocker(guardUnsavedChanges);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;

    const leave = window.confirm(
      'You have unsaved changes to this application. Leave without saving?',
    );

    if (leave) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!isDraft || save.isPending || submit.isPending) return;
    void save.mutateAsync(fields).then(() => {
      setHasUnsavedChanges(false);
      return submit.mutateAsync();
    }).catch(() => undefined);
  };

  return <div className="mx-auto flex max-w-6xl flex-col gap-5">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><Link to="/citizen/applications" className="inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="size-4" aria-hidden />My Applications</Link><h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Apply for {application.service.name}</h1><p className="mt-1 text-sm text-muted-foreground">{application.applicationNumber}</p></div><ApplicationStatusBadge status={application.status} /></header>
    {application.status === 'SUBMITTED' && <SubmittedApplicationNotice applicationId={application.id} />}
    {/* Phase 8 — what SetuX has fetched on the citizen's behalf, and what it
        still needs consent for. Only meaningful once submitted, which is also
        the only state the endpoint serves. */}
    {application.status === 'SUBMITTED' && <RetrievalPanel applicationId={application.id} />}
    <form onSubmit={handleSubmit} className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem]">
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-primary/25 bg-accent p-4"><ShieldCheck className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden /><div><h2 className="font-semibold">Your verified profile information is pre-filled</h2><p className="mt-1 text-sm text-muted-foreground">These details come from your completed SetuX profile and cannot be changed from this application.</p></div></div>
        <section aria-labelledby="personal-details" className="grid gap-4 sm:grid-cols-2"><h2 id="personal-details" className="col-span-full text-lg font-semibold">Personal details</h2><ReadOnlyField label="Full name" name="fullName" autoComplete="name" value={application.applicant.fullName} className="sm:col-span-2" /><ReadOnlyField label="Date of birth" name="dateOfBirth" autoComplete="bday" value={application.applicant.dateOfBirth ?? 'Not provided'} /><ReadOnlyField label="Citizen ID" name="governmentId" autoComplete="off" value={application.applicant.governmentId} /><ReadOnlyField label="Mobile number" name="mobileNumber" autoComplete="tel" value={application.applicant.mobileNumber} /></section>
        {declarations.length > 0 && <section aria-labelledby="declarations" className="mt-7 grid gap-4"><h2 id="declarations" className="text-lg font-semibold">Your declarations</h2>{declarations.map((requirement) => { const errorId = `${requirement.code}-help`; return <label key={requirement.id} className="grid gap-1.5 text-sm font-medium">{requirement.name}{requirement.required && <span className="text-destructive"> *</span>}<textarea name={requirement.code} autoComplete="off" aria-required={requirement.required} disabled={!isDraft} value={fields[requirement.code] ?? ''} onChange={(event) => { setFields({ ...fields, [requirement.code]: event.target.value }); setHasUnsavedChanges(true); }} aria-describedby={errorId} className="min-h-28 resize-y rounded-lg border border-input bg-background px-3 py-2 font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60" /><span id={errorId} className="text-xs font-normal text-muted-foreground">{requirement.description}</span></label>; })}</section>}
        {error && <p role="alert" className="mt-5 text-sm text-destructive">{applicationErrorMessage(error)}</p>}
        {isDraft && <div className="mt-7 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between"><Button type="button" variant="outline" onClick={() => save.mutate(fields, { onSuccess: () => setHasUnsavedChanges(false) })} disabled={save.isPending || submit.isPending}>{save.isPending ? 'Saving…' : 'Save as draft'}</Button><Button type="submit" disabled={save.isPending || submit.isPending}>{submit.isPending ? 'Submitting…' : 'Submit application'}</Button></div>}
      </div>
      <aside className="rounded-2xl border border-border bg-card lg:sticky lg:top-24"><div className="flex items-center gap-3 border-b border-border p-5"><span className="grid size-10 place-items-center rounded-xl bg-accent text-primary"><GraduationCap className="size-5" aria-hidden /></span><h2 className="font-semibold">Scholarship details</h2></div><dl className="grid gap-4 p-5 text-sm"><div><dt className="text-muted-foreground">Scholarship name</dt><dd className="mt-1 font-medium">{application.service.name}</dd></div><div><dt className="text-muted-foreground">Offered by</dt><dd className="mt-1 font-medium">{application.service.department}</dd></div><div><dt className="text-muted-foreground">Requirements</dt><dd className="mt-2"><ul className="grid gap-2">{application.requirements.map((requirement) => <li key={requirement.id} className="flex gap-2"><FileText className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /><span>{requirement.name}{!requirement.required && ' (optional)'}</span></li>)}</ul></dd></div></dl></aside>
    </form>
  </div>;
}

/**
 * What a submitted application now needs from the citizen.
 *
 * The next action is derived from the real consent state rather than assumed
 * from the application status: a service whose requirements are all citizen
 * declarations asks for no consent at all, and telling that citizen to go and
 * consent would send them to a page with nothing on it (Phase 7 §31).
 *
 * While the consent query is still resolving, the notice says only what is
 * certainly true — the application is submitted and read-only.
 */
function SubmittedApplicationNotice({ applicationId }: { readonly applicationId: string }) {
  const consents = useApplicationConsents(applicationId);
  const isDecisionRequired = consents.data?.isDecisionRequired ?? false;

  if (isDecisionRequired) {
    return <Alert>
      <ShieldQuestion aria-hidden />
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>Your application was submitted. It needs your consent before SetuX can request the information required to verify it.</span>
        <Button asChild size="sm"><Link to={`/citizen/applications/${applicationId}/consent`}>Review consent request</Link></Button>
      </AlertDescription>
    </Alert>;
  }

  const hasDecidedConsents = (consents.data?.consents.length ?? 0) > 0;
  return <Alert>
    <CheckCircle2 aria-hidden />
    <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
      <span>Your application was submitted successfully and is now read-only.{hasDecidedConsents ? ' You have responded to every consent request. SetuX can now fetch the documents you allowed.' : ' Verification begins in later SetuX steps.'}</span>
      {hasDecidedConsents && <Button asChild size="sm" variant="outline"><Link to={`/citizen/applications/${applicationId}/consent`}>View consent decisions</Link></Button>}
    </AlertDescription>
  </Alert>;
}

function ReadOnlyField({ label, name, autoComplete, value, className = '' }: { readonly label: string; readonly name: string; readonly autoComplete: string; readonly value: string; readonly className?: string }) {
  return <label className={`grid gap-1.5 text-sm font-medium ${className}`}>{label}<input name={name} autoComplete={autoComplete} value={value} readOnly className="h-11 rounded-lg border border-input bg-muted/50 px-3 font-normal text-muted-foreground outline-none" /></label>;
}
