import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FinancialActionDialog } from "@/modules/financial/components/quick-actions-dialog";
import { createManualFinancialTransaction } from "@/modules/financial/services/transactions";

const pending = {
  type: "expense" as const,
  category: "salary" as const,
  status: "paid" as const,
  amount: 3000,
  transaction_date: "2026-11-20",
  description: "Salário - Funcionário antigo",
  employee_id: 42,
};

vi.mock("@/modules/financial/services/transactions", () => ({
  createManualFinancialTransaction: vi.fn().mockResolvedValue(10),
  discardManualFinancialAttempt: vi.fn(),
  getPendingManualFinancialAttempt: vi.fn(async () => pending),
  financialTransactionKeys: { all: ["financial-transactions"] },
}));
vi.mock("@/modules/employees/services/employees", () => ({
  employeeKeys: { active: ["active-employees"] },
  listActiveEmployees: vi.fn().mockResolvedValue([]),
}));

afterEach(cleanup);

it("recupera salário pendente mesmo quando o funcionário deixou de estar ativo", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <FinancialActionDialog kind="salary" onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Recuperar tentativa anterior" }));
  await waitFor(() =>
    expect(vi.mocked(createManualFinancialTransaction).mock.calls[0]?.[0]).toEqual(pending),
  );
});
