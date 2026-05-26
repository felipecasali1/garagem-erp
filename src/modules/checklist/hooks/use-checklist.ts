import { useQuery } from "@tanstack/react-query";
import { checklistKeys, listChecklist } from "@/modules/checklist/services/checklist";

export function useChecklist(vehicleId?: number) {
  const { data = [] } = useQuery({
    queryKey: vehicleId == null ? checklistKeys.all : checklistKeys.byVehicle(vehicleId),
    queryFn: () => listChecklist(vehicleId),
  });

  return data;
}
