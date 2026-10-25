import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client. Uses ONLY the public URL + anon key (never the service-role key).
// Returns null when Supabase is not configured (the server reports that state).
// PKCE: Google sign-in and email-confirmation links return a one-time ?code= that /auth/callback exchanges.
// detectSessionInUrl is off on purpose: the callback page exchanges the code exactly once, itself.
let client: SupabaseClient | null = null;

export function browserSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key || url.startsWith("your-") || key.startsWith("your-")) return null;
  client ??= createClient(url, key, {
    auth: { flowType: "pkce", detectSessionInUrl: false, persistSession: true, autoRefreshToken: true },
  });
  return client;
}
