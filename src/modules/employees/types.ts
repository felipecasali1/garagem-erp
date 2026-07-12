import type { Address, CommissionType } from "@/shared/types/domain";

export type EmployeeAccessRole = "admin" | "manager" | "seller" | "financial";

export type EmployeeDraft = {
  name: string;
  cpf: string;
  phone: string;
  email: string;
  primary_address: Address;
  position: string;
  hired_at?: string;
  salary: number;
  commission_type: CommissionType;
  commission_rate: number;
  active: boolean;
};
