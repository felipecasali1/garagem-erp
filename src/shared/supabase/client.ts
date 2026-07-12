import { createClient } from "@supabase/supabase-js";

function getEnv(name: string) {
  const viteEnv = (import.meta.env as Record<string, string | undefined>)[name];
  if (viteEnv) return viteEnv;
  if (typeof process !== "undefined") {
    return process.env[name];
  }
  return undefined;
}

function normalizeSupabaseUrl(url: string) {
  return url.replace(/\/rest\/v1\/?$/, "");
}

const supabaseUrl = normalizeSupabaseUrl(
  getEnv("VITE_SUPABASE_URL") ?? getEnv("SUPABASE_URL") ?? "",
);
const supabaseKey = getEnv("VITE_SUPABASE_ANON_KEY") ?? getEnv("SUPABASE_PUBLISHABLE_KEY") ?? "";

if (!supabaseUrl) {
  throw new Error(
    "Missing Supabase URL. Define VITE_SUPABASE_URL or SUPABASE_URL in your environment.",
  );
}

if (!supabaseKey) {
  throw new Error(
    "Missing Supabase publishable key. Define VITE_SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY in your environment.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseKey);
