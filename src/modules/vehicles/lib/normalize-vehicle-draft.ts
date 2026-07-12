import { normalizePlate, normalizeUpper } from "../../../shared/lib/field-format.js";
import type { VehicleDraft } from "../types.js";

export function normalizeVehicleDraft(draft: VehicleDraft) {
  return {
    plate: normalizePlate(draft.plate),
    chassis: normalizeUpper(draft.chassis).replace(/\s+/g, "") || null,
    vin: normalizeUpper(draft.vin).replace(/\s+/g, "") || null,
    brand: draft.brand.trim(),
    model: draft.model.trim(),
    version: draft.version.trim() || null,
    color: draft.color.trim(),
    fuel_type: draft.fuel_type,
    transmission: draft.transmission,
    current_mileage: draft.current_mileage,
    manufacture_year: draft.manufacture_year,
    model_year: draft.model_year,
    cost_price: draft.cost_price,
    sale_price: draft.sale_price,
    status: draft.status,
    published: draft.published,
    notes: draft.notes.trim() || null,
  };
}
