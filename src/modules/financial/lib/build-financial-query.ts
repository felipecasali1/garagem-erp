export type FinancialListOrderCriterion = {
  column: "transaction_date" | "due_date" | "id";
  ascending: boolean;
  nullsFirst?: boolean;
};

export const financialListOrdering: Record<string, readonly FinancialListOrderCriterion[]> = {
  transactionDate: [
    { column: "transaction_date", ascending: false },
    { column: "id", ascending: false },
  ],
  dueDate: [
    { column: "due_date", ascending: true, nullsFirst: false },
    { column: "transaction_date", ascending: false },
    { column: "id", ascending: false },
  ],
};

export function buildFinancialSearchFilter(search: string) {
  const escaped = search.trim().replace(/[\\%_]/g, "\\$&");
  const pattern = `%${escaped}%`;

  return `description.ilike.${pattern},related.ilike.${pattern}`;
}

export function buildFinancialOverdueFilter(today: string) {
  return `status.eq.overdue,and(status.eq.pending,due_date.lt.${today})`;
}
