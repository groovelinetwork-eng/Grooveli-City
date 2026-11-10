'use client';

import { DEFAULT_TIER_MODULES, MODULE_LABELS, type OrgModule, type SubscriptionTier } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useActiveOrg } from '@/lib/store/selectors';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, MockNotice, PageHeader } from '@/components/ui/primitives';
import { Checkbox } from '@/components/ui/form';

const TIERS: SubscriptionTier[] = ['starter', 'growth', 'enterprise'];
const MODULES = Object.keys(MODULE_LABELS) as OrgModule[];

function Subscription() {
  const { organization, workspace } = useActiveOrg();
  const overrides = useDemoStore((s) => s.tierModules);
  const setTier = useAction((t: SubscriptionTier) => getService().organizations.setTier(organization!.id, t), { success: 'Plan changed (mock — no billing)' });
  const setModules = useAction((t: SubscriptionTier, m: OrgModule[]) => getService().organizations.setTierModules(t, m), { success: 'Plan configuration updated' });
  return (
    <>
      <PageHeader title="Plan & modules" description="Module access by subscription tier." />
      <div className="stack">
        <MockNotice title="Configurable mock">Tiers, pricing and module bundles are not defined by the business yet. Changes here only toggle the demo gates — no billing.</MockNotice>
        <div className="grid-3">
          {TIERS.map((t) => {
            const modules = overrides[t] ?? DEFAULT_TIER_MODULES[t];
            const current = workspace?.tier === t;
            return (
              <Card key={t} title={<h2 style={{ textTransform: 'capitalize' }}>{t}</h2>} actions={current ? <Badge tone="success">Current</Badge> : null}>
                <div className="stack" style={{ ['--gap' as string]: '6px' }}>
                  {MODULES.map((m) => (
                    <Checkbox
                      key={m}
                      label={MODULE_LABELS[m]}
                      checked={modules.includes(m)}
                      onChange={(e) => setModules.run(t, e.target.checked ? [...modules, m] : modules.filter((x) => x !== m))}
                    />
                  ))}
                </div>
                <div className="row" style={{ marginTop: 12 }}>
                  {!current ? (
                    <Button size="sm" variant="primary" onClick={() => setTier.run(t)} pending={setTier.pending}>
                      Switch to {t}
                    </Button>
                  ) : null}
                  {overrides[t] ? (
                    <Button size="sm" variant="ghost" onClick={() => setModules.run(t, DEFAULT_TIER_MODULES[t])}>
                      Restore defaults
                    </Button>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default function SubscriptionPage() {
  return (
    <OrgGate permission="org.billing.view">
      <Subscription />
    </OrgGate>
  );
}
