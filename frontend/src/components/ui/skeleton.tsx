import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

/** Placeholder block shown while content loads. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
