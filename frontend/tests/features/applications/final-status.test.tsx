import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const { ApplicationStatusBadge } = await import(
  '@/features/applications/components/application-status-badge'
);

/**
 * The citizen's view of the Phase 11 final states.
 *
 * These two labels are the end of the demo journey: the officer's decision, as
 * the citizen reads it. The badge is what carries it in both "My Applications"
 * and the application detail, so testing the badge covers both surfaces.
 */
describe('citizen final status badge', () => {
  it('renders APPROVED as "Approved"', () => {
    render(<ApplicationStatusBadge status="APPROVED" />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('renders REJECTED as "Rejected"', () => {
    render(<ApplicationStatusBadge status="REJECTED" />);
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('never announces a decision for a status that has not reached one', () => {
    // The distinction Phase 10 established and Phase 11 must not erode: an
    // application whose checks have run is waiting for an officer, not accepted.
    render(<ApplicationStatusBadge status="VERIFICATION" />);

    expect(screen.getByText('Verification in progress')).toBeInTheDocument();
    expect(screen.queryByText('Approved')).not.toBeInTheDocument();
    expect(screen.queryByText('Rejected')).not.toBeInTheDocument();
  });
});
