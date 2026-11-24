import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { Route } from "@/routes/_app.vehicles.index";

vi.mock("@/shared/supabase/auth", () => ({
  useAuth: () => ({ session: { user: { id: "user-1" } } }),
}));
vi.mock("@/modules/vehicles/hooks/use-vehicle-photo-previews", () => ({
  useVehiclePhotoPreviews: () => ({ data: {} }),
}));
vi.mock("@/modules/alerts/hooks/use-operational-date", () => ({
  useOperationalDate: () => "2026-11-23",
}));
vi.mock("@/modules/vehicles/services/vehicles", () => ({
  listVehiclesPage: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, pageSize: 20 }),
  countVehiclesByStatus: vi.fn().mockResolvedValue({}),
  listPendingVehicleActions: vi
    .fn()
    .mockResolvedValue([{ action: "archive", vehicleId: 9, expectedUpdatedAt: "old" }]),
  setVehiclePublished: vi.fn(),
  runVehicleAction: vi.fn(),
  vehicleStatuses: ["available"],
  vehicleKeys: {
    all: ["vehicles"],
    statusCounts: ["vehicles", "counts"],
    list: () => ["vehicles", "list"],
    detail: (id: number) => ["vehicles", id],
  },
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("mostra a tentativa pendente mesmo quando o veículo não está na página filtrada", async () => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.spyOn(Route, "useSearch").mockReturnValue({ page: 1, status: "available" } as never);
  const root = createRootRoute();
  const page = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: Route.options.component as React.FunctionComponent,
  });
  const detail = createRoute({
    getParentRoute: () => root,
    path: "/vehicles/$id",
    component: () => null,
  });
  const router = createRouter({
    routeTree: root.addChildren([page, detail]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Nenhum veículo encontrado")).toBeTruthy();
  expect(await screen.findByRole("link", { name: "Veículo #9" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Recuperar tentativa anterior" })).toBeTruthy();
});
