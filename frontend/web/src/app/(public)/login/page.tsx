'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PERSONAS, type PersonaId } from '@grooveli/frontend-domain';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { safeNextPath } from '@/lib/auth/demo-session';
import { Button, Card, MockNotice } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/form';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const signIn = useAction((p: PersonaId) => getService().auth.signInDemo(p));

  const go = async (persona: PersonaId) => {
    const res = await signIn.run(persona);
    if (!res) return;
    const candidateNext = next?.startsWith('/app') || next?.startsWith('/opportunities') || next?.startsWith('/social');
    const orgNext = next?.startsWith('/org');
    router.push(next && ((persona === 'candidate' && candidateNext) || (persona !== 'candidate' && orgNext)) ? next : res.home);
  };

  return (
    <div className="container section" style={{ maxWidth: 920 }}>
      <div className="stack" style={{ ['--gap' as string]: '20px' }}>
        <header>
          <h1>Sign in</h1>
          <p className="muted">Choose a demo persona to explore each part of Grooveli.</p>
        </header>
        <MockNotice title="Demo sign-in">
          No credentials are checked and no secure session is created. A cookie simply remembers which demo persona you picked. Real authentication
          will be provided by the backend team.
        </MockNotice>
        <section aria-labelledby="personas">
          <h2 id="personas">Demo personas</h2>
          <ul className="grid" style={{ ['--min' as string]: '250px', listStyle: 'none', padding: 0, marginTop: 12 }}>
            {PERSONAS.map((p) => (
              <li key={p.id} className="card stack" style={{ ['--gap' as string]: '8px' }}>
                <h3>{p.label}</h3>
                <p className="small">
                  <strong>{p.displayName}</strong> — {p.description}
                </p>
                <Button variant="primary" onClick={() => go(p.id)} pending={signIn.pending} data-testid={`persona-${p.id}`}>
                  Continue as {p.label.toLowerCase()}
                </Button>
              </li>
            ))}
          </ul>
        </section>
        <Card title="Or use the email form (demo)">
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setError('Enter a valid email address.');
              if (password.length < 8) return setError('Password must be at least 8 characters.');
              setError(null);
              // Demo: the form is validated for UX, then signs in as the candidate persona. Nothing is sent anywhere.
              void go('candidate');
            }}
            noValidate
          >
            <div className="grid-2">
              <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <TextField
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                hint="Not stored or verified in demo mode."
              />
            </div>
            {error ? (
              <p className="small" role="alert" style={{ color: 'var(--g-danger)' }}>
                {error}
              </p>
            ) : null}
            <div className="row">
              <Button type="submit" variant="primary" pending={signIn.pending}>
                Sign in (demo candidate)
              </Button>
              <span className="small muted">
                New here? <Link href="/signup">Create an account</Link>
              </span>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
