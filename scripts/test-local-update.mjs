import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertLocalEnvironment } from "./local-maintenance.mjs";
import { startProductionServer } from "./production-server.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const requestTimeout = () => AbortSignal.timeout(10_000);

function runNpmScript(script, environment) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(npmCommand, ["run", script], {
      cwd: projectRoot,
      env: environment,
      stdio: "inherit",
    });
    child.once("error", rejectPromise);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error("processo encerrado com código " + (code ?? signal)));
    });
  });
}

async function main() {
  const local = assertLocalEnvironment(process.env);
  const serviceKey = process.env.SUPABASE_SERVICE_KEY;
  const marker =
    "Local update verification " + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
  const recordUrl = new URL("/rest/v1/accessories", local.apiUrl);
  let inserted = false;

  async function request(url, options = {}) {
    return fetch(url, {
      ...options,
      signal: requestTimeout(),
      headers: {
        apikey: serviceKey,
        Authorization: "Bearer " + serviceKey,
        ...options.headers,
      },
    });
  }

  try {
    let insertResponse;
    try {
      insertResponse = await request(recordUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          name: marker,
          description: "Registro temporário do teste de atualização local",
          active: false,
        }),
      });
    } catch (error) {
      throw new Error(
        "Não foi possível conectar ao Supabase Local. Inicie-o com npm run supabase:start. " +
          (error instanceof Error ? error.message : error),
      );
    }
    if (!insertResponse.ok) {
      throw new Error(
        "Não foi possível criar o registro temporário no Supabase Local (HTTP " +
          insertResponse.status +
          ").",
      );
    }
    inserted = true;

    console.log(
      "Executando atualização local com um registro temporário para verificar persistência...",
    );
    const update = spawnSync(npmCommand, ["run", "update:local"], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    });
    if (update.error || update.status !== 0) {
      throw new Error(
        "A atualização local falhou: " +
          (update.error?.message ??
            "processo encerrado com código " + (update.status ?? update.signal)),
      );
    }

    const server = await startProductionServer({
      hostname: "127.0.0.1",
      port: 0,
      silent: true,
    });
    try {
      await runNpmScript("healthcheck:local", {
        ...process.env,
        PORT: new URL(server.url).port,
      });
    } finally {
      await server.close(true);
    }

    const lookupUrl = new URL(recordUrl);
    lookupUrl.searchParams.set("name", "eq." + marker);
    lookupUrl.searchParams.set("select", "id,name");
    const readResponse = await request(lookupUrl);
    if (!readResponse.ok) {
      throw new Error(
        "Não foi possível verificar os dados após a atualização (HTTP " +
          readResponse.status +
          ").",
      );
    }
    const rows = await readResponse.json();
    assert.equal(rows.length, 1, "O registro de teste deve continuar no banco após a atualização.");
    assert.equal(rows[0].name, marker);
    console.log(
      "Teste de atualização passou: a aplicação está saudável e os dados locais foram preservados.",
    );
  } finally {
    if (inserted) {
      const deleteUrl = new URL(recordUrl);
      deleteUrl.searchParams.set("name", "eq." + marker);
      try {
        const deleteResponse = await request(deleteUrl, { method: "DELETE" });
        if (!deleteResponse.ok) {
          console.error(
            "Não foi possível remover o registro temporário (HTTP " +
              deleteResponse.status +
              ").",
          );
        }
      } catch (error) {
        console.error(
          "Não foi possível remover o registro temporário: " +
            (error instanceof Error ? error.message : error),
        );
      }
    }
  }
}

main().catch((error) => {
  console.error(
    "Teste reproduzível da atualização local falhou: " +
      (error instanceof Error ? error.message : error),
  );
  process.exitCode = 1;
});
