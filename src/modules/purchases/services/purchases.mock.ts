import { vehicles } from "@/modules/vehicles/services/vehicles.mock";
import { mockPerson } from "@/shared/lib/mock-person";
import type { Purchase } from "@/shared/types/domain";

export const purchases: Purchase[] = [
  { id: 501, supplier: mockPerson(50, "Auto Center Diamante"), vehicle: vehicles[0], total_value: 92000, purchase_date: "2025-02-12", status: "completed" },
  { id: 502, supplier: mockPerson(51, "Garagem do Zé"), vehicle: vehicles[1], total_value: 130000, purchase_date: "2025-03-05", status: "completed" },
  { id: 503, supplier: mockPerson(52, "Multimarcas Vega", { type: "company", cnpj: "98.765.432/0001-10" }), vehicle: vehicles[7], total_value: 135000, purchase_date: "2025-04-19", status: "pending" },
];
