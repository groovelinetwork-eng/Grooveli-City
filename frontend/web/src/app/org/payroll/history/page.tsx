'use client';

import Link from 'next/link';
import { useShallow } from 'zustand/react/shallow';
import { formatDateTime, formatNaira } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useCan } from '@/lib/store/selectors';
import { useOrgId } from '@/lib/store/org-hooks';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Card, EmptyState, LinkButton, PageHeader } from '@/components/ui/primitives';
import { DataTable } from '@/components/ui/widgets';
import { PayrollDisclaimer } from '@/components/payroll/payroll-notice';

function History() {
  const orgId = useOrgId();
  const runs = useDemoStore(useShallow((s) => s.payrollRuns.filter((r) => r.organizationId === orgId)));
  const canPrepare = useCan('payroll.prepare');
  return (
    <>
      <PageHeader title="Payroll history & payslips" description="Approved previews and drafts." actions={canPrepare ? <LinkButton href="/org/payroll/run" variant="primary">New preview</LinkButton> : null} />
      <div className="stack">
        <PayrollDisclaimer />
        {runs.length === 0 ? (
          <EmptyState title="No payroll previews yet">{canPrepare ? 'Prepare one from Payroll run preview.' : 'A payroll officer prepares previews.'}</EmptyState>
        ) : (
          runs.map((r) => (
            <Card
              key={r.id}
              title={<h2 style={{ fontSize: '1.05rem' }}>{r.period}</h2>}
              actions={
                <>
                  <Badge tone={r.status === 'approved-preview' ? 'success' : 'warning'}>{r.status}</Badge>
                  <Badge tone="mock">simulated</Badge>
                </>
              }
            >
              <p className="small muted">
                Prepared {formatDateTime(r.createdAt)} · {r.totals.headcount} employees · gross {formatNaira(r.totals.gross)} · net {formatNaira(r.totals.net)}
              </p>
              <details>
                <summary className="small" style={{ cursor: 'pointer' }}>
                  Payslips ({r.payslips.length})
                </summary>
                <DataTable
                  caption={`Payslips ${r.period}`}
                  rows={r.payslips}
                  rowKey={(p) => p.employeeId}
                  pageSize={10}
                  columns={[
                    { key: 'n', header: 'Employee', render: (p) => <Link href={`/org/payroll/payslips/${r.id}/${p.employeeId}`}>{p.employeeName}</Link> },
                    { key: 'g', header: 'Gross', numeric: true, render: (p) => formatNaira(p.gross) },
                    { key: 'net', header: 'Net', numeric: true, render: (p) => formatNaira(p.net) },
                  ]}
                />
              </details>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

export default function PayrollHistoryPage() {
  return (
    <OrgGate permission="payroll.view" module="payroll">
      <History />
    </OrgGate>
  );
}
