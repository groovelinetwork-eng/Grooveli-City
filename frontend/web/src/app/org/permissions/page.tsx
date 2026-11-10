'use client';

import { PERMISSION_LABELS, ROLE_LABELS, ROLE_PERMISSIONS, type OrgRole, type Permission } from '@grooveli/frontend-domain';
import { useRoles } from '@/lib/store/selectors';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Card, InfoNotice, PageHeader } from '@/components/ui/primitives';

const ROLES = Object.keys(ROLE_PERMISSIONS) as OrgRole[];
const PERMS = Object.keys(PERMISSION_LABELS) as Permission[];

export default function PermissionsPage() {
  const mine = useRoles();
  return (
    <OrgGate permission="org.members.manage">
      <PageHeader title="Permissions matrix" description="What each role can do in the workspace." badge={<Badge tone="warning">Proposed — pending approval</Badge>} />
      <div className="stack">
        <InfoNotice>
          This matrix drives navigation and page visibility in the frontend only. It is <strong>not</strong> security enforcement — the backend must
          authorise every request. The exact role matrix is an open product decision.
        </InfoNotice>
        <Card>
          <div className="table-wrap">
            <table className="table">
              <caption className="sr-only">Role permission matrix</caption>
              <thead>
                <tr>
                  <th scope="col">Permission</th>
                  {ROLES.map((r) => (
                    <th key={r} scope="col" style={{ textAlign: 'center' }}>
                      {ROLE_LABELS[r]}
                      {mine.includes(r) ? ' (you)' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMS.map((p) => (
                  <tr key={p}>
                    <th scope="row" style={{ textTransform: 'none', letterSpacing: 0, fontSize: '0.85rem', background: 'transparent', color: 'var(--g-text)' }}>
                      {PERMISSION_LABELS[p]}
                    </th>
                    {ROLES.map((r) => {
                      const has = ROLE_PERMISSIONS[r].includes(p);
                      return (
                        <td key={r} style={{ textAlign: 'center' }}>
                          <span aria-hidden="true">{has ? '✓' : '·'}</span>
                          <span className="sr-only">{has ? 'Allowed' : 'Not allowed'}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </OrgGate>
  );
}
