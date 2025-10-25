import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = "https://mblblvftpfiysbwranap.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ibGJsdmZ0cGZpeXNid3JhbmFwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzNzk0NjUsImV4cCI6MjA3Njk1NTQ2NX0.sQrTyYD8z0izLXCwGVWVMeIpFA097Ci8_zzoZLHeQy0";

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}

// Create a single instance of the Supabase client for the entire application
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
  }
);

export const isAdmin = async (): Promise<boolean> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data, error } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) return false;
  return data.is_admin || false;
};
