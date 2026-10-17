import { randomBytes, createHmac } from "node:crypto";
import { chmodSync, existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const envFile = resolve(projectRoot, ".env.compose");
const emptyEnvFile = resolve(projectRoot, "compose/empty.env");
const composeFile = resolve(projectRoot, "docker-compose.yml");
const composeEnvPrefix = "GARAGEM_LOCAL_";
const minimumMemoryBytes = 4 * 1024 ** 3;
const minimumCpus = 2;

function randomHex(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

function createLegacyJwt(role, secret) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      role,
      iss: "supabase",
      iat: issuedAt,
      exp: issuedAt + 5 * 365 * 24 * 60 * 60,
    }),
  ).toString("base64url");
  const content = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(content).digest("base64url");
  return `${content}.${signature}`;
}

function createEnvironmentFile() {
  const jwtSecret = randomBytes(48).toString("base64url");
  const values = {
    GARAGEM_LOCAL_DB_PASSWORD: randomHex(32),
    GARAGEM_LOCAL_JWT_SECRET: jwtSecret,
    GARAGEM_LOCAL_ANON_KEY: createLegacyJwt("anon", jwtSecret),
    GARAGEM_LOCAL_SERVICE_ROLE_KEY: createLegacyJwt("service_role", jwtSecret),
    GARAGEM_LOCAL_META_CRYPTO_KEY: randomBytes(32).toString("base64url"),
    GARAGEM_LOCAL_DASHBOARD_USERNAME: "supabase",
    GARAGEM_LOCAL_DASHBOARD_PASSWORD: randomHex(24),
    GARAGEM_LOCAL_APP_PORT: "3101",
    GARAGEM_LOCAL_API_PORT: "8000",
  };
  const contents = [
    "# Gerado pelo GaragemERP para o Supabase self-hosted via Docker Compose.",
    "# Ignorado pelo Git. Não compartilhe este arquivo: ele contém chaves privilegiadas.",
    "# As portas publicadas em 127.0.0.1 podem ser ajustadas se já estiverem ocupadas.",
    ...Object.entries(values).map(([name, value]) => `${name}=${value}`),
    "",
  ].join("\n");

  try {
    writeFileSync(envFile, contents, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  chmodSync(envFile, 0o600);
  return values;
}

function parseEnvironmentFile(contents) {
  return Object.fromEntries(
    contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return separator < 0 ? [line, ""] : [line.slice(0, separator), line.slice(separator + 1)];
      }),
  );
}

function loadEnvironmentFile({ create = false } = {}) {
  if (!existsSync(envFile)) {
    if (!create) {
      throw new Error(
        ".env.compose não existe. Execute `npm run selfhosted:up` para gerar a configuração local.",
      );
    }
    createEnvironmentFile();
    console.log("Configuração local criada em .env.compose com permissões restritas.");
  } else {
    const fileInfo = lstatSync(envFile);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
      throw new Error(".env.compose precisa ser um arquivo regular, não um link simbólico.");
    }
    chmodSync(envFile, 0o600);
  }

  const values = parseEnvironmentFile(readFileSync(envFile, "utf8"));
  const required = [
    "GARAGEM_LOCAL_DB_PASSWORD",
    "GARAGEM_LOCAL_JWT_SECRET",
    "GARAGEM_LOCAL_ANON_KEY",
    "GARAGEM_LOCAL_SERVICE_ROLE_KEY",
    "GARAGEM_LOCAL_META_CRYPTO_KEY",
    "GARAGEM_LOCAL_DASHBOARD_PASSWORD",
  ];
  const missing = required.filter((name) => !values[name]?.trim());
  if (missing.length) {
    throw new Error(
      `Configuração incompleta em .env.compose: ${missing.join(", ")}. ` +
        "Restaure os valores originais antes de continuar; o banco pode depender dessas credenciais.",
    );
  }

  for (const name of ["GARAGEM_LOCAL_APP_PORT", "GARAGEM_LOCAL_API_PORT"]) {
    if (values[name] && !/^\d{1,5}$/.test(values[name])) {
      throw new Error(`${name} em .env.compose deve ser uma porta numérica entre 1 e 65535.`);
    }
    const port = Number(values[name] || (name.endsWith("APP_PORT") ? 3101 : 8000));
    if (port < 1 || port > 65535) {
      throw new Error(`${name} em .env.compose deve estar entre 1 e 65535.`);
    }
  }

  return values;
}

function dockerEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith(composeEnvPrefix)) delete environment[name];
  }
  return environment;
}

function run(command, args, { capture = false, allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: dockerEnvironment(),
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });

  if (result.error) {
    if (allowFailure) return { status: 1, stdout: "", stderr: result.error.message };
    throw new Error(`Não foi possível executar ${command}: ${result.error.message}`);
  }
  if (result.status !== 0 && !allowFailure) {
    if (capture) {
      process.stderr.write(result.stderr || "");
      process.stdout.write(result.stdout || "");
    }
    throw new Error(`${command} terminou com código ${result.status ?? "desconhecido"}.`);
  }
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function composeArgs(args) {
  return ["compose", "--env-file", envFile, "--file", composeFile, ...args];
}

function assertDockerReady() {
  const version = run("docker", ["compose", "version"], { capture: true, allowFailure: true });
  if (version.status !== 0) {
    throw new Error(
      "Docker Compose v2 não está disponível. Instale/ative o Docker Compose e tente novamente.",
    );
  }

  const info = run("docker", ["info", "--format", "{{.NCPU}}|{{.MemTotal}}"], {
    capture: true,
    allowFailure: true,
  });
  if (info.status !== 0) {
    throw new Error(
      "Não consegui acessar o daemon Docker. Inicie o Docker e confirme que seu usuário pode usá-lo; " +
        "nenhum container foi iniciado.",
    );
  }

  const [cpuText, memoryText] = info.stdout.trim().split("|");
  const cpus = Number(cpuText);
  const memory = Number(memoryText);
  const problems = [];
  if (!Number.isFinite(cpus) || cpus < minimumCpus) problems.push(`mínimo de ${minimumCpus} CPUs`);
  if (!Number.isFinite(memory) || memory < minimumMemoryBytes)
    problems.push("mínimo de 4 GiB de memória");
  if (problems.length) {
    throw new Error(
      `O Docker não atende aos recursos mínimos recomendados (${problems.join(" e ")}). ` +
        "Aumente os recursos disponíveis ao Docker antes de iniciar o stack.",
    );
  }
}

function compose(args, options) {
  return run("docker", composeArgs(args), options);
}

function readComposeServices() {
  const result = compose(["ps", "--all", "--format", "json"], {
    capture: true,
    allowFailure: true,
  });
  if (result.status !== 0) {
    return { services: [], error: result.stderr.trim() || "docker compose ps falhou." };
  }
  const output = result.stdout.trim();
  if (!output) return { services: [], error: null };
  try {
    const parsed = JSON.parse(output);
    return { services: Array.isArray(parsed) ? parsed : [parsed], error: null };
  } catch {
    try {
      const services = output
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      return { services, error: null };
    } catch {
      return { services: [], error: "A saída de docker compose ps não pôde ser interpretada." };
    }
  }
}

function describeService(service) {
  const name = service.Service ?? service.Name ?? "serviço";
  const state = service.State ?? "estado desconhecido";
  const health = service.Health ? ` (${service.Health})` : "";
  const exit = service.ExitCode !== undefined ? `, exit ${service.ExitCode}` : "";
  return `${name}: ${state}${health}${exit}`;
}

async function verifyPublicApi(values, timeoutMs = 30_000) {
  const apiPort = values.GARAGEM_LOCAL_API_PORT || "8000";
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  const anonKey = values.GARAGEM_LOCAL_ANON_KEY;
  const checks = [
    { service: "Auth/gateway", path: "/auth/v1/health" },
    { service: "REST/migrations/gateway", path: "/rest/v1/vehicles?select=id&limit=0" },
  ];
  const deadline = Date.now() + timeoutMs;
  const lastStatus = new Map();

  while (Date.now() < deadline) {
    let allHealthy = true;
    for (const check of checks) {
      try {
        const response = await fetch(`${apiUrl}${check.path}`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
          signal: AbortSignal.timeout(5000),
        });
        lastStatus.set(check.service, `HTTP ${response.status}`);
        await response.text();
        if (!response.ok) allHealthy = false;
      } catch (error) {
        lastStatus.set(check.service, error instanceof Error ? error.message : "sem resposta");
        allHealthy = false;
      }
    }
    if (allHealthy) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
  }

  const summary = checks.map(
    (check) => `${check.service}: ${lastStatus.get(check.service) ?? "sem resposta"}`,
  );
  throw new Error(
    `As verificações externas do gateway falharam (${summary.join("; ")}). ` +
      "Confira os serviços auth, rest e migrations com `docker compose --env-file .env.compose ps`.",
  );
}

async function waitForHealth(timeoutMs = 150_000) {
  const required = ["db", "auth", "rest", "meta", "studio", "api-gw", "app"];
  const deadline = Date.now() + timeoutMs;
  let lastServices = [];

  const initialSnapshot = timeoutMs <= 10_000 ? readComposeServices() : null;
  if (initialSnapshot?.error) {
    throw new Error(`Não consegui consultar o estado do Docker Compose: ${initialSnapshot.error}`);
  }
  if (initialSnapshot && initialSnapshot.services.length === 0) {
    throw new Error(
      "Nenhum container do Compose está em execução. Inicie com `npm run selfhosted:up`.",
    );
  }

  while (Date.now() < deadline) {
    const snapshot = readComposeServices();
    if (snapshot.error) {
      throw new Error(`Não consegui consultar o estado do Docker Compose: ${snapshot.error}`);
    }
    lastServices = snapshot.services;
    const byName = new Map(lastServices.map((service) => [service.Service, service]));
    const migration = byName.get("migrations");
    if (migration && migration.State === "exited" && Number(migration.ExitCode) !== 0) {
      throw new Error(
        `As migrations falharam (${describeService(migration)}). ` +
          "Veja o diagnóstico com `docker compose --env-file .env.compose logs migrations`.",
      );
    }

    const missing = required.filter((name) => {
      const service = byName.get(name);
      return !service || service.State !== "running" || service.Health !== "healthy";
    });
    const migrationReady = migration?.State === "exited" && Number(migration.ExitCode) === 0;
    if (!missing.length && migrationReady) return;

    await new Promise((resolveWait) => setTimeout(resolveWait, 2000));
  }

  const byName = new Map(lastServices.map((service) => [service.Service, service]));
  const failed = required
    .map((name) => {
      const service = byName.get(name);
      if (!service) return `${name}: container não encontrado`;
      if (service.State !== "running" || service.Health !== "healthy")
        return describeService(service);
      return null;
    })
    .filter(Boolean);
  const migration = byName.get("migrations");
  if (!migration) failed.push("migrations: container não encontrado");
  else if (migration.State !== "exited" || Number(migration.ExitCode) !== 0) {
    failed.push(describeService(migration));
  }
  throw new Error(
    `O stack não ficou saudável dentro do limite de espera.${failed.length ? ` Serviços: ${failed.join("; ")}.` : ""} ` +
      "Confira `docker compose --env-file .env.compose ps` e os logs do serviço indicado.",
  );
}

async function main() {
  const command = process.argv[2];
  if (!command || !["up", "down", "healthcheck"].includes(command)) {
    throw new Error("Uso: node scripts/selfhosted-compose.mjs <up|down|healthcheck>.");
  }

  if (command === "down") {
    run("docker", [
      "compose",
      "--env-file",
      emptyEnvFile,
      "--file",
      composeFile,
      "down",
      "--remove-orphans",
    ]);
    console.log("Containers parados/removidos sem apagar volumes persistentes.");
    return;
  }

  if (command === "up") {
    assertDockerReady();
    if (!existsSync(envFile)) {
      const existingVolume = run("docker", ["volume", "inspect", "garagem-erp-db"], {
        capture: true,
        allowFailure: true,
      });
      if (existingVolume.status === 0) {
        throw new Error(
          "O volume garagem-erp-db já existe, mas .env.compose está ausente. " +
            "Restaure as credenciais correspondentes antes de iniciar; não vou gerar chaves novas para um banco existente.",
        );
      }
    }
  }

  const values = loadEnvironmentFile({ create: command === "up" });
  if (command === "up") {
    console.log("Iniciando aplicação, Supabase self-hosted e migrations pendentes...");
    compose(["up", "--detach", "--build", "--force-recreate", "migrations", "app"]);
    await waitForHealth();
    await verifyPublicApi(values);
    const appPort = values.GARAGEM_LOCAL_APP_PORT || "3101";
    const apiPort = values.GARAGEM_LOCAL_API_PORT || "8000";
    console.log("Instalação saudável.");
    console.log(`GaragemERP: http://127.0.0.1:${appPort}/login`);
    console.log(
      `Supabase Studio: http://127.0.0.1:${apiPort} (credenciais básicas em .env.compose)`,
    );
    console.log("As credenciais Cloud do .env e do .env.docker não foram utilizadas.");
    return;
  }

  await waitForHealth(10_000);
  await verifyPublicApi(values);
  console.log(
    "Healthcheck passou: Postgres, Auth, REST, Studio, gateway, migrations e aplicação estão saudáveis.",
  );
}

main().catch((error) => {
  console.error(`Self-hosted Compose: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
