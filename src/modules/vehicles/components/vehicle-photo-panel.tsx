import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImagePlus, LoaderCircle, RotateCcw, Star, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { supabase } from "@/shared/supabase/client";
import {
  createVehiclePhotoService,
  MAX_VEHICLE_PHOTOS,
  type VehiclePhoto,
  type VehiclePhotoUpload,
  type VehiclePhotoUploadProgress,
} from "../services/vehicle-photo-service";

const photoService = createVehiclePhotoService(supabase);
type UploadJob = {
  attempt: VehiclePhotoUpload;
  status: "queued" | "uploading" | "saved" | "failed";
  error?: string;
};

type VehiclePhotoPanelProps = { vehicleId: number; alt: string; canManage: boolean };

export function VehiclePhotoPanel({ vehicleId, alt, canManage }: VehiclePhotoPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const replacementRef = useRef<HTMLInputElement>(null);
  const recoveryRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const queryKey = ["vehicle-photos", "gallery", vehicleId] as const;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<VehiclePhoto | null>(null);
  const [replacementTarget, setReplacementTarget] = useState<VehiclePhoto | null>(null);
  const [jobs, setJobs] = useState<UploadJob[]>([]);
  const [cleanupPaths, setCleanupPaths] = useState<string[]>([]);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const galleryQuery = useQuery({
    queryKey,
    queryFn: () => photoService.listVehiclePhotos(vehicleId),
  });
  const photos = galleryQuery.data ?? [];
  const activePhoto =
    photos.find((photo) => photo.id === selectedId) ??
    photos.find((photo) => photo.is_preview) ??
    photos[0];
  const legacyQuery = useQuery({
    queryKey: ["vehicle-photos", "legacy", vehicleId],
    queryFn: () => photoService.getLegacyPhotoImport(vehicleId),
  });
  const legacy = legacyQuery.data;
  const remaining = Math.max(0, MAX_VEHICLE_PHOTOS - photos.length);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["vehicle-photos"] });

  const previewMutation = useMutation({
    mutationFn: (photo: VehiclePhoto) => photoService.setVehiclePhotoPreview(vehicleId, photo.id),
    onSuccess: () => toast.success("Foto principal definida."),
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Não foi possível escolher a foto principal.",
      ),
    onSettled: refresh,
  });

  const importMutation = useMutation({
    mutationFn: (file?: File) => photoService.importLegacyPhoto(vehicleId, file),
    onSuccess: () => toast.success("Imagem antiga importada para a galeria."),
    onError: (error) => {
      if (
        error &&
        typeof error === "object" &&
        "cleanupPath" in error &&
        typeof error.cleanupPath === "string"
      ) {
        const path = error.cleanupPath;
        setCleanupPaths((current) => [...new Set([...current, path])]);
      }
      toast.error(
        error instanceof Error
          ? error.message
          : "A referência antiga foi preservada para recuperação.",
      );
    },
    onSettled: refresh,
  });

  function uploadProgress(progress: VehiclePhotoUploadProgress) {
    setJobs((current) =>
      current.map((job) =>
        job.attempt.id !== progress.id
          ? job
          : {
              ...job,
              status: progress.status,
              error: progress.status === "failed" ? progress.error : undefined,
            },
      ),
    );
    if (progress.status === "failed" && progress.cleanupPath) {
      const path = progress.cleanupPath;
      setCleanupPaths((current) => [...new Set([...current, path])]);
    }
    if (progress.status === "saved") setSelectedId(progress.photo.id);
  }

  const uploadMutation = useMutation({
    mutationFn: (attempts: VehiclePhotoUpload[]) =>
      photoService.uploadVehiclePhotos(vehicleId, attempts, uploadProgress),
    onSuccess: (results) => {
      const saved = results.filter((result) => result.status === "saved").length;
      if (saved) toast.success(`${saved} ${saved === 1 ? "foto salva" : "fotos salvas"}.`);
      if (saved < results.length)
        toast.error("Algumas fotos não foram salvas. Confira o resultado de cada arquivo.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar as fotos."),
    onSettled: refresh,
  });

  const removeMutation = useMutation({
    mutationFn: (photo: VehiclePhoto) => photoService.removeVehiclePhoto(vehicleId, photo.id),
    onSuccess: () => {
      setConfirmRemove(null);
      toast.success("Foto removida.");
    },
    onError: (error) => {
      setConfirmRemove(null);
      toast.error(error instanceof Error ? error.message : "A remoção está pendente.");
    },
    onSettled: refresh,
  });

  const cleanupMutation = useMutation({
    mutationFn: (path: string) => photoService.retryCleanup(path),
    onSuccess: async (result, path) => {
      setCleanupPaths((current) => current.filter((item) => item !== path));
      await refresh();
      toast.success(
        result === "referenced" ? "A foto já está salva na galeria." : "Arquivo pendente removido.",
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "A verificação está pendente."),
  });

  const isBusy =
    uploadMutation.isPending ||
    removeMutation.isPending ||
    cleanupMutation.isPending ||
    previewMutation.isPending ||
    importMutation.isPending;
  const pendingPaths = [
    ...new Set([...cleanupPaths, ...photos.flatMap((photo) => photo.pending_cleanup_paths)]),
  ];

  function selectFiles(files: FileList | null, replacing?: VehiclePhoto | null) {
    if (!files?.length) return;
    const selected = Array.from(files);
    if (!replacing && selected.length > remaining) {
      toast.error(
        `A galeria tem ${remaining} ${remaining === 1 ? "vaga" : "vagas"}. Selecione no máximo essa quantidade.`,
      );
      return;
    }
    const attempts = selected.map(
      (file): VehiclePhotoUpload => ({
        id: crypto.randomUUID(),
        file,
        replaces: replacing
          ? { photoId: replacing.id, storagePath: replacing.storage_path }
          : undefined,
      }),
    );
    setJobs((current) => [
      ...current.filter((job) => job.status === "failed"),
      ...attempts.map((attempt): UploadJob => ({ attempt, status: "queued" })),
    ]);
    uploadMutation.mutate(attempts);
  }

  return (
    <Card className="lg:col-span-2 overflow-hidden">
      <div className="relative aspect-[16/9] bg-muted/40">
        {activePhoto?.signed_url && activePhoto.signed_url !== failedUrl ? (
          <img
            className="h-full w-full object-contain"
            src={activePhoto.signed_url}
            alt={alt}
            onError={() => setFailedUrl(activePhoto.signed_url)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            {galleryQuery.isLoading ? (
              <LoaderCircle className="h-8 w-8 animate-spin" />
            ) : (
              <ImagePlus className="h-16 w-16" aria-hidden="true" />
            )}
            <span className="text-sm">
              {galleryQuery.isLoading
                ? "Carregando fotos..."
                : activePhoto
                  ? "Visualização indisponível"
                  : "Nenhuma foto cadastrada"}
            </span>
            {(activePhoto || galleryQuery.isError) && (
              <Button variant="outline" size="sm" onClick={() => void galleryQuery.refetch()}>
                Recarregar fotos
              </Button>
            )}
          </div>
        )}
        {activePhoto?.deletion_pending && (
          <div className="absolute inset-x-0 bottom-0 bg-background/90 px-4 py-2 text-sm">
            Remoção pendente. Tente novamente para liberar esta vaga.
          </div>
        )}
      </div>

      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-medium">
              Fotos do veículo{" "}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {photos.length}/{MAX_VEHICLE_PHOTOS}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {galleryQuery.isError
                ? "Não foi possível carregar a galeria. Tente novamente."
                : `${remaining} ${remaining === 1 ? "vaga disponível" : "vagas disponíveis"} · JPEG, PNG ou WebP`}
            </div>
          </div>
          {canManage && (
            <>
              <input
                ref={inputRef}
                type="file"
                className="hidden"
                multiple
                accept="image/jpeg,image/png,image/webp"
                aria-label="Adicionar fotos do veículo"
                disabled={isBusy}
                onChange={(event) => {
                  selectFiles(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              <input
                ref={replacementRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Substituir foto selecionada"
                disabled={isBusy}
                onChange={(event) => {
                  selectFiles(event.currentTarget.files, replacementTarget);
                  event.currentTarget.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy || !remaining || galleryQuery.isLoading || galleryQuery.isError}
                onClick={() => inputRef.current?.click()}
              >
                <ImagePlus /> Adicionar fotos
              </Button>
            </>
          )}
        </div>

        {photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="Fotos da galeria">
            {photos.map((photo, index) => (
              <button
                type="button"
                key={photo.id}
                aria-label={`Ver foto ${index + 1}${photo.deletion_pending ? ", remoção pendente" : ""}`}
                aria-pressed={photo.id === activePhoto?.id}
                onClick={() => setSelectedId(photo.id)}
                className={`relative h-20 w-28 shrink-0 overflow-hidden rounded-md border-2 bg-muted ${photo.id === activePhoto?.id ? "border-primary" : "border-transparent"}`}
              >
                {photo.signed_url ? (
                  <img src={photo.signed_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImagePlus className="mx-auto h-6 w-6 text-muted-foreground" />
                )}
                {photo.deletion_pending && (
                  <span className="absolute inset-x-0 bottom-0 bg-background/90 text-xs">
                    Removendo
                  </span>
                )}
                {photo.is_preview && (
                  <span
                    className="absolute top-1 right-1 rounded bg-background/90 p-1"
                    title="Foto principal"
                  >
                    <Star className="h-3 w-3 fill-current text-warning" />
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {canManage && activePhoto && (
          <div className="flex flex-wrap justify-end gap-2">
            {!activePhoto.deletion_pending && (
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy || activePhoto.is_preview}
                onClick={() => previewMutation.mutate(activePhoto)}
              >
                <Star className={activePhoto.is_preview ? "fill-current" : ""} />
                {activePhoto.is_preview ? "Foto principal" : "Definir como principal"}
              </Button>
            )}
            {!activePhoto.deletion_pending && (
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => {
                  setReplacementTarget(activePhoto);
                  replacementRef.current?.click();
                }}
              >
                <Upload /> Substituir selecionada
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              disabled={isBusy}
              onClick={() =>
                activePhoto.deletion_pending
                  ? removeMutation.mutate(activePhoto)
                  : setConfirmRemove(activePhoto)
              }
            >
              {activePhoto.deletion_pending ? <RotateCcw /> : <Trash2 />}
              {activePhoto.deletion_pending ? "Tentar remoção" : "Remover selecionada"}
            </Button>
          </div>
        )}

        {canManage && legacy && legacy.status !== "imported" && (
          <div className="space-y-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
            <div className="font-medium">Imagem antiga aguardando importação</div>
            <p className="text-muted-foreground">
              {legacy.last_error ??
                "A referência antiga foi preservada. Importe a imagem para incluí-la na galeria privada."}
            </p>
            {legacy.source_kind === "url" && (
              <a
                href={legacy.original_value.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                Abrir imagem antiga para recuperação
              </a>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => importMutation.mutate(undefined)}
              >
                <RotateCcw />
                {importMutation.isPending ? "Importando..." : "Importar imagem antiga"}
              </Button>
              <input
                ref={recoveryRef}
                type="file"
                className="hidden"
                accept="image/jpeg,image/png,image/webp"
                aria-label="Recuperar imagem antiga com arquivo"
                disabled={isBusy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  if (file) importMutation.mutate(file);
                  event.currentTarget.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => recoveryRef.current?.click()}
              >
                <Upload /> Selecionar arquivo para recuperação
              </Button>
            </div>
          </div>
        )}
        {canManage && legacyQuery.isError && (
          <Button variant="outline" size="sm" onClick={() => void legacyQuery.refetch()}>
            Tentar consultar imagens antigas novamente
          </Button>
        )}

        {canManage && jobs.length > 0 && (
          <div className="space-y-2 rounded-md border p-3" aria-live="polite">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Resultado dos envios</span>
              <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => setJobs([])}>
                Limpar resultados
              </Button>
            </div>
            {jobs.map((job) => (
              <div
                key={job.attempt.id}
                className="flex items-start justify-between gap-3 border-t py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{job.attempt.file.name}</div>
                  <div
                    className={
                      job.status === "failed" ? "text-destructive" : "text-muted-foreground"
                    }
                  >
                    {job.status === "queued"
                      ? "Aguardando"
                      : job.status === "uploading"
                        ? "Otimizando e enviando..."
                        : job.status === "saved"
                          ? "Salva"
                          : job.error}
                  </div>
                </div>
                {job.status === "saved" ? (
                  <Check className="h-4 w-4 shrink-0 text-success" />
                ) : job.status === "uploading" ? (
                  <LoaderCircle className="h-4 w-4 shrink-0 animate-spin" />
                ) : job.status === "failed" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => uploadMutation.mutate([job.attempt])}
                  >
                    <RotateCcw /> Tentar novamente
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {canManage && pendingPaths.length > 0 && (
          <div className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
            <p>Há arquivos de tentativas anteriores aguardando verificação.</p>
            {pendingPaths.map((path, index) => (
              <Button
                key={path}
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => cleanupMutation.mutate(path)}
              >
                <RotateCcw /> Verificar arquivo pendente {index + 1}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
      <ConfirmActionDialog
        open={!!confirmRemove}
        onOpenChange={(open) => {
          if (!open) setConfirmRemove(null);
        }}
        title="Remover foto do veículo?"
        description="A foto será removida da galeria. Esta ação não pode ser desfeita."
        confirmLabel={removeMutation.isPending ? "Removendo..." : "Remover foto"}
        confirmDisabled={removeMutation.isPending}
        onConfirm={() => {
          if (confirmRemove) removeMutation.mutate(confirmRemove);
        }}
      />
    </Card>
  );
}
