/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Default backend URL shown on the connect screen. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
