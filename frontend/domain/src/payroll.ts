import type {
  CompensationRecord,
  CompensationStructure,
  EmployeeRecord,
  PayComponent,
  PayrollAdjustment,
  PayslipLine,
  PayslipPreview,
} from './types';

/**
 * ILLUSTRATIVE payroll preview arithmetic. NOT tax- or pension-compliant for
 * any jurisdiction (jurisdiction is an open decision). The banded
 * "illustrative income tax" exists only so previews look plausible; it must
 * never be used for real pay. No funds move anywhere in this build.
 */
export const ILLUSTRATIVE_TAX_BANDS: { upTo: number; rate: number }[] = [
  { upTo: 300_000, rate: 0.07 },
  { upTo: 800_000, rate: 0.15 },
  { upTo: Number.POSITIVE_INFINITY, rate: 0.21 },
];

export function illustrativeTax(taxableMonthly: number): number {
  let remaining = Math.max(taxableMonthly, 0);
  let prev = 0;
  let tax = 0;
  for (const band of ILLUSTRATIVE_TAX_BANDS) {
    const slice = Math.min(remaining, band.upTo - prev);
    tax += slice * band.rate;
    remaining -= slice;
    prev = band.upTo;
    if (remaining <= 0) break;
  }
  return Math.round(tax);
}

function componentAmount(c: PayComponent, base: number): number {
  return Math.round(c.calc.type === 'percent' ? (base * c.calc.value) / 100 : c.calc.value);
}

export function buildPayslipPreview(args: {
  employee: EmployeeRecord;
  record: CompensationRecord;
  structure: CompensationStructure;
  components: PayComponent[];
  adjustments: PayrollAdjustment[];
  period: string;
  /** Fraction of month payable (pro-rata for joiners/leavers). */
  proRata?: number;
}): PayslipPreview {
  const { employee, record, structure, components, adjustments, period } = args;
  const proRata = Math.min(1, Math.max(0, args.proRata ?? 1));
  const base = Math.round(record.baseMonthly * proRata);
  const lines: PayslipLine[] = [{ label: 'Base salary', amount: base, kind: 'earning' }];
  let taxable = base;
  const comps = components.filter((c) => structure.componentIds.includes(c.id));
  for (const c of comps.filter((x) => x.kind === 'allowance')) {
    const amt = Math.round(componentAmount(c, record.baseMonthly) * proRata);
    lines.push({ label: c.name, amount: amt, kind: 'earning' });
    if (c.taxable) taxable += amt;
  }
  for (const adj of adjustments.filter((a) => a.employeeId === employee.id && a.kind === 'bonus')) {
    lines.push({ label: adj.label || 'Bonus', amount: adj.amount, kind: 'earning' });
    taxable += adj.amount;
  }
  for (const c of comps.filter((x) => x.kind === 'deduction')) {
    lines.push({ label: c.name, amount: Math.round(componentAmount(c, record.baseMonthly) * proRata), kind: 'deduction' });
  }
  lines.push({ label: 'Income tax (illustrative)', amount: illustrativeTax(taxable), kind: 'deduction' });
  for (const adj of adjustments.filter((a) => a.employeeId === employee.id && a.kind === 'deduction')) {
    lines.push({ label: adj.label || 'Deduction', amount: adj.amount, kind: 'deduction' });
  }
  const gross = lines.filter((l) => l.kind === 'earning').reduce((a, l) => a + l.amount, 0);
  const totalDeductions = lines.filter((l) => l.kind === 'deduction').reduce((a, l) => a + l.amount, 0);
  const warnings: string[] = [];
  if (!record.bankOnFile) warnings.push('No bank details on file (synthetic flag).');
  if (record.baseMonthly < structure.minBase || record.baseMonthly > structure.maxBase) warnings.push(`Base outside ${structure.grade} band.`);
  if (proRata < 1) warnings.push(`Pro-rated at ${Math.round(proRata * 100)}%.`);
  if (gross - totalDeductions < 0) warnings.push('Net pay is negative — review deductions.');
  return {
    employeeId: employee.id,
    employeeName: employee.name,
    period,
    lines,
    gross,
    totalDeductions,
    net: gross - totalDeductions,
    warnings,
  };
}

export function summarisePayslips(payslips: PayslipPreview[]) {
  return {
    gross: payslips.reduce((a, p) => a + p.gross, 0),
    deductions: payslips.reduce((a, p) => a + p.totalDeductions, 0),
    net: payslips.reduce((a, p) => a + p.net, 0),
    headcount: payslips.length,
  };
}
