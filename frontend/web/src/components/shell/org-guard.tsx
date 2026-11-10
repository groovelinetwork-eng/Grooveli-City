'use client';

import type { ReactNode } from 'react';
import { MODULE_LABELS, PERMISSION_LABELS, can, type OrgModule, type Permission } from '@grooveli/frontend-domain';
import { useActiveOrg, useModuleEnabled, useRoles } from '@/lib/store/selectors';
import { LinkButton } from '@/components/ui/primitives';

/**
 * Page-level UX gate for org modules. Shows a clear explanation instead of the
 * page when the persona lacks the permission or the (mock) plan lacks the module.
 * Not security enforcement — the backend is authoritative.
 */
export function OrgGate({ permission, module, children }: { permission?: Permission; module?: OrgModule; children: ReactNode }) {
  const roles = useRoles();
  const { organization, workspace } = useActiveOrg();
  const moduleOn = useModuleEnabled(module ?? 'hr');
  if (!organization || !workspace) {
    return (
      <div className="stack">
        <h1>No organisation selected</h1>
        <p className="muted">Create an organisation or switch to one you belong to.</p>
        <div>
          <LinkButton href="/onboarding/organization" variant="primary">
            Create an organisation
          </LinkButton>
        </div>
      </div>
    );
  }
  if (permission && !can(roles, permission)) {
    return (
      <div className="stack" role="alert">
        <h1>You don&apos;t have access to this page</h1>
        <p className="muted">
          This requires the <strong>{PERMISSION_LABELS[permission]}</strong> permission in {organization.name}. Ask an organisation admin to update your
          role. (Demo UX gate — real enforcement is backend-owned.)
        </p>
        <div>
          <LinkButton href="/org">Back to dashboard</LinkButton>
        </div>
      </div>
    );
  }
  if (module && !moduleOn) {
    return (
      <div className="stack" role="alert">
        <h1>{MODULE_LABELS[module]} isn&apos;t enabled</h1>
        <p className="muted">
          {organization.name} is on the <strong>{workspace.tier}</strong> plan, which doesn&apos;t include this module in the current mock configuration. Plans
          and pricing are not yet defined by the business.
        </p>
        <div className="row">
          {can(roles, 'org.billing.view') ? (
            <LinkButton href="/org/subscription" variant="primary">
              Review plan & modules
            </LinkButton>
          ) : null}
          <LinkButton href="/org">Back to dashboard</LinkButton>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
