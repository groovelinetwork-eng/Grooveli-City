import { afterEach, describe, expect, it, vi } from 'vitest';
import { canUseWebGL, resetWebGLProbe } from '../src/app/webgl';

describe('WebGL probe (regression D-007)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetWebGLProbe();
  });

  it('creates at most one probe context and releases it', () => {
    const loseContext = vi.fn();
    const getContext = vi.fn(() => ({ getExtension: () => ({ loseContext }) }));
    vi.spyOn(document, 'createElement').mockImplementation(() => ({ getContext }) as unknown as HTMLCanvasElement);
    for (let i = 0; i < 20; i++) expect(canUseWebGL()).toBe(true);
    expect(getContext).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it('reports false when no context is available', () => {
    vi.spyOn(document, 'createElement').mockImplementation(() => ({ getContext: () => null }) as unknown as HTMLCanvasElement);
    expect(canUseWebGL()).toBe(false);
  });
});
