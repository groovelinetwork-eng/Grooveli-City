'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { Button, MockNotice } from '@/components/ui/primitives';
import { ChoiceChips, Checkbox, TextField } from '@/components/ui/form';

type AccountType = 'individual' | 'organization';

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [type, setType] = useState<AccountType>(params.get('type') === 'organization' ? 'organization' : 'individual');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const signIn = useAction((persona: 'candidate' | 'org-admin', displayName: string) => getService().auth.signInDemo(persona, { displayName }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (name.trim().length < 2) errs.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email address.';
    if (password.length < 8) errs.password = 'Use at least 8 characters.';
    if (!terms) errs.terms = 'Please acknowledge the demo terms.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const res = await signIn.run(type === 'individual' ? 'candidate' : 'org-admin', name.trim());
    if (res) router.push(type === 'individual' ? '/onboarding/candidate' : '/onboarding/organization');
  };

  return (
    <div className="container section" style={{ maxWidth: 640 }}>
      <form className="card stack" style={{ ['--gap' as string]: '16px' }} onSubmit={submit} noValidate aria-labelledby="signup-title">
        <h1 id="signup-title">Create your Grooveli account</h1>
        <MockNotice title="Demo account">
          Nothing is registered with a server. Your details stay in this browser and only shape the demo experience.
        </MockNotice>
        <ChoiceChips<AccountType>
          legend="I'm joining as"
          value={type}
          onChange={(v) => setType(v as AccountType)}
          options={[
            { value: 'individual', label: '👤 An individual (career, jobs, community)' },
            { value: 'organization', label: '🏢 An organisation (recruit & manage teams)' },
          ]}
        />
        <TextField label={type === 'individual' ? 'Your name' : 'Your name (founding administrator)'} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} required autoComplete="name" />
        <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} required autoComplete="email" />
        <TextField label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} required autoComplete="new-password" hint="Not stored in demo mode." />
        <div>
          <Checkbox label="I understand this is a demo with synthetic data" checked={terms} onChange={(e) => setTerms(e.target.checked)} aria-invalid={errors.terms ? true : undefined} />
          {errors.terms ? (
            <p className="small" role="alert" style={{ color: 'var(--g-danger)' }}>
              {errors.terms}
            </p>
          ) : null}
        </div>
        <div className="row-between">
          <Button type="submit" variant="primary" pending={signIn.pending}>
            Continue to {type === 'individual' ? 'profile setup' : 'organisation setup'}
          </Button>
          <span className="small muted">
            Already have an account? <Link href="/login">Sign in</Link>
          </span>
        </div>
      </form>
    </div>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}
