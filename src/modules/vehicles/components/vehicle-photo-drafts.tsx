import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent } from "@/shared/components/ui/card";
import type {
  VehiclePhotoUpload,
  VehiclePhotoUploadProgress,
} from "../services/vehicle-photo-service";
import { MAX_VEHICLE_PHOTOS } from "../services/vehicle-photo-service";

export type VehiclePhotoDraft = {
  attempt: VehiclePhotoUpload;
  progress?: VehiclePhotoUploadProgress;
};

type Props = {
  photos: VehiclePhotoDraft[];
  editable: boolean;
  onSelect: (files: File[]) => void;
  onRemove: (id: string) => void;
};

export function VehiclePhotoDrafts({ photos, editable, onSelect, onRemove }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display font-semibold">
              Fotos do veículo <span className="font-normal text-muted-foreground">(opcional)</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              {photos.length}/{MAX_VEHICLE_PHOTOS} fotos · JPEG, PNG ou WebP
            </p>
          </div>
          {editable && (
            <>
              <input
                ref={inputRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                aria-label="Selecionar fotos para a avaliação"
                onChange={(event) => {
                  onSelect(Array.from(event.currentTarget.files ?? []));
                  event.currentTarget.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={photos.length >= MAX_VEHICLE_PHOTOS}
                onClick={() => inputRef.current?.click()}
              >
                <ImagePlus /> Selecionar fotos
              </Button>
            </>
          )}
        </div>
        {editable && (
          <p className="text-sm text-muted-foreground">
            As fotos serão enviadas ao salvar a avaliação. Depois, você poderá escolher a foto
            principal e gerenciar a galeria no veículo.
          </p>
        )}
        {photos.length > 0 && (
          <ul
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Fotos da avaliação"
          >
            {photos.map(({ attempt, progress }) => (
              <li key={attempt.id} className="min-w-0 overflow-hidden rounded-lg border">
                <DraftThumbnail file={attempt.file} />
                <div className="space-y-2 p-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm" title={attempt.file.name}>
                      {attempt.file.name}
                    </span>
                    {editable && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remover ${attempt.file.name} da seleção`}
                        onClick={() => onRemove(attempt.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="text-sm" role="status">
                    {progress?.status === "saved" ? (
                      <span className="flex items-center gap-1 text-success">
                        <Check className="h-4 w-4" /> Foto salva
                      </span>
                    ) : progress?.status === "uploading" ? (
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <LoaderCircle className="h-4 w-4 animate-spin" /> Enviando...
                      </span>
                    ) : progress?.status === "failed" ? (
                      <span className="text-destructive">{progress.error}</span>
                    ) : (
                      <span className="text-muted-foreground">Aguardando envio</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DraftThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return (
    <div className="aspect-video bg-muted/40">
      {url && <img src={url} alt="" className="h-full w-full object-contain" />}
    </div>
  );
}
