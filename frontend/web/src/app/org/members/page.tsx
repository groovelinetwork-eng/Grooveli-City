'use client';

import { useState } from 'react';
import { ROLE_LABELS, formatDateTime, type OrgMember, type OrgRole } from '@grooveli/frontend-domain';
import { useActiveOrg } from '@/lib/store/selectors';
import { useDeptName } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, MockNotice, PageHeader } from '@/components/ui/primitives';
import { ChoiceChips, TextField } from '@/components/ui/form';
import { DataTable, Dialog } from '@/components/ui/widgets';

const ROLES: OrgRole[] = ['org-admin', 'hr-manager', 'recruiter', 'payroll-officer', 'manager', 'employee'];

function Members() {
  const { organization, workspace } = useActiveOrg();
  const deptName = useDeptName();
  const [editing, setEditing] = useState<OrgMember | null>(null);
  const [roles, setRoles] = useState<OrgRole[]>([]);
  const [email, setEmail] = useState('');
  const [inviteRoles, setInviteRoles] = useState<OrgRole[]>(['employee']);
  const orgId = organization!.id;
  const svc = getService().organizations;
  const saveRoles = useAction((id: string, r: OrgRole[]) => svc.setMemberRoles(orgId, id, r), { success: 'Roles updated' });
  const setStatus = useAction((id: string, s: 'active' | 'suspended') => svc.setMemberStatus(orgId, id, s), { success: 'Member updated' });
  const invite = useAction((e: string, r: OrgRole[]) => svc.invite(orgId, e, r), { success: 'Invitation created (no email sent)' });
  const revoke = useAction((id: string) => svc.revokeInvite(orgId, id), { success: 'Invitation revoked' });

  return (
    <>
      <PageHeader title="Members & roles" description="Invite colleagues, assign roles and recruitment responsibilities." />
      <div className="stack">
        <MockNotice title="Simulated invitations">Invitations are recorded locally; no email is sent and no one can accept them yet.</MockNotice>
        <Card title="Members">
          <DataTable
            caption="Organisation members"
            rows={workspace!.members}
            rowKey={(m) => m.id}
            columns={[
              { key: 'name', header: 'Name', render: (m) => <span>{m.name}<br /><span className="small muted">{m.email}</span></span>, sortValue: (m) => m.name },
              { key: 'roles', header: 'Roles', render: (m) => <span className="row">{m.roles.map((r) => <Badge key={r} tone="primary">{ROLE_LABELS[r]}</Badge>)}</span> },
              { key: 'dept', header: 'Department', render: (m) => deptName(m.departmentId) },
              { key: 'rec', header: 'Recruits for', render: (m) => (m.recruitingFor.length ? m.recruitingFor.map(deptName).join(', ') : '—') },
              { key: 'status', header: 'Status', render: (m) => <Badge tone={m.status === 'active' ? 'success' : 'warning'}>{m.status}</Badge> },
              {
                key: 'actions',
                header: 'Actions',
                render: (m) => (
                  <span className="row">
                    <Button size="sm" onClick={() => { setEditing(m); setRoles(m.roles); }}>Edit roles</Button>
                    <Button size="sm" variant="ghost" onClick={() => setStatus.run(m.id, m.status === 'active' ? 'suspended' : 'active')}>
                      {m.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        </Card>
        <Card title="Invite a team member">
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              await invite.run(email.trim().toLowerCase(), inviteRoles);
              setEmail('');
            }}
          >
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <ChoiceChips<OrgRole> legend="Roles" multiple value={inviteRoles} onChange={(v) => setInviteRoles(v as OrgRole[])} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
            <div>
              <Button type="submit" variant="primary" pending={invite.pending}>Send invitation</Button>
            </div>
          </form>
        </Card>
        <Card title="Invitations">
          <DataTable
            caption="Invitations"
            rows={workspace!.invitations}
            rowKey={(i) => i.id}
            empty="No invitations"
            columns={[
              { key: 'email', header: 'Email', render: (i) => i.email },
              { key: 'roles', header: 'Roles', render: (i) => i.roles.map((r) => ROLE_LABELS[r]).join(', ') },
              { key: 'sent', header: 'Sent', render: (i) => formatDateTime(i.sentAt) },
              { key: 'status', header: 'Status', render: (i) => <Badge tone={i.status === 'pending' ? 'warning' : 'default'}>{i.status}</Badge> },
              { key: 'a', header: '', render: (i) => (i.status === 'pending' ? <Button size="sm" variant="danger" onClick={() => revoke.run(i.id)}>Revoke</Button> : null) },
            ]}
          />
        </Card>
      </div>
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={`Roles for ${editing?.name ?? ''}`}
        actions={
          <>
            <Button onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              variant="primary"
              pending={saveRoles.pending}
              onClick={async () => {
                if (editing) await saveRoles.run(editing.id, roles);
                setEditing(null);
              }}
            >
              Save roles
            </Button>
          </>
        }
      >
        <ChoiceChips<OrgRole> legend="Roles" multiple value={roles} onChange={(v) => setRoles(v as OrgRole[])} options={ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
        <p className="small muted">The organisation must always keep at least one active admin.</p>
      </Dialog>
    </>
  );
}

export default function MembersPage() {
  return (
    <OrgGate permission="org.members.manage">
      <Members />
    </OrgGate>
  );
}
