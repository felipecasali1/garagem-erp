import type { Address, PersonType } from "@/shared/types/domain";

export type SupplierType = "individual" | "company" | "dealership" | "auction" | "trade_in";

export type SupplierDraft = {
  type: PersonType;
  name: string;
  document: string;
  phone: string;
  email: string;
  notes: string;
  supplier_type: SupplierType;
  primary_address: Address;
};
