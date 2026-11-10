import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Node 25 ships an experimental global `localStorage` that shadows jsdom's and
 * is non-functional without --localstorage-file. Install in-memory Storage.
 */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  const s = memoryStorage();
  Object.defineProperty(globalThis, name, { value: s, configurable: true, writable: true });
  if (typeof window !== 'undefined') Object.defineProperty(window, name, { value: s, configurable: true, writable: true });
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
});
