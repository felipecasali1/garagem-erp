import { supabase } from "@/shared/supabase/client";
import type { Person, PersonType, Purchase, PurchaseStatus, Vehicle } from "@/shared/types/domain";
import type { SupplierType } from "@/modules/suppliers/services/suppliers";
import { getPageBounds, type PaginatedResult } from "@/shared/lib/pagination";

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
  updated_at: string;
  supplier: SupplierRow | null;
  vehicle: VehicleRow | null;
};

const purchaseSelect =
  "id, supplier_id, vehicle_id, financial_transaction_id, total_value, purchase_date, status, notes, updated_at, supplier:suppliers(id, person_id, supplier_type, active, notes, person:people(id, name, type, cpf, cnpj, phone, email)), vehicle:vehicles(*)";

export type CreatePurchaseInput = {
  idempotencyKey: string;
  supplierId: number;
  vehicleId: number;
  expectedVehicleUpdatedAt: string;
  totalValue: number;
  purchaseDate: string;
  status: PurchaseStatus;
  notes?: string;
};

export type UpdatePurchaseInput = {
  idempotencyKey: string;
  purchaseId: number;
  expectedUpdatedAt: string;
  supplierId: number;
  totalValue: number;
  purchaseDate: string;
  notes?: string;
};

export type PurchaseTransitionInput = {
  idempotencyKey: string;
  purchaseId: number;
  expectedUpdatedAt: string;
};

export const purchaseKeys = {
  all: ["purchases"] as const,
  list: (page: number) => ["purchases", "list", { page }] as const,
  byVehicle: (vehicleId: number) => ["purchases", "vehicle", vehicleId] as const,
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
    updated_at: row.updated_at,
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
    updated_at: row.updated_at,
  };
}

export async function listPurchases() {
  return queryPurchases();
}

export async function listPurchasesPage(pageInput: number): Promise<PaginatedResult<Purchase>> {
  const { page, pageSize, from, to } = getPageBounds(pageInput);
  const { data, error, count } = await supabase
    .from("purchases")
    .select(purchaseSelect, { count: "exact" })
    .order("purchase_date", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error(error.message);
  }

  return {
    data: ((data ?? []) as unknown as PurchaseRow[]).map(mapPurchase),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function listPurchasesByVehicle(vehicleId: number) {
  return queryPurchases(vehicleId);
}

async function queryPurchases(vehicleId?: number) {
  let query = supabase
    .from("purchases")
    .select(purchaseSelect)
    .order("purchase_date", { ascending: false })
    .order("id", { ascending: false });

  if (vehicleId != null) {
    query = query.eq("vehicle_id", vehicleId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as PurchaseRow[]).map(mapPurchase);
}

export async function getPurchaseById(id: number) {
  const { data, error } = await supabase
    .from("purchases")
    .select(purchaseSelect)
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

export async function createPurchase(input: CreatePurchaseInput) {
  const { data, error } = await supabase.rpc("create_purchase_atomically", {
    p_idempotency_key: input.idempotencyKey,
    p_supplier_id: input.supplierId,
    p_vehicle_id: input.vehicleId,
    p_expected_vehicle_updated_at: input.expectedVehicleUpdatedAt,
    p_total_value: input.totalValue,
    p_purchase_date: input.purchaseDate,
    p_status: input.status,
    p_notes: normalizeText(input.notes),
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export async function updatePurchase(input: UpdatePurchaseInput) {
  const { data, error } = await supabase.rpc("update_purchase_with_version", {
    p_idempotency_key: input.idempotencyKey,
    p_purchase_id: input.purchaseId,
    p_expected_updated_at: input.expectedUpdatedAt,
    p_supplier_id: input.supplierId,
    p_total_value: input.totalValue,
    p_purchase_date: input.purchaseDate,
    p_notes: normalizeText(input.notes),
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

async function transitionPurchase(input: PurchaseTransitionInput, action: "complete" | "cancel") {
  const { data, error } = await supabase.rpc("transition_purchase", {
    p_idempotency_key: input.idempotencyKey,
    p_purchase_id: input.purchaseId,
    p_action: action,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export async function completePurchase(input: PurchaseTransitionInput) {
  return transitionPurchase(input, "complete");
}

export async function cancelPurchase(input: PurchaseTransitionInput) {
  return transitionPurchase(input, "cancel");
}
