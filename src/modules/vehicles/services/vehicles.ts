import { supabase } from "@/shared/supabase/client";
import type { Vehicle } from "@/shared/types/domain";
import type { ChecklistItem } from "@/modules/checklist/types";
import type { VehicleDraft } from "@/modules/vehicles/types";
import { normalizeVehicleDraft } from "@/modules/vehicles/lib/normalize-vehicle-draft";

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
  image: string | null;
  notes: string | null;
  vehicle_accessories?: Array<{
    active?: boolean;
    accessories: {
      name: string;
    } | null;
  }>;
};

export const vehicleKeys = {
  all: ["vehicles"] as const,
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

function isSaleManagedStatus(status: Vehicle["status"]) {
  return status === "reserved" || status === "sold";
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

function isMissingVehicleAccessoryActiveColumn(error: { message: string } | null) {
  return Boolean(
    error?.message.includes("vehicle_accessories") && error.message.includes("active"),
  );
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
  } satisfies Partial<ChecklistItem>;
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

  const { error: insertError } = await supabase
    .from("vehicle_checklist_items")
    .insert(checklist.map((item) => toChecklistPayload(item, vehicleId)));
  if (insertError) {
    throw new Error(insertError.message);
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

export async function getVehicleById(id: number) {
  const result = await supabase
    .from("vehicles")
    .select("*, vehicle_accessories(active, accessories(name))")
    .eq("id", id)
    .single();
  const data = isMissingVehicleAccessoryActiveColumn(result.error)
    ? await unwrapSingle(
        supabase
          .from("vehicles")
          .select("*, vehicle_accessories(accessories(name))")
          .eq("id", id)
          .single(),
      )
    : await unwrapSingle(Promise.resolve(result));
  return mapVehicle(data satisfies VehicleRow);
}

export async function createVehicle(draft: VehicleDraft) {
  const payload = {
    ...toVehiclePayload(draft),
    status: "evaluating" as const,
    published: false,
  };

  const data = await unwrapSingle(
    supabase.from("vehicles").insert(payload).select("id").single(),
  );
  await syncVehicleAccessories(data.id, draft.accessories);
  await createVehicleChecklist(data.id, draft.checklist);
  return getVehicleById(data.id);
}

export async function updateVehicle(id: number, draft: VehicleDraft) {
  const currentVehicle = await getVehicleById(id);
  const payload = {
    ...toVehiclePayload(draft),
    status: currentVehicle.status,
    published: currentVehicle.status === "available" ? draft.published : false,
  };

  await unwrapSingle(
    supabase.from("vehicles").update(payload).eq("id", id).select("id").single(),
  );
  await syncVehicleAccessories(id, draft.accessories);
  return getVehicleById(id);
}

export async function archiveVehicle(id: number) {
  const currentVehicle = await getVehicleById(id);
  if (isSaleManagedStatus(currentVehicle.status)) {
    throw new Error("Veículos reservados ou vendidos não devem ser arquivados manualmente.");
  }

  await unwrapSingle(
    supabase
      .from("vehicles")
      .update({ published: false, status: "archived" })
      .eq("id", id)
      .select("id")
      .single(),
  );
  return getVehicleById(id);
}

export async function setVehiclePublished(id: number, published: boolean) {
  if (published) {
    const vehicle = await getVehicleById(id);
    if (vehicle.status !== "available") {
      throw new Error("Apenas veículos disponíveis podem ser publicados.");
    }
  }

  await unwrapSingle(
    supabase.from("vehicles").update({ published }).eq("id", id).select("id").single(),
  );
  return getVehicleById(id);
}

export async function finishVehiclePreparation(id: number) {
  const vehicle = await getVehicleById(id);
  if (vehicle.status !== "in_repair") {
    throw new Error("Apenas veículos em preparação podem ser finalizados.");
  }

  const { data: pendingItems, error: checklistError } = await supabase
    .from("vehicle_checklist_items")
    .select("id")
    .eq("vehicle_id", id)
    .not("status", "in", "(completed,cancelled)")
    .limit(1);
  if (checklistError) {
    throw new Error(checklistError.message);
  }

  if ((pendingItems ?? []).length > 0) {
    throw new Error("Conclua ou cancele os itens pendentes antes de finalizar a preparação.");
  }

  await unwrapSingle(
    supabase
      .from("vehicles")
      .update({ status: "available", published: false })
      .eq("id", id)
      .select("id")
      .single(),
  );

  return getVehicleById(id);
}
