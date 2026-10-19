import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

async function createTemporaryDirectory(t) {
  const directory = await mkdtemp(join(tmpdir(), "garagem-selfhosted-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function createExecutable(directory, name, contents) {
  const executable = join(directory, name);
  await writeFile(executable, contents, "utf8");
  await chmod(executable, 0o755);
  return executable;
}

test("allowlists CORS do gateway autorizam o header da API do Supabase", async () => {
  const gatewayConfig = await readFile(
    new URL("../../compose/supabase/api/kong.yml", import.meta.url),
    "utf8",
  );
  const allowedHeaderCount =
    gatewayConfig.match(/^\s+-\s+X-Supabase-Api-Version\s*$/gim)?.length ?? 0;

  assert.equal(allowedHeaderCount, 2, "Auth e PostgREST devem permitir o header de versão");
});

test("selfhosted:down usa o env vazio do Compose e preserva volumes", async (t) => {
  const temporaryDirectory = await createTemporaryDirectory(t);
  const binDirectory = join(temporaryDirectory, "bin");
  const capturePath = join(temporaryDirectory, "docker-call.json");
  const cloudUrl = "https://cloud-project.example.test";
  const cloudServiceKey = "cloud-service-key-must-not-be-used";
  await mkdir(binDirectory);

  await createExecutable(
    binDirectory,
    "docker",
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.writeFileSync(process.env.TEST_CAPTURE_FILE, JSON.stringify({
  args: process.argv.slice(2),
  localPassword: process.env.GARAGEM_LOCAL_DB_PASSWORD ?? null,
}));
`,
  );

  const result = spawnSync("npm", ["run", "selfhosted:down"], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
      TEST_CAPTURE_FILE: capturePath,
      SUPABASE_URL: cloudUrl,
      SUPABASE_SERVICE_KEY: cloudServiceKey,
      VITE_SUPABASE_URL: cloudUrl,
      GARAGEM_LOCAL_DB_PASSWORD: "must-not-leak-into-compose",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const dockerCall = JSON.parse(await readFile(capturePath, "utf8"));
  assert.deepEqual(dockerCall.args, [
    "compose",
    "--env-file",
    resolve(projectRoot, "compose/empty.env"),
    "--file",
    resolve(projectRoot, "docker-compose.yml"),
    "down",
    "--remove-orphans",
  ]);
  assert.equal(dockerCall.localPassword, null);
  assert.ok(!dockerCall.args.includes("--volumes"));
});

test("runner do Compose aplica cada migration uma vez por versão", async (t) => {
  const temporaryDirectory = await createTemporaryDirectory(t);
  const migrationsDirectory = join(temporaryDirectory, "migrations");
  const binDirectory = join(temporaryDirectory, "bin");
  const statePath = join(temporaryDirectory, "migration-state.json");
  await Promise.all([mkdir(migrationsDirectory), mkdir(binDirectory)]);
  await Promise.all([
    writeFile(join(migrationsDirectory, "20261018010101_create_alpha.sql"), "SELECT 1;\n"),
    writeFile(join(migrationsDirectory, "20261018010202_create_beta.sql"), "SELECT 2;\n"),
  ]);

  await createExecutable(
    binDirectory,
    "psql",
    `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const args = process.argv.slice(2);
const inputChunks = [];
process.stdin.on("data", (chunk) => inputChunks.push(chunk));
process.stdin.on("end", () => {
  const input = Buffer.concat(inputChunks).toString("utf8");
  const statePath = process.env.MIGRATION_TEST_STATE;
  const state = fs.existsSync(statePath)
    ? JSON.parse(fs.readFileSync(statePath, "utf8"))
    : { versions: [], applied: [] };
  const versionArgument = args.find((argument) => argument.startsWith("migration_version="));
  const version = versionArgument?.slice("migration_version=".length);

  if (args.includes("-qAt")) {
    process.stdout.write(state.versions.includes(version) ? "t\\n" : "f\\n");
    return;
  }

  if (args.includes("--single-transaction")) {
    const migrationPath = input.match(/^\\\\i\\s+(.+)$/m)?.[1];
    if (!version || !migrationPath || state.versions.includes(version)) process.exit(2);
    state.versions.push(version);
    state.applied.push(path.basename(migrationPath));
    fs.writeFileSync(statePath, JSON.stringify(state));
  }
});
`,
  );

  const runnerPath = join(projectRoot, "scripts/selfhosted/apply-migrations.sh");
  const runMigrations = () =>
    spawnSync("/bin/sh", [runnerPath], {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: "postgres://test.invalid/test",
        MIGRATIONS_DIR: migrationsDirectory,
        MIGRATION_TEST_STATE: statePath,
        PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
      },
    });

  const firstRun = runMigrations();
  assert.equal(firstRun.status, 0, firstRun.stderr || firstRun.stdout);
  assert.match(firstRun.stdout, /Applying: 20261018010101_create_alpha\.sql/);
  assert.match(firstRun.stdout, /Applying: 20261018010202_create_beta\.sql/);

  const secondRun = runMigrations();
  assert.equal(secondRun.status, 0, secondRun.stderr || secondRun.stdout);
  assert.match(secondRun.stdout, /Already applied: 20261018010101_create_alpha\.sql/);
  assert.match(secondRun.stdout, /Already applied: 20261018010202_create_beta\.sql/);

  const state = JSON.parse(await readFile(statePath, "utf8"));
  assert.deepEqual(state.versions, ["20261018010101", "20261018010202"]);
  assert.deepEqual(state.applied, [
    "20261018010101_create_alpha.sql",
    "20261018010202_create_beta.sql",
  ]);
});
