import type { VehicleStatus } from "@/shared/types/domain";

const labels: Record<VehicleStatus, string> = {
  evaluating: "Em avaliação",
  in_repair: "Em preparação",
  available: "Disponível",
  reserved: "Reservado",
  sold: "Vendido",
  archived: "Arquivado",
};

export function vehicleStatusLabel(status: VehicleStatus) {
  return labels[status];
}
