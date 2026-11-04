import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MAX_VEHICLE_PHOTO_BYTES,
  VEHICLE_PHOTO_INPUT_TYPES,
  optimizeVehiclePhoto,
} from "./vehicle-photo-image.js";

export const VEHICLE_PHOTO_BUCKET = "vehicle-photos";
export const MAX_VEHICLE_PHOTOS = 15;
const SIGNED_URL_SECONDS = 60 * 60;

type VehiclePhotoRow = {
  id: string;
  vehicle_id: number;
  storage_path: string;
  content_type: "image/jpeg";
  file_size_bytes: number;
  content_digest: string | null;
  deletion_pending: boolean;
  is_preview: boolean;
  pending_cleanup_paths: string[];
  created_at: string;
  updated_at: string;
};

export type VehiclePhoto = VehiclePhotoRow & {
  signed_url: string | null;
  preview_error: string | null;
};

export type VehiclePhotoUpload = {
  id: string;
  file: File;
  replaces?: { photoId: string; storagePath: string };
};

export type VehiclePhotoUploadResult =
  | { id: string; status: "saved"; photo: VehiclePhoto }
  | { id: string; status: "failed"; error: string; cleanupPath?: string };

export type VehiclePhotoUploadProgress =
  | VehiclePhotoUploadResult
  | { id: string; status: "uploading" };

export type LegacyVehiclePhotoImport = {
  id: string;
  vehicle_id: number;
  original_value: string;
  source_kind: "url" | "data" | "unsupported";
  status: "pending" | "imported" | "recovery_required";
  photo_id: string | null;
  last_error: string | null;
};

export class VehiclePhotoServiceError extends Error {
  cleanupPath?: string;
  constructor(message: string, options: { cleanupPath?: string } = {}) {
    super(message);
    this.name = "VehiclePhotoServiceError";
    this.cleanupPath = options.cleanupPath;
  }
}

type VehiclePhotoServiceOptions = {
  optimize?: (file: File) => Promise<Blob>;
  fetchLegacy?: typeof fetch;
};
const photoColumns =
  "id, vehicle_id, storage_path, content_type, file_size_bytes, content_digest, deletion_pending, is_preview, pending_cleanup_paths, created_at, updated_at";

function requireVehicleId(vehicleId: number) {
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1) {
    throw new VehiclePhotoServiceError("O veículo informado é inválido.");
  }
}

function errorText(error: unknown) {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : "erro desconhecido";
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: number; statusCode?: string; error?: string };
  return value.status === 404 || value.statusCode === "404" || value.error === "not_found";
}

async function imageDigest(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join(
    "",
  );
}

function rpcPhoto(data: unknown): VehiclePhotoRow | null {
  return (Array.isArray(data) ? data[0] : data) as VehiclePhotoRow | null;
}

export function createVehiclePhotoService(
  client: SupabaseClient,
  options: VehiclePhotoServiceOptions = {},
) {
  const optimize = options.optimize ?? optimizeVehiclePhoto;
  const storage = client.storage.from(VEHICLE_PHOTO_BUCKET);
  const fetchLegacy = options.fetchLegacy ?? fetch;

  async function readRows(vehicleId: number): Promise<VehiclePhotoRow[]> {
    const { data, error } = await client
      .from("vehicle_photos")
      .select(photoColumns)
      .eq("vehicle_id", vehicleId)
      .order("created_at")
      .order("id");
    if (error)
      throw new VehiclePhotoServiceError(`Não foi possível carregar a galeria: ${error.message}`);
    return (data ?? []) as VehiclePhotoRow[];
  }

  async function findPhoto(vehicleId: number, photoId: string): Promise<VehiclePhotoRow | null> {
    const { data, error } = await client
      .from("vehicle_photos")
      .select(photoColumns)
      .eq("vehicle_id", vehicleId)
      .eq("id", photoId)
      .maybeSingle();
    if (error)
      throw new VehiclePhotoServiceError(`Não foi possível confirmar a foto: ${error.message}`);
    return data as VehiclePhotoRow | null;
  }

  async function withSignedUrl(row: VehiclePhotoRow): Promise<VehiclePhoto> {
    const { data, error } = await storage.createSignedUrl(row.storage_path, SIGNED_URL_SECONDS);
    return {
      ...row,
      signed_url: data?.signedUrl ?? null,
      preview_error: error ? `Não foi possível visualizar a foto: ${error.message}` : null,
    };
  }

  async function listVehiclePhotos(vehicleId: number) {
    requireVehicleId(vehicleId);
    return Promise.all((await readRows(vehicleId)).map(withSignedUrl));
  }

  async function listVehiclePhotoPreviews(
    vehicleIds: number[],
  ): Promise<Record<number, VehiclePhoto>> {
    const ids = [...new Set(vehicleIds)];
    ids.forEach(requireVehicleId);
    if (!ids.length) return {};
    const { data, error } = await client
      .from("vehicle_photos")
      .select(photoColumns)
      .in("vehicle_id", ids)
      .eq("is_preview", true)
      .eq("deletion_pending", false);
    if (error)
      throw new VehiclePhotoServiceError(
        `Não foi possível carregar as fotos principais: ${error.message}`,
      );
    const photos = await Promise.all(((data ?? []) as VehiclePhotoRow[]).map(withSignedUrl));
    return Object.fromEntries(photos.map((photo) => [photo.vehicle_id, photo]));
  }

  async function setVehiclePhotoPreview(vehicleId: number, photoId: string) {
    requireVehicleId(vehicleId);
    const { data, error } = await client.rpc("set_vehicle_photo_preview", {
      p_vehicle_id: vehicleId,
      p_photo_id: photoId,
    });
    if (error)
      throw new VehiclePhotoServiceError(
        `Não foi possível escolher a foto principal: ${error.message}`,
      );
    const photo = rpcPhoto(data);
    if (!photo) throw new VehiclePhotoServiceError("Foto não encontrada. Atualize a galeria.");
    return withSignedUrl(photo);
  }

  async function getLegacyPhotoImport(vehicleId: number): Promise<LegacyVehiclePhotoImport | null> {
    requireVehicleId(vehicleId);
    const { data, error } = await client
      .from("vehicle_legacy_photo_imports")
      .select("id, vehicle_id, original_value, source_kind, status, photo_id, last_error")
      .eq("vehicle_id", vehicleId)
      .maybeSingle();
    if (error)
      throw new VehiclePhotoServiceError(
        `Não foi possível consultar a imagem antiga: ${error.message}`,
      );
    return data as LegacyVehiclePhotoImport | null;
  }

  async function loadLegacyFile(source: string) {
    const url = new URL(source.trim());
    if (
      url.username ||
      url.password ||
      !["http:", "https:", "data:"].includes(url.protocol) ||
      (url.protocol === "data:" && !url.href.startsWith("data:image/"))
    ) {
      throw new VehiclePhotoServiceError(
        "A referência antiga não é suportada. Selecione o arquivo para recuperá-la.",
      );
    }
    const response = await fetchLegacy(url.href, {
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new VehiclePhotoServiceError(
        "A imagem antiga não está acessível pelo link. Selecione o arquivo para recuperá-la.",
      );
    const maxSourceBytes = 20 * 1024 * 1024;
    if (Number(response.headers.get("content-length")) > maxSourceBytes) {
      throw new VehiclePhotoServiceError(
        "A imagem antiga excede 20 MB. Selecione uma cópia menor para recuperação.",
      );
    }
    const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
    if (!VEHICLE_PHOTO_INPUT_TYPES.includes(type as (typeof VEHICLE_PHOTO_INPUT_TYPES)[number])) {
      throw new VehiclePhotoServiceError(
        "A referência antiga não retornou JPEG, PNG ou WebP. Selecione o arquivo para recuperação.",
      );
    }
    const parts: ArrayBuffer[] = [];
    let size = 0;
    if (response.body) {
      const reader = response.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxSourceBytes) {
            await reader.cancel();
            throw new VehiclePhotoServiceError(
              "A imagem antiga excede 20 MB. Selecione uma cópia menor para recuperação.",
            );
          }
          parts.push(value.slice().buffer as ArrayBuffer);
        }
      } finally {
        reader.releaseLock();
      }
    }
    return new File(
      parts,
      `legacy-image.${type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg"}`,
      { type },
    );
  }

  async function importLegacyPhoto(vehicleId: number, recoveryFile?: File) {
    const legacy = await getLegacyPhotoImport(vehicleId);
    if (!legacy || legacy.status === "imported") return legacy;
    const existing = await findPhoto(vehicleId, legacy.id);
    if (!existing) {
      try {
        if (recoveryFile) await retryCleanup(`vehicles/${vehicleId}/${legacy.id}.jpg`);
        const file = recoveryFile ?? (await loadLegacyFile(legacy.original_value));
        const [result] = await uploadVehiclePhotos(vehicleId, [{ id: legacy.id, file }]);
        if (result.status === "failed")
          throw new VehiclePhotoServiceError(result.error, { cleanupPath: result.cleanupPath });
      } catch (error) {
        const message =
          error instanceof VehiclePhotoServiceError
            ? error.message
            : "Não foi possível buscar ou processar a imagem antiga. Selecione o arquivo para recuperação.";
        await client.rpc("record_vehicle_legacy_photo_import", {
          p_import_id: legacy.id,
          p_error: message,
        });
        throw new VehiclePhotoServiceError(
          `${message} A referência original continua preservada.`,
          {
            cleanupPath: error instanceof VehiclePhotoServiceError ? error.cleanupPath : undefined,
          },
        );
      }
    }
    const { data, error } = await client.rpc("record_vehicle_legacy_photo_import", {
      p_import_id: legacy.id,
      p_photo_id: legacy.id,
    });
    if (error)
      throw new VehiclePhotoServiceError(
        "A foto está salva, mas a confirmação da importação está pendente. Tente importar novamente para concluir.",
      );
    return (Array.isArray(data) ? data[0] : data) as LegacyVehiclePhotoImport;
  }

  async function removeObjects(paths: string[]) {
    if (!paths.length) return;
    const { error: removalError } = await storage.remove(paths);
    for (const path of paths) {
      const { data, error } = await storage.download(path);
      if (data || (error && !isMissingObject(error))) {
        throw new VehiclePhotoServiceError(
          `O arquivo ainda não foi removido: ${errorText(error ?? removalError ?? new Error("armazenamento indisponível"))}`,
        );
      }
    }
  }

  async function retryCleanup(path: string) {
    if (!/^vehicles\/[1-9][0-9]*\/[A-Za-z0-9-]+\.jpg$/.test(path)) {
      throw new VehiclePhotoServiceError("O caminho do arquivo pendente é inválido.");
    }
    const vehicleId = Number(path.split("/")[1]);
    requireVehicleId(vehicleId);
    try {
      const rows = await readRows(vehicleId);
      if (rows.some((photo) => photo.storage_path === path)) return "referenced" as const;
      await removeObjects([path]);
      const { error } = await client.rpc("clear_vehicle_photo_cleanup", {
        p_vehicle_id: vehicleId,
        p_storage_path: path,
      });
      if (error) throw error;
      return "removed" as const;
    } catch (error) {
      throw new VehiclePhotoServiceError(
        `A verificação ou limpeza do arquivo ainda está pendente: ${errorText(error)}. Tente novamente.`,
        { cleanupPath: path },
      );
    }
  }

  async function failedSave(message: string, path: string): Promise<never> {
    try {
      await retryCleanup(path);
    } catch {
      throw new VehiclePhotoServiceError(
        `${message} O arquivo ainda precisa ser verificado; tente novamente.`,
        { cleanupPath: path },
      );
    }
    throw new VehiclePhotoServiceError(`${message} As fotos já salvas foram mantidas.`);
  }

  async function uploadPhoto(vehicleId: number, attempt: VehiclePhotoUpload) {
    if (!/^[0-9a-f-]{36}$/i.test(attempt.id))
      throw new VehiclePhotoServiceError("A identificação da tentativa de envio é inválida.");
    if (
      !VEHICLE_PHOTO_INPUT_TYPES.includes(
        attempt.file.type as (typeof VEHICLE_PHOTO_INPUT_TYPES)[number],
      )
    ) {
      throw new VehiclePhotoServiceError(
        "Envie uma imagem JPEG, PNG ou WebP. Vídeos e outros arquivos não são aceitos.",
      );
    }
    const optimized = await optimize(attempt.file);
    if (
      optimized.type !== "image/jpeg" ||
      optimized.size < 1 ||
      optimized.size > MAX_VEHICLE_PHOTO_BYTES
    ) {
      throw new VehiclePhotoServiceError("A foto otimizada precisa ser JPEG e ter no máximo 5 MB.");
    }
    const digest = await imageDigest(optimized);
    const photoId = attempt.replaces?.photoId ?? attempt.id;
    const path = `vehicles/${vehicleId}/${attempt.id}.jpg`;
    const current = await findPhoto(vehicleId, photoId);
    if (current?.deletion_pending)
      throw new VehiclePhotoServiceError(
        "Esta foto está em remoção. Conclua a remoção antes de enviar outra.",
      );
    if (current?.storage_path === path) {
      if (current.content_digest !== digest)
        throw new VehiclePhotoServiceError(
          "Esta tentativa já foi usada para outra imagem. Selecione a nova foto novamente.",
        );
      return withSignedUrl(current);
    }
    if (attempt.replaces && current?.storage_path !== attempt.replaces.storagePath) {
      throw new VehiclePhotoServiceError(
        "Esta foto mudou ou foi removida em outra sessão. Atualize a galeria.",
      );
    }
    const { error: uploadError } = await storage.upload(path, optimized, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      const { data: uploaded } = await storage.download(path);
      if (uploaded) {
        if ((await imageDigest(uploaded)) !== digest) {
          throw new VehiclePhotoServiceError(
            "Esta tentativa já possui outro arquivo. Selecione a foto novamente.",
          );
        }
      } else {
        return failedSave(`Não foi possível enviar a foto: ${uploadError.message}.`, path);
      }
    }

    let saved: VehiclePhotoRow | null = null;
    let saveError: unknown;
    try {
      const { data, error } = await client.rpc("save_vehicle_photo", {
        p_photo_id: photoId,
        p_vehicle_id: vehicleId,
        p_storage_path: path,
        p_file_size_bytes: optimized.size,
        p_content_digest: digest,
        p_expected_storage_path: attempt.replaces?.storagePath ?? null,
      });
      saved = rpcPhoto(data);
      saveError = error;
    } catch (error) {
      saveError = error;
    }
    if (saveError || !saved) {
      let latest: VehiclePhotoRow | null;
      try {
        latest = await findPhoto(vehicleId, photoId);
      } catch {
        throw new VehiclePhotoServiceError(
          "Não foi possível confirmar se a foto foi salva. Verifique o arquivo ou repita esta tentativa quando a conexão voltar.",
          { cleanupPath: path },
        );
      }
      if (latest?.storage_path === path && latest.content_digest === digest) saved = latest;
      else return failedSave(`Não foi possível salvar a foto: ${errorText(saveError)}.`, path);
    }
    const pending = [];
    for (const oldPath of saved.pending_cleanup_paths) {
      try {
        await retryCleanup(oldPath);
      } catch {
        pending.push(oldPath);
      }
    }
    return withSignedUrl({ ...saved, pending_cleanup_paths: pending });
  }

  async function uploadVehiclePhotos(
    vehicleId: number,
    attempts: VehiclePhotoUpload[],
    onProgress?: (progress: VehiclePhotoUploadProgress) => void,
  ): Promise<VehiclePhotoUploadResult[]> {
    requireVehicleId(vehicleId);
    const results: VehiclePhotoUploadResult[] = [];
    for (const attempt of attempts) {
      onProgress?.({ id: attempt.id, status: "uploading" });
      let result: VehiclePhotoUploadResult;
      try {
        result = { id: attempt.id, status: "saved", photo: await uploadPhoto(vehicleId, attempt) };
      } catch (error) {
        result = {
          id: attempt.id,
          status: "failed",
          error: errorText(error),
          cleanupPath: error instanceof VehiclePhotoServiceError ? error.cleanupPath : undefined,
        };
      }
      results.push(result);
      onProgress?.(result);
    }
    return results;
  }

  async function removeVehiclePhoto(vehicleId: number, photoId: string) {
    requireVehicleId(vehicleId);
    const current = await findPhoto(vehicleId, photoId);
    if (!current) return;
    const { data, error } = await client.rpc("begin_vehicle_photo_removal", {
      p_vehicle_id: vehicleId,
      p_photo_id: photoId,
      p_expected_storage_path: current.storage_path,
    });
    if (error)
      throw new VehiclePhotoServiceError(
        `Não foi possível iniciar a remoção: ${error.message}. Atualize a galeria.`,
      );
    const removing = rpcPhoto(data);
    if (!removing?.id) return;
    try {
      await removeObjects([...new Set([removing.storage_path, ...removing.pending_cleanup_paths])]);
      const { error: finishError } = await client.rpc("finish_vehicle_photo_removal", {
        p_vehicle_id: vehicleId,
        p_photo_id: photoId,
      });
      if (finishError) {
        if (!(await findPhoto(vehicleId, photoId))) return;
        throw finishError;
      }
    } catch (error) {
      throw new VehiclePhotoServiceError(
        `A remoção está pendente: ${errorText(error)}. Use Tentar remoção para continuar.`,
      );
    }
  }

  return {
    listVehiclePhotos,
    listVehiclePhotoPreviews,
    setVehiclePhotoPreview,
    getLegacyPhotoImport,
    importLegacyPhoto,
    uploadVehiclePhotos,
    removeVehiclePhoto,
    retryCleanup,
  };
}
