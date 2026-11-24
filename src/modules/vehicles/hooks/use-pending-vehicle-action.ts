import { useQuery } from "@tanstack/react-query";
import { getPendingVehicleAction } from "@/modules/vehicles/services/vehicles";
import { useAuth } from "@/shared/supabase/auth";

export function usePendingVehicleAction(vehicleId: number) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ["pending-vehicle-action", session?.user.id, vehicleId],
    queryFn: () => getPendingVehicleAction(vehicleId),
    enabled: Number.isFinite(vehicleId) && Boolean(session?.user.id),
    retry: false,
  });
}
