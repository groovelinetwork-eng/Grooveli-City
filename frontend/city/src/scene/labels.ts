import type { MutableRefObject } from 'react';

/**
 * Stable DOM container for drei <Html> labels. Without an explicit portal,
 * Html resolves its target before R3F's event layer connects and later
 * cleans up against a different parent, throwing a DOM removeChild error
 * (TEST_REPORT D-006).
 */
export type LabelPortal = MutableRefObject<HTMLElement>;
