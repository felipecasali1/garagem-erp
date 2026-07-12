import type { FuelType, Transmission, VehicleStatus } from "../../shared/types/domain.js";
import type { ChecklistCategory, ChecklistPriority } from "../checklist/types.js";

export type VehicleChecklistDraft = {
  id: string;
  title: string;
  category: ChecklistCategory;
  priority: ChecklistPriority;
  estimated_cost: number;
  due_date?: string;
};

export type VehicleDraft = {
  plate: string;
  chassis: string;
  vin: string;
  brand: string;
  model: string;
  version: string;
  color: string;
  fuel_type: FuelType;
  transmission: Transmission;
  current_mileage: number;
  manufacture_year: number;
  model_year: number;
  cost_price: number;
  sale_price: number;
  published: boolean;
  status: VehicleStatus;
  notes: string;
  accessories: string[];
  checklist: VehicleChecklistDraft[];
};
