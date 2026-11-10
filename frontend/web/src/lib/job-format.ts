import { formatNaira, type Job } from '@grooveli/frontend-domain';

/** Pure helper usable from both server and client components. */
export function salaryRange(j: Pick<Job, 'salaryMin' | 'salaryMax'>) {
  return `${formatNaira(j.salaryMin, { compact: true })}–${formatNaira(j.salaryMax, { compact: true })}/mo`;
}
