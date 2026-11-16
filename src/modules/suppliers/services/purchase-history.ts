import { supabase } from "@/shared/supabase/client";
import { getPageBounds, type PaginatedResult } from "@/shared/lib/pagination";
import type { PurchaseStatus } from "@/shared/types/domain";

export type SupplierPurchaseRow = {
  id: number;
  purchase_date: string;
  created_at: string;
  brand: string;
  model: string;
  plate: string;
  total_value: number;
  status: PurchaseStatus;
};

export const purchaseHistoryKeys = {
  all: ["supplier-purchase-history"] as const,
  totals: (ids: number[]) => ["supplier-purchase-history", "totals", ids] as const,
  page: (id: number, page: number) => ["supplier-purchase-history", id, page] as const,
};

export async function getSupplierPurchaseTotals(ids: number[]): Promise<Record<number, number>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc("supplier_purchase_totals", { supplier_ids: ids });
  if (error) throw new Error(error.message);
  const totals: Record<number, number> = {};
  for (const row of data ?? []) totals[row.supplier_id] = Number(row.total);
  if (ids.some((id) => totals[id] == null || !Number.isFinite(totals[id]))) {
    throw new Error("Não foi possível calcular o total de compras.");
  }
  return totals;
}

export async function getSupplierPurchaseHistory(
  id: number,
  pageInput: number,
): Promise<PaginatedResult<SupplierPurchaseRow>> {
  const { page, pageSize, from, to } = getPageBounds(pageInput, 10);
  const { data, error, count } = await supabase
    .rpc("supplier_purchase_history", { supplier_id_input: id }, { count: "exact" })
    .order("purchase_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  if (count == null) throw new Error("Não foi possível contar as compras.");
  return {
    data: (data ?? []).map((row: SupplierPurchaseRow) => ({
      ...row,
      total_value: Number(row.total_value),
    })),
    total: count,
    page,
    pageSize,
  };
}
