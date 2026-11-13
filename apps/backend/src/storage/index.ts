import type { AppConfig } from '../config/env';
import { FileStorage } from './file-storage';
import { SupabaseStorage } from './supabase-storage';
import type { Storage } from './types';

export type { Storage } from './types';

/** Builds the configured storage backend. Config validation already enforces Supabase credentials. */
export function createStorage(config: AppConfig): Storage {
  if (config.storage === 'supabase') {
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('STORAGE=supabase requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
    return new SupabaseStorage(config.supabaseUrl, config.supabaseServiceRoleKey);
  }
  return new FileStorage(config.dataDir);
}
