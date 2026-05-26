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
  getEnv("SUPABASE_URL") ?? getEnv("VITE_SUPABASE_URL") ?? "",
);
const serviceKey = getEnv("SUPABASE_SERVICE_KEY") ?? getEnv("VITE_SUPABASE_SERVICE_KEY") ?? "";

if (!supabaseUrl) {
  throw new Error(
    "Missing Supabase URL. Define SUPABASE_URL or VITE_SUPABASE_URL in your environment.",
  );
}

if (!serviceKey) {
  throw new Error("Missing Supabase service key. Define SUPABASE_SERVICE_KEY in your environment.");
}

export const supabaseAdmin = createClient(supabaseUrl, serviceKey);
