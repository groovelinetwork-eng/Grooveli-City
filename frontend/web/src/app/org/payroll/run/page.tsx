'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatNaira, type PayrollAdjustment, type PayrollPreview } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useOrgEmployees, useOrgId } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, PageHeader, Stat } from '@/components/ui/primitives';
import { SelectField, TextField } from '@/components/ui/form';
import { DataTable, Dialog } from '@/components/ui/widgets';
import { PayrollDisclaimer } from '@/components/payroll/payroll-notice';

function RunPreview() {
  const orgId = useOrgId()!;
  const employees = useOrgEmployees();
  const runs = useDemoStore((s) => s.payrollRuns);
  const [period, setPeriod] = useState('2026-11');
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [adj, setAdj] = useState<PayrollAdjustment>({ employeeId: employees[0]?.id ?? '', kind: 'bonus', label: '', amount: 0 });
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const prepare = useAction(() => getService().payroll.preparePreview(orgId, period, adjustments), { success: (p: PayrollPreview) => `Preview prepared for ${p.totals.headcount} employees` });
  const approve = useAction((id: string) => getService().payroll.approvePreview(id), { success: 'Preview approved — saved to history. No funds were moved.' });
  const discard = useAction((id: string) => getService().payroll.discardPreview(id), { success: 'Draft discarded' });
  const preview = runs.find((r) => r.id === previewId) ?? null;
  const name = (id: string) => employees.find((e) => e.id === id)?.name ?? id;

  return (
    <>
      <PageHeader title="Payroll run preview" description="Prepare a simulated payroll for a period, review payslips and approve the preview." />
      <div className="stack">
        <PayrollDisclaimer />
        <Card title="1. Period & adjustments">
          <div className="grid-2">
            <SelectField label="Pay period" value={period} onChange={(e) => setPeriod(e.target.value)} options={['2026-09', '2026-10', '2026-11', '2026-12'].map((p) => ({ value: p, label: p }))} />
          </div>
          <form
            className="grid"
            style={{ ['--min' as string]: '150px', alignItems: 'end', marginTop: 12 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!adj.employeeId || adj.amount <= 0) return;
              setAdjustments((a) => [...a, { ...adj, label: adj.label || (adj.kind === 'bonus' ? 'Bonus' : 'Deduction') }]);
              setAdj({ ...adj, label: '', amount: 0 });
            }}
          >
            <SelectField label="Employee" value={adj.employeeId} onChange={(e) => setAdj({ ...adj, employeeId: e.target.value })} options={employees.map((e) => ({ value: e.id, label: e.name }))} />
            <SelectField label="Type" value={adj.kind} onChange={(e) => setAdj({ ...adj, kind: e.target.value as 'bonus' | 'deduction' })} options={[{ value: 'bonus', label: 'Bonus' }, { value: 'deduction', label: 'Deduction' }]} />
            <TextField label="Label" value={adj.label} onChange={(e) => setAdj({ ...adj, label: e.target.value })} />
            <TextField label="Amount (₦)" type="number" min={0} step={1000} value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: Number(e.target.value) || 0 })} />
            <Button type="submit">Add adjustment</Button>
          </form>
          {adjustments.length ? (
            <ul className="small" style={{ paddingLeft: 20, marginTop: 8 }}>
              {adjustments.map((a, i) => (
                <li key={i}>
                  {name(a.employeeId)} — {a.kind} {a.label}: {formatNaira(a.amount)}{' '}
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAdjustments((l) => l.filter((_, j) => j !== i))} aria-label="Remove adjustment">
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div style={{ marginTop: 12 }}>
            <Button
              variant="primary"
              pending={prepare.pending}
              onClick={async () => {
                const p = await prepare.run();
                if (p) setPreviewId(p.id);
              }}
            >
              2. Prepare preview
            </Button>
          </div>
        </Card>
        {preview ? (
          <Card title={`3. Review — ${preview.period}`} actions={<Badge tone={preview.status === 'draft' ? 'warning' : 'success'}>{preview.status}</Badge>}>
            <div className="grid" style={{ ['--min' as string]: '150px', marginBottom: 12 }}>
              <Stat label="Employees" value={preview.totals.headcount} />
              <Stat label="Gross" value={formatNaira(preview.totals.gross, { compact: true })} />
              <Stat label="Deductions" value={formatNaira(preview.totals.deductions, { compact: true })} />
              <Stat label="Net" value={formatNaira(preview.totals.net, { compact: true })} />
              <Stat label="Warnings" value={preview.payslips.filter((p) => p.warnings.length).length} />
            </div>
            <DataTable
              caption="Payslip previews"
              rows={preview.payslips}
              rowKey={(p) => p.employeeId}
              columns={[
                { key: 'n', header: 'Employee', render: (p) => <Link href={`/org/payroll/payslips/${preview.id}/${p.employeeId}`}>{p.employeeName}</Link>, sortValue: (p) => p.employeeName },
                { key: 'g', header: 'Gross', numeric: true, render: (p) => formatNaira(p.gross), sortValue: (p) => p.gross },
                { key: 'd', header: 'Deductions', numeric: true, render: (p) => formatNaira(p.totalDeductions) },
                { key: 'net', header: 'Net', numeric: true, render: (p) => formatNaira(p.net), sortValue: (p) => p.net },
                { key: 'w', header: 'Warnings', render: (p) => (p.warnings.length ? <span className="small" style={{ color: 'var(--g-warning)' }}>{p.warnings.join(' ')}</span> : '—') },
              ]}
            />
            {preview.status === 'draft' ? (
              <div className="row" style={{ marginTop: 12 }}>
                <Button variant="primary" onClick={() => setConfirm(true)}>
                  4. Approve preview
                </Button>
                <Button
                  variant="danger"
                  onClick={async () => {
                    await discard.run(preview.id);
                    setPreviewId(null);
                  }}
                >
                  Discard draft
                </Button>
              </div>
            ) : (
              <p className="small muted" style={{ marginTop: 8 }}>
                Approved preview saved to <Link href="/org/payroll/history">history</Link>. No payment instruction exists.
              </p>
            )}
          </Card>
        ) : null}
      </div>
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Approve this payroll preview?"
        actions={
          <>
            <Button onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              variant="primary"
              pending={approve.pending}
              onClick={async () => {
                if (preview) await approve.run(preview.id);
                setConfirm(false);
              }}
            >
              Approve preview (simulated)
            </Button>
          </>
        }
      >
        <p>
          Approving records this preview in history and makes payslip previews visible to employees. <strong>No money is paid, no bank file is
          generated and nothing is filed.</strong>
        </p>
      </Dialog>
    </>
  );
}

export default function PayrollRunPage() {
  return (
    <OrgGate permission="payroll.prepare" module="payroll">
      <RunPreview />
    </OrgGate>
  );
}
