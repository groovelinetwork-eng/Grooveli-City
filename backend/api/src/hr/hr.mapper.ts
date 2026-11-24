import type { AttendanceEntry, Employee, EmployeeDocument, LeaveRequest, LifecycleTask, PerformanceReview } from '@prisma/client';
import { isoDate } from '../common/pagination';

export const toApiEmployeeStatus = (s: Employee['status']) => s.replace(/_/g, '-');
export const toDbEmployeeStatus = (s: string) => s.replace(/-/g, '_') as Employee['status'];

export const toApiDocument = (d: EmployeeDocument) => ({ id: d.id, name: d.name, kind: d.kind, addedOn: isoDate(d.addedOn), sizeKb: d.sizeKb });
export const toApiTask = (t: LifecycleTask) => ({ id: t.id, phase: t.phase, label: t.label, owner: t.owner, done: t.done });

/** `full` = the caller may see private HR fields (HR, or the employee themself). */
export function toApiEmployee(e: Employee & { documents?: EmployeeDocument[]; lifecycleTasks?: LifecycleTask[] }, full: boolean) {
  return {
    id: e.id,
    organizationId: e.organizationId,
    name: e.name,
    title: e.title,
    departmentId: e.departmentId,
    locationId: e.locationId,
    managerId: e.managerId,
    email: e.email,
    startDate: isoDate(e.startDate),
    employmentType: e.employmentType,
    status: toApiEmployeeStatus(e.status),
    avatar: e.avatar,
    publicDirectory: e.publicDirectory,
    documents: full ? (e.documents ?? []).map(toApiDocument) : [],
    lifecycleTasks: full ? (e.lifecycleTasks ?? []).sort((a, b) => a.sortOrder - b.sortOrder).map(toApiTask) : [],
    emergencyContact: full ? e.emergencyContact : '',
  };
}

export const toApiLeave = (l: LeaveRequest) => ({
  id: l.id, employeeId: l.employeeId, type: l.type, start: isoDate(l.start), end: isoDate(l.end),
  days: l.days, reason: l.reason, status: l.status, ...(l.decidedByName ? { decidedBy: l.decidedByName } : {}),
});

export const toApiAttendance = (a: AttendanceEntry) => ({ employeeId: a.employeeId, date: isoDate(a.date), status: a.status, hours: a.hours });

export const toApiReview = (r: PerformanceReview) => ({
  id: r.id, employeeId: r.employeeId, cycle: r.cycle, reviewer: r.reviewerName, status: r.status, rating: r.rating,
  goals: r.goals as { title: string; progress: number }[], strengths: r.strengths, improvements: r.improvements,
});

export const ONBOARDING_TASKS = [
  { label: 'Sign employment contract', owner: 'HR' },
  { label: 'Collect ID and bank documents', owner: 'HR' },
  { label: 'Set up equipment and accounts', owner: 'IT' },
  { label: 'Introduce team and buddy', owner: 'Manager' },
  { label: 'Acknowledge company policies', owner: 'Employee' },
];

export const OFFBOARDING_TASKS = [
  { label: 'Agree handover plan', owner: 'Manager' },
  { label: 'Return equipment', owner: 'Employee' },
  { label: 'Revoke system access', owner: 'IT' },
  { label: 'Final pay and benefits review', owner: 'HR' },
  { label: 'Exit interview', owner: 'HR' },
];
