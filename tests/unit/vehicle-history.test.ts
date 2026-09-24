import test from "node:test";
import assert from "node:assert/strict";
import { buildVehicleHistory } from "../../src/modules/vehicles/lib/build-vehicle-history.js";
import type { Purchase, Sale } from "../../src/shared/types/domain.js";

test("buildVehicleHistory filtra o veiculo e ordena compras e vendas da mais recente", () => {
  const purchases = [
    {
      id: 1,
      vehicle: { id: 7 },
      purchase_date: "2026-01-10",
      status: "completed",
      total_value: 80000,
    },
    {
      id: 2,
      vehicle: { id: 9 },
      purchase_date: "2026-04-10",
      status: "completed",
      total_value: 90000,
    },
  ] as unknown as Purchase[];
  const sales = [
    { id: 3, vehicle: { id: 7 }, sale_date: "2026-04-12", status: "canceled", total_value: 105000 },
    {
      id: 4,
      vehicle: { id: 7 },
      sale_date: "2026-02-10",
      status: "completed",
      total_value: 110000,
    },
  ] as unknown as Sale[];

  assert.deepEqual(buildVehicleHistory(7, purchases, sales), [
    { kind: "sale", id: 3, date: "2026-04-12", status: "canceled", amount: 105000 },
    { kind: "sale", id: 4, date: "2026-02-10", status: "completed", amount: 110000 },
    { kind: "purchase", id: 1, date: "2026-01-10", status: "completed", amount: 80000 },
  ]);
});
