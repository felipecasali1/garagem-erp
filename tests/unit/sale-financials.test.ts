import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSalePayment,
  summarizeSaleFinancials,
} from "../../src/modules/sales/lib/sale-financials.js";

test("venda pendente não apresenta pagamento quitado nem valor recebido", () => {
  const payment = normalizeSalePayment({
    saleStatus: "pending",
    method: "pix",
    totalValue: 65000,
    downPayment: 0,
    saleDate: "2026-09-24",
    paymentDate: "2026-09-24",
  });

  assert.equal(payment.paymentStatus, "pending");
  assert.equal(payment.downPayment, 0);
  assert.equal(payment.remainingAmount, 65000);
});

test("venda concluída à vista pode consolidar o pagamento", () => {
  const payment = normalizeSalePayment({
    saleStatus: "completed",
    method: "pix",
    totalValue: 65000,
    downPayment: 0,
    saleDate: "2026-09-24",
  });

  assert.equal(payment.paymentStatus, "paid");
  assert.equal(payment.downPayment, 65000);
  assert.equal(payment.remainingAmount, 0);
});

test("venda pendente mostra comissão estimada pela regra atual do vendedor", () => {
  const summary = summarizeSaleFinancials({
    saleStatus: "pending",
    totalValue: 65000,
    vehicleCost: 60000,
    commission: undefined,
    commissionType: "fixed",
    commissionRate: 200,
  });

  assert.equal(summary.commissionAmount, 200);
  assert.equal(summary.commissionGenerated, false);
  assert.equal(summary.commissionLabel, "Comissão estimada");
  assert.equal(summary.profit, 4800);
});
