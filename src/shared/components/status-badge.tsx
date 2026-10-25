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
  evaluating: { label: "Em avaliação", cls: "bg-chart-5/15 text-chart-5" },
  in_repair: { label: "Em preparação", cls: "bg-chart-3/15 text-chart-3" },
  available: { label: "Disponível", cls: "bg-chart-1/15 text-chart-1" },
  reserved: { label: "Reservado", cls: "bg-chart-4/15 text-chart-4" },
  sold: { label: "Vendido", cls: "bg-chart-2/15 text-chart-2" },
  archived: { label: "Arquivado", cls: "bg-muted text-muted-foreground" },
};

const saleMap: Record<SaleStatus, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-warning/15 text-warning" },
  completed: { label: "Concluída", cls: "bg-success/15 text-success" },
  canceled: { label: "Cancelada", cls: "bg-destructive/15 text-destructive" },
};

const txMap: Record<TransactionStatus, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-warning/15 text-warning" },
  paid: { label: "Pago", cls: "bg-success/15 text-success" },
  overdue: { label: "Vencido", cls: "bg-destructive/15 text-destructive" },
  canceled: { label: "Cancelado", cls: "bg-muted text-muted-foreground" },
};

const purchaseMap: Record<PurchaseStatus, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-warning/15 text-warning" },
  completed: { label: "Concluída", cls: "bg-success/15 text-success" },
  canceled: { label: "Cancelada", cls: "bg-destructive/15 text-destructive" },
};

const commissionMap: Record<CommissionStatus, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-warning/15 text-warning" },
  paid: { label: "Pago", cls: "bg-success/15 text-success" },
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
    <Badge
      variant="outline"
      className={cn("font-medium border-0", kind === "vehicle" && "rounded-sm", entry.cls)}
    >
      {entry.label}
    </Badge>
  );
}
