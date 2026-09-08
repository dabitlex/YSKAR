import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-Role-Client. Umgeht RLS und darf deshalb NIEMALS an den Browser
 * gelangen. Nur in Route Handlern mit runtime = 'nodejs' verwenden.
 *
 * Schreibend kommt ausschliesslich dieser Client durch: In Migration 00001
 * gibt es fuer keine Tabelle eine INSERT/UPDATE/DELETE-Policy.
 */
let cached: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt');
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
