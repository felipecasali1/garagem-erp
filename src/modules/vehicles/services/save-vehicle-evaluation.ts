import type { Vehicle } from "../../../shared/types/domain.js";
import type {
  VehiclePhotoUpload,
  VehiclePhotoUploadProgress,
  VehiclePhotoUploadResult,
} from "./vehicle-photo-service.js";

type UploadPhotos = (
  vehicleId: number,
  photos: VehiclePhotoUpload[],
  onProgress?: (progress: VehiclePhotoUploadProgress) => void,
) => Promise<VehiclePhotoUploadResult[]>;

// One instance represents one evaluation draft, including retries after a partial upload.
export function createVehicleEvaluationSaver(
  createVehicle: () => Promise<Vehicle>,
  uploadPhotos: UploadPhotos,
) {
  let vehicle: Vehicle | undefined;
  let inFlight: Promise<{ vehicle: Vehicle; photos: VehiclePhotoUploadResult[] }> | undefined;
  const saved = new Map<string, VehiclePhotoUploadResult>();

  function save(
    photos: VehiclePhotoUpload[],
    onProgress?: (progress: VehiclePhotoUploadProgress) => void,
  ) {
    if (inFlight) return inFlight;
    const run = async () => {
      vehicle ??= await createVehicle();
      const pending = photos.filter((photo) => !saved.has(photo.id));
      const results = new Map(saved);
      const report = (progress: VehiclePhotoUploadProgress) => {
        if (progress.status !== "uploading") results.set(progress.id, progress);
        if (progress.status === "saved") saved.set(progress.id, progress);
        onProgress?.(progress);
      };
      if (pending.length) {
        try {
          const uploaded = await uploadPhotos(vehicle.id, pending, report);
          for (const result of uploaded) report(result);
        } catch (error) {
          for (const photo of pending) {
            if (results.has(photo.id)) continue;
            report({
              id: photo.id,
              status: "failed",
              error: error instanceof Error ? error.message : "Não foi possível enviar a foto.",
            });
          }
        }
      }
      return {
        vehicle,
        photos: photos.map(
          (photo): VehiclePhotoUploadResult =>
            results.get(photo.id) ?? {
              id: photo.id,
              status: "failed",
              error: "O envio não foi confirmado. Tente novamente.",
            },
        ),
      };
    };
    inFlight = run().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  }

  return { save };
}
