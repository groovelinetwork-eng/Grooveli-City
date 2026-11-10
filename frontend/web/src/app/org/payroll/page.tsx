'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatDate, formatNaira, toCsv, type CompensationRecord } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useCan } from '@/lib/store/selectors';
import { useDeptName, useOrgEmployees, downloadCsv } from '@/lib/store/org-hooks';
import { getService } from '@/lib/services';
import { useAction } from '@/lib/hooks/use-action';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, PageHeader, Stat } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/form';
import { DataTable, Dialog } from '@/components/ui/widgets';
import { PayrollDisclaimer } from '@/components/payroll/payroll-notice';

function SalaryRecords() {
  const employees = useOrgEmployees();
  const comp = useDemoStore((s) => s.compensation);
  const structures = useDemoStore((s) => s.structures);
  const deptName = useDeptName();
  const canPrepare = useCan('payroll.prepare');
  const [edit, setEdit] = useState<{ record: CompensationRecord; base: number; reason: string } | null>(null);
  const update = useAction((id: string, base: number, reason: string) => getService().payroll.updateCompensation(id, base, reason), { success: 'Salary record updated (synthetic)' });
  const rows = useMemo(
    () =>
      employees
        .map((e) => ({ e, c: comp.find((c) => c.employeeId === e.id) }))
        .filter((r): r is { e: (typeof employees)[number]; c: CompensationRecord } => !!r.c),
    [employees, comp],
  );
  const total = rows.reduce((a, r) => a + r.c.baseMonthly, 0);
  const missingBank = rows.filter((r) => !r.c.bankOnFile).length;
  return (
    <>
      <PageHeader
        title="Salary records"
        description="Base compensation per employee."
        actions={<Button onClick={() => downloadCsv('salary-records.csv', toCsv(rows.map((r) => ({ employee: r.e.name, department: deptName(r.e.departmentId), grade: structures.find((s) => s.id === r.c.structureId)?.grade ?? '', base_monthly_ngn: r.c.baseMonthly, bank_on_file: r.c.bankOnFile }))))}>Export CSV</Button>}
      />
      <div className="stack">
        <PayrollDisclaimer />
        <div className="grid" style={{ ['--min' as string]: '160px' }}>
          <Stat label="Employees on payroll" value={rows.length} />
          <Stat label="Monthly base total" value={formatNaira(total, { compact: true })} />
          <Stat label="Average base" value={formatNaira(rows.length ? total / rows.length : 0, { compact: true })} />
          <Stat label="Missing bank details" value={missingBank} hint="Synthetic flag" />
        </div>
        <DataTable
          caption="Salary records"
          rows={rows}
          rowKey={(r) => r.e.id}
          columns={[
            { key: 'n', header: 'Employee', render: (r) => <Link href={`/org/people/${r.e.id}`}>{r.e.name}</Link>, sortValue: (r) => r.e.name },
            { key: 'd', header: 'Department', render: (r) => deptName(r.e.departmentId) },
            { key: 'g', header: 'Grade', render: (r) => structures.find((s) => s.id === r.c.structureId)?.grade ?? '—' },
            { key: 'b', header: 'Base / month', numeric: true, render: (r) => formatNaira(r.c.baseMonthly), sortValue: (r) => r.c.baseMonthly },
            { key: 'e', header: 'Effective', render: (r) => formatDate(r.c.effectiveFrom) },
            { key: 'k', header: 'Bank', render: (r) => (r.c.bankOnFile ? <Badge tone="success">on file</Badge> : <Badge tone="warning">missing</Badge>) },
            ...(canPrepare ? [{ key: 'x', header: '', render: (r: (typeof rows)[number]) => <Button size="sm" onClick={() => setEdit({ record: r.c, base: r.c.baseMonthly, reason: '' })}>Adjust</Button> }] : []),
          ]}
        />
      </div>
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title="Adjust base salary"
        actions={
          <>
            <Button onClick={() => setEdit(null)}>Cancel</Button>
            <Button
              variant="primary"
              pending={update.pending}
              onClick={async () => {
                if (edit && (await update.run(edit.record.employeeId, edit.base, edit.reason))) setEdit(null);
              }}
            >
              Save adjustment
            </Button>
          </>
        }
      >
        {edit ? (
          <>
            <TextField label="New base (₦/month)" type="number" min={0} step={5000} value={edit.base} onChange={(e) => setEdit({ ...edit, base: Number(e.target.value) || 0 })} />
            <TextField label="Reason" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} placeholder="e.g. Promotion" />
            <p className="small muted">The grade updates automatically from the new base. History is kept for audit (demo only).</p>
          </>
        ) : null}
      </Dialog>
    </>
  );
}

export default function PayrollPage() {
  return (
    <OrgGate permission="payroll.view" module="payroll">
      <SalaryRecords />
    </OrgGate>
  );
}
