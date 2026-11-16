import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Route as DetailRoute } from "@/routes/_app.suppliers.$id";
import { Route as ListRoute } from "@/routes/_app.suppliers.index";
import { getSupplierById, listSuppliersPage } from "@/modules/suppliers/services/suppliers";
import {
  getSupplierPurchaseHistory,
  getSupplierPurchaseTotals,
} from "@/modules/suppliers/services/purchase-history";

vi.mock("@/shared/supabase/auth", () => ({ useAuth: () => ({ accessRole: "financial" }) }));
vi.mock("@/modules/suppliers/components/supplier-form", () => ({
  getSupplierTypeLabel: () => "Pessoa Física",
}));
vi.mock("@/modules/suppliers/services/suppliers", () => ({
  getSupplierById: vi.fn(),
  listSuppliersPage: vi.fn(),
  setSupplierActive: vi.fn(),
  supplierKeys: {
    all: ["suppliers"],
    detail: (id: number) => ["suppliers", id],
    list: (page: number) => ["suppliers", "list", page],
  },
}));
vi.mock("@/modules/suppliers/services/purchase-history", () => ({
  getSupplierPurchaseHistory: vi.fn(),
  getSupplierPurchaseTotals: vi.fn(),
  purchaseHistoryKeys: {
    page: (id: number, page: number) => ["history", id, page],
    totals: (ids: number[]) => ["totals", ids],
  },
}));
const supplier = {
  id: 1,
  person_id: 1,
  supplier_type: "individual" as const,
  active: true,
  created_at: "2026-01-01",
  person: { id: 1, name: "Fornecedor Exemplo", type: "individual" as const, phone: "", email: "" },
};

function showPage(component: React.FunctionComponent) {
  const root = createRootRoute();
  const page = createRoute({ getParentRoute: () => root, path: "/", component });
  const router = createRouter({
    routeTree: root.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  window.scrollTo = vi.fn();
  vi.spyOn(DetailRoute, "useParams").mockReturnValue({ id: "1" } as never);
  vi.spyOn(ListRoute, "useSearch").mockReturnValue({ page: 1 } as never);
  vi.mocked(getSupplierById).mockResolvedValue(supplier);
  vi.mocked(listSuppliersPage).mockResolvedValue({
    data: [supplier],
    total: 1,
    page: 1,
    pageSize: 20,
  });
  vi.mocked(getSupplierPurchaseHistory).mockResolvedValue({
    data: [],
    total: 0,
    page: 1,
    pageSize: 10,
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("mantém o cadastro do fornecedor visível quando o histórico falha", async () => {
  vi.mocked(getSupplierPurchaseHistory).mockRejectedValue(new Error("rede"));
  vi.mocked(getSupplierPurchaseTotals).mockResolvedValue({ 1: 1000 });
  showPage(DetailRoute.options.component as React.FunctionComponent);
  expect(await screen.findByRole("heading", { name: "Fornecedor Exemplo" })).toBeTruthy();
  expect(await screen.findByText(/Falha ao carregar histórico/)).toBeTruthy();
});

it.each([
  ["detalhes", DetailRoute],
  ["lista", ListRoute],
] as const)("mostra erro de total e tenta novamente em %s", async (_name, route) => {
  vi.mocked(getSupplierPurchaseTotals)
    .mockRejectedValueOnce(new Error("rede"))
    .mockResolvedValueOnce({ 1: 1000 });
  showPage(route.options.component as React.FunctionComponent);
  expect(await screen.findAllByText(/Indisponível/)).not.toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
  expect(await screen.findAllByText(/1\.000,00/)).not.toHaveLength(0);
});
