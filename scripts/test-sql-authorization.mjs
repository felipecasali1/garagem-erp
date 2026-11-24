import { createHmac, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const projectName = `garagem-sql-test-${randomBytes(6).toString("hex")}`;
const sqlDirectory = join(root, "supabase/tests/database");
const selectedFile = process.argv[2];
if (process.argv.length > 3)
  throw new Error("Uso: node scripts/test-sql-authorization.mjs [arquivo.sql]");

function jwt(role, secret) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      role,
      iss: "supabase",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  const value = `${header}.${payload}`;
  return `${value}.${createHmac("sha256", secret).update(value).digest("base64url")}`;
}

function validateTap(output, name) {
  const lines = output.split(/\r?\n/).map((line) => line.trim());
  const plans = lines.filter((line) => /^1\.\.\d+$/.test(line));
  const passed = lines.filter((line) => /^ok\s+\d+(?:\s|$)/.test(line));
  const failed = lines.filter((line) => /^not ok\b/.test(line));
  if (
    plans.length !== 1 ||
    failed.length > 0 ||
    Number(plans[0]?.slice(3)) !== passed.length ||
    passed.length === 0
  ) {
    throw new Error(`A suíte ${name} falhou ou não apresentou um plano TAP completo.`);
  }
}

const files = selectedFile
  ? [resolve(selectedFile)]
  : (await readdir(sqlDirectory))
      .filter((file) => file.endsWith("_test.sql"))
      .sort()
      .map((file) => join(sqlDirectory, file));
if (!files.length) throw new Error("Nenhum teste SQL encontrado.");
const tempDirectory = await mkdtemp(join(tmpdir(), `${projectName}-`));
const envFile = join(tempDirectory, "compose.env");
const environment = { ...process.env };
for (const name of Object.keys(environment)) {
  if (name.startsWith("GARAGEM_LOCAL_") || name.startsWith("COMPOSE_")) delete environment[name];
}
const secret = randomBytes(48).toString("base64url");
const values = {
  GARAGEM_LOCAL_DB_PASSWORD: randomBytes(32).toString("hex"),
  GARAGEM_LOCAL_JWT_SECRET: secret,
  GARAGEM_LOCAL_ANON_KEY: jwt("anon", secret),
  GARAGEM_LOCAL_SERVICE_ROLE_KEY: jwt("service_role", secret),
  GARAGEM_LOCAL_META_CRYPTO_KEY: randomBytes(32).toString("base64url"),
  GARAGEM_LOCAL_DASHBOARD_USERNAME: "sql-test",
  GARAGEM_LOCAL_DASHBOARD_PASSWORD: randomBytes(24).toString("hex"),
  GARAGEM_LOCAL_NETWORK_NAME: `${projectName}-network`,
  GARAGEM_LOCAL_DB_VOLUME_NAME: `${projectName}-db`,
  GARAGEM_LOCAL_STORAGE_VOLUME_NAME: `${projectName}-storage`,
  GARAGEM_LOCAL_STUDIO_SNIPPETS_VOLUME_NAME: `${projectName}-studio-snippets`,
};

function compose(args, input) {
  const result = spawnSync(
    "docker",
    [
      "compose",
      "--project-name",
      projectName,
      "--env-file",
      envFile,
      "--file",
      join(root, "docker-compose.yml"),
      ...args,
    ],
    {
      cwd: root,
      env: environment,
      input,
      encoding: "utf8",
      timeout: 600_000,
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `Docker Compose falhou (${result.status}):\n${result.stderr}\n${result.stdout}`,
    );
  return result.stdout;
}

try {
  await writeFile(
    envFile,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    { mode: 0o600 },
  );
  console.log("Preparando banco de testes descartável e aplicando migrations...");
  compose(["up", "--detach", "--wait", "db", "auth"]);
  compose(["run", "--rm", "migrations"]);
  for (const file of files) {
    const sql = await readFile(file, "utf8");
    console.log(`Executando ${basename(file)}...`);
    const output = compose(
      [
        "exec",
        "-T",
        "db",
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      `CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA public;\n${sql}\n`,
    );
    console.log(output);
    validateTap(output, basename(file));
  }
  console.log("Testes SQL de autorização concluídos.");
} finally {
  try {
    if (
      await readFile(envFile).then(
        () => true,
        () => false,
      )
    )
      compose(["down", "--volumes", "--remove-orphans"]);
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
}
