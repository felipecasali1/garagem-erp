const missing = [];

if (!process.env.VITE_SUPABASE_URL?.trim()) {
  missing.push("VITE_SUPABASE_URL");
}

if (!process.env.VITE_SUPABASE_ANON_KEY?.trim()) {
  missing.push("VITE_SUPABASE_ANON_KEY");
}

if (process.env.VITE_SUPABASE_SERVICE_KEY?.trim()) {
  console.error(
    "Cannot build GaragemERP: VITE_SUPABASE_SERVICE_KEY is unsafe because VITE_ values are embedded in browser assets. Use SUPABASE_SERVICE_KEY only in the server environment.",
  );
  process.exitCode = 1;
}

if (missing.length > 0) {
  console.error(
    `Cannot build GaragemERP. Set the following public Supabase build variables in .env or the process environment: ${missing.join(", ")}. These VITE_ values are embedded in browser assets; never put SUPABASE_SERVICE_KEY in a VITE_ variable.`,
  );
  process.exitCode = 1;
}
