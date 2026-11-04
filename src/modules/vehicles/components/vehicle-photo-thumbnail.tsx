import { Car } from "lucide-react";
import { useState } from "react";
import type { VehiclePhoto } from "../services/vehicle-photo-service";

type VehiclePhotoThumbnailProps = {
  preview?: VehiclePhoto;
  alt: string;
  className?: string;
};

export function VehiclePhotoThumbnail({
  preview,
  alt,
  className = "",
}: VehiclePhotoThumbnailProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const src = preview?.signed_url;
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden bg-muted ${className}`}
    >
      {src && src !== failedUrl ? (
        <img
          src={src}
          alt={alt}
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(src)}
        />
      ) : (
        <Car className="h-1/2 max-h-16 w-1/2 max-w-16 text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}
