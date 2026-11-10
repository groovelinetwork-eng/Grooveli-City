import { config } from '../config';
import type { DataService } from './contracts';
import { mockService } from './mock';
import { createHttpService } from './http';

export type { DataService } from './contracts';
export { ApiNotAvailableError } from './http';

let instance: DataService | null = null;

/**
 * Explicit adapter selection. `api` never falls back to mocks: misconfigured
 * or missing endpoints surface as visible errors.
 */
export function getService(): DataService {
  if (!instance) instance = config.dataMode === 'api' ? createHttpService(config.apiUrl) : mockService;
  return instance;
}

export const isMockMode = () => config.dataMode === 'mock';
