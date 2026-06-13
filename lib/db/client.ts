import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { env, hasDb } from "@/lib/config";

let client: SupabaseClient | null = null;

/**
 * Returns null when Supabase env vars are absent — every DB-dependent feature
 * checks this and degrades to live-view-only instead of crashing.
 */
export function getSupabase(): SupabaseClient | null {
  if (!hasDb()) return null;
  if (!client) {
    const e = env();
    client = createClient(e.SUPABASE_URL!, e.SUPABASE_SERVICE_KEY!, {
      auth: { persistSession: false },
    });
  }
  return client;
}
