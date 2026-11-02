import { supabase } from "@/shared/supabase/client";
import { summarizeChecklist } from "@/modules/checklist/lib/summarize-checklist";
import type { ChecklistItem, ChecklistSummary } from "@/modules/checklist/types";
import { StaleRecordError } from "@/shared/lib/stale-record";

type ChecklistRow = {
  id: string;
  vehicle_id: number;
  title: string;
  description: string | null;
  category: ChecklistItem["category"];
  status: ChecklistItem["status"];
  priority: ChecklistItem["priority"];
  estimated_cost: number;
  actual_cost: number;
  due_date: string | null;
  completion_date: string | null;
  responsible_employee_id: number | null;
  notes: string | null;
  attachments: unknown;
  created_at: string;
  updated_at: string;
};

export const checklistKeys = {
  all: ["checklist"] as const,
  byVehicle: (vehicleId: number) => ["checklist", "vehicle", vehicleId] as const,
};

function mapChecklistItem(row: ChecklistRow): ChecklistItem {
  return {
    id: row.id,
    vehicle_id: row.vehicle_id,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category,
    status: row.status,
    priority: row.priority,
    estimated_cost: Number(row.estimated_cost),
    actual_cost: Number(row.actual_cost),
    due_date: row.due_date ?? undefined,
    completion_date: row.completion_date ?? undefined,
    responsible_employee_id: row.responsible_employee_id ?? undefined,
    notes: row.notes ?? undefined,
    attachments: Array.isArray(row.attachments)
      ? row.attachments.filter((entry): entry is string => typeof entry === "string")
      : [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

type ChecklistWriteInput = Omit<ChecklistItem, "id" | "created_at" | "updated_at">;
type PendingChecklistCreation = {
  fingerprint: string;
  idempotencyKey: string;
  activeAttempts: { id: string; startedAt: number }[];
  confirmed?: boolean;
};

const checklistAttemptLeaseMs = 5 * 60 * 1000;
const checklistTabStorageKey = "garagem-erp:checklist-create-tab:v1";
type ChecklistTabState = {
  id?: string;
  lockOwned?: boolean;
  pendingClaim?: Promise<string>;
};
const checklistTabState = (import.meta.hot?.data ?? {}) as ChecklistTabState;

function toChecklistPayload(input: ChecklistWriteInput) {
  return {
    vehicle_id: input.vehicle_id,
    title: input.title?.trim(),
    description: input.description?.trim() || null,
    category: input.category,
    status: input.status,
    priority: input.priority,
    estimated_cost: input.estimated_cost,
    actual_cost: input.actual_cost,
    due_date: input.due_date ?? null,
    completion_date: input.completion_date ?? null,
    responsible_employee_id: input.responsible_employee_id ?? null,
    notes: input.notes?.trim() || null,
    attachments: input.attachments ?? [],
  };
}

async function claimChecklistTabLock(tabId: string) {
  return new Promise<boolean>((resolve, reject) => {
    void navigator.locks
      .request(
        `garagem-erp:checklist-tab:${tabId}`,
        { mode: "exclusive", ifAvailable: true },
        (lock) => {
          resolve(lock !== null);
          if (lock) return new Promise<never>(() => {});
        },
      )
      .catch(reject);
  });
}

function getChecklistCreationTabId() {
  if (checklistTabState.id && checklistTabState.lockOwned) {
    return Promise.resolve(checklistTabState.id);
  }
  if (checklistTabState.pendingClaim) return checklistTabState.pendingClaim;

  checklistTabState.pendingClaim = (async () => {
    if (typeof navigator === "undefined" || !navigator.locks) {
      throw new Error(
        "Atualize seu navegador para permitir o envio seguro de tarefas do checklist.",
      );
    }

    let storedTabId: string | null;
    try {
      storedTabId = window.sessionStorage.getItem(checklistTabStorageKey);
    } catch {
      throw new Error("O armazenamento desta aba está bloqueado. Habilite-o para continuar.");
    }

    const candidateTabId = storedTabId ?? crypto.randomUUID();
    if (!storedTabId) {
      try {
        window.sessionStorage.setItem(checklistTabStorageKey, candidateTabId);
      } catch {
        throw new Error("O armazenamento desta aba está bloqueado. Habilite-o para continuar.");
      }
    }
    if (await claimChecklistTabLock(candidateTabId)) {
      checklistTabState.id = candidateTabId;
      checklistTabState.lockOwned = true;
      return candidateTabId;
    }

    const uniqueTabId = crypto.randomUUID();
    try {
      window.sessionStorage.setItem(checklistTabStorageKey, uniqueTabId);
    } catch {
      throw new Error("O armazenamento desta aba está bloqueado. Habilite-o para continuar.");
    }
    if (!(await claimChecklistTabLock(uniqueTabId))) {
      throw new Error("Não foi possível reservar esta aba para uma tentativa segura.");
    }
    checklistTabState.id = uniqueTabId;
    checklistTabState.lockOwned = true;
    return uniqueTabId;
  })().finally(() => {
    checklistTabState.pendingClaim = undefined;
  });

  return checklistTabState.pendingClaim;
}

function checklistCreationStorageKey(userId: string, vehicleId: number, tabId: string) {
  return `garagem-erp:checklist-create:v1:${userId}:${vehicleId}:${tabId}`;
}

function readPendingChecklistCreations(storageKey: string): PendingChecklistCreation[] {
  const stored = window.localStorage.getItem(storageKey);
  if (!stored) return [];

  const parsed: unknown = JSON.parse(stored);
  if (
    Array.isArray(parsed) &&
    parsed.every(
      (entry) =>
        typeof entry?.fingerprint === "string" && typeof entry?.idempotencyKey === "string",
    )
  ) {
    return parsed.map((entry) => ({
      ...entry,
      activeAttempts: Array.isArray(entry.activeAttempts)
        ? entry.activeAttempts.filter(
            (attempt: { id?: unknown; startedAt?: unknown }) =>
              typeof attempt.id === "string" && typeof attempt.startedAt === "number",
          )
        : [],
      confirmed: entry.confirmed === true,
    }));
  }

  window.localStorage.removeItem(storageKey);
  return [];
}

function writePendingChecklistCreations(storageKey: string, entries: PendingChecklistCreation[]) {
  if (entries.length > 0) {
    window.localStorage.setItem(storageKey, JSON.stringify(entries));
  } else {
    window.localStorage.removeItem(storageKey);
  }
}

async function getChecklistCreationContext(input: ChecklistWriteInput) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  const userId = data.session?.user.id;
  if (!userId) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  const tabId = await getChecklistCreationTabId();

  const payload = { vehicle_id: input.vehicle_id, item: toChecklistPayload(input) };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

  return {
    fingerprint,
    storageKey: checklistCreationStorageKey(userId, input.vehicle_id, tabId),
  };
}

function toChecklistPatch(patch: Partial<ChecklistItem>) {
  const payload: Record<string, unknown> = {};

  if ("title" in patch) payload.title = patch.title?.trim();
  if ("description" in patch) payload.description = patch.description?.trim() || null;
  if ("category" in patch) payload.category = patch.category;
  if ("status" in patch) payload.status = patch.status;
  if ("priority" in patch) payload.priority = patch.priority;
  if ("estimated_cost" in patch) payload.estimated_cost = patch.estimated_cost;
  if ("actual_cost" in patch) payload.actual_cost = patch.actual_cost;
  if ("due_date" in patch) payload.due_date = patch.due_date ?? null;
  if ("completion_date" in patch) payload.completion_date = patch.completion_date ?? null;
  if ("responsible_employee_id" in patch) {
    payload.responsible_employee_id = patch.responsible_employee_id ?? null;
  }
  if ("notes" in patch) payload.notes = patch.notes?.trim() || null;
  if ("attachments" in patch) payload.attachments = patch.attachments ?? [];

  return payload;
}

async function getChecklistItem(id: string): Promise<ChecklistItem | null> {
  const { data, error } = await supabase
    .from("vehicle_checklist_items")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapChecklistItem(data as ChecklistRow) : null;
}

async function unwrapChecklistRpc(
  response: PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>,
  itemId?: string,
) {
  const { data, error } = await response;
  if (error) {
    if (error.message.includes("STALE_RECORD:") && itemId) {
      let current: ChecklistItem | null = null;
      try {
        current = await getChecklistItem(itemId);
      } catch {
        // The row may have been removed after the version check failed.
      }
      throw new StaleRecordError(
        "Outra pessoa alterou este item do checklist. Compare o status e os custos atuais com o seu rascunho antes de continuar.",
        current,
      );
    }
    if (error.message.includes("VEHICLE_HAS_OPEN_PREPARATION:")) {
      throw new Error("Conclua ou cancele as tarefas pendentes antes de disponibilizar o veículo.");
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error("Item de checklist não encontrado.");
  return mapChecklistItem(data as ChecklistRow);
}

export async function listChecklist(vehicleId?: number) {
  let query = supabase.from("vehicle_checklist_items").select("*").order("created_at", {
    ascending: false,
  });

  if (vehicleId != null) {
    query = query.eq("vehicle_id", vehicleId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data satisfies ChecklistRow[]).map(mapChecklistItem);
}

export async function createChecklistItem(input: ChecklistWriteInput) {
  const { fingerprint, storageKey } = await getChecklistCreationContext(input);
  const reserveAttempt = () => {
    const now = Date.now();
    const entries = readPendingChecklistCreations(storageKey)
      .map((entry) => ({
        ...entry,
        activeAttempts: entry.activeAttempts.filter(
          (activeAttempt) => now - activeAttempt.startedAt < checklistAttemptLeaseMs,
        ),
      }))
      .filter((entry) => entry.activeAttempts.length > 0 || !entry.confirmed);
    const existing = entries.find((entry) => entry.fingerprint === fingerprint);
    const recoveredAttempt = existing !== undefined;
    const attempt = existing ?? {
      fingerprint,
      idempotencyKey: crypto.randomUUID(),
      activeAttempts: [],
      confirmed: false,
    };
    const activeAttemptId = crypto.randomUUID();
    attempt.activeAttempts.push({ id: activeAttemptId, startedAt: now });
    if (!existing) entries.push(attempt);
    writePendingChecklistCreations(storageKey, entries);
    return { idempotencyKey: attempt.idempotencyKey, activeAttemptId, recoveredAttempt };
  };
  const attempt = await navigator.locks.request(storageKey, { mode: "exclusive" }, reserveAttempt);

  const settleAttempt = async (succeeded: boolean) => {
    try {
      await navigator.locks.request(storageKey, { mode: "exclusive" }, () => {
        const entries = readPendingChecklistCreations(storageKey);
        const current = entries.find((entry) => entry.idempotencyKey === attempt.idempotencyKey);
        if (!current) return;

        current.activeAttempts = current.activeAttempts.filter(
          (activeAttempt) => activeAttempt.id !== attempt.activeAttemptId,
        );
        current.confirmed = current.confirmed || succeeded;
        const removeWhenIdle = current.confirmed;
        writePendingChecklistCreations(
          storageKey,
          entries.filter(
            (entry) =>
              entry.idempotencyKey !== current.idempotencyKey ||
              !removeWhenIdle ||
              current.activeAttempts.length > 0,
          ),
        );
      });
    } catch {
      // Preserve the stored key if local cleanup fails; a retry remains idempotent.
    }
  };

  try {
    const created = await unwrapChecklistRpc(
      supabase.rpc("create_vehicle_checklist_item", {
        p_idempotency_key: attempt.idempotencyKey,
        p_vehicle_id: input.vehicle_id,
        p_item: toChecklistPayload(input),
      }),
    );
    await settleAttempt(true);
    return { item: created, recoveredAttempt: attempt.recoveredAttempt };
  } catch (error) {
    await settleAttempt(false);
    throw error;
  }
}

export async function updateChecklistItem(
  id: string,
  patch: Partial<ChecklistItem>,
  expectedUpdatedAt: string,
) {
  return unwrapChecklistRpc(
    supabase.rpc("update_vehicle_checklist_item", {
      p_item_id: id,
      p_expected_updated_at: expectedUpdatedAt,
      p_changes: toChecklistPatch(patch),
    }),
    id,
  );
}

export async function cancelChecklistItem(id: string, expectedUpdatedAt: string) {
  return updateChecklistItem(id, { status: "cancelled" }, expectedUpdatedAt);
}

export function summarize(list: ChecklistItem[]): ChecklistSummary {
  return summarizeChecklist(list);
}
