import { webcrypto } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import {
  getPendingStatusAttempt,
  getPendingStatusAttemptsByPrefix,
  runStatusAttempt,
  StatusCommandError,
} from "@/shared/supabase/status-attempt";
import { runWithStoredAttempt } from "@/shared/lib/idempotency";

vi.mock("@/shared/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { user: { id: "user-1" } } },
        error: null,
      })),
    },
  },
}));

afterEach(() => {
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

it("preserva uma tentativa incerta e a distingue de uma operação nova", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const namespace = "preparation:1";
  const payload = { p_vehicle_id: 1, p_expected_updated_at: "old-version" };
  const keys: string[] = [];
  await expect(
    runStatusAttempt(namespace, payload, async (key) => {
      keys.push(key);
      throw new Error("resposta perdida");
    }),
  ).rejects.toThrow("resposta perdida");
  expect(await getPendingStatusAttempt(namespace)).toEqual(payload);
  await expect(
    runStatusAttempt(
      namespace,
      { ...payload, p_expected_updated_at: "new-version" },
      async () => null,
    ),
  ).rejects.toThrow(/tentativa anterior/);
  const recovered = await runStatusAttempt(namespace, payload, async (key) => {
    keys.push(key);
    return "confirmado";
  });
  expect(recovered).toEqual({ value: "confirmado", recovered: true });
  expect(keys[1]).toBe(keys[0]);
  expect(await getPendingStatusAttempt(namespace)).toBeNull();
  const next = await runStatusAttempt(namespace, payload, async (key) => {
    keys.push(key);
    return "novo";
  });
  expect(next.recovered).toBe(false);
  expect(keys[2]).not.toBe(keys[1]);
});

it("remove tentativa rejeitada definitivamente sem impedir uma ação corrigida", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const payload = { p_employee_id: 1, p_active: false, p_expected_updated_at: "old" };
  await expect(
    runStatusAttempt("employee-status:1", payload, async () => {
      throw new StatusCommandError("STALE_RECORD", "PT409");
    }),
  ).rejects.toThrow("STALE_RECORD");
  expect(await getPendingStatusAttempt("employee-status:1")).toBeNull();
});

it("lista tentativas de veículos de toda a aba somente para o usuário atual", async () => {
  vi.stubGlobal("crypto", webcrypto);
  const own = { action: "archive", vehicleId: 9, expectedUpdatedAt: "old" };
  const other = { action: "archive", vehicleId: 10, expectedUpdatedAt: "old" };
  await expect(
    runStatusAttempt("vehicle-action:9", own, async () => {
      throw new Error("offline");
    }),
  ).rejects.toThrow();
  await expect(
    runWithStoredAttempt(
      "vehicle-action:10",
      "other-user",
      other,
      async () => {
        throw new Error("offline");
      },
      { rememberPayload: true },
    ),
  ).rejects.toThrow();
  expect(await getPendingStatusAttemptsByPrefix("vehicle-action:")).toEqual([own]);
});
