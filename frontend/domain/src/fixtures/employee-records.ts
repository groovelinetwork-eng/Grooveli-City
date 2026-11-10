/**
 * PRIVATE full employee records (contact details, documents, lifecycle tasks).
 * Never imported by public.ts / frontend/city.
 */
import type { EmployeeRecord } from '../types';
import { addDays, createRng, hashString } from '../random';
import { ORG_STAFF, type StaffCore } from './employees';

function toRecord(s: StaffCore): EmployeeRecord {
  const rng = createRng(hashString(`${s.id}:record`));
  const prefix = s.organizationId.split('-')[0]!;
  const id = s.id;
  return {
    ...s,
    email: `${s.name.toLowerCase().replace(/[^a-z]+/g, '.')}@${prefix}.example`,
    documents: [
      { id: `${id}-doc-1`, name: 'Employment contract.pdf', kind: 'contract', addedOn: s.startDate, sizeKb: 184 },
      ...(rng.chance(0.85) ? [{ id: `${id}-doc-2`, name: 'ID verification.pdf', kind: 'id' as const, addedOn: s.startDate, sizeKb: 92 }] : []),
      ...(rng.chance(0.5) ? [{ id: `${id}-doc-3`, name: 'Certification.pdf', kind: 'certificate' as const, addedOn: addDays(s.startDate, 60), sizeKb: 240 }] : []),
    ],
    lifecycleTasks:
      s.status === 'onboarding'
        ? [
            { id: `${id}-t1`, phase: 'onboarding', label: 'Contract signed', owner: 'HR', done: true },
            { id: `${id}-t2`, phase: 'onboarding', label: 'Laptop & equipment ordered', owner: 'IT', done: true },
            { id: `${id}-t3`, phase: 'onboarding', label: 'Accounts created', owner: 'IT', done: false },
            { id: `${id}-t4`, phase: 'onboarding', label: 'Buddy assigned', owner: 'Manager', done: false },
            { id: `${id}-t5`, phase: 'onboarding', label: 'Policies acknowledged', owner: 'Employee', done: false },
          ]
        : s.status === 'offboarding'
          ? [
              { id: `${id}-t1`, phase: 'offboarding', label: 'Resignation acknowledged', owner: 'HR', done: true },
              { id: `${id}-t2`, phase: 'offboarding', label: 'Knowledge handover', owner: 'Manager', done: false },
              { id: `${id}-t3`, phase: 'offboarding', label: 'Equipment returned', owner: 'IT', done: false },
              { id: `${id}-t4`, phase: 'offboarding', label: 'Exit interview', owner: 'HR', done: false },
              { id: `${id}-t5`, phase: 'offboarding', label: 'Final pay preview', owner: 'Payroll', done: false },
            ]
          : [],
    emergencyContact: 'On file (synthetic)',
  };
}

export const ORG_EMPLOYEES: Record<string, EmployeeRecord[]> = Object.fromEntries(
  Object.entries(ORG_STAFF).map(([org, staff]) => [org, staff.map(toRecord)]),
);
