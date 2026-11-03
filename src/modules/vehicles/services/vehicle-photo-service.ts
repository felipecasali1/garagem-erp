import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_VEHICLE_PHOTO_BYTES, optimizeVehiclePhoto } from "./vehicle-photo-image.js";

export const VEHICLE_PHOTO_BUCKET = "vehicle-photos";
const SIGNED_URL_SECONDS = 60 * 60;

type VehiclePhotoRow = {
  id: string;
  vehicle_id: number;
  storage_path: string;
  content_type: "image/jpeg";
  file_size_bytes: number;
  pending_cleanup_paths: string[];
  created_at: string;
  updated_at: string;
};

export type VehiclePhoto = Omit<VehiclePhotoRow, "pending_cleanup_paths"> & {
  signed_url: string;
  pending_cleanup_paths: string[];
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
  createObjectId?: () => string;
};

const photoColumns =
  "id, vehicle_id, storage_path, content_type, file_size_bytes, pending_cleanup_paths, created_at, updated_at";

function requireVehicleId(vehicleId: number) {
  if (!Number.isSafeInteger(vehicleId) || vehicleId < 1) {
    throw new VehiclePhotoServiceError("O veículo informado é inválido.");
  }
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "erro desconhecido";
}

function isMissingObject(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: number; statusCode?: string; error?: string };
  return value.status === 404 || value.statusCode === "404" || value.error === "not_found";
}

export function createVehiclePhotoService(
  client: SupabaseClient,
  options: VehiclePhotoServiceOptions = {},
) {
  const optimize = options.optimize ?? optimizeVehiclePhoto;
  const createObjectId = options.createObjectId ?? (() => crypto.randomUUID());
  const storage = client.storage.from(VEHICLE_PHOTO_BUCKET);

  async function findCurrentPhoto(vehicleId: number): Promise<VehiclePhotoRow | null> {
    const { data, error } = await client
      .from("vehicle_photos")
      .select(photoColumns)
      .eq("vehicle_id", vehicleId)
      .maybeSingle();
    if (error) {
      throw new VehiclePhotoServiceError(
        `Não foi possível carregar a foto do veículo: ${error.message}`,
      );
    }
    return (data as VehiclePhotoRow | null) ?? null;
  }

  async function signedPhoto(row: VehiclePhotoRow): Promise<VehiclePhoto> {
    const { data, error } = await storage.createSignedUrl(row.storage_path, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) {
      throw new VehiclePhotoServiceError(
        `A foto está salva, mas não foi possível gerar uma visualização: ${error?.message ?? "URL indisponível"}. Atualize a tela para tentar novamente.`,
      );
    }
    return { ...row, signed_url: data.signedUrl };
  }

  async function removeObjects(paths: string[]) {
    if (!paths.length) return null;
    const { error: removeError } = await storage.remove(paths);
    const stillPresent: string[] = [];
    for (const path of paths) {
      const { data, error } = await storage.download(path);
      if (data) {
        stillPresent.push(path);
      } else if (error && !isMissingObject(error)) {
        return error;
      }
    }
    if (stillPresent.length) {
      const source = removeError ?? new Error("O armazenamento ainda retorna o arquivo.");
      return Object.assign(
        new Error(`${source.message} Os arquivos não removidos: ${stillPresent.join(", ")}`),
        { stillPresentPaths: stillPresent },
      );
    }
    return null;
  }

  async function getVehiclePhoto(vehicleId: number) {
    requireVehicleId(vehicleId);
    const row = await findCurrentPhoto(vehicleId);
    if (!row) return null;
    return signedPhoto(row);
  }

  async function retryCleanup(path: string) {
    if (!/^vehicles\/[1-9][0-9]*\/[A-Za-z0-9-]+\.jpg$/.test(path)) {
      throw new VehiclePhotoServiceError("O caminho do arquivo pendente é inválido.");
    }
    const vehicleId = Number(path.split("/")[1]);
    if (!Number.isSafeInteger(vehicleId)) {
      throw new VehiclePhotoServiceError("O caminho do arquivo pendente é inválido.");
    }

    let current: VehiclePhotoRow | null;
    try {
      current = await findCurrentPhoto(vehicleId);
    } catch {
      throw new VehiclePhotoServiceError(
        "Não foi possível confirmar se este arquivo já está associado ao veículo. Verifique novamente quando a conexão estiver estável; o arquivo foi mantido.",
        { cleanupPath: path },
      );
    }
    if (current?.storage_path === path) return "referenced" as const;

    const error = await removeObjects([path]);
    if (error) {
      throw new VehiclePhotoServiceError(
        `A limpeza ainda não foi concluída. Tente novamente quando a conexão estiver estável: ${error.message}`,
        { cleanupPath: path },
      );
    }

    if (current?.pending_cleanup_paths.includes(path)) {
      const { error: updateError } = await client
        .from("vehicle_photos")
        .update({
          pending_cleanup_paths: current.pending_cleanup_paths.filter((item) => item !== path),
        })
        .eq("id", current.id)
        .eq("storage_path", current.storage_path);
      if (updateError) {
        throw new VehiclePhotoServiceError(
          `O arquivo foi removido, mas não foi possível atualizar a fila de limpeza: ${updateError.message}. Tente novamente.`,
          { cleanupPath: path },
        );
      }
    }
    return "removed" as const;
  }

  async function replaceVehiclePhoto(vehicleId: number, file: File) {
    requireVehicleId(vehicleId);
    const current = await findCurrentPhoto(vehicleId);
    let optimized: Blob;
    try {
      optimized = await optimize(file);
    } catch (error) {
      throw new VehiclePhotoServiceError(errorText(error));
    }

    if (
      optimized.type !== "image/jpeg" ||
      optimized.size < 1 ||
      optimized.size > MAX_VEHICLE_PHOTO_BYTES
    ) {
      throw new VehiclePhotoServiceError("A foto otimizada precisa ser JPEG e ter no máximo 5 MB.");
    }

    const newPath = `vehicles/${vehicleId}/${createObjectId()}.jpg`;
    const { error: uploadError } = await storage.upload(newPath, optimized, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) {
      const cleanupError = await removeObjects([newPath]);
      throw new VehiclePhotoServiceError(
        `Não foi possível enviar a foto: ${uploadError.message}. ${cleanupError ? "O arquivo enviado ainda precisa ser limpo." : "A foto já salva foi mantida."}`,
        cleanupError ? { cleanupPath: newPath } : {},
      );
    }

    let signedUrl: string;
    try {
      const { data, error } = await storage.createSignedUrl(newPath, SIGNED_URL_SECONDS);
      if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? "URL indisponível");
      }
      signedUrl = data.signedUrl;
    } catch (error) {
      const cleanupError = await removeObjects([newPath]);
      throw new VehiclePhotoServiceError(
        `Não foi possível preparar a visualização da foto: ${errorText(error)}. ${cleanupError ? "O arquivo enviado ainda precisa ser limpo." : "A foto anterior foi mantida."}`,
        cleanupError ? { cleanupPath: newPath } : {},
      );
    }

    const pendingPaths = current
      ? [...new Set([...(current.pending_cleanup_paths ?? []), current.storage_path])]
      : [];
    let saved: VehiclePhotoRow | null = null;
    let writeError: unknown = null;
    try {
      const write = current
        ? await client
            .from("vehicle_photos")
            .update({
              storage_path: newPath,
              content_type: "image/jpeg",
              file_size_bytes: optimized.size,
              pending_cleanup_paths: pendingPaths,
            })
            .eq("id", current.id)
            .eq("storage_path", current.storage_path)
            .select(photoColumns)
            .maybeSingle()
        : await client
            .from("vehicle_photos")
            .insert({
              vehicle_id: vehicleId,
              storage_path: newPath,
              content_type: "image/jpeg",
              file_size_bytes: optimized.size,
            })
            .select(photoColumns)
            .maybeSingle();
      saved = (write.data as VehiclePhotoRow | null) ?? null;
      writeError = write.error;
    } catch (error) {
      writeError = error;
    }

    if (writeError || !saved) {
      let latest: VehiclePhotoRow | null;
      try {
        latest = await findCurrentPhoto(vehicleId);
      } catch {
        throw new VehiclePhotoServiceError(
          "Não foi possível confirmar se a foto foi salva. O arquivo foi mantido para evitar quebrar um registro; verifique novamente quando a conexão estiver estável.",
          { cleanupPath: newPath },
        );
      }
      if (latest?.storage_path === newPath) {
        saved = latest;
      } else {
        const cleanupError = await removeObjects([newPath]);
        const conflict =
          (writeError as { code?: string } | null)?.code === "23505" || (!writeError && !saved);
        throw new VehiclePhotoServiceError(
          `${conflict ? "Outra sessão alterou a foto deste veículo." : `Não foi possível salvar os dados da foto: ${errorText(writeError)}.`} ${cleanupError ? "O arquivo enviado ainda precisa ser limpo." : "A foto anterior foi mantida."} Atualize a tela e tente novamente.`,
          cleanupError ? { cleanupPath: newPath } : {},
        );
      }
    }

    let cleanupPaths = saved.pending_cleanup_paths ?? [];
    const cleanupError = await removeObjects(cleanupPaths);
    if (!cleanupError && cleanupPaths.length) {
      const { error } = await client
        .from("vehicle_photos")
        .update({ pending_cleanup_paths: [] })
        .eq("id", saved.id)
        .eq("storage_path", newPath);
      if (!error) cleanupPaths = [];
    }

    return { ...saved, signed_url: signedUrl, pending_cleanup_paths: cleanupPaths };
  }

  async function removeVehiclePhoto(vehicleId: number) {
    requireVehicleId(vehicleId);
    const current = await findCurrentPhoto(vehicleId);
    if (!current) return;

    const { data: previousFile, error: downloadError } = await storage.download(
      current.storage_path,
    );
    if (downloadError || !previousFile) {
      throw new VehiclePhotoServiceError(
        `Não foi possível preservar a foto antes da remoção: ${downloadError?.message ?? "arquivo indisponível"}. Nenhum dado foi alterado.`,
      );
    }

    const removalPaths = [
      ...new Set([current.storage_path, ...(current.pending_cleanup_paths ?? [])]),
    ];
    const removal = await removeObjects(removalPaths);
    if (removal) {
      const stillPresentPaths = (removal as Error & { stillPresentPaths?: string[] })
        .stillPresentPaths;
      const currentStillPresent = stillPresentPaths?.includes(current.storage_path) ?? false;
      const restoreError = currentStillPresent
        ? null
        : (
            await storage.upload(current.storage_path, previousFile, {
              contentType: current.content_type,
              cacheControl: "3600",
              upsert: true,
            })
          ).error;
      throw new VehiclePhotoServiceError(
        `Não foi possível remover a foto do armazenamento: ${removal.message}.${restoreError ? ` A restauração também falhou: ${restoreError.message}.` : currentStillPresent ? " A imagem atual continua disponível." : " A imagem atual foi restaurada."} Atualize a tela e tente novamente.`,
      );
    }

    const { data: deleted, error: deleteError } = await client
      .from("vehicle_photos")
      .delete()
      .eq("id", current.id)
      .eq("storage_path", current.storage_path)
      .select("id")
      .maybeSingle();

    if (deleteError || !deleted) {
      let latest: VehiclePhotoRow | null;
      try {
        latest = await findCurrentPhoto(vehicleId);
      } catch {
        latest = current;
      }
      if (!latest) return;
      if (latest.storage_path !== current.storage_path) {
        throw new VehiclePhotoServiceError(
          "A foto mudou em outra sessão. Atualize a tela para ver a versão atual.",
        );
      }
      const { error: restoreError } = await storage.upload(current.storage_path, previousFile, {
        contentType: current.content_type,
        cacheControl: "3600",
        upsert: true,
      });
      if (restoreError) {
        throw new VehiclePhotoServiceError(
          `Não foi possível concluir a remoção nem restaurar o arquivo. O registro ainda aponta para ${current.storage_path}; tente novamente ou peça ajuda ao administrador.`,
        );
      }
      throw new VehiclePhotoServiceError(
        `Não foi possível remover os dados da foto: ${deleteError?.message ?? "a foto mudou em outra sessão"}. A imagem anterior foi restaurada. Atualize a tela e tente novamente.`,
      );
    }
  }

  return {
    getVehiclePhoto,
    replaceVehiclePhoto,
    removeVehiclePhoto,
    retryCleanup,
  };
}
