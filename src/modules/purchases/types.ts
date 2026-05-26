import type { Person, PurchaseStatus } from "@/shared/types/domain";

export type SupplierOption = Pick<
  Person,
  "id" | "name" | "cpf" | "cnpj" | "phone" | "email" | "type" | "primary_address"
>;

export type PurchaseVehicleDraft = {
  plate: string;
  model_label: string;
  model_year: number | null;
  current_mileage: number | null;
};

export type PurchaseDraft = {
  supplier_id: number | null;
  vehicle: PurchaseVehicleDraft;
  total_value: number;
  purchase_date?: string;
  status: PurchaseStatus;
  notes: string;
};
