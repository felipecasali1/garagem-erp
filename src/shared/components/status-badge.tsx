import { Badge } from "@/shared/components/ui/badge";
import { cn } from "@/shared/lib/utils";
import type {
  CommissionStatus,
  PurchaseStatus,
  SaleStatus,
  TransactionStatus,
  VehicleStatus,
} from "@/shared/types/domain";

const vehicleMap: Record<VehicleStatus, { label: string; cls: string }> = {
  available: { label: "Disponível", cls: "bg-success/15 text-success border-success/30" },
  reserved: { label: "Reservado", cls: "bg-warning/15 text-warning border-warning/30" },
  sold: { label: "Vendido", cls: "bg-info/15 text-info border-info/30" },
  in_repair: { label: "Em reparo", cls: "bg-orange-500/15 text-orange-500 border-orange-500/30" },
};

const saleMap: Record<SaleStatus, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-warning/15 text-warning border-warning/30" },
  completed: { label: "Concluída", cls: "bg-success/15 text-success border-success/30" },
  canceled: { label: "Cancelada", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

const txMap: Record<TransactionStatus, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-warning/15 text-warning border-warning/30" },
  paid: { label: "Pago", cls: "bg-success/15 text-success border-success/30" },
  overdue: { label: "Vencido", cls: "bg-destructive/15 text-destructive border-destructive/30" },
  canceled: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
};

const purchaseMap: Record<PurchaseStatus, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-warning/15 text-warning border-warning/30" },
  completed: { label: "Concluída", cls: "bg-success/15 text-success border-success/30" },
  canceled: { label: "Cancelada", cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

const commissionMap: Record<CommissionStatus, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-warning/15 text-warning border-warning/30" },
  paid: { label: "Pago", cls: "bg-success/15 text-success border-success/30" },
};

export function StatusBadge({
  kind,
  value,
}: {
  kind: "vehicle" | "sale" | "transaction" | "purchase" | "commission";
  value: string;
}) {
  const map =
    kind === "vehicle"
      ? vehicleMap
      : kind === "sale"
        ? saleMap
        : kind === "transaction"
          ? txMap
          : kind === "purchase"
            ? purchaseMap
            : commissionMap;
  const entry = (map as Record<string, { label: string; cls: string }>)[value] ?? {
    label: value,
    cls: "bg-muted text-muted-foreground",
  };
  return (
    <Badge variant="outline" className={cn("font-medium border", entry.cls)}>
      {entry.label}
    </Badge>
  );
}
