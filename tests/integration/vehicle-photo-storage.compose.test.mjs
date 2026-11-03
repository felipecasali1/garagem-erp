import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import test from "node:test";
import {
  createVehiclePhotoService,
  VEHICLE_PHOTO_BUCKET,
} from "../../.test-dist/src/modules/vehicles/services/vehicle-photo-service.js";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const projectName = `garagem-vehicle-photos-${randomBytes(5).toString("hex")}`;
const config = {};

function dockerEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("GARAGEM_LOCAL_")) delete environment[name];
  }
  return environment;
}

function runDocker(args) {
  const result = spawnSync("docker", args, {
    cwd: projectRoot,
    encoding: "utf8",
    env: dockerEnvironment(),
    timeout: 600_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `docker ${args.slice(0, 3).join(" ")} falhou (código ${result.status}).\n${result.stderr}\n${result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function compose(args) {
  return runDocker([
    "compose",
    "--project-name",
    projectName,
    "--env-file",
    config.envFile,
    "--file",
    join(projectRoot, "docker-compose.yml"),
    ...args,
  ]);
}

function createLegacyJwt(role, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ role, iss: "supabase", iat: now, exp: now + 3600 }),
  ).toString("base64url");
  const content = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(content).digest("base64url");
  return `${content}.${signature}`;
}

function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

async function findFreePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return port;
}

async function initializeCompose() {
  const tempDirectory = await mkdtemp(join(tmpdir(), `${projectName}-`));
  config.tempDirectory = tempDirectory;
  config.envFile = join(tempDirectory, "compose.env");
  config.apiPort = await findFreePort();
  config.jwtSecret = randomBytes(48).toString("base64url");
  config.anonKey = createLegacyJwt("anon", config.jwtSecret);
  config.serviceKey = createLegacyJwt("service_role", config.jwtSecret);
  config.dbPassword = randomSecret();
  const values = {
    GARAGEM_LOCAL_DB_PASSWORD: config.dbPassword,
    GARAGEM_LOCAL_JWT_SECRET: config.jwtSecret,
    GARAGEM_LOCAL_ANON_KEY: config.anonKey,
    GARAGEM_LOCAL_SERVICE_ROLE_KEY: config.serviceKey,
    GARAGEM_LOCAL_META_CRYPTO_KEY: randomBytes(32).toString("base64url"),
    GARAGEM_LOCAL_DASHBOARD_USERNAME: "vehicle-photo-test",
    GARAGEM_LOCAL_DASHBOARD_PASSWORD: randomSecret(24),
    GARAGEM_LOCAL_APP_PORT: "3101",
    GARAGEM_LOCAL_API_PORT: String(config.apiPort),
    GARAGEM_LOCAL_NETWORK_NAME: `${projectName}-network`,
    GARAGEM_LOCAL_DB_VOLUME_NAME: `${projectName}-db`,
    GARAGEM_LOCAL_STORAGE_VOLUME_NAME: `${projectName}-storage`,
  };
  await writeFile(
    config.envFile,
    `${Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
    { mode: 0o600 },
  );

  compose(["up", "--detach", "--wait", "api-gw"]);
  compose(["run", "--rm", "migrations"]);
  config.apiUrl = `http://127.0.0.1:${config.apiPort}`;
}

async function createInternalUser(admin, role, index) {
  const email = `vehicle-photo-${index}@example.test`;
  const password = `${randomSecret(12)}Aa1!`;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(createError);

  const { data: person, error: personError } = await admin
    .from("people")
    .insert({ name: `Foto veículo ${index}`, type: "individual" })
    .select("id")
    .single();
  assert.ifError(personError);

  const { data: employee, error: employeeError } = await admin
    .from("employees")
    .insert({ person_id: person.id, position: "Vendedor", hired_at: "2026-01-01" })
    .select("id")
    .single();
  assert.ifError(employeeError);

  const { error: userError } = await admin.from("users").insert({
    auth_user_id: created.user.id,
    person_id: person.id,
    employee_id: employee.id,
    access_role: role,
    active: true,
  });
  assert.ifError(userError);

  const client = createClient(config.apiUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);
  return client;
}

function rejectVehiclePhotoMetadataUpdates(client) {
  const simulatedError = Object.assign(new Error("falha simulada de gravação de metadados"), {
    code: "42501",
  });
  const wrapFailedWrite = (builder) =>
    new Proxy(builder, {
      get(target, property) {
        if (property === "maybeSingle") {
          return async () => ({ data: null, error: simulatedError });
        }
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        return (...args) => {
          const result = value.apply(target, args);
          return result && typeof result === "object" ? wrapFailedWrite(result) : result;
        };
      },
    });

  return new Proxy(client, {
    get(target, property) {
      if (property === "from") {
        return (table) => {
          const builder = target.from(table);
          if (table !== "vehicle_photos") return builder;
          return new Proxy(builder, {
            get(query, method) {
              if (method === "update") {
                return (...args) => wrapFailedWrite(query.update(...args));
              }
              const value = Reflect.get(query, method, query);
              return typeof value === "function" ? value.bind(query) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function loseVehiclePhotoUpdateResponseAndNextRead(client) {
  let failNextRead = false;
  const lostUpdateError = Object.assign(new Error("resposta da gravação perdida"), {
    code: "ECONNRESET",
  });
  const unavailableReadError = Object.assign(new Error("leitura temporariamente indisponível"), {
    code: "ECONNRESET",
  });

  const wrapBuilder = (builder, maybeSingle) =>
    new Proxy(builder, {
      get(target, property) {
        if (property === "maybeSingle") {
          return () => maybeSingle(() => target.maybeSingle());
        }
        const value = Reflect.get(target, property, target);
        if (typeof value !== "function") return value;
        return (...args) => wrapBuilder(value.apply(target, args), maybeSingle);
      },
    });

  const applyUpdateThenLoseResponse = async (run) => {
    const result = await run();
    assert.ifError(result.error);
    failNextRead = true;
    return { data: null, error: lostUpdateError };
  };

  const failNextReadOnce = async (run) => {
    if (failNextRead) {
      failNextRead = false;
      return { data: null, error: unavailableReadError };
    }
    return run();
  };

  return new Proxy(client, {
    get(target, property) {
      if (property === "from") {
        return (table) => {
          const builder = target.from(table);
          if (table !== "vehicle_photos") return builder;
          return new Proxy(builder, {
            get(query, method) {
              if (method === "update") {
                return (...args) => wrapBuilder(query.update(...args), applyUpdateThenLoseResponse);
              }
              if (method === "select") {
                return (...args) => wrapBuilder(query.select(...args), failNextReadOnce);
              }
              const value = Reflect.get(query, method, query);
              return typeof value === "function" ? value.bind(query) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

test(
  "VehiclePhotoService enforces private access, safe replacement/removal, and Storage persistence",
  { timeout: 600_000 },
  async (t) => {
    t.after(async () => {
      try {
        compose(["down", "--volumes", "--remove-orphans"]);
      } finally {
        if (config.tempDirectory) await rm(config.tempDirectory, { recursive: true, force: true });
      }
    });

    await initializeCompose();
    const admin = createClient(config.apiUrl, config.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const seller = await createInternalUser(admin, "seller", "seller");
    const financial = await createInternalUser(admin, "financial", "financial");
    const vehicleNumber = String(randomBytes(3).readUIntBE(0, 3)).padStart(6, "0");
    const { data: vehicle, error: vehicleError } = await admin
      .from("vehicles")
      .insert({
        plate: `PH${vehicleNumber}`,
        brand: "Toyota",
        model: "Corolla de teste",
        color: "Prata",
        fuel_type: "flex",
        transmission: "automatic",
        manufacture_year: 2024,
        model_year: 2025,
        status: "available",
      })
      .select("id")
      .single();
    assert.ifError(vehicleError);

    const imageBytes = Buffer.from("optimized-private-vehicle-photo");
    const optimized = new Blob([imageBytes], { type: "image/jpeg" });
    const replacementBytes = Buffer.from("replacement-optimized-photo");
    const replacementOptimized = new Blob([replacementBytes], { type: "image/jpeg" });
    let objectSequence = 0;
    const makeService = (client) =>
      createVehiclePhotoService(client, {
        optimize: async (file) => (file.name.startsWith("new-") ? replacementOptimized : optimized),
        createObjectId: () => `photo-${++objectSequence}`,
      });
    const sellerPhotos = makeService(seller);
    const financialPhotos = makeService(financial);

    const first = await sellerPhotos.replaceVehiclePhoto(
      vehicle.id,
      new File(["phone-original"], "vehicle.png", { type: "image/png" }),
    );
    assert.equal(first.content_type, "image/jpeg");
    assert.equal(first.file_size_bytes, imageBytes.length);
    assert.match(first.storage_path, new RegExp(`^vehicles/${vehicle.id}/photo-[0-9]+\\.jpg$`));
    const firstResponse = await fetch(first.signed_url);
    assert.equal(firstResponse.status, 200);
    assert.deepEqual(Buffer.from(await firstResponse.arrayBuffer()), imageBytes);
    const appOrigin = "http://127.0.0.1:3101";
    const preflight = await fetch(
      `${config.apiUrl}/storage/v1/object/upload/${VEHICLE_PHOTO_BUCKET}`,
      {
        method: "OPTIONS",
        headers: {
          Origin: appOrigin,
          "Access-Control-Request-Method": "POST",
          "Access-Control-Request-Headers":
            "apikey,authorization,content-type,x-client-info,x-supabase-api-version,x-upsert",
        },
      },
    );
    assert.equal(preflight.status, 200);
    assert.equal(preflight.headers.get("access-control-allow-origin"), appOrigin);

    const failedMetadataService = createVehiclePhotoService(
      rejectVehiclePhotoMetadataUpdates(seller),
      {
        optimize: async () => replacementOptimized,
        createObjectId: () => "metadata-failure",
      },
    );
    await assert.rejects(
      failedMetadataService.replaceVehiclePhoto(
        vehicle.id,
        new File(["new image"], "new-metadata.png", { type: "image/png" }),
      ),
      /falha simulada de gravação de metadados/,
    );
    const unchangedAfterMetadataFailure = await sellerPhotos.getVehiclePhoto(vehicle.id);
    assert.equal(unchangedAfterMetadataFailure?.storage_path, first.storage_path);
    const failedUpload = await seller.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .download(`vehicles/${vehicle.id}/metadata-failure.jpg`);
    assert.ok(failedUpload.error, "arquivo de uma falha confirmada deve ser removido");

    const anonymousResponse = await fetch(
      `${config.apiUrl}/storage/v1/object/authenticated/${VEHICLE_PHOTO_BUCKET}/${first.storage_path}`,
      { headers: { apikey: config.anonKey } },
    );
    assert.equal(anonymousResponse.ok, false, "bucket privado deve bloquear acesso anônimo");

    const { data: financialMetadata, error: financialMetadataError } = await financial
      .from("vehicle_photos")
      .select("id")
      .eq("vehicle_id", vehicle.id)
      .maybeSingle();
    assert.ifError(financialMetadataError);
    assert.equal(financialMetadata, null, "usuários financeiros não leem metadados de fotos");
    const { data: financialDownload, error: financialReadError } = await financial.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .download(first.storage_path);
    assert.ok(financialReadError, "usuários financeiros não podem baixar fotos de veículos");

    const { data: financialDelete, error: financialDeleteError } = await financial.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .remove([first.storage_path]);
    assert.ok(
      financialDeleteError || financialDelete?.length === 0,
      "a remoção deve ser bloqueada para usuários sem permissão de veículo",
    );
    const stillSaved = await sellerPhotos.getVehiclePhoto(vehicle.id);
    assert.equal(stillSaved?.storage_path, first.storage_path);

    await assert.rejects(
      financialPhotos.replaceVehiclePhoto(
        vehicle.id,
        new File(["replacement"], "vehicle.png", { type: "image/png" }),
      ),
      /Não foi possível enviar a foto/,
    );

    const replacement = await sellerPhotos.replaceVehiclePhoto(
      vehicle.id,
      new File(["new phone original"], "new-vehicle.png", { type: "image/png" }),
    );
    assert.notEqual(replacement.storage_path, first.storage_path);
    assert.deepEqual(replacement.pending_cleanup_paths, []);
    const replacementResponse = await fetch(replacement.signed_url);
    assert.deepEqual(Buffer.from(await replacementResponse.arrayBuffer()), replacementBytes);
    const oldDownload = await seller.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .download(first.storage_path);
    assert.ok(oldDownload.error, "arquivo anterior deve ser removido após substituir a foto");

    const { data: rowsAfterReplace, error: rowsError } = await admin
      .from("vehicle_photos")
      .select("id, storage_path, file_size_bytes")
      .eq("vehicle_id", vehicle.id);
    assert.ifError(rowsError);
    assert.equal(rowsAfterReplace.length, 1);
    assert.equal(rowsAfterReplace[0].storage_path, replacement.storage_path);

    const { error: mimeError } = await seller.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .upload(`vehicles/${vehicle.id}/video.mp4`, new Blob(["video"], { type: "video/mp4" }), {
        contentType: "video/mp4",
      });
    assert.ok(mimeError, "Storage deve bloquear uploads que não sejam JPEG");
    const { error: sizeError } = await seller.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .upload(
        `vehicles/${vehicle.id}/too-large.jpg`,
        new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/jpeg" }),
        { contentType: "image/jpeg" },
      );
    assert.ok(sizeError, "Storage deve bloquear arquivos acima de 5 MB");

    const pendingCleanupPath = `vehicles/${vehicle.id}/pending-cleanup.jpg`;
    const { error: pendingUploadError } = await admin.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .upload(pendingCleanupPath, optimized, { contentType: "image/jpeg" });
    assert.ifError(pendingUploadError);
    const { error: pendingMetadataError } = await admin
      .from("vehicle_photos")
      .update({ pending_cleanup_paths: [pendingCleanupPath] })
      .eq("vehicle_id", vehicle.id);
    assert.ifError(pendingMetadataError);

    await sellerPhotos.removeVehiclePhoto(vehicle.id);
    const { data: rowsAfterRemove, error: rowsAfterRemoveError } = await admin
      .from("vehicle_photos")
      .select("id")
      .eq("vehicle_id", vehicle.id);
    assert.ifError(rowsAfterRemoveError);
    assert.equal(rowsAfterRemove.length, 0);
    const removedFile = await seller.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .download(replacement.storage_path);
    assert.ok(removedFile.error);
    const removedPendingFile = await seller.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .download(pendingCleanupPath);
    assert.ok(removedPendingFile.error, "a remoção também deve limpar arquivos pendentes antigos");

    const persisted = await sellerPhotos.replaceVehiclePhoto(
      vehicle.id,
      new File(["storage restart image"], "restart.png", { type: "image/png" }),
    );
    const persistedBytes = Buffer.from(await (await fetch(persisted.signed_url)).arrayBuffer());
    assert.deepEqual(persistedBytes, imageBytes);

    compose(["restart", "storage"]);
    compose(["up", "--detach", "--wait", "storage"]);
    const afterRestart = await sellerPhotos.getVehiclePhoto(vehicle.id);
    assert.ok(afterRestart);
    const persistedResponse = await fetch(afterRestart.signed_url);
    assert.equal(persistedResponse.status, 200);
    assert.deepEqual(Buffer.from(await persistedResponse.arrayBuffer()), imageBytes);
    assert.equal(persisted.file_size_bytes, imageBytes.length);

    const ambiguousPath = `vehicles/${vehicle.id}/ambiguous-save.jpg`;
    const uncertainWriteService = createVehiclePhotoService(
      loseVehiclePhotoUpdateResponseAndNextRead(seller),
      {
        optimize: async () => replacementOptimized,
        createObjectId: () => "ambiguous-save",
      },
    );
    await assert.rejects(
      uncertainWriteService.replaceVehiclePhoto(
        vehicle.id,
        new File(["uncertain response"], "ambiguous.png", { type: "image/png" }),
      ),
      (error) => {
        assert.match(error.message, /Não foi possível confirmar se a foto foi salva/);
        assert.equal(error.cleanupPath, ambiguousPath);
        return true;
      },
    );
    assert.equal(await sellerPhotos.retryCleanup(ambiguousPath), "referenced");
    const reconciled = await sellerPhotos.getVehiclePhoto(vehicle.id);
    assert.equal(reconciled?.storage_path, ambiguousPath);
    const reconciledFile = await seller.storage.from(VEHICLE_PHOTO_BUCKET).download(ambiguousPath);
    assert.ifError(reconciledFile.error);
    assert.deepEqual(Buffer.from(await reconciledFile.data.arrayBuffer()), replacementBytes);
    for (const pendingPath of reconciled.pending_cleanup_paths) {
      assert.equal(await sellerPhotos.retryCleanup(pendingPath), "removed");
    }
  },
);
