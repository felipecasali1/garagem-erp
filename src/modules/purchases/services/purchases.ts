import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/shared/supabase/client";
import type { Person, PersonType, Purchase, PurchaseStatus, Vehicle } from "@/shared/types/domain";
import type { SupplierType } from "@/modules/suppliers/services/suppliers";

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
  financial_transaction_id: number | null;
  total_value: number;
  purchase_date: string;
  status: PurchaseStatus;
  notes: string | null;
  supplier: SupplierRow | null;
  vehicle: VehicleRow | null;
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
    supplier_id: row.supplier_id,
    supplier: mapPerson(row.supplier.person),
    vehicle: mapVehicle(row.vehicle),
    financial_transaction_id: row.financial_transaction_id ?? undefined,
    total_value: Number(row.total_value),
    purchase_date: row.purchase_date,
    status: row.status,
    notes: row.notes ?? undefined,
  };
}

export async function listPurchases() {
  const { data, error } = await supabase
    .from("purchases")
    .select("id, supplier_id, vehicle_id, financial_transaction_id, total_value, purchase_date, status, notes, supplier:suppliers(id, person_id, supplier_type, active, notes, person:people(id, name, type, cpf, cnpj, phone, email)), vehicle:vehicles(*)")
    .order("purchase_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as PurchaseRow[]).map(mapPurchase);
}

export async function getPurchaseById(id: number) {
  const { data, error } = await supabase
    .from("purchases")
    .select("id, supplier_id, vehicle_id, financial_transaction_id, total_value, purchase_date, status, notes, supplier:suppliers(id, person_id, supplier_type, active, notes, person:people(id, name, type, cpf, cnpj, phone, email)), vehicle:vehicles(*)")
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
      await applyCompletedPurchase({
        supabaseAdmin,
        purchaseId: purchase.id as number,
        vehicle,
        vehicleId: data.vehicleId,
        totalValue: data.totalValue,
        purchaseDate: data.purchaseDate,
        financialTransactionId: null,
      });
    }

    return purchase.id as number;
  });

export async function createPurchase(input: CreatePurchaseInput) {
  return createPurchaseServer({ data: input });
}

type PurchaseActionInput = {
  purchaseId: number;
};

type SupabaseAdminClient = Awaited<
  typeof import("@/shared/supabase/server")
>["supabaseAdmin"];

async function applyCompletedPurchase({
  supabaseAdmin,
  purchaseId,
  vehicle,
  vehicleId,
  totalValue,
  purchaseDate,
  financialTransactionId,
}: {
  supabaseAdmin: SupabaseAdminClient;
  purchaseId: number;
  vehicle: { brand: string; model: string; plate: string | null };
  vehicleId: number;
  totalValue: number;
  purchaseDate: string;
  financialTransactionId: number | null;
}) {
  const { data: checklistItems, error: checklistError } = await supabaseAdmin
    .from("vehicle_checklist_items")
    .select("id")
    .eq("vehicle_id", vehicleId)
    .not("status", "in", "(completed,cancelled)")
    .limit(1);
  if (checklistError) {
    throw new Error(checklistError.message);
  }

  const nextVehicleStatus = (checklistItems ?? []).length > 0 ? "in_repair" : "available";

  const { error: vehicleUpdateError } = await supabaseAdmin
    .from("vehicles")
    .update({
      cost_price: totalValue,
      status: nextVehicleStatus,
      published: false,
    })
    .eq("id", vehicleId);
  if (vehicleUpdateError) {
    throw new Error(vehicleUpdateError.message);
  }

  let nextFinancialTransactionId = financialTransactionId;
  if (!nextFinancialTransactionId) {
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from("financial_transactions")
      .insert({
        type: "expense",
        category: "vehicle_purchase",
        status: "paid",
        amount: totalValue,
        transaction_date: purchaseDate,
        paid_at: new Date().toISOString(),
        description: `Compra #${purchaseId} - ${vehicle.brand} ${vehicle.model}`,
        related: vehicle.plate,
        purchase_id: purchaseId,
      })
      .select("id")
      .single();
    if (transactionError) {
      throw new Error(transactionError.message);
    }
    nextFinancialTransactionId = transaction.id as number;
  }

  const { error: purchaseUpdateError } = await supabaseAdmin
    .from("purchases")
    .update({
      status: "completed",
      financial_transaction_id: nextFinancialTransactionId,
    })
    .eq("id", purchaseId);
  if (purchaseUpdateError) {
    throw new Error(purchaseUpdateError.message);
  }
}

const completePurchaseServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      purchaseId: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const { data: purchase, error: purchaseError } = await supabaseAdmin
      .from("purchases")
      .select("id, vehicle_id, total_value, purchase_date, status, financial_transaction_id")
      .eq("id", data.purchaseId)
      .maybeSingle();
    if (purchaseError) {
      throw new Error(purchaseError.message);
    }
    if (!purchase) {
      throw new Error("Compra não encontrada.");
    }
    if (purchase.status !== "pending") {
      throw new Error("Apenas compras pendentes podem ser concluídas.");
    }

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("vehicles")
      .select("id, brand, model, plate")
      .eq("id", purchase.vehicle_id)
      .maybeSingle();
    if (vehicleError) {
      throw new Error(vehicleError.message);
    }
    if (!vehicle) {
      throw new Error("Veículo da compra não encontrado.");
    }

    await applyCompletedPurchase({
      supabaseAdmin,
      purchaseId: purchase.id as number,
      vehicle,
      vehicleId: purchase.vehicle_id as number,
      totalValue: Number(purchase.total_value),
      purchaseDate: String(purchase.purchase_date),
      financialTransactionId: (purchase.financial_transaction_id as number | null) ?? null,
    });

    return purchase.id as number;
  });

const cancelPurchaseServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      purchaseId: z.number().int().positive(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const { data: purchase, error: purchaseError } = await supabaseAdmin
      .from("purchases")
      .select("id, vehicle_id, status")
      .eq("id", data.purchaseId)
      .maybeSingle();
    if (purchaseError) {
      throw new Error(purchaseError.message);
    }
    if (!purchase) {
      throw new Error("Compra não encontrada.");
    }
    if (purchase.status !== "pending") {
      throw new Error("Apenas compras pendentes podem ser canceladas.");
    }

    const { error: purchaseUpdateError } = await supabaseAdmin
      .from("purchases")
      .update({ status: "canceled" })
      .eq("id", purchase.id);
    if (purchaseUpdateError) {
      throw new Error(purchaseUpdateError.message);
    }

    const { error: vehicleUpdateError } = await supabaseAdmin
      .from("vehicles")
      .update({ status: "evaluating", published: false })
      .eq("id", purchase.vehicle_id);
    if (vehicleUpdateError) {
      throw new Error(vehicleUpdateError.message);
    }

    return purchase.id as number;
  });

export async function completePurchase(input: PurchaseActionInput) {
  return completePurchaseServer({ data: input });
}

export async function cancelPurchase(input: PurchaseActionInput) {
  return cancelPurchaseServer({ data: input });
}
