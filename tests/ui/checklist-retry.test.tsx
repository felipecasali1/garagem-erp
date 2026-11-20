import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { updateChecklistItem } from "@/modules/checklist/services/checklist";
import { supabase } from "@/shared/supabase/client";
import { StaleRecordError } from "@/shared/lib/stale-record";

vi.mock("@/shared/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "user-1" } } },
        error: null,
      })),
    },
    rpc: vi.fn(),
    from: vi.fn(),
  },
}));

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("recupera uma tentativa anterior antes de aplicar alterações após atualizar a tela", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const item = {
    id: "task-1",
    vehicle_id: 1,
    title: "Inspeção",
    description: null,
    category: "inspection",
    status: "completed",
    priority: "medium",
    estimated_cost: 0,
    actual_cost: 50,
    due_date: null,
    completion_date: null,
    responsible_employee_id: null,
    notes: null,
    attachments: [],
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-20T12:00:00Z",
  };
  const rpc = vi.mocked(supabase.rpc);
  rpc.mockResolvedValueOnce({
    data: null,
    error: { message: "conexão interrompida", code: "" },
  } as never);
  await expect(updateChecklistItem("task-1", { actual_cost: 50 }, "old-version")).rejects.toThrow(
    "conexão interrompida",
  );
  const firstCommand = rpc.mock.calls[0][1];
  rpc.mockResolvedValueOnce({ data: item, error: null } as never);
  vi.mocked(supabase.from).mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: item, error: null }) }) }),
  } as never);
  await expect(
    updateChecklistItem("task-1", { actual_cost: 80 }, item.updated_at),
  ).rejects.toBeInstanceOf(StaleRecordError);
  expect(rpc.mock.calls[1][1]).toEqual(firstCommand);
  expect(rpc).toHaveBeenCalledTimes(2);
});
