import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { buildOperationalAlerts } from "@/modules/alerts/lib/build-operational-alerts";
import { useOperationalDate } from "@/modules/alerts/hooks/use-operational-date";
import { checklistKeys, listChecklist } from "@/modules/checklist/services/checklist";
import {
  financialTransactionKeys,
  listFinancialTransactions,
} from "@/modules/financial/services/transactions";
import { saleKeys, listSales } from "@/modules/sales/services/sales";
import { listVehicles, vehicleKeys } from "@/modules/vehicles/services/vehicles";
import { canAccessPath } from "@/shared/auth/access-control";
import { useAuth } from "@/shared/supabase/auth";

export function useOperationalAlerts() {
  const { accessRole, loading: loadingAuth } = useAuth();
  const today = useOperationalDate();
  const canSeeVehicles = canAccessPath(accessRole, "/vehicles");
  const canSeeSales = canAccessPath(accessRole, "/sales");
  const canSeeFinancial = canAccessPath(accessRole, "/financial");

  const vehiclesQuery = useQuery({
    queryKey: vehicleKeys.all,
    queryFn: listVehicles,
    enabled: canSeeVehicles,
  });
  const checklistQuery = useQuery({
    queryKey: checklistKeys.all,
    queryFn: () => listChecklist(),
    enabled: canSeeVehicles,
  });
  const salesQuery = useQuery({
    queryKey: saleKeys.all,
    queryFn: listSales,
    enabled: canSeeSales,
  });
  const financialQuery = useQuery({
    queryKey: financialTransactionKeys.all,
    queryFn: listFinancialTransactions,
    enabled: canSeeFinancial,
  });

  const queryError =
    vehiclesQuery.error ?? checklistQuery.error ?? salesQuery.error ?? financialQuery.error;
  const isLoading =
    loadingAuth ||
    vehiclesQuery.isLoading ||
    checklistQuery.isLoading ||
    salesQuery.isLoading ||
    financialQuery.isLoading;
  const alerts = useMemo(() => {
    if (!accessRole || queryError) return [];

    return buildOperationalAlerts({
      financialTransactions: financialQuery.data ?? [],
      sales: salesQuery.data ?? [],
      vehicles: vehiclesQuery.data ?? [],
      checklist: checklistQuery.data ?? [],
      today,
      accessRole,
    });
  }, [
    accessRole,
    checklistQuery.data,
    financialQuery.data,
    queryError,
    salesQuery.data,
    today,
    vehiclesQuery.data,
  ]);

  return { alerts, isLoading, error: queryError };
}
