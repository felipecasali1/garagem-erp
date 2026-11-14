import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { CustomerPurchaseHistory } from "@/modules/customers/components/customer-purchase-history";
import { getCustomerPurchaseHistory } from "@/modules/customers/services/purchase-history";

vi.mock("@/modules/customers/services/purchase-history", () => ({
  getCustomerPurchaseHistory: vi.fn(),
  purchaseHistoryKeys: { page: (id: number, page: number) => ["history", id, page] },
}));
const fetchHistory = vi.mocked(getCustomerPurchaseHistory);

function showHistory(role: "admin" | "manager" | "seller" | "financial") {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <CustomerPurchaseHistory customerId={1} accessRole={role} />,
  });
  const sales = createRoute({
    getParentRoute: () => root,
    path: "/sales/$id",
    component: () => <p>Detalhe da venda</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([route, sales]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchHistory.mockReset();
  window.scrollTo = vi.fn();
});
afterEach(cleanup);

describe("Histórico de compras do cliente", () => {
  it("mostra carregamento e depois a mensagem de histórico vazio", async () => {
    let finish!: (value: Awaited<ReturnType<typeof getCustomerPurchaseHistory>>) => void;
    fetchHistory.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    showHistory("seller");
    expect(await screen.findByText("Carregando histórico...")).toBeTruthy();
    finish({ data: [], total: 0, page: 1, pageSize: 10 });
    expect(await screen.findByText("Nenhuma venda no histórico deste cliente.")).toBeTruthy();
  });

  it("permite tentar novamente após uma falha", async () => {
    fetchHistory
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 10 });
    showHistory("seller");
    expect(await screen.findByText(/Falha ao carregar histórico/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Nenhuma venda no histórico deste cliente.")).toBeTruthy();
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["admin", true],
    ["manager", true],
    ["seller", true],
    ["financial", false],
  ] as const)("exibe detalhes da venda para %s conforme a permissão", async (role, allowed) => {
    fetchHistory.mockResolvedValue({
      data: [
        {
          id: 7,
          sale_date: "2026-01-01",
          created_at: "2026-01-01",
          brand: "Toyota",
          model: "Corolla",
          plate: "ABC1234",
          total_value: 1000,
          status: "completed",
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    });
    showHistory(role);
    expect(await screen.findByText("Toyota Corolla")).toBeTruthy();
    await waitFor(() =>
      expect(Boolean(screen.queryByRole("link", { name: "Ver venda" }))).toBe(allowed),
    );
    if (allowed) {
      fireEvent.click(screen.getByRole("link", { name: "Ver venda" }));
      expect(await screen.findByText("Detalhe da venda")).toBeTruthy();
    }
  });
});
