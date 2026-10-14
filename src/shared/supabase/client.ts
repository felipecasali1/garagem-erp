import { createClient } from "@supabase/supabase-js";

type RuntimeSupabaseConfig = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

declare global {
  interface Window {
    __GARAGEM_ERP_CONFIG__?: RuntimeSupabaseConfig;
  }
}

function getBrowserRuntimeEnv(name: string) {
  if (typeof window === "undefined") return undefined;

  if (name === "VITE_SUPABASE_URL") {
    return window.__GARAGEM_ERP_CONFIG__?.supabaseUrl;
  }

  if (name === "VITE_SUPABASE_ANON_KEY") {
    return window.__GARAGEM_ERP_CONFIG__?.supabaseAnonKey;
  }

  return undefined;
}

function getEnv(name: string) {
  const runtimeValue = getBrowserRuntimeEnv(name);
  if (runtimeValue) return runtimeValue;

  if (typeof process !== "undefined") {
    const processEnv = process.env[name];
    if (processEnv) return processEnv;
  }

  return (import.meta.env as Record<string, string | undefined>)[name];
}

function normalizeSupabaseUrl(url: string) {
  return url.replace(/\/rest\/v1\/?$/, "");
}

const supabaseUrl = normalizeSupabaseUrl(
  (typeof window === "undefined" ? getEnv("SUPABASE_URL") : undefined) ??
    getEnv("VITE_SUPABASE_URL") ??
    getEnv("SUPABASE_URL") ??
    "",
);
const supabaseKey =
  (typeof window === "undefined" ? getEnv("SUPABASE_PUBLISHABLE_KEY") : undefined) ??
  getEnv("VITE_SUPABASE_ANON_KEY") ??
  getEnv("SUPABASE_PUBLISHABLE_KEY") ??
  "";

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
