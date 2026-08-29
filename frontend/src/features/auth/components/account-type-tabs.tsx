import { Landmark, User } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { USER_ROLES, type UserRole } from '../types/auth.types';

export interface AccountTypeTabsProps {
  readonly selected: UserRole;
  readonly onSelect: (role: UserRole) => void;
  readonly disabled?: boolean;
}

/**
 * The Citizen / Government Organization selector from the approved screen.
 *
 * **Presentation only.** It frames the form and changes labels; it never
 * carries authorization. On sign-in the backend resolves the real role from
 * `profiles`, and on registration the backend assigns CITIZEN regardless of
 * what is selected here (auth-api.md §2, §11).
 */
export function AccountTypeTabs({ selected, onSelect, disabled }: AccountTypeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Account type"
      className="grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
    >
      <ContextTab
        icon={<User className="size-4" aria-hidden />}
        label="Citizen"
        isSelected={selected === USER_ROLES.CITIZEN}
        onSelect={() => onSelect(USER_ROLES.CITIZEN)}
        disabled={disabled}
      />
      <ContextTab
        icon={<Landmark className="size-4" aria-hidden />}
        label="Government Organization"
        isSelected={selected === USER_ROLES.GOVERNMENT_OFFICER}
        onSelect={() => onSelect(USER_ROLES.GOVERNMENT_OFFICER)}
        disabled={disabled}
      />
    </div>
  );
}

interface ContextTabProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly isSelected: boolean;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
}

function ContextTab({ icon, label, isSelected, onSelect, disabled }: ContextTabProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        'flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        'focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        isSelected
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}
