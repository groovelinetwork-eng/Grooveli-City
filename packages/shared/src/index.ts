// ── App Constants ──
export const APP_NAME = 'Grooveli City';
export const APP_VERSION = '0.1.0';

// ── API Config ──
export const API_URL = process.env.API_URL || 'http://localhost:4000/api';

// ── Types ──
export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}
