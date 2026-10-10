import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLocalEnvironment,
  runLocalHealthcheck,
  runLocalUpdate,
} from "../../scripts/local-maintenance.mjs";

const environment = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_KEY: "local-service-key",
  VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  VITE_SUPABASE_ANON_KEY: "local-publishable-key",
  HOST: "127.0.0.1",
  PORT: "3000",
};

const expectedMigrations = ["20260523120000", "20260524193000"];
const migrationOutput = JSON.stringify({
  migrations: expectedMigrations.map((version) => ({ local: version, remote: version })),
});

function healthyFetch(url) {
  const { pathname } = new URL(url);
  if (pathname === "/auth/v1/settings") return new Response("{}", { status: 200 });
  if (pathname === "/rest/v1/vehicles") {
    return new Response("[]", { status: 200 });
  }
  if (pathname === "/login") return new Response("login", { status: 200 });
  return new Response("not found", { status: 404 });
}

function migrationCommandRunner() {
  return (command, args) => {
    if (args.includes("list")) return { status: 0, stdout: migrationOutput, stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
}

test("aceita somente URLs do Supabase servidas localmente", () => {
  assert.deepEqual(assertLocalEnvironment(environment), {
    apiUrl: "http://127.0.0.1:54321",
    appUrl: "http://127.0.0.1:3000",
  });
  assert.deepEqual(
    assertLocalEnvironment({ ...environment, SUPABASE_URL: "http://localhost:54321" }).apiUrl,
    "http://localhost:54321",
  );
  assert.throws(
    () => assertLocalEnvironment({ ...environment, SUPABASE_URL: "https://project.supabase.co" }),
    /somente para o Supabase Local/,
  );
});

test("healthcheck confirma aplicação, Auth, PostgREST e migrations aplicadas", async () => {
  const result = await runLocalHealthcheck({
    environment,
    expectedMigrations,
    runCommand: migrationCommandRunner(),
    fetchImpl: healthyFetch,
  });

  assert.deepEqual(result, {
    app: true,
    auth: true,
    postgrest: true,
    migrations: expectedMigrations.length,
  });
});

test("healthcheck aponta quando falta uma migration local", async () => {
  await assert.rejects(
    runLocalHealthcheck({
      environment,
      expectedMigrations: [...expectedMigrations, "20260923200000"],
      runCommand: migrationCommandRunner(),
      fetchImpl: healthyFetch,
    }),
    /Migrations não aplicadas/,
  );
});

test("healthcheck identifica quando a aplicação não responde", async () => {
  await assert.rejects(
    runLocalHealthcheck({
      environment,
      expectedMigrations,
      runCommand: migrationCommandRunner(),
      fetchImpl: async (url) =>
        new URL(url).pathname === "/login"
          ? new Response("offline", { status: 503 })
          : healthyFetch(url),
    }),
    /aplicação respondeu HTTP 503/,
  );
});

test("atualização aplica migrations locais, gera build e valida o runtime resultante", async () => {
  const calls = [];
  let serverClosed = false;
  const runCommand = (command, args) => {
    calls.push([command, ...args]);
    if (command === "git" && args.includes("rev-parse")) {
      return { status: 0, stdout: "abc1234\n", stderr: "" };
    }
    if (command === "git" && args.includes("--porcelain")) {
      return { status: 0, stdout: "?? local-test.sql\n", stderr: "" };
    }
    if (args.includes("list")) return { status: 0, stdout: migrationOutput, stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };

  const result = await runLocalUpdate({
    environment,
    expectedMigrations,
    runCommand,
    fetchImpl: healthyFetch,
    startTemporaryServer: async () => ({
      url: "http://127.0.0.1:39129",
      close: async () => {
        serverClosed = true;
      },
    }),
  });

  assert.equal(result.version, "abc1234-dirty");
  assert.equal(result.health.app, true);
  assert.equal(serverClosed, true);
  assert.ok(calls.some((call) => call[0] === "npm" && call.includes("supabase:start")));
  assert.ok(
    calls.some(
      (call) => call[0].endsWith("supabase") && call.includes("up") && call.includes("--local"),
    ),
  );
  assert.ok(calls.some((call) => call[0] === "npm" && call.includes("build")));
  assert.ok(calls.some((call) => call[0] === "git" && call.includes("--short")));
  assert.ok(!calls.some((call) => call.includes("reset")));
});

test("falha ao aplicar migrations impede build e healthcheck do runtime", async () => {
  const calls = [];
  let appStarted = false;
  const runCommand = (command, args) => {
    calls.push([command, ...args]);
    if (command === "git" && args.includes("rev-parse")) {
      return { status: 0, stdout: "abc1234\n", stderr: "" };
    }
    if (command === "git" && args.includes("--porcelain")) {
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args.includes("up")) return { status: 1, stdout: "", stderr: "migration failed" };
    return { status: 0, stdout: "", stderr: "" };
  };

  await assert.rejects(
    runLocalUpdate({
      environment,
      expectedMigrations,
      runCommand,
      fetchImpl: healthyFetch,
      startTemporaryServer: async () => {
        appStarted = true;
        return { url: "http://127.0.0.1:39129", close: async () => {} };
      },
    }),
    /migration failed/,
  );

  assert.equal(
    calls.some((call) => call.includes("build")),
    false,
  );
  assert.equal(appStarted, false);
});
