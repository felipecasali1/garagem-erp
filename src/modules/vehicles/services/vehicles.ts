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
  image: string | null;
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
    image: row.image ?? undefined,
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

function toChecklistPayload(item: VehicleDraft["checklist"][number], vehicleId: number) {
  return {
    vehicle_id: vehicleId,
    title: item.title.trim(),
    category: item.category,
    status: "pending" as const,
    priority: item.priority,
    estimated_cost: item.estimated_cost,
    actual_cost: 0,
    due_date: item.due_date ?? null,
    attachments: [],
  };
}

async function syncVehicleAccessories(vehicleId: number, accessories: string[]) {
  const normalized = [...new Set(accessories.map((name) => name.trim()).filter(Boolean))];

  const { error: deactivateError } = await supabase
    .from("vehicle_accessories")
    .update({ active: false })
    .eq("vehicle_id", vehicleId);
  if (deactivateError) {
    throw new Error(deactivateError.message);
  }

  if (normalized.length === 0) {
    return;
  }

  const { data: existingAccessories, error: existingError } = await supabase
    .from("accessories")
    .select("id, name")
    .in("name", normalized);
  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingByName = new Map(existingAccessories.map((item) => [item.name, item.id]));
  const missingNames = normalized.filter((name) => !existingByName.has(name));

  if (missingNames.length > 0) {
    const { data: insertedAccessories, error: insertAccessoriesError } = await supabase
      .from("accessories")
      .insert(missingNames.map((name) => ({ name })))
      .select("id, name");
    if (insertAccessoriesError) {
      throw new Error(insertAccessoriesError.message);
    }

    for (const accessory of insertedAccessories) {
      existingByName.set(accessory.name, accessory.id);
    }
  }

  const desiredAccessoryIds = normalized
    .map((name) => existingByName.get(name))
    .filter((id): id is number => typeof id === "number");

  const { data: existingLinks, error: existingLinksError } = await supabase
    .from("vehicle_accessories")
    .select("id, accessory_id")
    .eq("vehicle_id", vehicleId)
    .in("accessory_id", desiredAccessoryIds);
  if (existingLinksError) {
    throw new Error(existingLinksError.message);
  }

  const existingLinkIds = new Set(existingLinks.map((entry) => entry.accessory_id));
  const linksToCreate = desiredAccessoryIds
    .filter((accessoryId) => !existingLinkIds.has(accessoryId))
    .map((accessoryId) => ({
      vehicle_id: vehicleId,
      accessory_id: accessoryId,
      active: true,
    }));

  const idsToReactivate = existingLinks.map((entry) => entry.id);
  if (idsToReactivate.length > 0) {
    const { error: reactivateError } = await supabase
      .from("vehicle_accessories")
      .update({ active: true })
      .in("id", idsToReactivate);
    if (reactivateError) {
      throw new Error(reactivateError.message);
    }
  }

  if (linksToCreate.length > 0) {
    const { error: linkError } = await supabase.from("vehicle_accessories").insert(linksToCreate);
    if (linkError) {
      throw new Error(linkError.message);
    }
  }
}

async function createVehicleChecklist(vehicleId: number, checklist: VehicleDraft["checklist"]) {
  if (checklist.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("vehicle_checklist_items")
    .insert(checklist.map((item) => toChecklistPayload(item, vehicleId)));
  if (error) {
    throw new Error(error.message);
  }
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

export async function createVehicle(draft: VehicleDraft) {
  const payload = {
    ...toVehiclePayload(draft),
    status: "evaluating" as const,
    published: false,
  };

  const data = await unwrapSingle<{ id: number }>(
    supabase.from("vehicles").insert(payload).select("id").single(),
  );
  await syncVehicleAccessories(data.id, draft.accessories);
  await createVehicleChecklist(data.id, draft.checklist);
  return getVehicleById(data.id);
}

export async function updateVehicle(id: number, draft: VehicleDraft, expectedUpdatedAt: string) {
  const { status: _status, ...changes } = toVehiclePayload(draft);
  await unwrapVehicleRpc(
    supabase.rpc("update_vehicle_with_version", {
      p_vehicle_id: id,
      p_expected_updated_at: expectedUpdatedAt,
      p_changes: changes,
    }),
    id,
  );
  await syncVehicleAccessories(id, draft.accessories);
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
