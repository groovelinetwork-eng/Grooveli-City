'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { getDistrict, parseReturnContext, type DistrictId } from '@grooveli/frontend-domain';
import { ToastProvider } from './ui/toast';
import { CityBridgeSync } from './city-bridge-sync';
import { useHydrated } from '@/lib/store/store';
import { config } from '@/lib/config';
import { useCityHref } from '@/lib/city-link';

const RETURN_KEY = 'grooveli.return-to-city';

/** Persists a validated "came from the city" context for the browser tab session. */
function ReturnToCityTracker({ onChange }: { onChange: (d: DistrictId | null | undefined) => void }) {
  const params = useSearchParams();
  useEffect(() => {
    const ctx = parseReturnContext(new URLSearchParams(params.toString()));
    try {
      if (ctx.fromCity) {
        sessionStorage.setItem(RETURN_KEY, ctx.district ?? 'plaza');
        onChange(ctx.district ?? 'plaza');
      } else {
        const stored = sessionStorage.getItem(RETURN_KEY);
        onChange(stored ? (stored as DistrictId) : undefined);
      }
    } catch {
      onChange(ctx.fromCity ? ctx.district ?? 'plaza' : undefined);
    }
  }, [params, onChange]);
  return null;
}

function ReturnToCityBanner({ district, onDismiss }: { district: DistrictId; onDismiss: () => void }) {
  const href = useCityHref({ district });
  let name = 'the city';
  try {
    name = getDistrict(district).name;
  } catch {
    /* invalid stored value — fall back */
  }
  return (
    <div className="banner banner-city" role="region" aria-label="Return to city">
      <span>
        You came here from <strong>{name}</strong> in Grooveli City.
      </span>
      <span className="row">
        <a href={href}>↩ Return to the city</a>
        <button type="button" className="btn btn-sm btn-ghost" style={{ color: '#fff' }} onClick={onDismiss}>
          Dismiss
        </button>
      </span>
    </div>
  );
}

function HydrationGate() {
  useHydrated();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [district, setDistrict] = useState<DistrictId | null | undefined>(undefined);
  return (
    <ToastProvider>
      <HydrationGate />
      <CityBridgeSync />
      {config.dataMode === 'api' ? (
        <div className="banner banner-api" role="alert">
          API mode: backend contracts are not implemented yet. Data operations will fail visibly — no mock fallback.
        </div>
      ) : null}
      <Suspense fallback={null}>
        <ReturnToCityTracker onChange={setDistrict} />
      </Suspense>
      {district ? (
        <ReturnToCityBanner
          district={district}
          onDismiss={() => {
            try {
              sessionStorage.removeItem(RETURN_KEY);
            } catch {
              /* ignore */
            }
            setDistrict(undefined);
          }}
        />
      ) : null}
      {children}
    </ToastProvider>
  );
}
