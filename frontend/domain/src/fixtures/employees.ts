import type { EmployeeRecord } from '../types';
import { createRng, addDays, hashString } from '../random';
import { DEMO_TODAY } from '../constants';
import { randomAvatar } from '../avatar';
import { ORG_STRUCTURE } from './structure';

export const FIRST_NAMES = ['Adaeze', 'Tunde', 'Amara', 'Kwame', 'Fatima', 'Emeka', 'Ngozi', 'Samuel', 'Aisha', 'Joseph', 'Chiamaka', 'Yusuf', 'Efua', 'Olumide', 'Halima', 'Ibrahim', 'Nkechi', 'David', 'Blessing', 'Musa', 'Temitope', 'Kemi', 'Obinna', 'Lerato', 'Seun', 'Hadiza', 'Uche', 'Abena', 'Femi', 'Rukayat', 'Thabo', 'Zara', 'Ayodeji', 'Mariam', 'Kelechi', 'Esi'];
export const LAST_NAMES = ['Okafor', 'Adeyemi', 'Mensah', 'Bello', 'Eze', 'Balogun', 'Ibrahim', 'Owusu', 'Nwankwo', 'Abubakar', 'Afolabi', 'Danjuma', 'Okonkwo', 'Ogunleye', 'Boateng', 'Lawal', 'Chukwu', 'Sanni', 'Nkosi', 'Achebe', 'Oyelaran', 'Akande'];

const TITLES: Record<string, string[]> = {
  'dep-k-eng': ['Software Engineer', 'Senior Software Engineer', 'QA Engineer', 'Data Engineer', 'Engineering Manager'],
  'dep-k-product': ['Product Designer', 'UX Researcher', 'Product Manager'],
  'dep-k-ops': ['Support Specialist', 'Implementation Manager', 'Customer Success Lead'],
  'dep-k-people': ['Payroll Specialist', 'Finance Analyst', 'People Partner'],
  'dep-k-sales': ['Account Executive', 'Partnerships Lead', 'Marketing Manager'],
  'dep-a-clinical': ['Registered Nurse', 'Pharmacist', 'Lab Technician', 'Physician'],
  'dep-a-admin': ['Front Desk Officer', 'Billing Officer', 'Clinic Manager'],
};

/**
 * Staff identity core — the subset that public projections may read
 * (name, title, department, opt-in flag). Contact details, documents and
 * lifecycle data are added in employee-records.ts, which the city never imports.
 */
export type StaffCore = Pick<
  EmployeeRecord,
  'id' | 'organizationId' | 'name' | 'title' | 'departmentId' | 'locationId' | 'managerId' | 'startDate' | 'employmentType' | 'status' | 'avatar' | 'publicDirectory'
>;

function buildStaff(orgId: string, headcount: number): StaffCore[] {
  const ws = ORG_STRUCTURE[orgId]!;
  const rng = createRng(hashString(orgId));
  const staff: StaffCore[] = [];
  const used = new Set<string>();
  const prefix = orgId.split('-')[0]!;
  for (let i = 0; i < headcount; i++) {
    let name = '';
    do {
      name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
    } while (used.has(name));
    used.add(name);
    const dep = ws.departments[i % ws.departments.length]!;
    const titles = TITLES[dep.id] ?? ['Associate'];
    // First employee in each department is its head (most senior title).
    const title = i < ws.departments.length ? titles[titles.length - 1]! : titles[rng.int(0, titles.length - 2)]!;
    const id = `emp-${prefix}-${String(i + 1).padStart(2, '0')}`;
    const status: StaffCore['status'] = i === headcount - 1 ? 'onboarding' : i === headcount - 2 ? 'offboarding' : i % 11 === 7 ? 'on-leave' : 'active';
    const startDate = status === 'onboarding' ? addDays(DEMO_TODAY, 7) : addDays(DEMO_TODAY, -rng.int(60, 1600));
    staff.push({
      id,
      organizationId: orgId,
      name,
      title,
      departmentId: dep.id,
      locationId: dep.locationId ?? ws.locations[0]!.id,
      managerId: null,
      startDate,
      employmentType: rng.chance(0.85) ? 'full-time' : 'contract',
      status,
      avatar: randomAvatar(id),
      publicDirectory: rng.chance(0.7),
    });
  }
  for (const dep of ws.departments) {
    const head = staff.find((e) => e.departmentId === dep.id);
    if (head) {
      dep.headEmployeeId = head.id;
      for (const e of staff) if (e.departmentId === dep.id && e.id !== head.id) e.managerId = head.id;
    }
  }
  return staff;
}

export const ORG_STAFF: Record<string, StaffCore[]> = {
  'kestrel-systems': buildStaff('kestrel-systems', 28),
  'amberline-health': buildStaff('amberline-health', 14),
};

/** The employee persona is the head of Kestrel Engineering. */
export const EMPLOYEE_PERSONA_ID = ORG_STAFF['kestrel-systems']!.find((e) => e.departmentId === 'dep-k-eng')!.id;
