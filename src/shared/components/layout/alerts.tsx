import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, Banknote, Bell, ShoppingBag, Wrench, type LucideIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Button } from "@/shared/components/ui/button";
import { useOperationalAlerts } from "@/modules/alerts/hooks/use-operational-alerts";
import type { OperationalAlertKind } from "@/modules/alerts/types";

const alertMeta: Record<OperationalAlertKind, { icon: LucideIcon; color: string }> = {
  financial: { icon: Banknote, color: "text-destructive" },
  checklist: { icon: AlertTriangle, color: "text-destructive" },
  sale: { icon: ShoppingBag, color: "text-warning" },
  preparation: { icon: Wrench, color: "text-warning" },
};

export function AlertsMenu() {
  const navigate = useNavigate();
  const { alerts, isLoading, error } = useOperationalAlerts();
  const total = alerts.reduce((sum, alert) => sum + alert.count, 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Alertas operacionais">
          <Bell className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-destructive text-[9px] leading-4 text-destructive-foreground ring-2 ring-background">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border">
          <div className="font-display font-semibold">Alertas</div>
          <div className="text-xs text-muted-foreground">
            {isLoading
              ? "Carregando alertas..."
              : `${total} alerta${total === 1 ? " ativo" : "s ativos"}`}
          </div>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {error ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Não foi possível carregar os alertas agora.
            </div>
          ) : isLoading ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">Carregando alertas...</div>
          ) : alerts.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              Nenhum alerta operacional relevante.
            </div>
          ) : (
            alerts.map((alert) => {
              const meta = alertMeta[alert.kind];
              const Icon = meta.icon;
              return (
                <button
                  key={alert.kind}
                  type="button"
                  onClick={() => navigate({ to: alert.href })}
                  className="w-full text-left px-4 py-3 hover:bg-muted/50 transition flex gap-3"
                >
                  <div className={`mt-0.5 ${meta.color}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium leading-tight">{alert.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">Abrir lista filtrada</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
