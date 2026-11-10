'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrganizationPublicProfile, WorkMode } from '@grooveli/frontend-domain';
import { useActiveOrg } from '@/lib/store/selectors';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Button, Card, PageHeader } from '@/components/ui/primitives';
import { ChoiceChips, TextArea, TextField } from '@/components/ui/form';
import { Dialog } from '@/components/ui/widgets';

function Settings({ org }: { org: OrganizationPublicProfile }) {
  const router = useRouter();
  const [p, setP] = useState(org);
  const [confirm, setConfirm] = useState(false);
  const save = useAction((patch: Partial<OrganizationPublicProfile>) => getService().organizations.updateProfile(org.id, patch), { success: 'Organisation profile saved' });
  const reset = useAction(() => getService().demo.reset(), { success: 'Demo data reset' });
  const set = <K extends keyof OrganizationPublicProfile>(k: K, v: OrganizationPublicProfile[K]) => setP((x) => ({ ...x, [k]: v }));
  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
  const dirty = JSON.stringify(p) !== JSON.stringify(org);
  return (
    <>
      <PageHeader
        title="Organisation profile"
        description="Your public identity — shown on the company page and in your virtual HQ."
        actions={<Button variant="primary" disabled={!dirty || p.name.trim().length < 2} pending={save.pending} onClick={() => save.run(p)}>Save</Button>}
      />
      <div className="stack">
        <Card title="Company">
          <div className="grid-2">
            <TextField label="Name" value={p.name} onChange={(e) => set('name', e.target.value)} error={p.name.trim().length < 2 ? 'Required' : null} />
            <TextField label="Tagline" value={p.tagline} onChange={(e) => set('tagline', e.target.value)} />
            <TextField label="Industry" value={p.industry} onChange={(e) => set('industry', e.target.value)} />
            <TextField label="Website" value={p.website} onChange={(e) => set('website', e.target.value)} />
            <TextField label="Structure" value={p.structure} onChange={(e) => set('structure', e.target.value)} />
            <TextField label="Headquarters" value={p.headquarters} onChange={(e) => set('headquarters', e.target.value)} />
          </div>
          <div style={{ marginTop: 12 }}>
            <TextArea label="Description" value={p.description} onChange={(e) => set('description', e.target.value)} />
          </div>
        </Card>
        <Card title="Culture, values & benefits">
          <div className="stack">
            <TextField label="Values (comma separated)" value={p.values.join(', ')} onChange={(e) => set('values', split(e.target.value))} />
            <ChoiceChips<WorkMode>
              legend="Working arrangements"
              multiple
              value={p.workArrangements}
              onChange={(v) => set('workArrangements', v as WorkMode[])}
              options={[
                { value: 'remote', label: 'Remote' },
                { value: 'hybrid', label: 'Hybrid' },
                { value: 'onsite', label: 'Onsite' },
              ]}
            />
            <div className="grid-2">
              {(Object.keys(p.culture) as (keyof OrganizationPublicProfile['culture'])[]).map((k) => (
                <TextArea key={k} label={k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())} value={p.culture[k]} onChange={(e) => set('culture', { ...p.culture, [k]: e.target.value })} />
              ))}
            </div>
            <TextField label="Benefits (comma separated)" value={p.benefits.join(', ')} onChange={(e) => set('benefits', split(e.target.value))} />
          </div>
        </Card>
        <Card title="Demo data">
          <p className="small muted">Reset every persona&apos;s changes in this browser back to the synthetic baseline.</p>
          <div style={{ marginTop: 10 }}>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              Reset demo data…
            </Button>
          </div>
        </Card>
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Reset demo data?"
        actions={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="danger"
              pending={reset.pending}
              onClick={async () => {
                await reset.run();
                setConfirm(false);
                router.push('/org');
              }}
            >
              Reset
            </Button>
          </>
        }
      >
        <p>Organisations you created, vacancies, payroll previews and all other changes will be removed.</p>
      </Dialog>
    </>
  );
}

export default function OrgSettingsPage() {
  const { organization } = useActiveOrg();
  return <OrgGate permission="org.settings.manage">{organization ? <Settings key={organization.id} org={organization} /> : null}</OrgGate>;
}
