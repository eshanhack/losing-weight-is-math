import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for browser/client-side usage
 * Use this in Client Components
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}



