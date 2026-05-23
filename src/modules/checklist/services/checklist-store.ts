import { employees } from "@/modules/employees/services/employees.mock";
import type { ChecklistItem, ChecklistSummary } from "@/modules/checklist/types";

const now = new Date();
const iso = (d: Date) => d.toISOString();
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);

let _id = 0;
const uid = () => `c_${++_id}_${Date.now().toString(36)}`;

function seed(): ChecklistItem[] {
  const base = [
    {
      vehicle_id: 1,
      title: "Polimento e cristalização",
      category: "cleaning" as const,
      status: "completed" as const,
      priority: "medium" as const,
      estimated_cost: 450,
      actual_cost: 420,
      responsible_employee_id: 2,
      due_date: dateOnly(addDays(now, -3)),
      completion_date: dateOnly(addDays(now, -2)),
    },
    {
      vehicle_id: 1,
      title: "Sessão de fotos profissionais",
      category: "photography" as const,
      status: "pending" as const,
      priority: "high" as const,
      estimated_cost: 180,
      actual_cost: 0,
      responsible_employee_id: 1,
      due_date: dateOnly(addDays(now, 2)),
    },
    {
      vehicle_id: 5,
      title: "Reparo de embreagem",
      category: "mechanical" as const,
      status: "waiting_parts" as const,
      priority: "urgent" as const,
      estimated_cost: 2800,
      actual_cost: 1200,
      responsible_employee_id: 3,
      due_date: dateOnly(addDays(now, 5)),
      description: "Patinação ao engatar segunda marcha. Aguardando kit completo.",
    },
    {
      vehicle_id: 5,
      title: "Pintura para-choque traseiro",
      category: "bodywork" as const,
      status: "in_progress" as const,
      priority: "high" as const,
      estimated_cost: 950,
      actual_cost: 0,
      responsible_employee_id: 3,
      due_date: dateOnly(addDays(now, 4)),
    },
    {
      vehicle_id: 5,
      title: "Transferência veicular",
      category: "documentation" as const,
      status: "pending" as const,
      priority: "medium" as const,
      estimated_cost: 320,
      actual_cost: 0,
      due_date: dateOnly(addDays(now, 10)),
    },
    {
      vehicle_id: 2,
      title: "Troca de óleo + filtros",
      category: "oil_change" as const,
      status: "completed" as const,
      priority: "low" as const,
      estimated_cost: 280,
      actual_cost: 295,
      responsible_employee_id: 3,
      completion_date: dateOnly(addDays(now, -7)),
    },
    {
      vehicle_id: 3,
      title: "Instalação de película",
      category: "accessories" as const,
      status: "pending" as const,
      priority: "medium" as const,
      estimated_cost: 600,
      actual_cost: 0,
      due_date: dateOnly(addDays(now, 6)),
    },
  ];

  return base.map((b, i) => ({
    id: `seed_${i + 1}`,
    description: undefined,
    notes: undefined,
    attachments: [],
    created_at: iso(addDays(now, -10 + i)),
    updated_at: iso(addDays(now, -1)),
    ...b,
  }));
}

let items: ChecklistItem[] = seed();
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export const checklistStore = {
  getAll(): ChecklistItem[] {
    return items;
  },
  getByVehicle(vehicleId: number): ChecklistItem[] {
    return items.filter((item) => item.vehicle_id === vehicleId);
  },
  add(input: Omit<ChecklistItem, "id" | "created_at" | "updated_at">) {
    const item: ChecklistItem = {
      ...input,
      id: uid(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    items = [item, ...items];
    emit();
    return item;
  },
  update(id: string, patch: Partial<ChecklistItem>) {
    items = items.map((item) =>
      item.id === id
        ? {
            ...item,
            ...patch,
            updated_at: new Date().toISOString(),
            completion_date:
              patch.status === "completed" && !item.completion_date
                ? dateOnly(new Date())
                : patch.status && patch.status !== "completed"
                  ? undefined
                  : item.completion_date,
          }
        : item,
    );
    emit();
  },
  remove(id: string) {
    items = items.filter((item) => item.id !== id);
    emit();
  },
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function summarize(list: ChecklistItem[]): ChecklistSummary {
  const active = list.filter((item) => item.status !== "cancelled");
  const completed = active.filter((item) => item.status === "completed").length;
  const pending = list.filter((item) => item.status === "pending").length;
  const inProgress = list.filter((item) => item.status === "in_progress").length;
  const waitingParts = list.filter((item) => item.status === "waiting_parts").length;
  const cancelled = list.filter((item) => item.status === "cancelled").length;
  const estimatedCost = list
    .filter((item) => item.status !== "cancelled")
    .reduce((sum, item) => sum + (item.estimated_cost || 0), 0);
  const actualCost = list.reduce((sum, item) => sum + (item.actual_cost || 0), 0);
  const progress = active.length === 0 ? 0 : Math.round((completed / active.length) * 100);
  const readyForSale = active.length > 0 && completed === active.length;
  const hasUrgent = list.some(
    (item) =>
      item.priority === "urgent" &&
      item.status !== "completed" &&
      item.status !== "cancelled",
  );

  return {
    total: list.length,
    completed,
    pending,
    inProgress,
    waitingParts,
    cancelled,
    estimatedCost,
    actualCost,
    progress,
    readyForSale,
    hasUrgent,
  };
}

export function findEmployee(id?: number) {
  if (!id) return undefined;
  return employees.find((employee) => employee.id === id);
}
