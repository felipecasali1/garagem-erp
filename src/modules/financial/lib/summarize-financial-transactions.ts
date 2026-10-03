import type { TransactionStatus } from "../../../shared/types/domain.js";

export type FinancialSummaryRow = {
  amount: number;
  status: TransactionStatus;
};

export type FinancialTransactionSummary = {
  total: number;
  pendingCount: number;
  pendingAmount: number;
  overdueCount: number;
  overdueAmount: number;
  paidCount: number;
  paidAmount: number;
};

export function summarizeFinancialTransactions(
  rows: readonly FinancialSummaryRow[],
): FinancialTransactionSummary {
  return rows.reduce<FinancialTransactionSummary>(
    (summary, row) => {
      summary.total += 1;

      if (row.status === "pending") {
        summary.pendingCount += 1;
        summary.pendingAmount += row.amount;
      } else if (row.status === "overdue") {
        summary.overdueCount += 1;
        summary.overdueAmount += row.amount;
      } else if (row.status === "paid") {
        summary.paidCount += 1;
        summary.paidAmount += row.amount;
      }

      return summary;
    },
    {
      total: 0,
      pendingCount: 0,
      pendingAmount: 0,
      overdueCount: 0,
      overdueAmount: 0,
      paidCount: 0,
      paidAmount: 0,
    },
  );
}
