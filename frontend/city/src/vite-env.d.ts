/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WEB_URL?: string;
  readonly VITE_DATA_MODE?: string;
  /** External market charts page opened by the Global Markets billboard (needs product confirmation). */
  readonly VITE_MARKETS_URL?: string;
}
