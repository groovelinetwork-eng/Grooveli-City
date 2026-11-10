'use client';

import { useEffect } from 'react';
import { ROLE_LABELS, isSafeId } from '@grooveli/frontend-domain';
import { AppShell, SessionGuard } from '@/components/shell/app-shell';
import { useOrgNav } from '@/components/shell/org-nav';
import { useRoles, useActiveOrg, membershipOrgIds } from '@/lib/store/selectors';
import { useDemoStore } from '@/lib/store/store';
import { getService } from '@/lib/services';
import { Badge, InfoNotice } from '@/components/ui/primitives';
import { useState } from 'react';

/**
 * Applies a validated `?org=` deep link (e.g. from a city HQ portal) when the
 * persona is a member of that organisation. Non-members see an explanation;
 * the backend must still authorise access in production.
 */
function useOrgDeepLink() {
  const [denied, setDenied] = useState<string | null>(null);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('org');
    if (!requested || !isSafeId(requested)) return;
    const state = useDemoStore.getState();
    if (state.session?.activeOrganizationId === requested) return;
    if (membershipOrgIds(state).includes(requested)) {
      void getService().auth.switchOrganization(requested);
    } else {
      setDenied(state.organizations.find((o) => o.id === requested)?.name ?? requested);
    }
  }, []);
  return denied;
}

function OrgShell({ children }: { children: React.ReactNode }) {
  const nav = useOrgNav();
  const roles = useRoles();
  const { organization } = useActiveOrg();
  const denied = useOrgDeepLink();
  return (
    <AppShell
      nav={nav}
      areaLabel={organization ? `${organization.name} workspace` : 'Organisation workspace'}
      topbarExtra={roles.length ? <Badge tone="primary">{roles.map((r) => ROLE_LABELS[r]).join(' + ')}</Badge> : <Badge>No role here</Badge>}
    >
      {denied ? (
        <div style={{ marginBottom: 16 }}>
          <InfoNotice>
            You followed a link to <strong>{denied}</strong>&apos;s employee area, but this persona isn&apos;t a verified member. Showing your own organisation
            instead.
          </InfoNotice>
        </div>
      ) : null}
      {children}
    </AppShell>
  );
}

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGuard allow={(p) => p !== 'candidate'}>
      <OrgShell>{children}</OrgShell>
    </SessionGuard>
  );
}
