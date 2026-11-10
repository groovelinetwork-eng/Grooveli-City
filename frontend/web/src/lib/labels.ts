import type { ApplicationStatus } from '@grooveli/frontend-domain';
import type { Tone } from '@/components/ui/primitives';

export const STATUS_TONE: Record<ApplicationStatus, Tone> = {
  submitted: 'default',
  screening: 'primary',
  shortlisted: 'primary',
  interview: 'warning',
  offer: 'success',
  hired: 'success',
  rejected: 'danger',
  withdrawn: 'default',
};

export const PIPELINE_STAGES: ApplicationStatus[] = ['submitted', 'screening', 'shortlisted', 'interview', 'offer', 'hired'];

export const EMPLOYEE_STATUS_TONE: Record<'active' | 'onboarding' | 'offboarding' | 'on-leave' | 'exited', Tone> = {
  active: 'success',
  onboarding: 'primary',
  offboarding: 'warning',
  'on-leave': 'warning',
  exited: 'default',
};
