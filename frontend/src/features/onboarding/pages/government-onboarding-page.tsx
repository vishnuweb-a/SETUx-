import {
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  IdCard,
  Landmark,
  Loader2,
  Phone,
  User,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth';
import {
  OnboardingField,
  OnboardingInput,
  VerifiedEmailField,
} from '../components/onboarding-field';
import { OnboardingScreenLayout } from '../components/onboarding-screen-layout';
import { OnboardingSteps } from '../components/onboarding-steps';
import { useOnboardingSubmit } from '../hooks/use-onboarding-submit';
import { governmentOnboardingFormSchema, validateForm } from '../schemas/onboarding.schemas';
import {
  fetchOrganizationDepartments,
  submitGovernmentOnboarding,
} from '../services/onboarding-service';
import type { OnboardingFieldErrors } from '../types/onboarding.types';

interface GovernmentFormState {
  organizationName: string;
  organizationCode: string;
  department: string;
  fullName: string;
  employeeId: string;
  designation: string;
  officialMobileNumber: string;
}

const EMPTY_FORM: GovernmentFormState = {
  organizationName: '',
  organizationCode: '',
  department: '',
  fullName: '',
  employeeId: '',
  designation: '',
  officialMobileNumber: '',
};

/** Debounce for the department lookup, so typing a code is not one call per key. */
const LOOKUP_DEBOUNCE_MS = 350;

/**
 * Government officer onboarding.
 *
 * Reproduces the approved reference in `reference/gov-employee-onboard.png`:
 * organization name full width, then organization code and department side by
 * side, the verified official email, official mobile, full name, and finally
 * employee ID and designation paired.
 *
 * The department is a **picker fed by the backend**, not a free-text box. The
 * officer's organization and department must resolve to registered reference
 * data for onboarding to succeed (onboarding.md §18), so the form offers the
 * valid set rather than letting the user guess and be rejected. Choosing from
 * that list grants nothing on its own: the backend re-resolves both against the
 * database and ignores anything the browser asserts.
 */
export function GovernmentOnboardingPage() {
  const { user } = useAuth();
  const [values, setValues] = useState<GovernmentFormState>(EMPTY_FORM);
  const [clientErrors, setClientErrors] = useState<OnboardingFieldErrors>({});
  const [lookedUpDepartments, setLookedUpDepartments] = useState<readonly string[]>([]);
  const [isLookingUp, setIsLookingUp] = useState(false);

  const { isSubmitting, errorMessage, fieldErrors, submit } =
    useOnboardingSubmit(submitGovernmentOnboarding);

  const errors: OnboardingFieldErrors = { ...clientErrors, ...fieldErrors };
  const organizationCode = values.organizationCode.trim();
  const isCodeLongEnough = organizationCode.length >= 2;

  /**
   * The options the picker may offer.
   *
   * Derived rather than stored for the "code too short" case: a code the user
   * has not finished typing has no departments by definition, so this is a
   * function of the current input, not a separate piece of state to keep in
   * sync (and setting state for it inside the effect would cause a cascading
   * render).
   */
  const departments = isCodeLongEnough ? lookedUpDepartments : [];

  /**
   * Looks up the organization behind the code the user typed.
   *
   * On a match the organization name is filled in from reference data and the
   * department list is populated — which also means the name the user submits
   * is the registered one, so the backend's name check passes for a genuine
   * code instead of failing on a typo.
   */
  useEffect(() => {
    if (!isCodeLongEnough) {
      return;
    }

    const controller = new AbortController();

    const timer = setTimeout(() => {
      setIsLookingUp(true);

      void fetchOrganizationDepartments(organizationCode, controller.signal)
        .then((result) => {
          setLookedUpDepartments(result.departments);

          if (result.organizationName) {
            setValues((current) => ({
              ...current,
              organizationName: result.organizationName ?? current.organizationName,
              // Drop a department that does not belong to the new organization,
              // so a code change cannot leave a stale pairing selected.
              department: result.departments.includes(current.department)
                ? current.department
                : '',
            }));
          }
        })
        // A failed lookup is not a form error: the user can still type, and the
        // backend remains the authority on whether the pair is valid.
        .catch(() => setLookedUpDepartments([]))
        .finally(() => {
          if (!controller.signal.aborted) setIsLookingUp(false);
        });
    }, LOOKUP_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isCodeLongEnough, organizationCode]);

  const setField = (field: keyof GovernmentFormState) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setClientErrors((current) => {
      if (!current[field]) return current;
      const { [field]: _removed, ...rest } = current;
      return rest;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const result = validateForm(governmentOnboardingFormSchema, values);

    if (!result.ok) {
      setClientErrors(result.errors);
      return;
    }

    setClientErrors({});
    await submit(result.data);
  };

  return (
    <OnboardingScreenLayout
      title={
        <>
          Complete your <span className="text-primary">organization profile</span>
        </>
      }
      subtitle="Let’s set up your government account."
      steps={<OnboardingSteps steps={['Organization Details', 'Review & Finish']} current={1} />}
      notice="This information helps SetuX verify your organization and provide secure access to government services."
      footnote="Your data is secure with SetuX and will never be shared without authorization."
      errorMessage={errorMessage}
      capabilities={[
        'Secure Access',
        'Verified Identity',
        'Department Integration',
        'Trusted Platform',
      ]}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <OnboardingField
          id="organizationName"
          label="Organization Name"
          required
          error={errors.organizationName}
          icon={<Building2 className="size-4" />}
        >
          <OnboardingInput
            id="organizationName"
            name="organizationName"
            autoComplete="organization"
            placeholder="Enter organization name"
            value={values.organizationName}
            onChange={(event) => setField('organizationName')(event.target.value)}
            disabled={isSubmitting}
            error={errors.organizationName}
            hasIcon
          />
        </OnboardingField>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <OnboardingField
            id="organizationCode"
            label="Organization ID / Code"
            required
            error={errors.organizationCode}
            icon={<IdCard className="size-4" />}
          >
            <OnboardingInput
              id="organizationCode"
              name="organizationCode"
              placeholder="Enter organization ID or code"
              value={values.organizationCode}
              onChange={(event) => setField('organizationCode')(event.target.value)}
              disabled={isSubmitting}
              error={errors.organizationCode}
              hasIcon
            />
          </OnboardingField>

          <OnboardingField
            id="department"
            label="Department / Ministry"
            required
            error={errors.department}
            icon={<Landmark className="size-4" />}
          >
            <select
              id="department"
              name="department"
              value={values.department}
              onChange={(event) => setField('department')(event.target.value)}
              disabled={isSubmitting || departments.length === 0}
              aria-invalid={errors.department ? true : undefined}
              aria-describedby={errors.department ? 'department-error' : undefined}
              className="h-12 w-full rounded-xl border border-input bg-secondary/30 pr-3 pl-10 text-sm shadow-sm transition-colors outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
            >
              <option value="">
                {isLookingUp
                  ? 'Looking up organization…'
                  : departments.length === 0
                    ? 'Enter an organization code first'
                    : 'Select department'}
              </option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </OnboardingField>
        </div>

        <VerifiedEmailField label="Official Email ID" email={user?.email ?? ''} />

        <OnboardingField
          id="officialMobileNumber"
          label="Official Mobile Number"
          required
          error={errors.officialMobileNumber}
          prefix={
            <span className="flex h-12 items-center gap-2 rounded-xl border border-input bg-secondary/40 px-3.5 text-sm">
              <Phone className="size-4 text-muted-foreground" aria-hidden />
              +91
            </span>
          }
        >
          <OnboardingInput
            id="officialMobileNumber"
            name="officialMobileNumber"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="Enter official mobile number"
            value={values.officialMobileNumber}
            onChange={(event) => setField('officialMobileNumber')(event.target.value)}
            disabled={isSubmitting}
            error={errors.officialMobileNumber}
          />
        </OnboardingField>

        <OnboardingField
          id="fullName"
          label="Full Name"
          required
          error={errors.fullName}
          icon={<User className="size-4" />}
        >
          <OnboardingInput
            id="fullName"
            name="fullName"
            autoComplete="name"
            placeholder="Enter your full name"
            value={values.fullName}
            onChange={(event) => setField('fullName')(event.target.value)}
            disabled={isSubmitting}
            error={errors.fullName}
            hasIcon
          />
        </OnboardingField>

        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <OnboardingField
            id="employeeId"
            label="Employee ID"
            required
            error={errors.employeeId}
            icon={<IdCard className="size-4" />}
          >
            <OnboardingInput
              id="employeeId"
              name="employeeId"
              placeholder="Enter employee ID"
              value={values.employeeId}
              onChange={(event) => setField('employeeId')(event.target.value)}
              disabled={isSubmitting}
              error={errors.employeeId}
              hasIcon
            />
          </OnboardingField>

          <OnboardingField
            id="designation"
            label="Designation / Role"
            required
            error={errors.designation}
            icon={<BriefcaseBusiness className="size-4" />}
          >
            <OnboardingInput
              id="designation"
              name="designation"
              placeholder="Enter designation or role"
              value={values.designation}
              onChange={(event) => setField('designation')(event.target.value)}
              disabled={isSubmitting}
              error={errors.designation}
              hasIcon
            />
          </OnboardingField>
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={isSubmitting}
          className="h-12 w-full rounded-xl text-base"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              Saving your profile…
            </>
          ) : (
            <>
              Continue to Review
              <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
      </form>
    </OnboardingScreenLayout>
  );
}
