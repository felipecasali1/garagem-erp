import type {
  CommissionType,
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
} from "../../../shared/types/domain.js";

export type SalePaymentInput = {
  saleStatus: SaleStatus;
  method: PaymentMethod;
  totalValue: number;
  downPayment: number;
  paymentDate?: string;
  saleDate: string;
};

export type SalePaymentOutput = {
  paymentStatus: PaymentStatus;
  downPayment: number;
  installmentsCount: number;
  paymentDate: string;
  remainingAmount: number;
};

export function normalizeSalePayment({
  saleStatus,
  method,
  totalValue,
  downPayment,
  paymentDate,
  saleDate,
}: SalePaymentInput): SalePaymentOutput {
  if (method === "trade_in") {
    throw new Error("Troca como forma de pagamento ainda depende do fluxo de veículo recebido.");
  }

  if (method === "financing") {
    if (downPayment > totalValue) {
      throw new Error("A entrada não pode ser maior que o valor final da venda.");
    }

    const payment: SalePaymentOutput = {
      paymentStatus: downPayment >= totalValue ? "paid" : downPayment > 0 ? "partial" : "pending",
      downPayment,
      installmentsCount: 1,
      paymentDate: paymentDate ?? saleDate,
      remainingAmount: Math.max(0, totalValue - downPayment),
    };

    return saleStatus === "completed" ? payment : { ...payment, paymentStatus: "pending" as const };
  }

  const payment: SalePaymentOutput = {
    paymentStatus: "paid",
    downPayment: totalValue,
    installmentsCount: 1,
    paymentDate: paymentDate ?? saleDate,
    remainingAmount: 0,
  };

  return saleStatus === "completed"
    ? payment
    : {
        ...payment,
        paymentStatus: "pending" as const,
        downPayment: 0,
        remainingAmount: totalValue,
      };
}

export type SaleFinancialInput = {
  saleStatus: SaleStatus;
  totalValue: number;
  vehicleCost: number;
  commission?: { amount: number };
  commissionType: CommissionType;
  commissionRate: number;
};

export function summarizeSaleFinancials({
  totalValue,
  vehicleCost,
  commission,
  commissionType,
  commissionRate,
  saleStatus,
}: SaleFinancialInput) {
  const commissionAmount =
    commission?.amount ??
    (commissionType === "percentage" ? (totalValue * commissionRate) / 100 : commissionRate);

  return {
    commissionAmount,
    commissionGenerated: Boolean(commission),
    commissionLabel: saleStatus === "pending" && !commission ? "Comissão estimada" : "Comissão",
    profit: totalValue - vehicleCost - commissionAmount,
  };
}
