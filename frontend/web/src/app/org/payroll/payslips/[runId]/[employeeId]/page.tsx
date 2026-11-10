'use client';

import Link from 'next/link';
import { use } from 'react';
import { can, formatNaira } from '@grooveli/frontend-domain';
import { useDemoStore } from '@/lib/store/store';
import { useActiveOrg, useModuleEnabled, useRoles } from '@/lib/store/selectors';
import { useSelfEmployee } from '@/lib/store/org-hooks';
import { OrgGate } from '@/components/shell/org-guard';
import { Badge, Button, Card, EmptyState, LinkButton } from '@/components/ui/primitives';
import { PayrollDisclaimer } from '@/components/payroll/payroll-notice';

/** Payslip PREVIEW. Visible to payroll viewers, or to the employee for their own approved preview. */
export default function PayslipPage({ params }: { params: Promise<{ runId: string; employeeId: string }> }) {
  const { runId, employeeId } = use(params);
  const run = useDemoStore((s) => s.payrollRuns.find((r) => r.id === runId));
  const { organization } = useActiveOrg();
  const roles = useRoles();
  const me = useSelfEmployee();
  const payrollOn = useModuleEnabled('payroll');
  const slip = run?.payslips.find((p) => p.employeeId === employeeId);
  const allowed = can(roles, 'payroll.view') || (me?.id === employeeId && run?.status === 'approved-preview');

  return (
    <OrgGate>
      {!payrollOn ? (
        <EmptyState title="Payroll is not enabled on this plan" />
      ) : !run || !slip || run.organizationId !== organization?.id ? (
        <EmptyState title="Payslip preview not found" action={<LinkButton href="/org">Back</LinkButton>} />
      ) : !allowed ? (
        <EmptyState title="You can only view your own approved payslip previews" />
      ) : (
        <div className="stack" style={{ maxWidth: 720 }}>
          <nav aria-label="Breadcrumb" className="small">
            <Link href={can(roles, 'payroll.view') ? '/org/payroll/history' : '/org/me'}>Back</Link>
          </nav>
          <PayrollDisclaimer />
          <Card
            title={
              <div>
                <h1 style={{ fontSize: '1.3rem' }}>Payslip preview · {run.period}</h1>
                <p className="small muted">
                  {organization?.name} · {slip.employeeName}
                </p>
              </div>
            }
            actions={
              <>
                <Badge tone="mock">NOT AN OFFICIAL PAYSLIP</Badge>
                <Button size="sm" onClick={() => window.print()}>
                  Print
                </Button>
              </>
            }
          >
            <div className="grid-2">
              {(['earning', 'deduction'] as const).map((kind) => (
                <table key={kind} className="table">
                  <caption style={{ textAlign: 'left', fontWeight: 600, padding: '6px 0' }}>{kind === 'earning' ? 'Earnings' : 'Deductions'}</caption>
                  <tbody>
                    {slip.lines
                      .filter((l) => l.kind === kind)
                      .map((l) => (
                        <tr key={l.label}>
                          <td>{l.label}</td>
                          <td className="num">{formatNaira(l.amount)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ))}
            </div>
            <dl className="row" style={{ ['--gap' as string]: '24px', marginTop: 16 }}>
              <div>
                <dt className="small muted">Gross</dt>
                <dd className="stat-value">{formatNaira(slip.gross)}</dd>
              </div>
              <div>
                <dt className="small muted">Deductions</dt>
                <dd className="stat-value">{formatNaira(slip.totalDeductions)}</dd>
              </div>
              <div>
                <dt className="small muted">Net (illustrative)</dt>
                <dd className="stat-value">{formatNaira(slip.net)}</dd>
              </div>
            </dl>
            {slip.warnings.length ? <p className="small" style={{ color: 'var(--g-warning)', marginTop: 8 }}>⚠ {slip.warnings.join(' ')}</p> : null}
          </Card>
        </div>
      )}
    </OrgGate>
  );
}
