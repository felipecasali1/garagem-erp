import type { ChecklistItem } from "../checklist/types.js";
import type { FinancialTransaction } from "../../shared/types/domain.js";
import type { AccessRole } from "../../shared/auth/access-control.js";

export type OperationalAlertKind = "financial" | "checklist" | "sale" | "preparation";
export type OperationalAlertSeverity = "critical" | "attention";

export type OperationalAlertInput = {
  financialTransactions: readonly Pick<FinancialTransaction, "id" | "status" | "due_date">[];
  sales: readonly { id: number; status: "pending" | "completed" | "canceled" }[];
  vehicles: readonly {
    id: number;
    status: "evaluating" | "available" | "reserved" | "sold" | "in_repair" | "archived";
  }[];
  checklist: readonly Pick<
    ChecklistItem,
    "id" | "vehicle_id" | "status" | "priority" | "due_date"
  >[];
  today: string;
  accessRole: AccessRole | null;
};

export type OperationalAlert = {
  kind: OperationalAlertKind;
  severity: OperationalAlertSeverity;
  label: string;
  count: number;
  recordIds: Array<number | string>;
  href: string;
};
