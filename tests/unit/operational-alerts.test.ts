import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationalAlerts } from "../../src/modules/alerts/lib/build-operational-alerts.js";
import type { ChecklistItem } from "../../src/modules/checklist/types.js";
import type { FinancialTransaction } from "../../src/shared/types/domain.js";
import type { SaleStatus, VehicleStatus } from "../../src/shared/types/domain.js";

type AccessRole = "admin" | "manager" | "seller" | "financial";

function transaction(overrides: Partial<FinancialTransaction> = {}): FinancialTransaction {
  return {
    id: 1,
    type: "expense",
    category: "fixed_cost",
    status: "pending",
    amount: 100,
    transaction_date: "2026-09-01",
    description: "Conta",
    ...overrides,
  };
}

function checklistItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
  return {
    id: "check-1",
    vehicle_id: 10,
    title: "Revisar veículo",
    category: "mechanical",
    status: "pending",
    priority: "medium",
    estimated_cost: 100,
    actual_cost: 0,
    attachments: [],
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function sale(id: number, status: SaleStatus) {
  return { id, status };
}

function vehicle(id: number, status: VehicleStatus) {
  return { id, status };
}

function alertsFor(
  input: Partial<Parameters<typeof buildOperationalAlerts>[0]> & {
    accessRole?: AccessRole | null;
  } = {},
) {
  return buildOperationalAlerts({
    financialTransactions: [],
    sales: [],
    vehicles: [],
    checklist: [],
    today: "2026-09-24",
    accessRole: "admin",
    ...input,
  });
}

test("identifica contas financeiras vencidas por status ou por data", () => {
  const alerts = alertsFor({
    financialTransactions: [
      transaction({ id: 1, status: "overdue" }),
      transaction({ id: 2, status: "pending", due_date: "2026-09-23" }),
      transaction({ id: 3, status: "pending", due_date: "2026-09-24" }),
      transaction({ id: 4, status: "paid", due_date: "2026-09-20" }),
      transaction({ id: 5, status: "canceled", due_date: "2026-09-20" }),
    ],
  });

  assert.deepEqual(alerts[0], {
    kind: "financial",
    severity: "critical",
    label: "2 contas vencidas no financeiro",
    count: 2,
    recordIds: [1, 2],
    href: "/financial/transactions?alert=overdue",
  });
});

test("identifica checklist urgente ou atrasado e ignora itens resolvidos", () => {
  const alerts = alertsFor({
    checklist: [
      checklistItem({ id: "urgent", priority: "urgent" }),
      checklistItem({ id: "late", due_date: "2026-09-23" }),
      checklistItem({ id: "today", due_date: "2026-09-24" }),
      checklistItem({ id: "done", status: "completed", priority: "urgent" }),
      checklistItem({ id: "cancelled", status: "cancelled", due_date: "2026-09-20" }),
    ],
  });

  assert.deepEqual(alerts[0], {
    kind: "checklist",
    severity: "critical",
    label: "2 tarefas urgentes ou atrasadas",
    count: 2,
    recordIds: ["urgent", "late"],
    href: "/vehicles?alert=checklist",
  });
});

test("agrupa venda pendente e preparação com itens ativos", () => {
  const alerts = alertsFor({
    sales: [sale(20, "pending"), sale(21, "completed"), sale(22, "canceled")],
    vehicles: [vehicle(10, "in_repair"), vehicle(11, "in_repair"), vehicle(12, "available")],
    checklist: [
      checklistItem({ id: "active", vehicle_id: 10 }),
      checklistItem({ id: "done", vehicle_id: 11, status: "completed" }),
    ],
  });

  assert.deepEqual(alerts, [
    {
      kind: "sale",
      severity: "attention",
      label: "1 venda pendente",
      count: 1,
      recordIds: [20],
      href: "/sales?status=pending",
    },
    {
      kind: "preparation",
      severity: "attention",
      label: "1 veículo em preparação",
      count: 1,
      recordIds: [10],
      href: "/vehicles?alert=preparation",
    },
  ]);
});

test("filtra grupos conforme o papel de acesso sem expor módulos restritos", () => {
  const input = {
    financialTransactions: [transaction({ id: 1, status: "overdue" })],
    sales: [sale(2, "pending")],
    vehicles: [vehicle(10, "in_repair")],
    checklist: [checklistItem({ id: "urgent", priority: "urgent" })],
  };

  assert.deepEqual(
    alertsFor({ ...input, accessRole: "financial" }).map((alert) => alert.kind),
    ["financial"],
  );
  assert.deepEqual(
    alertsFor({ ...input, accessRole: "seller" }).map((alert) => alert.kind),
    ["checklist", "sale", "preparation"],
  );
  assert.deepEqual(
    alertsFor({ ...input, accessRole: "manager" }).map((alert) => alert.kind),
    ["financial", "checklist", "sale", "preparation"],
  );
  assert.deepEqual(
    alertsFor({ ...input, accessRole: "admin" }).map((alert) => alert.kind),
    ["financial", "checklist", "sale", "preparation"],
  );
  assert.deepEqual(alertsFor({ ...input, accessRole: null }), []);
});

test("não cria alertas quando não existem condições operacionais", () => {
  assert.deepEqual(alertsFor(), []);
});
