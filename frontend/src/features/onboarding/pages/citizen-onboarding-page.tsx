import { ArrowRight, CalendarDays, IdCard, Loader2, Phone, User } from 'lucide-react';
import { useState, type FormEvent } from 'react';
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
import { citizenOnboardingFormSchema, validateForm } from '../schemas/onboarding.schemas';
import { submitCitizenOnboarding } from '../services/onboarding-service';
import type { OnboardingFieldErrors } from '../types/onboarding.types';

/** The form's raw state, before validation coerces and trims it. */
interface CitizenFormState {
  fullName: string;
  governmentId: string;
  mobileNumber: string;
  dateOfBirth: string;
}

const EMPTY_FORM: CitizenFormState = {
  fullName: '',
  governmentId: '',
  mobileNumber: '',
  dateOfBirth: '',
};

/**
 * Citizen onboarding.
 *
 * Reproduces the approved reference in `reference/user-onboard.png`: the
 * two-step header, the security notice, the verified email row, then full name,
 * government ID, mobile number and date of birth, over a full-width primary
 * action.
 *
 * The email is rendered read-only and is **not** submitted. The backend reads
 * it from the authenticated session, so collecting it here would be gathering
 * an identity claim the API is right to ignore (onboarding.md §11, §12).
 */
export function CitizenOnboardingPage() {
  const { user } = useAuth();
  const [values, setValues] = useState<CitizenFormState>(EMPTY_FORM);
  const [clientErrors, setClientErrors] = useState<OnboardingFieldErrors>({});

  const { isSubmitting, errorMessage, fieldErrors, submit } =
    useOnboardingSubmit(submitCitizenOnboarding);

  // The server's field errors win: they reflect a rule the browser could not
  // check, such as a government ID already registered to someone else.
  const errors: OnboardingFieldErrors = { ...clientErrors, ...fieldErrors };

  const setField = (field: keyof CitizenFormState) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));

    // Clearing this field's error as the user types keeps a stale complaint
    // from sitting under an input they have already corrected.
    setClientErrors((current) => {
      if (!current[field]) return current;
      const { [field]: _removed, ...rest } = current;
      return rest;
    });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const result = validateForm(citizenOnboardingFormSchema, values);

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
          Complete your <span className="text-primary">SetuX</span> profile
        </>
      }
      subtitle="Just a few details to get you started."
      steps={<OnboardingSteps steps={['Profile Setup', 'You’re Ready']} current={1} />}
      notice="Your information is used to create your SetuX profile and provide connected government services."
      footnote="Your data is secure with SetuX and will never be shared without your consent."
      errorMessage={errorMessage}
      capabilities={[
        'Identity Verification',
        'Digital Documents',
        'Department Integration',
        'Secure & Trusted',
      ]}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <VerifiedEmailField label="Email ID" email={user?.email ?? ''} />

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

        <OnboardingField
          id="governmentId"
          label="Government ID"
          required
          error={errors.governmentId}
          icon={<IdCard className="size-4" />}
        >
          <OnboardingInput
            id="governmentId"
            name="governmentId"
            placeholder="Enter your government-issued ID"
            value={values.governmentId}
            onChange={(event) => setField('governmentId')(event.target.value)}
            disabled={isSubmitting}
            error={errors.governmentId}
            hasIcon
          />
        </OnboardingField>

        <OnboardingField
          id="mobileNumber"
          label="Mobile Number"
          required
          error={errors.mobileNumber}
          prefix={
            // The country code is fixed rather than a select: the prototype's
            // validation accepts Indian numbers only, so offering others would
            // promise something the backend rejects.
            <span className="flex h-12 items-center gap-2 rounded-xl border border-input bg-secondary/40 px-3.5 text-sm">
              <Phone className="size-4 text-muted-foreground" aria-hidden />
              +91
            </span>
          }
        >
          <OnboardingInput
            id="mobileNumber"
            name="mobileNumber"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="Enter your mobile number"
            value={values.mobileNumber}
            onChange={(event) => setField('mobileNumber')(event.target.value)}
            disabled={isSubmitting}
            error={errors.mobileNumber}
          />
        </OnboardingField>

        <OnboardingField
          id="dateOfBirth"
          label="Date of Birth"
          required
          error={errors.dateOfBirth}
          icon={<CalendarDays className="size-4" />}
        >
          <OnboardingInput
            id="dateOfBirth"
            name="dateOfBirth"
            // A native date input gives a locale-correct picker and keyboard
            // support for free, and yields the ISO value the API expects.
            type="date"
            autoComplete="bday"
            max={new Date().toISOString().slice(0, 10)}
            value={values.dateOfBirth}
            onChange={(event) => setField('dateOfBirth')(event.target.value)}
            disabled={isSubmitting}
            error={errors.dateOfBirth}
            hasIcon
          />
        </OnboardingField>

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
              Continue to SetuX
              <ArrowRight className="size-4" aria-hidden />
            </>
          )}
        </Button>
      </form>
    </OnboardingScreenLayout>
  );
}
