import { createClient, SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    // Try build-time inlined env vars first, then fall back to runtime config
    // injected by the server-rendered layout script tag.
    const runtimeConfig = typeof window !== 'undefined'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (window as any).__SUPABASE_CONFIG__ as { url?: string; anonKey?: string } | undefined
      : undefined;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || runtimeConfig?.url;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || runtimeConfig?.anonKey;
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables');
    }
    _supabase = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _supabase;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSupabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const value = (client as any)[prop as string];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
