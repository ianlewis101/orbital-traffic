/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Override the live-data edge worker base URL. */
  readonly VITE_WORKER_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
