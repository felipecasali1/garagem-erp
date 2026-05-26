import { supabase } from "@/shared/supabase/client";
import { employees } from "@/modules/employees/services/employees.mock";
import { summarizeChecklist } from "@/modules/checklist/lib/summarize-checklist";
import type { ChecklistItem, ChecklistSummary } from "@/modules/checklist/types";

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

function toChecklistPatch(patch: Partial<ChecklistItem>) {
  const payload: Record<string, unknown> = {};

  if ("vehicle_id" in patch) payload.vehicle_id = patch.vehicle_id;
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

async function unwrapSingle<T>(
  promise: Promise<{ data: T | null; error: { message: string } | null }>,
) {
  const { data, error } = await promise;
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Registro nao encontrado.");
  }
  return data;
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
  const data = await unwrapSingle(
    supabase.from("vehicle_checklist_items").insert(toChecklistPayload(input)).select("*").single(),
  );
  return mapChecklistItem(data satisfies ChecklistRow);
}

export async function updateChecklistItem(id: string, patch: Partial<ChecklistItem>) {
  const data = await unwrapSingle(
    supabase
      .from("vehicle_checklist_items")
      .update(toChecklistPatch(patch))
      .eq("id", id)
      .select("*")
      .single(),
  );
  return mapChecklistItem(data satisfies ChecklistRow);
}

export async function deleteChecklistItem(id: string) {
  const { error } = await supabase.from("vehicle_checklist_items").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export function summarize(list: ChecklistItem[]): ChecklistSummary {
  return summarizeChecklist(list);
}

export function findEmployee(id?: number) {
  if (!id) return undefined;
  return employees.find((employee) => employee.id === id);
}
