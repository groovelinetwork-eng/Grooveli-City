import { z } from 'zod';
import { PageQuery, zIsoDate } from '../common/pagination';
import { zEmail, zId } from '../common/zod';
import { zEmploymentType } from '../recruitment/recruitment.schemas';

const text = (max: number) => z.string().trim().max(max);
const styleIndex = z.number().int().min(0).max(63);
export const zEmployeeStatus = z.enum(['active', 'onboarding', 'offboarding', 'on-leave', 'exited']);
export const zLeaveType = z.enum(['annual', 'sick', 'parental', 'study', 'unpaid']);

export const EmployeesQuery = PageQuery.extend({
  departmentId: zId.optional(), locationId: zId.optional(), status: zEmployeeStatus.optional(),
  q: z.string().trim().min(1).max(100).optional(), sort: z.string().max(20).optional(),
}).strict();

export const EmployeeCreate = z
  .object({
    name: z.string().trim().min(1).max(80), title: text(80), departmentId: zId, locationId: zId, email: zEmail,
    startDate: zIsoDate, employmentType: zEmploymentType, baseMonthly: z.number().int().min(0).max(1_000_000_000),
  })
  .strict();

export const EmployeePatch = z
  .object({
    name: z.string().trim().min(1).max(80), title: text(80), departmentId: zId, locationId: zId, managerId: zId.nullable(),
    email: zEmail, startDate: zIsoDate, employmentType: zEmploymentType,
    avatar: z.object({ body: z.union([z.literal(0), z.literal(1), z.literal(2)]), skin: styleIndex, hair: styleIndex, hairColor: styleIndex, outfit: styleIndex, outfitColor: styleIndex, accessory: styleIndex }).strict(),
    publicDirectory: z.boolean(),
    emergencyContact: text(200),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field');

export const OffboardingBody = z.object({ lastDay: zIsoDate }).strict();
export const TaskBody = z.object({ done: z.boolean() }).strict();
export const DocumentFields = z.object({ kind: z.enum(['contract', 'id', 'certificate', 'policy-ack', 'other']), name: z.string().trim().min(1).max(120) }).strict();

export const LeaveQuery = PageQuery.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(), employeeId: zId.optional(), from: zIsoDate.optional(), to: zIsoDate.optional(),
}).strict();
export const LeaveCreate = z
  .object({ employeeId: zId, type: zLeaveType, start: zIsoDate, end: zIsoDate, reason: text(1000) })
  .strict()
  .refine((l) => l.end >= l.start, { message: 'End must be on or after start', path: ['end'] });
export const LeaveDecision = z.object({ decision: z.enum(['approved', 'rejected', 'cancelled']) }).strict();

export const AttendanceQuery = PageQuery.extend({ employeeId: zId.optional(), from: zIsoDate.optional(), to: zIsoDate.optional() }).strict();
export const ClockInBody = z.object({ employeeId: zId, status: z.enum(['present', 'remote']) }).strict();
export const ClockOutBody = z.object({ employeeId: zId }).strict();

export const ReviewsQuery = z.object({ cycle: text(40).optional(), employeeId: zId.optional() }).strict();
export const ReviewsCreate = z.object({ cycle: z.string().trim().min(1).max(40), employeeIds: z.array(zId).min(1).max(5000) }).strict();
export const ReviewPatch = z
  .object({
    status: z.enum(['not-started', 'self-review', 'manager-review', 'calibrated', 'shared']),
    rating: z.number().int().min(1).max(5).nullable(),
    goals: z.array(z.object({ title: z.string().trim().min(1).max(200), progress: z.number().int().min(0).max(100) }).strict()).max(20),
    strengths: text(5000),
    improvements: text(5000),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'Send at least one field');

export const SelfQuery = z.object({ orgId: zId }).strict();
