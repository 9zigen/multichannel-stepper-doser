/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_MOCK?: string;
  readonly VITE_DEVICE_IP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
