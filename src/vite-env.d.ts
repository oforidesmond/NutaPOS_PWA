/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/react" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_API_PREFIX?: string;
  /** `true` / `1` / `yes` shows Discard on Failed sales; anything else hides it. */
  readonly VITE_ALLOW_DISCARD_FAILED_SALES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
