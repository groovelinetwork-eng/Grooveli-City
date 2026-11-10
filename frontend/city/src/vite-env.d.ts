/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_URL?: string;
  readonly VITE_DATA_MODE?: string;
  /** External market charts page opened by the Global Markets billboard (needs product confirmation). */
  readonly VITE_MARKETS_URL?: string;
  /** Backend market feed endpoint (docs/MARKETS_FEED_CONTRACT.md); empty = mock feed. */
  readonly VITE_MARKETS_FEED_URL?: string;
  /** Billboard refresh interval in seconds (min 15). */
  readonly VITE_MARKETS_REFRESH_SECONDS?: string;
}
