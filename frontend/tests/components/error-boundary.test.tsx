import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/components/feedback/error-boundary';

function Explode(): never {
  throw new Error('boom');
}

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>safe content</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('safe content')).toBeInTheDocument();
  });

  it('renders a fallback instead of unmounting when a child throws', () => {
    // React logs the caught error; silence it so the run stays readable.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <Explode />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('renders a custom fallback when one is supplied', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary fallback={<p>custom fallback</p>}>
        <Explode />
      </ErrorBoundary>,
    );

    expect(screen.getByText('custom fallback')).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
