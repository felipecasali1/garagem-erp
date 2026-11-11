import assert from "node:assert/strict";
import test from "node:test";
import { createVehicleEvaluationSaver } from "../../src/modules/vehicles/services/save-vehicle-evaluation.js";
import type {
  VehiclePhoto,
  VehiclePhotoUpload,
  VehiclePhotoUploadResult,
} from "../../src/modules/vehicles/services/vehicle-photo-service.js";
import type { Vehicle } from "../../src/shared/types/domain.js";

const vehicle: Vehicle = {
  id: 42,
  plate: "ABC1D23",
  brand: "Toyota",
  model: "Corolla",
  color: "Prata",
  fuel_type: "flex",
  transmission: "automatic",
  current_mileage: 1000,
  manufacture_year: 2024,
  model_year: 2025,
  cost_price: 0,
  sale_price: 0,
  published: false,
  status: "evaluating",
  updated_at: "2026-11-07T12:00:00Z",
};

function attempt(id: string): VehiclePhotoUpload {
  return { id, file: new File([id], `${id}.png`, { type: "image/png" }) };
}

function saved(upload: VehiclePhotoUpload): VehiclePhotoUploadResult {
  const photo: VehiclePhoto = {
    id: upload.id,
    vehicle_id: vehicle.id,
    storage_path: `vehicles/42/${upload.id}.jpg`,
    content_type: "image/jpeg",
    file_size_bytes: 100,
    content_digest: "digest",
    deletion_pending: false,
    is_preview: false,
    pending_cleanup_paths: [],
    created_at: vehicle.updated_at,
    updated_at: vehicle.updated_at,
    signed_url: null,
    preview_error: null,
  };
  return { id: upload.id, status: "saved", photo };
}

test("avaliação sem fotos é cadastrada sem acessar Storage", async () => {
  let created = 0;
  const saver = createVehicleEvaluationSaver(
    async () => {
      created++;
      return vehicle;
    },
    async () => assert.fail("Não deve enviar fotos sem arquivos selecionados."),
  );

  assert.deepEqual(await saver.save([]), { vehicle, photos: [] });
  assert.equal(created, 1);
});

test("falha no cadastro impede upload e permite repetir o mesmo cadastro", async () => {
  let created = 0;
  const file = attempt("front");
  const saver = createVehicleEvaluationSaver(
    async () => {
      if (++created === 1) throw new Error("Banco indisponível");
      return vehicle;
    },
    async (vehicleId, photos) => {
      assert.equal(created, 2);
      assert.equal(vehicleId, vehicle.id);
      return photos.map(saved);
    },
  );

  await assert.rejects(saver.save([file]), /Banco indisponível/);
  const result = await saver.save([file]);
  assert.equal(result.vehicle.id, vehicle.id);
  assert.equal(result.photos[0].status, "saved");
});

test("falha parcial mantém avaliação e repete somente a foto pendente com a mesma tentativa", async () => {
  let created = 0;
  const uploaded: VehiclePhotoUpload[][] = [];
  const first = attempt("front");
  const second = attempt("back");
  const saver = createVehicleEvaluationSaver(
    async () => {
      created++;
      return vehicle;
    },
    async (vehicleId, photos) => {
      assert.equal(vehicleId, vehicle.id);
      uploaded.push(photos);
      if (uploaded.length === 1)
        return [saved(first), { id: second.id, status: "failed", error: "Sem conexão" }];
      return photos.map(saved);
    },
  );

  const partial = await saver.save([first, second]);
  assert.equal(partial.vehicle, vehicle);
  assert.deepEqual(
    partial.photos.map((photo) => photo.status),
    ["saved", "failed"],
  );
  const retry = await saver.save([first, second]);
  assert.equal(created, 1);
  assert.deepEqual(uploaded[1], [second]);
  assert.equal(uploaded[1][0], second, "reutiliza o arquivo e a chave da tentativa");
  assert.deepEqual(
    retry.photos.map((photo) => photo.status),
    ["saved", "saved"],
  );
});

test("interrupção do lote preserva fotos confirmadas e caminhos de recuperação", async () => {
  let batches = 0;
  const first = attempt("front");
  const second = attempt("back");
  const third = attempt("side");
  const saver = createVehicleEvaluationSaver(
    async () => vehicle,
    async (_id, photos, progress) => {
      if (++batches === 1) {
        progress?.(saved(first));
        progress?.({
          id: second.id,
          status: "failed",
          error: "Confirmação pendente",
          cleanupPath: "vehicles/42/back.jpg",
        });
        throw new Error("Conexão interrompida");
      }
      assert.deepEqual(photos, [second, third]);
      return photos.map(saved);
    },
  );

  const partial = await saver.save([first, second, third]);
  assert.equal(partial.vehicle, vehicle);
  assert.deepEqual(
    partial.photos.map((photo) => photo.status),
    ["saved", "failed", "failed"],
  );
  const failure = partial.photos[1];
  assert.equal(failure.status, "failed");
  if (failure.status === "failed") assert.equal(failure.cleanupPath, "vehicles/42/back.jpg");
  assert.ok(
    (await saver.save([first, second, third])).photos.every((photo) => photo.status === "saved"),
  );
});

test("envios simultâneos do formulário compartilham o mesmo cadastro e upload", async () => {
  let finish!: (vehicle: Vehicle) => void;
  let created = 0;
  let batches = 0;
  const file = attempt("front");
  const saver = createVehicleEvaluationSaver(
    () => {
      created++;
      return new Promise<Vehicle>((resolve) => {
        finish = resolve;
      });
    },
    async (_id, photos) => {
      batches++;
      return photos.map(saved);
    },
  );

  const first = saver.save([file]);
  const duplicate = saver.save([file]);
  assert.equal(first, duplicate);
  finish(vehicle);
  await Promise.all([first, duplicate]);
  assert.equal(created, 1);
  assert.equal(batches, 1);
});
