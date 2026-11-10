'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getPersona } from '@grooveli/frontend-domain';
import { useDemoStore, useHydrated } from '@/lib/store/store';
import { LoadingState } from '@/components/ui/primitives';

/** Legacy scaffold route kept for compatibility; forwards to the persona's home. */
export default function DashboardRedirect() {
  const router = useRouter();
  const hydrated = useHydrated();
  const session = useDemoStore((s) => s.session);
  useEffect(() => {
    if (!hydrated) return;
    router.replace(session ? getPersona(session.personaId)?.home ?? '/app' : '/login');
  }, [hydrated, session, router]);
  return (
    <main id="main" className="container section">
      <LoadingState label="Opening your workspace" />
    </main>
  );
}
