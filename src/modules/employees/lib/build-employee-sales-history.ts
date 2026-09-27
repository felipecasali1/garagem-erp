import type { CommissionStatus, Sale } from "../../../shared/types/domain.js";
import { summarizeSaleFinancials } from "../../sales/lib/sale-financials.js";

export type EmployeeSalesHistoryCommission =
  | { source: "recorded"; amount: number; status: CommissionStatus }
  | { source: "estimated"; amount: number }
  | { source: "none"; amount: 0 };

export type EmployeeSalesHistoryRow = {
  saleId: number;
  saleDate: string;
  vehicleName: string;
  vehiclePlate: string;
  customerName: string;
  totalValue: number;
  status: "pending" | "completed";
  commission: EmployeeSalesHistoryCommission;
};

export type EmployeeSalesHistory = {
  completedSalesCount: number;
  completedSalesValue: number;
  pendingSalesCount: number;
  consolidatedCommission: number;
  estimatedCommission: number;
  sales: EmployeeSalesHistoryRow[];
};

function commissionForSale(sale: Sale): EmployeeSalesHistoryCommission {
  if (sale.status === "completed") {
    return sale.commission
      ? { source: "recorded", amount: sale.commission.amount, status: sale.commission.status }
      : { source: "none", amount: 0 };
  }

  const { commissionAmount } = summarizeSaleFinancials({
    saleStatus: sale.status,
    totalValue: sale.total_value,
    vehicleCost: sale.vehicle.cost_price,
    commissionType: sale.employee.commission_type,
    commissionRate: sale.employee.commission_rate,
  });

  return commissionAmount > 0
    ? { source: "estimated", amount: commissionAmount }
    : { source: "none", amount: 0 };
}

function toRow(sale: Sale): EmployeeSalesHistoryRow {
  return {
    saleId: sale.id,
    saleDate: sale.sale_date,
    vehicleName: `${sale.vehicle.brand} ${sale.vehicle.model}`,
    vehiclePlate: sale.vehicle.plate,
    customerName: sale.customer.person.name,
    totalValue: sale.total_value,
    status: sale.status as "pending" | "completed",
    commission: commissionForSale(sale),
  };
}

export function buildEmployeeSalesHistory(sales: Sale[]): EmployeeSalesHistory {
  const visibleSales = sales
    .filter((sale) => sale.status === "pending" || sale.status === "completed")
    .sort((left, right) => {
      const dateOrder = right.sale_date.localeCompare(left.sale_date);
      return dateOrder !== 0 ? dateOrder : right.id - left.id;
    });

  const completedSales = visibleSales.filter((sale) => sale.status === "completed");
  const pendingSales = visibleSales.filter((sale) => sale.status === "pending");
  const rows = visibleSales.map(toRow);

  return {
    completedSalesCount: completedSales.length,
    completedSalesValue: completedSales.reduce((sum, sale) => sum + sale.total_value, 0),
    pendingSalesCount: pendingSales.length,
    consolidatedCommission: rows
      .filter((row) => row.status === "completed" && row.commission.source === "recorded")
      .reduce((sum, row) => sum + row.commission.amount, 0),
    estimatedCommission: rows
      .filter((row) => row.commission.source === "estimated")
      .reduce((sum, row) => sum + row.commission.amount, 0),
    sales: rows,
  };
}
