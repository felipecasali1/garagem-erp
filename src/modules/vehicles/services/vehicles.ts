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
        ?.map((entry) => entry.accessories?.name)
        .filter((name): name is string => Boolean(name)) ?? [],
  };
}

function toVehiclePayload(draft: VehicleDraft) {
  return normalizeVehicleDraft(draft);
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

  const { error: deleteError } = await supabase
    .from("vehicle_accessories")
    .delete()
    .eq("vehicle_id", vehicleId);
  if (deleteError) {
    throw new Error(deleteError.message);
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

  const links = normalized
    .map((name) => existingByName.get(name))
    .filter((id): id is number => typeof id === "number")
    .map((accessoryId) => ({
      vehicle_id: vehicleId,
      accessory_id: accessoryId,
    }));

  const { error: linkError } = await supabase.from("vehicle_accessories").insert(links);
  if (linkError) {
    throw new Error(linkError.message);
  }
}

async function replaceVehicleChecklist(vehicleId: number, checklist: VehicleDraft["checklist"]) {
  const { error: deleteError } = await supabase
    .from("vehicle_checklist_items")
    .delete()
    .eq("vehicle_id", vehicleId);
  if (deleteError) {
    throw new Error(deleteError.message);
  }

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
    .select("*, vehicle_accessories(accessories(name))")
    .order("id");
  if (error) {
    throw new Error(error.message);
  }
  return (data satisfies VehicleRow[]).map(mapVehicle);
}

export async function getVehicleById(id: number) {
  const data = await unwrapSingle(
    supabase
      .from("vehicles")
      .select("*, vehicle_accessories(accessories(name))")
      .eq("id", id)
      .single(),
  );
  return mapVehicle(data satisfies VehicleRow);
}

export async function createVehicle(draft: VehicleDraft) {
  const data = await unwrapSingle(
    supabase.from("vehicles").insert(toVehiclePayload(draft)).select("id").single(),
  );
  await syncVehicleAccessories(data.id, draft.accessories);
  await replaceVehicleChecklist(data.id, draft.checklist);
  return getVehicleById(data.id);
}

export async function updateVehicle(id: number, draft: VehicleDraft) {
  await unwrapSingle(
    supabase.from("vehicles").update(toVehiclePayload(draft)).eq("id", id).select("id").single(),
  );
  await syncVehicleAccessories(id, draft.accessories);
  await replaceVehicleChecklist(id, draft.checklist);
  return getVehicleById(id);
}

export async function deleteVehicle(id: number) {
  const { error } = await supabase.from("vehicles").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}

export async function setVehiclePublished(id: number, published: boolean) {
  await unwrapSingle(
    supabase.from("vehicles").update({ published }).eq("id", id).select("id").single(),
  );
  return getVehicleById(id);
}
