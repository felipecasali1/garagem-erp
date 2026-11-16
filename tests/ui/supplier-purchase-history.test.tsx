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
import { SupplierPurchaseHistory } from "@/modules/suppliers/components/supplier-purchase-history";
import { getSupplierPurchaseHistory } from "@/modules/suppliers/services/purchase-history";

vi.mock("@/modules/suppliers/services/purchase-history", () => ({
  getSupplierPurchaseHistory: vi.fn(),
  purchaseHistoryKeys: { page: (id: number, page: number) => ["history", id, page] },
}));
const fetchHistory = vi.mocked(getSupplierPurchaseHistory);

function showHistory(role: "admin" | "manager" | "seller" | "financial") {
  const root = createRootRoute();
  const route = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <SupplierPurchaseHistory supplierId={1} accessRole={role} />,
  });
  const purchases = createRoute({
    getParentRoute: () => root,
    path: "/purchases/$id",
    component: () => <p>Detalhe da compra</p>,
  });
  const router = createRouter({
    routeTree: root.addChildren([route, purchases]),
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

describe("Histórico de compras do fornecedor", () => {
  it("mostra carregamento e depois a mensagem de histórico vazio", async () => {
    let finish!: (value: Awaited<ReturnType<typeof getSupplierPurchaseHistory>>) => void;
    fetchHistory.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    showHistory("seller");
    expect(await screen.findByText("Carregando histórico...")).toBeTruthy();
    finish({ data: [], total: 0, page: 1, pageSize: 10 });
    expect(await screen.findByText("Nenhuma compra no histórico deste fornecedor.")).toBeTruthy();
  });

  it("permite tentar novamente após uma falha", async () => {
    fetchHistory
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValueOnce({ data: [], total: 0, page: 1, pageSize: 10 });
    showHistory("seller");
    expect(await screen.findByText(/Falha ao carregar histórico/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Nenhuma compra no histórico deste fornecedor.")).toBeTruthy();
    expect(fetchHistory).toHaveBeenCalledTimes(2);
  });

  it("navega entre páginas do histórico", async () => {
    fetchHistory.mockImplementation(async (_supplierId, page) => ({
      data: [
        {
          id: page,
          purchase_date: "2026-01-01",
          created_at: "2026-01-01",
          brand: "Toyota",
          model: `Página ${page}`,
          plate: "ABC1234",
          total_value: 1000,
          status: "completed",
        },
      ],
      total: 11,
      page,
      pageSize: 10,
    }));
    showHistory("manager");
    expect(await screen.findByText("Toyota Página 1")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    expect(await screen.findByText("Toyota Página 2")).toBeTruthy();
  });

  it.each([
    ["admin", true],
    ["manager", true],
    ["seller", false],
    ["financial", false],
  ] as const)("exibe detalhes da compra para %s conforme a permissão", async (role, allowed) => {
    fetchHistory.mockResolvedValue({
      data: [
        {
          id: 7,
          purchase_date: "2026-01-01",
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
      expect(Boolean(screen.queryByRole("link", { name: "Ver compra" }))).toBe(allowed),
    );
    if (allowed) {
      fireEvent.click(screen.getByRole("link", { name: "Ver compra" }));
      expect(await screen.findByText("Detalhe da compra")).toBeTruthy();
    }
  });
});
