import { spawnSync } from "node:child_process";

const networkName = "garagem-erp-local";
const hostBindingOption = "com.docker.network.bridge.host_binding_ipv4";
const loopbackAddress = "127.0.0.1";

function runDocker(args) {
  return spawnSync("docker", args, { encoding: "utf8" });
}

function fail(message, result) {
  if (result?.error) {
    console.error(`${message}: ${result.error.message}`);
  } else if (result?.stderr) {
    console.error(`${message}: ${result.stderr.trim()}`);
  } else {
    console.error(message);
  }

  process.exit(1);
}

function validateLoopbackBinding(result) {
  let options;

  try {
    options = JSON.parse(result.stdout.trim() || "{}");
  } catch {
    fail(`Não foi possível verificar a rede Docker ${networkName}.`, result);
  }

  if (options[hostBindingOption] !== loopbackAddress) {
    fail(
      `A rede Docker ${networkName} já existe sem binding restrito a ${loopbackAddress}. ` +
        "Não vou alterá-la automaticamente; remova-a conscientemente e tente novamente.",
    );
  }
}

const inspection = runDocker(["network", "inspect", "--format", "{{json .Options}}", networkName]);

if (inspection.error) {
  fail("Não foi possível executar o Docker. Verifique se ele está instalado e ativo", inspection);
}

if (inspection.status === 0) {
  validateLoopbackBinding(inspection);
} else {
  if (!/not found/i.test(inspection.stderr)) {
    fail("Não foi possível inspecionar a rede Docker local", inspection);
  }

  const creation = runDocker([
    "network",
    "create",
    "--driver",
    "bridge",
    "--opt",
    `${hostBindingOption}=${loopbackAddress}`,
    networkName,
  ]);

  if (creation.error || creation.status !== 0) {
    fail("Não foi possível criar a rede Docker local restrita ao notebook", creation);
  }

  const verification = runDocker([
    "network",
    "inspect",
    "--format",
    "{{json .Options}}",
    networkName,
  ]);

  if (verification.error || verification.status !== 0) {
    fail("Não foi possível verificar a rede Docker local recém-criada", verification);
  }

  validateLoopbackBinding(verification);
}
