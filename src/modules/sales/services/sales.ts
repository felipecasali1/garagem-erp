import { z } from "zod";
import { supabase } from "@/shared/supabase/client";
import type {
  Commission,
  CommissionType,
  Customer,
  Employee,
  PaymentMethod,
  PaymentStatus,
  PersonType,
  Sale,
  SaleStatus,
  Vehicle,
} from "@/shared/types/domain";
import { buildSaleSearchFilter } from "@/modules/sales/lib/build-sale-search-filter";
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

type CustomerRow = {
  id: number;
  person_id: number;
  notes: string | null;
  active: boolean;
  total_purchases: number;
  created_at: string;
  person: PersonRow | null;
};

type EmployeeRow = {
  id: number;
  person_id: number;
  position: string;
  salary: number;
  commission_rate: number;
  commission_type: CommissionType;
  active: boolean;
  hired_at: string;
  notes: string | null;
  person: PersonRow | null;
};

type VehicleRow = Omit<Vehicle, "accessories"> & {
  chassis: string | null;
  vin: string | null;
  version: string | null;
  notes: string | null;
};

type PaymentRow = {
  id: number;
  updated_at: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  down_payment: number;
  installments_count: number;
  payment_date: string | null;
  remaining_amount: number;
};

type CommissionRow = {
  id: number;
  sale_id: number;
  employee_id: number;
  vehicle_id: number;
  type: CommissionType;
  rate: number;
  amount: number;
  status: "pending" | "paid";
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
};

type SaleRow = {
  id: number;
  customer_id: number;
  vehicle_id: number;
  employee_id: number;
  total_value: number;
  discount: number;
  status: SaleStatus;
  sale_date: string;
  updated_at: string;
  notes: string | null;
  trade_in_value: number;
  customer: CustomerRow | null;
  employee: EmployeeRow | null;
  vehicle: VehicleRow | null;
  payment: PaymentRow[] | null;
  commission: CommissionRow[] | null;
};

export type CreateSaleInput = {
  idempotencyKey: string;
  vehicleId: number;
  customerId: number;
  employeeId: number;
  status: Exclude<SaleStatus, "canceled">;
  saleDate: string;
  salePrice: number;
  discount: number;
  notes?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  downPayment: number;
  installmentsCount: number;
  paymentDate?: string;
};

export type SaleActionInput = {
  idempotencyKey: string;
  saleId: number;
  expectedSaleUpdatedAt: string;
  expectedPaymentUpdatedAt: string;
};

export type UpdateSalePaymentInput = SaleActionInput & {
  salePrice: number;
  discount: number;
  notes?: string;
  paymentMethod: Exclude<PaymentMethod, "trade_in">;
  downPayment: number;
  installmentsCount: number;
  paymentDate?: string;
};

export type SaleListFilters = {
  page: number;
  status?: "pending";
  search?: string;
};

export const saleKeys = {
  all: ["sales"] as const,
  list: (filters: SaleListFilters) => ["sales", "list", filters] as const,
  byVehicle: (vehicleId: number) => ["sales", "vehicle", vehicleId] as const,
  byEmployee: (employeeId: number) => ["sales", "employee", employeeId] as const,
  detail: (id: number) => ["sales", id] as const,
};

function mapCustomer(row: CustomerRow): Customer {
  if (!row.person) {
    throw new Error("Venda sem cliente vinculado.");
  }

  return {
    id: row.id,
    person: {
      id: row.person.id,
      name: row.person.name,
      cpf: row.person.cpf ?? undefined,
      cnpj: row.person.cnpj ?? undefined,
      phone: row.person.phone ?? "",
      email: row.person.email ?? "",
      type: row.person.type,
    },
    notes: row.notes ?? undefined,
    active: row.active,
    total_purchases: Number(row.total_purchases),
    created_at: row.created_at,
  };
}

function mapEmployee(row: EmployeeRow): Employee {
  if (!row.person) {
    throw new Error("Venda sem vendedor vinculado.");
  }

  return {
    id: row.id,
    person: {
      id: row.person.id,
      name: row.person.name,
      cpf: row.person.cpf ?? undefined,
      cnpj: row.person.cnpj ?? undefined,
      phone: row.person.phone ?? "",
      email: row.person.email ?? "",
      type: row.person.type,
    },
    position: row.position,
    salary: Number(row.salary),
    commission_rate: Number(row.commission_rate),
    commission_type: row.commission_type,
    active: row.active,
    hired_at: row.hired_at,
    notes: row.notes ?? undefined,
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

function mapSale(row: SaleRow): Sale {
  if (!row.customer || !row.employee || !row.vehicle) {
    throw new Error("Venda sem cliente, vendedor ou veículo vinculado.");
  }

  const [payment] = row.payment ?? [];
  const [commission] = row.commission ?? [];
  const displayPayment =
    payment && row.status !== "completed"
      ? {
          ...payment,
          payment_status: "pending" as const,
          down_payment: payment.payment_method === "financing" ? payment.down_payment : 0,
          remaining_amount: Number(row.total_value),
        }
      : payment;

  return {
    id: row.id,
    customer: mapCustomer(row.customer),
    employee: mapEmployee(row.employee),
    vehicle: mapVehicle(row.vehicle),
    total_value: Number(row.total_value),
    discount: Number(row.discount),
    status: row.status,
    sale_date: row.sale_date,
    updated_at: row.updated_at,
    notes: row.notes ?? undefined,
    trade_in_value: Number(row.trade_in_value),
    payment: displayPayment
      ? {
          id: displayPayment.id,
          updated_at: displayPayment.updated_at,
          payment_method: displayPayment.payment_method,
          payment_status: displayPayment.payment_status,
          down_payment: Number(displayPayment.down_payment),
          installments_count: Number(displayPayment.installments_count),
          payment_date: displayPayment.payment_date ?? undefined,
          remaining_amount: Number(displayPayment.remaining_amount),
        }
      : undefined,
    commission: commission
      ? {
          id: commission.id,
          sale_id: commission.sale_id,
          employee_id: commission.employee_id,
          vehicle_id: commission.vehicle_id,
          type: commission.type,
          rate: Number(commission.rate),
          amount: Number(commission.amount),
          status: commission.status,
          due_date: commission.due_date ?? undefined,
          paid_at: commission.paid_at ?? undefined,
          notes: commission.notes ?? undefined,
        }
      : undefined,
  };
}

const saleSelect =
  "id, customer_id, vehicle_id, employee_id, total_value, discount, status, sale_date, updated_at, notes, trade_in_value, customer:customers(id, person_id, notes, active, total_purchases, created_at, person:people(id, name, type, cpf, cnpj, phone, email)), employee:employees(id, person_id, position, salary, commission_rate, commission_type, active, hired_at, notes, person:people(id, name, type, cpf, cnpj, phone, email)), vehicle:vehicles!sales_vehicle_id_fkey(*), payment:sale_payments(id, updated_at, payment_method, payment_status, down_payment, installments_count, payment_date, remaining_amount), commission:commissions(id, sale_id, employee_id, vehicle_id, type, rate, amount, status, due_date, paid_at, notes)";

export async function listSales() {
  return querySales();
}

export async function listSalesPage(filters: SaleListFilters): Promise<PaginatedResult<Sale>> {
  return querySalesPage(filters);
}

export async function listSalesByVehicle(vehicleId: number) {
  return querySales({ vehicleId });
}

export async function listSalesByEmployee(employeeId: number) {
  return querySales({ employeeId });
}

async function querySales({
  vehicleId,
  employeeId,
}: { vehicleId?: number; employeeId?: number } = {}) {
  let query = supabase
    .from("sales")
    .select(saleSelect)
    .order("sale_date", { ascending: false })
    .order("id", { ascending: false });

  if (vehicleId != null) {
    query = query.eq("vehicle_id", vehicleId);
  }
  if (employeeId != null) {
    query = query.eq("employee_id", employeeId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as SaleRow[]).map(mapSale);
}

function escapeIlikeSearch(value: string) {
  return value.trim().replace(/[\\%_]/g, "\\$&");
}

async function findSaleSearchIds(search: string) {
  const pattern = `%${escapeIlikeSearch(search)}%`;
  const [peopleResult, vehiclesResult] = await Promise.all([
    supabase.from("people").select("id").ilike("name", pattern),
    supabase.from("vehicles").select("id").ilike("plate", pattern),
  ]);

  if (peopleResult.error) {
    throw new Error(peopleResult.error.message);
  }
  if (vehiclesResult.error) {
    throw new Error(vehiclesResult.error.message);
  }

  const personIds = (peopleResult.data ?? []).map((person) => person.id);
  const vehicleIds = (vehiclesResult.data ?? []).map((vehicle) => vehicle.id);

  const customerResult =
    personIds.length > 0
      ? await supabase.from("customers").select("id").in("person_id", personIds)
      : { data: [], error: null };
  if (customerResult.error) {
    throw new Error(customerResult.error.message);
  }

  return {
    customerIds: (customerResult.data ?? []).map((customer) => customer.id),
    vehicleIds,
  };
}

async function querySalesPage(filters: SaleListFilters): Promise<PaginatedResult<Sale>> {
  const { page, pageSize, from, to } = getPageBounds(filters.page);
  const search = filters.search?.trim();
  const searchIds = search ? await findSaleSearchIds(search) : undefined;
  const searchFilter = searchIds
    ? buildSaleSearchFilter(searchIds.customerIds, searchIds.vehicleIds)
    : undefined;

  if (searchFilter?.kind === "none") {
    return { data: [], total: 0, page, pageSize };
  }

  let query = supabase
    .from("sales")
    .select(saleSelect, { count: "exact" })
    .order("sale_date", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);

  if (filters.status === "pending") {
    query = query.eq("status", "pending");
  }

  if (searchFilter?.kind === "or") {
    query = query.or(searchFilter.expression);
  } else if (searchFilter?.kind === "customer") {
    query = query.in("customer_id", searchFilter.ids);
  } else if (searchFilter?.kind === "vehicle") {
    query = query.in("vehicle_id", searchFilter.ids);
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    data: ((data ?? []) as unknown as SaleRow[]).map(mapSale),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export async function getSaleById(id: number) {
  const { data, error } = await supabase
    .from("sales")
    .select(saleSelect)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Venda não encontrada.");
  }

  return mapSale(data as unknown as SaleRow);
}

export async function createSale(input: CreateSaleInput) {
  const data = z
    .object({
      idempotencyKey: z.string().uuid(),
      vehicleId: z.number().int().positive(),
      customerId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
      status: z.enum(["pending", "completed"]),
      saleDate: z.string().date(),
      salePrice: z.number().positive(),
      discount: z.number().nonnegative(),
      notes: z.string().optional(),
      paymentMethod: z.enum(["cash", "financing", "card", "pix", "trade_in"]),
      paymentStatus: z.enum(["pending", "partial", "paid"]),
      downPayment: z.number().nonnegative(),
      installmentsCount: z.number().int().positive(),
      paymentDate: z.string().date().optional(),
    })
    .parse(input);

  const { data: saleId, error } = await supabase.rpc("create_sale_with_reservation", {
    p_idempotency_key: data.idempotencyKey,
    p_vehicle_id: data.vehicleId,
    p_customer_id: data.customerId,
    p_employee_id: data.employeeId,
    p_status: data.status,
    p_sale_date: data.saleDate,
    p_sale_price: data.salePrice,
    p_discount: data.discount,
    p_notes: data.notes?.trim() || null,
    p_payment_method: data.paymentMethod,
    p_payment_status: data.paymentStatus,
    p_down_payment: data.downPayment,
    p_installments_count: data.installmentsCount,
    p_payment_date: data.paymentDate ?? null,
  });

  if (error) throw new Error(error.message);
  if (saleId === null)
    throw new Error("A venda foi registrada, mas o servidor não retornou seu código.");
  return Number(saleId);
}

const saleActionInputSchema = z.object({
  idempotencyKey: z.string().uuid(),
  saleId: z.number().int().positive(),
  expectedSaleUpdatedAt: z.string().min(1),
  expectedPaymentUpdatedAt: z.string().min(1),
});

const updateSalePaymentInputSchema = saleActionInputSchema.extend({
  salePrice: z.number().positive(),
  discount: z.number().nonnegative(),
  notes: z.string().optional(),
  paymentMethod: z.enum(["cash", "financing", "card", "pix"]),
  downPayment: z.number().nonnegative(),
  installmentsCount: z.number().int().positive(),
  paymentDate: z.string().date().optional(),
});

async function callSaleMutation(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message);
  if (data === null) throw new Error("A operação foi registrada sem retornar a venda.");
  return Number(data);
}

function saleVersionArgs(data: SaleActionInput) {
  return {
    p_idempotency_key: data.idempotencyKey,
    p_sale_id: data.saleId,
    p_expected_sale_updated_at: data.expectedSaleUpdatedAt,
    p_expected_payment_updated_at: data.expectedPaymentUpdatedAt,
  };
}

export async function completeSale(input: SaleActionInput) {
  const data = saleActionInputSchema.parse(input);
  return callSaleMutation("transition_sale", {
    ...saleVersionArgs(data),
    p_action: "complete",
  });
}

export async function cancelSale(input: SaleActionInput) {
  const data = saleActionInputSchema.parse(input);
  return callSaleMutation("transition_sale", {
    ...saleVersionArgs(data),
    p_action: "cancel",
  });
}

export async function updateSalePayment(input: UpdateSalePaymentInput) {
  const data = updateSalePaymentInputSchema.parse(input);
  return callSaleMutation("update_sale_payment_with_version", {
    ...saleVersionArgs(data),
    p_sale_price: data.salePrice,
    p_discount: data.discount,
    p_notes: data.notes?.trim() || null,
    p_payment_method: data.paymentMethod,
    p_down_payment: data.downPayment,
    p_installments_count: data.installmentsCount,
    p_payment_date: data.paymentDate ?? null,
  });
}
