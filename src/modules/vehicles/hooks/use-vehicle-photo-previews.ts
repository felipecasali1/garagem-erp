import { useQuery } from "@tanstack/react-query";
import { canAccessPath } from "@/shared/auth/access-control";
import { useAuth } from "@/shared/supabase/auth";
import { supabase } from "@/shared/supabase/client";
import { createVehiclePhotoService } from "../services/vehicle-photo-service";

const photoService = createVehiclePhotoService(supabase);

export function useVehiclePhotoPreviews(vehicleIds: number[]) {
  const { accessRole } = useAuth();
  const ids = [...new Set(vehicleIds)].sort((a, b) => a - b);
  return useQuery({
    queryKey: ["vehicle-photos", "previews", accessRole, ids],
    queryFn: () => photoService.listVehiclePhotoPreviews(ids),
    enabled: ids.length > 0 && canAccessPath(accessRole, "/vehicles"),
    staleTime: 60_000,
  });
}
