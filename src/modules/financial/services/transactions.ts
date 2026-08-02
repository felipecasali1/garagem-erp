import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabase } from "@/shared/supabase/client";
import type {
  FinancialTransaction,
  TransactionCategory,
  TransactionStatus,
  TransactionType,
} from "@/shared/types/domain";

const manualFinancialTransactionSchema = z.object({
  type: z.enum(["income", "expense"]),
  category: z.enum(["salary", "commission", "fixed_cost", "other"]),
  status: z.enum(["pending", "paid"]),
  amount: z.number().positive(),
  transaction_date: z.string().min(1),
  due_date: z.string().optional(),
  description: z.string().min(1),
  related: z.string().optional(),
  employee_id: z.number().int().positive().optional(),
});

export type ManualFinancialTransactionDraft = z.infer<typeof manualFinancialTransactionSchema>;

type FinancialTransactionRow = {
  id: number;
  type: TransactionType;
  category: TransactionCategory;
  status: TransactionStatus;
  amount: number;
  transaction_date: string;
  due_date: string | null;
  paid_at: string | null;
  description: string;
  related: string | null;
  sale_id: number | null;
  purchase_id: number | null;
  employee_id: number | null;
  commission_id: number | null;
};

export type FinancialTransactionWithLinks = FinancialTransaction & {
  sale_id?: number;
  purchase_id?: number;
  employee_id?: number;
  commission_id?: number;
};

export const financialTransactionKeys = {
  all: ["financial-transactions"] as const,
  detail: (id: number) => ["financial-transactions", id] as const,
};

function mapFinancialTransaction(row: FinancialTransactionRow): FinancialTransactionWithLinks {
  return {
    id: row.id,
    type: row.type,
    category: row.category,
    status: row.status,
    amount: Number(row.amount),
    transaction_date: row.transaction_date,
    due_date: row.due_date ?? undefined,
    paid_at: row.paid_at ?? undefined,
    description: row.description,
    related: row.related ?? undefined,
    sale_id: row.sale_id ?? undefined,
    purchase_id: row.purchase_id ?? undefined,
    employee_id: row.employee_id ?? undefined,
    commission_id: row.commission_id ?? undefined,
  };
}

export async function listFinancialTransactions() {
  const { data, error } = await supabase
    .from("financial_transactions")
    .select(
      "id, type, category, status, amount, transaction_date, due_date, paid_at, description, related, sale_id, purchase_id, employee_id, commission_id",
    )
    .order("transaction_date", { ascending: false })
    .order("id", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as FinancialTransactionRow[]).map(mapFinancialTransaction);
}

export async function getFinancialTransactionById(id: number) {
  const { data, error } = await supabase
    .from("financial_transactions")
    .select(
      "id, type, category, status, amount, transaction_date, due_date, paid_at, description, related, sale_id, purchase_id, employee_id, commission_id",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    throw new Error("Transação não encontrada.");
  }

  return mapFinancialTransaction(data as FinancialTransactionRow);
}

const markFinancialTransactionPaidServer = createServerFn({ method: "POST" })
  .inputValidator(z.object({ id: z.number().int().positive() }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from("financial_transactions")
      .select("id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (transactionError) throw new Error(transactionError.message);
    if (!transaction) throw new Error("Transação não encontrada.");
    if (transaction.status === "paid") {
      throw new Error("Esta transação já está paga.");
    }
    if (transaction.status === "canceled") {
      throw new Error("Transação cancelada não pode ser marcada como paga.");
    }

    const { error: updateError } = await supabaseAdmin
      .from("financial_transactions")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (updateError) throw new Error(updateError.message);

    return data.id;
  });

export async function markFinancialTransactionPaid(id: number) {
  return markFinancialTransactionPaidServer({ data: { id } });
}

const createManualFinancialTransactionServer = createServerFn({ method: "POST" })
  .inputValidator(manualFinancialTransactionSchema)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/shared/supabase/server");

    const { data: transaction, error } = await supabaseAdmin
      .from("financial_transactions")
      .insert({
        type: data.type,
        category: data.category,
        status: data.status,
        amount: data.amount,
        transaction_date: data.transaction_date,
        due_date: data.due_date || null,
        paid_at: data.status === "paid" ? new Date().toISOString() : null,
        description: data.description.trim(),
        related: data.related?.trim() || null,
        employee_id: data.employee_id ?? null,
      })
      .select("id")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return transaction.id as number;
  });

export async function createManualFinancialTransaction(draft: ManualFinancialTransactionDraft) {
  return createManualFinancialTransactionServer({ data: draft });
}
