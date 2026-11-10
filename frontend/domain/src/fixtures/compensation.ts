/**
 * PRIVATE synthetic compensation & HR operations fixtures.
 * Never imported by public.ts / frontend/city (enforced by tests).
 */
import type {
  AttendanceEntry,
  CompensationRecord,
  CompensationStructure,
  LeaveRequest,
  PayComponent,
  PerformanceReview,
} from '../types';
import { createRng, addDays, isWeekend, hashString } from '../random';
import { DEMO_TODAY } from '../constants';
import { ORG_STAFF as ORG_EMPLOYEES } from './employees';

const GRADE_BASE: Record<string, number> = {
  'Engineering Manager': 1_500_000,
  'Senior Software Engineer': 1_250_000,
  'Software Engineer': 850_000,
  'Data Engineer': 900_000,
  'QA Engineer': 600_000,
  'Product Manager': 1_000_000,
  'Product Designer': 750_000,
  'UX Researcher': 650_000,
  'Customer Success Lead': 550_000,
  'Support Specialist': 300_000,
  'Implementation Manager': 600_000,
  'People Partner': 500_000,
  'Payroll Specialist': 450_000,
  'Finance Analyst': 500_000,
  'Account Executive': 480_000,
  'Marketing Manager': 650_000,
  'Partnerships Lead': 700_000,
  'Registered Nurse': 350_000,
  Physician: 900_000,
  Pharmacist: 450_000,
  'Lab Technician': 280_000,
  'Front Desk Officer': 180_000,
  'Billing Officer': 220_000,
  'Clinic Manager': 600_000,
};

export const PAY_COMPONENTS: PayComponent[] = [
  { id: 'pc-housing', name: 'Housing allowance', kind: 'allowance', calc: { type: 'percent', value: 15 }, taxable: true },
  { id: 'pc-transport', name: 'Transport allowance', kind: 'allowance', calc: { type: 'fixed', value: 40_000 }, taxable: true },
  { id: 'pc-remote', name: 'Home-office stipend', kind: 'allowance', calc: { type: 'fixed', value: 25_000 }, taxable: false },
  { id: 'pc-pension', name: 'Pension (illustrative 8%)', kind: 'deduction', calc: { type: 'percent', value: 8 }, taxable: false },
  { id: 'pc-hmo', name: 'HMO contribution', kind: 'deduction', calc: { type: 'fixed', value: 12_000 }, taxable: false },
];

export const COMPENSATION_STRUCTURES: CompensationStructure[] = [
  { id: 'cs-g1', grade: 'G1 · Associate', minBase: 150_000, maxBase: 400_000, componentIds: ['pc-housing', 'pc-transport', 'pc-pension', 'pc-hmo'] },
  { id: 'cs-g2', grade: 'G2 · Professional', minBase: 400_001, maxBase: 800_000, componentIds: ['pc-housing', 'pc-transport', 'pc-remote', 'pc-pension', 'pc-hmo'] },
  { id: 'cs-g3', grade: 'G3 · Senior', minBase: 800_001, maxBase: 1_300_000, componentIds: ['pc-housing', 'pc-transport', 'pc-remote', 'pc-pension', 'pc-hmo'] },
  { id: 'cs-g4', grade: 'G4 · Lead', minBase: 1_300_001, maxBase: 2_500_000, componentIds: ['pc-housing', 'pc-remote', 'pc-pension', 'pc-hmo'] },
];

export function structureForBase(base: number): CompensationStructure {
  return COMPENSATION_STRUCTURES.find((s) => base >= s.minBase && base <= s.maxBase) ?? COMPENSATION_STRUCTURES[0]!;
}

export interface OrgHrData {
  compensation: CompensationRecord[];
  attendance: AttendanceEntry[];
  leave: LeaveRequest[];
  reviews: PerformanceReview[];
}

function buildHr(orgId: string): OrgHrData {
  const employees = ORG_EMPLOYEES[orgId]!;
  const rng = createRng(hashString(`${orgId}:hr`));

  const compensation: CompensationRecord[] = employees.map((e) => {
    const base = Math.round(((GRADE_BASE[e.title] ?? 400_000) * (0.9 + rng.next() * 0.2)) / 5000) * 5000;
    return {
      employeeId: e.id,
      structureId: structureForBase(base).id,
      baseMonthly: base,
      currency: 'NGN',
      effectiveFrom: addDays(DEMO_TODAY, -rng.int(30, 300)),
      bankOnFile: rng.chance(0.9),
      history: [
        { date: e.startDate, baseMonthly: Math.round((base * 0.88) / 5000) * 5000, reason: 'Starting salary' },
        { date: addDays(DEMO_TODAY, -120), baseMonthly: base, reason: 'Annual review' },
      ],
    };
  });

  const attendance: AttendanceEntry[] = [];
  for (let d = 1; d <= 21; d++) {
    const date = addDays(DEMO_TODAY, -d);
    if (isWeekend(date)) continue;
    for (const e of employees) {
      if (e.status === 'onboarding') continue;
      const r = rng.next();
      const status: AttendanceEntry['status'] =
        e.status === 'on-leave' ? 'leave' : r < 0.05 ? 'absent' : r < 0.12 ? 'late' : r < 0.45 ? 'remote' : 'present';
      attendance.push({ employeeId: e.id, date, status, hours: status === 'absent' || status === 'leave' ? 0 : status === 'late' ? 7 : 8 });
    }
  }

  const leaveTypes: LeaveRequest['type'][] = ['annual', 'sick', 'study', 'annual', 'parental'];
  const leave: LeaveRequest[] = employees.slice(0, Math.ceil(employees.length / 3)).map((e, i) => {
    const start = addDays(DEMO_TODAY, rng.int(-20, 30));
    const days = rng.int(1, 8);
    const status: LeaveRequest['status'] = i % 3 === 0 ? 'pending' : i % 3 === 1 ? 'approved' : 'rejected';
    return {
      id: `leave-${e.id}`,
      employeeId: e.id,
      type: leaveTypes[i % leaveTypes.length]!,
      start,
      end: addDays(start, days - 1),
      days,
      reason: 'Synthetic request',
      status,
      decidedBy: status === 'pending' ? undefined : 'People team',
    };
  });

  const stages: PerformanceReview['status'][] = ['not-started', 'self-review', 'manager-review', 'calibrated', 'shared'];
  const reviews: PerformanceReview[] = employees
    .filter((e) => e.status !== 'onboarding')
    .map((e) => {
      const status = rng.pick(stages);
      return {
        id: `rev-${e.id}`,
        employeeId: e.id,
        cycle: '2026 H2',
        reviewer: employees.find((m) => m.id === e.managerId)?.name ?? 'Leadership team',
        status,
        rating: status === 'calibrated' || status === 'shared' ? rng.int(2, 5) : null,
        goals: [
          { title: 'Deliver quarterly objectives', progress: rng.int(30, 100) },
          { title: 'Grow a core skill', progress: rng.int(10, 100) },
        ],
        strengths: status === 'not-started' ? '' : 'Reliable delivery and strong collaboration (synthetic).',
        improvements: status === 'not-started' ? '' : 'Share progress earlier with stakeholders (synthetic).',
      };
    });

  return { compensation, attendance, leave, reviews };
}

export const ORG_HR: Record<string, OrgHrData> = {
  'kestrel-systems': buildHr('kestrel-systems'),
  'amberline-health': buildHr('amberline-health'),
};

export const LEAVE_ALLOWANCE: Record<LeaveRequest['type'], number> = {
  annual: 25,
  sick: 10,
  parental: 60,
  study: 5,
  unpaid: 30,
};
