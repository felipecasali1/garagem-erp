import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, LoaderCircle, RotateCcw, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import { supabase } from "@/shared/supabase/client";
import {
  createVehiclePhotoService,
  VehiclePhotoServiceError,
} from "../services/vehicle-photo-service";

const vehiclePhotoService = createVehiclePhotoService(supabase);

const vehiclePhotoKeys = {
  current: (vehicleId: number) => ["vehicle-photos", vehicleId] as const,
};

type VehiclePhotoPanelProps = {
  vehicleId: number;
  alt: string;
  canManage: boolean;
};

export function VehiclePhotoPanel({ vehicleId, alt, canManage }: VehiclePhotoPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [orphanedPath, setOrphanedPath] = useState<string | null>(null);
  const photoQuery = useQuery({
    queryKey: vehiclePhotoKeys.current(vehicleId),
    queryFn: () => vehiclePhotoService.getVehiclePhoto(vehicleId),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => vehiclePhotoService.replaceVehiclePhoto(vehicleId, file),
    onSuccess: async (photo) => {
      setOrphanedPath(photo.pending_cleanup_paths[0] ?? null);
      await queryClient.invalidateQueries({ queryKey: vehiclePhotoKeys.current(vehicleId) });
      toast.success("Foto do veículo salva.");
    },
    onError: (error) => {
      if (error instanceof VehiclePhotoServiceError && error.cleanupPath) {
        setOrphanedPath(error.cleanupPath);
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a foto.");
    },
  });

  const removeMutation = useMutation({
    mutationFn: () => vehiclePhotoService.removeVehiclePhoto(vehicleId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: vehiclePhotoKeys.current(vehicleId) });
      setConfirmRemove(false);
      toast.success("Foto removida.");
    },
    onError: (error) => {
      if (error instanceof VehiclePhotoServiceError && error.cleanupPath) {
        setOrphanedPath(error.cleanupPath);
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível remover a foto.");
    },
  });

  const retryCleanupMutation = useMutation({
    mutationFn: (path: string) => vehiclePhotoService.retryCleanup(path),
    onSuccess: async (result) => {
      setOrphanedPath(null);
      await queryClient.invalidateQueries({ queryKey: vehiclePhotoKeys.current(vehicleId) });
      toast.success(
        result === "referenced"
          ? "A foto já está salva no veículo."
          : "Limpeza do arquivo concluída.",
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "A limpeza ainda não foi concluída.");
    },
  });

  function selectPhoto(file: File | undefined) {
    if (file) uploadMutation.mutate(file);
    if (inputRef.current) inputRef.current.value = "";
  }

  const photo = photoQuery.data;
  const isBusy = uploadMutation.isPending || removeMutation.isPending;

  return (
    <Card className="lg:col-span-2 overflow-hidden">
      <div className="relative aspect-[16/9] bg-gradient-to-br from-muted to-muted/40">
        {photo?.signed_url ? (
          <img
            className="h-full w-full object-cover"
            src={photo.signed_url}
            alt={alt}
            onError={() =>
              void queryClient.invalidateQueries({ queryKey: vehiclePhotoKeys.current(vehicleId) })
            }
          />
        ) : photoQuery.isLoading ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            Carregando foto...
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
            <ImagePlus className="h-16 w-16" aria-hidden="true" />
            <span className="text-sm">Nenhuma foto privada cadastrada</span>
          </div>
        )}
      </div>

      <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0 text-sm">
          <div className="font-medium">Foto do veículo</div>
          <div className="text-muted-foreground">
            {photoQuery.isError
              ? "Não foi possível carregar a foto. Atualize para tentar novamente."
              : "Imagem privada, visível para usuários autenticados."}
          </div>
        </div>

        {canManage && (
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              className="hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Escolher foto do veículo"
              disabled={isBusy}
              onChange={(event) => selectPhoto(event.currentTarget.files?.[0])}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => inputRef.current?.click()}
            >
              {isBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : photo ? (
                <Upload />
              ) : (
                <ImagePlus />
              )}
              {uploadMutation.isPending
                ? "Otimizando e enviando..."
                : photo
                  ? "Substituir foto"
                  : "Adicionar foto"}
            </Button>
            {photo && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isBusy}
                onClick={() => setConfirmRemove(true)}
              >
                <Trash2 /> Remover
              </Button>
            )}
          </div>
        )}

        {canManage && (orphanedPath || photo?.pending_cleanup_paths.length) ? (
          <div className="flex w-full items-center justify-between gap-3 rounded-md border border-warning/30 bg-warning/5 px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              Uma cópia antiga ainda precisa ser limpa do armazenamento.
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={retryCleanupMutation.isPending}
              onClick={() =>
                retryCleanupMutation.mutate(orphanedPath ?? photo?.pending_cleanup_paths[0] ?? "")
              }
            >
              {retryCleanupMutation.isPending ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RotateCcw />
              )}
              Tentar limpeza novamente
            </Button>
          </div>
        ) : null}
      </CardContent>

      <ConfirmActionDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title="Remover foto do veículo?"
        description="A imagem será removida do armazenamento privado. Esta ação não pode ser desfeita."
        confirmLabel={removeMutation.isPending ? "Removendo..." : "Remover foto"}
        confirmDisabled={removeMutation.isPending}
        onConfirm={() => removeMutation.mutate()}
      />
    </Card>
  );
}
