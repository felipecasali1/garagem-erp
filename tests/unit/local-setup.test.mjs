import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLocalEnvironment,
  parseEnvOutput,
  redactSupabaseOutput,
  updateLocalEnvContent,
  validateAppliedMigrations,
  validateDockerInfo,
} from "../../scripts/setup-local.mjs";

test("interpreta a saída de ambiente da CLI do Supabase", () => {
  assert.deepEqual(
    parseEnvOutput('API_URL="http://127.0.0.1:54321"\nANON_KEY=anon-value\n# ignore\n'),
    {
      API_URL: "http://127.0.0.1:54321",
      ANON_KEY: "anon-value",
    },
  );
});

test("não imprime chaves do Supabase na saída do setup", () => {
  const output = redactSupabaseOutput(
    '{"API_URL":"http://127.0.0.1:54321","SERVICE_ROLE_KEY":"secret-value"}',
  );

  assert.equal(output, '{"API_URL":"http://127.0.0.1:54321","SERVICE_ROLE_KEY":"[valor omitido]"}');
  assert.doesNotMatch(output, /secret-value/);
  assert.match(
    redactSupabaseOutput("service_role key: secret-value; message: failed"),
    /message: failed/,
  );
  assert.doesNotMatch(redactSupabaseOutput("service_role key: secret-value"), /secret-value/);
});

test("monta o ambiente local sem expor a chave de serviço em VITE_", () => {
  const environment = buildLocalEnvironment({
    API_URL: "http://127.0.0.1:54321",
    ANON_KEY: "anon-value",
    SERVICE_ROLE_KEY: "service-value",
  });

  assert.equal(environment.VITE_SUPABASE_URL, "http://127.0.0.1:54321");
  assert.equal(environment.VITE_SUPABASE_ANON_KEY, "anon-value");
  assert.equal(environment.SUPABASE_SERVICE_KEY, "service-value");
  assert.equal(environment.VITE_SUPABASE_SERVICE_KEY, undefined);
});

test("preserva configurações não gerenciadas ao atualizar .env.local", () => {
  const content = updateLocalEnvContent("# custom\nPORT=9999\nCUSTOM=value\n", {
    SUPABASE_URL: "http://127.0.0.1:54321",
    SUPABASE_PUBLISHABLE_KEY: "anon",
    SUPABASE_SERVICE_KEY: "service",
    VITE_SUPABASE_URL: "http://127.0.0.1:54321",
    VITE_SUPABASE_ANON_KEY: "anon",
    HOST: "127.0.0.1",
    PORT: "3000",
  });

  assert.match(content, /# custom/);
  assert.match(content, /CUSTOM=value/);
  assert.match(content, /PORT="3000"/);
  assert.doesNotMatch(content, /PORT=9999/);
  assert.doesNotMatch(content, /SUPABASE_SERVICE_KEY.*VITE_/);
});

test("valida os recursos mínimos do Docker", () => {
  assert.equal(validateDockerInfo({ NCPU: 4, MemTotal: 8 * 1024 ** 3 }).valid, true);
  const result = validateDockerInfo({ NCPU: 1, MemTotal: 2 * 1024 ** 3 });
  assert.equal(result.valid, false);
  assert.equal(result.problems.length, 2);
});

test("confirma que todas as migrations locais foram aplicadas", () => {
  assert.deepEqual(
    validateAppliedMigrations(
      {
        migrations: [
          { local: "20260523120000", remote: "20260523120000" },
          { local: "20260524193000", remote: "20260524193000" },
        ],
      },
      ["20260523120000", "20260524193000"],
    ),
    { applied: 2 },
  );
  assert.throws(
    () => validateAppliedMigrations({ migrations: [] }, ["20260523120000"]),
    /Migrations não aplicadas/,
  );
});
