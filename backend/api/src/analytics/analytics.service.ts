import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OrgsService } from '../orgs/orgs.service';

/** Groups smaller than this are merged so no individual can be identified. */
const MIN_GROUP = 5;
type Series = { label: string; value: number }[];

/** Merges buckets under MIN_GROUP into one "Other" bucket (and suppresses that too if still small). */
export function suppressSmall(series: Series): Series {
  const big = series.filter((s) => s.value >= MIN_GROUP);
  const small = series.filter((s) => s.value > 0 && s.value < MIN_GROUP).reduce((a, s) => a + s.value, 0);
  return small >= MIN_GROUP ? [...big, { label: 'Other (small groups)', value: small }] : big;
}

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService, private readonly orgs: OrgsService) {}

  /** Workforce metrics: aggregates only, never personal data. */
  async workforce(orgId: string, q: { from?: string; to?: string }) {
    const to = q.to ? new Date(`${q.to}T23:59:59.999Z`) : new Date();
    const from = q.from ? new Date(`${q.from}T00:00:00Z`) : new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
    const [employees, departments, locations, leave, latestCycle, attendance, sub] = await Promise.all([
      this.prisma.employee.findMany({ where: { organizationId: orgId }, select: { status: true, departmentId: true, locationId: true, employmentType: true, startDate: true, exitedAt: true } }),
      this.prisma.department.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
      this.prisma.officeLocation.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
      this.prisma.leaveRequest.groupBy({ by: ['type'], where: { organizationId: orgId, status: 'approved', start: { gte: from, lte: to } }, _sum: { days: true } }),
      this.prisma.performanceReview.findFirst({ where: { organizationId: orgId, rating: { not: null } }, orderBy: { createdAt: 'desc' }, select: { cycle: true } }),
      this.prisma.attendanceEntry.groupBy({ by: ['status'], where: { employee: { organizationId: orgId }, date: { gte: new Date(Date.now() - 30 * 86_400_000) } }, _count: { _all: true } }),
      this.orgs.subscription(orgId),
    ]);
    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    const locName = new Map(locations.map((l) => [l.id, l.name]));
    const current = employees.filter((e) => e.status !== 'exited');
    const countBy = (key: (e: (typeof current)[number]) => string): Series => {
      const m = new Map<string, number>();
      for (const e of current) m.set(key(e), (m.get(key(e)) ?? 0) + 1);
      return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    };

    // Monthly hires and exits.
    const months: string[] = [];
    for (let d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1)); d <= to; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(monthKey(d));
    const hires = months.map((m) => ({ label: m, value: employees.filter((e) => monthKey(e.startDate) === m).length }));
    const exits = months.map((m) => ({ label: m, value: employees.filter((e) => e.exitedAt && monthKey(e.exitedAt) === m).length }));
    const exitsInRange = employees.filter((e) => e.exitedAt && e.exitedAt >= from && e.exitedAt <= to).length;
    const avgHeadcount = Math.max(1, (current.length + current.length + exitsInRange) / 2);

    const metrics = [
      { key: 'headcount', label: 'Headcount', series: [{ label: 'current', value: current.length }] },
      { key: 'headcount-by-department', label: 'Headcount by department', series: suppressSmall(countBy((e) => deptName.get(e.departmentId) ?? 'Unassigned')) },
      { key: 'headcount-by-location', label: 'Headcount by location', series: suppressSmall(countBy((e) => locName.get(e.locationId) ?? 'Unassigned')) },
      { key: 'headcount-by-employment-type', label: 'Employment type', series: suppressSmall(countBy((e) => e.employmentType)) },
      { key: 'headcount-by-status', label: 'Employee status', series: countBy((e) => e.status.replace(/_/g, '-')) },
      { key: 'hires-per-month', label: 'Hires per month', series: hires },
      { key: 'exits-per-month', label: 'Exits per month', series: exits },
      { key: 'turnover-rate', label: 'Turnover (%)', series: [{ label: 'exits / average headcount', value: Math.round((exitsInRange / avgHeadcount) * 1000) / 10 }] },
      { key: 'leave-days-by-type', label: 'Approved leave days', series: (['annual', 'sick', 'parental', 'study', 'unpaid'] as const).map((t) => ({ label: t, value: leave.find((l) => l.type === t)?._sum.days ?? 0 })) },
      { key: 'attendance-30-days', label: 'Attendance (last 30 days)', series: ['present', 'remote', 'late', 'absent', 'leave'].map((s) => ({ label: s, value: attendance.find((a) => a.status === s)?._count._all ?? 0 })) },
    ];

    if (latestCycle) {
      const reviews = await this.prisma.performanceReview.findMany({ where: { organizationId: orgId, cycle: latestCycle.cycle, rating: { not: null } }, select: { rating: true, employee: { select: { departmentId: true } } } });
      const groups = new Map<string, number[]>();
      for (const r of reviews) {
        const name = deptName.get(r.employee.departmentId) ?? 'Unassigned';
        groups.set(name, [...(groups.get(name) ?? []), r.rating!]);
      }
      const series = [...groups]
        .filter(([, ratings]) => ratings.length >= MIN_GROUP)
        .map(([label, ratings]) => ({ label, value: Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 100) / 100 }));
      metrics.push({ key: 'average-rating-by-department', label: `Average rating (${latestCycle.cycle})`, series });
    }

    if (sub.modules.includes('payroll')) {
      const previews = await this.prisma.payrollPreview.findMany({ where: { organizationId: orgId, status: 'approved-preview' }, orderBy: { period: 'asc' }, select: { period: true, totals: true }, take: 12 });
      metrics.push({ key: 'payroll-gross-per-month', label: 'Payroll gross (preview, NGN)', series: previews.map((p) => ({ label: p.period, value: (p.totals as { gross: number }).gross })) });
    }
    return metrics;
  }
}
