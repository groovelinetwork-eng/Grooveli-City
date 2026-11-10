import { describe, expect, it } from 'vitest';
import { STORAGE_KEY, useDemoStore } from '@/lib/store/store';
import { createInitialState, STATE_VERSION } from '@/lib/store/state';

describe('persisted demo state (untrusted boundary)', () => {
  it('rehydrates the full candidate profile, not a schema-stripped copy (regression D-005)', async () => {
    const saved = createInitialState();
    saved.candidate.displayName = 'Persisted Person';
    saved.savedJobIds = ['job-k-data'];
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: saved, version: STATE_VERSION }));
    await useDemoStore.persist.rehydrate();
    const s = useDemoStore.getState();
    expect(s.candidate.displayName).toBe('Persisted Person');
    expect(s.candidate.preferences.minSalary).toBe(saved.candidate.preferences.minSalary);
    expect(s.candidate.skills.length).toBeGreaterThan(0);
    expect(s.savedJobIds).toEqual(['job-k-data']);
  });

  it('discards tampered or outdated state', async () => {
    useDemoStore.setState(createInitialState(), true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { stateVersion: STATE_VERSION, candidate: { id: 'x' }, jobs: 'nope' }, version: STATE_VERSION }));
    await useDemoStore.persist.rehydrate();
    expect(useDemoStore.getState().candidate.preferences).toBeDefined();
    expect(Array.isArray(useDemoStore.getState().jobs)).toBe(true);
  });
});
