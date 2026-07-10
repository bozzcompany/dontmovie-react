import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Use service role key on server-side if available, to bypass RLS during syncing
const keyToUse = supabaseServiceKey || supabaseAnonKey;

export const supabase = createClient(supabaseUrl || "", keyToUse || "");
