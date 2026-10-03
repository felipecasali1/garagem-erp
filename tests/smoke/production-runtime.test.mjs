import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  assertRuntimeConfiguration,
  startProductionServer,
} from "../../scripts/production-server.mjs";
import { supportsNodeVersion } from "../../scripts/check-node-version.mjs";

test("accepts Node.js 22.12 and newer, and rejects earlier versions", () => {
  assert.equal(supportsNodeVersion("22.11.1"), false);
  assert.equal(supportsNodeVersion("22.12.0-rc.1"), false);
  assert.equal(supportsNodeVersion("invalid"), false);
  assert.equal(supportsNodeVersion("22.12.0"), true);
  assert.equal(supportsNodeVersion("24.18.0"), true);
});

test("reports the required Supabase server variables before startup", () => {
  assert.throws(() => assertRuntimeConfiguration({}), /SUPABASE_URL and SUPABASE_SERVICE_KEY/);
});

test("production server renders a route and serves its built client assets", async (t) => {
  const server = await startProductionServer({
    hostname: "127.0.0.1",
    port: 0,
    silent: true,
    manual: true,
  });
  t.after(() => server.close());

  const baseUrl = "http://garagem-erp.test";
  const response = await server.fetch(new Request(new URL("/login", baseUrl)));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/html/i);

  const html = await response.text();
  const assetPath =
    html.match(/<link rel="modulepreload" href="([^"]+\.js(?:\?[^"]*)?)"/i)?.[1] ??
    html.match(/<script[^>]+src="([^"]+\.js(?:\?[^"]*)?)"/i)?.[1];
  assert.ok(assetPath, "The rendered route should reference a built JavaScript asset.");

  const scriptResponse = await server.fetch(new Request(new URL(assetPath, baseUrl)));
  assert.equal(scriptResponse.status, 200);
  assert.match(scriptResponse.headers.get("content-type") ?? "", /javascript/i);
});

test("production Node server accepts an HTTP request", async (t) => {
  let server;
  try {
    server = await startProductionServer({
      hostname: "127.0.0.1",
      port: 0,
      silent: true,
    });
  } catch (error) {
    if (error?.code === "EPERM") {
      t.skip("The current environment blocks local TCP listeners.");
      return;
    }
    throw error;
  }

  t.after(() => server.close(true));
  try {
    const response = await fetch(new URL("/login", server.url));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/i);
  } catch (error) {
    if (error?.cause?.code === "EPERM" || error?.code === "EPERM") {
      t.skip("The current environment blocks local HTTP requests.");
      return;
    }
    throw error;
  }
});

test("does not embed the server service key in browser assets", async () => {
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  assert.ok(serviceKey, "SUPABASE_SERVICE_KEY must be configured for the smoke test.");

  const assetsDirectory = fileURLToPath(new URL("../../dist/client/assets/", import.meta.url));
  const assetNames = await readdir(assetsDirectory);
  for (const assetName of assetNames) {
    const asset = await readFile(
      new URL(`../../dist/client/assets/${assetName}`, import.meta.url),
      "utf8",
    );
    assert.ok(!asset.includes(serviceKey), "SUPABASE_SERVICE_KEY must remain server-only.");
  }
});
