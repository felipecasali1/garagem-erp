import test from "node:test";
import assert from "node:assert/strict";
import { buildEmployeeSalesHistory } from "../../src/modules/employees/lib/build-employee-sales-history.js";
import type { Employee, Sale, Vehicle } from "../../src/shared/types/domain.js";

const employee: Employee = {
  id: 7,
  person: {
    id: 70,
    name: "Felipe Casali",
    phone: "",
    email: "felipe@example.com",
    type: "individual",
  },
  position: "Vendedor",
  salary: 3000,
  commission_rate: 200,
  commission_type: "fixed",
  active: true,
  hired_at: "2026-01-01",
};

const vehicle: Vehicle = {
  id: 9,
  plate: "ABC1D23",
  brand: "Toyota",
  model: "Corolla",
  color: "Preto",
  fuel_type: "flex",
  transmission: "automatic",
  current_mileage: 100000,
  manufacture_year: 2025,
  model_year: 2026,
  cost_price: 60000,
  sale_price: 65000,
  published: true,
  status: "available",
  accessories: [],
};

function createSale(overrides: Partial<Sale>): Sale {
  return {
    id: 1,
    customer: {
      id: 11,
      person: {
        id: 110,
        name: "Ivan Casali",
        phone: "",
        email: "ivan@example.com",
        type: "individual",
      },
      active: true,
      total_purchases: 0,
      created_at: "2026-01-01",
    },
    employee,
    vehicle,
    total_value: 65000,
    discount: 0,
    status: "completed",
    sale_date: "2026-09-20",
    trade_in_value: 0,
    ...overrides,
  };
}

test("consolida vendas concluídas e pendentes e exclui canceladas", () => {
  const result = buildEmployeeSalesHistory([
    createSale({
      id: 10,
      status: "completed",
      total_value: 65000,
      sale_date: "2026-09-20",
      commission: {
        id: 100,
        sale_id: 10,
        employee_id: 7,
        vehicle_id: 9,
        type: "fixed",
        rate: 200,
        amount: 200,
        status: "paid",
      },
    }),
    createSale({
      id: 11,
      status: "pending",
      total_value: 50000,
      sale_date: "2026-09-24",
      employee: { ...employee, commission_type: "percentage", commission_rate: 2 },
    }),
    createSale({ id: 12, status: "canceled", total_value: 70000 }),
  ]);

  assert.equal(result.completedSalesCount, 1);
  assert.equal(result.completedSalesValue, 65000);
  assert.equal(result.pendingSalesCount, 1);
  assert.equal(result.consolidatedCommission, 200);
  assert.equal(result.estimatedCommission, 1000);
  assert.deepEqual(
    result.sales.map((sale) => sale.saleId),
    [11, 10],
  );
  assert.deepEqual(result.sales[0].commission, { source: "estimated", amount: 1000 });
  assert.deepEqual(result.sales[1].commission, {
    source: "recorded",
    amount: 200,
    status: "paid",
  });
});

test("identifica vendas sem comissão configurada", () => {
  const result = buildEmployeeSalesHistory([
    createSale({
      id: 20,
      status: "completed",
      commission: undefined,
    }),
    createSale({
      id: 21,
      status: "pending",
      employee: { ...employee, commission_rate: 0 },
    }),
  ]);

  assert.deepEqual(
    result.sales.map((sale) => sale.commission),
    [
      { source: "none", amount: 0 },
      { source: "none", amount: 0 },
    ],
  );
  assert.equal(result.consolidatedCommission, 0);
  assert.equal(result.estimatedCommission, 0);
});

test("preserva o status da comissão consolidada", () => {
  const result = buildEmployeeSalesHistory([
    createSale({
      id: 30,
      commission: {
        id: 300,
        sale_id: 30,
        employee_id: 7,
        vehicle_id: 9,
        type: "fixed",
        rate: 300,
        amount: 300,
        status: "pending",
      },
    }),
  ]);

  assert.deepEqual(result.sales[0].commission, {
    source: "recorded",
    amount: 300,
    status: "pending",
  });
});
