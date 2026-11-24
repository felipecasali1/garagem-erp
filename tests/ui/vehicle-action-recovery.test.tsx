import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VehicleActionRecovery } from "@/modules/vehicles/components/vehicle-action-recovery";
import { runVehicleAction } from "@/modules/vehicles/services/vehicles";

vi.mock("@/modules/vehicles/services/vehicles", () => ({
  runVehicleAction: vi.fn().mockResolvedValue({ value: { id: 9 }, recovered: true }),
  getPendingVehicleAction: vi.fn(),
  vehicleKeys: { all: ["vehicles"], detail: (id: number) => ["vehicles", id] },
}));

afterEach(cleanup);

it.each([
  [{ action: "archive" as const, vehicleId: 9, expectedUpdatedAt: "original" }, "arquivamento"],
  [
    {
      action: "publication" as const,
      vehicleId: 9,
      expectedUpdatedAt: "original",
      published: false,
    },
    "despublicação",
  ],
])("oferece recuperar tentativa anterior de %s", async (attempt, label) => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <VehicleActionRecovery attempt={attempt} />
    </QueryClientProvider>,
  );
  expect(screen.getByText(`Tentativa de ${label} sem confirmação.`)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Recuperar tentativa anterior" }));
  await waitFor(() => expect(vi.mocked(runVehicleAction)).toHaveBeenCalledWith(attempt));
  vi.mocked(runVehicleAction).mockClear();
});
