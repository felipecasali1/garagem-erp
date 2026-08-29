import { supabase } from "@/shared/supabase/client";

export type AccessoryRecord = {
  id: number;
  name: string;
  description?: string;
  active: boolean;
};

type AccessoryRow = {
  id: number;
  name: string;
  description: string | null;
  active: boolean;
};

export const accessoryKeys = {
  all: ["accessories"] as const,
  active: ["accessories", "active"] as const,
};

function mapAccessory(row: AccessoryRow): AccessoryRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    active: row.active,
  };
}

export async function listAccessories() {
  const { data, error } = await supabase.from("accessories").select("*").order("name");
  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as AccessoryRow[]).map(mapAccessory);
}

export async function listActiveAccessories() {
  return (await listAccessories()).filter((accessory) => accessory.active);
}

export async function createAccessory(name: string) {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error("Informe o nome do acessório.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("accessories")
    .select("*")
    .ilike("name", normalizedName)
    .maybeSingle();
  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existing) {
    const { data, error } = await supabase
      .from("accessories")
      .update({ active: true, name: normalizedName })
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) {
      throw new Error(error.message);
    }
    return mapAccessory(data as AccessoryRow);
  }

  const { data, error } = await supabase
    .from("accessories")
    .insert({ name: normalizedName, active: true })
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }

  return mapAccessory(data as AccessoryRow);
}

export async function setAccessoryActive(id: number, active: boolean) {
  const { data, error } = await supabase
    .from("accessories")
    .update({ active })
    .eq("id", id)
    .select("*")
    .single();
  if (error) {
    throw new Error(error.message);
  }

  return mapAccessory(data as AccessoryRow);
}
