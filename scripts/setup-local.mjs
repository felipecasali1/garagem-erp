import { chmodSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { assertSupportedNodeVersion } from "./check-node-version.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const supabaseCliPath = resolve(
  projectRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "supabase.cmd" : "supabase",
);

export const minimumDockerCpus = 2;
export const minimumDockerMemoryBytes = 4 * 1024 ** 3;
export const localEnvPath = resolve(projectRoot, ".env.local");

const managedEnvironmentKeys = [
  "SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "HOST",
  "PORT",
];

const sensitiveKeyPattern =
  "PUBLISHABLE_KEY|SECRET_KEY|ANON_KEY|SERVICE_ROLE_KEY|JWT_SECRET|S3_PROTOCOL_ACCESS_KEY_ID|S3_PROTOCOL_ACCESS_KEY_SECRET";
const sensitiveJsonValuePattern = new RegExp(
  `("(?:${sensitiveKeyPattern})"\\s*:\\s*")([^"]*)(")`,
  "gi",
);
const sensitiveEnvValuePattern = new RegExp(
  `\\b((?:${sensitiveKeyPattern}))\\s*=\\s*([^\\s,}]+)`,
  "gi",
);
const sensitiveLabelValuePattern =
  /((?:service[_ ]role|publishable|anon|secret|jwt|s3[_ ]protocol[_ ]access)[ _-]*(?:key|secret|id)?\s*[:=]\s*)([^\s,}]+)/gi;

export function redactSupabaseOutput(output) {
  return output
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(sensitiveJsonValuePattern, "$1[valor omitido]$3")
        .replace(sensitiveEnvValuePattern, "$1=[valor omitido]")
        .replace(sensitiveLabelValuePattern, "$1[valor omitido]"),
    )
    .join("\n");
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: projectRoot,
    encoding: "utf8",
    ...options,
  });
}

function formatCommandError(result, fallback) {
  if (result?.error) return result.error.message;
  return redactSupabaseOutput(result?.stderr?.trim() || result?.stdout?.trim() || fallback);
}

function assertSuccessfulCommand(result, message) {
  if (result.error || result.status !== 0) {
    throw new Error(`${message}: ${formatCommandError(result, "comando encerrado sem sucesso")}`);
  }
}

export function parseEnvOutput(output) {
  const values = {};

  for (const line of output.split(/\r?\n/)) {
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (!match) continue;

    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replace(/\\'/g, "'");
    }

    values[match[1]] = value;
  }

  return values;
}

function requireEnvironmentValue(values, names, label) {
  for (const name of names) {
    if (values[name]?.trim()) return values[name].trim();
  }

  throw new Error(
    `O Supabase Local não informou ${label}. ` +
      `Verifique se o stack iniciou corretamente e tente novamente.`,
  );
}

export function buildLocalEnvironment(statusEnvironment) {
  const apiUrl = requireEnvironmentValue(statusEnvironment, ["API_URL", "KONG_URL"], "a API_URL");
  const anonKey = requireEnvironmentValue(
    statusEnvironment,
    ["ANON_KEY", "PUBLISHABLE_KEY"],
    "a chave pública (ANON_KEY)",
  );
  const serviceKey = requireEnvironmentValue(
    statusEnvironment,
    ["SERVICE_ROLE_KEY", "SECRET_KEY"],
    "a chave de serviço (SERVICE_ROLE_KEY)",
  );

  return {
    SUPABASE_URL: apiUrl,
    SUPABASE_PUBLISHABLE_KEY: anonKey,
    SUPABASE_SERVICE_KEY: serviceKey,
    VITE_SUPABASE_URL: apiUrl,
    VITE_SUPABASE_ANON_KEY: anonKey,
    HOST: "127.0.0.1",
    PORT: "3000",
  };
}

function escapeEnvValue(value) {
  return JSON.stringify(String(value));
}

export function updateLocalEnvContent(existingContent, values) {
  const managed = new Set(managedEnvironmentKeys);
  const written = new Set();
  const lines = existingContent ? existingContent.split(/\r?\n/) : [];
  const nextLines = [];

  for (const line of lines) {
    const match = /^([A-Z][A-Z0-9_]*)=/.exec(line.trim());
    if (!match || !managed.has(match[1])) {
      nextLines.push(line);
      continue;
    }

    if (!written.has(match[1]) && values[match[1]] !== undefined) {
      nextLines.push(`${match[1]}=${escapeEnvValue(values[match[1]])}`);
      written.add(match[1]);
    }
  }

  const missing = managedEnvironmentKeys.filter((key) => !written.has(key));
  if (missing.length > 0) {
    if (nextLines.length > 0 && nextLines.at(-1) !== "") nextLines.push("");
    nextLines.push("# Gerado por npm run setup:local. Não versione este arquivo.");
    for (const key of missing) {
      nextLines.push(`${key}=${escapeEnvValue(values[key])}`);
    }
  }

  return `${nextLines.join("\n").replace(/\n+$/, "")}\n`;
}

export function validateDockerInfo(info, options = {}) {
  const minimumCpus = options.minimumCpus ?? minimumDockerCpus;
  const minimumMemoryBytes = options.minimumMemoryBytes ?? minimumDockerMemoryBytes;
  const cpus = Number(info?.NCPU);
  const memoryBytes = Number(info?.MemTotal);
  const problems = [];

  if (!Number.isFinite(cpus)) {
    problems.push("não foi possível ler a quantidade de CPUs disponível ao Docker");
  } else if (cpus < minimumCpus) {
    problems.push(
      `o Docker precisa disponibilizar pelo menos ${minimumCpus} CPUs (encontrado: ${cpus})`,
    );
  }

  if (!Number.isFinite(memoryBytes)) {
    problems.push("não foi possível ler a memória disponível ao Docker");
  } else if (memoryBytes < minimumMemoryBytes) {
    const availableGb = (memoryBytes / 1024 ** 3).toFixed(1);
    const requiredGb = (minimumMemoryBytes / 1024 ** 3).toFixed(1);
    problems.push(
      `o Docker precisa disponibilizar pelo menos ${requiredGb} GB de memória (encontrado: ${availableGb} GB)`,
    );
  }

  return {
    valid: problems.length === 0,
    cpus,
    memoryBytes,
    problems,
  };
}

function ensureDockerReady() {
  const version = runCommand("docker", ["version", "--format", "{{.Server.Version}}"]);
  assertSuccessfulCommand(
    version,
    "Docker não está disponível. Instale/inicie o Docker e tente novamente",
  );

  const infoResult = runCommand("docker", ["info", "--format", "{{json .}}"]);
  assertSuccessfulCommand(
    infoResult,
    "O Docker está instalado, mas o daemon não está acessível. Inicie o Docker e tente novamente",
  );

  let info;
  try {
    info = JSON.parse(infoResult.stdout.trim());
  } catch {
    throw new Error(
      "O Docker respondeu sem informações de recursos legíveis. Atualize o Docker e tente novamente.",
    );
  }

  const resources = validateDockerInfo(info);
  if (!resources.valid) {
    throw new Error(
      `Recursos mínimos não atendidos pelo Docker: ${resources.problems.join("; ")}. ` +
        "Aumente os recursos disponíveis ao Docker e tente novamente.",
    );
  }

  console.log(
    `Docker disponível (${resources.cpus} CPUs, ${(resources.memoryBytes / 1024 ** 3).toFixed(1)} GB).`,
  );
}

function ensureSupabaseCliInstalled() {
  if (!existsSync(supabaseCliPath)) {
    throw new Error(
      "A CLI do Supabase não está instalada neste projeto. Execute `npm ci` e tente novamente.",
    );
  }

  const version = runCommand(supabaseCliPath, ["--version"]);
  assertSuccessfulCommand(version, "Não foi possível executar a CLI do Supabase");
}

function runNpmScript(script, options = {}) {
  return runCommand(npmCommand, ["run", script], options);
}

function startSupabase() {
  console.log("Iniciando o Supabase Local e aplicando migrations...");
  const result = runNpmScript("supabase:start", { stdio: "pipe" });
  const output = redactSupabaseOutput(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  if (output.trim()) process.stdout.write(`${output.trim()}\n`);
  assertSuccessfulCommand(result, "Não foi possível iniciar o Supabase Local");
}

function readSupabaseStatus() {
  const result = runNpmScript("supabase:env", { stdio: "pipe" });
  assertSuccessfulCommand(
    result,
    "Não foi possível ler as credenciais do Supabase Local. Verifique se o stack está ativo",
  );

  const values = parseEnvOutput(result.stdout);
  if (!values.API_URL && !values.KONG_URL) {
    throw new Error(
      "O Supabase Local iniciou, mas não informou API_URL. Execute `npm run supabase:env` para investigar.",
    );
  }

  return values;
}

function parseMigrationStatus(output) {
  for (const line of output.split(/\r?\n/)) {
    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed.migrations)) return parsed;
    } catch {
      // The CLI can print connection and update messages around its JSON output.
    }
  }

  throw new Error("A CLI do Supabase não retornou um histórico de migrations legível.");
}

export function validateAppliedMigrations(status, expectedMigrations) {
  const applied = new Set(
    (status.migrations ?? [])
      .filter(
        (migration) => migration.local && migration.remote && migration.local === migration.remote,
      )
      .map((migration) => migration.local),
  );
  const missing = expectedMigrations.filter((migration) => !applied.has(migration));

  if (missing.length > 0) {
    throw new Error(
      `Migrations não aplicadas no Supabase Local: ${missing.join(", ")}. ` +
        "Verifique o histórico e corrija o banco antes de continuar.",
    );
  }

  return { applied: expectedMigrations.length };
}

function verifyMigrations() {
  const result = runCommand(
    supabaseCliPath,
    [
      "migration",
      "list",
      "--local",
      "--network-id",
      "garagem-erp-local",
      "--output-format",
      "json",
    ],
    { stdio: "pipe" },
  );
  assertSuccessfulCommand(
    result,
    "Não foi possível consultar o histórico de migrations do Supabase Local",
  );

  const status = parseMigrationStatus(result.stdout);
  const expected = readdirSync(resolve(projectRoot, "supabase", "migrations"))
    .map((filename) => /^(\d{14})_.*\.sql$/.exec(filename)?.[1])
    .filter(Boolean);
  const validation = validateAppliedMigrations(status, expected);
  console.log(`Migrations verificadas (${validation.applied}).`);
}

function writeLocalEnvironment(values) {
  const existing = existsSync(localEnvPath) ? readFileSync(localEnvPath, "utf8") : "";
  writeFileSync(localEnvPath, updateLocalEnvContent(existing, values), { mode: 0o600 });
  chmodSync(localEnvPath, 0o600);
}

function withLocalEnvironment(values) {
  return { ...process.env, ...values };
}

function buildApplication(values) {
  console.log("Gerando o build da aplicação com as credenciais locais...");
  const result = runNpmScript("build", {
    env: withLocalEnvironment(values),
    stdio: "inherit",
  });
  assertSuccessfulCommand(result, "Não foi possível gerar o build da aplicação");
}

function restartSupabase() {
  console.log("Reiniciando o Supabase para verificar persistência...");
  const stopResult = runNpmScript("supabase:stop", { stdio: "pipe" });
  const stopOutput = redactSupabaseOutput(`${stopResult.stdout ?? ""}${stopResult.stderr ?? ""}`);
  if (stopOutput.trim()) process.stdout.write(`${stopOutput.trim()}\n`);
  assertSuccessfulCommand(
    stopResult,
    "Não foi possível parar o Supabase durante a verificação de persistência",
  );
  startSupabase();
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

async function fetchWithTimeout(fetchImpl, url, options = {}) {
  return fetchImpl(url, {
    ...options,
    signal: AbortSignal.timeout(5_000),
  });
}

export async function checkSupabaseHealth(environment, fetchImpl = fetch) {
  const apiUrl = trimTrailingSlash(environment.SUPABASE_URL);
  const serviceKey = environment.SUPABASE_SERVICE_KEY;
  const authResponse = await fetchWithTimeout(fetchImpl, `${apiUrl}/auth/v1/settings`);
  if (!authResponse.ok) {
    throw new Error(`Auth respondeu HTTP ${authResponse.status}`);
  }

  const restResponse = await fetchWithTimeout(
    fetchImpl,
    `${apiUrl}/rest/v1/vehicles?select=id&limit=1`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  if (!restResponse.ok) {
    throw new Error(`PostgREST respondeu HTTP ${restResponse.status}`);
  }

  return { auth: true, rest: true };
}

async function requestSupabase(environment, path, options = {}, fetchImpl = fetch) {
  const apiUrl = trimTrailingSlash(environment.SUPABASE_URL);
  const serviceKey = environment.SUPABASE_SERVICE_KEY;
  return fetchWithTimeout(fetchImpl, `${apiUrl}${path}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...options.headers,
    },
  });
}

export async function verifySupabasePersistence(environment, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const restart = options.restart ?? (async () => {});
  const marker = `GaragemERP setup verification ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const query = encodeURIComponent(marker);
  let inserted = false;

  try {
    const insertResponse = await requestSupabase(
      environment,
      "/rest/v1/accessories",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          name: marker,
          description: "Registro temporário do healthcheck do setup local",
          active: false,
        }),
      },
      fetchImpl,
    );
    if (!insertResponse.ok) {
      throw new Error(
        `não foi possível criar o registro temporário (HTTP ${insertResponse.status})`,
      );
    }
    inserted = true;

    await restart();
    await waitForSupabaseHealth(environment, {
      fetchImpl,
      timeoutMs: options.timeoutMs ?? 30_000,
      intervalMs: options.intervalMs ?? 500,
    });

    const readResponse = await requestSupabase(
      environment,
      `/rest/v1/accessories?name=eq.${query}&select=id,name`,
      {},
      fetchImpl,
    );
    if (!readResponse.ok) {
      throw new Error(
        `não foi possível ler o registro após reiniciar (HTTP ${readResponse.status})`,
      );
    }

    const rows = await readResponse.json();
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.name !== marker) {
      throw new Error("o registro temporário não foi preservado após reiniciar o Supabase");
    }

    return { preserved: true };
  } finally {
    if (inserted) {
      try {
        const deleteResponse = await requestSupabase(
          environment,
          `/rest/v1/accessories?name=eq.${query}`,
          { method: "DELETE" },
          fetchImpl,
        );
        if (!deleteResponse.ok) {
          throw new Error(`HTTP ${deleteResponse.status}`);
        }
      } catch (error) {
        console.warn(
          `Não foi possível remover o registro temporário do healthcheck: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
  }
}

export async function waitForSupabaseHealth(environment, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await checkSupabaseHealth(environment, fetchImpl);
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
    }
  }

  throw new Error(
    `Healthcheck do Supabase não passou em ${timeoutMs / 1000}s: ${lastError?.message ?? "erro desconhecido"}. ` +
      "Verifique os logs com `docker ps` e `docker logs`.",
  );
}

export async function waitForApplicationHealth(baseUrl, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 250;
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetchWithTimeout(fetchImpl, `${trimTrailingSlash(baseUrl)}/login`);
      if (!response.ok) throw new Error(`aplicação respondeu HTTP ${response.status}`);
      return { status: response.status };
    } catch (error) {
      lastError = error;
      await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs));
    }
  }

  throw new Error(
    `Healthcheck da aplicação não passou em ${timeoutMs / 1000}s: ${lastError?.message ?? "erro desconhecido"}. ` +
      "Verifique o terminal onde o setup está rodando.",
  );
}

function startApplication(values) {
  console.log("Iniciando a aplicação em http://127.0.0.1:3000...");
  return spawn(npmCommand, ["run", "start"], {
    cwd: projectRoot,
    env: withLocalEnvironment(values),
    stdio: "inherit",
  });
}

async function keepApplicationRunning(application) {
  let stopping = false;
  const stopApplication = (signal) => {
    stopping = true;
    if (!application.killed) application.kill(signal);
  };

  const handleInterrupt = () => stopApplication("SIGINT");
  const handleTerminate = () => stopApplication("SIGTERM");
  process.once("SIGINT", handleInterrupt);
  process.once("SIGTERM", handleTerminate);

  await new Promise((resolvePromise, rejectPromise) => {
    application.once("error", rejectPromise);
    application.once("exit", (code, signal) => {
      if (stopping || code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`A aplicação encerrou inesperadamente (código ${code ?? signal}).`));
    });
  });

  process.removeListener("SIGINT", handleInterrupt);
  process.removeListener("SIGTERM", handleTerminate);
}

function printNextSteps(statusEnvironment) {
  const studioUrl = statusEnvironment.STUDIO_URL ?? "http://127.0.0.1:54323";
  console.log(`\nSetup local concluído. Supabase Studio: ${studioUrl}`);
  console.log("Aplicação: http://127.0.0.1:3000/login");
  console.log("\nPrimeiro usuário interno:");
  console.log("1. Abra o Supabase Studio e crie um usuário em Authentication > Users.");
  console.log("2. Abra o SQL Editor e vincule o mesmo e-mail ao usuário interno:");
  console.log("   select public.bootstrap_internal_user(");
  console.log("     'seu-email@exemplo.com', 'Seu Nome', 'Administrador', 'admin', true,");
  console.log("     'individual', '67999999999'");
  console.log("   );");
  console.log("3. Acesse a aplicação e faça login com o usuário criado.");
  console.log(
    "4. Para validar Auth, vínculo interno e leitura autorizada, execute: npm run setup:verify-user",
  );
  console.log("\nCtrl+C encerra a aplicação; os dados do Supabase permanecem nos volumes Docker.");
  console.log("Para parar o Supabase depois, execute: npm run supabase:stop");
}

async function main() {
  try {
    assertSupportedNodeVersion();
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }

  ensureDockerReady();
  ensureSupabaseCliInstalled();
  startSupabase();

  const statusEnvironment = readSupabaseStatus();
  const localEnvironment = buildLocalEnvironment(statusEnvironment);
  writeLocalEnvironment(localEnvironment);
  console.log(`Configuração local gravada em ${localEnvPath}.`);

  verifyMigrations();
  await waitForSupabaseHealth(localEnvironment);
  console.log("Healthcheck do Supabase passou (Auth e PostgREST).");

  await verifySupabasePersistence(localEnvironment, { restart: restartSupabase });
  console.log("Verificação de persistência passou; o registro temporário foi removido.");

  buildApplication(localEnvironment);
  const application = startApplication(localEnvironment);

  try {
    await waitForApplicationHealth("http://127.0.0.1:3000");
  } catch (error) {
    application.kill("SIGTERM");
    throw error;
  }

  printNextSteps(statusEnvironment);
  await keepApplicationRunning(application);
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isMain) {
  main().catch((error) => {
    console.error(`\nSetup local interrompido: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
}
