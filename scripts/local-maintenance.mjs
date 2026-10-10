import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { startProductionServer } from "./production-server.mjs";
import { assertSupportedNodeVersion } from "./check-node-version.mjs";
import {
  checkSupabaseHealth,
  getExpectedMigrations,
  parseMigrationStatus,
  redactSupabaseOutput,
  validateAppliedMigrations,
  waitForSupabaseHealth,
} from "./setup-local.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const supabaseCliPath = resolve(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "supabase.cmd" : "supabase",
);
const networkId = "garagem-erp-local";
const timeoutSignal = () => AbortSignal.timeout(5_000);

function isLoopbackUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} não é uma URL válida.`);
  }

  const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
  if (!loopbackHosts.has(url.hostname.toLowerCase())) {
    throw new Error(
      `${label} precisa apontar para localhost; este fluxo é somente para o Supabase Local.`,
    );
  }

  return url;
}

export function assertLocalEnvironment(environment) {
  if (!environment.SUPABASE_URL?.trim()) {
    throw new Error("Defina SUPABASE_URL no .env.local executando npm run setup:local.");
  }
  if (!environment.SUPABASE_SERVICE_KEY?.trim()) {
    throw new Error("Defina SUPABASE_SERVICE_KEY no .env.local executando npm run setup:local.");
  }

  const apiUrl = isLoopbackUrl(environment.SUPABASE_URL, "SUPABASE_URL");
  if (environment.VITE_SUPABASE_URL?.trim()) {
    const clientUrl = isLoopbackUrl(environment.VITE_SUPABASE_URL, "VITE_SUPABASE_URL");
    if (clientUrl.protocol !== apiUrl.protocol || clientUrl.port !== apiUrl.port) {
      throw new Error(
        "SUPABASE_URL e VITE_SUPABASE_URL precisam apontar para o mesmo Supabase Local.",
      );
    }
  }

  const port = Number(environment.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT precisa ser um número entre 1 e 65535 para o healthcheck local.");
  }

  return {
    apiUrl: apiUrl.origin,
    appUrl: `http://127.0.0.1:${port}`,
  };
}

function assertBuildEnvironment(environment) {
  const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter(
    (key) => !environment[key]?.trim(),
  );
  if (missing.length > 0) {
    throw new Error(
      `Não é possível atualizar o build local: faltam ${missing.join(" e ")}. ` +
        "Execute npm run setup:local para gerar .env.local.",
    );
  }
  if (environment.VITE_SUPABASE_SERVICE_KEY?.trim()) {
    throw new Error(
      "VITE_SUPABASE_SERVICE_KEY é insegura e não pode ser usada no build. " +
        "Mantenha a chave de serviço somente em SUPABASE_SERVICE_KEY.",
    );
  }
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    ...options,
  });
}

function commandFailure(result, fallback) {
  if (result?.error) return result.error.message;
  return redactSupabaseOutput(result?.stderr?.trim() || result?.stdout?.trim() || fallback);
}

function assertSuccessfulCommand(result, message) {
  if (result?.error || result?.status !== 0) {
    throw new Error(`${message}: ${commandFailure(result, "comando encerrado sem sucesso")}`);
  }
}

function printCommandOutput(result, log) {
  const output = redactSupabaseOutput(`${result.stdout ?? ""}${result.stderr ?? ""}`).trim();
  if (output) log(output);
}

function assertSupabaseCliInstalled() {
  if (!existsSync(supabaseCliPath)) {
    throw new Error(
      "A CLI local do Supabase não está instalada. Execute npm ci e tente novamente.",
    );
  }
}

function readExpectedMigrations(expectedMigrations) {
  return expectedMigrations ?? getExpectedMigrations();
}

function readMigrationHistory({ runCommand: execute, expectedMigrations }) {
  const result = execute(
    supabaseCliPath,
    ["migration", "list", "--local", "--network-id", networkId, "--output-format", "json"],
    { stdio: "pipe" },
  );
  assertSuccessfulCommand(result, "Não foi possível consultar o histórico de migrations locais");

  const parsed = parseMigrationStatus(result.stdout ?? "");
  return validateAppliedMigrations(parsed, readExpectedMigrations(expectedMigrations));
}

export async function runLocalHealthcheck(options = {}) {
  const environment = options.environment ?? process.env;
  const local = assertLocalEnvironment(environment);
  const appUrl = options.appUrl ?? local.appUrl;
  isLoopbackUrl(appUrl, "URL da aplicação");

  const execute = options.runCommand ?? runCommand;
  const fetchImpl = options.fetchImpl ?? fetch;
  const migrationStatus = readMigrationHistory({
    runCommand: execute,
    expectedMigrations: options.expectedMigrations,
  });

  let supabaseStatus;
  try {
    supabaseStatus = await checkSupabaseHealth(environment, fetchImpl);
  } catch (error) {
    throw new Error(
      `Healthcheck do Supabase falhou: ${error instanceof Error ? error.message : error}. ` +
        "Confirme se o Supabase Local está ativo com npm run supabase:start.",
    );
  }

  let appResponse;
  try {
    appResponse = await fetchImpl(`${appUrl.replace(/\/+$/, "")}/login`, {
      signal: timeoutSignal(),
    });
  } catch (error) {
    throw new Error(
      `Healthcheck da aplicação falhou: ${error instanceof Error ? error.message : error}. ` +
        "Inicie a aplicação com npm run dev ou npm run start.",
    );
  }
  if (!appResponse.ok) {
    throw new Error(
      `Healthcheck da aplicação falhou: aplicação respondeu HTTP ${appResponse.status}.`,
    );
  }

  return {
    app: true,
    auth: supabaseStatus.auth,
    postgrest: supabaseStatus.rest,
    migrations: migrationStatus.applied,
  };
}

export async function runLocalUpdate(options = {}) {
  const environment = options.environment ?? process.env;
  assertSupportedNodeVersion(options.nodeVersion);
  const local = assertLocalEnvironment(environment);
  assertBuildEnvironment(environment);
  assertSupabaseCliInstalled();

  const execute = options.runCommand ?? runCommand;
  const log = options.log ?? (() => {});
  const fetchImpl = options.fetchImpl ?? fetch;
  const expectedMigrations = readExpectedMigrations(options.expectedMigrations);

  const versionResult = execute("git", ["rev-parse", "--short", "HEAD"], { stdio: "pipe" });
  assertSuccessfulCommand(versionResult, "Não foi possível identificar a versão local do código");
  const commit = versionResult.stdout.trim();
  if (!commit) throw new Error("O Git não informou a versão atual do código.");
  const changesResult = execute("git", ["status", "--porcelain", "--untracked-files=normal"], {
    stdio: "pipe",
  });
  assertSuccessfulCommand(changesResult, "Não foi possível verificar alterações locais do código");
  const isDirty = Boolean(changesResult.stdout.trim());
  const version = isDirty ? `${commit}-dirty` : commit;
  log(
    `Atualizando instalação local na versão ${version}${isDirty ? " (há alterações locais não commitadas)" : ""}.`,
  );

  const startResult = execute(npmCommand, ["run", "supabase:start"], {
    env: { ...process.env, ...environment },
    stdio: "pipe",
  });
  printCommandOutput(startResult, log);
  assertSuccessfulCommand(startResult, "Não foi possível iniciar o Supabase Local");

  await waitForSupabaseHealth(environment, {
    fetchImpl,
    timeoutMs: options.healthTimeoutMs ?? 30_000,
    intervalMs: options.healthIntervalMs ?? 500,
  });

  const migrationResult = execute(
    supabaseCliPath,
    ["migration", "up", "--local", "--network-id", networkId],
    { stdio: "pipe" },
  );
  printCommandOutput(migrationResult, log);
  assertSuccessfulCommand(
    migrationResult,
    "Não foi possível aplicar as migrations pendentes no Supabase Local",
  );

  const migrationStatus = readMigrationHistory({ runCommand: execute, expectedMigrations });
  log(`Migrations locais verificadas (${migrationStatus.applied}).`);

  const buildResult = execute(npmCommand, ["run", "build"], {
    env: { ...process.env, ...environment },
    stdio: "pipe",
  });
  printCommandOutput(buildResult, log);
  assertSuccessfulCommand(buildResult, "Não foi possível gerar o build atualizado");

  const startTemporaryServer =
    options.startTemporaryServer ??
    (() =>
      startProductionServer({
        hostname: "127.0.0.1",
        port: 0,
        silent: true,
      }));
  const server = await startTemporaryServer();

  try {
    const health = await runLocalHealthcheck({
      environment,
      expectedMigrations,
      runCommand: execute,
      fetchImpl,
      appUrl: server.url,
    });
    return { version, health, apiUrl: local.apiUrl };
  } finally {
    await server.close(true);
  }
}

async function healthcheckMain() {
  const result = await runLocalHealthcheck();
  console.log(
    `Healthcheck local passou: aplicação, Auth e PostgREST respondendo; ${result.migrations} migrations aplicadas.`,
  );
}

async function updateMain() {
  const result = await runLocalUpdate({ log: console.log });
  console.log(
    `Atualização local validada (${result.version}): aplicação, Auth e PostgREST respondendo; ` +
      `${result.health.migrations} migrations aplicadas. O Supabase e seus volumes foram preservados.`,
  );
}

const currentScript = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href;
if (currentScript === import.meta.url) {
  const action = process.argv[2];
  const main = action === "healthcheck" ? healthcheckMain : action === "update" ? updateMain : null;
  if (!main) {
    console.error("Uso: node scripts/local-maintenance.mjs <healthcheck|update>");
    process.exitCode = 2;
  } else {
    main().catch((error) => {
      const label =
        action === "update" ? "Atualização local interrompida" : "Healthcheck local falhou";
      console.error(`\n${label}: ${error instanceof Error ? error.message : error}`);
      process.exitCode = 1;
    });
  }
}
