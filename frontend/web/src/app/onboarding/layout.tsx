'use client';

import { SessionGuard } from '@/components/shell/app-shell';
import { SiteHeader } from '@/components/shell/site-chrome';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <SessionGuard allow={() => true}>
        <main id="main" className="container section" style={{ maxWidth: 980 }}>
          {children}
        </main>
      </SessionGuard>
    </>
  );
}
