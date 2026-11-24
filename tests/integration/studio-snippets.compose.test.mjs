import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const suffix = randomBytes(6).toString("hex");
const containerName = `garagem-studio-test-${suffix}`;
const volumeName = `garagem-studio-test-${suffix}`;
const environment = { ...process.env };
for (const key of Object.keys(environment)) {
  if (key.startsWith("GARAGEM_LOCAL_") || key.startsWith("COMPOSE_")) delete environment[key];
}

function docker(args, { allowFailure = false } = {}) {
  const result = spawnSync("docker", args, {
    cwd: root,
    env: environment,
    encoding: "utf8",
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`docker falhou: ${result.stderr}`);
  return result;
}

test("o editor SQL do Studio usa snippets persistentes em um container isolado", async (t) => {
  t.after(() => {
    docker(["rm", "-f", containerName], { allowFailure: true });
    docker(["volume", "rm", volumeName], { allowFailure: true });
  });
  const config = JSON.parse(
    docker(["compose", "--env-file", "compose/empty.env", "config", "--format", "json"]).stdout,
  );
  const studio = config.services.studio;
  const directory = studio.environment.SNIPPETS_MANAGEMENT_FOLDER;
  assert.ok(directory, "O Studio precisa de uma pasta para snippets.");
  assert.ok(
    studio.volumes?.some((mount) => mount.type === "volume" && mount.target === directory),
    "A pasta de snippets precisa de um volume persistente.",
  );

  const start = () =>
    docker([
      "run",
      "-d",
      "--name",
      containerName,
      "--network",
      "none",
      "-e",
      `SNIPPETS_MANAGEMENT_FOLDER=${directory}`,
      "-e",
      "HOSTNAME=0.0.0.0",
      "-v",
      `${volumeName}:${directory}`,
      studio.image,
    ]);
  const probe = () =>
    docker(
      [
        "exec",
        containerName,
        "node",
        "-e",
        `fetch('http://127.0.0.1:3000/api/platform/projects/default/content/count?type=sql').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`,
      ],
      { allowFailure: true },
    ).status === 0;
  async function waitForStudio() {
    for (let attempt = 0; attempt < 40; attempt++) {
      if (probe()) return;
      await new Promise((done) => setTimeout(done, 500));
    }
    throw new Error("O endpoint de snippets do Studio não respondeu com sucesso.");
  }
  start();
  await waitForStudio();
  docker([
    "exec",
    containerName,
    "node",
    "-e",
    `require('node:fs').writeFileSync(process.env.SNIPPETS_MANAGEMENT_FOLDER + '/persistence-check', 'ok')`,
  ]);
  docker(["rm", "-f", containerName]);
  start();
  await waitForStudio();
  docker([
    "exec",
    containerName,
    "node",
    "-e",
    `if(require('node:fs').readFileSync(process.env.SNIPPETS_MANAGEMENT_FOLDER + '/persistence-check','utf8') !== 'ok')process.exit(1)`,
  ]);
});
