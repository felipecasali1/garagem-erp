import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_VEHICLE_PHOTO_BYTES,
  MAX_VEHICLE_PHOTO_LONG_EDGE,
  optimizeVehiclePhoto,
  type VehiclePhotoImageRuntime,
} from "../../src/modules/vehicles/services/vehicle-photo-image.js";

function photoFile(type = "image/png") {
  return new File(["original image"], "vehicle.png", { type });
}

function fakeRuntime(
  width: number,
  height: number,
  render: (quality: number | undefined) => Blob,
  onDraw?: (dimensions: { width: number; height: number }) => void,
): VehiclePhotoImageRuntime {
  return {
    decode: async () => ({ width, height, close() {} }),
    createCanvas: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        drawImage: (_image, _x, _y, drawWidth, drawHeight) =>
          onDraw?.({ width: drawWidth, height: drawHeight }),
      }),
      toBlob: (callback, _type, quality) => callback(render(quality)),
    }),
  };
}

test("otimiza a imagem para JPEG e limita o lado maior a 1920 px", async () => {
  let dimensions: { width: number; height: number } | undefined;
  const optimized = await optimizeVehiclePhoto(
    photoFile(),
    fakeRuntime(
      3840,
      2160,
      () => new Blob(["jpeg"], { type: "image/jpeg" }),
      (value) => {
        dimensions = value;
      },
    ),
  );

  assert.deepEqual(dimensions, { width: MAX_VEHICLE_PHOTO_LONG_EDGE, height: 1080 });
  assert.equal(optimized.type, "image/jpeg");
  assert.ok(optimized.size <= MAX_VEHICLE_PHOTO_BYTES);
});

test("reduz a qualidade até caber no limite de armazenamento", async () => {
  const qualities: number[] = [];
  const sizedBlob = (size: number) =>
    Object.defineProperty(new Blob(["jpeg"], { type: "image/jpeg" }), "size", { value: size });
  const optimized = await optimizeVehiclePhoto(
    photoFile(),
    fakeRuntime(1200, 800, (quality) => {
      qualities.push(quality ?? 0);
      return sizedBlob(quality && quality <= 0.8 ? 4 : MAX_VEHICLE_PHOTO_BYTES + 1);
    }),
  );

  assert.ok(qualities.length > 1);
  assert.ok(optimized.size <= MAX_VEHICLE_PHOTO_BYTES);
});

test("rejeita vídeos e formatos não compatíveis antes de decodificar", async () => {
  let decoded = false;
  const runtime = fakeRuntime(10, 10, () => new Blob(["jpeg"], { type: "image/jpeg" }));
  runtime.decode = async () => {
    decoded = true;
    return { width: 10, height: 10 };
  };

  await assert.rejects(
    optimizeVehiclePhoto(photoFile("video/mp4"), runtime),
    /Vídeos e outros arquivos não são aceitos/,
  );
  assert.equal(decoded, false);
});

test("informa quando a imagem não cabe mesmo após a compressão", async () => {
  const oversized = Object.defineProperty(new Blob(["large"], { type: "image/jpeg" }), "size", {
    value: MAX_VEHICLE_PHOTO_BYTES + 1,
  });

  await assert.rejects(
    optimizeVehiclePhoto(
      photoFile(),
      fakeRuntime(640, 480, () => oversized),
    ),
    /continua maior que 5 MB/,
  );
});
