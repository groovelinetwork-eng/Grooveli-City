'use client';

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDemoStore } from './store';
import { selfEmployeeId } from './selectors';

export function useOrgId(): string | null {
  return useDemoStore((s) => s.session?.activeOrganizationId ?? null);
}

export function useOrgEmployees(includeExited = false) {
  const orgId = useOrgId();
  return useDemoStore(useShallow((s) => s.employees.filter((e) => e.organizationId === orgId && (includeExited || e.status !== 'exited'))));
}

export function useOrgJobs() {
  const orgId = useOrgId();
  return useDemoStore(useShallow((s) => s.jobs.filter((j) => j.organizationId === orgId)));
}

export function useOrgApplications() {
  const jobs = useOrgJobs();
  const apps = useDemoStore((s) => s.applications);
  return useMemo(() => {
    const ids = new Set(jobs.map((j) => j.id));
    return apps.filter((a) => ids.has(a.jobId));
  }, [jobs, apps]);
}

export function useOrgInterviews() {
  const jobs = useOrgJobs();
  const interviews = useDemoStore((s) => s.interviews);
  return useMemo(() => {
    const ids = new Set(jobs.map((j) => j.id));
    return interviews.filter((i) => ids.has(i.jobId));
  }, [jobs, interviews]);
}

export function useDepartments() {
  const orgId = useOrgId();
  return useDemoStore(useShallow((s) => s.workspaces.find((w) => w.organizationId === orgId)?.departments ?? EMPTY));
}

export function useLocations() {
  const orgId = useOrgId();
  return useDemoStore(useShallow((s) => s.workspaces.find((w) => w.organizationId === orgId)?.locations ?? EMPTY));
}

const EMPTY: never[] = [];

export function useDeptName() {
  const deps = useDepartments();
  return useMemo(() => {
    const m = new Map(deps.map((d) => [d.id, d.name]));
    return (id: string | null | undefined) => (id ? m.get(id) ?? '—' : '—');
  }, [deps]);
}

export function useSelfEmployee() {
  const id = useDemoStore(selfEmployeeId);
  return useDemoStore((s) => (id ? s.employees.find((e) => e.id === id) ?? null : null));
}

export function useEmployeeName() {
  const employees = useDemoStore((s) => s.employees);
  return useMemo(() => {
    const m = new Map(employees.map((e) => [e.id, e.name]));
    return (id: string | null | undefined) => (id ? m.get(id) ?? id : '—');
  }, [employees]);
}

/** CSV download helper (client-only). Data is synthetic. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
