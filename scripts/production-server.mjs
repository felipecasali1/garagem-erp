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
  if (!env.SUPABASE_PUBLISHABLE_KEY?.trim()) missing.push("SUPABASE_PUBLISHABLE_KEY");
  if (!env.VITE_SUPABASE_URL?.trim()) missing.push("VITE_SUPABASE_URL");
  if (!env.VITE_SUPABASE_ANON_KEY?.trim()) missing.push("VITE_SUPABASE_ANON_KEY");

  if (missing.length > 0) {
    throw new Error(
      `Cannot start GaragemERP. Set ${missing.join(", ")} in the process environment or .env. ` +
        "For containers, provide them at runtime. Keep SUPABASE_SERVICE_KEY server-only; never prefix it with VITE_.",
    );
  }
}

function createRuntimeConfigScript(env) {
  const config = {
    supabaseUrl: env.VITE_SUPABASE_URL.trim(),
    supabaseAnonKey: env.VITE_SUPABASE_ANON_KEY.trim(),
  };
  const serializedConfig = JSON.stringify(config).replace(/</g, "\\u003c");

  return `<script id="garagem-erp-runtime-config">window.__GARAGEM_ERP_CONFIG__ = ${serializedConfig};</script>`;
}

async function addRuntimeConfigToHtml(response, env) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const runtimeConfigScript = createRuntimeConfigScript(env);
  const configuredHtml = html.replace(/<head\b[^>]*>/i, (head) => `${head}${runtimeConfigScript}`);
  if (configuredHtml === html) {
    throw new Error(
      "Cannot serve the application because its HTML document has no <head> element.",
    );
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.delete("etag");
  headers.set("cache-control", "no-store");

  return new Response(configuredHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
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
    fetch: async (request) => addRuntimeConfigToHtml(await handler.fetch(request), process.env),
  });

  await server.ready();
  return server;
}
