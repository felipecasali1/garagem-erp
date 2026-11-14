import { supabase } from "@/shared/supabase/client";
import { getPageBounds, type PaginatedResult } from "@/shared/lib/pagination";
import type { SaleStatus } from "@/shared/types/domain";

export type CustomerPurchaseRow = {
  id: number;
  sale_date: string;
  created_at: string;
  brand: string;
  model: string;
  plate: string;
  total_value: number;
  status: SaleStatus;
};

export const purchaseHistoryKeys = {
  all: ["customer-purchase-history"] as const,
  totals: (ids: number[]) => ["customer-purchase-history", "totals", ids] as const,
  page: (id: number, page: number) => ["customer-purchase-history", id, page] as const,
};

export async function getCustomerPurchaseTotals(ids: number[]): Promise<Record<number, number>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.rpc("customer_purchase_totals", { customer_ids: ids });
  if (error) throw new Error(error.message);
  const totals: Record<number, number> = {};
  for (const row of data ?? []) totals[row.customer_id] = Number(row.total);
  if (ids.some((id) => totals[id] == null || !Number.isFinite(totals[id]))) {
    throw new Error("Não foi possível calcular o total de compras.");
  }
  return totals;
}

export async function getCustomerPurchaseHistory(
  id: number,
  pageInput: number,
): Promise<PaginatedResult<CustomerPurchaseRow>> {
  const { page, pageSize, from, to } = getPageBounds(pageInput, 10);
  const { data, error, count } = await supabase
    .rpc("customer_purchase_history", { customer_id_input: id }, { count: "exact" })
    .order("sale_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (error) throw new Error(error.message);
  return {
    data: (data ?? []).map((row: CustomerPurchaseRow) => ({
      ...row,
      total_value: Number(row.total_value),
    })),
    total: count ?? 0,
    page,
    pageSize,
  };
}
