import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EditPendingPurchaseDialog } from "@/modules/purchases/components/edit-pending-purchase-dialog";
import { getPurchaseById, updatePurchase } from "@/modules/purchases/services/purchases";
import type { Purchase } from "@/shared/types/domain";

vi.mock("@/modules/purchases/services/purchases", () => ({
  getPurchaseById: vi.fn(),
  updatePurchase: vi.fn(),
}));

const purchase = {
  id: 7,
  supplier_id: 3,
  total_value: 10000,
  purchase_date: "2026-01-01",
  status: "pending",
  updated_at: "2026-01-01T12:00:00Z",
  notes: "Nota original",
} as Purchase;
const latest: Purchase = {
  ...purchase,
  total_value: 12000,
  notes: "Nota atualizada por outra pessoa",
  updated_at: "2026-01-02T12:00:00Z",
};

function showEditor() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const onSaved = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <EditPendingPurchaseDialog
        purchase={purchase}
        open
        onOpenChange={onOpenChange}
        onSaved={onSaved}
      />
    </QueryClientProvider>,
  );
  return { onSaved, onOpenChange };
}

async function encounterConflict() {
  vi.mocked(updatePurchase).mockRejectedValueOnce(new Error("STALE_RECORD"));
  vi.mocked(getPurchaseById).mockResolvedValue(latest);
  showEditor();
  fireEvent.change(await screen.findByLabelText("Valor da compra"), { target: { value: "11000" } });
  fireEvent.change(screen.getByLabelText("Observações"), { target: { value: "Meu rascunho" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar alterações" }));
  expect(await screen.findByText(/Esta compra mudou enquanto você editava/)).toBeTruthy();
  expect(await screen.findByText(/12\.000,00/)).toBeTruthy();
  expect((screen.getByLabelText("Valor da compra") as HTMLInputElement).value).toBe("11000");
  expect((screen.getByLabelText("Observações") as HTMLTextAreaElement).value).toBe("Meu rascunho");
}

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

it("preserva o rascunho e permite carregar os dados atuais após um conflito", async () => {
  await encounterConflict();
  fireEvent.click(screen.getByRole("button", { name: "Recarregar formulário" }));
  expect((screen.getByLabelText("Valor da compra") as HTMLInputElement).value).toBe("12000");
  expect((screen.getByLabelText("Observações") as HTMLTextAreaElement).value).toBe(
    "Nota atualizada por outra pessoa",
  );
  expect(screen.queryByText(/Esta compra mudou enquanto você editava/)).toBeNull();
});

it("reaplica apenas por escolha explícita usando o rascunho e a versão atual", async () => {
  await encounterConflict();
  vi.mocked(updatePurchase).mockResolvedValueOnce(7);
  expect(vi.mocked(updatePurchase)).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Reaplicar minhas alterações" }));
  await waitFor(() => expect(vi.mocked(updatePurchase)).toHaveBeenCalledTimes(2));
  expect(vi.mocked(updatePurchase).mock.calls[1][0]).toMatchObject({
    purchaseId: 7,
    expectedUpdatedAt: latest.updated_at,
    totalValue: 11000,
    notes: "Meu rascunho",
  });
});
