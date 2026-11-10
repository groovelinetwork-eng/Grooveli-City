'use client';

import type { DistrictId } from '@grooveli/frontend-domain';
import { useCityHref } from '@/lib/city-link';

export function EnterCityButton({
  district,
  organizationId,
  label = 'Enter the city',
  className = 'btn',
}: {
  district?: DistrictId;
  organizationId?: string;
  label?: string;
  className?: string;
}) {
  const href = useCityHref({ district, organizationId });
  return (
    <a className={className} href={href}>
      🏙️ {label}
    </a>
  );
}
