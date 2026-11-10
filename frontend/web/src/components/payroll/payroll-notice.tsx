import { MockNotice } from '@/components/ui/primitives';

/** Mandatory disclaimer on every payroll surface. */
export function PayrollDisclaimer() {
  return (
    <MockNotice title="Payroll preview only">
      Figures are synthetic and the tax/pension arithmetic is illustrative — not compliant with any jurisdiction (an open decision). Nothing here
      processes pay, moves money, issues official payslips or files statutory returns. Real payroll requires approved backend services.
    </MockNotice>
  );
}
