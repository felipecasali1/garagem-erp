import type { FinancialTransaction } from "@/shared/types/domain";

export const transactions: FinancialTransaction[] = [
  { id: 1, type: "income", category: "vehicle_sale", status: "paid", amount: 82900, transaction_date: "2025-04-28", description: "Venda #1024 - Onix LTZ", related: "Mariana Costa" },
  { id: 2, type: "expense", category: "vehicle_purchase", status: "paid", amount: 135000, transaction_date: "2025-04-19", description: "Compra #503 - BYD Dolphin", related: "Multimarcas Vega" },
  { id: 3, type: "income", category: "vehicle_sale", status: "pending", amount: 132500, transaction_date: "2025-05-02", due_date: "2025-05-20", description: "Venda #1025 - VW Nivus", related: "João Pedro Silva" },
  { id: 4, type: "expense", category: "salary", status: "paid", amount: 4500, transaction_date: "2025-05-01", description: "Salário - Rafael Mendes", related: "Folha Maio" },
  { id: 5, type: "expense", category: "fixed_cost", status: "overdue", amount: 8500, transaction_date: "2025-04-30", due_date: "2025-05-05", description: "Aluguel - Pátio Sede", related: "Imobiliária Trevo" },
  { id: 6, type: "expense", category: "commission", status: "pending", amount: 2487, transaction_date: "2025-05-05", due_date: "2025-05-15", description: "Comissão venda #1026", related: "Rafael Mendes" },
  { id: 7, type: "income", category: "vehicle_sale", status: "paid", amount: 178900, transaction_date: "2025-05-05", description: "Venda #1026 - Jeep Compass", related: "Construtora Vega" },
  { id: 8, type: "expense", category: "fixed_cost", status: "paid", amount: 1200, transaction_date: "2025-05-03", description: "Energia elétrica", related: "Enel" },
];
