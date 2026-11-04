import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
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
  const priorDirectory = join(tempDirectory, "prior-migrations");
  await mkdir(priorDirectory);
  for (const file of await readdir(join(projectRoot, "supabase/migrations"))) {
    if (file.endsWith(".sql") && file < "20261103100000") {
      await copyFile(join(projectRoot, "supabase/migrations", file), join(priorDirectory, file));
    }
  }
  compose(["run", "--rm", "--volume", `${priorDirectory}:/migrations:ro,z`, "migrations"]);
  config.apiUrl = `http://127.0.0.1:${config.apiPort}`;
  const admin = createClient(config.apiUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  config.legacy = {};
  const sources = {
    empty: null,
    blank: "",
    whitespace: "   ",
    data: "data:image/jpeg;base64,bGVnYWN5LWltYWdl",
    url: "https://legacy.example.test/vehicle.jpg",
    broken: "https://legacy.example.test/missing.jpg",
    unsupported: "/old-local-file.jpg",
    full: "data:image/jpeg;base64,bGVnYWN5LWZ1bGw=",
    confirmation: "data:image/jpeg;base64,Y29uZmlybWF0aW9u",
    orphan: "data:image/jpeg;base64,b3JwaGFu",
  };
  let index = 1;
  for (const [name, image] of Object.entries(sources)) {
    config.legacy[name] = {
      ...(await createVehicle(admin, `LEG${String(index++).padStart(4, "0")}`, { image })),
      original: image,
    };
  }
  compose(["run", "--rm", "migrations"]);
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

function uploadAttempt(name, type = "image/png") {
  return { id: randomUUID(), file: new File([name], name, { type }) };
}

async function createVehicle(admin, plate, extra = {}) {
  const { data, error } = await admin
    .from("vehicles")
    .insert({
      plate,
      brand: "Toyota",
      model: "Corolla",
      color: "Prata",
      fuel_type: "flex",
      transmission: "automatic",
      manufacture_year: 2024,
      model_year: 2025,
      status: "available",
      ...extra,
    })
    .select("id")
    .single();
  assert.ifError(error);
  return data;
}

async function faultClient(user, intercept) {
  const { data } = await user.auth.getSession();
  return createClient(config.apiUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      fetch: async (input, init) => {
        const url = input instanceof Request ? input.url : String(input);
        return intercept(url, init, () => fetch(input, init));
      },
    },
  });
}

function unavailable() {
  return new Response(JSON.stringify({ message: "indisponibilidade simulada" }), {
    status: 503,
    headers: { "Content-Type": "application/json" },
  });
}

const optimize = async (file) => new Blob([file.name], { type: "image/jpeg" });

test("VehiclePhotoService manages a private gallery", { timeout: 600_000 }, async (t) => {
  t.after(async () => {
    try {
      if (config.envFile) compose(["down", "--volumes", "--remove-orphans"]);
    } finally {
      if (config.tempDirectory) await rm(config.tempDirectory, { recursive: true, force: true });
    }
  });
  await initializeCompose();
  const admin = createClient(config.apiUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const seller = await createInternalUser(admin, "seller", "seller");
  const otherSeller = await createInternalUser(admin, "seller", "other-seller");
  const financial = await createInternalUser(admin, "financial", "financial");
  const vehicle = await createVehicle(admin, "GAL1234");
  const photos = createVehiclePhotoService(seller, { optimize });
  const firstAttempts = [uploadAttempt("front.png"), uploadAttempt("rear.png")];

  await t.test("adds multiple photos and lists the saved gallery", async () => {
    const results = await photos.uploadVehiclePhotos(vehicle.id, firstAttempts);
    assert.deepEqual(
      results.map((result) => result.status),
      ["saved", "saved"],
    );
    const gallery = await photos.listVehiclePhotos(vehicle.id);
    assert.equal(gallery.length, 2);
    for (const photo of gallery) assert.equal((await fetch(photo.signed_url)).status, 200);
    await seller.storage.from(VEHICLE_PHOTO_BUCKET).remove([gallery[0].storage_path]);
    const protectedFile = await seller.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .download(gallery[0].storage_path);
    assert.ifError(protectedFile.error);
  });

  await t.test("User can choose and replace the single Vehicle preview", async () => {
    const gallery = await photos.listVehiclePhotos(vehicle.id);
    assert.ok(gallery.every((photo) => !photo.is_preview));
    assert.deepEqual(await photos.listVehiclePhotoPreviews([vehicle.id]), {});
    await photos.setVehiclePhotoPreview(vehicle.id, gallery[0].id);
    await photos.setVehiclePhotoPreview(vehicle.id, gallery[1].id);
    const selected = (await photos.listVehiclePhotos(vehicle.id)).filter(
      (photo) => photo.is_preview,
    );
    assert.equal(selected.length, 1);
    assert.equal(selected[0].id, gallery[1].id);
    const previews = await photos.listVehiclePhotoPreviews([vehicle.id]);
    assert.equal(previews[vehicle.id].id, gallery[1].id);
    assert.equal((await fetch(previews[vehicle.id].signed_url)).status, 200);
  });

  await t.test("concurrent preview choices leave exactly one selection", async () => {
    const gallery = await photos.listVehiclePhotos(vehicle.id);
    const otherPhotos = createVehiclePhotoService(otherSeller, { optimize });
    await Promise.all([
      photos.setVehiclePhotoPreview(vehicle.id, gallery[0].id),
      otherPhotos.setVehiclePhotoPreview(vehicle.id, gallery[1].id),
    ]);
    assert.equal(
      (await photos.listVehiclePhotos(vehicle.id)).filter((photo) => photo.is_preview).length,
      1,
    );
    const duplicate = await admin
      .from("vehicle_photos")
      .update({ is_preview: true })
      .eq("vehicle_id", vehicle.id);
    assert.equal(duplicate.error?.code, "23505");
  });

  await t.test("replacing a preview retains its choice and removing it clears it", async () => {
    const target = await createVehicle(admin, "PRV1234");
    const results = await photos.uploadVehiclePhotos(target.id, [
      uploadAttempt("old-preview.png"),
      uploadAttempt("other-preview.png"),
    ]);
    const [first, second] = results.map((result) => result.photo);
    await photos.setVehiclePhotoPreview(target.id, first.id);
    const [replaced] = await photos.uploadVehiclePhotos(target.id, [
      {
        ...uploadAttempt("new-preview.png"),
        replaces: { photoId: first.id, storagePath: first.storage_path },
      },
    ]);
    assert.equal(replaced.photo.is_preview, true);
    assert.equal(
      (await photos.listVehiclePhotoPreviews([target.id]))[target.id].storage_path,
      replaced.photo.storage_path,
    );
    const failing = createVehiclePhotoService(
      await faultClient(seller, (url, init, run) =>
        init?.method === "DELETE" && url.includes("/storage/v1/object/") ? unavailable() : run(),
      ),
      { optimize },
    );
    await assert.rejects(failing.removeVehiclePhoto(target.id, first.id), /remoção está pendente/);
    assert.deepEqual(await photos.listVehiclePhotoPreviews([target.id]), {});
    await assert.rejects(photos.setVehiclePhotoPreview(target.id, first.id), /em remoção/);
    await photos.setVehiclePhotoPreview(target.id, second.id);
    await photos.removeVehiclePhoto(target.id, first.id);
    assert.equal((await photos.listVehiclePhotoPreviews([target.id]))[target.id].id, second.id);
    await assert.rejects(
      photos.setVehiclePhotoPreview(vehicle.id, second.id),
      /Atualize a galeria/,
    );
  });

  await t.test(
    "migration inspects and preserves populated references and retires empty legacy values",
    async () => {
      const removed = await admin.from("vehicles").select("image").limit(1);
      assert.ok(removed.error, "vehicles.image foi retirado do esquema após a captura");
      for (const name of ["empty", "blank", "whitespace"]) {
        assert.equal(await photos.getLegacyPhotoImport(config.legacy[name].id), null);
      }
      const preserved = await photos.getLegacyPhotoImport(config.legacy.data.id);
      assert.equal(preserved.original_value, config.legacy.data.original);
      assert.equal(preserved.status, "pending");
      const unsupported = await photos.getLegacyPhotoImport(config.legacy.unsupported.id);
      assert.equal(unsupported.original_value, config.legacy.unsupported.original);
      assert.equal(unsupported.status, "recovery_required");
    },
  );

  await t.test("usable data and remote images migrate once into private Storage", async () => {
    const dataVehicle = config.legacy.data;
    const imported = await photos.importLegacyPhoto(dataVehicle.id);
    assert.equal(imported.status, "imported");
    await photos.importLegacyPhoto(dataVehicle.id);
    const gallery = await photos.listVehiclePhotos(dataVehicle.id);
    assert.equal(gallery.length, 1);
    assert.equal(gallery[0].id, imported.photo_id);
    assert.equal(gallery[0].is_preview, false, "a escolha da principal continua explícita");
    assert.equal((await fetch(gallery[0].signed_url)).status, 200);
    const remote = createVehiclePhotoService(seller, {
      optimize,
      fetchLegacy: async () =>
        new Response("remote-image", { headers: { "Content-Type": "image/jpeg" } }),
    });
    assert.equal((await remote.importLegacyPhoto(config.legacy.url.id)).status, "imported");
    assert.equal((await remote.listVehiclePhotos(config.legacy.url.id)).length, 1);
  });

  await t.test(
    "unavailable or unsupported references remain recoverable with a local file",
    async () => {
      const failing = createVehiclePhotoService(seller, {
        optimize,
        fetchLegacy: async () => new Response("missing", { status: 404 }),
      });
      await assert.rejects(
        failing.importLegacyPhoto(config.legacy.broken.id),
        /referência original continua preservada/,
      );
      const recorded = await photos.getLegacyPhotoImport(config.legacy.broken.id);
      assert.equal(recorded.status, "recovery_required");
      assert.equal(recorded.original_value, config.legacy.broken.original);
      assert.ok(recorded.last_error);
      await assert.rejects(photos.importLegacyPhoto(config.legacy.unsupported.id), /preservada/);
      for (const name of ["broken", "unsupported"]) {
        const recovered = await photos.importLegacyPhoto(
          config.legacy[name].id,
          uploadAttempt("recovered.png").file,
        );
        assert.equal(recovered.status, "imported");
        assert.equal((await photos.listVehiclePhotos(config.legacy[name].id)).length, 1);
      }
    },
  );

  await t.test(
    "manual recovery can replace an unreferenced file from an interrupted legacy import",
    async () => {
      const target = config.legacy.orphan;
      const interrupted = createVehiclePhotoService(
        await faultClient(seller, (url, init, run) =>
          url.endsWith("/rpc/save_vehicle_photo") ||
          (init?.method === "DELETE" && url.includes("/storage/v1/object/"))
            ? unavailable()
            : run(),
        ),
        { optimize },
      );
      await assert.rejects(interrupted.importLegacyPhoto(target.id), /preservada/);
      assert.equal((await photos.listVehiclePhotos(target.id)).length, 0);
      assert.equal((await photos.getLegacyPhotoImport(target.id)).status, "recovery_required");
      assert.equal(
        (await photos.importLegacyPhoto(target.id, uploadAttempt("different-recovery.png").file))
          .status,
        "imported",
      );
      assert.equal((await photos.listVehiclePhotos(target.id)).length, 1);
    },
  );

  await t.test(
    "legacy import preserves its reference at capacity and succeeds after a slot is freed",
    async () => {
      const target = config.legacy.full;
      const filled = await photos.uploadVehiclePhotos(
        target.id,
        Array.from({ length: 15 }, (_, index) => uploadAttempt(`full-${index}.png`)),
      );
      assert.ok(filled.every((result) => result.status === "saved"));
      await assert.rejects(photos.importLegacyPhoto(target.id), /15 fotos/);
      assert.equal((await photos.getLegacyPhotoImport(target.id)).original_value, target.original);
      await photos.removeVehiclePhoto(target.id, filled[0].photo.id);
      assert.equal((await photos.importLegacyPhoto(target.id)).status, "imported");
      assert.equal((await photos.listVehiclePhotos(target.id)).length, 15);
    },
  );

  await t.test(
    "legacy confirmation can be retried without fetching or duplicating its saved photo",
    async () => {
      const target = config.legacy.confirmation;
      const interrupted = createVehiclePhotoService(
        await faultClient(seller, (url, _init, run) =>
          url.endsWith("/rpc/record_vehicle_legacy_photo_import") ? unavailable() : run(),
        ),
        { optimize },
      );
      await assert.rejects(
        interrupted.importLegacyPhoto(target.id),
        /confirmação da importação está pendente/,
      );
      assert.equal((await photos.listVehiclePhotos(target.id)).length, 1);
      const recovered = createVehiclePhotoService(seller, {
        optimize,
        fetchLegacy: async () => {
          throw new Error("a origem não está mais acessível");
        },
      });
      assert.equal((await recovered.importLegacyPhoto(target.id)).status, "imported");
      assert.equal((await photos.listVehiclePhotos(target.id)).length, 1);
    },
  );

  await t.test(
    "partial uploads report each file and retry without duplicating successes",
    async () => {
      const attempts = [uploadAttempt("side.png"), uploadAttempt("interior.png")];
      const failedPath = `vehicles/${vehicle.id}/${attempts[1].id}.jpg`;
      let failing = true;
      const flaky = createVehiclePhotoService(
        await faultClient(seller, (url, init, run) =>
          failing && init?.method === "POST" && url.includes(failedPath) ? unavailable() : run(),
        ),
        { optimize },
      );
      const progress = [];
      const results = await flaky.uploadVehiclePhotos(vehicle.id, attempts, (value) =>
        progress.push(value),
      );
      assert.deepEqual(
        results.map((result) => result.status),
        ["saved", "failed"],
      );
      assert.match(results[1].error, /Não foi possível enviar/);
      assert.equal((await photos.listVehiclePhotos(vehicle.id)).length, 3);
      assert.deepEqual(
        progress.map((value) => value.status),
        ["uploading", "saved", "uploading", "failed"],
      );
      failing = false;
      const repeated = await flaky.uploadVehiclePhotos(vehicle.id, attempts);
      assert.deepEqual(
        repeated.map((result) => result.status),
        ["saved", "saved"],
      );
      assert.equal(repeated[0].photo.id, results[0].photo.id);
      assert.equal((await photos.listVehiclePhotos(vehicle.id)).length, 4);
      const reused = await photos.uploadVehiclePhotos(vehicle.id, [
        { ...attempts[0], file: new File(["other"], "other.png", { type: "image/png" }) },
      ]);
      assert.equal(reused[0].status, "failed");
      assert.equal((await photos.listVehiclePhotos(vehicle.id)).length, 4);
    },
  );

  await t.test("rejects video and oversized output while preserving the gallery", async () => {
    const before = (await photos.listVehiclePhotos(vehicle.id)).map((photo) => photo.storage_path);
    const oversized = createVehiclePhotoService(seller, {
      optimize: async () => new Blob([new Uint8Array(5242881)], { type: "image/jpeg" }),
    });
    const video = await photos.uploadVehiclePhotos(vehicle.id, [
      uploadAttempt("video.mp4", "video/mp4"),
    ]);
    assert.equal(video[0].status, "failed");
    assert.match(video[0].error, /Vídeos/);
    const large = await oversized.uploadVehiclePhotos(vehicle.id, [uploadAttempt("large.png")]);
    assert.equal(large[0].status, "failed");
    assert.match(large[0].error, /5 MB/);
    assert.deepEqual(
      (await photos.listVehiclePhotos(vehicle.id)).map((photo) => photo.storage_path),
      before,
    );
    const mime = await seller.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .upload(`vehicles/${vehicle.id}/video.mp4`, new Blob(["video"], { type: "video/mp4" }));
    assert.ok(mime.error);
    const bigFile = await seller.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .upload(
        `vehicles/${vehicle.id}/large.jpg`,
        new Blob([new Uint8Array(5242881)], { type: "image/jpeg" }),
      );
    assert.ok(bigFile.error);
  });

  await t.test("metadata failure cleans the new file and keeps saved photos", async () => {
    const attempt = uploadAttempt("metadata.png");
    const failing = createVehiclePhotoService(
      await faultClient(seller, (url, _init, run) =>
        url.endsWith("/rpc/save_vehicle_photo") ? unavailable() : run(),
      ),
      { optimize },
    );
    const result = await failing.uploadVehiclePhotos(vehicle.id, [attempt]);
    assert.equal(result[0].status, "failed");
    assert.equal((await photos.listVehiclePhotos(vehicle.id)).length, 4);
    const file = await seller.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .download(`vehicles/${vehicle.id}/${attempt.id}.jpg`);
    assert.ok(file.error);
    const retried = await photos.uploadVehiclePhotos(vehicle.id, [attempt]);
    assert.equal(retried[0].status, "saved");
    assert.equal((await photos.listVehiclePhotos(vehicle.id)).length, 5);
  });

  await t.test("ambiguous save is safely reconciled on retry", async () => {
    const attempt = uploadAttempt("uncertain.png");
    let saved = false;
    let failRead = true;
    const uncertain = createVehiclePhotoService(
      await faultClient(seller, async (url, _init, run) => {
        if (url.endsWith("/rpc/save_vehicle_photo")) {
          const response = await run();
          assert.equal(response.ok, true);
          saved = true;
          return unavailable();
        }
        if (saved && failRead && url.includes("/rest/v1/vehicle_photos?")) {
          return unavailable();
        }
        return run();
      }),
      { optimize },
    );
    const result = await uncertain.uploadVehiclePhotos(vehicle.id, [attempt]);
    failRead = false;
    assert.equal(result[0].status, "failed");
    assert.ok(result[0].cleanupPath);
    assert.equal(await photos.retryCleanup(result[0].cleanupPath), "referenced");
    const retried = await photos.uploadVehiclePhotos(vehicle.id, [attempt]);
    assert.equal(retried[0].status, "saved");
    assert.equal((await photos.listVehiclePhotos(vehicle.id)).length, 6);
  });

  await t.test(
    "an orphan from a failed save remains available for safe cleanup retry",
    async () => {
      const attempt = uploadAttempt("cleanup-retry.png");
      const failed = createVehiclePhotoService(
        await faultClient(seller, (url, init, run) =>
          url.endsWith("/rpc/save_vehicle_photo") ||
          (init?.method === "DELETE" && url.includes("/storage/v1/object/"))
            ? unavailable()
            : run(),
        ),
        { optimize },
      );
      const [result] = await failed.uploadVehiclePhotos(vehicle.id, [attempt]);
      assert.equal(result.status, "failed");
      assert.ok(result.cleanupPath);
      assert.equal((await photos.listVehiclePhotos(vehicle.id)).length, 6);
      assert.equal(await photos.retryCleanup(result.cleanupPath), "removed");
      assert.ok(
        (await seller.storage.from(VEHICLE_PHOTO_BUCKET).download(result.cleanupPath)).error,
      );
    },
  );

  await t.test("concurrent users cannot exceed 15 photos and can replace at capacity", async () => {
    const crowded = await createVehicle(admin, "CAP1234");
    const seed = await photos.uploadVehiclePhotos(
      crowded.id,
      Array.from({ length: 14 }, (_, i) => uploadAttempt(`photo-${i}.png`)),
    );
    assert.ok(seed.every((result) => result.status === "saved"));
    const otherPhotos = createVehiclePhotoService(otherSeller, { optimize });
    const attempts = Array.from({ length: 4 }, (_, i) => uploadAttempt(`concurrent-${i}.png`));
    const results = (
      await Promise.all(
        attempts.map((attempt, index) =>
          (index % 2 ? photos : otherPhotos).uploadVehiclePhotos(crowded.id, [attempt]),
        ),
      )
    ).flat();
    assert.equal(results.filter((result) => result.status === "saved").length, 1);
    assert.equal(results.filter((result) => result.status === "failed").length, 3);
    assert.ok(
      results
        .filter((result) => result.status === "failed")
        .every((result) => /15 fotos/.test(result.error)),
    );
    const fullGallery = await photos.listVehiclePhotos(crowded.id);
    assert.equal(fullGallery.length, 15);
    const stored = await seller.storage.from(VEHICLE_PHOTO_BUCKET).list(`vehicles/${crowded.id}`);
    assert.ifError(stored.error);
    assert.equal(stored.data.length, 15, "uploads rejeitados pelo limite não deixam órfãos");
    const selected = fullGallery[0];
    const replacement = {
      ...uploadAttempt("replacement.png"),
      replaces: { photoId: selected.id, storagePath: selected.storage_path },
    };
    const changed = await photos.uploadVehiclePhotos(crowded.id, [replacement]);
    assert.equal(changed[0].status, "saved");
    assert.equal(changed[0].photo.id, selected.id);
    assert.equal((await photos.listVehiclePhotos(crowded.id)).length, 15);
    assert.ok(
      (await seller.storage.from(VEHICLE_PHOTO_BUCKET).download(selected.storage_path)).error,
    );
    const stale = await photos.uploadVehiclePhotos(crowded.id, [
      { ...uploadAttempt("stale.png"), replaces: replacement.replaces },
    ]);
    assert.equal(stale[0].status, "failed");
    await photos.removeVehiclePhoto(crowded.id, selected.id);
    assert.equal((await photos.listVehiclePhotos(crowded.id)).length, 14);
    const failedIndex = results.findIndex((result) => result.status === "failed");
    const recovered = await photos.uploadVehiclePhotos(crowded.id, [attempts[failedIndex]]);
    assert.equal(recovered[0].status, "saved");
    assert.equal((await photos.listVehiclePhotos(crowded.id)).length, 15);
  });

  await t.test(
    "removal failures survive reload and can be completed without restoring deleted files",
    async () => {
      const selected = (await photos.listVehiclePhotos(vehicle.id))[0];
      const failing = createVehiclePhotoService(
        await faultClient(seller, (url, init, run) =>
          init?.method === "DELETE" && url.includes("/storage/v1/object/") ? unavailable() : run(),
        ),
        { optimize },
      );
      await assert.rejects(
        failing.removeVehiclePhoto(vehicle.id, selected.id),
        /remoção está pendente/,
      );
      const reloaded = createVehiclePhotoService(seller, { optimize });
      assert.equal(
        (await reloaded.listVehiclePhotos(vehicle.id)).find((photo) => photo.id === selected.id)
          .deletion_pending,
        true,
      );
      await reloaded.removeVehiclePhoto(vehicle.id, selected.id);
      assert.equal((await photos.listVehiclePhotos(vehicle.id)).length, 5);
      assert.ok(
        (await seller.storage.from(VEHICLE_PHOTO_BUCKET).download(selected.storage_path)).error,
      );
      await reloaded.removeVehiclePhoto(vehicle.id, selected.id);
      const next = (await photos.listVehiclePhotos(vehicle.id))[0];
      const failFinish = createVehiclePhotoService(
        await faultClient(seller, (url, _init, run) =>
          url.endsWith("/rpc/finish_vehicle_photo_removal") ? unavailable() : run(),
        ),
        { optimize },
      );
      await assert.rejects(
        failFinish.removeVehiclePhoto(vehicle.id, next.id),
        /remoção está pendente/,
      );
      const pending = (await reloaded.listVehiclePhotos(vehicle.id)).find(
        (photo) => photo.id === next.id,
      );
      assert.equal(pending.deletion_pending, true);
      await reloaded.removeVehiclePhoto(vehicle.id, next.id);
      assert.equal((await photos.listVehiclePhotos(vehicle.id)).length, 4);
    },
  );

  await t.test("private access and browser CORS remain enforced", async () => {
    const selected = (await photos.listVehiclePhotos(vehicle.id))[0];
    const anonymous = await fetch(
      `${config.apiUrl}/storage/v1/object/authenticated/${VEHICLE_PHOTO_BUCKET}/${selected.storage_path}`,
      { headers: { apikey: config.anonKey } },
    );
    assert.equal(anonymous.ok, false);
    const restricted = createVehiclePhotoService(financial, { optimize });
    assert.deepEqual(await restricted.listVehiclePhotos(vehicle.id), []);
    assert.deepEqual(await restricted.listVehiclePhotoPreviews([vehicle.id]), {});
    await assert.rejects(restricted.setVehiclePhotoPreview(vehicle.id, selected.id), /permissão/);
    assert.equal(await restricted.getLegacyPhotoImport(config.legacy.data.id), null);
    const deniedImport = await financial.rpc("record_vehicle_legacy_photo_import", {
      p_import_id: (await photos.getLegacyPhotoImport(config.legacy.data.id)).id,
    });
    assert.equal(deniedImport.error?.code, "42501");
    assert.ok(
      (await financial.storage.from(VEHICLE_PHOTO_BUCKET).download(selected.storage_path)).error,
    );
    const result = await restricted.uploadVehiclePhotos(vehicle.id, [
      uploadAttempt("forbidden.png"),
    ]);
    assert.equal(result[0].status, "failed");
    const forbidden = await financial.rpc("begin_vehicle_photo_removal", {
      p_vehicle_id: vehicle.id,
      p_photo_id: selected.id,
      p_expected_storage_path: selected.storage_path,
    });
    assert.equal(forbidden.error?.code, "42501");
    const preflight = await fetch(`${config.apiUrl}/storage/v1/object/${VEHICLE_PHOTO_BUCKET}`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://127.0.0.1:3101",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers":
          "apikey,authorization,content-type,x-client-info,x-supabase-api-version,x-upsert",
      },
    });
    assert.equal(preflight.status, 200);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://127.0.0.1:3101");
  });

  await t.test("the gallery survives Storage restart", async () => {
    const before = await photos.listVehiclePhotos(vehicle.id);
    await photos.setVehiclePhotoPreview(vehicle.id, before[0].id);
    compose(["restart", "storage"]);
    compose(["up", "--detach", "--wait", "storage"]);
    const after = await photos.listVehiclePhotos(vehicle.id);
    assert.deepEqual(
      after.map((photo) => photo.id),
      before.map((photo) => photo.id),
    );
    for (const photo of after) assert.equal((await fetch(photo.signed_url)).status, 200);
    assert.equal(after.filter((photo) => photo.is_preview).length, 1);
    assert.equal(after.find((photo) => photo.is_preview).id, before[0].id);
  });
});
