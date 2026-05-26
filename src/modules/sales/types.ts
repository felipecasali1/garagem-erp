import type {
  PaymentMethod,
  PaymentStatus,
} from "@/shared/types/domain";

export type SaleDraft = {
  vehicle_id: number | null;
  customer_id: number | null;
  employee_id: number | null;
  discount: number;
  notes: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  down_payment: number;
  installments_count: number;
  payment_date?: string;
};
