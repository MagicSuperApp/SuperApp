declare module '@env' {
  export const ALADIN_API_URL: string;
  export const ALADIN_API_KEY: string;
  export const ALADIN_REGION_CODE: string;
  export const PHOENIXKEY_API_URL: string;
  export const MESHAPI_USE_MOCK: string;
  export const ORILIFE_API_BASE_URL: string;
  export const LAMPNET_BASE_URL: string;
  export const LAMPNET_UPLOAD_URL: string;
  export const CAPTURES_3D_URL: string;
  export const PROOFCHAT_API_URL: string;
  export const PROOFCHAT_BACKEND_ENABLED: string;
  export const ANALYTICS_API_URL: string;
  export const ANALYTICS_API_KEY: string;
}

// Optional native module used by src/services/storageQueue.ts. Ships no bundled
// @types, so declare the minimal surface this codebase relies on.
declare module 'react-native-quick-sqlite' {
  export interface QuickSqliteResultRows {
    _array?: any[];
    item?: (index: number) => any;
    length?: number;
  }
  export interface QuickSqliteConnection {
    execute(
      sql: string,
      params?: any[],
    ): { rows?: QuickSqliteResultRows; rowsAffected?: number };
    close(): void;
  }
  export function open(options: { name: string; location?: string }): QuickSqliteConnection;
}
