/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend base URL used as the default server (build time). */
  readonly VITE_API_URL?: string;
  /** Website (dashboard) base URL used for sign-up and sign-in links (build time). */
  readonly VITE_DASHBOARD_URL?: string;
}
