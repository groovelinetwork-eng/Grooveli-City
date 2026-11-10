import type { Department, OfficeLocation } from '../types';

/**
 * Organisational structure (departments/locations). Department names are
 * public-safe (shown as HQ "departmental offices"); heads are assigned at
 * load by employees.ts.
 */
export const ORG_STRUCTURE: Record<string, { locations: OfficeLocation[]; departments: Department[] }> = {
  'kestrel-systems': {
    locations: [
      { id: 'loc-k-hq', name: 'Tech Hub HQ', city: 'Grooveli City', address: '14 Circuit Avenue, Technology Hub', headcountCapacity: 120 },
      { id: 'loc-k-remote', name: 'Remote', city: 'Distributed', address: '—', headcountCapacity: 0 },
      { id: 'loc-k-north', name: 'Northgate Satellite', city: 'Northgate', address: '3 Harbour Rd', headcountCapacity: 30 },
    ],
    departments: [
      { id: 'dep-k-eng', name: 'Engineering', headEmployeeId: null, responsibilities: 'Platform & product engineering', locationId: 'loc-k-hq' },
      { id: 'dep-k-product', name: 'Product & Design', headEmployeeId: null, responsibilities: 'Discovery, UX, roadmap', locationId: 'loc-k-hq' },
      { id: 'dep-k-ops', name: 'Operations', headEmployeeId: null, responsibilities: 'Customer success & support', locationId: 'loc-k-north' },
      { id: 'dep-k-people', name: 'People & Finance', headEmployeeId: null, responsibilities: 'HR, payroll, finance', locationId: 'loc-k-hq' },
      { id: 'dep-k-sales', name: 'Sales & Marketing', headEmployeeId: null, responsibilities: 'Growth and partnerships', locationId: 'loc-k-hq' },
    ],
  },
  'amberline-health': {
    locations: [
      { id: 'loc-a-main', name: 'Main Clinic', city: 'Grooveli City', address: '2 Wellness Way, Healthcare District', headcountCapacity: 40 },
    ],
    departments: [
      { id: 'dep-a-clinical', name: 'Clinical', headEmployeeId: null, responsibilities: 'Patient care', locationId: 'loc-a-main' },
      { id: 'dep-a-admin', name: 'Administration', headEmployeeId: null, responsibilities: 'Front desk, billing, HR', locationId: 'loc-a-main' },
    ],
  },
};
