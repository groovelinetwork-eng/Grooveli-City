'use client';

import { useState } from 'react';
import { formatNaira, type PayComponent } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useCan } from '@/lib/store/selectors';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, PageHeader } from '@/components/ui/primitives';
import { Checkbox, SelectField, TextField } from '@/components/ui/form';
import { DataTable, Dialog } from '@/components/ui/widgets';
import { PayrollDisclaimer } from '@/components/payroll/payroll-notice';

const blank = (): PayComponent => ({ id: `pc-${Date.now().toString(36)}`, name: '', kind: 'allowance', calc: { type: 'fixed', value: 0 }, taxable: true });

function Structures() {
  const components = useDemoStore((s) => s.payComponents);
  const structures = useDemoStore((s) => s.structures);
  const canPrepare = useCan('payroll.prepare');
  const [edit, setEdit] = useState<PayComponent | null>(null);
  const save = useAction((c: PayComponent) => getService().payroll.savePayComponent(c), { success: 'Component saved' });
  const setComps = useAction((id: string, ids: string[]) => getService().payroll.setStructureComponents(id, ids), { success: 'Structure updated' });
  const describe = (c: PayComponent) => (c.calc.type === 'percent' ? `${c.calc.value}% of base` : `${formatNaira(c.calc.value)} / month`);
  return (
    <>
      <PageHeader title="Compensation structures" description="Grades, allowances, bonuses and deductions used to build payroll previews." actions={canPrepare ? <Button variant="primary" onClick={() => setEdit(blank())}>New component</Button> : null} />
      <div className="stack">
        <PayrollDisclaimer />
        <Card title="Allowances & deductions">
          <DataTable
            caption="Pay components"
            rows={components}
            rowKey={(c) => c.id}
            columns={[
              { key: 'n', header: 'Component', render: (c) => c.name },
              { key: 'k', header: 'Kind', render: (c) => <Badge tone={c.kind === 'allowance' ? 'success' : 'warning'}>{c.kind}</Badge> },
              { key: 'c', header: 'Calculation', render: describe },
              { key: 't', header: 'Taxable', render: (c) => (c.kind === 'allowance' ? (c.taxable ? 'Yes' : 'No') : '—') },
              ...(canPrepare ? [{ key: 'x', header: '', render: (c: PayComponent) => <Button size="sm" onClick={() => setEdit(c)}>Edit</Button> }] : []),
            ]}
          />
        </Card>
        <div className="grid-2">
          {structures.map((s) => (
            <Card key={s.id} title={<h2 style={{ fontSize: '1rem' }}>{s.grade}</h2>} actions={<Badge>{formatNaira(s.minBase, { compact: true })}–{formatNaira(s.maxBase, { compact: true })}</Badge>}>
              <div className="stack" style={{ ['--gap' as string]: '4px' }}>
                {components.map((c) => (
                  <Checkbox
                    key={c.id}
                    label={`${c.name} (${describe(c)})`}
                    checked={s.componentIds.includes(c.id)}
                    disabled={!canPrepare}
                    onChange={(e) => setComps.run(s.id, e.target.checked ? [...s.componentIds, c.id] : s.componentIds.filter((x) => x !== c.id))}
                  />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={edit?.name ? `Edit ${edit.name}` : 'New pay component'}
        actions={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              pending={save.pending}
              onClick={async () => {
                if (edit && (await save.run(edit))) setEdit(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {edit ? (
          <>
            <TextField label="Name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <div className="grid-2">
              <SelectField label="Kind" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as PayComponent['kind'] })} options={[{ value: 'allowance', label: 'Allowance' }, { value: 'deduction', label: 'Deduction' }]} />
              <SelectField
                label="Calculation"
                value={edit.calc.type}
                onChange={(e) => setEdit({ ...edit, calc: { type: e.target.value as 'fixed' | 'percent', value: edit.calc.value } })}
                options={[{ value: 'fixed', label: 'Fixed ₦/month' }, { value: 'percent', label: '% of base' }]}
              />
            </div>
            <TextField label={edit.calc.type === 'percent' ? 'Percent' : 'Amount (₦)'} type="number" min={0} value={edit.calc.value} onChange={(e) => setEdit({ ...edit, calc: { ...edit.calc, value: Number(e.target.value) || 0 } })} />
            {edit.kind === 'allowance' ? <Checkbox label="Taxable (illustrative)" checked={edit.taxable} onChange={(e) => setEdit({ ...edit, taxable: e.target.checked })} /> : null}
          </>
        ) : null}
      </Dialog>
    </>
  );
}

export default function StructuresPage() {
  return (
    <OrgGate permission="payroll.view" module="payroll">
      <Structures />
    </OrgGate>
  );
}
