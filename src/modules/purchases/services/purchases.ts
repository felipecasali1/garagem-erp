import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/shared/supabase/client";
import { normalizeCep, normalizeDocument, normalizePhone, normalizeUf } from "@/shared/lib/field-format";
import { getOrCreatePersonIdByDocument } from "@/shared/supabase/people";
import type { Address, Person, PersonType, Purchase, PurchaseStatus, Vehicle } from "@/shared/types/domain";

type SupplierType = "individual" | "company" | "dealership" | "auction" | "trade_in";

type PersonRow = {
  id: number;
  name: string;
  type: PersonType;
  cpf: string | null;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
};

type SupplierRow = {
  id: number;
  person_id: number;
  supplier_type: SupplierType;
  active: boolean;
  notes: string | null;
  person: PersonRow | null;
};

type VehicleRow = Omit<Vehicle, "accessories"> & {
  chassis: string | null;
  vin: string | null;
  version: string | null;
  image: string | null;
  notes: string | null;
};

type PurchaseRow = {
  id: number;
  supplier_id: number;
  vehicle_id: number;
  total_value: number;
  purchase_date: string;
  status: PurchaseStatus;
  notes: string | null;
  supplier: SupplierRow | null;
  vehicle: VehicleRow | null;
};

export type SupplierRecord = {
  id: number;
  person_id: number;
  supplier_type: SupplierType;
  active: boolean;
  person: Person;
};

export type CreateSupplierInput = {
  name: string;
  type: PersonType;
  document?: string;
  phone?: string;
  email?: string;
  primary_address?: Address;
};

export type CreatePurchaseInput = {
  supplierId: number;
  vehicleId: number;
  totalValue: number;
  purchaseDate: string;
  status: PurchaseStatus;
  notes?: string;
};

export const purchaseKeys = {
  all: ["purchases"] as const,
  detail: (id: number) => ["purchases", id] as const,
  suppliers: ["suppliers"] as const,
};

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mapPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    cpf: row.cpf ?? undefined,
    cnpj: row.cnpj ?? undefined,
    phone: row.phone ?? "",
    email: row.email ?? "",
    type: row.type,
  };
}

function mapSupplier(row: SupplierRow): SupplierRecord {
  if (!row.person) {
    throw new Error("Fornecedor sem registro de pessoa.");
  }

  return {
    id: row.id,
    person_id: row.person_id,
    supplier_type: row.supplier_type,
    active: row.active,
    person: mapPerson(row.person),
  };
}

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
    current_mileage: Number(row.current_mileage),
    manufacture_year: Number(row.manufacture_year),
    model_year: Number(row.model_year),
    cost_price: Number(row.cost_price),
    sale_price: Number(row.sale_price),
    published: row.published,
    status: row.status,
    image: row.image ?? undefined,
    notes: row.notes ?? undefined,
    accessories: [],
  };
}

function mapPurchase(row: PurchaseRow): Purchase {
  if (!row.supplier?.person || !row.vehicle) {
    throw new Error("Compra sem fornecedor ou veículo vinculado.");
  }

  return {
    id: row.id,
    supplier: mapPerson(row.supplier.person),
    vehicle: mapVehicle(row.vehicle),
    total_value: Number(row.total_value),
    purchase_date: row.purchase_date,
    status: row.status,
    notes: row.notes ?? undefined,
  };
}

export async function listSuppliers() {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, person_id, supplier_type, active, notes, person:people(id, name, type, cpf, cnpj, phone, email)")
    .eq("active", true)
    .order("id");

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as SupplierRow[]).map(mapSupplier);
}

export async function listPurchases() {
  const { data, error } = await supabase
    .from("purchases")
    .select("id, supplier_id, vehicle_id, total_value, purchase_date, status, notes, supplier:suppliers(id, person_id, supplier_type, active, notes, person:people(id, name, type, cpf, cnpj, phone, email)), vehicle:vehicles(*)")
    .order("purchase_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as PurchaseRow[]).map(mapPurchase);
}

export async function getPurchaseById(id: number) {
  const { data, error } = await supabase
    .from("purchases")
    .select("id, supplier_id, vehicle_id, total_value, purchase_date, status, notes, supplier:suppliers(id, person_id, supplier_type, active, notes, person:people(id, name, type, cpf, cnpj, phone, email)), vehicle:vehicles(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Compra não encontrada.");
  }

  return mapPurchase(data as unknown as PurchaseRow);
}

export async function createSupplier(input: CreateSupplierInput) {
  const personId = await getOrCreatePersonIdByDocument({
    name: input.name.trim(),
    type: input.type,
    document: input.document ? normalizeDocument(input.document, input.type) : "",
    phone: input.phone ?? "",
    email: input.email ?? "",
  });

  const { data: existingSupplier, error: existingSupplierError } = await supabase
    .from("suppliers")
    .select("id")
    .eq("person_id", personId)
    .maybeSingle();
  if (existingSupplierError) {
    throw new Error(existingSupplierError.message);
  }
  if (existingSupplier) {
    return existingSupplier.id as number;
  }

  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .insert({
      person_id: personId,
      supplier_type: input.type === "company" ? "company" : "individual",
      active: true,
    })
    .select("id")
    .single();
  if (supplierError) {
    throw new Error(supplierError.message);
  }

  if (input.primary_address && Object.values(input.primary_address).some(Boolean)) {
    const addressPayload = {
      person_id: personId,
      street: normalizeText(input.primary_address.street),
      number: normalizeText(input.primary_address.number),
      complement: normalizeText(input.primary_address.complement),
      neighborhood: normalizeText(input.primary_address.neighborhood),
      city: normalizeText(input.primary_address.city),
      state: normalizeText(normalizeUf(input.primary_address.state)),
      zip_code: normalizeText(normalizeCep(input.primary_address.zip_code)),
      is_primary: true,
    };
    const { data: existingAddress, error: existingAddressError } = await supabase
      .from("addresses")
      .select("id")
      .eq("person_id", personId)
      .eq("is_primary", true)
      .maybeSingle();
    if (existingAddressError) {
      throw new Error(existingAddressError.message);
    }

    const { error: addressError } = existingAddress
      ? await supabase.from("addresses").update(addressPayload).eq("id", existingAddress.id)
      : await supabase.from("addresses").insert(addressPayload);
    if (addressError) {
      throw new Error(addressError.message);
    }
  }

  return supplier.id as number;
}

const createPurchaseServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      supplierId: z.number().int().positive(),
      vehicleId: z.number().int().positive(),
      totalValue: z.number().nonnegative(),
      purchaseDate: z.string().min(1),
      status: z.enum(["pending", "completed", "canceled"]),
      notes: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("vehicles")
      .select("id, brand, model, plate, status")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (vehicleError) {
      throw new Error(vehicleError.message);
    }
    if (!vehicle) {
      throw new Error("Veículo não encontrado para registrar compra.");
    }
    if (vehicle.status !== "evaluating") {
      throw new Error("Apenas veículos em avaliação podem ser vinculados a uma nova compra.");
    }

    const { data: purchase, error: purchaseError } = await supabaseAdmin
      .from("purchases")
      .insert({
        supplier_id: data.supplierId,
        vehicle_id: data.vehicleId,
        total_value: data.totalValue,
        purchase_date: data.purchaseDate,
        status: data.status,
        notes: normalizeText(data.notes),
      })
      .select("id")
      .single();
    if (purchaseError) {
      throw new Error(purchaseError.message);
    }

    if (data.status === "completed") {
      const { data: checklistItems, error: checklistError } = await supabaseAdmin
        .from("vehicle_checklist_items")
        .select("id")
        .eq("vehicle_id", data.vehicleId)
        .not("status", "in", "(completed,cancelled)")
        .limit(1);
      if (checklistError) {
        throw new Error(checklistError.message);
      }

      const nextVehicleStatus = (checklistItems ?? []).length > 0 ? "in_repair" : "available";

      const { error: vehicleUpdateError } = await supabaseAdmin
        .from("vehicles")
        .update({
          cost_price: data.totalValue,
          status: nextVehicleStatus,
          published: false,
        })
        .eq("id", data.vehicleId);
      if (vehicleUpdateError) {
        throw new Error(vehicleUpdateError.message);
      }

      const { data: transaction, error: transactionError } = await supabaseAdmin
        .from("financial_transactions")
        .insert({
          type: "expense",
          category: "vehicle_purchase",
          status: "paid",
          amount: data.totalValue,
          transaction_date: data.purchaseDate,
          paid_at: new Date().toISOString(),
          description: `Compra #${purchase.id} - ${vehicle.brand} ${vehicle.model}`,
          related: vehicle.plate,
          purchase_id: purchase.id,
        })
        .select("id")
        .single();
      if (transactionError) {
        throw new Error(transactionError.message);
      }

      const { error: purchaseUpdateError } = await supabaseAdmin
        .from("purchases")
        .update({ financial_transaction_id: transaction.id })
        .eq("id", purchase.id);
      if (purchaseUpdateError) {
        throw new Error(purchaseUpdateError.message);
      }
    }

    return purchase.id as number;
  });

export async function createPurchase(input: CreatePurchaseInput) {
  return createPurchaseServer({ data: input });
}
