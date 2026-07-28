import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/shared/supabase/client";
import type {
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
  image: string | null;
  notes: string | null;
};

type PaymentRow = {
  id: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  down_payment: number;
  installments_count: number;
  payment_date: string | null;
  remaining_amount: number;
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
  notes: string | null;
  trade_in_value: number;
  customer: CustomerRow | null;
  employee: EmployeeRow | null;
  vehicle: VehicleRow | null;
  payment: PaymentRow[] | null;
};

export type CreateSaleInput = {
  vehicleId: number;
  customerId: number;
  employeeId: number;
  status: SaleStatus;
  saleDate: string;
  discount: number;
  notes?: string;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  downPayment: number;
  installmentsCount: number;
  paymentDate?: string;
};

export type SaleActionInput = {
  saleId: number;
};

export const saleKeys = {
  all: ["sales"] as const,
  detail: (id: number) => ["sales", id] as const,
};

function normalizeText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

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
    image: row.image ?? undefined,
    notes: row.notes ?? undefined,
    accessories: [],
  };
}

function mapSale(row: SaleRow): Sale {
  if (!row.customer || !row.employee || !row.vehicle) {
    throw new Error("Venda sem cliente, vendedor ou veículo vinculado.");
  }

  const [payment] = row.payment ?? [];

  return {
    id: row.id,
    customer: mapCustomer(row.customer),
    employee: mapEmployee(row.employee),
    vehicle: mapVehicle(row.vehicle),
    total_value: Number(row.total_value),
    discount: Number(row.discount),
    status: row.status,
    sale_date: row.sale_date,
    notes: row.notes ?? undefined,
    trade_in_value: Number(row.trade_in_value),
    payment: payment
      ? {
          id: payment.id,
          payment_method: payment.payment_method,
          payment_status: payment.payment_status,
          down_payment: Number(payment.down_payment),
          installments_count: Number(payment.installments_count),
          payment_date: payment.payment_date ?? undefined,
          remaining_amount: Number(payment.remaining_amount),
        }
      : undefined,
  };
}

const saleSelect =
  "id, customer_id, vehicle_id, employee_id, total_value, discount, status, sale_date, notes, trade_in_value, customer:customers(id, person_id, notes, active, total_purchases, created_at, person:people(id, name, type, cpf, cnpj, phone, email)), employee:employees(id, person_id, position, salary, commission_rate, commission_type, active, hired_at, notes, person:people(id, name, type, cpf, cnpj, phone, email)), vehicle:vehicles!sales_vehicle_id_fkey(*), payment:sale_payments(id, payment_method, payment_status, down_payment, installments_count, payment_date, remaining_amount)";

export async function listSales() {
  const { data, error } = await supabase
    .from("sales")
    .select(saleSelect)
    .order("sale_date", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as unknown as SaleRow[]).map(mapSale);
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

function addMonths(date: string, months: number) {
  const parsed = new Date(`${date}T00:00:00`);
  parsed.setMonth(parsed.getMonth() + months);
  return parsed.toISOString().slice(0, 10);
}

function calculateCommission({
  totalValue,
  commissionType,
  commissionRate,
}: {
  totalValue: number;
  commissionType: CommissionType;
  commissionRate: number;
}) {
  return commissionType === "percentage" ? (totalValue * commissionRate) / 100 : commissionRate;
}

function normalizeSalePayment({
  method,
  totalValue,
  downPayment,
  paymentDate,
  saleDate,
}: {
  method: PaymentMethod;
  totalValue: number;
  downPayment: number;
  paymentDate?: string;
  saleDate: string;
}) {
  if (method === "trade_in") {
    throw new Error("Troca como forma de pagamento ainda depende do fluxo de veículo recebido.");
  }

  if (method === "financing") {
    if (downPayment > totalValue) {
      throw new Error("A entrada não pode ser maior que o valor final da venda.");
    }

    return {
      paymentStatus:
        downPayment >= totalValue ? ("paid" as const) : downPayment > 0 ? ("partial" as const) : ("pending" as const),
      downPayment,
      installmentsCount: 1,
      paymentDate: paymentDate ?? saleDate,
      remainingAmount: Math.max(0, totalValue - downPayment),
    };
  }

  return {
    paymentStatus: "paid" as const,
    downPayment: totalValue,
    installmentsCount: 1,
    paymentDate: paymentDate ?? saleDate,
    remainingAmount: 0,
  };
}

const createSaleServer = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      vehicleId: z.number().int().positive(),
      customerId: z.number().int().positive(),
      employeeId: z.number().int().positive(),
      status: z.enum(["pending", "completed", "canceled"]),
      saleDate: z.string().min(1),
      discount: z.number().nonnegative(),
      notes: z.string().optional(),
      paymentMethod: z.enum(["cash", "financing", "card", "pix", "trade_in"]),
      paymentStatus: z.enum(["pending", "partial", "paid"]),
      downPayment: z.number().nonnegative(),
      installmentsCount: z.number().int().positive(),
      paymentDate: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("vehicles")
      .select("id, brand, model, plate, sale_price, cost_price, status")
      .eq("id", data.vehicleId)
      .maybeSingle();
    if (vehicleError) throw new Error(vehicleError.message);
    if (!vehicle) throw new Error("Veículo não encontrado.");
    if (vehicle.status !== "available") {
      throw new Error("Apenas veículos disponíveis podem ser vendidos.");
    }

    const { data: customer, error: customerError } = await supabaseAdmin
      .from("customers")
      .select("id, active")
      .eq("id", data.customerId)
      .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (!customer || !customer.active) {
      throw new Error("Cliente não encontrado ou arquivado.");
    }

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("employees")
      .select("id, active, commission_rate, commission_type")
      .eq("id", data.employeeId)
      .maybeSingle();
    if (employeeError) throw new Error(employeeError.message);
    if (!employee || !employee.active) {
      throw new Error("Vendedor não encontrado ou inativo.");
    }

    const totalValue = Math.max(0, Number(vehicle.sale_price) - data.discount);
    const paymentInput = normalizeSalePayment({
      method: data.paymentMethod,
      totalValue,
      downPayment: data.downPayment,
      paymentDate: data.paymentDate,
      saleDate: data.saleDate,
    });

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .insert({
        customer_id: data.customerId,
        vehicle_id: data.vehicleId,
        employee_id: data.employeeId,
        total_value: totalValue,
        discount: data.discount,
        status: data.status,
        sale_date: data.saleDate,
        notes: normalizeText(data.notes),
      })
      .select("id")
      .single();
    if (saleError) throw new Error(saleError.message);

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("sale_payments")
      .insert({
        sale_id: sale.id,
        payment_method: data.paymentMethod,
        payment_status: paymentInput.paymentStatus,
        down_payment: paymentInput.downPayment,
        installments_count: paymentInput.installmentsCount,
        payment_date: paymentInput.paymentDate,
        remaining_amount: paymentInput.remainingAmount,
      })
      .select("id")
      .single();
    if (paymentError) throw new Error(paymentError.message);

    const nextVehicleStatus =
      data.status === "completed" ? "sold" : data.status === "pending" ? "reserved" : "available";
    const { error: vehicleUpdateError } = await supabaseAdmin
      .from("vehicles")
      .update({ status: nextVehicleStatus, published: false })
      .eq("id", data.vehicleId);
    if (vehicleUpdateError) throw new Error(vehicleUpdateError.message);

    if (data.status === "completed") {
      const transactionStatus = paymentInput.paymentStatus === "paid" ? "paid" : "pending";
      const { error: transactionError } = await supabaseAdmin
        .from("financial_transactions")
        .insert({
          type: "income",
          category: "vehicle_sale",
          status: transactionStatus,
          amount: totalValue,
          transaction_date: data.saleDate,
          paid_at: transactionStatus === "paid" ? new Date().toISOString() : null,
          description: `Venda #${sale.id} - ${vehicle.brand} ${vehicle.model}`,
          related: vehicle.plate,
          sale_id: sale.id,
        });
      if (transactionError) throw new Error(transactionError.message);

      const commissionAmount = calculateCommission({
        totalValue,
        commissionType: employee.commission_type,
        commissionRate: Number(employee.commission_rate),
      });
      if (commissionAmount > 0) {
        const { error: commissionError } = await supabaseAdmin.from("commissions").insert({
          sale_id: sale.id,
          employee_id: data.employeeId,
          vehicle_id: data.vehicleId,
          type: employee.commission_type,
          rate: Number(employee.commission_rate),
          amount: commissionAmount,
          status: "pending",
          due_date: data.saleDate,
        });
        if (commissionError) throw new Error(commissionError.message);
      }
    }

    return sale.id as number;
  });

export async function createSale(input: CreateSaleInput) {
  return createSaleServer({ data: input });
}

async function applyCompletedSale({
  supabaseAdmin,
  sale,
  vehicle,
  employee,
  paymentStatus,
}: {
  supabaseAdmin: Awaited<typeof import("@/shared/supabase/server")>["supabaseAdmin"];
  sale: {
    id: number;
    vehicle_id: number;
    employee_id: number;
    total_value: number;
    sale_date: string;
  };
  vehicle: { id: number; brand: string; model: string; plate: string | null };
  employee: { commission_rate: number; commission_type: CommissionType };
  paymentStatus: PaymentStatus;
}) {
  const { error: vehicleUpdateError } = await supabaseAdmin
    .from("vehicles")
    .update({ status: "sold", published: false })
    .eq("id", sale.vehicle_id);
  if (vehicleUpdateError) throw new Error(vehicleUpdateError.message);

  const { data: existingTransaction, error: existingTransactionError } = await supabaseAdmin
    .from("financial_transactions")
    .select("id")
    .eq("sale_id", sale.id)
    .maybeSingle();
  if (existingTransactionError) throw new Error(existingTransactionError.message);

  if (!existingTransaction) {
    const transactionStatus = paymentStatus === "paid" ? "paid" : "pending";
    const { error: transactionError } = await supabaseAdmin
      .from("financial_transactions")
      .insert({
        type: "income",
        category: "vehicle_sale",
        status: transactionStatus,
        amount: sale.total_value,
        transaction_date: sale.sale_date,
        paid_at: transactionStatus === "paid" ? new Date().toISOString() : null,
        description: `Venda #${sale.id} - ${vehicle.brand} ${vehicle.model}`,
        related: vehicle.plate,
        sale_id: sale.id,
      });
    if (transactionError) throw new Error(transactionError.message);
  }

  const commissionAmount = calculateCommission({
    totalValue: sale.total_value,
    commissionType: employee.commission_type,
    commissionRate: Number(employee.commission_rate),
  });

  if (commissionAmount > 0) {
    const { data: existingCommission, error: existingCommissionError } = await supabaseAdmin
      .from("commissions")
      .select("id")
      .eq("sale_id", sale.id)
      .eq("employee_id", sale.employee_id)
      .maybeSingle();
    if (existingCommissionError) throw new Error(existingCommissionError.message);

    if (!existingCommission) {
      const { error: commissionError } = await supabaseAdmin.from("commissions").insert({
        sale_id: sale.id,
        employee_id: sale.employee_id,
        vehicle_id: sale.vehicle_id,
        type: employee.commission_type,
        rate: Number(employee.commission_rate),
        amount: commissionAmount,
        status: "pending",
        due_date: sale.sale_date,
      });
      if (commissionError) throw new Error(commissionError.message);
    }
  }

  const { error: saleUpdateError } = await supabaseAdmin
    .from("sales")
    .update({ status: "completed" })
    .eq("id", sale.id);
  if (saleUpdateError) throw new Error(saleUpdateError.message);
}

const completeSaleServer = createServerFn({ method: "POST" })
  .inputValidator(z.object({ saleId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("id, vehicle_id, employee_id, total_value, sale_date, status")
      .eq("id", data.saleId)
      .maybeSingle();
    if (saleError) throw new Error(saleError.message);
    if (!sale) throw new Error("Venda não encontrada.");
    if (sale.status !== "pending") {
      throw new Error("Apenas vendas pendentes podem ser concluídas.");
    }

    const { data: vehicle, error: vehicleError } = await supabaseAdmin
      .from("vehicles")
      .select("id, brand, model, plate")
      .eq("id", sale.vehicle_id)
      .maybeSingle();
    if (vehicleError) throw new Error(vehicleError.message);
    if (!vehicle) throw new Error("Veículo da venda não encontrado.");

    const { data: employee, error: employeeError } = await supabaseAdmin
      .from("employees")
      .select("commission_rate, commission_type")
      .eq("id", sale.employee_id)
      .maybeSingle();
    if (employeeError) throw new Error(employeeError.message);
    if (!employee) throw new Error("Vendedor da venda não encontrado.");

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("sale_payments")
      .select("payment_status")
      .eq("sale_id", sale.id)
      .limit(1)
      .maybeSingle();
    if (paymentError) throw new Error(paymentError.message);

    await applyCompletedSale({
      supabaseAdmin,
      sale: {
        id: sale.id as number,
        vehicle_id: sale.vehicle_id as number,
        employee_id: sale.employee_id as number,
        total_value: Number(sale.total_value),
        sale_date: String(sale.sale_date),
      },
      vehicle,
      employee: {
        commission_rate: Number(employee.commission_rate),
        commission_type: employee.commission_type as CommissionType,
      },
      paymentStatus: (payment?.payment_status as PaymentStatus | undefined) ?? "pending",
    });

    return sale.id as number;
  });

const cancelSaleServer = createServerFn({ method: "POST" })
  .inputValidator(z.object({ saleId: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const { data: sale, error: saleError } = await supabaseAdmin
      .from("sales")
      .select("id, vehicle_id, status")
      .eq("id", data.saleId)
      .maybeSingle();
    if (saleError) throw new Error(saleError.message);
    if (!sale) throw new Error("Venda não encontrada.");
    if (sale.status !== "pending") {
      throw new Error("Apenas vendas pendentes podem ser canceladas.");
    }

    const { error: saleUpdateError } = await supabaseAdmin
      .from("sales")
      .update({ status: "canceled" })
      .eq("id", sale.id);
    if (saleUpdateError) throw new Error(saleUpdateError.message);

    const { error: vehicleUpdateError } = await supabaseAdmin
      .from("vehicles")
      .update({ status: "available", published: false })
      .eq("id", sale.vehicle_id);
    if (vehicleUpdateError) throw new Error(vehicleUpdateError.message);

    return sale.id as number;
  });

export async function completeSale(input: SaleActionInput) {
  return completeSaleServer({ data: input });
}

export async function cancelSale(input: SaleActionInput) {
  return cancelSaleServer({ data: input });
}
