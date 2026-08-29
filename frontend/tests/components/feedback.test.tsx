import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { LoadingState, SkeletonList } from '@/components/feedback/loading-state';

describe('LoadingState', () => {
  it('exposes a live status region to assistive technology', () => {
    render(<LoadingState label="Contacting the API…" />);

    expect(screen.getByRole('status')).toHaveTextContent('Contacting the API…');
  });
});

describe('SkeletonList', () => {
  it('renders the requested number of placeholder rows', () => {
    const { container } = render(<SkeletonList rows={4} />);

    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(4);
  });
});

describe('ErrorState', () => {
  it('shows the request id so a user can quote it', () => {
    render(<ErrorState requestId="req_123" />);

    expect(screen.getByText(/req_123/)).toBeInTheDocument();
  });

  it('invokes the retry handler', async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('omits the retry action when no handler is given', () => {
    render(<ErrorState />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('renders the title and an optional action', () => {
    render(<EmptyState title="Nothing here" action={<button type="button">Add</button>} />);

    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });
});
