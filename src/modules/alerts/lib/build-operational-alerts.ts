import { canAccessPath } from "../../../shared/auth/access-control.js";
import type { OperationalAlert, OperationalAlertInput } from "../types.js";

type CandidateAlert = OperationalAlert & { path: string };

export function isBeforeOperationalDate(date: string | undefined, today: string) {
  return Boolean(date && date < today);
}

export function isActiveChecklistItem(
  status: OperationalAlertInput["checklist"][number]["status"],
) {
  return status !== "completed" && status !== "cancelled";
}

export function isFinancialAlertTransaction(
  transaction: OperationalAlertInput["financialTransactions"][number],
  today: string,
) {
  return (
    transaction.status === "overdue" ||
    (transaction.status === "pending" && isBeforeOperationalDate(transaction.due_date, today))
  );
}

export function isChecklistAlertItem(
  item: OperationalAlertInput["checklist"][number],
  today: string,
) {
  return (
    isActiveChecklistItem(item.status) &&
    (item.priority === "urgent" || isBeforeOperationalDate(item.due_date, today))
  );
}

export function hasActiveChecklistForVehicle(
  vehicleId: number,
  checklist: OperationalAlertInput["checklist"],
) {
  return checklist.some(
    (item) => item.vehicle_id === vehicleId && isActiveChecklistItem(item.status),
  );
}

function buildCandidateAlerts(input: OperationalAlertInput): CandidateAlert[] {
  const overdueFinancialIds = input.financialTransactions
    .filter((transaction) => isFinancialAlertTransaction(transaction, input.today))
    .map((transaction) => transaction.id);

  const criticalChecklistIds = input.checklist
    .filter((item) => isChecklistAlertItem(item, input.today))
    .map((item) => item.id);

  const pendingSaleIds = input.sales
    .filter((sale) => sale.status === "pending")
    .map((sale) => sale.id);

  const activeChecklistVehicleIds = new Set(
    input.checklist
      .filter((item) => isActiveChecklistItem(item.status))
      .map((item) => item.vehicle_id),
  );
  const preparationVehicleIds = input.vehicles
    .filter(
      (vehicle) => vehicle.status === "in_repair" && activeChecklistVehicleIds.has(vehicle.id),
    )
    .map((vehicle) => vehicle.id);

  const candidates: CandidateAlert[] = [];

  if (overdueFinancialIds.length > 0) {
    candidates.push({
      kind: "financial",
      severity: "critical",
      label: `${overdueFinancialIds.length} ${overdueFinancialIds.length === 1 ? "conta vencida" : "contas vencidas"} no financeiro`,
      count: overdueFinancialIds.length,
      recordIds: overdueFinancialIds,
      href: "/financial/transactions?alert=overdue",
      path: "/financial",
    });
  }

  if (criticalChecklistIds.length > 0) {
    candidates.push({
      kind: "checklist",
      severity: "critical",
      label: `${criticalChecklistIds.length} ${criticalChecklistIds.length === 1 ? "tarefa urgente ou atrasada" : "tarefas urgentes ou atrasadas"}`,
      count: criticalChecklistIds.length,
      recordIds: criticalChecklistIds,
      href: "/vehicles?alert=checklist",
      path: "/vehicles",
    });
  }

  if (pendingSaleIds.length > 0) {
    candidates.push({
      kind: "sale",
      severity: "attention",
      label: `${pendingSaleIds.length} ${pendingSaleIds.length === 1 ? "venda pendente" : "vendas pendentes"}`,
      count: pendingSaleIds.length,
      recordIds: pendingSaleIds,
      href: "/sales?status=pending",
      path: "/sales",
    });
  }

  if (preparationVehicleIds.length > 0) {
    candidates.push({
      kind: "preparation",
      severity: "attention",
      label: `${preparationVehicleIds.length} ${preparationVehicleIds.length === 1 ? "veículo em preparação" : "veículos em preparação"}`,
      count: preparationVehicleIds.length,
      recordIds: preparationVehicleIds,
      href: "/vehicles?alert=preparation",
      path: "/vehicles",
    });
  }

  return candidates;
}

export function buildOperationalAlerts(input: OperationalAlertInput): OperationalAlert[] {
  return buildCandidateAlerts(input)
    .filter((alert) => canAccessPath(input.accessRole, alert.path))
    .map(({ path: _path, ...alert }) => alert);
}
