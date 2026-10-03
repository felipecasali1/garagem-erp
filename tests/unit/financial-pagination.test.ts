import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFinancialOverdueFilter,
  buildFinancialSearchFilter,
  financialListOrdering,
} from "../../src/modules/financial/lib/build-financial-query.js";
import { summarizeFinancialTransactions } from "../../src/modules/financial/lib/summarize-financial-transactions.js";

test("constrói a busca financeira server-side por descrição ou relacionado", () => {
  assert.equal(
    buildFinancialSearchFilter(" venda_\\teste "),
    "description.ilike.%venda\\_\\\\teste%,related.ilike.%venda\\_\\\\teste%",
  );
});

test("constrói o filtro de alertas financeiros vencidos", () => {
  assert.equal(
    buildFinancialOverdueFilter("2026-10-02"),
    "status.eq.overdue,and(status.eq.pending,due_date.lt.2026-10-02)",
  );
});

test("mantém a ordenação financeira estável", () => {
  assert.deepEqual(financialListOrdering.transactionDate, [
    { column: "transaction_date", ascending: false },
    { column: "id", ascending: false },
  ]);
  assert.deepEqual(financialListOrdering.dueDate, [
    { column: "due_date", ascending: true, nullsFirst: false },
    { column: "transaction_date", ascending: false },
    { column: "id", ascending: false },
  ]);
});

test("resume valores e contagens por status sem depender da página atual", () => {
  assert.deepEqual(
    summarizeFinancialTransactions([
      { status: "pending", amount: 100 },
      { status: "overdue", amount: 250 },
      { status: "paid", amount: 400 },
      { status: "canceled", amount: 900 },
    ]),
    {
      total: 4,
      pendingCount: 1,
      pendingAmount: 100,
      overdueCount: 1,
      overdueAmount: 250,
      paidCount: 1,
      paidAmount: 400,
    },
  );
});
