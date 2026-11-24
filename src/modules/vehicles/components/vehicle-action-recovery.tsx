import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import {
  runVehicleAction,
  vehicleKeys,
  type VehicleActionAttempt,
} from "@/modules/vehicles/services/vehicles";

export function VehicleActionRecovery({ attempt }: { attempt: VehicleActionAttempt }) {
  const client = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => runVehicleAction(attempt),
    onSuccess: async ({ value }) => {
      client.setQueryData(vehicleKeys.detail(value.id), value);
      await client.invalidateQueries({ queryKey: vehicleKeys.all });
      await client.invalidateQueries({ queryKey: ["pending-vehicle-action"] });
      toast.success("Tentativa anterior recuperada");
    },
    onError: async (error) => {
      await client.invalidateQueries({ queryKey: ["pending-vehicle-action"] });
      toast.error(
        error instanceof Error ? error.message : "Não foi possível recuperar a tentativa.",
      );
    },
  });
  const label =
    attempt.action === "archive"
      ? "arquivamento"
      : attempt.published
        ? "publicação"
        : "despublicação";
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 text-sm">
      <span>Tentativa de {label} sem confirmação.</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={mutation.isPending}
        onClick={(event) => {
          event.stopPropagation();
          mutation.mutate();
        }}
      >
        Recuperar tentativa anterior
      </Button>
    </div>
  );
}
