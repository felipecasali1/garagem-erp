import test from "node:test";
import assert from "node:assert/strict";
import { buildSaleSearchFilter } from "../../src/modules/sales/lib/build-sale-search-filter.js";

test("não cria filtro quando a busca não encontra clientes nem veículos", () => {
  assert.deepEqual(buildSaleSearchFilter([], []), { kind: "none" });
});

test("filtra vendas por clientes ou veículos encontrados", () => {
  assert.deepEqual(buildSaleSearchFilter([10, 11], []), {
    kind: "customer",
    ids: [10, 11],
  });
  assert.deepEqual(buildSaleSearchFilter([], [20]), {
    kind: "vehicle",
    ids: [20],
  });
  assert.deepEqual(buildSaleSearchFilter([10], [20, 21]), {
    kind: "or",
    expression: "customer_id.in.(10),vehicle_id.in.(20,21)",
  });
});
