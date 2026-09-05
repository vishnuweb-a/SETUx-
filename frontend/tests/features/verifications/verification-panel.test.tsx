import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/features/verifications/services/verification-service', () => ({
  fetchApplicationVerification: vi.fn(),
  startApplicationVerification: vi.fn(),
}));

const service = await import('@/features/verifications/services/verification-service');
const { VerificationPanel } = await import('@/features/verifications');
const { ApiError } = await import('@/services/api-client');

const mocks = {
  fetch: vi.mocked(service.fetchApplicationVerification),
  start: vi.mocked(service.startApplicationVerification),
};

const APPLICATION_ID = '22222222-2222-4222-8222-222222222222';
const VERIFIED_AT = '2026-09-05T09:00:00.000Z';

type Status = 'VERIFIED' | 'FAILED' | 'REQUIRES_ACTION' | null;
type Reason =
  | 'RULE_MATCH'
  | 'RULE_MISMATCH'
  | 'EVIDENCE_MISSING'
  | 'EVIDENCE_UNREADABLE'
  | 'NO_RULE_DEFINED'
  | null;
type Readiness = 'READY' | 'NOT_SUBMITTED' | 'EVIDENCE_INCOMPLETE' | 'ALREADY_STARTED';

const item = (
  overrides: Partial<{
    requirementCode: string;
    information: string;
    required: boolean;
    status: Status;
    reasonCode: Reason;
    verifiedAt: string | null;
  }> = {},
) => ({
  requirementCode: overrides.requirementCode ?? 'IDENTITY',
  information: overrides.information ?? 'Identity Verification',
  required: overrides.required ?? true,
  status: overrides.status ?? null,
  reasonCode: overrides.reasonCode ?? null,
  verifiedAt: overrides.verifiedAt ?? null,
});

const payload = (
  items: ReturnType<typeof item>[],
  readiness: Readiness,
  counts?: { verifiedCount: number; totalCount: number },
) => ({
  applicationId: APPLICATION_ID,
  applicationNumber: 'STX-2026-000013',
  serviceName: 'National Merit Scholarship',
  readiness,
  items,
  verifiedCount:
    counts?.verifiedCount ?? items.filter((entry) => entry.status === 'VERIFIED').length,
  totalCount: counts?.totalCount ?? items.length,
});

const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: '/citizen/applications/:applicationId',
        element: <VerificationPanel applicationId={APPLICATION_ID} />,
      },
      { path: '/citizen/applications/:applicationId/consent', element: <p>Consent page</p> },
    ],
    { initialEntries: [`/citizen/applications/${APPLICATION_ID}`] },
  );
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
};

const startButton = () => screen.getByRole('button', { name: /start verification/iu });

/** The status badge specifically, matched as a single element. */
const badge = (label: string) =>
  screen.findByText(
    (_, element) => element?.textContent?.trim() === label && element.tagName === 'SPAN',
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockResolvedValue(payload([item()], 'READY'));
});

describe('verification readiness', () => {
  it('offers the check once the server reports every requirement is ready', async () => {
    renderPanel();
    expect(await screen.findByRole('button', { name: /start verification/iu })).toBeVisible();
  });

  /**
   * The client must never decide readiness itself. Here the items look complete
   * but the server says otherwise, and the server wins — a browser that could
   * override this would be asking for a run the server has already refused.
   */
  it('does not offer the check while the server reports evidence outstanding', async () => {
    mocks.fetch.mockResolvedValue(payload([item()], 'EVIDENCE_INCOMPLETE'));
    renderPanel();
    expect(await screen.findByText(/still needs some of your information/iu)).toBeVisible();
    expect(screen.queryByRole('button', { name: /start verification/iu })).not.toBeInTheDocument();
  });

  it('does not offer the check before the application is submitted', async () => {
    mocks.fetch.mockResolvedValue(payload([item()], 'NOT_SUBMITTED'));
    renderPanel();
    expect(await screen.findByText(/begin once your application has been submitted/iu)).toBeVisible();
    expect(screen.queryByRole('button', { name: /start verification/iu })).not.toBeInTheDocument();
  });

  it('does not offer the check again once it has already run', async () => {
    mocks.fetch.mockResolvedValue(
      payload([item({ status: 'VERIFIED', reasonCode: 'RULE_MATCH' })], 'ALREADY_STARTED'),
    );
    renderPanel();
    await badge('Verified');
    expect(screen.queryByRole('button', { name: /start verification/iu })).not.toBeInTheDocument();
  });
});

describe('starting verification', () => {
  it('sends no body fields the server would have to reject', async () => {
    mocks.start.mockResolvedValue(
      payload([item({ status: 'VERIFIED', reasonCode: 'RULE_MATCH' })], 'ALREADY_STARTED'),
    );
    renderPanel();
    await screen.findByRole('button', { name: /start verification/iu });
    await userEvent.click(startButton());

    // The application id and nothing else. Every authoritative input is derived
    // server-side, so there is no argument here that could carry a forged
    // status, outcome or citizen id.
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith(APPLICATION_ID));
    expect(mocks.start).toHaveBeenCalledTimes(1);
  });

  it('announces the request while it is in flight', async () => {
    type Payload = Awaited<ReturnType<typeof service.startApplicationVerification>>;
    let release!: (value: Payload) => void;
    mocks.start.mockReturnValue(
      new Promise<Payload>((resolve) => {
        release = resolve;
      }),
    );
    renderPanel();
    await screen.findByRole('button', { name: /start verification/iu });
    await userEvent.click(startButton());

    const busy = await screen.findByRole('button', { name: /checking your information/iu });
    expect(busy).toHaveAttribute('aria-busy', 'true');
    expect(busy).toBeDisabled();

    release(payload([item({ status: 'VERIFIED', reasonCode: 'RULE_MATCH' })], 'ALREADY_STARTED'));
    await badge('Verified');
  });

  it('shows the outcome the server returned rather than an optimistic one', async () => {
    mocks.start.mockResolvedValue(
      payload(
        [item({ status: 'FAILED', reasonCode: 'RULE_MISMATCH' })],
        'ALREADY_STARTED',
        { verifiedCount: 0, totalCount: 1 },
      ),
    );
    renderPanel();
    await screen.findByRole('button', { name: /start verification/iu });
    await userEvent.click(startButton());

    // Nothing was ever shown as verified: the only outcome rendered is the
    // server's, and it was a failure.
    await badge('Could not be verified');
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
  });
});

describe('requirement outcomes', () => {
  it('reports a passing rule as verified', async () => {
    mocks.fetch.mockResolvedValue(
      payload(
        [item({ status: 'VERIFIED', reasonCode: 'RULE_MATCH', verifiedAt: VERIFIED_AT })],
        'ALREADY_STARTED',
      ),
    );
    renderPanel();
    expect(await badge('Verified')).toBeVisible();
    expect(screen.getByText(/matched the records held by the issuing department/iu)).toBeVisible();
  });

  /**
   * The load-bearing wording of the phase. A failed rule is a finding about one
   * requirement, and Phase 11 owns the decision — so this must never read as a
   * rejection.
   */
  it('reports a failing rule as unverified, never as a rejection', async () => {
    mocks.fetch.mockResolvedValue(
      payload([item({ status: 'FAILED', reasonCode: 'RULE_MISMATCH' })], 'ALREADY_STARTED'),
    );
    renderPanel();
    expect(await badge('Could not be verified')).toBeVisible();
    expect(screen.getByText(/an officer will look at it/iu)).toBeVisible();
    expect(screen.queryByText(/rejected/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/not eligible/iu)).not.toBeInTheDocument();
  });

  /**
   * REQUIRES_ACTION must stay itself. Rendering it as either a pass or a
   * rejection would invent an eligibility conclusion the repository does not
   * define.
   */
  it('reports an undecidable rule as needing review', async () => {
    mocks.fetch.mockResolvedValue(
      payload(
        [
          item({
            requirementCode: 'COMMUNITY_RECORD',
            information: 'Community Certificate',
            status: 'REQUIRES_ACTION',
            reasonCode: 'NO_RULE_DEFINED',
          }),
        ],
        'ALREADY_STARTED',
      ),
    );
    renderPanel();
    expect(await badge('Needs review')).toBeVisible();
    expect(screen.getByText(/no automatic rule for it, so an officer will review it/iu)).toBeVisible();
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.queryByText(/could not be verified/iu)).not.toBeInTheDocument();
  });

  it('distinguishes missing evidence from a rule that disagreed', async () => {
    mocks.fetch.mockResolvedValue(
      payload(
        [item({ status: 'REQUIRES_ACTION', reasonCode: 'EVIDENCE_MISSING' })],
        'ALREADY_STARTED',
      ),
    );
    renderPanel();
    expect(await badge('Needs review')).toBeVisible();
    expect(screen.getByText(/does not have this information yet/iu)).toBeVisible();
  });

  it('shows a requirement with no outcome as not yet checked', async () => {
    mocks.fetch.mockResolvedValue(payload([item()], 'READY'));
    renderPanel();
    expect(await badge('Not checked yet')).toBeVisible();
    expect(screen.getByText(/has not been checked yet/iu)).toBeVisible();
  });

  it('marks an optional requirement as optional', async () => {
    mocks.fetch.mockResolvedValue(
      payload([item({ requirementCode: 'BANK_DETAILS', required: false })], 'READY'),
    );
    renderPanel();
    expect(await screen.findByText('Optional')).toBeVisible();
  });
});

describe('progress', () => {
  it('derives progress from the counts the server reported', async () => {
    mocks.fetch.mockResolvedValue(
      payload(
        [
          item({ status: 'VERIFIED', reasonCode: 'RULE_MATCH' }),
          item({ requirementCode: 'INCOME_RECORD', information: 'Income Certificate' }),
          item({ requirementCode: 'EDUCATION_RECORD', information: 'Education Record' }),
          item({ requirementCode: 'BANK_DETAILS', information: 'Bank Proof' }),
        ],
        'ALREADY_STARTED',
        { verifiedCount: 3, totalCount: 4 },
      ),
    );
    renderPanel();

    const progress = await screen.findByRole('progressbar', { name: /requirements verified/iu });
    // The server's own numbers, not a count recomputed from the rendered rows
    // and not a hard-coded percentage.
    expect(progress).toHaveAttribute('aria-valuenow', '3');
    expect(progress).toHaveAttribute('aria-valuemax', '4');
    expect(screen.getByText('3 of 4 checks passed')).toBeVisible();
  });

  it('describes the lifecycle state without exposing the database value', async () => {
    mocks.fetch.mockResolvedValue(
      payload([item({ status: 'VERIFIED', reasonCode: 'RULE_MATCH' })], 'ALREADY_STARTED'),
    );
    renderPanel();
    expect(
      await screen.findByText('Verification complete — awaiting officer review'),
    ).toBeVisible();
    // The stored status is still VERIFICATION. The heading above is a derived
    // substate, and the raw database value must not appear either way.
    expect(screen.queryByText(/UNDER_VERIFICATION/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/^VERIFICATION$/u)).not.toBeInTheDocument();
  });

  /**
   * "Verification in progress" alongside "an officer reviews it next" described
   * two different states at once, and a citizen whose checks had all finished
   * was told SetuX was still working. The heading now follows the outcomes.
   *
   * A requirement that came back REQUIRES_ACTION or FAILED is FINISHED being
   * checked automatically — that is precisely why a person is next — so neither
   * keeps the panel in the "in progress" wording.
   */
  it('says verification is complete once every check has a final outcome', async () => {
    // The live acceptance case: 2 verified, 1 needing a person.
    mocks.fetch.mockResolvedValue(
      payload(
        [
          item({ requirementCode: 'IDENTITY', status: 'VERIFIED', reasonCode: 'RULE_MATCH' }),
          item({
            requirementCode: 'COMMUNITY_RECORD',
            information: 'Community Certificate',
            status: 'REQUIRES_ACTION',
            reasonCode: 'NO_RULE_DEFINED',
          }),
          item({ requirementCode: 'INCOME_RECORD', status: 'VERIFIED', reasonCode: 'RULE_MATCH' }),
        ],
        'ALREADY_STARTED',
        { verifiedCount: 2, totalCount: 3 },
      ),
    );
    renderPanel();

    expect(
      await screen.findByText('Verification complete — awaiting officer review'),
    ).toBeVisible();
    expect(
      screen.getByText(/SetuX has finished its automatic checks/u),
    ).toBeVisible();
    // The count is unchanged: it reports passed checks, and one did not pass.
    expect(screen.getByText('2 of 3 checks passed')).toBeVisible();
    // Still no decision claimed — completion is not approval.
    expect(screen.queryByText(/approved/iu)).not.toBeInTheDocument();
  });

  it('still says in progress while a check has no outcome yet', async () => {
    mocks.fetch.mockResolvedValue(
      payload(
        [
          item({ requirementCode: 'IDENTITY', status: 'VERIFIED', reasonCode: 'RULE_MATCH' }),
          item({ requirementCode: 'INCOME_RECORD', status: null, reasonCode: null }),
        ],
        'ALREADY_STARTED',
        { verifiedCount: 1, totalCount: 2 },
      ),
    );
    renderPanel();

    expect(await screen.findByText('Verification in progress')).toBeVisible();
    expect(
      screen.getByText(/Your application is with SetuX for checking/u),
    ).toBeVisible();
  });
});

describe('the phase boundary', () => {
  /**
   * Even with every rule passed, Phase 10 has reached no decision. Any word
   * suggesting one would tell the citizen their scholarship was granted.
   */
  it('never announces a decision, even when every check passed', async () => {
    mocks.fetch.mockResolvedValue(
      payload(
        [
          item({ status: 'VERIFIED', reasonCode: 'RULE_MATCH' }),
          item({
            requirementCode: 'INCOME_RECORD',
            information: 'Income Certificate',
            status: 'VERIFIED',
            reasonCode: 'RULE_MATCH',
          }),
        ],
        'ALREADY_STARTED',
      ),
    );
    renderPanel();
    // Both requirements verify, so the badge legitimately appears twice.
    await screen.findAllByText(
      (_, element) => element?.textContent?.trim() === 'Verified' && element.tagName === 'SPAN',
    );

    for (const forbidden of [
      /application approved/iu,
      /scholarship approved/iu,
      /you are eligible/iu,
      /final approval/iu,
      /payment approved/iu,
      /rejected/iu,
    ]) {
      expect(screen.queryByText(forbidden)).not.toBeInTheDocument();
    }
  });

  it('tells the citizen an officer decides, not SetuX', async () => {
    renderPanel();
    expect(
      await screen.findByText(/not a decision on your application/iu),
    ).toBeVisible();
  });
});

describe('error handling', () => {
  it('reports a conflict when verification has already run', async () => {
    mocks.start.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'VERIFICATION_ALREADY_STARTED',
        message: 'Verification has already been carried out for this application.',
      }),
    );
    renderPanel();
    await screen.findByRole('button', { name: /start verification/iu });
    await userEvent.click(startButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/already been carried out/iu);
  });

  it('reports evidence still outstanding in the server wording', async () => {
    mocks.start.mockRejectedValue(
      new ApiError({
        status: 409,
        code: 'VERIFICATION_EVIDENCE_INCOMPLETE',
        message: 'Retrieve the required information before verification can begin.',
      }),
    );
    renderPanel();
    await screen.findByRole('button', { name: /start verification/iu });
    await userEvent.click(startButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/retrieve the required information/iu);
  });

  /**
   * A 5xx is SetuX being unable to look at all. Presenting it as a failed check
   * would report a server fault as a judgement against the citizen.
   */
  it('does not present a system error as a failed check', async () => {
    mocks.start.mockRejectedValue(
      new ApiError({ status: 500, code: 'INTERNAL_ERROR', message: 'boom: at Object.<anonymous>' }),
    );
    renderPanel();
    await screen.findByRole('button', { name: /start verification/iu });
    await userEvent.click(startButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/could not be completed/iu);
    expect(alert).not.toHaveTextContent(/verification failed/iu);
    expect(alert).not.toHaveTextContent(/could not be verified/iu);
    // No stack trace or server internals reach the citizen.
    expect(alert).not.toHaveTextContent(/at Object/iu);
    expect(alert).not.toHaveTextContent(/boom/iu);
  });

  it('conceals another citizen application as absent', async () => {
    mocks.start.mockRejectedValue(
      new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Application not found' }),
    );
    renderPanel();
    await screen.findByRole('button', { name: /start verification/iu });
    await userEvent.click(startButton());

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be found/iu);
  });

  it('offers a retry when the overview itself cannot be loaded', async () => {
    mocks.fetch.mockRejectedValue(
      new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'Network request failed' }),
    );
    renderPanel();
    expect(await screen.findByText(/could not load verification/iu)).toBeVisible();
    expect(screen.getByRole('button', { name: /try again/iu })).toBeVisible();
  });
});

describe('accessibility', () => {
  it('names the overview region and its requirement headings', async () => {
    mocks.fetch.mockResolvedValue(
      payload([item({ status: 'VERIFIED', reasonCode: 'RULE_MATCH' })], 'ALREADY_STARTED'),
    );
    renderPanel();

    expect(
      await screen.findByRole('region', { name: /verification overview/iu }),
    ).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Identity Verification' })).toBeVisible();
  });

  it('activates the check from the keyboard', async () => {
    mocks.start.mockResolvedValue(
      payload([item({ status: 'VERIFIED', reasonCode: 'RULE_MATCH' })], 'ALREADY_STARTED'),
    );
    renderPanel();
    await screen.findByRole('button', { name: /start verification/iu });

    startButton().focus();
    expect(startButton()).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith(APPLICATION_ID));
  });

  /**
   * Status must never be carried by colour alone: every badge states its
   * meaning in words as well.
   */
  it('states each outcome in words, not only colour', async () => {
    mocks.fetch.mockResolvedValue(
      payload(
        [
          item({ status: 'VERIFIED', reasonCode: 'RULE_MATCH' }),
          item({
            requirementCode: 'INCOME_RECORD',
            information: 'Income Certificate',
            status: 'FAILED',
            reasonCode: 'RULE_MISMATCH',
          }),
          item({
            requirementCode: 'COMMUNITY_RECORD',
            information: 'Community Certificate',
            status: 'REQUIRES_ACTION',
            reasonCode: 'NO_RULE_DEFINED',
          }),
        ],
        'ALREADY_STARTED',
      ),
    );
    renderPanel();

    expect(await badge('Verified')).toBeVisible();
    expect(await badge('Could not be verified')).toBeVisible();
    expect(await badge('Needs review')).toBeVisible();
  });
});

/**
 * The retrieval mutation invalidates the verification summary by a literal key,
 * because importing `verificationKeys` into the retrievals feature would make
 * the two modules circular. This pins the literal to the real key so the two
 * cannot drift apart silently — a rename that broke the link would otherwise
 * only show up as a stale "evidence outstanding" in the browser.
 */
describe('cross-feature cache keys', () => {
  it('matches the literal key the retrieval mutation invalidates', async () => {
    const { verificationKeys } = await import('@/features/verifications');
    expect(verificationKeys.application(APPLICATION_ID)).toEqual([
      'verifications',
      'application',
      APPLICATION_ID,
    ]);
  });
});
