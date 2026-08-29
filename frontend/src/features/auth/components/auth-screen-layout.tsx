import { Building2, FileCheck2, ShieldCheck, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { SetuxBrand } from './setux-brand';

export interface AuthScreenLayoutProps {
  /** Large heading; the trailing word is highlighted by the caller. */
  readonly title: ReactNode;
  readonly subtitle: string;
  readonly children: ReactNode;
}

/**
 * The split-panel shell of the approved SetuX authentication screen.
 *
 * Extracted so sign-in and registration are the same screen with different
 * contents — a second hand-built copy of this markup would drift from the
 * reference the first time either page changed.
 */
export function AuthScreenLayout({ title, subtitle, children }: AuthScreenLayoutProps) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-accent/40 p-4 sm:p-8">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-3xl bg-card shadow-xl lg:grid-cols-2">
        {/* Credential panel */}
        <div className="flex flex-col justify-center gap-6 p-8 sm:p-12">
          <SetuxBrand />

          <div className="space-y-1">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {children}
        </div>

        {/* Brand panel */}
        <div className="relative hidden flex-col justify-center gap-8 bg-primary p-12 lg:flex">
          <SetuxBrand tone="dark" className="items-center text-center [&>div]:justify-center" />

          <ul className="grid grid-cols-2 gap-4">
            <CapabilityCard
              icon={<User className="size-6" aria-hidden />}
              label="Identity Verification"
            />
            <CapabilityCard
              icon={<FileCheck2 className="size-6" aria-hidden />}
              label="Digital Documents"
            />
            <CapabilityCard
              icon={<Building2 className="size-6" aria-hidden />}
              label="Department Integration"
            />
            <CapabilityCard
              icon={<ShieldCheck className="size-6" aria-hidden />}
              label="Secure & Trusted"
            />
          </ul>

          <p className="text-center text-xs text-blue-100/80">
            Government systems are simulated with synthetic data for this SIH prototype.
          </p>
        </div>
      </div>
    </div>
  );
}

function CapabilityCard({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <li className="flex flex-col items-center gap-2 rounded-2xl bg-white/95 p-4 text-center">
      <span className="text-primary">{icon}</span>
      <span className="text-xs font-semibold text-foreground">{label}</span>
    </li>
  );
}
