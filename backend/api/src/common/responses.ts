/** Success envelope from the API contract. */
export const ok = <T>(data: T, message = 'OK') => ({ success: true as const, data, message });

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
