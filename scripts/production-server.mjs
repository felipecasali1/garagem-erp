import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { serve } from "srvx/node";
import { serveStatic } from "srvx/static";

const serverEntryUrl = new URL("../dist/server/server.js", import.meta.url);
const clientAssetsPath = fileURLToPath(new URL("../dist/client/", import.meta.url));

export function assertRuntimeConfiguration(env = process.env) {
  const missing = [];
  if (!env.SUPABASE_URL?.trim()) missing.push("SUPABASE_URL");
  if (!env.SUPABASE_SERVICE_KEY?.trim()) missing.push("SUPABASE_SERVICE_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Cannot start GaragemERP. Set ${missing.join(" and ")} in .env or the process environment. ` +
        "Keep SUPABASE_SERVICE_KEY server-only; never prefix it with VITE_.",
    );
  }
}

export async function startProductionServer(options = {}) {
  assertRuntimeConfiguration();
  process.env.NODE_ENV ??= "production";

  if (!existsSync(fileURLToPath(serverEntryUrl)) || !existsSync(clientAssetsPath)) {
    throw new Error("Production build not found. Run `npm run build` before starting GaragemERP.");
  }

  const module = await import(serverEntryUrl.href);
  const handler = module.default ?? module;
  if (typeof handler.fetch !== "function") {
    throw new Error("The production server entry does not export a fetch handler.");
  }

  const server = serve({
    hostname: options.hostname ?? process.env.HOST ?? "0.0.0.0",
    port: options.port ?? process.env.PORT ?? 3000,
    silent: options.silent ?? false,
    manual: options.manual ?? false,
    middleware: [serveStatic({ dir: clientAssetsPath })],
    fetch: (request) => handler.fetch(request),
  });

  await server.ready();
  return server;
}
