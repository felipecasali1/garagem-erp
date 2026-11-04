import { supabase } from "@/shared/supabase/client";
import type { Vehicle } from "@/shared/types/domain";
import type { VehicleDraft } from "@/modules/vehicles/types";
import { normalizeVehicleDraft } from "@/modules/vehicles/lib/normalize-vehicle-draft";
import { currentOperationalDate } from "@/modules/alerts/lib/current-operational-date";
import { DEFAULT_PAGE_SIZE, normalizePage, type PaginatedResult } from "@/shared/lib/pagination";
import { StaleRecordError } from "@/shared/lib/stale-record";

type VehicleRow = {
  id: number;
  plate: string;
  chassis: string | null;
  vin: string | null;
  brand: string;
  model: string;
  version: string | null;
  color: string;
  fuel_type: Vehicle["fuel_type"];
  transmission: Vehicle["transmission"];
  current_mileage: number;
  manufacture_year: number;
  model_year: number;
  cost_price: number;
  sale_price: number;
  published: boolean;
  status: Vehicle["status"];
  updated_at: string;
  notes: string | null;
  vehicle_accessories?: Array<{
    active?: boolean;
    accessories: {
      name: string;
    } | null;
  }>;
};

export type VehicleListFilters = {
  page: number;
  search?: string;
  status?: Vehicle["status"];
  alert?: "checklist" | "preparation";
  today?: string;
};

export type VehicleStatusCounts = Record<Vehicle["status"], number>;

export const vehicleStatuses: Vehicle["status"][] = [
  "evaluating",
  "in_repair",
  "available",
  "reserved",
  "sold",
  "archived",
];

export const vehicleKeys = {
  all: ["vehicles"] as const,
  list: (filters: VehicleListFilters) => ["vehicles", "list", filters] as const,
  statusCounts: ["vehicles", "status-counts"] as const,
  detail: (id: number) => ["vehicles", id] as const,
};

function mapVehicle(row: VehicleRow): Vehicle {
  return {
    id: row.id,
    plate: row.plate,
    chassis: row.chassis ?? undefined,
    vin: row.vin ?? undefined,
    brand: row.brand,
    model: row.model,
    version: row.version ?? undefined,
    color: row.color,
    fuel_type: row.fuel_type,
    transmission: row.transmission,
    current_mileage: row.current_mileage,
    manufacture_year: row.manufacture_year,
    model_year: row.model_year,
    cost_price: Number(row.cost_price),
    sale_price: Number(row.sale_price),
    published: row.published,
    status: row.status,
    updated_at: row.updated_at,
    notes: row.notes ?? undefined,
    accessories:
      row.vehicle_accessories
        ?.filter((entry) => entry.active !== false)
        .map((entry) => entry.accessories?.name)
        .filter((name): name is string => Boolean(name)) ?? [],
  };
}

function toVehiclePayload(draft: VehicleDraft) {
  return normalizeVehicleDraft(draft);
}

async function unwrapSingle<T>(
  response: PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T> {
  const { data, error } = await response;
  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Registro nao encontrado.");
  }
  return data as T;
}

async function unwrapVehicleRpc(
  response: PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>,
  vehicleId: number,
) {
  const { data, error } = await response;
  if (error) {
    if (error.message.includes("STALE_RECORD:")) {
      let current: Vehicle | null = null;
      try {
        current = await getVehicleById(vehicleId);
      } catch {
        // The stale record may have been removed after the failed write.
      }
      throw new StaleRecordError(
        "Outra pessoa alterou este veículo enquanto você o editava. Compare os dados atuais com o seu rascunho antes de escolher como continuar.",
        current,
      );
    }
    if (error.message.includes("VEHICLE_HAS_OPEN_PREPARATION:")) {
      throw new Error("Conclua ou cancele as tarefas pendentes antes de disponibilizar o veículo.");
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error("Veículo não encontrado.");
  return getVehicleById(vehicleId);
}

function isMissingVehicleAccessoryActiveColumn(error: { message: string } | null) {
  return Boolean(
    error?.message.includes("vehicle_accessories") && error.message.includes("active"),
  );
}

function escapePostgrestSearch(value: string) {
  return value.trim().replace(/[\\%_(),]/g, "\\$&");
}

function applyVehicleListFilters<
  T extends {
    eq: (column: string, value: unknown) => T;
    or: (filters: string) => T;
  },
>(query: T, filters: VehicleListFilters) {
  let nextQuery = query;
  if (filters.status) {
    nextQuery = nextQuery.eq("status", filters.status);
  }
  if (filters.search?.trim()) {
    const search = escapePostgrestSearch(filters.search);
    nextQuery = nextQuery.or(
      `plate.ilike.*${search}*,brand.ilike.*${search}*,model.ilike.*${search}*`,
    );
  }
  return nextQuery;
}

function toChecklistPayload(item: VehicleDraft["checklist"][number]) {
  return {
    title: item.title.trim(),
    description: null,
    category: item.category,
    priority: item.priority,
    estimated_cost: item.estimated_cost,
    due_date: item.due_date ?? null,
    notes: null,
  };
}

export async function listVehicles() {
  const { data, error } = await supabase
    .from("vehicles")
    .select("*, vehicle_accessories(active, accessories(name))")
    .order("id");
  if (isMissingVehicleAccessoryActiveColumn(error)) {
    const fallback = await supabase
      .from("vehicles")
      .select("*, vehicle_accessories(accessories(name))")
      .order("id");
    if (fallback.error) {
      throw new Error(fallback.error.message);
    }
    return (fallback.data satisfies VehicleRow[]).map(mapVehicle);
  }
  if (error) {
    throw new Error(error.message);
  }
  return (data satisfies VehicleRow[]).map(mapVehicle);
}

export async function listVehiclesPage(
  filters: VehicleListFilters,
): Promise<PaginatedResult<Vehicle>> {
  const page = normalizePage(filters.page);
  const pageSize = DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const today = filters.today ?? currentOperationalDate();
  const checklistSelection = filters.alert
    ? ", vehicle_checklist_items!inner(id, status, priority, due_date)"
    : "";
  const applyAlertFilters = <
    T extends {
      eq: (column: string, value: unknown) => T;
      not: (column: string, operator: string, value: string) => T;
      or: (filters: string, options?: { foreignTable?: string }) => T;
    },
  >(
    query: T,
  ) => {
    let nextQuery = query;
    if (!filters.alert) return nextQuery;

    nextQuery = nextQuery.not("vehicle_checklist_items.status", "in", "(completed,cancelled)");
    if (filters.alert === "preparation") {
      nextQuery = nextQuery.eq("status", "in_repair");
    } else {
      nextQuery = nextQuery.or(`priority.eq.urgent,due_date.lt.${today}`, {
        foreignTable: "vehicle_checklist_items",
      });
    }
    return nextQuery;
  };

  const buildPageQuery = (includeAccessoryActive: boolean) => {
    const accessorySelection = includeAccessoryActive
      ? "vehicle_accessories(active, accessories(name))"
      : "vehicle_accessories(accessories(name))";
    let query = supabase
      .from("vehicles")
      .select(`*, ${accessorySelection}${checklistSelection}`, { count: "exact" });
    query = applyVehicleListFilters(query, filters);
    query = applyAlertFilters(query);
    return query.order("id").range(from, to);
  };

  let result = await buildPageQuery(true);

  if (isMissingVehicleAccessoryActiveColumn(result.error)) {
    result = await buildPageQuery(false);
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  return {
    data: ((result.data as unknown as VehicleRow[] | null | undefined) ?? []).map(mapVehicle),
    total: result.count ?? 0,
    page,
    pageSize,
  };
}

export async function countVehiclesByStatus(): Promise<VehicleStatusCounts> {
  const counts = await Promise.all(
    vehicleStatuses.map(async (status) => {
      const { count, error } = await supabase
        .from("vehicles")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) {
        throw new Error(error.message);
      }
      return [status, count ?? 0] as const;
    }),
  );

  return Object.fromEntries(counts) as VehicleStatusCounts;
}

export async function getVehicleById(id: number) {
  const result = await supabase
    .from("vehicles")
    .select("*, vehicle_accessories(active, accessories(name))")
    .eq("id", id)
    .single();
  const data = isMissingVehicleAccessoryActiveColumn(result.error)
    ? await unwrapSingle<VehicleRow>(
        supabase
          .from("vehicles")
          .select("*, vehicle_accessories(accessories(name))")
          .eq("id", id)
          .single(),
      )
    : await unwrapSingle<VehicleRow>(Promise.resolve(result));
  return mapVehicle(data);
}

export async function createVehicle(draft: VehicleDraft, idempotencyKey: string) {
  const { status: _status, published: _published, ...vehicle } = toVehiclePayload(draft);
  const vehicleId = await unwrapSingle<number>(
    supabase.rpc("create_vehicle_configuration", {
      p_idempotency_key: idempotencyKey,
      p_vehicle: vehicle,
      p_accessories: draft.accessories,
      p_checklist_items: draft.checklist.map(toChecklistPayload),
    }),
  );
  return getVehicleById(vehicleId);
}

export async function updateVehicle(
  id: number,
  draft: VehicleDraft,
  expectedUpdatedAt: string,
  idempotencyKey: string,
) {
  const { status: _status, ...changes } = toVehiclePayload(draft);
  await unwrapVehicleRpc(
    supabase.rpc("update_vehicle_configuration", {
      p_idempotency_key: idempotencyKey,
      p_vehicle_id: id,
      p_expected_updated_at: expectedUpdatedAt,
      p_changes: changes,
      p_accessories: draft.accessories,
    }),
    id,
  );
  return getVehicleById(id);
}

export async function archiveVehicle(id: number, expectedUpdatedAt: string) {
  return unwrapVehicleRpc(
    supabase.rpc("archive_vehicle_with_version", {
      p_vehicle_id: id,
      p_expected_updated_at: expectedUpdatedAt,
    }),
    id,
  );
}

export async function setVehiclePublished(
  id: number,
  published: boolean,
  expectedUpdatedAt: string,
) {
  return unwrapVehicleRpc(
    supabase.rpc("set_vehicle_published_with_version", {
      p_vehicle_id: id,
      p_expected_updated_at: expectedUpdatedAt,
      p_published: published,
    }),
    id,
  );
}

export async function finishVehiclePreparation(id: number, expectedUpdatedAt: string) {
  return unwrapVehicleRpc(
    supabase.rpc("finish_vehicle_preparation", {
      p_vehicle_id: id,
      p_expected_updated_at: expectedUpdatedAt,
    }),
    id,
  );
}
