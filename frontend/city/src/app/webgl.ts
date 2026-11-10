let cached: boolean | null = null;

/**
 * True when a WebGL context can be created. The probe runs ONCE and its
 * context is released immediately: browsers cap live WebGL contexts (~16), and
 * leaking probe contexts evicts the city's real renderer ("context lost").
 * See TEST_REPORT D-007.
 */
export function canUseWebGL(doc: Document = document): boolean {
  if (cached !== null && doc === document) return cached;
  let ok = false;
  try {
    const canvas = doc.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | WebGL2RenderingContext | null;
    ok = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    ok = false;
  }
  if (doc === document) cached = ok;
  return ok;
}

/** Test helper. */
export function resetWebGLProbe() {
  cached = null;
}
