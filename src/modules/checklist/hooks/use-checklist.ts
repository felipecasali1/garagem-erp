import { useSyncExternalStore } from "react";
import { checklistStore } from "@/modules/checklist/services/checklist-store";

export function useChecklist(vehicleId?: number) {
  const subscribe = (fn: () => void) => {
    const unsubscribe = checklistStore.subscribe(fn);
    return () => {
      unsubscribe();
    };
  };

  const all = useSyncExternalStore(
    subscribe,
    () => checklistStore.getAll(),
    () => checklistStore.getAll(),
  );

  return vehicleId == null ? all : all.filter((item) => item.vehicle_id === vehicleId);
}
