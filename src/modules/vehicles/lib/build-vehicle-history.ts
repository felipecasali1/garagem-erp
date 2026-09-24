import type { Purchase, Sale } from "../../../shared/types/domain.js";

export type VehicleHistoryEntry = {
  kind: "purchase" | "sale";
  id: number;
  date: string;
  status: Purchase["status"] | Sale["status"];
  amount: number;
};

export function buildVehicleHistory(
  vehicleId: number,
  purchases: readonly Purchase[],
  sales: readonly Sale[],
): VehicleHistoryEntry[] {
  return [
    ...purchases
      .filter((purchase) => purchase.vehicle.id === vehicleId)
      .map((purchase) => ({
        kind: "purchase" as const,
        id: purchase.id,
        date: purchase.purchase_date,
        status: purchase.status,
        amount: purchase.total_value,
      })),
    ...sales
      .filter((sale) => sale.vehicle.id === vehicleId)
      .map((sale) => ({
        kind: "sale" as const,
        id: sale.id,
        date: sale.sale_date,
        status: sale.status,
        amount: sale.total_value,
      })),
  ].sort((left, right) => {
    const dateOrder = right.date.localeCompare(left.date);
    return dateOrder !== 0 ? dateOrder : right.id - left.id;
  });
}
